"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, ClipboardList, Package, Truck } from "lucide-react";
import { portalApi, type PortalOrder, type PortalView } from "@/lib/portal";
import { errorMessage, formatDate, formatDateTime, formatEur, formatQty, ingredientName, packWord } from "./format";
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
  const { t, lang } = useLang();
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
          <p className="text-xs text-[#657068]">{t.orderNumber}</p>
          <h3 className="text-lg font-bold tracking-wide text-[#23312b]">{order.id}</h3>
          <p className="mt-0.5 text-xs text-[#657068]">{t.received(formatDateTime(order.submitted_at, lang))}</p>
        </div>
        {accepted ? (
          <Chip tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>
            {t.accepted}
          </Chip>
        ) : (
          <Chip tone="warn">{t.awaitingAccept}</Chip>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#eef2e9] px-3 py-2.5 text-[#23312b]">
        <Truck className="h-4 w-4 shrink-0 text-[#335b45]" aria-hidden />
        <span className="text-sm">{accepted ? t.plannedDelivery : t.requestedDelivery}</span>
        <span className="ml-auto font-bold">{formatDate(order.delivery_date, lang)}</span>
      </div>

      <ul className="mt-3 divide-y divide-[#edf0ea]">
        {order.lines.map((ln) => (
          <li key={`${ln.ingredient}-${ln.product}`} className="flex items-start gap-3 py-2.5">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#657068]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug text-[#23312b]">{ln.product}</p>
              <p className="mt-0.5 text-sm text-[#657068]">
                <span className="mr-2">{ingredientName(ln.ingredient, lang, { ja: ln.ingredient_ja, en: ln.ingredient_en })}</span>
                <span className="whitespace-nowrap">
                  {ln.packs} {packWord(ln.ingredient, ln.packs, lang)} × {formatQty(ln.pack_size, ln.unit)}
                </span>
                <span className="ml-1 whitespace-nowrap">({t.total(formatQty(ln.purchase_qty, ln.unit))})</span>
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-[#23312b]">{formatEur(ln.cost_eur)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-1 space-y-1 border-t border-[#e0e5dc] pt-3 text-sm">
        <div className="flex justify-between text-[#657068]">
          <dt>{t.subtotal}</dt>
          <dd className="tabular-nums">{formatEur(order.goods_eur)}</dd>
        </div>
        <div className="flex justify-between text-[#657068]">
          <dt>{t.shipping}</dt>
          <dd className="tabular-nums">{order.shipping_eur ? formatEur(order.shipping_eur) : t.free}</dd>
        </div>
        <div className="flex justify-between pt-1 text-base font-bold text-[#23312b]">
          <dt>{t.grandTotal}</dt>
          <dd className="tabular-nums">{formatEur(order.total_eur)}</dd>
        </div>
      </dl>

      {accepted && order.acknowledgment && (
        <p className="mt-3 text-xs text-[#657068]">
          {t.acceptedAt(formatDateTime(order.acknowledgment.received_at, lang))}
          {order.acknowledgment.note_ja && (
            <span className="mt-1 block text-[#23312b]">
              {t.commentPrefix}
              {order.acknowledgment.note_ja}
            </span>
          )}
        </p>
      )}

      {order.delivery_changes.length > 0 && (
        <div className="mt-3 rounded-lg border border-[#e0e5dc] p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-[#657068]">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {t.changeHistory}
          </p>
          <ol className="mt-2 space-y-2">
            {order.delivery_changes.map((c) => (
              <li key={c.at} className="text-sm">
                <span className="inline-flex items-center gap-1 text-[#23312b]">
                  <span className="text-[#657068] line-through">{formatDate(c.from, lang)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#657068]" aria-hidden />
                  <span className="font-bold">{formatDate(c.to, lang)}</span>
                </span>
                <span className="ml-2 text-xs text-[#657068]">{formatDateTime(c.at, lang)}</span>
                {c.note_ja && <p className="mt-0.5 text-xs text-[#657068]">{c.note_ja}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {(!accepted || editing) && (
        <div className="mt-4 space-y-4 border-t border-[#e0e5dc] pt-4">
          <label className="block">
            <Label>{accepted ? t.newDeliveryDate : t.deliveryDate}</Label>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#657068]"
                aria-hidden
              />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} pl-9`} />
            </div>
            {!accepted && <span className="mt-1 block text-xs text-[#657068]">{t.requestedDateHint}</span>}
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
