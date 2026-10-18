"use client";

import { useState } from "react";
import { Info } from "lucide-react";

// Short help (ⓘ) next to a term; the server provides the text (e.g. what kansui or hydration means).
export function InfoTip({ hint, label }: { hint?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!hint) return null;
  return (
    <span className="jp-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label ?? hint} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
        <Info aria-hidden />
      </button>
      {open && <span role="tooltip">{hint}</span>}
    </span>
  );
}
