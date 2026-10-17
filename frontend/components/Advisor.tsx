"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, type AgentStep } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { useI18n, type Key } from "@/lib/i18n";

const SUGGESTIONS: Key[] = ["adv.q1", "adv.q2", "adv.q3"];

// The main agent: Gemma on AMD calls application tools for every number, then explains the trade-offs.
export default function Advisor({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(t(SUGGESTIONS[0]));
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setAnswer(null);
    setSteps([]);
    const started = performance.now();
    try {
      const r = await api.ask(question, profileId);
      setAnswer(r.answer);
      setSteps(r.steps);
      setElapsed(Math.round(performance.now() - started));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tools = steps.filter((s) => s.type === "tool");

  return (
    <Card title={t("adv.title")} className="lg:row-span-2">
      <div className="space-y-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          className="w-full rounded border border-stone-300 p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={ask} disabled={busy || !question.trim()}>{busy ? t("adv.thinking") : t("adv.ask")}</Button>
          {SUGGESTIONS.map((k) => (
            <button key={k} onClick={() => setQuestion(t(k))} className="text-left text-xs text-stone-500 hover:text-red-700">
              {t(k)}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}

        {tools.length > 0 && (
          <ol className="space-y-1 rounded bg-stone-50 p-2 text-xs">
            {tools.map((s, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-mono font-semibold">{s.name}</span>
                {s.arguments && s.arguments !== "{}" && <span className="truncate font-mono text-stone-500">{s.arguments.slice(0, 80)}</span>}
                <span className="ml-auto text-stone-400">{s.model} · {s.latency_ms} ms</span>
              </li>
            ))}
          </ol>
        )}

        {answer && (
          <>
            <div className="prose-answer text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
            </div>
            <p className="text-xs text-stone-500">
              {t("adv.footer", { n: tools.length, ms: elapsed ?? 0 })}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
