"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api,
  type AgentAnswer,
  type Approval,
  type BasketResult,
  type Spending,
  type State,
  type Timeline,
  type WeeklyCheck,
} from "@/lib/api";

const PROFILE_KEY = "japita.profile";
const CACHE_KEY = "japita.cache.";
export const PROFILES = ["kumo-authentic", "kumo-value"] as const;

type Data = {
  state: State;
  baskets: BasketResult;
  timeline: Timeline;
  approval: Approval | null;
  spending: Spending;
};

function cached(pid: string): Data | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + pid);
    return raw ? (JSON.parse(raw) as Data) : null;
  } catch {
    return null;
  }
}

// `error` is the thrown ApiError (shown with errorText); null when there is none.
type Job<T> = { running: boolean; startedAt: number | null; result: T | null; error: unknown; question?: string };

type Ctx = {
  profileId: string;
  setProfileId: (id: string) => void;
  data: Data | null;
  refresh: () => Promise<void>;
  advisorOpen: boolean;
  setAdvisorOpen: (open: boolean) => void;
  advisor: Job<AgentAnswer>;
  ask: (question: string) => void;
  weekly: Job<WeeklyCheck>;
  runWeekly: () => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function useWorkspace() {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("useWorkspace outside WorkspaceProvider");
  return c;
}

const idle = { running: false, startedAt: null, result: null, error: null };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [profileId, setProfileState] = useState<string>("kumo-authentic");
  const [data, setData] = useState<Data | null>(null);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisor, setAdvisor] = useState<Job<AgentAnswer>>(idle);
  const [weekly, setWeekly] = useState<Job<WeeklyCheck>>(idle);
  const profileRef = useRef(profileId);
  profileRef.current = profileId;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved && (PROFILES as readonly string[]).includes(saved)) setProfileState(saved);
    } catch {}
  }, []);

  // Show the last data this signed-in browser saw for this profile at once; without it, the current data stays
  // on screen until the new data arrives. Nothing restaurant-specific is bundled into the public JavaScript,
  // and the cache is cleared on sign-out and on 401.
  useEffect(() => {
    const saved = cached(profileId);
    if (saved) setData(saved);
  }, [profileId]);

  // The active purchasing priority (profile) is chosen in Restaurant profile → Buying preferences and kept in
  // this browser. This setter is the one place to persist it elsewhere.
  const setProfileId = (id: string) => {
    setProfileState(id);
    try {
      localStorage.setItem(PROFILE_KEY, id);
    } catch {}
  };

  const load = useCallback(async () => {
    const pid = profileRef.current;
    const [state, baskets, timeline, approval, spending] = await Promise.all([
      api.state(),
      api.baskets(pid),
      api.timeline(pid),
      api.approval(pid),
      api.spending(pid),
    ]);
    if (pid !== profileRef.current) return;
    const next = { state, baskets, timeline, approval, spending };
    setData(next);
    try {
      localStorage.setItem(CACHE_KEY + pid, JSON.stringify(next));
    } catch {}
  }, []);

  // First load: retry until the (possibly sleeping) server answers. Never show an error for this.
  // (request() already retries quietly for about a minute; this keeps trying after that.)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async (n: number) => {
      try {
        await load();
      } catch {
        if (cancelled) return;
        timer = setTimeout(() => attempt(n + 1), 4000);
      }
    };
    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, profileId]);

  // Keep in sync with the supplier portal (replies, confirmations, proposals) while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load().catch(() => {});
    }, 12000);
    return () => clearInterval(id);
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const ask = (question: string) => {
    if (advisor.running || !question.trim()) return;
    setAdvisorOpen(true);
    setAdvisor({ running: true, startedAt: Date.now(), result: null, error: null, question });
    api
      .ask(question, profileRef.current)
      .then((result) => {
        setAdvisor({ running: false, startedAt: null, result, error: null, question });
        load().catch(() => {});
      })
      .catch((e) => setAdvisor({ running: false, startedAt: null, result: null, error: e ?? new Error("failed"), question }));
  };

  const runWeekly = () => {
    if (weekly.running) return;
    setWeekly({ running: true, startedAt: Date.now(), result: null, error: null });
    api
      .weeklyCheck(profileRef.current)
      .then((result) => setWeekly({ running: false, startedAt: null, result, error: null }))
      .catch((e) => setWeekly({ running: false, startedAt: null, result: null, error: e ?? new Error("failed") }));
  };

  return (
    <WorkspaceCtx.Provider
      value={{
        profileId,
        setProfileId,
        data,
        refresh,
        advisorOpen,
        setAdvisorOpen,
        advisor,
        ask,
        weekly,
        runWeekly,
      }}
    >
      {children}
    </WorkspaceCtx.Provider>
  );
}

// Seconds since a job started, ticking once per second while it runs.
export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}

// A value remembered in this browser only (preview state for profile text, menu edits and links).
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue({ ...initial, ...JSON.parse(raw) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const save = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  };
  return [value, save] as const;
}
