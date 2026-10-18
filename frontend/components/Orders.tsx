"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock, Send } from "lucide-react";
import Link from "next/link";
import { api, errorCodeOf, errorText, type PurchaseOrderView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, useBump, useToast } from "@/components/live";

// Supplier orders created by a plan approval: send each one, then follow the supplier's confirmation.
export default function Orders({ orders }: { orders: PurchaseOrderView[] }) {
  const { t } = useI18n();
  const bump = useBump();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [reapprove, setReapprove] = useState(false);

  const submit = async (po: PurchaseOrderView) => {
    setBusy(po.id);
    setReapprove(false);
    try {
      await api.submitOrder(po.id, po.submit_key ?? po.id);
      bump();
    } catch (e) {
      toast(errorText(e, t), "error");
      setReapprove(errorCodeOf(e) === "basket_changed_reapprove");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {reapprove && (
        <p className="jp-error">
          <Link href="/restaurants/basket#approve">{t("err.reapprove")}</Link>
        </p>
      )}
      {orders.map((po) => (
        <article key={po.id} className="jp-po">
          <div className="jp-line-head" style={{ marginBottom: 8 }}>
            <h3>{po.supplier}</h3>
            <Badge tone={po.badge}>
              {po.state === "acknowledged" ? <Check size={12} aria-hidden /> : po.state === "submitted" ? <Clock size={12} aria-hidden /> : null}
              {po.state_text}
            </Badge>
          </div>
          {po.lines.map((ln) => (
            <p key={ln.offer_id} className="jp-muted" style={{ fontSize: 12, margin: "3px 0" }}>
              {ln.text}
            </p>
          ))}
          <div className="jp-line-head" style={{ margin: "10px 0 0" }}>
            <span className="jp-proof" style={{ margin: 0 }}>
              <CalendarDays aria-hidden />
              <span>{po.delivery_text}</span>
            </span>
            <strong className="jp-number" style={{ fontWeight: 700 }}>
              {po.total_text}
            </strong>
          </div>
          {po.changes.map((ch, i) => (
            <div key={i} className="jp-toast" style={{ borderLeftColor: "var(--jp-warn)" }}>
              {ch.text}
              {ch.note && <div style={{ marginTop: 4 }}>“{ch.note}”</div>}
            </div>
          ))}
          {po.note && (
            <div className="jp-message" style={{ marginTop: 10 }}>
              <span className="jp-message-label">{po.note_label}</span>
              {po.note}
            </div>
          )}
          {po.can_submit && (
            <button type="button" className="jp-action jp-primary" style={{ marginTop: 12 }} disabled={busy === po.id} onClick={() => submit(po)}>
              <Send aria-hidden />
              {busy === po.id ? po.sending_text : po.submit_text}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
