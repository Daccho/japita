"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, CircleHelp, ExternalLink, Info, Sparkles, TriangleAlert } from "lucide-react";
import type { ImportChecks as ImportChecksView } from "@/lib/api";
import { useWorkspace } from "@/components/workspace";
import { Badge } from "@/components/live";

const TONE_ICON = { ok: Check, warning: TriangleAlert, neutral: Info } as const;

// An offer's import and labelling checks: a chip with the worst outcome that expands to each check, its source and,
// for a detail the supplier can answer, the advisor question that drafts a supplier clarification.
export default function ImportChecks({ ic }: { ic?: ImportChecksView | null }) {
  const { ask, advisor } = useWorkspace();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!ic || !ic.show || !ic.chip_text) return null;
  const Icon = TONE_ICON[ic.tone ?? "neutral"];
  return (
    <div className="jp-import-checks">
      <button
        type="button"
        className="jp-import-chip"
        data-tone={ic.tone ?? "neutral"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon aria-hidden />
        <span>{ic.chip_text}</span>
        <ChevronDown aria-hidden className="jp-import-chevron" />
      </button>
      {open && (
        <div id={id} className="jp-import-detail">
          <ul>
            {ic.checks.map((c) => (
              <li key={c.rule_id}>
                <div className="jp-import-head">
                  <Badge tone={c.tone}>{c.outcome_text}</Badge>
                  <strong>{c.title}</strong>
                </div>
                <p>{c.explanation}</p>
                {c.missing_text && (
                  <p className="jp-import-missing">
                    <CircleHelp aria-hidden />
                    <span>{c.missing_text}</span>
                  </p>
                )}
                <p className="jp-import-source">
                  {c.source.label}:{" "}
                  <a href={c.source.url} target="_blank" rel="noopener noreferrer">
                    {c.source.title}
                    <ExternalLink aria-hidden />
                  </a>{" "}
                  · {c.source.accessed_text}
                </p>
                {c.question_text && <Badge tone="neutral">{c.question_text}</Badge>}
                {c.ask && (
                  <button type="button" className="jp-action" disabled={advisor.running} onClick={() => ask(c.ask!.question)}>
                    <Sparkles aria-hidden />
                    {c.ask.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="jp-import-note">{ic.note}</p>
        </div>
      )}
    </div>
  );
}
