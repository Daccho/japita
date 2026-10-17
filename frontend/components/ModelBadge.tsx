"use client";

import { useEffect, useState } from "react";
import { api, type LLMCall } from "@/lib/api";

// Shows the model that actually served the most recent request (from the llm_calls log), not a static label.
export default function ModelBadge() {
  const [call, setCall] = useState<LLMCall | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.llmCalls(1).then((c) => setCall(c[0] ?? null)).catch(() => setError("API offline"));
  }, []);

  const ping = async () => {
    setChecking(true);
    setError(null);
    try {
      setCall(await api.health());
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 60) : "model check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <button
      onClick={ping}
      title="Click to send a live test request to the model endpoint"
      className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs hover:bg-stone-100"
    >
      <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : call ? "bg-emerald-500" : "bg-stone-300"}`} />
      {checking ? (
        "checking model…"
      ) : error ? (
        error
      ) : call ? (
        <>
          <span className="font-semibold">{call.model.replace(/^self-dploy\//, "")}</span>
          <span className="text-stone-500">· {call.backend} · {call.latency_ms} ms</span>
        </>
      ) : (
        "no model calls yet · click to check"
      )}
    </button>
  );
}
