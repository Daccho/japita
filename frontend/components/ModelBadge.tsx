"use client";

import { useEffect, useState } from "react";
import { api, type LLMCall } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// Shows the model that actually served the most recent request (from the llm_calls log), not a static label.
export default function ModelBadge() {
  const { t } = useI18n();
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
      title={t("model.title")}
      className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs hover:bg-stone-100"
    >
      <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : call ? "bg-emerald-500" : "bg-stone-300"}`} />
      {checking ? (
        t("model.checking")
      ) : error ? (
        error
      ) : call ? (
        <>
          <span className="font-semibold">{shortModel(call.model)}</span>
          <span className="text-stone-500">· {call.backend} · {call.latency_ms} ms</span>
        </>
      ) : (
        t("model.none")
      )}
    </button>
  );
}

export const shortModel = (m: string) => m.replace(/^self-dploy\//, "");
