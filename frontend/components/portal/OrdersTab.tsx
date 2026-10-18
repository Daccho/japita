"use client";

import { useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Truck } from "lucide-react";
import { portalApi, type PortalOrder, type PortalView } from "@/lib/portal";
import { Avatar } from "@/components/AppShell";
import { Badge, EmptyState } from "@/components/live";
import { errorMessage } from "./format";
import { useLang } from "./i18n";
import { Button, Card, ErrorBox, Field, NoteInput } from "./ui";
import type { TabProps } from "./types";

export function OrdersTab(props: TabProps) {
  const { view } = props;
  if (!view.orders.length) {
    return <EmptyState icon={<ClipboardList aria-hidden />} title={view.empty.orders.title} body={view.empty.orders.body} />;
  }
  return (
    <>
      {view.orders.map((o) => (
        <OrderCard key={o.id} order={o} {...props} />
      ))}
    </>
  );
}

function OrderCard({ order, view, onView, notify }: TabProps & { order: PortalOrder }) {
  const { t, lang } = useLang();
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
  const accept = () => run(() => portalApi.accept(order.id, { delivery_date: date, note_ja: noteJa }), t.orderAccepted);
  const change = () => run(() => portalApi.changeDelivery(order.id, { delivery_date: date, note_ja: noteJa }), t.deliveryChanged);
  const busyLabel = noteJa ? t.sendingTranslating : t.sending;
  const accepted = order.can_change_delivery;

  return (
    <Card>
      <div className="jp-line-head" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <span className="jp-kicker">{order.number_text}</span>
          <h2 className="jp-name-with-avatar" style={{ marginTop: 4 }}>
            <Avatar avatar={view.restaurant_avatar} name={view.restaurant_name ?? view.restaurant} size={28} />
            <span>{order.title}</span>
          </h2>
          <p className="jp-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {order.received_text}
          </p>
        </div>
        <Badge tone={order.badge} style={{ flexShrink: 0 }}>
          {order.badge === "ok" && <CheckCircle2 size={12} aria-hidden />}
          {order.state_text}
        </Badge>
      </div>

      <div className="jp-message" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Truck size={16} aria-hidden style={{ flexShrink: 0 }} />
        <span>{order.delivery_label}</span>
        <strong style={{ marginLeft: "auto" }}>{order.delivery_text}</strong>
      </div>

      <div style={{ marginTop: 8 }}>
        {order.lines.map((ln) => (
          <div key={`${ln.ingredient}-${ln.product}`} className="jp-row">
            <div>
              <h3>{ln.product}</h3>
              <p>{ln.qty_text}</p>
            </div>
            <strong className="jp-number">{ln.cost_text}</strong>
          </div>
        ))}
      </div>

      <dl className="jp-kv" style={{ borderTop: "1.5px solid var(--aj-line)", paddingTop: 12, marginTop: 4 }}>
        <dt>{t.subtotal}</dt>
        <dd>{order.goods_text}</dd>
        <dt>{t.shipping}</dt>
        <dd>{order.shipping_text}</dd>
        <dt style={{ color: "var(--aj-ink)", fontWeight: 700, fontSize: 14 }}>{t.grandTotal}</dt>
        <dd style={{ fontWeight: 700, fontSize: 14 }}>{order.total_text}</dd>
      </dl>

      {order.accepted_text && (
        <p className="jp-muted" style={{ fontSize: 12, marginTop: 12 }}>
          {order.accepted_text}
          {order.acknowledgment?.note_ja && (
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
                <s className="jp-muted">{c.from_text}</s>
                <ArrowRight size={13} aria-hidden />
                <strong>{c.to_text}</strong>
              </span>
              <span className="jp-muted" style={{ marginLeft: 8 }}>
                {c.at_text}
              </span>
              {c.note_ja && <div className="jp-muted">{c.note_ja}</div>}
            </div>
          ))}
        </div>
      )}

      {(order.can_accept || editing) && (
        <div className="jp-portal-form">
          <Field label={accepted ? t.newDeliveryDate : t.deliveryDate} note={!accepted ? t.requestedDateHint : undefined}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <NoteInput value={note} onChange={setNote} placeholder={accepted ? t.notePlaceholderChange : t.notePlaceholderAccept} />
        </div>
      )}

      <ErrorBox message={error} />

      <div className="jp-form-actions" style={{ marginTop: 14 }}>
        {order.can_accept && (
          <Button onClick={accept} busy={busy} busyLabel={busyLabel} style={{ width: "100%" }} icon={<CheckCircle2 aria-hidden />}>
            {t.acceptOrder}
          </Button>
        )}
        {order.can_change_delivery && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)} icon={<CalendarClock aria-hidden />}>
            {t.changeDelivery}
          </Button>
        )}
        {order.can_change_delivery && editing && (
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
