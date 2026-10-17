"use client";

import { useCallback, useEffect, useState } from "react";
import { api, eur, INGREDIENT_LABEL, type BasketResult, type Profile, type Rule, type State } from "@/lib/api";
import { Badge, Button, Card, ErrorNote } from "@/components/ui";
import ProfilePicker from "@/components/ProfilePicker";
import { useProfile } from "@/components/useProfile";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const LEVELS = ["low", "medium", "high"] as const;

export default function GoalsPage() {
  const [profileId, setProfileId] = useProfile();
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [impact, setImpact] = useState<{ before: BasketResult; after: BasketResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setDraft(structuredClone(s.profiles[profileId] ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profileId]);

  useEffect(() => {
    load();
    setImpact(null);
  }, [load]);

  if (error) return <ErrorNote error={error} />;
  if (!state || !draft) return <p className="text-stone-500">Loading…</p>;

  const update = (fn: (p: Profile) => void) => {
    const next = structuredClone(draft);
    fn(next);
    setDraft(next);
  };

  const move = (ingredient: string, from: "mandatory" | "negotiable", index: number) =>
    update((p) => {
      const to = from === "mandatory" ? "negotiable" : "mandatory";
      const [rule] = p.ingredients[ingredient][from].splice(index, 1);
      p.ingredients[ingredient][to].push(rule);
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const before = await api.baskets(draft.id);
      await api.putProfile(draft);
      const after = await api.baskets(draft.id);
      setImpact({ before, after });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Restaurant goals</h1>
          <p className="text-sm text-stone-600">
            Must-haves always hold. Preferences can be traded for price. Move a rule between the two and see the basket change.
          </p>
        </div>
        <div className="ml-auto">
          <ProfilePicker profiles={state.profiles} value={profileId} onChange={setProfileId} />
        </div>
      </div>

      <Card title="Restaurant">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input value={draft.name} onChange={(e) => update((p) => { p.name = e.target.value; })} className="input" />
          </Field>
          <Field label="Weekly purchasing budget (€)">
            <input
              type="number"
              value={draft.weekly_budget_eur}
              onChange={(e) => update((p) => { p.weekly_budget_eur = Number(e.target.value); })}
              className="input"
            />
          </Field>
          <Field label="Concept" wide>
            <textarea value={draft.concept} rows={2} onChange={(e) => update((p) => { p.concept = e.target.value; })} className="input" />
          </Field>
          <Field label="Priorities">
            <div className="flex flex-wrap gap-3">
              {Object.keys(draft.priorities).map((k) => (
                <label key={k} className="flex items-center gap-1 text-sm">
                  {k}
                  <select
                    value={draft.priorities[k]}
                    onChange={(e) => update((p) => { p.priorities[k] = e.target.value as (typeof LEVELS)[number]; })}
                    className="rounded border border-stone-300 px-1 py-0.5"
                  >
                    {LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Accepted delivery days">
            <div className="flex flex-wrap gap-2 text-sm">
              {DAYS.map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={draft.accepted_delivery_days.includes(d)}
                    onChange={(e) =>
                      update((p) => {
                        p.accepted_delivery_days = e.target.checked
                          ? [...p.accepted_delivery_days, d]
                          : p.accepted_delivery_days.filter((x) => x !== d);
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(draft.ingredients).map(([ing, prefs]) => (
          <Card key={ing} title={INGREDIENT_LABEL[ing] ?? ing}>
            <RuleList title="Must-haves" tone="red" rules={prefs.mandatory} action="→ preference" onMove={(i) => move(ing, "mandatory", i)}
              onValue={(i, v) => update((p) => { p.ingredients[ing].mandatory[i].value = v; })} />
            <RuleList title="Preferences" tone="gray" rules={prefs.negotiable} action="→ must-have" onMove={(i) => move(ing, "negotiable", i)}
              onValue={(i, v) => update((p) => { p.ingredients[ing].negotiable[i].value = v; })} />
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save and recalculate"}</Button>
        <Button variant="secondary" onClick={load} disabled={busy}>Discard changes</Button>
        {impact && <Impact before={impact.before} after={impact.after} />}
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid #d6d3d1;
          border-radius: 0.25rem;
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}

function RuleList({ title, tone, rules, action, onMove, onValue }: {
  title: string;
  tone: "red" | "gray";
  rules: Rule[];
  action: string;
  onMove: (i: number) => void;
  onValue: (i: number, v: unknown) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      {rules.length === 0 && <p className="text-xs text-stone-400">none</p>}
      <ul className="space-y-1">
        {rules.map((r, i) => (
          <li key={r.field + i} className="flex flex-wrap items-center gap-2 rounded border border-stone-100 p-1.5 text-sm">
            <Badge tone={tone}>{r.label}</Badge>
            {(r.op === "gte" || r.op === "lte") && (
              <span className="flex items-center gap-1 text-xs text-stone-500">
                {r.op === "gte" ? "≥" : "≤"}
                <input
                  type="number"
                  value={Number(r.value)}
                  onChange={(e) => onValue(i, Number(e.target.value))}
                  className="w-14 rounded border border-stone-300 px-1"
                />
              </span>
            )}
            <button onClick={() => onMove(i)} className="ml-auto text-xs text-red-700 hover:underline">{action}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function cheapest(r: BasketResult) {
  return r.baskets.reduce<number | null>((m, b) => (m === null || b.delivered_total_eur < m ? b.delivered_total_eur : m), null);
}

function Impact({ before, after }: { before: BasketResult; after: BasketResult }) {
  const b = cheapest(before);
  const a = cheapest(after);
  if (a === null) return <span className="text-sm text-red-700">{after.conflict ?? "No feasible basket with these rules."}</span>;
  const diff = b === null ? null : a - b;
  return (
    <span className="text-sm">
      Lowest feasible basket: {eur(b)} → <strong>{eur(a)}</strong>
      {diff !== null && diff !== 0 && (
        <span className={`ml-2 font-semibold ${diff < 0 ? "text-emerald-700" : "text-red-700"}`}>
          ({diff < 0 ? "" : "+"}{eur(diff)})
        </span>
      )}
      <a href="/basket" className="ml-3 text-red-700 hover:underline">See baskets →</a>
    </span>
  );
}
