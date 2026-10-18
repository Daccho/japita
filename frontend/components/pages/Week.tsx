"use client";

import Link from "next/link";
import { ClipboardCheck, Loader2, ShoppingBasket, TriangleAlert } from "lucide-react";
import { errorText, type WeekView } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { Badge, useView } from "@/components/live";
import PageHeader from "@/components/PageHeader";
import Orders from "@/components/Orders";
import DayStrip from "@/components/DayStrip";
import { Markdown } from "@/components/Advisor";
import Loading from "@/components/pages/Loading";

function WeeklyCheck() {
  const { t } = useI18n();
  const { weekly, runWeekly } = useWorkspace();
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
            {t("chk.running")}
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

export const reviewBasket = (label: string) => (
  <Link href="/restaurants/basket" className="jp-action">
    <ShoppingBasket aria-hidden />
    {label}
  </Link>
);

export default function Week({ initial }: { initial: WeekView | null }) {
  const { t, lang } = useI18n();
  const { data: v } = useView<WeekView>(`/views/week?lang=${lang}`, initial);
  if (!v) return <Loading title={t("wk.title")} />;
  const L = (k: string) => v.labels[k] ?? t(k as Key);

  return (
    <>
      <PageHeader kicker={v.kicker} title={L("wk.title")} sub={v.sub} actions={reviewBasket(t("review.basket"))} />
      <div className="jp-columns">
        <div className="jp-stack">
          {v.alerts.map((a) => (
            <div key={a.id} className="jp-alert" role="status">
              <TriangleAlert aria-hidden />
              <div>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
                <Link href={a.href} className="jp-action">
                  {a.action}
                </Link>
              </div>
            </div>
          ))}

          <section className="jp-panel">
            <div className="jp-line-head" style={{ marginBottom: 4 }}>
              <h2>{L("wk.needs")}</h2>
            </div>
            <p className="jp-section-note">{L("wk.needsNote")}</p>
            {v.needs.map((n) => (
              <div key={n.ingredient} className="jp-row">
                <div>
                  <h3>{n.label}</h3>
                  <p>{n.need_text}</p>
                  <DayStrip days={n.days} />
                </div>
                <div className="jp-row-right">
                  <small className="jp-muted">{L("wk.toBuy")}</small>
                  <div className="jp-number" style={{ fontSize: 16, fontWeight: 700 }}>
                    {n.to_buy_text}
                  </div>
                  {n.from_text && (
                    <small className="jp-muted" style={{ display: "block" }}>
                      {n.from_text}
                    </small>
                  )}
                  <Badge tone={n.status === "runs_out" ? "warning" : "ok"}>{n.status_text}</Badge>
                </div>
              </div>
            ))}
          </section>

          <section className="jp-panel">
            <div className="jp-line-head">
              <h2>{L("wk.orders")}</h2>
            </div>
            {v.orders.length ? <Orders orders={v.orders} /> : <p className="jp-muted" style={{ fontSize: 13 }}>{v.orders_empty_text}</p>}
          </section>

          <WeeklyCheck />
        </div>

        <div className="jp-stack">
          <section className="jp-panel">
            <h2>{L("wk.spending")}</h2>
            <div className="jp-budget" style={{ borderTop: 0, marginTop: 0 }}>
              <span>{L("wk.committed")}</span>
              <strong className="jp-number">{v.spending.committed_text}</strong>
            </div>
            <div className="jp-budget-track">
              <span style={{ width: `${Math.min(100, v.spending.used_pct)}%` }} />
            </div>
            {v.spending.sent_text && (
              <p className="jp-muted" style={{ fontSize: 12, marginTop: 10 }}>
                {v.spending.sent_text}
              </p>
            )}
            <p className="jp-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {v.spending.remaining_text}
            </p>
            {v.spending.planned_text && (
              <p className="jp-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {v.spending.planned_text}
              </p>
            )}
          </section>
          {v.suggested && (
            <section className="jp-advisor">
              <span className="jp-kicker">{L("wk.suggested")}</span>
              <h3 style={{ marginTop: 8 }}>{v.suggested.title}</h3>
              <div className="jp-price jp-number" style={{ fontSize: 25, margin: "10px 0 2px" }}>
                {v.suggested.total_text}
              </div>
              <small className="jp-muted">{v.suggested.timing_text}</small>
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", fontSize: 12 }}>
                {v.suggested.lines.map((ln, i) => (
                  <li key={i} style={{ marginTop: 4 }}>
                    <strong>{ln.ingredient_label}</strong> · {ln.supplier}
                  </li>
                ))}
              </ul>
              <Link href={v.suggested.action.href} className="jp-action jp-primary jp-full">
                {v.suggested.action.label}
              </Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
