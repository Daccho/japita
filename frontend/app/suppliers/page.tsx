"use client";

import { useEffect, useState } from "react";
import { PortalApp } from "@/components/portal/PortalApp";
import { AuthError, logout, me, supplierPortal, type SupplierPortals } from "@/lib/auth";

const tokenOf = (path: string) => path.split("/").pop() ?? "";

// Signed-in supplier: their own portal, one per restaurant that lists them. Shared link-token pages stay at
// /supplier/portal/[token] without sign-in.
export default function SupplierHome() {
  const [portals, setPortals] = useState<SupplierPortals["portals"]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) =>
      supplierPortal()
        .then((p) => {
          if (cancelled) return;
          setPortals(p.portals ?? []);
          setToken(tokenOf(p.path));
        })
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
  if (!token) return null;
  return (
    <>
      {portals.length > 1 && (
        <div className="jp">
          <label className="jp-portal-switch">
            取引先の飲食店 / Restaurant
            <select value={token} onChange={(e) => setToken(e.target.value)}>
              {portals.map((p) => (
                <option key={p.path} value={tokenOf(p.path)}>{p.restaurant}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <PortalApp key={token} token={token} homeHref="/suppliers" account={{ name, onSignOut: signOut }} />
    </>
  );
}
