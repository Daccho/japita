"use client";

import { useState } from "react";
import { BookOpen, CalendarDays, Globe, Instagram, MapPin, MessageSquare, Plus } from "lucide-react";
import { useI18n, type Key } from "@/lib/i18n";
import { useStored } from "@/components/workspace";

const TYPES = [
  { id: "website", group: "ln.owned", icon: Globe, placeholder: "https://your-restaurant.com" },
  { id: "publicMenu", group: "ln.owned", icon: BookOpen, placeholder: "https://your-restaurant.com/menu" },
  { id: "instagram", group: "ln.owned", icon: Instagram, placeholder: "https://www.instagram.com/your-restaurant" },
  { id: "googleMaps", group: "ln.discovery", icon: MapPin, placeholder: "https://maps.google.com/…" },
  { id: "tripadvisor", group: "ln.discovery", icon: MessageSquare, placeholder: "https://www.tripadvisor.com/…" },
  { id: "thefork", group: "ln.discovery", icon: CalendarDays, placeholder: "https://www.thefork.com/…" },
] as const;

function validUrl(url: string) {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password && url.length <= 400;
  } catch {
    return false;
  }
}

// Restaurant links, saved in this browser only. No listings are prefilled or imported.
export default function Links() {
  const { t } = useI18n();
  const [links, save] = useStored<Record<string, string>>("japita.links", {});
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{t("ln.title")}</h2>
      </div>
      <p className="jp-section-note">{t("ln.note")}</p>
      {(["ln.owned", "ln.discovery"] as const).map((group) => (
        <div key={group} className="jp-link-group">
          <h3>{t(group)}</h3>
          {TYPES.filter((x) => x.group === group).map(({ id, icon: Icon, placeholder }) => {
            const url = links[id];
            const open = editing === id;
            return (
              <div key={id} className={`jp-link-row ${open ? "jp-link-edit" : ""}`}>
                <Icon aria-hidden />
                <div>
                  <h3>{t(`ln.${id}` as Key)}</h3>
                  <p>{url || t("ln.notAdded")}</p>
                </div>
                <button
                  type="button"
                  className="jp-action"
                  onClick={() => {
                    setEditing(id);
                    setError(null);
                    setToast(null);
                  }}
                >
                  {url ? t("ln.edit") : (
                    <>
                      <Plus aria-hidden />
                      {t("ln.add")}
                    </>
                  )}
                </button>
                {open && (
                  <form
                    className="jp-link-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = String(new FormData(e.currentTarget).get("url") ?? "").trim();
                      if (!validUrl(value)) return setError(t("ln.error"));
                      save({ ...links, [id]: value });
                      setEditing(null);
                      setToast(t("ln.saved"));
                    }}
                  >
                    <label className="jp-field">
                      {t("ln.url")}
                      <input type="url" name="url" defaultValue={url ?? ""} maxLength={400} placeholder={placeholder} required />
                    </label>
                    {error && (
                      <p className="jp-error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="jp-form-actions">
                      <button type="submit" className="jp-action jp-primary">
                        {t("ln.save")}
                      </button>
                      <button type="button" className="jp-action" onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </button>
                      {url && (
                        <button
                          type="button"
                          className="jp-action"
                          onClick={() => {
                            const next = { ...links };
                            delete next[id];
                            save(next);
                            setEditing(null);
                            setToast(t("ln.removed"));
                          }}
                        >
                          {t("ln.remove")}
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
      {toast && <p className="jp-toast">{toast}</p>}
      <p className="jp-muted" style={{ fontSize: 12, marginTop: 20 }}>
        {t("ln.fictional")}
      </p>
    </section>
  );
}
