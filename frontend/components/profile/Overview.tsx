"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { errorText, sendJson, type RestaurantProfileView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useBump, useToast, useView } from "@/components/live";
import { Avatar } from "@/components/AppShell";

// The restaurant's own description, saved on the server.
export default function Overview({ initial }: { initial: RestaurantProfileView | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const bump = useBump();
  const { data: v, setData } = useView<RestaurantProfileView>(`/restaurant/profile?lang=${lang}`, initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const L = (k: string) => v.labels[k] ?? k;

  if (editing)
    return (
      <section className="jp-panel">
        <div className="jp-line-head">
          <h2>{L("ov.editTitle")}</h2>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const values = Object.fromEntries(v.fields.map((f) => [f.key, String(form.get(f.key) ?? "").trim()]));
            setBusy(true);
            try {
              const next = await sendJson<RestaurantProfileView>("PUT", `/restaurant/profile?lang=${lang}`, {
                values,
                logo_url: String(form.get("logo_url") ?? "").trim(),
              });
              setData(next);
              setEditing(false);
              toast(t("ov.saved"));
              bump();
            } catch (err) {
              toast(errorText(err, t), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {v.fields.map((f) => (
            <label key={f.key} className="jp-field">
              {f.label}
              {f.multiline ? (
                <textarea name={f.key} defaultValue={v.values[f.key]} rows={4} maxLength={f.max_length} />
              ) : (
                <input name={f.key} defaultValue={v.values[f.key]} maxLength={f.max_length} />
              )}
            </label>
          ))}
          <label className="jp-field">
            {t("ov.logo")}
            <input name="logo_url" defaultValue={v.logo_url ?? ""} maxLength={400} />
          </label>
          <div className="jp-form-actions">
            <button type="submit" className="jp-action jp-primary" disabled={busy}>
              {L("ov.save")}
            </button>
            <button type="button" className="jp-action" onClick={() => setEditing(false)}>
              {L("cancel")}
            </button>
          </div>
        </form>
      </section>
    );

  return (
    <div className="jp-stack">
      <section className="jp-panel">
        <div className="jp-line-head">
          <h2>{L("ov.about")}</h2>
          <button type="button" className="jp-action" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {L("ov.edit")}
          </button>
        </div>
        <div className="jp-profile-title">
          <Avatar avatar={v.avatar} name={v.name} size={50} />
          <div>
            <h2>{v.name}</h2>
            <p className="jp-muted" style={{ marginTop: 4 }}>
              {v.subtitle}
            </p>
          </div>
        </div>
        <p className="jp-description">{v.values.description}</p>
        <dl className="jp-facts">
          {v.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="jp-panel">
        <details className="jp-source">
          <summary style={{ cursor: "pointer" }}>{L("ov.notes")}</summary>
          <div className="jp-source-body">
            <blockquote className="jp-owner-notes">{v.values.ownerNotes}</blockquote>
          </div>
        </details>
        <details className="jp-source">
          <summary style={{ cursor: "pointer" }}>{L("ov.quest")}</summary>
          <div className="jp-source-body">
            <p className="jp-section-note">{L("ov.questNote")}</p>
            <dl className="jp-facts">
              {v.questionnaire.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      </section>
    </div>
  );
}
