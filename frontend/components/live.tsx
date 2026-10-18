"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { getJson } from "@/lib/api";

// Live view data shared by the restaurant workspace and the supplier portal. Pages arrive server-rendered with
// their view; these hooks keep it current: every view re-fetches after an action (bump) and every 12 seconds while
// the tab is visible (supplier and restaurant activity on the other side).

const POLL_MS = 12000;

const LiveCtx = createContext<{ tick: number; bump: () => void }>({ tick: 0, bump: () => {} });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <LiveCtx.Provider value={{ tick, bump }}>
      <ToastProvider>{children}</ToastProvider>
    </LiveCtx.Provider>
  );
}

/** Re-fetch every live view (after an action). */
export const useBump = () => useContext(LiveCtx).bump;

/**
 * A view endpoint's data: the server-rendered `initial` first, then kept fresh. When the server could not
 * provide it (timeout), the browser fetches it at once.
 */
export function useView<T>(path: string | null, initial: T | null) {
  const { tick } = useContext(LiveCtx);
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState<unknown>(null);
  const fresh = useRef<{ path: string | null; tick: number } | null>(initial ? { path, tick } : null);
  const seq = useRef(0);

  // New server render (navigation, language change): take its data.
  useEffect(() => {
    if (initial) {
      setData(initial);
      fresh.current = { path, tick };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    try {
      const v = await getJson<T>(path);
      if (n === seq.current) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e);
    }
  }, [path]);

  useEffect(() => {
    const f = fresh.current;
    if (f && f.path === path && f.tick === tick) return; // already current
    fresh.current = { path, tick };
    load();
  }, [path, tick, load]);

  return { data, setData, error, reload: load };
}

// --- toasts -----------------------------------------------------------------------------------------

type Toast = { text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

/** Show a short message at the bottom of the screen (both sides). */
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    setToast({ text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      {toast && (
        <div className="jp">
          <div className="jp-floating-toast" role={toast.tone === "error" ? "alert" : "status"}>
          <p className={`jp-toast ${toast.tone === "error" ? "jp-toast-error" : ""}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {toast.tone === "error" ? (
              <TriangleAlert aria-hidden style={{ width: 16, height: 16, flexShrink: 0 }} />
            ) : (
              <CheckCircle2 aria-hidden style={{ width: 16, height: 16, flexShrink: 0 }} />
            )}
            {toast.text}
          </p>
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// --- shared small pieces ----------------------------------------------------------------------------

export function EmptyState({ title, body, icon }: { title: string; body?: string | null; icon?: ReactNode }) {
  return (
    <div className="jp-empty-state">
      {icon && <span className="jp-thumb-icon">{icon}</span>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
    </div>
  );
}

export type BadgeTone = "ok" | "warning" | "neutral";
export function Badge({ tone = "ok", children, style }: { tone?: BadgeTone | string | null; children: ReactNode; style?: React.CSSProperties }) {
  const cls = tone === "warning" ? "jp-warning" : tone === "neutral" ? "jp-neutral" : "";
  return (
    <span className={`jp-badge ${cls}`} style={style}>
      {children}
    </span>
  );
}
