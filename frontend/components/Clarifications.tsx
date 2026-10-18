"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { api, errorText, type ClarificationsView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, useBump, useToast, useView } from "@/components/live";

// Owner approves the advisor's Japanese question -> the supplier answers in its portal ->
// the owner applies the value read from the reply -> plans recalculate.
export default function Clarifications({ initial }: { initial: ClarificationsView | null }) {
  const { t, lang } = useI18n();
  const bump = useBump();
  const toast = useToast();
  const { data: v } = useView<ClarificationsView>(`/views/clarifications?lang=${lang}`, initial);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    try {
      await fn();
      if (done) toast(done);
      bump();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(null);
    }
  };

  if (!v) return null;
  if (!v.items.length) return <p className="jp-muted" style={{ fontSize: 13 }}>{v.empty_text}</p>;
  const L = (k: string) => v.labels[k] ?? k;

  return (
    <div>
      {v.items.map((c) => (
        <article key={c.id} className="jp-po">
          <div className="jp-line-head" style={{ marginBottom: 6 }}>
            <h3>
              {c.product}
              <span className="jp-muted" style={{ fontWeight: 400 }}> · {c.supplier}</span>
            </h3>
            <Badge tone={c.badge}>{c.state_text}</Badge>
          </div>
          <p className="jp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {c.field_label} · {c.reason}
          </p>
          <div className="jp-field-grid">
            <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
              <span className="jp-message-label">{L("cl.question")}</span>
              {c.question_ja}
            </div>
            {c.translation && (
              <div className="jp-message" style={{ marginBottom: 8 }}>
                <span className="jp-message-label">{L("cl.translation")}</span>
                {c.translation}
              </div>
            )}
          </div>

          {c.can_approve && (
            <div className="jp-form-actions">
              <button type="button" className="jp-action jp-primary" disabled={busy === c.id} onClick={() => run(c.id, () => api.approveClarification(c.id))}>
                <Send aria-hidden />
                {L("cl.approve")}
              </button>
              <small className="jp-muted">{L("cl.approveNote")}</small>
            </div>
          )}
          {c.waiting_text && <p className="jp-muted" style={{ fontSize: 12, marginTop: 8 }}>{c.waiting_text}</p>}

          {c.reply && (
            <div style={{ marginTop: 10 }}>
              {c.reply.translation && (
                <div className="jp-message" style={{ marginBottom: 8 }}>
                  <span className="jp-message-label">{L("cl.reply")}</span>
                  {c.reply.translation}
                </div>
              )}
              <div className="jp-message jp-ja" lang="ja" style={{ marginBottom: 8 }}>
                <span className="jp-message-label">{L("cl.replyJa")}</span>
                {c.reply.text_ja}
              </div>
              {c.choose_text && <p style={{ fontSize: 12 }}>{c.choose_text}</p>}
              {c.choices.length > 0 && (
                <div className="jp-form-actions">
                  {c.value_text && <span style={{ fontSize: 13 }}>{c.value_text}</span>}
                  {c.choices.map((ch, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`jp-action ${c.choices.length === 1 ? "jp-primary" : ""}`}
                      disabled={busy === c.id}
                      onClick={() => run(c.id, () => api.applyClarification(c.id, ch.value === null ? undefined : ch.value), L("cl.impact"))}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {c.applied_text && <p className="jp-toast">{c.applied_text}</p>}
        </article>
      ))}
    </div>
  );
}
