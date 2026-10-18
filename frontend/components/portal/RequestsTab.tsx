"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, MessageSquareText, Send } from "lucide-react";
import { portalApi, type PortalProduct, type PortalRequest } from "@/lib/portal";
import { Badge, EmptyState, useBump } from "@/components/live";
import { errorMessage } from "./format";
import { useLang } from "./i18n";
import { Button, Card, ErrorBox, FieldBlock, NoteInput, fieldError, fieldPayload } from "./ui";
import type { TabProps } from "./types";

/** The backend stores form replies as "[仕入先フォーム入力] label: value"; show them as plain "label: value". */
function prettyReply(reply: string, yes: string, no: string): string {
  return reply
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/: True(?=\n|$)/, `: ${yes}`)
    .replace(/: False(?=\n|$)/, `: ${no}`);
}

export function RequestsTab({ view, onView, notify }: TabProps) {
  const products = new Map(view.products.map((p) => [p.id, p]));
  if (!view.requests.length) {
    return <EmptyState icon={<Inbox aria-hidden />} title={view.empty.requests.title} body={view.empty.requests.body} />;
  }
  return (
    <>
      {view.requests.map((r) => (
        <RequestCard key={r.id} req={r} product={products.get(r.offer_id)} onView={onView} notify={notify} />
      ))}
    </>
  );
}

function RequestCard({ req, product, onView, notify }: { req: PortalRequest; product?: PortalProduct } & Pick<TabProps, "onView" | "notify">) {
  const { t, lang } = useLang();
  const bump = useBump();
  const [value, setValue] = useState<string | boolean | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replied = req.state !== "awaiting_reply";

  const submit = async () => {
    setError(null);
    const payload = fieldPayload(req.form, value);
    const noteJa = note.trim();
    if (payload === undefined && !noteJa) {
      setError(t.enterReply);
      return;
    }
    const invalid = fieldError(req.form, value, t, lang);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      // Notes are always sent as note_ja: the backend translates them for the restaurant.
      onView(await portalApi.reply(req.id, { ...(payload !== undefined && { value: payload }), ...(noteJa && { note_ja: noteJa }) }));
      notify(t.replySent);
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
      bump();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          {product && <span className="jp-kicker">{product.ingredient_name}</span>}
          <h2 style={{ marginTop: 4 }}>{product?.product ?? t.product}</h2>
        </div>
        <Badge tone={req.badge} style={{ flexShrink: 0 }}>
          {req.badge === "ok" && <CheckCircle2 size={12} aria-hidden />}
          {req.state_text}
        </Badge>
      </div>

      <div className="jp-message">
        <span className="jp-message-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MessageSquareText size={13} aria-hidden />
          {req.sent_text}
        </span>
        {req.question}
      </div>

      {replied ? (
        <div className="jp-toast">
          <strong>{t.yourReply}</strong>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{req.reply_ja ? prettyReply(req.reply_ja, t.yes, t.no) : t.sent}</div>
          {req.next_step_text && (
            <p className="jp-muted" style={{ fontSize: 12, marginTop: 6 }}>
              {req.next_step_text}
            </p>
          )}
        </div>
      ) : (
        <div className="jp-portal-form">
          <FieldBlock field={req.form} value={value} onChange={setValue} />
          <NoteInput value={note} onChange={setNote} />
          <ErrorBox message={error} />
          <Button onClick={submit} busy={busy} busyLabel={note.trim() ? t.sendingTranslating : t.sending} icon={<Send aria-hidden />} style={{ width: "100%" }}>
            {t.sendReply}
          </Button>
        </div>
      )}
    </Card>
  );
}
