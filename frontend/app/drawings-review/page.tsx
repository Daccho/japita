"use client";

import { useEffect, useState } from "react";
import ProductDrawing, { type DrawingLibrary } from "@/components/ProductDrawing";
import { API_BASE } from "@/lib/api";

export default function DrawingsReview() {
  const [library, setLibrary] = useState<DrawingLibrary | null>(null);
  const [error, setError] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const load = async () => {
    const response = await fetch(`${API_BASE}/drawings`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Library request failed (${response.status})`);
    setLibrary(await response.json());
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/drawings`, { signal: controller.signal }).then((r) => {
      if (!r.ok) throw new Error(`Library request failed (${r.status})`);
      return r.json();
    }).then(setLibrary).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); }, 4000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const act = async (key: string, action: "regenerate" | "delete") => {
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_BASE}/drawings/${encodeURIComponent(key)}${action === "regenerate" ? "/regenerate" : ""}`, {
        method: action === "regenerate" ? "POST" : "DELETE", headers: { "X-Admin-Key": adminKey },
      });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || `Request failed (${response.status})`); }
      await load(); setNotice(action === "regenerate" ? "Regeneration queued." : "Drawing removed. Products use the packaging fallback until regenerated.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const groups = [...new Set(library?.drawings.map((d) => d.group) ?? [])];
  return <main className="jp jp-drawings-review">
    <header><img src="/japita-logo-jp.webp" alt="Japita" width="160" height="48" style={{ objectFit: "contain" }} /><p>Japita · illustration review</p><h1>Product drawing library</h1><p>{library ? `${library.drawings.length} drawings` : "Loading library…"} · 48px and 128px</p>
      <label className="jp-drawing-admin">Review key <input type="password" autoComplete="off" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="Enter admin key to manage drawings" /></label>
      {!library?.admin_enabled && <p>Management actions are disabled until ADMIN_KEY is configured on the API.</p>}
      <p>Approved library drawings are active. New foods reuse matching artwork or generate in the background.</p>
    </header>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {groups.map((group) => <section key={group}><h2>{group}</h2><div className="jp-drawing-review-grid">
      {library?.drawings.filter((d) => d.group === group).map((drawing) => <article key={drawing.key}>
        <h3>{drawing.name}{drawing.revised && <span className="jp-drawing-revised">Revised</span>}</h3><div className="jp-drawing-sizes"><figure><ProductDrawing drawing={drawing} /><figcaption>48px</figcaption></figure><figure><ProductDrawing drawing={drawing} size={128} /><figcaption>128px</figcaption></figure></div>
        <p>{drawing.source === "generated" ? "Auto-generated" : drawing.source === "fallback" ? "Needs drawing" : drawing.reference ? "Supplied reference" : "Library"} · {drawing.generation_status ?? "ready"}</p>
        <p>{drawing.aliases.join(" · ")}{drawing.model && ` · ${drawing.model}`}{drawing.created_at && ` · ${drawing.created_at.length === 10 ? new Date(`${drawing.created_at}T00:00:00`).toLocaleDateString() : new Date(drawing.created_at).toLocaleString()}`}</p>
        {drawing.ingredient !== "generic" && <div className="jp-drawing-review-actions"><button type="button" disabled={!library?.admin_enabled || !adminKey || busy !== null} onClick={() => void act(drawing.key, "regenerate")}>{busy === drawing.key ? "Working…" : "Regenerate"}</button><button type="button" disabled={!library?.admin_enabled || !adminKey || busy !== null || drawing.generation_status === "deleted"} onClick={() => void act(drawing.key, "delete")}>Delete</button></div>}
      </article>)}
    </div></section>)}
  </main>;
}
