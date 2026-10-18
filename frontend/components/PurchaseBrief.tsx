"use client";

import Link from "next/link";
import { useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

export default function PurchaseBrief() {
  const { data } = useWorkspace();
  const { t } = useI18n();
  const label = useLabel();
  const brief = data?.brief;
  if (!brief) return null;
  const basket = brief.recommended;
  const display = brief.display;
  return <div className="jp-recommendation" style={{ paddingTop: 0, borderTop: 0 }}>
    <span className="jp-kicker">{t("adv.brief")}</span>
    {display.risks.map((risk) => <div className="jp-quote" key={risk.ingredient}>
      <strong>{t("adv.deadline", { ingredient: risk.ingredient, qty: risk.first, date: risk.date })}</strong>
      <p>{t("adv.weekShort", { qty: risk.total })}</p>
    </div>)}
    {!brief.timing_known && <p className="jp-error">{t("adv.unknownTiming")}</p>}
    {!basket && <p>{t(brief.nothing_to_buy ? "wk.allClear" : "adv.noSafe")}</p>}
    {!basket && !brief.nothing_to_buy && brief.excluded.map((offer) => <details key={offer.offer_id}>
      <summary>{offer.product}</summary>{offer.reasons.map((reason) => <p key={reason}>{reason}</p>)}
      <Link className="jp-action" href={`/restaurants/suppliers?supplier=${data.state.offers.find((o) => o.id === offer.offer_id)?.supplier_id ?? ""}`}>{t("sup.view")}</Link>
    </details>)}
    {basket && display.basket && <>
      <h3>{display.basket.title}</h3>
      <div className="jp-price jp-number">{display.basket.total}</div>
      <small>{t("bk.goodsShipping", { g: display.basket.goods, s: display.basket.shipping })}</small>
      {basket.vs_baseline_eur !== undefined && <p>{t("bk.vsBaseline", { d: display.basket.difference ?? "?" })}</p>}
      <p>{t(basket.coverage === "covered" ? "adv.projection" : "adv.unknownTiming")}</p>
      <p>{t("adv.priorities", { order: display.priorities.join(" → ") })}</p>
      {display.basket.lines.map((line,i) => <p key={i}>{line}</p>)}
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
