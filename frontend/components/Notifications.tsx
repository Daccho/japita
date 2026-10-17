"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { qty } from "@/lib/api";
import { useDates, useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

type Item = { id: string; badge: string; warn: boolean; title: string; body: string; href: string; action: string };

const SEEN_KEY = "japita.notifications.seen";

// Everything that needs the owner's attention, derived from backend data (stock timeline, supplier activity).
function useItems(): Item[] {
  const { data } = useWorkspace();
  const { t } = useI18n();
  const label = useLabel();
  const d = useDates();
  {
    if (!data) return [];
    const { state, timeline } = data;
    const items: Item[] = [];
    const sup = (id: string) => state.suppliers[id]?.name ?? id;
    const stockouts = timeline.ingredients ?? {};
    const alerted = new Set<string>();
    for (const dl of state.week.deliveries ?? []) {
      const tl = stockouts[dl.ingredient];
      if (dl.status !== "delayed" || !tl?.first_stockout) continue;
      alerted.add(dl.ingredient);
      items.push({
        id: `delay-${dl.id}-${tl.first_stockout}`,
        badge: t("nt.delivery"),
        warn: true,
        title: t("nt.delayed", { weekday: d.weekday(dl.date), ingredient: label("ing", dl.ingredient) }),
        body: t("nt.delayedBody", {
          supplier: sup(dl.supplier_id),
          date: d.day(dl.date),
          qty: qty(dl.qty, dl.unit),
          revised: d.day(dl.revised_date),
          ingredient: label("ing", dl.ingredient),
          stockout: d.day(tl.first_stockout),
        }),
        href: "/restaurants/basket",
        action: t("nt.compare"),
      });
    }
    for (const tl of Object.values(stockouts)) {
      if (!tl.first_stockout || alerted.has(tl.ingredient)) continue;
      items.push({
        id: `stockout-${tl.ingredient}-${tl.first_stockout}`,
        badge: t("nt.stockout"),
        warn: true,
        title: t("nt.stockoutTitle", { ingredient: label("ing", tl.ingredient), date: d.day(tl.first_stockout) }),
        body: t("nt.stockoutBody", { qty: qty(tl.total_shortfall, tl.unit) }),
        href: "/restaurants/basket",
        action: t("nt.compare"),
      });
    }
    for (const c of state.clarifications) {
      if (c.state !== "supplier_replied") continue;
      const offer = state.offers.find((o) => o.id === c.offer_id);
      items.push({
        id: `reply-${c.id}`,
        badge: t("nt.reply"),
        warn: false,
        title: offer?.product ?? c.offer_id,
        body: t("nt.replyBody", { supplier: offer ? sup(offer.supplier_id) : "", product: offer?.product ?? "" }),
        href: "/restaurants/basket",
        action: t("nt.open"),
      });
    }
    for (const o of state.offers) {
      if (!o.pending_update) continue;
      items.push({
        id: `proposal-${o.id}-${o.pending_update.submitted_at}`,
        badge: t("nt.proposal"),
        warn: false,
        title: o.product,
        body: t(o.pending_new ? "nt.newProduct" : "nt.proposalBody", { supplier: sup(o.supplier_id), product: o.product }),
        href: `/restaurants/suppliers?supplier=${o.supplier_id}`,
        action: t("nt.open"),
      });
    }
    for (const po of state.purchase_orders ?? []) {
      (po.delivery_changes ?? []).forEach((ch, i) =>
        items.push({
          id: `change-${po.id}-${i}`,
          badge: t("nt.change"),
          warn: true,
          title: po.supplier_name,
          body: t("nt.changeBody", { supplier: po.supplier_name, from: d.day(ch.from), to: d.day(ch.to) }),
          href: "/restaurants",
          action: t("nt.open"),
        }),
      );
      if (po.state === "acknowledged")
        items.push({
          id: `ack-${po.id}`,
          badge: t("nt.ack"),
          warn: false,
          title: po.supplier_name,
          body: t("nt.ackBody", { supplier: po.supplier_name, date: d.day(po.delivery_date) }),
          href: "/restaurants",
          action: t("nt.open"),
        });
    }
    return items;
  }
}

export default function Notifications() {
  const { t } = useI18n();
  const items = useItems();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
    } catch {}
  }, []);

  const idsKey = items.map((i) => i.id).join("|");
  useEffect(() => {
    if (!open) return;
    const ids = idsKey ? idsKey.split("|") : [];
    setSeen(ids);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {}
  }, [open, idsKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unread = items.filter((i) => !seen.includes(i.id)).length;

  return (
    <div ref={ref} style={{ display: "contents" }}>
      <button
        type="button"
        className="jp-notification-bell"
        aria-label={unread ? t("nt.aria", { n: unread }) : t("nt.title")}
        aria-expanded={open}
        aria-controls="jp-notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell aria-hidden />
        {unread > 0 && (
          <span className="jp-unread" aria-hidden>
            {unread}
          </span>
        )}
      </button>
      <section className="jp-notifications" id="jp-notifications" aria-label={t("nt.title")} hidden={!open}>
        <div className="jp-line-head">
          <h3>{t("nt.title")}</h3>
          <button type="button" className="jp-close" aria-label={t("nt.close")} onClick={() => setOpen(false)}>
            <X aria-hidden />
          </button>
        </div>
        {items.length === 0 && <p>{t("nt.none")}</p>}
        {items.map((i) => (
          <div key={i.id} className="jp-notification-item">
            <span className={`jp-badge ${i.warn ? "jp-warning" : ""}`}>{i.badge}</span>
            <h3 style={{ marginTop: 10 }}>{i.title}</h3>
            <p>{i.body}</p>
            <Link href={i.href} className="jp-action" onClick={() => setOpen(false)}>
              {i.action}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
