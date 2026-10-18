"use client";

import { useEffect, useState } from "react";
import { api, errorText, type State, type Week } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

export default function WeekInputs() {
  const { data, refresh, profileId } = useWorkspace();
  const { t } = useI18n();
  const label = useLabel();
  const [draft, setDraft] = useState<Week | null>(null);
  const [recipe, setRecipe] = useState<State["recipe"] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  useEffect(() => { if (new URLSearchParams(window.location.search).get("edit") === "week") setOpen(true); }, []);
  useEffect(() => { setDraft(null); setRecipe(null); setMessage(""); }, [profileId]);
  const begin = () => {
    if (!data) return;
    const week = structuredClone(data.state.week);
    if (!week.days?.length) {
      week.days = [];
      for (let day = new Date(`${week.dates[0]}T12:00:00Z`); day.toISOString().slice(0, 10) <= week.dates[1]; day.setUTCDate(day.getUTCDate() + 1))
        week.days.push({ date: day.toISOString().slice(0, 10), servings: {} });
    }
    setDraft(week); setRecipe(structuredClone(data.state.recipe)); setMessage("");
    setVersion(data.baskets.input_version);
  };
  if (!data) return null;
  const names = Object.fromEntries((data.state.menu?.items ?? []).map((item) => [item.id, item.name]));
  const items = [...new Set(data.state.recipe.lines.flatMap((line) => Object.keys(line.per_item)))];
  const save = async (kind: "week" | "recipe") => {
    if (!draft || !recipe) return;
    setBusy(true); setMessage("");
    try {
      if (kind === "week") await api.putWeek(draft, profileId, version); else await api.putRecipe(recipe, profileId, version);
      setVersion((await api.baskets(profileId)).input_version);
      await refresh(); setMessage(t("plan.saved"));
    } catch (e) { setMessage(errorText(e, t)); } finally { setBusy(false); }
  };
  return <section className="jp-panel" id="planning"><details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary><strong>{t("plan.title")}</strong></summary><p className="jp-section-note">{t("plan.note")}</p>
    {!draft ? <button className="jp-action" type="button" onClick={begin}>{t("adv.editWeek")}</button> : <>
      <form onSubmit={(e) => { e.preventDefault(); void save("week"); }}>
        <label className="jp-field">{t("plan.asOf")}<input type="date" required value={draft.as_of ?? draft.dates[0]} onChange={(e) => setDraft({ ...draft, as_of: e.target.value })} /></label>
        <h3>{t("plan.stock")}</h3>
        {Object.entries(draft.stock).map(([ing, value]) => <div className="jp-field-grid" key={ing}>
          <label className="jp-field">{label("ing", ing)} · {t("plan.qty", { unit: value.unit })}<input type="number" min={0} step="any" required value={value.usable} onChange={(e) => setDraft({ ...draft, stock: { ...draft.stock, [ing]: { ...value, usable: Number(e.target.value) } } })} /></label>
          <label className="jp-field">{t("plan.usableUntil")}<input type="date" value={value.usable_until ?? ""} onChange={(e) => setDraft({ ...draft, stock: { ...draft.stock, [ing]: { ...value, usable_until: e.target.value || null } } })} /></label>
        </div>)}
        <h3>{t("plan.servings")}</h3><div style={{ overflowX: "auto" }}><table className="jp-input-table"><thead><tr><th></th>{items.map((item) => <th key={item}>{names[item] ?? item}</th>)}</tr></thead>
          <tbody>{draft.days?.map((day, i) => <tr key={day.date}><th>{day.date}</th>{items.map((item) => <td key={item}><input aria-label={`${day.date} ${names[item] ?? item}`} type="number" min={0} step={1} required value={day.servings[item] ?? 0} onChange={(e) => setDraft({ ...draft, days: draft.days!.map((row, n) => n === i ? { ...row, servings: { ...row.servings, [item]: Number(e.target.value) } } : row) })} /></td>)}</tr>)}</tbody></table></div>
        <h3 style={{ marginTop: 20 }}>{t("plan.deliveries")}</h3>
        {(draft.deliveries ?? []).map((delivery, i) => {
          const edit = (patch: Partial<typeof delivery>) => setDraft({ ...draft, deliveries: draft.deliveries!.map((dl, n) => n === i ? { ...dl, ...patch } : dl) });
          return <fieldset className="jp-quote" key={delivery.id}><legend>{data.state.suppliers[delivery.supplier_id]?.name} · {label("ing", delivery.ingredient)}</legend>
            <div className="jp-field-grid">
              <label className="jp-field">{t("nav.suppliers")}<select value={delivery.supplier_id} onChange={(e) => edit({ supplier_id: e.target.value })}>{Object.values(data.state.suppliers).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="jp-field">{t("flt.ingredient")}<select value={delivery.ingredient} onChange={(e) => edit({ ingredient: e.target.value, unit: data.state.recipe.lines.find((line) => line.ingredient === e.target.value)!.unit })}>{data.state.recipe.lines.map((line) => <option key={line.ingredient} value={line.ingredient}>{label("ing", line.ingredient)}</option>)}</select></label>
              <label className="jp-field">{t("plan.qty", { unit: delivery.unit })}<input type="number" min={0.001} step="any" required value={delivery.qty} onChange={(e) => edit({ qty: Number(e.target.value) })} /></label>
              <label className="jp-field">{t("nt.delivery")}<input type="date" required value={delivery.date} onChange={(e) => edit({ date: e.target.value })} /></label>
              <label className="jp-field">{t("plan.revised")}<input type="date" required={delivery.status === "delayed"} value={delivery.revised_date ?? ""} onChange={(e) => edit({ revised_date: e.target.value || null })} /></label>
              <label className="jp-field">{t("plan.usableUntil")}<input type="date" value={delivery.usable_until ?? ""} onChange={(e) => edit({ usable_until: e.target.value || null })} /></label>
              <select aria-label={t("nt.delivery")} value={delivery.status} onChange={(e) => edit({ status: e.target.value as typeof delivery.status })}>{(["confirmed", "delayed", "cancelled"] as const).map((status) => <option key={status} value={status}>{t(`plan.${status}`)}</option>)}</select>
            </div><button className="jp-action" type="button" onClick={() => setDraft({ ...draft, deliveries: draft.deliveries!.filter((_, n) => n !== i) })}>{t("plan.remove")}</button>
          </fieldset>;
        })}
        <div className="jp-form-actions"><button className="jp-action" type="button" onClick={() => setDraft({ ...draft, deliveries: [...(draft.deliveries ?? []), { id: crypto.randomUUID(), supplier_id: Object.keys(data.state.suppliers)[0], ingredient: data.state.recipe.lines[0].ingredient, unit: data.state.recipe.lines[0].unit, qty: 1, date: draft.as_of ?? draft.dates[0], status: "confirmed" }] })}>{t("plan.addDelivery")}</button><button className="jp-action jp-primary" disabled={busy}>{t("plan.save")}</button></div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); void save("recipe"); }}><h3 style={{ marginTop: 25 }}>{t("plan.recipe")}</h3>
        {recipe?.lines.map((line, i) => <details key={line.ingredient}><summary>{label("ing", line.ingredient)} · {line.unit}</summary><div className="jp-field-grid">{Object.entries(line.per_item).map(([item, value]) => <label className="jp-field" key={item}>{names[item] ?? item}<input type="number" min={0} step="any" required value={value} onChange={(e) => setRecipe({ ...recipe, lines: recipe.lines.map((row, n) => n === i ? { ...row, per_item: { ...row.per_item, [item]: Number(e.target.value) } } : row) })} /></label>)}</div></details>)}
        <button className="jp-action" disabled={busy}>{t("plan.recipeSave")}</button>
      </form>
      <button type="button" className="jp-action" onClick={() => { setDraft(null); setRecipe(null); }}>{t("cancel")}</button>
    </>}
    {message && <p role="status">{message}</p>}
  </details></section>;
}
