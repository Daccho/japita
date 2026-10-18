"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { api, errorText, type MenuDish, type MenuView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useBump, useToast, useView } from "@/components/live";
import { Req, WorkspaceRequiredLegend } from "@/components/Required";

type DraftDish = MenuDish & { ingredientText?: string };

function AutoText({ value, onChange, label, required, id }: { value: string; onChange: (v: string) => void; label: string; required?: boolean; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);
  return <textarea ref={ref} id={id} className="jp-menu-inline" rows={1} value={value} aria-label={label} required={required} aria-required={required || undefined} maxLength={required ? 80 : 240} onChange={(e) => onChange(e.target.value)} />;
}

// The printed menu, edited in place and saved on the server (GET/PUT /menu); texts and prices come from /views/menu.
export default function MenuSheet({ initial }: { initial: MenuView | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const bump = useBump();
  const { data: v } = useView<MenuView>(`/views/menu?lang=${lang}`, initial);
  const [draft, setDraft] = useState<DraftDish[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!draft || busy || !v) return;
    if (draft.some((m) => !m.name.trim())) {
      setError(v.labels["mn.errorName"]);
      return;
    }
    const next = draft.map(({ ingredientText, ...item }) => ({
      ...item,
      name: item.name.trim(),
      description: item.description.trim(),
      ingredients: ingredientText === undefined ? item.ingredients : ingredientText.split(/[,;\n]+/).map((name) => name.trim()).filter(Boolean),
    }));
    setBusy(true);
    setError(null);
    try {
      await api.saveMenu(next);
      setDraft(null);
      toast(v.labels["mn.saved"]);
      bump();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!v) return null;
  const L = (k: string) => v.labels[k] ?? k;
  const shown: DraftDish[] = draft ?? v.items;
  const update = (id: string, patch: Partial<DraftDish>) => setDraft((d) => d && d.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const add = (group: MenuDish["group"]) => {
    const id = `dish_${crypto.randomUUID().replaceAll("-", "")}`;
    setDraft((d) => [...(d ?? v.items), { id, name: "", description: "", price_eur: null, group, ingredients: [], ingredient_keys: [], ingredientText: "" }]);
    requestAnimationFrame(() => document.getElementById(`menu-name-${id}`)?.focus());
  };

  return (
    <form
      className="jp-menu-editor"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {draft && (
        <div className="jp-menu-editbar">
          <div>
            <h2>{L("mn.editing")}</h2>
            <p>{L("mn.editHelp")}</p>
            <WorkspaceRequiredLegend />
          </div>
          <div className="jp-form-actions">
            <button
              type="button"
              className="jp-action"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              {L("cancel")}
            </button>
            <button type="submit" className="jp-action jp-primary" disabled={busy}>
              <Check aria-hidden />
              {busy ? L("mn.saving") : L("mn.save")}
            </button>
          </div>
          {error && (
            <p className="jp-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <section className={`jp-menu-document ${draft ? "jp-menu-editing" : ""}`} aria-label={L("mn.label")}>
        {!draft && (
          <button
            type="button"
            className="jp-action jp-sheet-edit"
            aria-label={L("mn.edit")}
            onClick={() => setDraft(v.items.map((m) => ({ ...m, ingredients: [...m.ingredients] })))}
          >
            <Pencil aria-hidden />
          </button>
        )}
        <header className="jp-menu-masthead">
          {v.masthead.avatar.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.masthead.avatar.url} alt="" width={58} height={58} />
          )}
          <h2 className="jp-menu-restaurant">{v.masthead.name}</h2>
          <p>{v.masthead.subtitle}</p>
          <span className="jp-menu-label">{L("mn.label")}</span>
        </header>
        {v.groups.map((group) => (
          <section key={group.key} className="jp-menu-chapter">
            <h3 className="jp-menu-chapter-title">{group.title}</h3>
            {shown
              .filter((m) => m.group === group.key)
              .map((m) => (
                <article key={m.id} className="jp-menu-dish">
                  <div className="jp-menu-dish-line">
                    <h3>{draft ? <AutoText id={`menu-name-${m.id}`} value={m.name} label={L("mn.dishName")} required onChange={(name) => update(m.id, { name })} /> : m.name}{draft && <Req />}</h3>
                    <span className="jp-menu-leader" aria-hidden />
                    <span className="jp-menu-dish-price">
                      {draft ? (
                        <>
                          <span aria-hidden>€</span>
                          <input
                            className="jp-menu-inline"
                            type="number"
                            min={0}
                            max={10000}
                            step={0.01}
                            placeholder={L("mn.various")}
                            value={m.price_eur ?? ""}
                            aria-label={`${m.name || L("mn.dishName")} · EUR`}
                            onChange={(e) => update(m.id, { price_eur: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </>
                      ) : (
                        v.prices[m.id] ?? L("mn.various")
                      )}
                    </span>
                  </div>
                  <p>{draft ? <AutoText value={m.description} label={`${m.name || L("mn.dishName")}`} onChange={(description) => update(m.id, { description })} /> : m.description}</p>
                  {draft && (
                    <label className="jp-menu-ingredient-editor">
                      {L("mn.ingredients")}
                      <textarea
                        className="jp-menu-inline"
                        rows={2}
                        maxLength={3000}
                        value={m.ingredientText ?? m.ingredients.join(", ")}
                        onChange={(e) => update(m.id, { ingredientText: e.target.value })}
                      />
                      <small>{L("mn.ingredientsHint")}</small>
                    </label>
                  )}
                </article>
              ))}
            {draft && (
              <button type="button" className="jp-action jp-menu-add" disabled={busy || shown.length >= 100} onClick={() => add(group.key)}>
                <Plus aria-hidden />
                {L("mn.addDish")}
              </button>
            )}
          </section>
        ))}
        <footer className="jp-menu-paper-foot">{L("mn.foot")}</footer>
      </section>
      <details className="jp-menu-planning">
        <summary>{v.planning.title}</summary>
        <p className="jp-section-note" style={{ marginTop: 15 }}>
          {v.planning.note}
        </p>
        {v.planning.rows.map((r) => (
          <details key={r.id} className="jp-menu-planning-row">
            <summary>{r.summary}</summary>
            <div className="jp-menu-detail">
              <div className="jp-ingredients">
                {r.ingredients.map((name, index) => (
                  <span key={index} className="jp-badge">
                    {name}
                  </span>
                ))}
              </div>
              {!r.ingredients.length && <p className="jp-muted">{L("mn.ingredientsEmpty")}</p>}
              <p className="jp-muted">{r.uses_text}</p>
            </div>
          </details>
        ))}
      </details>
    </form>
  );
}
