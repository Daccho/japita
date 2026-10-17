"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, eur, qty, type BasketResult, type LLMCall, type Need, type State } from "@/lib/api";
import { useI18n, useLabel } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote } from "@/components/ui";
import Clarifications from "@/components/Clarifications";
import ProfilePicker from "@/components/ProfilePicker";
import { useProfile } from "@/components/useProfile";

export default function WeekPage() {
  const { t } = useI18n();
  const label = useLabel();
  const [profileId, setProfileId] = useProfile();
  const [state, setState] = useState<State | null>(null);
  const [needs, setNeeds] = useState<Record<string, Need> | null>(null);
  const [baskets, setBaskets] = useState<BasketResult | null>(null);
  const [calls, setCalls] = useState<LLMCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, n, b, c] = await Promise.all([api.state(), api.needs(profileId), api.baskets(profileId), api.llmCalls(8)]);
      setState(s);
      setNeeds(n);
      setBaskets(b);
      setCalls(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  // While a question is out with the test supplier, poll so the reply appears without a manual refresh.
  const waiting = state?.clarifications.some((c) => c.state === "sent");
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [waiting, load]);

  if (error) return <ErrorNote error={t("apiDown", { e: error })} />;
  if (!state || !needs || !baskets) return <p className="text-stone-500">{t("loading")}</p>;

  const profile = state.profiles[profileId];
  const baseline = baskets.baskets.find((b) => b.kind === "baseline");
  const best = baskets.baskets.filter((b) => b.kind !== "baseline").sort((a, b) => a.delivered_total_eur - b.delivered_total_eur)[0];
  const open = state.clarifications.filter((c) => c.state !== "replied");
  const servings = Object.entries(state.week.servings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-stone-500">{t("week.title", { id: state.week.id, dates: state.week.dates.join(" → ") })}</p>
          <h1 className="text-2xl font-bold">{profile?.name ?? "—"}</h1>
          <p className="text-sm text-stone-600">{profile?.concept}</p>
        </div>
        <div className="ml-auto">
          <ProfilePicker profiles={state.profiles} value={profileId} onChange={setProfileId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("week.budget")} value={eur(profile?.weekly_budget_eur)} />
        <Stat
          label={t("week.baseline")}
          value={eur(baseline?.delivered_total_eur)}
          note={baseline ? t("week.nSuppliers", { n: baseline.supplier_count }) : t("week.noBaseline")}
        />
        <Stat
          label={t("week.best")}
          value={eur(best?.delivered_total_eur ?? baseline?.delivered_total_eur)}
          note={
            best?.vs_baseline_eur !== undefined
              ? t("week.vsBaseline", { d: `${best.vs_baseline_eur <= 0 ? "" : "+"}${eur(best.vs_baseline_eur)}` })
              : t("week.baselineBest")
          }
          accent
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card title={t("week.needs")} actions={<Link href="/basket" className="text-sm text-red-700 hover:underline">{t("week.compare")}</Link>}>
          <p className="mb-3 text-xs text-stone-500">{t("week.needsNote", { s: servings.map(([k, v]) => `${k} ${v}`).join(", ") })}</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1">{t("week.ingredient")}</th>
                <th>{t("week.gross")}</th>
                <th>{t("week.stock")}</th>
                <th>{t("week.toBuy")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(needs).map((n) => (
                <tr key={n.ingredient} className="border-t border-stone-100 align-top">
                  <td className="py-2">
                    <div className="font-medium">{label("ing", n.ingredient)}</div>
                    <div className="text-xs text-stone-500">{n.formula}</div>
                  </td>
                  <td className="py-2">{qty(n.gross, n.unit)}</td>
                  <td className="py-2">{qty(n.usable_stock + n.confirmed_arrivals, n.unit)}</td>
                  <td className="py-2 font-semibold">{qty(n.required, n.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={<>{t("week.questions")} {open.length > 0 && <Badge tone="amber">{t("week.open", { n: open.length })}</Badge>}</>}>
          <Clarifications items={state.clarifications} offers={state.offers} profileId={profileId} baselineBefore={baskets} onChange={load} />
        </Card>
      </div>

      <Card title={t("week.ai")} actions={<Button variant="secondary" onClick={load}>{t("refresh")}</Button>}>
        {calls.length === 0 ? (
          <p className="text-sm text-stone-500">{t("week.noCalls")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1">{t("col.time")}</th>
                  <th>{t("col.purpose")}</th>
                  <th>{t("col.model")}</th>
                  <th>{t("col.backend")}</th>
                  <th>{t("col.latency")}</th>
                  <th>{t("col.tokens")}</th>
                  <th>{t("col.request")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.request_id + c.created_at} className="border-t border-stone-100">
                    <td className="py-1">{c.created_at ? new Date(c.created_at).toLocaleTimeString() : ""}</td>
                    <td>{c.purpose}</td>
                    <td className="font-medium">{c.model}</td>
                    <td>{c.backend}</td>
                    <td>{c.latency_ms} ms</td>
                    <td>{c.prompt_tokens ?? "?"}/{c.completion_tokens ?? "?"}</td>
                    <td className="font-mono">{c.request_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-red-200 bg-red-50" : "border-stone-200 bg-white"}`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {note && <p className="text-xs text-stone-600">{note}</p>}
    </div>
  );
}
