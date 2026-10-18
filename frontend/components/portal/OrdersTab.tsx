"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Package, Truck } from "lucide-react";
import { portalApi, type PortalOrder, type PortalView } from "@/lib/portal";
import { errorMessage, formatDate, formatDateTime, formatQty, ingredientName, packWord } from "./format";
import { useLang } from "./i18n";
import { Button, Card, Chip, EmptyState, ErrorBox, Label, NoteInput, inputClass } from "./ui";
import type { TabProps } from "./types";

export function OrdersTab(props: TabProps) {
  const { t } = useLang();
  const sorted = [...props.view.orders].sort(
    (a, b) =>
      Number(a.state === "acknowledged") - Number(b.state === "acknowledged") ||
      (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""),
  );
  if (!sorted.length) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" aria-hidden />}
        title={t.noOrders}
        body={t.noOrdersBody(props.view.restaurant)}
      />
    );
  }
  return (
    <div className="space-y-4">
      {sorted.map((o) => (
        <OrderCard key={o.id} order={o} {...props} />
      ))}
    </div>
  );
}

function OrderCard({ order, token, onView, notify }: TabProps & { order: PortalOrder }) {
  const { t, lang, fx } = useLang();
  const accepted = order.state === "acknowledged";
  const [date, setDate] = useState(order.delivery_date);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<PortalView>, done: string) => {
    setError(null);
    if (!date) {
      setError(t.pickDate);
      return;
    }
    setBusy(true);
    try {
      onView(await action());
      setNote("");
      setEditing(false);
      notify(done);
    } catch (e) {
      setError(errorMessage(e, lang, t.genericError));
    } finally {
      setBusy(false);
    }
  };

  // Notes are always sent as note_ja: the backend translates them for the restaurant.
  const noteJa = note.trim() || undefined;
  const accept = () => run(() => portalApi.accept(token, order.id, { delivery_date: date, note_ja: noteJa }), t.orderAccepted);
  const change = () => {
    if (date === order.delivery_date) {
      setError(t.sameDate);
      return;
    }
    run(() => portalApi.changeDelivery(token, order.id, { delivery_date: date, note_ja: noteJa }), t.deliveryChanged);
  };
  const busyLabel = noteJa ? t.sendingTranslating : t.sending;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-aj-muted">{t.orderNumber}</p>
          <h3 className="text-lg font-bold tracking-wide text-aj-ink">{order.id}</h3>
          <p className="mt-0.5 text-xs text-aj-muted">{t.received(formatDateTime(order.submitted_at, lang))}</p>
        </div>
        {accepted ? (
          <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>
            {t.accepted}
          </Chip>
        ) : (
          <Chip tone="warn">{t.awaitingAccept}</Chip>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-aj-yolk-tint px-3 py-2.5 text-aj-ink">
        <Truck className="h-4 w-4 shrink-0 text-aj-ink" aria-hidden />
        <span className="text-sm">{accepted ? t.plannedDelivery : t.requestedDelivery}</span>
        <span className="ml-auto font-bold">{formatDate(order.delivery_date, lang)}</span>
      </div>

      <ul className="mt-3 divide-y divide-aj-line">
        {order.lines.map((ln) => (
          <li key={`${ln.ingredient}-${ln.product}`} className="flex items-start gap-3 py-2.5">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-aj-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug text-aj-ink">{ln.product}</p>
              <p className="mt-0.5 text-sm text-aj-muted">
                <span className="mr-2">{ingredientName(ln.ingredient, lang, { ja: ln.ingredient_ja, en: ln.ingredient_en })}</span>
                <span className="whitespace-nowrap">
                  {ln.packs} {packWord(ln.ingredient, ln.packs, lang)} × {formatQty(ln.pack_size, ln.unit)}
                </span>
                <span className="ml-1 whitespace-nowrap">({t.total(formatQty(ln.purchase_qty, ln.unit))})</span>
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-aj-ink">{fx.money(ln.cost_eur)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-1 space-y-1 border-t border-aj-line pt-3 text-sm">
        <div className="flex justify-between text-aj-muted">
          <dt>{t.subtotal}</dt>
          <dd className="tabular-nums">{fx.money(order.goods_eur)}</dd>
        </div>
        <div className="flex justify-between text-aj-muted">
          <dt>{t.shipping}</dt>
          <dd className="tabular-nums">{order.shipping_eur ? fx.money(order.shipping_eur) : t.free}</dd>
        </div>
        <div className="flex justify-between pt-1 text-base font-bold text-aj-ink">
          <dt>{t.grandTotal}</dt>
          <dd className="tabular-nums">{fx.money(order.total_eur)}</dd>
        </div>
      </dl>

      {accepted && order.acknowledgment && (
        <p className="mt-3 text-xs text-aj-muted">
          {t.acceptedAt(formatDateTime(order.acknowledgment.received_at, lang))}
          {order.acknowledgment.note_ja && (
            <span className="mt-1 block text-aj-ink">
              {t.commentPrefix}
              {order.acknowledgment.note_ja}
            </span>
          )}
        </p>
      )}

      {order.delivery_changes.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-aj-line p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-aj-muted">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {t.changeHistory}
          </p>
          <ol className="mt-2 space-y-2">
            {order.delivery_changes.map((c) => (
              <li key={c.at} className="text-sm">
                <span className="inline-flex items-center gap-1 text-aj-ink">
                  <span className="text-aj-muted line-through">{formatDate(c.from, lang)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-aj-muted" aria-hidden />
                  <span className="font-bold">{formatDate(c.to, lang)}</span>
                </span>
                <span className="ml-2 text-xs text-aj-muted">{formatDateTime(c.at, lang)}</span>
                {c.note_ja && <p className="mt-0.5 text-xs text-aj-muted">{c.note_ja}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {(!accepted || editing) && (
        <div className="mt-4 space-y-4 border-t border-aj-line pt-4">
          <label className="block">
            <Label>{accepted ? t.newDeliveryDate : t.deliveryDate}</Label>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aj-muted"
                aria-hidden
              />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
            {!accepted && <span className="mt-1 block text-xs text-aj-muted">{t.requestedDateHint}</span>}
          </label>
          <NoteInput value={note} onChange={setNote} placeholder={accepted ? t.notePlaceholderChange : t.notePlaceholderAccept} />
        </div>
      )}

      <ErrorBox message={error} />

      <div className="mt-4 flex gap-2">
        {!accepted && (
          <Button
            onClick={accept}
            busy={busy}
            busyLabel={busyLabel}
            className="w-full"
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
          >
            {t.acceptOrder}
          </Button>
        )}
        {accepted && !editing && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setEditing(true)}
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          >
            {t.changeDelivery}
          </Button>
        )}
        {accepted && editing && (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setDate(order.delivery_date);
                setError(null);
              }}
              disabled={busy}
            >
              {t.cancel}
            </Button>
            <Button onClick={change} busy={busy} busyLabel={busyLabel} className="flex-1">
              {t.sendChange}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
