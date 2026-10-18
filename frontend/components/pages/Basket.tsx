"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { api, errorText, type BasketView, type ClarificationsView } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";
import { Badge, useBump, useToast, useView } from "@/components/live";
import PageHeader from "@/components/PageHeader";
import Orders from "@/components/Orders";
import Clarifications from "@/components/Clarifications";
import { InfoTip } from "@/components/InfoTip";
import ProductDrawing from "@/components/ProductDrawing";
import ImportChecks from "@/components/ImportChecks";
import OrderPlanOverview from "@/components/OrderPlanOverview";
import Loading from "@/components/pages/Loading";

// Order plans: compare the plans the server calculated, approve one, then send the supplier orders.
export default function Basket({ initial, initialPlan, questions }: { initial: BasketView | null; initialPlan: string | null; questions: ClarificationsView | null }) {
  const { t, lang } = useI18n();
  const { data } = useWorkspace();
  const bump = useBump();
  const toast = useToast();
  const [kind, setKindState] = useState<string | null>(initialPlan);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pathFor = (k: string | null) => `/views/basket?lang=${lang}${k ? `&kind=${encodeURIComponent(k)}` : ""}`;
  const path = pathFor(kind);
  const { data: v } = useView<BasketView>(path, path === pathFor(initialPlan) ? initial : null);
  // The chosen plan lives in the address (?plan=), so a reload shows the same plan.
  const setKind = (k: string | null) => {
    setKindState(k);
    window.history.replaceState(null, "", k ? `/restaurants/basket?plan=${encodeURIComponent(k)}` : "/restaurants/basket");
  };
  if (!v) return <Loading title={t("bk.title")} />;
  const L = (k: string) => v.labels[k] ?? t(k as Key);
  const s = v.selected;
  const supplierHref = (offerId: string) => {
    const supplierId = data?.state.offers.find((offer) => offer.id === offerId)?.supplier_id;
    return `/restaurants/suppliers${supplierId ? `?supplier=${encodeURIComponent(supplierId)}` : ""}`;
  };
  const excluded = [...v.excluded];
  // Preserve brief-only exclusions, while showing each product once on this page.
  for (const offer of data?.brief.excluded ?? []) {
    if (!excluded.some((item) => item.offer_id === offer.offer_id)) {
      const supplierId = data?.state.offers.find((item) => item.id === offer.offer_id)?.supplier_id;
      excluded.push({ ...offer, supplier: data?.state.suppliers[supplierId ?? ""]?.name ?? "" });
    }
  }

  const approve = async () => {
    if (!s) return;
    setBusy(true);
    try {
      if (s.send_key) await api.approveAndSend(s.kind, s.send_key);
      else await api.approveBasket(s.kind);
      setConfirming(false);
      setKind(null);
      bump();
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const orders = v.orders.length > 0 && (
    <section className="jp-panel">
      <div className="jp-line-head">
        <h2>{L("po.title")}</h2>
      </div>
      <Orders orders={v.orders} />
    </section>
  );

  return (
    <div className="jp-order-plans">
      <PageHeader
        title={L("bk.title")}
        sub={t("op.subtitle")}
        actions={
          <Link href="/restaurants?edit=week#planning" className="jp-action jp-plan-edit">
            <SlidersHorizontal aria-hidden />
            {t("op.editInputs")}
          </Link>
        }
      />
      <div className="jp-stack">
        <OrderPlanOverview view={v} />

        {v.mode === "choose" && s && (
          <>
            <section className="jp-panel">
              <div className="jp-line-head" style={{ marginBottom: 4 }}>
                <h2>{t("op.options")}</h2>
              </div>
              <p className="jp-section-note">{L("bk.optionsNote")}</p>
              <div className="jp-basket-options">
                {v.plans.map((p) => (
                  <button key={p.kind} type="button" className="jp-basket-option" aria-pressed={p.selected} onClick={() => setKind(p.kind)}>
                    <span className="jp-kicker">{p.title}</span>
                    <strong>{p.total_text}</strong>
                    <small>{p.vs_text}</small>
                    <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                      <Badge tone={p.timing.warn ? "warning" : "ok"}>{p.timing.text}</Badge>
                      {p.approved && (
                        <Badge>
                          <Check size={12} aria-hidden />
                        </Badge>
                      )}
                    </span>
                    {p.savings_text && <small style={{ marginTop: 6 }}>{p.savings_text}</small>}
                    {p.also_text && <small style={{ marginTop: 6 }}>{p.also_text}</small>}
                  </button>
                ))}
              </div>
            </section>

            <section className="jp-panel">
              <div className="jp-line-head">
                <h2>{s.title}</h2>
                <Badge>{s.prefs_text}</Badge>
              </div>
              {s.lines.map((ln) => (
                <div key={ln.offer_id} className="jp-row">
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
                    {ln.drawing && (
                      <div className="jp-product-drawing-slot jp-plan-drawing">
                        <ProductDrawing drawing={ln.drawing} size={40} />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h3>
                        {ln.product}
                        {ln.new_text && (
                          <Badge tone="warning" style={{ marginLeft: 6 }}>
                            {ln.new_text}
                          </Badge>
                        )}
                      </h3>
                      <p>{ln.detail_text}</p>
                      <p>{ln.timing_text}</p>
                    </div>
                  </div>
                  <div className="jp-row-right">
                    <span className="jp-number">{ln.cost_text}</span>
                    <br />
                    {ln.badge && <Badge tone={ln.badge.warn ? "warning" : "ok"}>{ln.badge.text}</Badge>}
                  </div>
                  <ImportChecks ic={ln.import_checks} />
                </div>
              ))}
              {s.tradeoffs.length > 0 && (
                <div className="jp-quote">
                  <strong style={{ fontWeight: 500 }}>{L("bk.tradeoffs")}</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, listStyle: "disc" }}>
                    {s.tradeoffs.map((u, i) => (
                      <li key={i}>
                        {u.text}
                        <InfoTip hint={u.hint} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="jp-budget">
                <span>
                  {L("bk.total")}
                  <br />
                  <small className="jp-muted">{s.goods_shipping_text}</small>
                </span>
                <strong className="jp-number">{s.total_text}</strong>
              </div>
              <div className="jp-budget-track">
                <span style={{ width: `${Math.min(100, s.budget_pct)}%` }} />
              </div>
              <p className="jp-muted" style={{ fontSize: 12, margin: "13px 0" }}>
                {s.budget_text}
              </p>
              {s.savings_text && <p className="jp-toast">{s.savings_text}</p>}
              {s.approval.state === "stale" && <p className="jp-error">{s.approval.text}</p>}
              {s.approval.state === "other" && (
                <p className="jp-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {s.approval.text}
                </p>
              )}
              {s.approval.state === "approved" ? (
                <Badge style={{ padding: "8px 12px", fontSize: 12 }}>
                  <Check size={14} aria-hidden />
                  {s.approval.text}
                </Badge>
              ) : (
                s.can_approve &&
                (confirming && s.confirm ? (
                  <div className="jp-proposal" role="alertdialog" aria-label={s.confirm.title} style={{ marginTop: 0 }}>
                    <h3>{s.confirm.title}</h3>
                    <p style={{ margin: "6px 0 10px" }}>{s.confirm.text}</p>
                    <dl className="jp-diff">
                      {s.confirm.lines.map((ln) => (
                        <span key={ln.supplier} style={{ display: "contents" }}>
                          <dt>{ln.supplier}</dt>
                          <dd>
                            <strong>{ln.total_text}</strong>
                          </dd>
                        </span>
                      ))}
                    </dl>
                    <div className="jp-form-actions">
                      <button type="button" className="jp-action jp-primary" disabled={busy} onClick={approve}>
                        <Check aria-hidden />
                        {busy ? s.approving_text : s.confirm.confirm_text}
                      </button>
                      <button type="button" className="jp-action" disabled={busy} onClick={() => setConfirming(false)}>
                        {s.confirm.cancel_text}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button id="approve" type="button" className="jp-action jp-primary" disabled={busy} onClick={() => (s.confirm ? setConfirming(true) : approve())}>
                    <Check aria-hidden />
                    {busy ? s.approving_text : s.approve_text}
                  </button>
                ))
              )}
              <p className="jp-muted" style={{ fontSize: 11, marginTop: 10 }}>
                {L("bk.approveNote")}
              </p>
            </section>
            {orders}
          </>
        )}

        {v.mode === "settled" && v.settled && (
          <>
            <section className="jp-panel">
              <div className="jp-line-head">
                <h2>{v.settled.title}</h2>
                <Badge>
                  <Check size={14} aria-hidden />
                  {v.settled.approved_text}
                </Badge>
              </div>
              <p className="jp-section-note">{v.settled.note}</p>
              {v.settled.lines.map((ln) => (
                <div key={ln.offer_id} className="jp-row">
                  <div>
                    <h3>{ln.product}</h3>
                    <p>{ln.detail_text}</p>
                  </div>
                  <span className="jp-number">{ln.cost_text}</span>
                </div>
              ))}
              <div className="jp-budget">
                <span>{L("bk.total")}</span>
                <strong className="jp-number">{v.settled.total_text}</strong>
              </div>
            </section>
            {orders}
          </>
        )}

        <section className="jp-panel" id="questions">
          <Clarifications initial={questions} />
        </section>

        {excluded.length > 0 && (
          <section className="jp-panel">
            <details className="jp-plan-excluded">
              <summary>
                <span>{t("op.excluded")} <span className="jp-plan-count">{excluded.length}</span></span>
                <ChevronDown aria-hidden />
              </summary>
              <div className="jp-source-body">
                {excluded.map((x) => (
                  <div key={x.offer_id} className="jp-row">
                    <div>
                      <h3>
                        {x.product}
                        {x.supplier && <span className="jp-muted" style={{ fontWeight: 400 }}> · {x.supplier}</span>}
                      </h3>
                      {x.reasons.map((r) => (
                        <p key={r}>{r}</p>
                      ))}
                    </div>
                    <Link className="jp-action" href={supplierHref(x.offer_id)}>
                      {t("op.reviewProduct")}
                    </Link>
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
