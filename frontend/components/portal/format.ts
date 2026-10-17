// Formatting helpers for the supplier portal (Japanese / English).

import { PortalError, type FormField, type Origin } from "@/lib/portal";
import type { Lang } from "./i18n";

const eur = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
export const formatEur = (v: number | null | undefined) => (v == null ? "—" : eur.format(v));

const WEEKDAYS: Record<Lang, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO date (YYYY-MM-DD) -> "10月27日(火)" / "Tue, Oct 27". Parsed as a calendar date, not a UTC instant. */
export function formatDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const wd = WEEKDAYS[lang][new Date(y, m - 1, d).getDay()];
  return lang === "ja" ? `${m}月${d}日(${wd})` : `${wd}, ${MONTHS_EN[m - 1]} ${d}`;
}

/** ISO timestamp -> "10月17日 22:25" / "Oct 17, 22:25" in the viewer's time zone. */
export function formatDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return lang === "ja"
    ? `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
    : `${MONTHS_EN[date.getMonth()]} ${date.getDate()}, ${time}`;
}

const trim = (n: number) => Number(n.toFixed(2)).toLocaleString("en-US");

/** 1000 g -> "1 kg", 500 g -> "500 g", 1000 ml -> "1 L". */
export function formatQty(qty: number, unit: "g" | "ml"): string {
  if (qty >= 1000) return `${trim(qty / 1000)} ${unit === "g" ? "kg" : "L"}`;
  return `${trim(qty)} ${unit}`;
}

/** Counter word for packs: bottles of soy sauce, bags for everything else. */
export function packWord(ingredient: string, count: number, lang: Lang): string {
  const bottle = ingredient === "soy_sauce";
  if (lang === "ja") return bottle ? "本" : "袋";
  return bottle ? (count === 1 ? "bottle" : "bottles") : count === 1 ? "bag" : "bags";
}

export const originLabel = (o: Origin, t: { originJapan: string; originEurope: string; originItaly: string }) =>
  ({ japan: t.originJapan, europe: t.originEurope, italy: t.originItaly })[o];

/** Form label in the chosen language. */
export const fieldLabel = (f: FormField, lang: Lang) => (lang === "en" && f.label_en ? f.label_en : f.label_ja);

/** Short field label: drops the "（例：…）" / "(e.g. …)" hint used on input forms. */
export const shortLabel = (f: FormField, lang: Lang) =>
  fieldLabel(f, lang)
    .replace(/（.*?）/g, "")
    .replace(/\s*\(.*?\)/g, "");

export function formatValue(
  value: unknown,
  f: FormField | undefined,
  t: { yes: string; no: string; notSet: string },
): string {
  if (value === null || value === undefined || value === "") return t.notSet;
  if (typeof value === "boolean") return value ? t.yes : t.no;
  return `${value}${f?.unit ?? ""}`;
}

/** Ingredient name in the chosen language. */
export function ingredientName(
  key: string,
  lang: Lang,
  names: { ja?: string | null; en?: string | null },
): string {
  return (lang === "en" ? names.en : names.ja) ?? names.ja ?? key;
}

export const errorMessage = (e: unknown, lang: Lang, fallback: string) =>
  e instanceof PortalError ? (lang === "en" ? e.en : e.ja) : fallback;
