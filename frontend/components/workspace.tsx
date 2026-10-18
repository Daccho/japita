"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type WeeklyCheck } from "@/lib/api";
import { purchasingApi, type PurchasingAnswer, type PurchasingData, type AdvisorContext } from "@/lib/purchasing";
import { useI18n } from "@/lib/i18n";
import { useBump, useView } from "@/components/live";

// Restaurant-only background work that outlives a page: the purchasing advisor's answer and the weekly check.
// Both run as jobs on the API; when one finishes every view re-fetches.

// `error` is the thrown ApiError (shown with errorText); null when there is none.
type Job<T> = { running: boolean; startedAt: number | null; result: T | null; error: unknown; question?: string };

type Ctx = {
  advisorOpen: boolean;
  setAdvisorOpen: (open: boolean) => void;
  advisor: Job<PurchasingAnswer>;
  ask: (question: string, context?: AdvisorContext) => void;
  data: PurchasingData | null;
  profileId: string;
  refresh: () => Promise<void>;
  conversation: {question:string;result:PurchasingAnswer}[];
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
  const [advisor, setAdvisor] = useState<Job<PurchasingAnswer>>(idle);
  const [weekly, setWeekly] = useState<Job<WeeklyCheck>>(idle);
  const { data, reload } = useView<PurchasingData>(`/views/purchasing?lang=${lang}`, null);
  const profileId = data?.profile_id ?? "";
  const profileRef = useRef(profileId);
  profileRef.current = profileId;
  const conversationId = useRef<string | null>(null);
  const [conversation,setConversation] = useState<{question:string;result:PurchasingAnswer}[]>([]);
  useEffect(() => { setAdvisor(idle); setConversation([]); conversationId.current=null; }, [profileId]);
  const refresh = async () => { await reload(); bump(); };

  const ask = (question: string, context: AdvisorContext = {}) => {
    if (advisor.running || !question.trim() || !profileId) return;
    setAdvisorOpen(true);
    if (!conversationId.current) {
      try { conversationId.current=sessionStorage.getItem(`japita.advisor.conversation.${profileId}`); } catch {}
      conversationId.current ??= crypto.randomUUID();
      try { sessionStorage.setItem(`japita.advisor.conversation.${profileId}`,conversationId.current); } catch {}
    }
    const pid=profileId, cid=conversationId.current;
    setAdvisor({ running: true, startedAt: Date.now(), result: null, error: null, question });
    purchasingApi
      .ask(question, pid, cid, lang, context)
      .then((result) => {
        if (pid!==profileRef.current || cid!==conversationId.current) return;
        setAdvisor({ running: false, startedAt: null, result, error: null, question });
        setConversation(previous=>[...previous,{question,result}].slice(-6));
        bump();
      })
      .catch((e) => { if(pid===profileRef.current && cid===conversationId.current) setAdvisor({ running: false, startedAt: null, result: null, error: e ?? new Error("failed"), question }); });
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
    <WorkspaceCtx.Provider value={{ data, profileId, refresh, conversation, advisorOpen, setAdvisorOpen, advisor, ask, weekly, runWeekly }}>{children}</WorkspaceCtx.Provider>
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
