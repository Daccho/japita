"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Pencil, Plus } from "lucide-react";
import { api, errorText, money, qty, type MenuDish } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { useStored, useWorkspace } from "@/components/workspace";
import { MENU, MENU_GROUPS, PROFILE_DEFAULTS, type MenuItem } from "@/components/menuData";

type Edits = Record<string, Partial<Pick<MenuItem, "name" | "description" | "price_eur">>>;
type DraftDish = MenuDish & { ingredientText?: string };
const BOWLS = ["tonkotsu", "set_full", "set_kaedama", "veggie_miso"];

function AutoText({ value, onChange, label, required, id }: { value: string; onChange: (v: string) => void; label: string; required?: boolean; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${ref.current.scrollHeight}px`; }
  }, [value]);
  return <textarea ref={ref} id={id} className="jp-menu-inline" rows={1} value={value} aria-label={label} required={required} maxLength={required ? 80 : 240} onChange={(e) => onChange(e.target.value)} />;
}

export default function MenuSheet() {
  const { t } = useI18n();
  const label = useLabel();
  const { data, refresh } = useWorkspace();
  const [legacy] = useStored<Edits>("japita.menu", {});
  const [profileText] = useStored("japita.profileText", PROFILE_DEFAULTS);
  const [draft, setDraft] = useState<DraftDish[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lines = data?.state.recipe.lines ?? [];
  const defaults: MenuDish[] = MENU.map((m) => ({ ...m, group: MENU_GROUPS.find((g) => g.ids.includes(m.id))!.title.slice(3) as MenuDish["group"],
    ingredients: lines.filter((l) => l.per_item[m.id] !== undefined).map((l) => label("ing", l.ingredient)),
    ingredient_keys: lines.filter((l) => l.per_item[m.id] !== undefined).map((l) => l.ingredient) }));
  const items = (data?.state.menu?.items ?? defaults).map((item) => data?.state.recipe.menu_items ? item : { ...item, ...legacy[item.id] });
  const shown: DraftDish[] = draft ?? items;
  const servings = data?.state.week.servings ?? {};
  const bowls = BOWLS.reduce((s, k) => s + (servings[k] ?? 0), 0);

  const save = async () => {
    if (!draft || busy) return;
    if (draft.some((m) => !m.name.trim())) { setError(t("mn.errorName")); return; }
    const next = draft.map(({ ingredientText, ...item }) => ({ ...item, name: item.name.trim(), description: item.description.trim(),
      ingredients: ingredientText === undefined ? item.ingredients : ingredientText.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean) }));
    setBusy(true); setError(null);
    try {
      await api.saveMenu(next);
      await refresh();
      setDraft(null); setToast(t("mn.saved"));
    } catch (e) { setError(t("mn.saveError", { e: errorText(e, t) })); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const update = (id: string, patch: Partial<DraftDish>) => setDraft((d) => d && d.map((m) => m.id === id ? { ...m, ...patch } : m));
  const add = (group: MenuDish["group"]) => {
    const id = `dish_${crypto.randomUUID().replaceAll("-", "")}`;
    setDraft((d) => [...(d ?? items), { id, name: "", description: "", price_eur: null, group, ingredients: [], ingredient_keys: [], ingredientText: "" }]);
    requestAnimationFrame(() => document.getElementById(`menu-name-${id}`)?.focus());
  };

  return <form className="jp-menu-editor" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    {draft && <div className="jp-menu-editbar">
      <div><h2>{t("mn.editing")}</h2><p>{t("mn.editHelp")}</p></div>
      <div className="jp-form-actions"><button type="button" className="jp-action" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>{t("cancel")}</button>
        <button type="submit" className="jp-action jp-primary" disabled={busy}><Check aria-hidden />{t(busy ? "mn.saving" : "mn.save")}</button></div>
      {error && <p className="jp-error" role="alert">{error}</p>}
    </div>}
    <section className={`jp-menu-document ${draft ? "jp-menu-editing" : ""}`} aria-label="Restaurant menu sheet">
      {!draft && <button type="button" className="jp-action jp-sheet-edit" aria-label={t("mn.edit")} onClick={() => { setDraft(items.map((m) => ({ ...m, ingredients: [...m.ingredients] }))); setToast(null); }}><Pencil aria-hidden /></button>}
      <header className="jp-menu-masthead"><Image src="/kumo-demo-logo.webp" alt="Kumo Ramen logo" width={58} height={58} /><h2 className="jp-menu-restaurant">Kumo Ramen Milano</h2><p>{profileText.concept} · {profileText.location}</p><span className="jp-menu-label">{t("mn.label")}</span></header>
      {MENU_GROUPS.map((group) => {
        const key = group.title.slice(3) as MenuDish["group"];
        return <section key={key} className="jp-menu-chapter"><h3 className="jp-menu-chapter-title">{t(group.title)}</h3>
          {shown.filter((m) => m.group === key).map((m) => <article key={m.id} className="jp-menu-dish">
            <div className="jp-menu-dish-line"><h3>{draft ? <AutoText id={`menu-name-${m.id}`} value={m.name} label={t("mn.dishName")} required onChange={(name) => update(m.id, { name })} /> : m.name}</h3><span className="jp-menu-leader" aria-hidden />
              <span className="jp-menu-dish-price">{draft ? <><span aria-hidden>€</span><input className="jp-menu-inline" type="number" min={0} max={10000} step={0.01} placeholder={t("mn.various")} value={m.price_eur ?? ""} aria-label={`${m.name || t("mn.dishName")} · EUR`} onChange={(e) => update(m.id, { price_eur: e.target.value === "" ? null : Number(e.target.value) })} /></> : m.price_eur === null ? t("mn.various") : money(m.price_eur).replace(".00", "")}</span>
            </div>
            <p>{draft ? <AutoText value={m.description} label={`${m.name || t("mn.dishName")} · description`} onChange={(description) => update(m.id, { description })} /> : m.description}</p>
            {draft && <label className="jp-menu-ingredient-editor">{t("mn.ingredients")}<textarea className="jp-menu-inline" rows={2} maxLength={3000} value={m.ingredientText ?? m.ingredients.join(", ")} onChange={(e) => update(m.id, { ingredientText: e.target.value })} /><small>{t("mn.ingredientsHint")}</small></label>}
          </article>)}
          {draft && <button type="button" className="jp-action jp-menu-add" disabled={busy || shown.length >= 100} onClick={() => add(key)}><Plus aria-hidden />{t("mn.addDish")}</button>}
        </section>;
      })}
      <footer className="jp-menu-paper-foot">{t("mn.foot")}</footer>
    </section>
    {toast && <p className="jp-toast" role="status" style={{ maxWidth: 740, margin: "14px auto 0" }}>{toast}</p>}
    <details className="jp-menu-planning"><summary>{t("mn.plan")}</summary><p className="jp-section-note" style={{ marginTop: 15 }}>{t("mn.planNote", { bowls: bowls.toLocaleString("en-IE"), refills: (servings.kaedama ?? 0).toLocaleString("en-IE") })}</p>
      {shown.map((m) => {
        const uses = lines.filter((line) => line.per_item[m.id] !== undefined).map((line) => `${qty(line.per_item[m.id], line.unit)} ${label("ing", line.ingredient).toLowerCase()}`);
        const ingredients = draft && m.ingredientText !== undefined ? m.ingredientText.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean) : m.ingredients;
        const n = servings[m.id];
        return <details key={m.id} className="jp-menu-planning-row"><summary>{m.name || t("mn.dishName")} · {n === undefined ? t("mn.notPlanned") : t("mn.planned", { n: n.toLocaleString("en-IE") })}</summary><div className="jp-menu-detail">
          <div className="jp-ingredients">{ingredients.map((name, index) => <span key={index} className="jp-badge">{name}</span>)}</div>
          {!ingredients.length && <p className="jp-muted">{t("mn.ingredientsEmpty")}</p>}
          <p className="jp-muted">{uses.length ? t("mn.perServing", { list: uses.join(" + ") }) : t("mn.noPurchase")}</p>
        </div></details>;
      })}
    </details>
  </form>;
}
