"use client";

import { useState } from "react";
import { CalendarDays, Check, Clock, Send } from "lucide-react";
import Link from "next/link";
import { api, errorCodeOf, errorText, qty, type PurchaseOrder } from "@/lib/api";
import { useDates, useI18n, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { idempotencyKey } from "@/components/helpers";

const STATE_KEY: Record<PurchaseOrder["state"], Key> = {
  approved: "po.approved",
  submitted: "po.submitted",
  acknowledged: "po.acknowledged",
  cancelled: "po.cancelled",
};

// Supplier orders created by a basket approval: send each one, then follow the supplier's confirmation.
export default function Orders({ orders, canSubmit }: { orders: PurchaseOrder[]; canSubmit: boolean }) {
  const { t, lang, money } = useI18n();
  const d = useDates();
  const { refresh } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; reapprove: boolean } | null>(null);

  const submit = async (po: PurchaseOrder) => {
    setBusy(po.id);
    setError(null);
    try {
      await api.submitOrder(po.id, idempotencyKey(po.id));
      await refresh();
    } catch (e) {
      setError({ text: errorText(e, t), reapprove: errorCodeOf(e) === "basket_changed_reapprove" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {error && (
        <p className="jp-error">
          {error.text}
          {error.reapprove && (
            <>
              {" "}
              <Link href="/restaurants/basket#approve" onClick={() => document.getElementById("approve")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                {t("err.reapprove")}
              </Link>
            </>
          )}
        </p>
      )}
      {orders.map((po) => {
        const ack = po.acknowledgment;
        const note = ack?.note_translations?.[lang];
        return (
          <article key={po.id} className="jp-po">
            <div className="jp-line-head" style={{ marginBottom: 8 }}>
              <h3>{po.supplier_name}</h3>
              <span className={`jp-badge ${po.state === "submitted" ? "jp-warning" : po.state === "cancelled" ? "jp-neutral" : ""}`}>
                {po.state === "acknowledged" ? <Check size={12} aria-hidden /> : po.state === "submitted" ? <Clock size={12} aria-hidden /> : null}
                {t(STATE_KEY[po.state])}
              </span>
            </div>
            {po.lines.map((ln) => (
              <p key={ln.offer_id} className="jp-muted" style={{ fontSize: 12, margin: "3px 0" }}>
                {ln.product} · {ln.packs} × {qty(ln.pack_size, ln.unit)} = {qty(ln.purchase_qty, ln.unit)} · {money(ln.cost_eur)}
              </p>
            ))}
            <div className="jp-line-head" style={{ margin: "10px 0 0" }}>
              <span className="jp-proof" style={{ margin: 0 }}>
                <CalendarDays aria-hidden />
                <span>{t("po.delivery", { date: d.day(po.delivery_date) })}</span>
              </span>
              <strong className="jp-number" style={{ fontWeight: 700 }}>
                {money(po.total_eur)}
              </strong>
            </div>
            {(po.delivery_changes ?? []).map((ch, i) => (
              <div key={i} className="jp-toast" style={{ borderLeftColor: "var(--jp-warn)" }}>
                {t("po.changed", { from: d.day(ch.from), to: d.day(ch.to) })}
                {ch.note_translations?.[lang] && <div style={{ marginTop: 4 }}>“{ch.note_translations[lang]}”</div>}
              </div>
            ))}
            {note && (
              <div className="jp-message" style={{ marginTop: 10 }}>
                <span className="jp-message-label">{t("po.note")}</span>
                {note}
              </div>
            )}
            {po.state === "approved" && canSubmit && (
              <button type="button" className="jp-action jp-primary" style={{ marginTop: 12 }} disabled={busy === po.id} onClick={() => submit(po)}>
                <Send aria-hidden />
                {busy === po.id ? t("po.sending") : t("po.submit")}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
