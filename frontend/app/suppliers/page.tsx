"use client";

import { useEffect, useState } from "react";
import { PortalApp } from "@/components/portal/PortalApp";
import { AuthError, logout, me, supplierPortal } from "@/lib/auth";

// Signed-in supplier: their own portal. Shared link-token pages stay at /supplier/portal/[token] without sign-in.
export default function SupplierHome() {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) =>
      supplierPortal()
        .then((p) => !cancelled && setToken(p.path.split("/").pop() ?? null))
        .catch((e) => {
          if (cancelled) return;
          if (e instanceof AuthError && e.status === 403) {
            window.location.replace("/restaurants"); // signed in as a restaurant
          } else if (e instanceof AuthError && e.status === 401) {
            window.location.replace("/login?role=supplier&next=/suppliers");
          } else if (attempt < 20) {
            setTimeout(() => load(attempt + 1), 3000); // the API may be waking up
          }
        });
    load(0);
    me()
      .then((u) => !cancelled && u && setName(u.display_name))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = () => logout().finally(() => window.location.replace("/"));
  return token ? <PortalApp token={token} homeHref="/suppliers" account={{ name, onSignOut: signOut }} /> : null;
}
