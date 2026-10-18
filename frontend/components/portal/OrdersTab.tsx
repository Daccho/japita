"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Store, Truck } from "lucide-react";
import { portalApi, type PortalOrder, type PortalView } from "@/lib/portal";
import { errorMessage, formatDate, formatDateTime, formatQty, ingredientName, packWord } from "./format";
import { useLang } from "./i18n";
import { Button, Card, Chip, EmptyState, ErrorBox, Field, NoteInput } from "./ui";
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
        icon={<ClipboardList aria-hidden />}
        title={t.noOrders}
        body={t.noOrdersBody(props.view.restaurant)}
      />
    );
  }
  return (
    <>
      {sorted.map((o) => (
        <OrderCard key={o.id} order={o} {...props} />
      ))}
    </>
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
      <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span className="jp-kicker">
            {t.orderNumber} {order.id}
          </span>
          <h2 style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Store size={18} aria-hidden style={{ flexShrink: 0 }} />
            {t.orderFrom(order.restaurant)}
          </h2>
          <p className="jp-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {t.received(formatDateTime(order.submitted_at, lang))}
          </p>
        </div>
        {accepted ? (
          <Chip tone="ok" icon={<CheckCircle2 size={12} aria-hidden />}>
            {t.accepted}
          </Chip>
        ) : (
          <Chip tone="warn">{t.awaitingAccept}</Chip>
        )}
      </div>

      <div className="jp-message" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Truck size={16} aria-hidden style={{ flexShrink: 0 }} />
        <span>{accepted ? t.plannedDelivery : t.requestedDelivery}</span>
        <strong style={{ marginLeft: "auto" }}>{formatDate(order.delivery_date, lang)}</strong>
      </div>

      <div style={{ marginTop: 8 }}>
        {order.lines.map((ln) => (
          <div key={`${ln.ingredient}-${ln.product}`} className="jp-row">
            <div>
              <h3>{ln.product}</h3>
              <p>
                {ingredientName(ln.ingredient, lang, { ja: ln.ingredient_ja, en: ln.ingredient_en })} · {ln.packs}{" "}
                {packWord(ln.ingredient, ln.packs, lang)} × {formatQty(ln.pack_size, ln.unit)} ({t.total(formatQty(ln.purchase_qty, ln.unit))})
              </p>
            </div>
            <strong className="jp-number">{fx.money(ln.cost_eur)}</strong>
          </div>
        ))}
      </div>

      <dl className="jp-kv" style={{ borderTop: "1.5px solid var(--aj-line)", paddingTop: 12, marginTop: 4 }}>
        <dt>{t.subtotal}</dt>
        <dd>{fx.money(order.goods_eur)}</dd>
        <dt>{t.shipping}</dt>
        <dd>{order.shipping_eur ? fx.money(order.shipping_eur) : t.free}</dd>
        <dt style={{ color: "var(--aj-ink)", fontWeight: 700, fontSize: 14 }}>{t.grandTotal}</dt>
        <dd style={{ fontWeight: 700, fontSize: 14 }}>{fx.money(order.total_eur)}</dd>
      </dl>

      {accepted && order.acknowledgment && (
        <p className="jp-muted" style={{ fontSize: 12, marginTop: 12 }}>
          {t.acceptedAt(formatDateTime(order.acknowledgment.received_at, lang))}
          {order.acknowledgment.note_ja && (
            <span style={{ display: "block", marginTop: 4, color: "var(--aj-ink)" }}>
              {t.commentPrefix}
              {order.acknowledgment.note_ja}
            </span>
          )}
        </p>
      )}

      {order.delivery_changes.length > 0 && (
        <div className="jp-toast">
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarClock size={14} aria-hidden />
            {t.changeHistory}
          </strong>
          {order.delivery_changes.map((c) => (
            <div key={c.at} style={{ marginTop: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <s className="jp-muted">{formatDate(c.from, lang)}</s>
                <ArrowRight size={13} aria-hidden />
                <strong>{formatDate(c.to, lang)}</strong>
              </span>
              <span className="jp-muted" style={{ marginLeft: 8 }}>
                {formatDateTime(c.at, lang)}
              </span>
              {c.note_ja && <div className="jp-muted">{c.note_ja}</div>}
            </div>
          ))}
        </div>
      )}

      {(!accepted || editing) && (
        <div className="jp-portal-form">
          <Field label={accepted ? t.newDeliveryDate : t.deliveryDate} note={!accepted ? t.requestedDateHint : undefined}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <NoteInput value={note} onChange={setNote} placeholder={accepted ? t.notePlaceholderChange : t.notePlaceholderAccept} />
        </div>
      )}

      <ErrorBox message={error} />

      <div className="jp-form-actions" style={{ marginTop: 14 }}>
        {!accepted && (
          <Button onClick={accept} busy={busy} busyLabel={busyLabel} style={{ width: "100%" }} icon={<CheckCircle2 aria-hidden />}>
            {t.acceptOrder}
          </Button>
        )}
        {accepted && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)} icon={<CalendarClock aria-hidden />}>
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
            <Button onClick={change} busy={busy} busyLabel={busyLabel}>
              {t.sendChange}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
