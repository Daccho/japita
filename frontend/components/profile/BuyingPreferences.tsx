"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { api, errorText, type ProfileView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, useBump, useToast, useView } from "@/components/live";
import { InfoTip } from "@/components/InfoTip";
import { Req, WorkspaceRequiredLegend } from "@/components/Required";

type Draft = { amount: number; days: string[] };

// Purchasing priority (the active profile, saved on the server) and its rules. Moving a rule saves at once; budget
// and delivery days save together. The server answers with the effect on this week's plan.
export default function BuyingPreferences({ initial }: { initial: ProfileView | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const bump = useBump();
  const { data: v, setData } = useView<ProfileView>(`/views/profile?lang=${lang}`, initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const L = (k: string) => v.labels[k] ?? k;
  const current: Draft = draft ?? { amount: v.budget.amount, days: v.days.filter((d) => d.on).map((d) => d.day) };

  const run = async (fn: () => Promise<ProfileView | unknown>, done?: (r: ProfileView) => string | undefined) => {
    setBusy(true);
    try {
      const r = (await fn()) as ProfileView;
      if (r && "ingredients" in (r as object)) setData(r);
      const msg = done?.(r);
      if (msg) toast(msg);
      bump();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const choose = (id: string) => {
    const p = v.profiles.find((x) => x.id === id);
    if (!p || p.active) return;
    run(() => api.setActiveProfile(id), () => p.switch_effect?.text);
  };

  return (
    <>
      <section className="jp-panel" style={{ marginBottom: 18 }}>
        <h2>{L("prof.active")}</h2>
        <div className="jp-basket-options" role="group" aria-label={L("prof.active")} style={{ marginTop: 14 }}>
          {v.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              className="jp-basket-option"
              style={{ display: "grid", gap: 4 }}
              aria-pressed={p.active}
              disabled={busy}
              onClick={() => choose(p.id)}
            >
              <span style={{ fontWeight: 700, fontSize: 15 }}>{p.label}</span>
              <small>{p.description}</small>
              <strong className="jp-number" style={{ marginTop: 4 }}>
                {p.suggested_total_text}
              </strong>
            </button>
          ))}
        </div>
      </section>
      <section className="jp-panel">
        <div className="jp-line-head">
          <h2>{L("by.title")}</h2>
          <Badge>{v.badge_text}</Badge>
        </div>
        <p className="jp-section-note">{L("by.note")}</p>
        {v.ingredients.map((ing) => (
          <div key={ing.ingredient} style={{ borderTop: "1px solid var(--jp-line)", paddingTop: 14, marginTop: 6 }}>
            <h3>{ing.label}</h3>
            {ing.empty_text && (
              <p className="jp-muted" style={{ fontSize: 12 }}>
                {ing.empty_text}
              </p>
            )}
            {ing.rules.map((r) => (
              <div key={`${r.kind}-${r.field}`} className="jp-row jp-rule-row">
                <div className="jp-rule-name">
                  <p style={{ color: "var(--jp-text)", fontSize: 13, marginTop: 0 }}>
                    {r.label}
                    <InfoTip hint={r.hint} />
                  </p>
                </div>
                <div className="jp-rule-actions">
                  <Badge tone={r.kind === "mandatory" ? "ok" : "neutral"}>{r.kind_text}</Badge>
                  <button
                    type="button"
                    className="jp-action"
                    disabled={busy}
                    onClick={() => run(() => api.moveRule(v.profile_id, ing.ingredient, r.field, lang), (res) => res.impact?.text)}
                  >
                    {r.kind === "mandatory" ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />}
                    {r.move_text}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 20 }}>
          <WorkspaceRequiredLegend />
        </div>
        <div className="jp-field-grid">
          <label className="jp-field">
            <span>
              {v.budget.label}
              <Req />
            </span>
            <input
              type="number"
              required
              aria-required
              min={v.budget.min}
              max={v.budget.max}
              step={1}
              value={current.amount}
              onChange={(e) => setDraft({ ...current, amount: Number(e.target.value) })}
            />
            <small className="jp-muted">{v.budget.note}</small>
          </label>
          <div className="jp-field">
            <span>{L("by.days")}</span>
            <div className="jp-pill-row" style={{ marginTop: 0 }}>
              {v.days.map(({ day, label }) => {
                const on = current.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`jp-badge ${on ? "" : "jp-neutral"}`}
                    aria-pressed={on}
                    style={{ cursor: "pointer", opacity: on ? 1 : 0.6 }}
                    onClick={() =>
                      setDraft({ ...current, days: on ? current.days.filter((x) => x !== day) : v.days.map((d) => d.day).filter((x) => x === day || current.days.includes(x)) })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="jp-form-actions">
          <button
            type="button"
            className="jp-action jp-primary"
            disabled={!draft || busy || !(current.amount >= v.budget.min && current.amount <= v.budget.max)}
            onClick={() =>
              run(
                () => api.patchProfile(v.profile_id, { budget: { amount: current.amount, currency: v.budget.currency }, accepted_delivery_days: current.days }, lang),
                (res) => {
                  setDraft(null);
                  return res.impact?.text;
                },
              )
            }
          >
            {busy ? L("by.saving") : L("by.save")}
          </button>
          {draft && (
            <button type="button" className="jp-action" onClick={() => setDraft(null)}>
              {L("by.discard")}
            </button>
          )}
          <Link href="/restaurants/suppliers" className="jp-action">
            {L("by.browse")}
          </Link>
        </div>
      </section>
    </>
  );
}
