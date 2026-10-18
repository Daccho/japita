"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles, TriangleAlert } from "lucide-react";
import type { BasketView } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { Badge } from "@/components/live";
import { InfoTip } from "@/components/InfoTip";

// A page-sized summary of the existing purchasing data. The advisor keeps its own compact brief.
export default function OrderPlanOverview({ view }: { view: BasketView }) {
  const { t } = useI18n();
  const label = useLabel();
  const { data, ask, advisor } = useWorkspace();
  const brief = data?.brief;
  const blocked = !!view.no_on_time || (!!brief && !brief.recommended && !brief.nothing_to_buy);
  const noPlan = view.mode === "none" && !brief?.nothing_to_buy;
  const questions = brief?.questions ?? [];
  // The basket view can arrive before the shared purchasing brief. Keep its existing question action available.
  const fallbackQuestions = (view.no_on_time?.questions ?? []).filter(
    (q) => !questions.some((item) => item.offer_id === q.offer_id && item.field === q.field),
  );

  return (
    <>
      {(blocked || noPlan || view.conflict_text || brief?.budget_conflict) && (
        <div className="jp-alert jp-plan-status" role="status">
          <TriangleAlert aria-hidden />
          <div>
            <h2>{t(blocked ? "op.blocked" : brief?.budget_conflict ? "op.budgetTitle" : "op.noPlan")}</h2>
            <p>{t("op.blockedNote")}</p>
            {view.conflict_text && <p>{view.conflict_text}</p>}
            {brief?.budget_conflict && <p>{t("adv.budgetConflict")}</p>}
            {view.no_on_time && questions.length === 0 && fallbackQuestions.length === 0 && (
              <button type="button" className="jp-action" disabled={advisor.running}
                onClick={() => ask(view.no_on_time!.ask_question)}>
                <Sparkles aria-hidden />{t("adv.ask")}
              </button>
            )}
          </div>
        </div>
      )}

      {brief && (brief.display.risks.length > 0 || !brief.timing_known) && (
        <section className="jp-panel jp-plan-shortages" aria-labelledby="plan-shortages-title">
          <div className="jp-line-head">
            <h2 id="plan-shortages-title">{t("op.shortages")}</h2>
            <span className="jp-muted jp-plan-caption">{t("op.shortagesNote")}</span>
          </div>
          {brief.display.risks.length > 0 && (
            <table className="jp-shortage-table" role="table">
              <thead>
                <tr>
                  <th scope="col">{t("op.ingredient")}</th>
                  <th scope="col">{t("op.firstShortage")}</th>
                  <th scope="col">{t("op.shortThatDay")}</th>
                  <th scope="col">{t("op.weekShortage")}</th>
                </tr>
              </thead>
              <tbody>
                {brief.display.risks.map((risk) => (
                  <tr key={risk.ingredient}>
                    <th scope="row">{risk.ingredient}</th>
                    <td data-label={t("op.firstShortage")}>{risk.date}</td>
                    <td className="jp-number" data-label={t("op.shortThatDay")}>{risk.first}</td>
                    <td className="jp-number" data-label={t("op.weekShortage")}>{risk.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!brief.timing_known && <p className="jp-plan-caption">{t("adv.unknownTiming")}</p>}
        </section>
      )}

      {(questions.length > 0 || fallbackQuestions.length > 0) && (
        <section className="jp-panel jp-plan-resolutions" aria-labelledby="plan-resolutions-title">
          <div className="jp-line-head">
            <h2 id="plan-resolutions-title">{t("op.resolve")}</h2>
            <span className="jp-plan-count">{questions.length + fallbackQuestions.length}</span>
          </div>
          <ul className="jp-resolution-list">
            {questions.map((q) => {
              const owner = q.resolved_by === "owner";
              const supplierId = data?.state.offers.find((offer) => offer.id === q.offer_id)?.supplier_id;
              const hint = view.no_on_time?.questions.find((item) => item.offer_id === q.offer_id && item.field === q.field)?.hint;
              const message = brief?.clarifications.find((item) => item.offer_id === q.offer_id && item.field === q.field && item.state !== "replied");
              const supplierStatus = message?.state === "supplier_replied" ? t("cl.supplier_replied")
                : message?.state === "sent" ? t("cl.sent") : t(q.drafted ? "bk.drafted" : "op.needsQuestion");
              return (
                <li key={`${q.offer_id}-${q.field}`} className="jp-resolution-row">
                  <div className="jp-resolution-copy">
                    <h3>{q.product}</h3>
                    <p>{q.field === "chef_approved" ? t("op.chefApproval") : label("field", q.field)}<InfoTip hint={hint} /></p>
                    <span className="jp-resolution-owner">{t(owner ? "op.restaurantDecision" : "op.supplierInformation")}</span>
                  </div>
                  <div className="jp-resolution-actions">
                    <Badge tone="neutral">{owner ? t("op.chefReview") : supplierStatus}</Badge>
                    {owner ? (
                      <Link className="jp-action" href={`/restaurants/suppliers${supplierId ? `?supplier=${encodeURIComponent(supplierId)}` : ""}`}>
                        {t("op.reviewProduct")}<ArrowUpRight aria-hidden />
                      </Link>
                    ) : q.drafted ? (
                      <a className="jp-action" href="#questions">{t("op.reviewQuestions")}</a>
                    ) : (
                      <button type="button" className="jp-action jp-primary" disabled={advisor.running}
                        onClick={() => ask(view.no_on_time?.ask_question ?? t("adv.askOffer"), { offer_id: q.offer_id })}>
                        <Sparkles aria-hidden />{t("adv.ask")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {fallbackQuestions.map((q) => (
              <li key={`${q.offer_id}-${q.field}`} className="jp-resolution-row">
                <div className="jp-resolution-copy"><h3>{q.text}</h3><InfoTip hint={q.hint} /></div>
                <div className="jp-resolution-actions">
                  <Badge tone="neutral">{t(q.drafted ? "bk.drafted" : "op.needsQuestion")}</Badge>
                  {q.drafted ? <a className="jp-action" href="#questions">{t("op.reviewQuestions")}</a> : (
                    <button type="button" className="jp-action jp-primary" disabled={advisor.running}
                      onClick={() => ask(view.no_on_time!.ask_question, { offer_id: q.offer_id })}>
                      <Sparkles aria-hidden />{t("adv.ask")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {brief?.nothing_to_buy && view.mode === "none" && (
        <section className="jp-panel"><p>{t("wk.allClear")}</p></section>
      )}
    </>
  );
}
