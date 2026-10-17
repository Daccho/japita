"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { loginUrl } from "@/lib/api";
import { me, supplierPortal, type Me } from "@/lib/auth";

// Restaurant workspace only. A convenience for routing: the API refuses the workspace's data without a
// restaurant session regardless of what this component renders.
const Ctx = createContext<{ user: Me; setUser: (u: Me) => void } | null>(null);

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAccount outside AuthGate");
  return v;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    me()
      .then(async (u) => {
        if (!u) window.location.replace(loginUrl());
        else if (u.role === "supplier") window.location.replace((await supplierPortal()).path);
        else setUser(u);
      })
      .catch(() => setFailed(true));
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
