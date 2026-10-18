"use client";

import type { ReactNode } from "react";

// Page title block shared by both sides: kicker, title, subtitle, and the page's actions at the upper right.
export default function PageHeader({ kicker, title, sub, actions }: { kicker?: ReactNode; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="jp-header">
      <div>
        {kicker && <span className="jp-kicker">{kicker}</span>}
        <h1 style={{ marginTop: 8 }}>{title}</h1>
        {sub && <p className="jp-muted">{sub}</p>}
      </div>
      {actions && <div className="jp-toolbar">{actions}</div>}
    </div>
  );
}
