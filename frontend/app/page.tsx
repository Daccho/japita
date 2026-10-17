"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, eur, qty, INGREDIENT_LABEL, type BasketResult, type LLMCall, type Need, type State } from "@/lib/api";
import { Badge, Button, Card, ErrorNote } from "@/components/ui";
import Clarifications from "@/components/Clarifications";
import ProfilePicker from "@/components/ProfilePicker";
import { useProfile } from "@/components/useProfile";

export default function WeekPage() {
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

  if (error) return <ErrorNote error={`Cannot reach the API (${error}). Start it with: cd backend && uv run uvicorn japita.api:app`} />;
  if (!state || !needs || !baskets) return <p className="text-stone-500">Loading…</p>;

  const profile = state.profiles[profileId];
  const baseline = baskets.baskets.find((b) => b.kind === "baseline");
  const best = baskets.baskets.filter((b) => b.kind !== "baseline").sort((a, b) => a.delivered_total_eur - b.delivered_total_eur)[0];
  const pending = state.clarifications.filter((c) => c.state !== "replied");
  const servings = Object.entries(state.week.servings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-stone-500">Purchasing week {state.week.id} · {state.week.dates.join(" → ")}</p>
          <h1 className="text-2xl font-bold">{profile?.name ?? "No profile"}</h1>
          <p className="text-sm text-stone-600">{profile?.concept}</p>
        </div>
        <div className="ml-auto">
          <ProfilePicker profiles={state.profiles} value={profileId} onChange={setProfileId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Weekly budget" value={eur(profile?.weekly_budget_eur)} />
        <Stat label="Current suppliers (baseline)" value={eur(baseline?.delivered_total_eur)} note={baseline ? `${baseline.supplier_count} suppliers` : "no comparable baseline"} />
        <Stat
          label="Best feasible alternative"
          value={eur(best?.delivered_total_eur ?? baseline?.delivered_total_eur)}
          note={best?.vs_baseline_eur !== undefined ? `${best.vs_baseline_eur <= 0 ? "" : "+"}${eur(best.vs_baseline_eur)} vs baseline` : "baseline is already the best option"}
          accent
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="What we need this week" actions={<Link href="/basket" className="text-sm text-red-700 hover:underline">Compare baskets →</Link>}>
          <p className="mb-3 text-xs text-stone-500">
            Owner-entered servings ({servings.map(([k, v]) => `${k} ${v}`).join(", ")}). Calculated in code, not forecast by AI.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-stone-500">
              <tr>
                <th className="py-1">Ingredient</th>
                <th>Gross</th>
                <th>Stock + arrivals</th>
                <th>To buy</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(needs).map((n) => (
                <tr key={n.ingredient} className="border-t border-stone-100 align-top">
                  <td className="py-2">
                    <div className="font-medium">{INGREDIENT_LABEL[n.ingredient] ?? n.ingredient}</div>
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

        <Card title={<>Supplier questions {pending.length > 0 && <Badge tone="amber">{pending.length} open</Badge>}</>}>
          <Clarifications items={state.clarifications} offers={state.offers} onChange={load} />
        </Card>
      </div>

      <Card
        title="AI activity (served on AMD)"
        actions={<Button variant="secondary" onClick={load}>Refresh</Button>}
      >
        {calls.length === 0 ? (
          <p className="text-sm text-stone-500">No model calls recorded yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1">Time</th>
                <th>Purpose</th>
                <th>Model</th>
                <th>Backend</th>
                <th>Latency</th>
                <th>Tokens in/out</th>
                <th>Request ID</th>
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
