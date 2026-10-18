"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { forgetSession, loginUrl, rememberedSession, rememberSession } from "@/lib/api";
import { me, type Me } from "@/lib/auth";

// Restaurant workspace only. A convenience for routing: the API refuses the workspace's data without a
// restaurant session regardless of what this component renders.
const Ctx = createContext<{ user: Me; setUser: (u: Me) => void } | null>(null);

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAccount outside AuthGate");
  return v;
}

const HINT_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // the server session lifetime
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000]; // about a minute while the API wakes up

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // middleware.ts already sent visitors without a session cookie to /login. If this browser confirmed a
    // restaurant session before, paint the cached workspace now; the check below still runs and redirects on 401.
    const hinted = rememberedSession<Me>(HINT_MAX_AGE_MS);
    if (hinted?.role === "restaurant") setUser(hinted);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async (attempt: number) => {
      try {
        const u = await me();
        if (cancelled) return;
        if (!u) {
          forgetSession();
          window.location.replace(loginUrl());
        } else if (u.role === "supplier") {
          forgetSession();
          window.location.replace("/suppliers");
        } else {
          rememberSession(u);
          setUser(u);
        }
      } catch {
        // Unreachable or waking up: retry quietly, then offer a manual retry.
        if (cancelled) return;
        if (attempt < RETRY_DELAYS_MS.length) timer = setTimeout(() => check(attempt + 1), RETRY_DELAYS_MS[attempt]);
        else setFailed(true);
      }
    };
    check(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!user)
    return (
      <div className="jp">
        <div className="jp-loading" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
          {failed ? (
            <button type="button" className="jp-action" onClick={() => window.location.reload()}>Retry</button>
          ) : (
            <Loader2 className="jp-spinner" aria-label="Loading" />
          )}
        </div>
      </div>
    );
  return <Ctx.Provider value={{ user, setUser }}>{children}</Ctx.Provider>;
}
