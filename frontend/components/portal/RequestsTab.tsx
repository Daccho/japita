"use client";

import { useState } from "react";
import { CheckCircle2, Inbox, MessageSquareText, Send } from "lucide-react";
import { portalApi, PortalError, type PortalProduct, type PortalRequest } from "@/lib/portal";
import { errorMessage, fieldLabel, formatDateTime, ingredientName } from "./format";
import { useLang } from "./i18n";
import { Button, Card, Chip, EmptyState, ErrorBox, FieldInput, Label, NoteInput, fieldError, fieldPayload } from "./ui";
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
      <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden />} title={t.noRequests} body={t.noRequestsBody(view.restaurant)} />
    );
  }
  return (
    <div className="space-y-4">
      {sorted.map((r) => (
        <RequestCard key={r.id} req={r} product={products.get(r.offer_id)} reload={reload} notify={notify} />
      ))}
    </div>
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {product && (
            <p className="text-xs font-bold text-aj-muted">
              {ingredientName(product.ingredient, lang, { ja: product.ingredient_ja, en: product.ingredient_en })}
            </p>
          )}
          <h3 className="mt-0.5 font-bold leading-snug text-aj-ink">{product?.product ?? t.product}</h3>
        </div>
        {replied ? (
          <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>
            {t.replied}
          </Chip>
        ) : (
          <Chip tone="warn">{t.awaitingReply}</Chip>
        )}
      </div>

      <div className="mt-3 rounded-[10px] bg-aj-page p-3">
        <p className="flex items-center gap-1.5 text-xs text-aj-muted">
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
          {t.questionFrom(formatDateTime(req.sent_at, lang))}
        </p>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-aj-ink">{question}</p>
      </div>

      {replied ? (
        <div className="mt-3 border-l-4 border-aj-ink pl-3">
          <p className="text-xs font-bold text-aj-ink">{t.yourReply}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-aj-ink">{req.reply_ja ? prettyReply(req.reply_ja, t.yes, t.no) : t.sent}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <Label>{fieldLabel(req.form, lang)}</Label>
            <FieldInput field={req.form} value={value} onChange={setValue} />
          </div>
          <NoteInput value={note} onChange={setNote} />
          <ErrorBox message={error} />
          <Button
            onClick={submit}
            busy={busy}
            busyLabel={note.trim() ? t.sendingTranslating : t.sending}
            icon={<Send className="h-4 w-4" aria-hidden />}
            className="w-full"
          >
            {t.sendReply}
          </Button>
        </div>
      )}
    </Card>
  );
}
