"use client";

import { useCallback, useEffect, useState } from "react";
import { api, eur, INGREDIENT_LABEL, type Evidence, type Offer, type State } from "@/lib/api";
import { Badge, Card, ErrorNote, ROUTE_LABEL, STATUS_LABEL } from "@/components/ui";
import ProfilePicker from "@/components/ProfilePicker";
import SpecUpload from "@/components/SpecUpload";
import { useProfile } from "@/components/useProfile";

export default function SuppliersPage() {
  const [profileId, setProfileId] = useProfile();
  const [state, setState] = useState<State | null>(null);
  const [evidence, setEvidence] = useState<Record<string, Evidence>>({});
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.state();
      const ev = await Promise.all(s.offers.map((o) => api.evidence(o.id, profileId)));
      setState(s);
      setEvidence(Object.fromEntries(ev.map((e) => [e.offer_id, e])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorNote error={error} />;
  if (!state) return <p className="text-stone-500">Loading…</p>;

  const ingredients = Array.from(new Set(state.offers.map((o) => o.ingredient)));
  const suppliers = Object.values(state.suppliers).sort((a, b) => (a.relationship === b.relationship ? a.name.localeCompare(b.name) : a.relationship === "existing" ? -1 : 1));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers &amp; offers</h1>
          <p className="text-sm text-stone-600">
            Existing suppliers and discovered candidates in one view. Japanese specifications are read by Gemma on AMD; every
            extracted value keeps its source text.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1 text-sm">
            <option value="all">All ingredients</option>
            {ingredients.map((i) => (
              <option key={i} value={i}>{INGREDIENT_LABEL[i] ?? i}</option>
            ))}
          </select>
          <ProfilePicker profiles={state.profiles} value={profileId} onChange={setProfileId} />
        </div>
      </div>

      {suppliers.map((s) => {
        const offers = state.offers.filter((o) => o.supplier_id === s.id && (filter === "all" || o.ingredient === filter));
        if (!offers.length) return null;
        return (
          <Card
            key={s.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {s.name}
                <Badge tone={s.relationship === "existing" ? "violet" : "gray"}>{s.relationship === "existing" ? "Current supplier" : "Candidate"}</Badge>
                {s.account_status !== "approved" && <Badge tone="amber">Account {s.account_status}</Badge>}
              </span>
            }
          >
            <p className="mb-2 text-xs text-stone-500">
              Min. order {eur(s.min_order_eur)} · shipping {eur(s.shipping_eur)} · delivers {s.delivery_days.join(", ") || "unknown"}
            </p>
            <div className="divide-y divide-stone-100">
              {offers.map((o) => (
                <OfferRow
                  key={o.id}
                  offer={o}
                  evidence={evidence[o.id]}
                  flags={state.review_flags[o.id]}
                  open={open === o.id}
                  onToggle={() => setOpen(open === o.id ? null : o.id)}
                  onUpdated={load}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function OfferRow({ offer, evidence, flags, open, onToggle, onUpdated }: {
  offer: Offer;
  evidence?: Evidence;
  flags?: Record<string, { read_1: unknown; read_2: unknown }>;
  open: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  const route = ROUTE_LABEL[offer.origin_route];
  const status = evidence ? STATUS_LABEL[evidence.status] : null;
  const perUnit = (offer.price_eur / offer.pack_size) * 1000;

  return (
    <div className="py-2">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-2 text-left text-sm">
        <span className="w-4 text-stone-400">{open ? "▾" : "▸"}</span>
        <span className="font-medium">{offer.product}</span>
        <span className="text-stone-500">{INGREDIENT_LABEL[offer.ingredient] ?? offer.ingredient}</span>
        {route && <Badge tone={route.tone}>{route.label}</Badge>}
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
        {evidence && !evidence.orderability.orderable && <Badge tone="amber">Not orderable</Badge>}
        <span className="ml-auto tabular-nums">
          {eur(offer.price_eur)} / {offer.pack_size / 1000} {offer.unit === "g" ? "kg" : "L"}
          <span className="ml-2 text-xs text-stone-500">({eur(perUnit)}/{offer.unit === "g" ? "kg" : "L"})</span>
        </span>
      </button>

      {open && evidence && (
        <div className="ml-6 mt-2 space-y-3 text-sm">
          <RuleTable title="Must-haves" rows={evidence.mandatory} flags={flags} />
          {evidence.negotiable.length > 0 && <RuleTable title="Preferences" rows={evidence.negotiable} flags={flags} />}
          {!evidence.orderability.orderable && (
            <p className="text-xs text-amber-800">Not orderable: {evidence.orderability.reasons.join("; ")}</p>
          )}
          <p className="text-xs text-stone-500">
            Offer dated {offer.offer_date} · document {offer.document ?? "none"} · comparison group {offer.comparison_group}
          </p>
          <SpecUpload offerId={offer.id} onDone={onUpdated} />
        </div>
      )}
    </div>
  );
}

function RuleTable({ title, rows, flags }: {
  title: string;
  rows: Evidence["mandatory"];
  flags?: Record<string, { read_1: unknown; read_2: unknown }>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => {
            const s = STATUS_LABEL[r.outcome] ?? { label: r.outcome, tone: "gray" as const };
            const flag = flags?.[r.field];
            return (
              <tr key={r.field} className="border-t border-stone-100 align-top">
                <td className="w-1/4 py-1">{r.rule ?? r.preference}</td>
                <td className="w-24 py-1"><Badge tone={r.outcome === "ok" ? "green" : s.tone}>{r.outcome === "ok" ? "Met" : s.label}</Badge></td>
                <td className="w-24 py-1 font-mono">{r.value === null || r.value === undefined ? "unknown" : String(r.value)}</td>
                <td className="py-1">
                  {r.source_text ? <span lang="ja" className="rounded bg-stone-50 px-1">“{r.source_text}”</span> : <span className="text-stone-400">no source text</span>}
                  {flag && (
                    <span className="ml-2 text-amber-800">
                      reads disagree: {String(flag.read_1)} vs {String(flag.read_2)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
