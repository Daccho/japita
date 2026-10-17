"use client";

import { useState } from "react";
import { api, type Clarification, type Offer } from "@/lib/api";
import { Badge, Button } from "@/components/ui";

const STATE_TONE = { draft: "amber", approved: "blue", sent: "blue", replied: "green" } as const;

// Japanese supplier questions drafted by the agent. A person approves; replies are entered as labeled test data.
export default function Clarifications({ items, offers, onChange }: {
  items: Clarification[];
  offers: Offer[];
  onChange: () => void;
}) {
  const [reply, setReply] = useState<Record<string, { value: string; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) {
    return <p className="text-sm text-stone-500">No supplier questions. Ask the advisor to review this week&apos;s basket.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {items.map((c) => {
        const offer = offers.find((o) => o.id === c.offer_id);
        const r = reply[c.id] ?? { value: "", text: "" };
        return (
          <div key={c.id} className="rounded border border-stone-200 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={STATE_TONE[c.state]}>{c.state}</Badge>
              <span className="font-medium">{offer?.product ?? c.offer_id}</span>
              <span className="text-stone-500">· missing: {c.field}</span>
            </div>
            <p className="text-xs text-stone-500">{c.reason}</p>
            <p lang="ja" className="mt-2 rounded bg-stone-50 p-2 text-sm">{c.text_ja}</p>
            {c.state === "draft" && (
              <div className="mt-2">
                <Button onClick={() => run(c.id, () => api.approveClarification(c.id))} disabled={busy === c.id}>
                  Approve message
                </Button>
                <span className="ml-2 text-xs text-stone-500">Demo: approval does not send a real message.</span>
              </div>
            )}
            {(c.state === "approved" || c.state === "sent") && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                <input
                  placeholder="value, e.g. 28"
                  value={r.value}
                  onChange={(e) => setReply({ ...reply, [c.id]: { ...r, value: e.target.value } })}
                  className="rounded border border-stone-300 px-2 py-1 text-sm"
                />
                <input
                  lang="ja"
                  placeholder="supplier reply text (test data)"
                  value={r.text}
                  onChange={(e) => setReply({ ...reply, [c.id]: { ...r, text: e.target.value } })}
                  className="rounded border border-stone-300 px-2 py-1 text-sm"
                />
                <Button
                  variant="secondary"
                  disabled={!r.value || !r.text || busy === c.id}
                  onClick={() => run(c.id, () => api.replyClarification(c.id, parseValue(r.value), r.text))}
                >
                  Record test reply
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function parseValue(v: string): unknown {
  const t = v.trim();
  if (t === "true" || t === "false") return t === "true";
  const n = Number(t.replace(/%$/, ""));
  return Number.isFinite(n) && t !== "" ? n : t;
}
