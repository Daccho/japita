"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Badge, Button } from "@/components/ui";
import { shortModel } from "@/components/ModelBadge";

type Result = Awaited<ReturnType<typeof api.uploadSpec>>;

// Upload a Japanese spec sheet (image or text). Gemma reads it twice in parallel; disagreements become "needs review".
export default function SpecUpload({ offerId, onDone }: { offerId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.uploadSpec(offerId, file));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-dashed border-stone-300 p-3">
      <p className="mb-2 text-xs font-semibold text-stone-600">{t("spec.title")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="image/*,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        <Button onClick={upload} disabled={!file || busy}>{busy ? t("spec.reading") : t("spec.read")}</Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {result && (
        <div className="mt-3 text-xs">
          <p className="mb-1 text-stone-600">
            <span className="font-semibold text-red-700">AMD</span> ·{" "}
            {t("spec.result", { ms: result.elapsed_ms, model: shortModel(result.calls[0]?.model ?? ""), backend: result.calls[0]?.backend ?? "" })}
          </p>
          <table className="w-full">
            <thead className="text-left text-stone-500">
              <tr>
                <th>{t("spec.field")}</th>
                <th>{t("spec.r1")}</th>
                <th>{t("spec.r2")}</th>
                <th>{t("spec.outcome")}</th>
                <th>{t("spec.source")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.fields).map(([k, f]) => (
                <tr key={k} className="border-t border-stone-100">
                  <td className="py-1 font-mono">{k}</td>
                  <td>{String(f.read_1)}</td>
                  <td>{String(f.read_2)}</td>
                  <td>
                    <Badge tone={f.status === "ok" ? "green" : "amber"}>{f.status === "ok" ? t("spec.agree") : f.status.replace("_", " ")}</Badge>
                  </td>
                  <td lang="ja">{f.source_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
