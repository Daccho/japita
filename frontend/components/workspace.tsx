"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AgentAnswer, type WeeklyCheck } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useBump } from "@/components/live";

// Restaurant-only background work that outlives a page: the purchasing advisor's answer and the weekly check.
// Both run as jobs on the API; when one finishes every view re-fetches.

// `error` is the thrown ApiError (shown with errorText); null when there is none.
type Job<T> = { running: boolean; startedAt: number | null; result: T | null; error: unknown; question?: string };

type Ctx = {
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
  const { lang } = useI18n();
  const bump = useBump();
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisor, setAdvisor] = useState<Job<AgentAnswer>>(idle);
  const [weekly, setWeekly] = useState<Job<WeeklyCheck>>(idle);

  const ask = (question: string) => {
    if (advisor.running || !question.trim()) return;
    setAdvisorOpen(true);
    setAdvisor({ running: true, startedAt: Date.now(), result: null, error: null, question });
    api
      .ask(question, lang)
      .then((result) => {
        setAdvisor({ running: false, startedAt: null, result, error: null, question });
        bump();
      })
      .catch((e) => setAdvisor({ running: false, startedAt: null, result: null, error: e ?? new Error("failed"), question }));
  };

  const runWeekly = () => {
    if (weekly.running) return;
    setWeekly({ running: true, startedAt: Date.now(), result: null, error: null });
    api
      .weeklyCheck()
      .then((result) => setWeekly({ running: false, startedAt: null, result, error: null }))
      .catch((e) => setWeekly({ running: false, startedAt: null, result: null, error: e ?? new Error("failed") }));
  };

  return (
    <WorkspaceCtx.Provider value={{ advisorOpen, setAdvisorOpen, advisor, ask, weekly, runWeekly }}>{children}</WorkspaceCtx.Provider>
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
