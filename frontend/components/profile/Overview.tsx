"use client";

import { useState } from "react";
import Image from "next/image";
import { Pencil } from "lucide-react";
import { useI18n, type Key } from "@/lib/i18n";
import { useStored } from "@/components/workspace";
import { PROFILE_DEFAULTS, type ProfileText } from "@/components/menuData";

const FIELDS: { key: keyof ProfileText; label: Key; multiline?: boolean }[] = [
  { key: "description", label: "ov.description", multiline: true },
  { key: "concept", label: "ov.concept" },
  { key: "positioning", label: "ov.guests" },
  { key: "location", label: "ov.location" },
  { key: "seats", label: "ov.seats" },
  { key: "menuPrice", label: "ov.prices" },
  { key: "make", label: "ov.make", multiline: true },
  { key: "buy", label: "ov.buy", multiline: true },
  { key: "ownerNotes", label: "ov.notes", multiline: true },
];

export default function Overview() {
  const { t } = useI18n();
  const [p, save] = useStored<ProfileText>("japita.profileText", PROFILE_DEFAULTS);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (editing)
    return (
      <section className="jp-panel">
        <div className="jp-line-head">
          <h2>{t("ov.editTitle")}</h2>
          <span className="jp-badge">{t("side.demo")}</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const next = { ...p };
            for (const f of FIELDS) next[f.key] = String(form.get(f.key) ?? "").trim();
            save(next);
            setEditing(false);
            setToast(t("ov.saved"));
          }}
        >
          {FIELDS.map((f) => (
            <label key={f.key} className="jp-field">
              {t(f.label)}
              {f.multiline ? <textarea name={f.key} defaultValue={p[f.key]} rows={4} maxLength={1200} /> : <input name={f.key} defaultValue={p[f.key]} maxLength={160} />}
            </label>
          ))}
          <div className="jp-form-actions">
            <button type="submit" className="jp-action jp-primary">
              {t("ov.save")}
            </button>
            <button type="button" className="jp-action" onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      </section>
    );

  const fact = (label: Key, value: string) => (
    <div key={label}>
      <dt>{t(label)}</dt>
      <dd>{value || t("ov.notEntered")}</dd>
    </div>
  );

  return (
    <div className="jp-stack">
      <section className="jp-panel">
        <div className="jp-line-head">
          <h2>{t("ov.about")}</h2>
          <button type="button" className="jp-action" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t("ov.edit")}
          </button>
        </div>
        <div className="jp-profile-title">
          <span className="jp-profile-mark">
            <Image src="/kumo-demo-logo.webp" alt="Kumo Ramen demo logo" width={50} height={50} />
          </span>
          <div>
            <h2>Kumo Ramen Milano</h2>
            <p className="jp-muted" style={{ marginTop: 4 }}>
              {p.location} · {t("ov.seatsShort", { n: p.seats })}
            </p>
          </div>
        </div>
        <p className="jp-description">{p.description}</p>
        <dl className="jp-facts">
          {fact("ov.concept", p.concept)}
          {fact("ov.guests", p.positioning)}
          {fact("ov.prices", p.menuPrice)}
          {fact("ov.make", p.make)}
          {fact("ov.buy", p.buy)}
        </dl>
        {toast && <p className="jp-toast">{toast}</p>}
      </section>
      <section className="jp-panel">
        <details className="jp-source">
          <summary style={{ cursor: "pointer" }}>{t("ov.notes")}</summary>
          <div className="jp-source-body">
            <p className="jp-section-note">{t("ov.notesNote")}</p>
            <blockquote className="jp-owner-notes">{p.ownerNotes}</blockquote>
          </div>
        </details>
        <details className="jp-source">
          <summary style={{ cursor: "pointer" }}>{t("ov.quest")}</summary>
          <div className="jp-source-body">
            <p className="jp-section-note">{t("ov.questNote")}</p>
            <dl className="jp-facts">
              {fact("ov.q.concept", p.concept)}
              {fact("ov.q.guests", p.positioning)}
              {fact("ov.q.location", p.location)}
              {fact("ov.q.seats", p.seats)}
              {fact("ov.q.prices", p.menuPrice)}
              {fact("ov.q.make", p.make)}
              {fact("ov.q.buy", p.buy)}
            </dl>
          </div>
        </details>
      </section>
    </div>
  );
}
