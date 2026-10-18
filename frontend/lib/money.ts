// Prices are stored and calculated in EUR. These helpers show an EUR amount in the UI language's currency,
// converted with the latest European Central Bank reference rates (GET /api/fx). Convert only for display,
// after any EUR sums are computed. While rates are loading or unavailable, amounts are shown in EUR.

import { useEffect, useState } from "react";

export type Currency = "EUR" | "JPY" | "USD";

export type Rates = {
  base: "EUR";
  rates: Record<Currency, number>;
  date: string | null;
  source: string;
  stale: boolean;
};

let cached: Rates | null = null;
let pending: Promise<Rates | null> | null = null;

/** Fetches the rates once per page load; later calls reuse the result. */
export function loadRates(): Promise<Rates | null> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch("/api/fx", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Rates>) : null))
      .then((r) => {
        const ok = r && r.rates && r.rates.JPY > 0 && r.rates.USD > 0 ? r : null;
        cached = ok;
        if (!ok) pending = null;
        return ok;
      })
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

export function useRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(cached);
  useEffect(() => {
    let live = true;
    loadRates().then((r) => {
      if (live && r) setRates(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return rates;
}

const fractionDigits = (c: Currency) => (c === "JPY" ? 0 : 2);

export type MoneyTools = {
  /** The currency amounts are shown in right now (EUR until rates arrive). */
  currency: Currency;
  /** EUR amount -> "€8.50" / "$9.18" / "¥1,387". */
  money: (eur: number | null | undefined, unknown?: string) => string;
  /** EUR amount -> number in the shown currency (for prefilling inputs). */
  fromEur: (eur: number) => number;
  /** Amount in the shown currency -> EUR, rounded to cents. */
  toEur: (amount: number) => number;
  /** Currency symbol for input adornments. */
  symbol: string;
  /** "1 EUR = $1.08 · ECB 2026-10-17", or "" when showing EUR. */
  note: string;
};

export function moneyTools(wanted: Currency, locale: string, rates: Rates | null, ecbLabel = "ECB"): MoneyTools {
  const currency: Currency = wanted !== "EUR" && rates ? wanted : "EUR";
  const rate = currency === "EUR" ? 1 : rates!.rates[currency];
  const digits = fractionDigits(currency);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const symbol = fmt.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  const rateFmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return {
    currency,
    symbol,
    money: (eur, unknown = "?") => (eur === null || eur === undefined || Number.isNaN(eur) ? unknown : fmt.format(eur * rate)),
    fromEur: (eur) => Number((eur * rate).toFixed(digits)),
    toEur: (amount) => Math.round((amount / rate) * 100) / 100,
    note:
      currency === "EUR"
        ? ""
        : `1 EUR = ${rateFmt.format(rate)} · ${ecbLabel}${rates?.date ? ` ${rates.date}` : ""}`,
  };
}

/** EUR formatted for transparency hints next to converted inputs ("≈ €8.50"). */
export const formatEurPlain = (eur: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(eur);
