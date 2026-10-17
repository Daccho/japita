"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, Store, TriangleAlert } from "lucide-react";
import { api, errorDetail, money, qty, type Basket } from "@/lib/api";
import { useDates, useI18n, useLabel } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { findBasket, KIND_ORDER, suggestedBasket } from "@/components/helpers";
import PageHeader from "@/components/PageHeader";
import Orders from "@/components/Orders";
import Clarifications from "@/components/Clarifications";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

function Options({ baskets, selected, onSelect }: { baskets: Basket[]; selected: Basket; onSelect: (b: Basket) => void }) {
  const { t } = useI18n();
  const label = useLabel();
  const sorted = [...baskets].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return (
    <div className="jp-basket-options">
      {sorted.map((b) => (
        <button key={b.kind} type="button" className="jp-basket-option" aria-pressed={b === selected} onClick={() => onSelect(b)}>
          <span className="jp-kicker">{label("kind", b.kind)}</span>
          <strong>{money(b.delivered_total_eur)}</strong>
          <small>
            {b.kind === "baseline"
              ? t("bk.sameAsBaseline").replace(/^./, (c) => c.toUpperCase())
              : b.vs_baseline_eur !== undefined
                ? t("bk.vsBaseline", { d: signed(b.vs_baseline_eur) })
                : ""}
          </small>
          <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
            <span className={`jp-badge ${b.late_lines.length ? "jp-warning" : ""}`}>
              {b.late_lines.length ? t("bk.lateSome", { n: b.late_lines.length }) : t("bk.allOnTime")}
            </span>
          </span>
          {b.also.length > 0 && <small style={{ marginTop: 6 }}>{t("bk.also", { k: b.also.map((k) => label("kind", k)).join(", ") })}</small>}
        </button>
      ))}
    </div>
  );
}

export default function BasketPage() {
  const { t } = useI18n();
  const label = useLabel();
  const d = useDates();
  const { data, profileId, refresh, ask, advisor } = useWorkspace();
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const { baskets, approval, state } = data;
  const approvedBasket = approval ? findBasket(baskets, approval.kind) : undefined;
  const candidate = (kind ? findBasket(baskets, kind) : undefined) ?? approvedBasket ?? suggestedBasket(baskets) ?? baskets.baskets[0];
  // Once the approved orders cover every need, there is nothing left to buy: show the approved basket instead.
  const settled = !!approval && !approval.stale && (!candidate || candidate.lines.length === 0);
  const selected = settled ? undefined : candidate;
  const budget = baskets.budget_eur ?? 0;
  const isApproved = !!approval && !approval.stale && approvedBasket === selected;
  const orders = approval ? (state.purchase_orders ?? []).filter((po) => po.approval_id === approval.id) : [];
  const supplierQuestions = (baskets.open_questions ?? []).filter((q) => q.resolved_by === "supplier");
  const lateIngredient = selected?.lines.find((l) => l.arrives_in_time === false)?.ingredient ?? "noodles";

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveBasket(selected.kind, profileId);
      await refresh();
    } catch (e) {
      setError(errorDetail(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        kicker={t("bk.kicker")}
        title={t("bk.title")}
        sub={t("bk.sub")}
        action={
          <Link href="/suppliers" className="jp-action">
            <Store aria-hidden />
            {t("nav.suppliers")}
          </Link>
        }
      />
      <div className="jp-stack">
        {baskets.no_on_time_option && (
          <div className="jp-alert" role="status">
            <TriangleAlert aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h3>{t("bk.noOnTime")}</h3>
              <p>{t("bk.noOnTimeBody")}</p>
              {supplierQuestions.map((q) => (
                <p key={`${q.offer_id}-${q.field}`} style={{ margin: "4px 0", color: "var(--jp-text)" }}>
                  {q.product} · {q.supplier}: {q.rule}
                  {q.drafted && <span className="jp-badge" style={{ marginLeft: 6 }}>{t("bk.drafted")}</span>}
                </p>
              ))}
              <button
                type="button"
                className="jp-action jp-primary"
                style={{ marginTop: 10 }}
                disabled={advisor.running}
                onClick={() => ask(t("bk.askQuestion", { ingredient: label("ing", lateIngredient) }))}
              >
                <Sparkles aria-hidden />
                {t("bk.askAdvisor")}
              </button>
            </div>
          </div>
        )}

        {baskets.conflict && <div className="jp-alert">{baskets.conflict}</div>}

        {selected ? (
          <>
            <section className="jp-panel">
              <div className="jp-line-head" style={{ marginBottom: 4 }}>
                <h2>{t("bk.options")}</h2>
              </div>
              <p className="jp-section-note">{t("bk.optionsNote")}</p>
              <Options baskets={baskets.baskets} selected={selected} onSelect={(b) => setKind(b.kind)} />
            </section>

            <section className="jp-panel">
              <div className="jp-line-head">
                <h2>{label("kind", selected.kind)}</h2>
                <span className="jp-badge">{t("bk.prefs", { m: selected.preferences_met, t: selected.preferences_total })}</span>
              </div>
              {selected.lines.map((ln) => (
                <div key={ln.offer_id} className="jp-row">
                  <div>
                    <h3>{ln.product}</h3>
                    <p>
                      {label("ing", ln.ingredient)} · {state.suppliers[ln.supplier_id]?.name} · {ln.packs} × {qty(ln.pack_size, ln.unit)} ={" "}
                      {qty(ln.purchase_qty, ln.unit)}
                    </p>
                    <p>
                      {ln.earliest_delivery ? t("bk.arrives", { date: d.day(ln.earliest_delivery) }) : t("bk.noDate")}
                      {ln.needed_by && ` · ${t("bk.neededBy", { date: d.day(ln.needed_by) })}`}
                    </p>
                  </div>
                  <div className="jp-row-right">
                    <span className="jp-number">{money(ln.cost_eur)}</span>
                    <br />
                    {ln.arrives_in_time === false && <span className="jp-badge jp-warning">{t("bk.late")}</span>}
                    {ln.arrives_in_time === true && <span className="jp-badge">{t("bk.onTime")}</span>}
                  </div>
                </div>
              ))}
              {selected.unmet_preferences.length > 0 && (
                <div className="jp-quote">
                  <strong style={{ fontWeight: 500 }}>{t("bk.tradeoffs")}</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" }}>
                    {selected.unmet_preferences.map((u) => (
                      <li key={u}>{u.replace(/^(\w+):/, (_, ing) => `${label("ing", ing)}:`).replace(/ \((fail|missing_evidence|needs_review)\)$/, "")}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="jp-budget">
                <span>
                  {t("bk.total")}
                  <br />
                  <small className="jp-muted">{t("bk.goodsShipping", { g: money(selected.goods_eur), s: money(selected.shipping_eur) })}</small>
                </span>
                <strong className="jp-number">{money(selected.delivered_total_eur)}</strong>
              </div>
              <div className="jp-budget-track">
                <span style={{ width: `${Math.min(100, (selected.delivered_total_eur / (budget || 1)) * 100)}%` }} />
              </div>
              <p className="jp-muted" style={{ fontSize: 12, margin: "13px 0" }}>
                {selected.within_budget
                  ? t("bk.remaining", { r: money(budget - selected.delivered_total_eur), b: money(budget) })
                  : t("bk.over", { r: money(selected.delivered_total_eur - budget), b: money(budget) })}
                {selected.kind !== "baseline" && selected.vs_baseline_eur !== undefined && ` ${t("bk.vsBaseline", { d: signed(selected.vs_baseline_eur) })}.`}
              </p>
              {error && <p className="jp-error">{t("err.generic", { e: error })}</p>}
              {approval?.stale && approvedBasket === selected && <p className="jp-error">{t("bk.stale")}</p>}
              {approval && !approval.stale && !isApproved && (
                <p className="jp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {t("bk.approvedOther", { k: label("kind", approval.kind) })}
                </p>
              )}
              {isApproved ? (
                <span className="jp-badge" style={{ padding: "8px 12px", fontSize: 12 }}>
                  <Check size={14} aria-hidden />
                  {t("bk.approvedThis")} · {d.time(approval!.approved_at)}
                </span>
              ) : (
                <button type="button" className="jp-action jp-primary" disabled={busy} onClick={approve}>
                  <Check aria-hidden />
                  {busy ? t("bk.approving") : t("bk.approve")}
                </button>
              )}
              <p className="jp-muted" style={{ fontSize: 11, marginTop: 10 }}>
                {t("bk.approveNote")}
              </p>
            </section>

            {approval && orders.length > 0 && (
              <section className="jp-panel">
                <div className="jp-line-head">
                  <h2>{t("po.title")}</h2>
                </div>
                <Orders orders={orders.filter((po) => po.state !== "cancelled")} canSubmit={!approval.stale} />
              </section>
            )}
          </>
        ) : settled && approval ? (
          <>
            <section className="jp-panel">
              <div className="jp-line-head">
                <h2>{label("kind", approval.kind)}</h2>
                <span className="jp-badge">
                  <Check size={14} aria-hidden />
                  {t("bk.approvedThis")} · {d.time(approval.approved_at)}
                </span>
              </div>
              <p className="jp-section-note">{t("wk.allClear")}</p>
              {approval.lines.map((ln) => (
                <div key={ln.offer_id} className="jp-row">
                  <div>
                    <h3>{ln.product}</h3>
                    <p>
                      {label("ing", ln.ingredient)} · {state.suppliers[ln.supplier_id]?.name} · {ln.packs} × {qty(ln.pack_size, ln.unit)}
                    </p>
                  </div>
                  <span className="jp-number">{money(ln.cost_eur)}</span>
                </div>
              ))}
              <div className="jp-budget">
                <span>{t("bk.total")}</span>
                <strong className="jp-number">{money(approval.delivered_total_eur)}</strong>
              </div>
            </section>
            {orders.length > 0 && (
              <section className="jp-panel">
                <div className="jp-line-head">
                  <h2>{t("po.title")}</h2>
                </div>
                <Orders orders={orders.filter((po) => po.state !== "cancelled")} canSubmit={!approval.stale} />
              </section>
            )}
          </>
        ) : (
          <section className="jp-panel">{t("bk.none")}</section>
        )}

        <section className="jp-panel" id="questions">
          <div className="jp-line-head">
            <h2>{t("cl.title")}</h2>
          </div>
          <Clarifications />
        </section>

        {baskets.excluded.length > 0 && (
          <section className="jp-panel">
            <details className="jp-source">
              <summary style={{ cursor: "pointer" }}>{t("ex.title")}</summary>
              <div className="jp-source-body">
                {baskets.excluded.map((x) => (
                  <div key={x.offer_id} className="jp-row">
                    <div>
                      <h3>{x.product}</h3>
                      {x.reasons.map((r) => (
                        <p key={r}>{r.replace(/^(missing_evidence|fails_mandatory|needs_review): /, "")}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </>
  );
}
