"use client";

import { useId, useState } from "react";
import { Check, TriangleAlert, Truck, X } from "lucide-react";
import { qty, type Delivery, type TimelineDay } from "@/lib/api";
import { useDates, useI18n } from "@/lib/i18n";
import { useWorkspace } from "@/components/workspace";

// Seven-day stock strip for one ingredient. Each day is a button; selecting one opens its full figures below the strip.
export default function DayStrip({ ingredient, unit, days }: { ingredient: string; unit: string; days: TimelineDay[] }) {
  const { t } = useI18n();
  const d = useDates();
  const { data } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);
  const panelId = useId();
  const day = days.find((x) => x.date === open);
  const deliveries = (data?.state.week.deliveries ?? []).filter(
    (dl) => dl.ingredient === ingredient && day && (dl.date === day.date || dl.revised_date === day.date),
  );

  return (
    <>
      <div className="jp-days">
        {days.map((x) => {
          const selected = open === x.date;
          const Icon = x.shortfall > 0 ? TriangleAlert : x.arrived > 0 ? Truck : Check;
          return (
            <button
              key={x.date}
              type="button"
              className={`jp-day ${x.shortfall > 0 ? "jp-day-short" : ""} ${x.arrived > 0 ? "jp-day-arrival" : ""}`}
              aria-pressed={selected}
              aria-expanded={selected}
              aria-controls={panelId}
              aria-label={t("day.show", { day: d.day(x.date) })}
              title={`${d.day(x.date)} · ${qty(x.end_stock, unit)}`}
              onClick={() => setOpen(selected ? null : x.date)}
            >
              <strong>{d.day(x.date).split(" ")[0]}</strong>
              <span className="jp-day-value">{x.shortfall > 0 ? `−${qty(x.shortfall, unit)}` : qty(x.end_stock, unit)}</span>
              <Icon className="jp-day-icon" aria-hidden />
            </button>
          );
        })}
      </div>
      {day && (
        <div className="jp-day-detail" id={panelId} role="region" aria-label={d.day(day.date)}>
          <div className="jp-line-head" style={{ marginBottom: 8 }}>
            <h4>{d.day(day.date)}</h4>
            <button type="button" className="jp-close" aria-label={t("close")} onClick={() => setOpen(null)}>
              <X aria-hidden />
            </button>
          </div>
          <dl className="jp-kv">
            <dt>{t("day.demand")}</dt>
            <dd>{qty(day.demand, unit)}</dd>
            <dt>{t("day.start")}</dt>
            <dd>{qty(day.available_start, unit)}</dd>
            <dt>{t("day.arrivals")}</dt>
            <dd>{day.arrived > 0 ? qty(day.arrived, unit) : t("day.noArrivals")}</dd>
            {deliveries.map((dl) => (
              <ArrivalRow key={dl.id} delivery={dl} date={day.date} />
            ))}
            <dt>{t("day.expired")}</dt>
            <dd>{qty(day.expired, unit)}</dd>
            <dt>{t("day.used")}</dt>
            <dd>{qty(day.used, unit)}</dd>
            <dt>{t("day.shortfall")}</dt>
            <dd className={day.shortfall > 0 ? "jp-day-detail-short" : undefined}>{qty(day.shortfall, unit)}</dd>
            <dt>{t("day.end")}</dt>
            <dd>{qty(day.end_stock, unit)}</dd>
          </dl>
        </div>
      )}
    </>
  );
}

function ArrivalRow({ delivery: dl, date }: { delivery: Delivery; date: string }) {
  const { t } = useI18n();
  const d = useDates();
  const { data } = useWorkspace();
  const supplier = data?.state.suppliers[dl.supplier_id]?.name ?? "";
  const status =
    dl.status === "cancelled"
      ? t("day.cancelled")
      : dl.status === "delayed" && dl.revised_date
        ? dl.revised_date === date
          ? t("day.delayedFrom", { date: d.day(dl.date) })
          : t("day.delayed", { date: d.day(dl.revised_date) })
        : t("day.confirmed");
  return (
    <>
      <dt className="jp-day-detail-sub">{supplier}</dt>
      <dd className={dl.status === "confirmed" ? undefined : "jp-day-detail-short"}>
        {qty(dl.qty, dl.unit)} · {status}
      </dd>
    </>
  );
}
