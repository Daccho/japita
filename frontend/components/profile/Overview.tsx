"use client";

import { useState } from "react";
import { ImageUp, Pencil, RotateCcw } from "lucide-react";
import { errorText, sendJson, type RestaurantProfileView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useBump, useToast, useView } from "@/components/live";
import { Avatar } from "@/components/AppShell";

// Scales the chosen image into a 256px square (letterboxed, transparent) before it is uploaded.
async function squareIcon(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  canvas.getContext("2d")!.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.9);
}

// The restaurant's own description and icon, saved on the server.
export default function Overview({ initial }: { initial: RestaurantProfileView | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const bump = useBump();
  const { data: v, setData } = useView<RestaurantProfileView>(`/restaurant/profile?lang=${lang}`, initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The icon being edited: a URL or an uploaded data URL; "" restores the default.
  const [logo, setLogo] = useState("");
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
                logo_url: logo,
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
          <div className="jp-field">
            {t("ov.logo")}
            <div className="jp-profile-title" style={{ alignItems: "center", marginBottom: 0 }}>
              <Avatar avatar={{ url: logo || v.default_logo_url || null, initials: v.avatar?.initials ?? "" }} name={v.name} size={50} />
              <label className="jp-action">
                <ImageUp aria-hidden />
                {t("ov.logoChange")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={async (e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    if (!file) return;
                    try {
                      setLogo(await squareIcon(file));
                    } catch {
                      toast(t("err.invalid_image"), "error");
                    }
                  }}
                />
              </label>
              {logo && logo !== v.default_logo_url && (
                <button type="button" className="jp-action" onClick={() => setLogo("")}>
                  <RotateCcw aria-hidden />
                  {t("ov.logoReset")}
                </button>
              )}
            </div>
            <span className="jp-muted">{t("ov.logoHint")}</span>
          </div>
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
          <button
            type="button"
            className="jp-action"
            onClick={() => {
              setLogo(v.logo_url ?? "");
              setEditing(true);
            }}
          >
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
