"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Send } from "lucide-react";
import { api, errorText, type Clarification } from "@/lib/api";
import { useI18n, useLabel, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { copyText, fmtValue } from "@/components/helpers";

const BADGE: Record<Clarification["state"], string> = {
  draft: "jp-warning",
  sent: "jp-neutral",
  supplier_replied: "jp-warning",
  replied: "",
};

// Owner approves the advisor's Japanese question -> the supplier answers on the portal ->
// the owner applies the value read from the reply -> baskets recalculate.
export default function Clarifications() {
  const { t, lang } = useI18n();
  const label = useLabel();
  const { data, profileId, refresh } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const items = [...(data?.state.clarifications ?? [])].reverse();
  const offers = data?.state.offers ?? [];
  const supplierOf = (c: Clarification) => offers.find((o) => o.id === c.offer_id)?.supplier_id;
  const needLinks = items.filter((c) => c.state !== "draft").map(supplierOf).filter((s): s is string => !!s && !links[s]);
  const needKey = [...new Set(needLinks)].join(",");

  useEffect(() => {
    if (!needKey) return;
    needKey.split(",").forEach((sid) =>
      api
        .portalLink(sid)
        .then((r) => setLinks((m) => ({ ...m, [sid]: `${window.location.origin}/supplier/portal/${r.token}` })))
        .catch(() => {}),
    );
  }, [needKey]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return <p className="jp-muted" style={{ fontSize: 13 }}>{t("cl.none")}</p>;

  return (
    <div>
      {error && <p className="jp-error">{error}</p>}
      {items.map((c) => {
        const offer = offers.find((o) => o.id === c.offer_id);
        const supplier = offer ? data?.state.suppliers[offer.supplier_id] : undefined;
        const link = supplierOf(c) ? links[supplierOf(c)!] : undefined;
        const ex = c.reply?.extraction;
        const replyText = c.reply?.translations?.[lang];
        return (
          <article key={c.id} className="jp-po">
            <div className="jp-line-head" style={{ marginBottom: 6 }}>
              <h3>
                {offer?.product ?? c.offer_id}
                <span className="jp-muted" style={{ fontWeight: 400 }}> · {supplier?.name}</span>
              </h3>
              <span className={`jp-badge ${BADGE[c.state]}`}>{t(`cl.${c.state}` as Key)}</span>
            </div>
            <p className="jp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {label("field", c.field)} · {c.reason_translations?.[lang] ?? c.reason}
            </p>
            <div className="jp-field-grid">
              <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
                <span className="jp-message-label">{t("cl.question")}</span>
                {c.text_ja}
              </div>
              {c.translations?.[lang] && (
                <div className="jp-message" style={{ marginBottom: 8 }}>
                  <span className="jp-message-label">{t("cl.translation")}</span>
                  {c.translations[lang]}
                </div>
              )}
            </div>

            {c.state === "draft" && (
              <div className="jp-form-actions">
                <button type="button" className="jp-action jp-primary" disabled={busy === c.id} onClick={() => run(c.id, () => api.approveClarification(c.id))}>
                  <Send aria-hidden />
                  {t("cl.approve")}
                </button>
                <small className="jp-muted">{t("cl.approveNote")}</small>
              </div>
            )}

            {c.state !== "draft" && link && (
              <div className="jp-form-actions" style={{ marginTop: 4 }}>
                <span className="jp-muted" style={{ fontSize: 12 }}>{t("cl.link")}:</span>
                <button
                  type="button"
                  className="jp-action"
                  onClick={() => {
                    copyText(link);
                    setCopied(c.id);
                  }}
                >
                  <Copy aria-hidden />
                  {copied === c.id ? t("cl.copied") : t("cl.copy")}
                </button>
                <a className="jp-action" href={link} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  {t("nt.open")}
                </a>
              </div>
            )}
            {c.state === "sent" && <p className="jp-muted" style={{ fontSize: 12, marginTop: 8 }}>{t("cl.waiting")}</p>}

            {c.reply && (
              <div style={{ marginTop: 10 }}>
                {replyText && (
                  <div className="jp-message" style={{ marginBottom: 8 }}>
                    <span className="jp-message-label">{t("cl.reply")}</span>
                    {replyText}
                  </div>
                )}
                <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
                  <span className="jp-message-label">{t("cl.replyJa")}</span>
                  {c.reply.text_ja}
                </div>
                {c.state === "supplier_replied" && ex && (
                  ex.status === "ok" ? (
                    <div className="jp-form-actions">
                      <span style={{ fontSize: 13 }}>{t("cl.value", { v: fmtValue(ex.value, t("yes"), t("no")) })}</span>
                      <button
                        type="button"
                        className="jp-action jp-primary"
                        disabled={busy === c.id}
                        onClick={() => run(c.id, async () => {
                          await api.applyClarification(c.id, profileId);
                          setDone(c.id);
                        })}
                      >
                        {t("cl.apply", { v: fmtValue(ex.value, t("yes"), t("no")) })}
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12 }}>{t("cl.choose")}</p>
                      <div className="jp-form-actions">
                        {[...new Set([ex.read_1, ex.read_2].filter((v) => v !== null && v !== undefined).map((v) => JSON.stringify(v)))].map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="jp-action"
                            disabled={busy === c.id}
                            onClick={() => run(c.id, async () => {
                              await api.applyClarification(c.id, profileId, JSON.parse(v));
                              setDone(c.id);
                            })}
                          >
                            {t("cl.apply", { v: fmtValue(JSON.parse(v), t("yes"), t("no")) })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {c.state === "replied" && (
              <p className="jp-toast">
                {t("cl.applied", { v: fmtValue(c.applied_value, t("yes"), t("no")) })}
                {done === c.id && ` ${t("cl.impact")}`}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
