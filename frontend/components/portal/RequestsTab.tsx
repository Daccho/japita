"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, MessageSquareText, Send } from "lucide-react";
import { portalApi, PortalError, type PortalProduct, type PortalRequest } from "@/lib/portal";
import { errorMessage, formatDateTime, ingredientName } from "./format";
import { useLang } from "./i18n";
import { Button, Card, Chip, EmptyState, ErrorBox, FieldBlock, NoteInput, fieldError, fieldPayload } from "./ui";
import type { TabProps } from "./types";

/** The backend stores form replies as "[仕入先フォーム入力] label: value"; show them as plain "label: value". */
function prettyReply(reply: string, yes: string, no: string): string {
  return reply
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/: True(?=\n|$)/, `: ${yes}`)
    .replace(/: False(?=\n|$)/, `: ${no}`);
}

export function RequestsTab({ view, reload, notify }: TabProps) {
  const { t } = useLang();
  const products = new Map(view.products.map((p) => [p.id, p]));
  const sorted = [...view.requests].sort(
    (a, b) => Number(a.state === "replied") - Number(b.state === "replied") || (b.sent_at ?? "").localeCompare(a.sent_at ?? ""),
  );
  if (!sorted.length) {
    return (
      <EmptyState icon={<Inbox aria-hidden />} title={t.noRequests} body={t.noRequestsBody(view.restaurant)} />
    );
  }
  return (
    <>
      {sorted.map((r) => (
        <RequestCard key={r.id} req={r} product={products.get(r.offer_id)} reload={reload} notify={notify} />
      ))}
    </>
  );
}

function RequestCard({
  req,
  product,
  reload,
  notify,
}: {
  req: PortalRequest;
  product?: PortalProduct;
  reload: TabProps["reload"];
  notify: TabProps["notify"];
}) {
  const { t, lang } = useLang();
  const [value, setValue] = useState<string | boolean | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replied = req.state === "replied";
  const question = lang === "en" && req.question_en ? req.question_en : req.question_ja;

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
      await portalApi.reply(req.token, { ...(payload !== undefined && { value: payload }), ...(noteJa && { note_ja: noteJa }) });
      notify(t.replySent);
      await reload();
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
      if (e instanceof PortalError && e.status === 409) await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          {product && (
            <span className="jp-kicker">
              {ingredientName(product.ingredient, lang, { ja: product.ingredient_ja, en: product.ingredient_en })}
            </span>
          )}
          <h2 style={{ marginTop: 4 }}>{product?.product ?? t.product}</h2>
        </div>
        {replied ? (
          <Chip tone="ok" icon={<CheckCircle2 size={12} aria-hidden />}>
            {t.replied}
          </Chip>
        ) : (
          <Chip tone="warn">{t.awaitingReply}</Chip>
        )}
      </div>

      <div className="jp-message">
        <span className="jp-message-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MessageSquareText size={13} aria-hidden />
          {t.questionFrom(formatDateTime(req.sent_at, lang))}
        </span>
        {question}
      </div>

      {replied ? (
        <div className="jp-toast">
          <strong>{t.yourReply}</strong>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{req.reply_ja ? prettyReply(req.reply_ja, t.yes, t.no) : t.sent}</div>
        </div>
      ) : (
        <div className="jp-portal-form">
          <FieldBlock field={req.form} value={value} onChange={setValue} />
          <NoteInput value={note} onChange={setNote} />
          <ErrorBox message={error} />
          <Button
            onClick={submit}
            busy={busy}
            busyLabel={note.trim() ? t.sendingTranslating : t.sending}
            icon={<Send aria-hidden />}
            style={{ width: "100%" }}
          >
            {t.sendReply}
          </Button>
        </div>
      )}
    </Card>
  );
}
