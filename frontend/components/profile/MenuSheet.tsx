"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Pencil } from "lucide-react";
import { menuEur, qty } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { useStored, useWorkspace } from "@/components/workspace";
import { MENU, MENU_GROUPS, PROFILE_DEFAULTS, type MenuItem } from "@/components/menuData";

type Edits = Record<string, Partial<Pick<MenuItem, "name" | "description" | "price_eur">>>;

const BOWLS = ["tonkotsu", "set_full", "set_kaedama", "veggie_miso"];

function AutoText({ value, onChange, label, required }: { value: string; onChange: (v: string) => void; label: string; required?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} className="jp-menu-inline" rows={1} value={value} aria-label={label} required={required} maxLength={240} onChange={(e) => onChange(e.target.value)} />;
}

// Warm paper-style menu. The pencil edits names, descriptions and prices in place (saved in this browser only).
export default function MenuSheet() {
  const { t } = useI18n();
  const label = useLabel();
  const { data } = useWorkspace();
  const [edits, saveEdits] = useStored<Edits>("japita.menu", {});
  const [profileText] = useStored("japita.profileText", PROFILE_DEFAULTS);
  const [draft, setDraft] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const items = MENU.map((m) => ({ ...m, ...edits[m.id] }));
  const shown = draft ?? items;
  const servings = data?.state.week.servings ?? {};
  const lines = data?.state.recipe.lines ?? [];
  const bowls = BOWLS.reduce((s, k) => s + (servings[k] ?? 0), 0);

  const save = () => {
    if (!draft) return;
    if (draft.some((m) => !m.name.trim())) {
      setError(t("mn.errorName"));
      return;
    }
    const next: Edits = {};
    for (const m of draft) next[m.id] = { name: m.name.trim(), description: m.description.trim(), price_eur: m.price_eur };
    saveEdits(next);
    setDraft(null);
    setError(null);
    setToast(t("mn.saved"));
  };

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const update = (id: string, patch: Partial<MenuItem>) => setDraft((d) => d && d.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <form
      className="jp-menu-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {draft && (
        <div className="jp-menu-editbar">
          <div>
            <h2>{t("mn.editing")}</h2>
            <p>{t("mn.editHelp")}</p>
          </div>
          <div className="jp-form-actions">
            <button
              type="button"
              className="jp-action"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              {t("cancel")}
            </button>
            <button type="submit" className="jp-action jp-primary">
              <Check aria-hidden />
              {t("mn.save")}
            </button>
          </div>
          {error && (
            <p className="jp-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <section className={`jp-menu-document ${draft ? "jp-menu-editing" : ""}`} aria-label="Restaurant menu sheet">
        {!draft && (
          <button
            type="button"
            className="jp-action jp-sheet-edit"
            aria-label={t("mn.edit")}
            title={t("mn.edit")}
            onClick={() => {
              setDraft(items);
              setToast(null);
            }}
          >
            <Pencil aria-hidden />
          </button>
        )}
        <header className="jp-menu-masthead">
          <Image src="/kumo-demo-logo.webp" alt="Kumo Ramen logo" width={58} height={58} />
          <h2 className="jp-menu-restaurant">Kumo Ramen Milano</h2>
          <p>
            {profileText.concept} · {profileText.location}
          </p>
          <span className="jp-menu-label">{t("mn.label")}</span>
        </header>
        {MENU_GROUPS.map((g) => (
          <section key={g.title} className="jp-menu-chapter">
            <h3 className="jp-menu-chapter-title">{t(g.title)}</h3>
            {shown
              .filter((m) => g.ids.includes(m.id))
              .map((m) => (
                <article key={m.id} className="jp-menu-dish">
                  <div className="jp-menu-dish-line">
                    <h3>{draft ? <AutoText value={m.name} label={m.name} required onChange={(v) => update(m.id, { name: v })} /> : m.name}</h3>
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
                            placeholder={t("mn.various")}
                            value={m.price_eur ?? ""}
                            aria-label={`${m.name} · EUR`}
                            onChange={(e) => update(m.id, { price_eur: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </>
                      ) : m.price_eur === null ? (
                        t("mn.various")
                      ) : (
                        menuEur(m.price_eur).replace(".00", "")
                      )}
                    </span>
                  </div>
                  <p>{draft ? <AutoText value={m.description} label={`${m.name} · description`} onChange={(v) => update(m.id, { description: v })} /> : m.description}</p>
                </article>
              ))}
          </section>
        ))}
        <footer className="jp-menu-paper-foot">{t("mn.foot")}</footer>
      </section>
      {toast && (
        <p className="jp-toast" style={{ maxWidth: 740, margin: "14px auto 0" }}>
          {toast}
        </p>
      )}
      <details className="jp-menu-planning">
        <summary style={{ cursor: "pointer" }}>{t("mn.plan")}</summary>
        <p className="jp-section-note" style={{ marginTop: 15 }}>
          {t("mn.planNote", { bowls: bowls.toLocaleString("en-IE"), refills: (servings.kaedama ?? 0).toLocaleString("en-IE") })}
        </p>
        {items.map((m) => {
          const uses = lines.filter((l) => l.per_item[m.id] !== undefined).map((l) => `${qty(l.per_item[m.id], l.unit)} ${label("ing", l.ingredient).toLowerCase()}`);
          const n = servings[m.id];
          return (
            <details key={m.id} className="jp-menu-planning-row">
              <summary style={{ cursor: "pointer" }}>
                {m.name} · {n === undefined ? t("mn.notPlanned") : t("mn.planned", { n: n.toLocaleString("en-IE") })}
              </summary>
              <div className="jp-menu-detail">
                {uses.length > 0 && (
                  <div className="jp-ingredients">
                    {lines
                      .filter((l) => l.per_item[m.id] !== undefined)
                      .map((l) => (
                        <span key={l.ingredient} className="jp-badge">
                          {label("ing", l.ingredient)}
                        </span>
                      ))}
                  </div>
                )}
                <p className="jp-muted">{uses.length ? t("mn.perServing", { list: uses.join(" + ") }) : t("mn.noPurchase")}</p>
              </div>
            </details>
          );
        })}
      </details>
    </form>
  );
}
