"use client";

import { useState } from "react";
import { BookOpen, CalendarDays, Globe, Instagram, MapPin, MessageSquare, Plus, type LucideIcon } from "lucide-react";
import { errorCodeOf, errorText, sendJson, type LinksView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast, useView } from "@/components/live";

const ICONS: Record<string, LucideIcon> = {
  website: Globe,
  publicMenu: BookOpen,
  instagram: Instagram,
  googleMaps: MapPin,
  tripadvisor: MessageSquare,
  thefork: CalendarDays,
};

// The restaurant's public pages, saved on the server; the server validates every URL.
export default function Links({ initial }: { initial: LinksView | null }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: v, setData } = useView<LinksView>(`/restaurant/links?lang=${lang}`, initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!v) return null;
  const L = (k: string) => v.labels[k] ?? k;

  const save = async (id: string, url: string | null, done: string) => {
    setError(null);
    try {
      const next = await sendJson<LinksView>("PUT", `/restaurant/links?lang=${lang}`, { links: { ...v.links, [id]: url } });
      setData(next);
      setEditing(null);
      toast(done);
    } catch (e) {
      setError(errorCodeOf(e) === "invalid_url" ? L("ln.error") : errorText(e, t));
    }
  };

  return (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{L("ln.title")}</h2>
      </div>
      <p className="jp-section-note">{L("ln.note")}</p>
      {v.groups.map((group) => (
        <div key={group.key} className="jp-link-group">
          <h3>{group.title}</h3>
          {group.items.map((item) => {
            const Icon = ICONS[item.id] ?? Globe;
            const open = editing === item.id;
            return (
              <div key={item.id} className={`jp-link-row ${open ? "jp-link-edit" : ""}`}>
                <Icon aria-hidden />
                <div>
                  <h3>{item.label}</h3>
                  <p>{item.text}</p>
                </div>
                <button
                  type="button"
                  className="jp-action"
                  onClick={() => {
                    setEditing(item.id);
                    setError(null);
                  }}
                >
                  {!item.url && <Plus aria-hidden />}
                  {item.action_text}
                </button>
                {open && (
                  <form
                    className="jp-link-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = String(new FormData(e.currentTarget).get("url") ?? "").trim();
                      save(item.id, value, t("ln.saved"));
                    }}
                  >
                    <label className="jp-field">
                      {L("ln.url")}
                      <input type="url" name="url" defaultValue={item.url ?? ""} maxLength={v.max_length} placeholder={item.placeholder} required />
                    </label>
                    {error && (
                      <p className="jp-error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="jp-form-actions">
                      <button type="submit" className="jp-action jp-primary">
                        {L("ln.save")}
                      </button>
                      <button type="button" className="jp-action" onClick={() => setEditing(null)}>
                        {L("cancel")}
                      </button>
                      {item.url && (
                        <button type="button" className="jp-action" onClick={() => save(item.id, null, L("ln.removed"))}>
                          {L("ln.remove")}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
