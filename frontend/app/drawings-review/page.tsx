"use client";

import { useEffect, useState } from "react";
import ProductDrawing, { type DrawingLibrary } from "@/components/ProductDrawing";
import { API_BASE } from "@/lib/api";

export default function DrawingsReview() {
  const [library, setLibrary] = useState<DrawingLibrary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/drawings`, { signal: controller.signal }).then((r) => {
      if (!r.ok) throw new Error(`Library request failed (${r.status})`);
      return r.json();
    }).then(setLibrary).catch((e) => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  const groups = [...new Set(library?.drawings.map((d) => d.group) ?? [])];
  return <main className="jp jp-drawings-review">
    <header><img src="/japita-logo-ajitama-flat.svg" alt="Japita" width="128" height="80" /><p>Japita · illustration review</p><h1>Product drawing library</h1><p>{library ? `${library.drawings.length} drawings · ${library.drawings.filter((d) => d.revised).length} revised` : "Loading library…"} · 48px and 128px · product photos stay unchanged until approval</p></header>
    {error && <p role="alert">{error}</p>}
    {groups.map((group) => <section key={group}><h2>{group}</h2><div className="jp-drawing-review-grid">
      {library?.drawings.filter((d) => d.group === group).map((drawing) => <article key={drawing.key}>
        <h3>{drawing.name}{drawing.revised && <span className="jp-drawing-revised">Revised</span>}</h3><div className="jp-drawing-sizes"><figure><ProductDrawing drawing={drawing} /><figcaption>48px</figcaption></figure><figure><ProductDrawing drawing={drawing} size={128} /><figcaption>128px</figcaption></figure></div>
        <p>{drawing.reference ? "Supplied reference" : "Library"} · {drawing.aliases.join(" · ")}</p>
      </article>)}
    </div></section>)}
  </main>;
}
