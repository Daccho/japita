"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { api, errorText, type BasketResult, type Day, type Profile, type Rule } from "@/lib/api";
import { useDates, useI18n, useLabel, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { findBasket } from "@/components/helpers";
import { InfoTip } from "@/components/InfoTip";

const DAYS: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const cheapest = (r: BasketResult) => findBasket(r, "lowest_cost")?.delivered_total_eur ?? null;

// The active profile's real purchasing rules (backend). Moving a rule and saving recalculates every basket.
export default function BuyingPreferences() {
  const { t, money, fx } = useI18n();
  const label = useLabel();
  const d = useDates();
  const { data, profileId, refresh } = useWorkspace();
  const saved = data?.state.profiles[profileId];
  const [draft, setDraft] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!saved) return null;
  const p = draft && draft.id === profileId ? draft : saved;
  const dirty = p !== saved;
  const edit = (next: Profile) => {
    setDraft(next);
    setMsg(null);
  };

  const move = (ing: string, rule: Rule, from: "mandatory" | "negotiable") => {
    const to = from === "mandatory" ? "negotiable" : "mandatory";
    const cur = p.ingredients[ing];
    edit({
      ...p,
      ingredients: { ...p.ingredients, [ing]: { ...cur, [from]: cur[from].filter((r) => r !== rule), [to]: [...cur[to], rule] } },
    });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const before = data ? cheapest(data.baskets) : null;
    try {
      await api.putProfile(p);
      const after = cheapest(await api.baskets(profileId));
      await refresh();
      setDraft(null);
      setMsg(t("by.impact", { a: money(before, "—"), b: money(after, "—") }));
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const ruleRow = (ing: string, r: Rule, kind: "mandatory" | "negotiable") => (
    <div key={`${kind}-${r.field}`} className="jp-row" style={{ padding: "10px 0" }}>
      <div>
        <p style={{ color: "var(--jp-text)", fontSize: 13, marginTop: 0 }}>
          {r.label}
          <InfoTip field={r.field} />
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className={`jp-badge ${kind === "mandatory" ? "" : "jp-neutral"}`}>{kind === "mandatory" ? t("by.required") : t("by.preferred")}</span>
        <button type="button" className="jp-action" style={{ padding: "6px 9px" }} onClick={() => move(ing, r, kind)}>
          {kind === "mandatory" ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />}
          {kind === "mandatory" ? t("by.toPref") : t("by.toReq")}
        </button>
      </div>
    </div>
  );

  return (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{t("by.title")}</h2>
        <span className="jp-badge">{t("by.badge", { name: t(`profile.${profileId}` as Key) })}</span>
      </div>
      <p className="jp-section-note">{t("by.note")}</p>
      {Object.entries(p.ingredients).map(([ing, rules]) => (
        <div key={ing} style={{ borderTop: "1px solid var(--jp-line)", paddingTop: 14, marginTop: 6 }}>
          <h3>{label("ing", ing)}</h3>
          {rules.mandatory.length + rules.negotiable.length === 0 && <p className="jp-muted" style={{ fontSize: 12 }}>{t("by.none")}</p>}
          {rules.mandatory.map((r) => ruleRow(ing, r, "mandatory"))}
          {rules.negotiable.map((r) => ruleRow(ing, r, "negotiable"))}
        </div>
      ))}
      <div className="jp-field-grid" style={{ marginTop: 20 }}>
        <label className="jp-field">
          {t("by.budget", { c: fx.currency })}
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={Math.round(fx.fromEur(p.weekly_budget_eur))}
            onChange={(e) => Number(e.target.value) > 0 && edit({ ...p, weekly_budget_eur: fx.toEur(Number(e.target.value)) })}
          />
          <small className="jp-muted">{t("by.budgetNote")}</small>
        </label>
        <div className="jp-field">
          <span>{t("by.days")}</span>
          <div className="jp-pill-row" style={{ marginTop: 0 }}>
            {DAYS.map((day) => {
              const on = p.accepted_delivery_days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`jp-badge ${on ? "" : "jp-neutral"}`}
                  aria-pressed={on}
                  style={{ cursor: "pointer", opacity: on ? 1 : 0.6 }}
                  onClick={() =>
                    edit({ ...p, accepted_delivery_days: on ? p.accepted_delivery_days.filter((x) => x !== day) : DAYS.filter((x) => x === day || p.accepted_delivery_days.includes(x)) })
                  }
                >
                  {d.weekdayName(day)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="jp-field">
        <span>{t("by.priorities")}</span>
        <div className="jp-field-grid">
          {Object.entries(p.priorities).map(([k, v]) => (
            <label key={k} className="jp-select-label" style={{ margin: "4px 0" }}>
              {label("prio", k)}
              <select value={v} onChange={(e) => edit({ ...p, priorities: { ...p.priorities, [k]: e.target.value as typeof v } })}>
                {(["low", "medium", "high"] as const).map((l) => (
                  <option key={l} value={l}>
                    {label("lvl", l)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
      <div className="jp-form-actions">
        <button type="button" className="jp-action jp-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? t("by.saving") : t("by.save")}
        </button>
        {dirty && (
          <button type="button" className="jp-action" onClick={() => setDraft(null)}>
            {t("by.discard")}
          </button>
        )}
        <Link href="/restaurants/suppliers" className="jp-action">
          {t("by.browse")}
        </Link>
      </div>
      {msg && <p className="jp-toast">{msg}</p>}
    </section>
  );
}
