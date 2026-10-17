"use client";

import { useState } from "react";
import { api, cheapest, eur, type BasketResult, type Clarification, type Extraction, type Offer } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { Badge, Button } from "@/components/ui";
import { shortModel } from "@/components/ModelBadge";

const STATE_TONE = { draft: "amber", sent: "blue", supplier_replied: "violet", replied: "green" } as const;

const fmt = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

// The demo climax: owner approves the agent's Japanese question -> test supplier answers in Japanese ->
// Gemma (on AMD) reads the value twice with a source quote -> owner applies it -> baskets recalculate.
export default function Clarifications({ items, offers, profileId, baselineBefore, onChange }: {
  items: Clarification[];
  offers: Offer[];
  profileId: string;
  baselineBefore: BasketResult | null;
  onChange: () => void;
}) {
  const { t, lang } = useI18n();
  const label = useLabel();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<Record<string, { before: number | null; after: number | null }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const apply = (c: Clarification, value?: unknown) =>
    run(c.id, async () => {
      const r = await api.applyClarification(c.id, profileId, value);
      setImpact((m) => ({ ...m, [c.id]: { before: baselineBefore ? cheapest(baselineBefore) : null, after: cheapest(r.baskets) } }));
    });

  if (!items.length) return <p className="text-sm text-stone-500">{t("cl.none")}</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {items.map((c) => {
        const offer = offers.find((o) => o.id === c.offer_id);
        const link = c.token ? `${window.location.origin}/supplier/${c.token}` : null;
        const translated = c.translations?.[lang];
        return (
          <div key={c.id} className="rounded border border-stone-200 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={STATE_TONE[c.state] ?? "gray"}>{label("state", c.state)}</Badge>
              <span className="font-medium">{offer?.product ?? c.offer_id}</span>
              <span className="text-stone-500">· {t("cl.missing", { f: c.field })}</span>
            </div>
            <p className="text-xs text-stone-500">{c.reason}</p>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{t("cl.original")}</p>
                <p lang="ja" className="rounded bg-stone-50 p-2 text-sm">{c.text_ja}</p>
              </div>
              {translated && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">{t("cl.translation")}</p>
                  <p className="rounded bg-stone-50 p-2 text-sm text-stone-700">{translated}</p>
                </div>
              )}
            </div>

            {c.state === "draft" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button onClick={() => run(c.id, () => api.approveClarification(c.id))} disabled={busy === c.id}>
                  {t("cl.approve")}
                </Button>
                <span className="text-xs text-stone-500">{t("cl.approveNote")}</span>
              </div>
            )}

            {link && c.state === "sent" && (
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-stone-500">{t("cl.link")}:</span>
                  <a href={link} target="_blank" rel="noreferrer" className="font-mono text-xs text-red-700 underline">
                    /supplier/{c.token}
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(link);
                      setCopied(c.id);
                    }}
                    className="text-xs text-stone-500 hover:text-stone-800"
                  >
                    {copied === c.id ? t("cl.copied") : t("cl.copy")}
                  </button>
                </div>
                <p className="text-xs text-stone-500">{t("cl.waiting")}</p>
              </div>
            )}

            {c.reply && (
              <Reply
                c={c}
                busy={busy === c.id}
                onApply={(v) => apply(c, v)}
              />
            )}

            {c.state === "replied" && (
              <p className="mt-2 text-sm text-emerald-800">
                {t("cl.applied", { v: fmt(c.applied_value) })}
                {impact[c.id] && (
                  <span className="ml-2 font-semibold">
                    · {t("cl.recalc", { a: eur(impact[c.id].before), b: eur(impact[c.id].after) })}
                  </span>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Reply({ c, busy, onApply }: { c: Clarification; busy: boolean; onApply: (v?: unknown) => void }) {
  const { t, lang } = useI18n();
  const [custom, setCustom] = useState("");
  const reply = c.reply!;
  const ex: Extraction = reply.extraction;
  const translated = reply.translations?.[lang];
  const choices = Array.from(new Set([ex.read_1, ex.read_2].filter((v) => v !== null && v !== undefined).map(String)));

  return (
    <div className="mt-3 rounded border border-violet-200 bg-violet-50/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-stone-500">{t("cl.reply")}</p>
      <p lang="ja" className="text-sm">{reply.text_ja}</p>
      {translated && <p className="mt-1 text-sm text-stone-600">{translated}</p>}

      <div className="mt-2 rounded bg-white p-2 text-sm">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-stone-500">{t("cl.extracted")}:</span>
          <span className="text-lg font-bold">{fmt(ex.value)}</span>
          <Badge tone={ex.status === "ok" ? "green" : "amber"}>{ex.status}</Badge>
          <span className="text-xs text-stone-500">{t("cl.reads", { a: fmt(ex.read_1), b: fmt(ex.read_2) })}</span>
        </div>
        {ex.source_text && (
          <p className="mt-1 text-xs">
            <span className="text-stone-500">{t("cl.quote")}: </span>
            <span lang="ja" className="rounded bg-amber-50 px-1">“{ex.source_text}”</span>
          </p>
        )}
        <AmdEvidence ex={ex} />
      </div>

      {c.state === "supplier_replied" && (
        <div className="mt-2">
          {ex.status === "ok" ? (
            <Button onClick={() => onApply()} disabled={busy}>{t("cl.apply", { v: fmt(ex.value) })}</Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">{t("cl.choose")}</p>
              <div className="flex flex-wrap items-center gap-2">
                {choices.map((v) => (
                  <Button key={v} variant="secondary" onClick={() => onApply(parse(v))} disabled={busy}>{v}</Button>
                ))}
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder={t("cl.custom")}
                  className="w-28 rounded border border-stone-300 px-2 py-1 text-sm"
                />
                <Button variant="secondary" onClick={() => onApply(parse(custom))} disabled={busy || !custom.trim()}>OK</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AmdEvidence({ ex }: { ex: Pick<Extraction, "calls" | "elapsed_ms"> }) {
  const { t } = useI18n();
  if (!ex.calls?.length) return null;
  return (
    <div className="mt-2 border-t border-stone-100 pt-1 text-[11px] text-stone-500">
      <span className="font-semibold text-red-700">AMD</span> · {t("cl.amd", { ms: ex.elapsed_ms })}
      <ul>
        {ex.calls.map((call) => (
          <li key={call.request_id} className="font-mono">
            {shortModel(call.model)} · {call.backend} · {call.latency_ms} ms · {call.request_id}
          </li>
        ))}
      </ul>
    </div>
  );
}

function parse(v: string): unknown {
  const s = v.trim();
  if (s === "true" || s === "false") return s === "true";
  const n = Number(s.replace(/%$/, ""));
  return Number.isFinite(n) && s !== "" ? n : s;
}
