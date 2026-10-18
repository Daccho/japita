"use client";

import Link from "next/link";
import { ClipboardCheck, Loader2, TriangleAlert } from "lucide-react";
import { errorText, money, qty } from "@/lib/api";
import { useDates, useI18n, useLabel } from "@/lib/i18n";
import { useElapsed, useWorkspace } from "@/components/workspace";
import { suggestedBasket } from "@/components/helpers";
import WeekInputs from "@/components/WeekInputs";
import PageHeader from "@/components/PageHeader";
import Orders from "@/components/Orders";
import DayStrip from "@/components/DayStrip";
import { Markdown } from "@/components/Advisor";

function WeeklyCheck() {
  const { t } = useI18n();
  const { weekly, runWeekly } = useWorkspace();
  const elapsed = useElapsed(weekly.startedAt);
  const output = weekly.result?.output_text;
  const failed = !weekly.error && weekly.result && (weekly.result.status !== "completed" || !output);
  return (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{t("chk.title")}</h2>
        <button type="button" className="jp-action" disabled={weekly.running} onClick={runWeekly}>
          {weekly.running ? <Loader2 className="jp-spinner" aria-hidden /> : <ClipboardCheck aria-hidden />}
          {weekly.error ? t("err.retry") : weekly.result ? t("chk.again") : t("chk.run")}
        </button>
      </div>
      <p className="jp-section-note">{t("chk.intro")}</p>
      {weekly.running && (
        <div>
          <p className="jp-muted" style={{ fontSize: 12 }}>
            {t("chk.running")} · {t("adv.elapsed", { s: elapsed })}
          </p>
          <div className="jp-progress">
            <span />
          </div>
        </div>
      )}
      {!weekly.running && !!weekly.error && <p className="jp-error">{errorText(weekly.error, t)}</p>}
      {!weekly.running && failed && <p className="jp-error">{t("chk.failed")}</p>}
      {!weekly.running && output && <Markdown text={output} />}
    </section>
  );
}

export default function WeekPage() {
  const { t } = useI18n();
  const label = useLabel();
  const d = useDates();
  const { data } = useWorkspace();
  if (!data) return null;
  const { state, baskets, timeline, spending } = data;
  const week = state.week;
  const needs = baskets.needs ?? {};
  const tl = timeline.ingredients ?? {};
  const suggested = suggestedBasket(baskets);
  const orders = (state.purchase_orders ?? []).filter((po) => po.state !== "cancelled");
  const delayed = (week.deliveries ?? []).filter((dl) => dl.status === "delayed" && tl[dl.ingredient]?.first_stockout);
  const used = Math.min(100, (spending.committed_eur / spending.budget_eur) * 100);

  return (
    <>
      <PageHeader
        kicker={t("wk.kicker", { id: week.id })}
        title={t("wk.title")}
        sub={week.dates?.length === 2 ? t("wk.sub", { dates: d.range(week.dates[0], week.dates[1]) }) : undefined}
      />
      <div className="jp-columns">
        <div className="jp-stack">
          {delayed.map((dl) => {
            const out = tl[dl.ingredient]!;
            return (
              <div key={dl.id} className="jp-alert" role="status">
                <TriangleAlert aria-hidden />
                <div>
                  <h3>{t("nt.delayed", { weekday: d.weekday(dl.date), ingredient: label("ing", dl.ingredient) })}</h3>
                  <p>
                    {t("nt.delayedBody", {
                      supplier: state.suppliers[dl.supplier_id]?.name ?? dl.supplier_id,
                      date: d.day(dl.date),
                      qty: qty(dl.qty, dl.unit),
                      revised: d.day(dl.revised_date),
                      ingredient: label("ing", dl.ingredient),
                      stockout: d.day(out.first_stockout),
                    })}
                  </p>
                  <Link href="/restaurants/basket" className="jp-action">
                    {t("nt.compare")}
                  </Link>
                </div>
              </div>
            );
          })}

          <section className="jp-panel">
            <div className="jp-line-head" style={{ marginBottom: 4 }}>
              <h2>{t("wk.needs")}</h2>
            </div>
            <p className="jp-section-note">{t("wk.needsNote")}</p>
            {Object.values(needs).map((n) => {
              const line = tl[n.ingredient];
              return (
                <div key={n.ingredient} className="jp-row">
                  <div>
                    <h3>{label("ing", n.ingredient)}</h3>
                    <p>{t("wk.need", { q: qty(n.gross, n.unit), c: qty(n.usable_stock + n.confirmed_arrivals, n.unit) })}</p>
                    {line && <DayStrip ingredient={n.ingredient} unit={line.unit} days={line.days} />}
                  </div>
                  <div className="jp-row-right">
                    <small className="jp-muted">{t("wk.toBuy")}</small>
                    <div className="jp-number" style={{ fontSize: 16, fontWeight: 700 }}>
                      {qty(n.required, n.unit)}
                    </div>
                    {line?.first_stockout ? (
                      <span className="jp-badge jp-warning">{t("wk.runsOut", { date: d.day(line.first_stockout) })}</span>
                    ) : (
                      <span className="jp-badge">{t("wk.covered")}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="jp-panel">
            <div className="jp-line-head">
              <h2>{t("wk.orders")}</h2>
            </div>
            {orders.length ? <Orders orders={orders} canSubmit={!data.approval?.stale} /> : <p className="jp-muted" style={{ fontSize: 13 }}>{t("wk.noOrders")}</p>}
          </section>

          <WeekInputs />
          <WeeklyCheck />
        </div>

        <div className="jp-stack">
          <section className="jp-panel">
            <h2>{t("wk.spending")}</h2>
            <div className="jp-budget" style={{ borderTop: 0, marginTop: 0 }}>
              <span>{t("wk.committed")}</span>
              <strong className="jp-number">{money(spending.committed_eur)}</strong>
            </div>
            <div className="jp-budget-track">
              <span style={{ width: `${used}%` }} />
            </div>
            <p className="jp-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {t("wk.remaining", { r: money(spending.remaining_eur), b: money(spending.budget_eur) })}
            </p>
            {spending.planned_eur !== null && (
              <p className="jp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {t("wk.planned", { v: money(spending.planned_eur) })}
              </p>
            )}
            <p className="jp-muted" style={{ fontSize: 11, marginTop: 10 }}>
              {t("wk.spendNote")}
            </p>
          </section>
          {suggested && (
            <section className="jp-advisor">
              <span className="jp-kicker">{t("wk.suggested")}</span>
              <h3 style={{ marginTop: 8 }}>{label("kind", suggested.kind)}</h3>
              <div className="jp-price jp-number" style={{ fontSize: 25, margin: "10px 0 2px" }}>
                {money(suggested.delivered_total_eur)}
              </div>
              <small className="jp-muted">
                {suggested.late_lines.length ? t("adv.someLate") : t("adv.inTime")}
              </small>
              <Link href="/restaurants/basket" className="jp-action jp-primary jp-full">
                {t("adv.openBasket")}
              </Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
