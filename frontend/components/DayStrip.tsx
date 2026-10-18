"use client";

import { useId, useState } from "react";
import { Check, TriangleAlert, Truck, X } from "lucide-react";
import type { DayView } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// Seven-day stock strip for one ingredient. Each day is a button; selecting one opens its figures below the strip.
export default function DayStrip({ days }: { days: DayView[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const panelId = useId();
  const day = days.find((x) => x.date === open);

  return (
    <>
      <div className="jp-days">
        {days.map((x) => {
          const selected = open === x.date;
          const Icon = x.status === "short" ? TriangleAlert : x.status === "arrival" ? Truck : Check;
          return (
            <button
              key={x.date}
              type="button"
              className={`jp-day ${x.status === "short" ? "jp-day-short" : ""} ${x.status === "arrival" ? "jp-day-arrival" : ""}`}
              aria-pressed={selected}
              aria-expanded={selected}
              aria-controls={panelId}
              aria-label={x.aria}
              title={x.title}
              onClick={() => setOpen(selected ? null : x.date)}
            >
              <strong>{x.short_label}</strong>
              <span className="jp-day-value">{x.value_text}</span>
              <Icon className="jp-day-icon" aria-hidden />
            </button>
          );
        })}
      </div>
      {day && (
        <div className="jp-day-detail" id={panelId} role="region" aria-label={day.label}>
          <div className="jp-line-head" style={{ marginBottom: 8 }}>
            <h4>{day.label}</h4>
            <button type="button" className="jp-close" aria-label={t("close")} onClick={() => setOpen(null)}>
              <X aria-hidden />
            </button>
          </div>
          <dl className="jp-kv">
            {day.detail.map((r, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt className={r.sub ? "jp-day-detail-sub" : undefined}>{r.label}</dt>
                <dd className={r.warn ? "jp-day-detail-short" : undefined}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
