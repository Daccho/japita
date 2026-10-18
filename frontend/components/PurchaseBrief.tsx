"use client";

import Link from "next/link";
import { money, qty } from "@/lib/api";
import { useDates, useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

export default function PurchaseBrief() {
  const { data } = useWorkspace();
  const { t } = useI18n();
  const label = useLabel();
  const dates = useDates();
  const brief = data?.brief;
  if (!brief) return null;
  const basket = brief.recommended;
  return <div className="jp-recommendation" style={{ paddingTop: 0, borderTop: 0 }}>
    <span className="jp-kicker">{t("adv.brief")}</span>
    {brief.risks.map((risk) => <div className="jp-quote" key={risk.ingredient}>
      <strong>{t("adv.deadline", { ingredient: label("ing", risk.ingredient), qty: qty(risk.first_shortfall, risk.unit), date: dates.day(risk.date) })}</strong>
      <p>{t("adv.weekShort", { qty: qty(risk.total_shortfall, risk.unit) })}</p>
    </div>)}
    {!brief.timing_known && <p className="jp-error">{t("adv.unknownTiming")}</p>}
    {!basket && <p>{t(brief.nothing_to_buy ? "wk.allClear" : "adv.noSafe")}</p>}
    {!basket && !brief.nothing_to_buy && brief.excluded.map((offer) => <details key={offer.offer_id}>
      <summary>{offer.product}</summary>{offer.reasons.map((reason) => <p key={reason}>{reason}</p>)}
      <Link className="jp-action" href={`/restaurants/suppliers?supplier=${data.state.offers.find((o) => o.id === offer.offer_id)?.supplier_id ?? ""}`}>{t("sup.view")}</Link>
    </details>)}
    {basket && <>
      <h3>{label("kind", basket.kind)}</h3>
      <div className="jp-price jp-number">{money(basket.delivered_total_eur)}</div>
      <small>{t("bk.goodsShipping", { g: money(basket.goods_eur), s: money(basket.shipping_eur) })}</small>
      {basket.vs_baseline_eur !== undefined && <p>{t("bk.vsBaseline", { d: money(basket.vs_baseline_eur) })}</p>}
      <p>{t(basket.coverage === "covered" ? "adv.projection" : "adv.unknownTiming")}</p>
      <p>{t("adv.priorities", { order: brief.priority_order.map((p) => label("prio", p)).join(" → ") })}</p>
      {basket.lines.map((line) => <p key={line.offer_id}>{line.product} · {line.packs} × {qty(line.pack_size, line.unit)} · {dates.day(line.earliest_delivery)}</p>)}
      {basket.unmet_preferences.length > 0 && <details><summary>{t("bk.tradeoffs")}</summary><ul>
        {basket.unmet_preferences.map((p) => <li key={p}>{p.replace(/^(\w+):/, (_, ing) => label("ing", ing) + ":")}</li>)}
      </ul></details>}
    </>}
    {brief.budget_conflict && <p className="jp-error">{t("adv.budgetConflict")}</p>}
    {brief.questions.length > 0 && <div className="jp-quote"><h3>{t("adv.questions")}</h3>
      {brief.questions.slice(0, 4).map((q) => <p key={q.offer_id + q.field}>{q.product} · {label("field", q.field)} · {q.resolved_by === "owner" ? t("adv.ownerAction") : q.drafted ? t("bk.drafted") : t("of.askSupplier")}</p>)}
      <Link href="/restaurants/basket#questions" className="jp-action">{t("adv.supplierAction")}</Link>
    </div>}
    <div className="jp-form-actions">
      <Link href="/restaurants/basket" className="jp-action jp-primary">{t("adv.openBasket")}</Link>
      <Link href="/restaurants?edit=week#planning" className="jp-action">{t("adv.editWeek")}</Link>
    </div>
  </div>;
}
