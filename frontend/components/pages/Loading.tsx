"use client";

import { Loader2 } from "lucide-react";

// Shown in the page body only while the browser fetches a view the server could not provide in time.
export default function Loading({ title }: { title: string }) {
  return (
    <>
      <div className="jp-header">
        <div>
          <h1 style={{ marginTop: 8 }}>{title}</h1>
        </div>
      </div>
      <p className="jp-muted" role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Loader2 className="jp-spinner" aria-hidden style={{ width: 16, height: 16 }} />
      </p>
    </>
  );
}
