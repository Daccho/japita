"use client";

import { useCallback, useEffect, useState } from "react";
import { api, eur, qty, type Basket, type BasketResult, type State } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { Badge, Card, ErrorNote } from "@/components/ui";
import Advisor from "@/components/Advisor";
import ProfilePicker from "@/components/ProfilePicker";
import { useProfile } from "@/components/useProfile";

export default function BasketPage() {
  const { t } = useI18n();
  const [profileId, setProfileId] = useProfile();
  const [state, setState] = useState<State | null>(null);
  const [result, setResult] = useState<BasketResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([api.state(), api.baskets(profileId)]);
      setState(s);
      setResult(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorNote error={t("apiDown", { e: error })} />;
  if (!state || !result) return <p className="text-stone-500">{t("loading")}</p>;

  const profile = state.profiles[profileId];
  const infeasible = Array.isArray(result.infeasible_combinations) ? result.infeasible_combinations : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("bk.title")}</h1>
          <p className="text-sm text-stone-600">{t("bk.intro")}</p>
        </div>
        <div className="ml-auto">
          <ProfilePicker profiles={state.profiles} value={profileId} onChange={setProfileId} />
        </div>
      </div>

      {result.conflict && <ErrorNote error={result.conflict} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.baskets.map((b) => (
          <BasketCard key={b.kind} basket={b} state={state} budget={profile?.weekly_budget_eur} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("bk.excluded")}>
          <ul className="space-y-2 text-sm">
            {result.excluded.map((e) => (
              <li key={e.offer_id}>
                <span className="font-medium">{e.product}</span>
                <span className="text-stone-500"> · {supplierOf(state, e.offer_id)}</span>
                <ul className="ml-4 list-disc text-xs text-stone-600">
                  {e.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </li>
            ))}
            {infeasible.length > 0 && (
              <li>
                <span className="font-medium">{t("bk.combos", { n: infeasible.length })}</span>
                <ul className="ml-4 list-disc text-xs text-stone-600">
                  {Array.from(new Set(infeasible.flatMap((c) => c.problems))).slice(0, 4).map((p) => <li key={p}>{p}</li>)}
                </ul>
              </li>
            )}
          </ul>
        </Card>
        <Advisor profileId={profileId} onDone={load} />
      </div>
    </div>
  );
}

function supplierOf(state: State, offerId: string) {
  const o = state.offers.find((x) => x.id === offerId);
  return o ? state.suppliers[o.supplier_id]?.name : "";
}

function BasketCard({ basket, state, budget }: { basket: Basket; state: State; budget?: number }) {
  const { t } = useI18n();
  const label = useLabel();
  const names = [basket.kind, ...basket.also].map((k) => label("bk", k));
  const diff = basket.vs_baseline_eur;
  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${basket.kind === "baseline" ? "border-violet-200" : "border-stone-200"}`}>
      <div className="mb-1 flex flex-wrap gap-1">
        {names.map((n) => <Badge key={n} tone={basket.kind === "baseline" ? "violet" : "red"}>{n}</Badge>)}
      </div>
      <p className="text-3xl font-bold tabular-nums">{eur(basket.delivered_total_eur)}</p>
      <p className="text-xs text-stone-600">
        {t("bk.goods", { g: eur(basket.goods_eur), s: eur(basket.shipping_eur) })}
        {diff !== undefined && basket.kind !== "baseline" && (
          <span className={`ml-2 font-semibold ${diff < 0 ? "text-emerald-700" : "text-red-700"}`}>
            {t("bk.vsCurrent", { d: `${diff < 0 ? "" : "+"}${eur(diff)}` })}
          </span>
        )}
      </p>
      <p className="mt-1 text-xs">
        {basket.within_budget ? <Badge tone="green">{t("bk.within", { b: budget ? eur(budget) : "" })}</Badge> : <Badge tone="red">{t("bk.over")}</Badge>}{" "}
        <Badge tone="gray">{t("bk.prefs", { m: basket.preferences_met, t: basket.preferences_total })}</Badge>{" "}
        <Badge tone="gray">{t("bk.suppliers", { n: basket.supplier_count })}</Badge>
      </p>

      <table className="mt-3 w-full text-xs">
        <tbody>
          {basket.lines.map((l) => (
            <tr key={l.offer_id} className="border-t border-stone-100 align-top">
              <td className="py-1">
                <div className="font-medium">{label("ing", l.ingredient)}</div>
                <div className="text-stone-500">{l.product} · {state.suppliers[l.supplier_id]?.name}</div>
              </td>
              <td className="py-1 text-right tabular-nums">
                {l.packs} × {qty(l.pack_size, l.unit)}
                <div className="text-stone-500">{t("bk.need", { q: qty(l.required, l.unit) })}</div>
              </td>
              <td className="py-1 pl-2 text-right font-medium tabular-nums">{eur(l.cost_eur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {basket.unmet_preferences.length > 0 && (
        <p className="mt-2 text-xs text-amber-800">{t("bk.tradeoff", { u: basket.unmet_preferences.join("; ") })}</p>
      )}
      <p className="mt-2 text-[11px] text-stone-500">{basket.rule}</p>
    </div>
  );
}
