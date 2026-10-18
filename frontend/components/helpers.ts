import type { Basket, BasketKind, BasketResult } from "@/lib/api";

export function findBasket(r: BasketResult | undefined, kind: string): Basket | undefined {
  return r?.baskets.find((b) => b.kind === kind || (b.also as string[]).includes(kind));
}

// What the advisor suggests: on time if possible, otherwise the cheapest feasible basket.
export function suggestedBasket(r: BasketResult | undefined): Basket | undefined {
  const b = findBasket(r, "on_time") ?? findBasket(r, "lowest_cost") ?? r?.baskets[0];
  return b && b.lines.length ? b : undefined; // nothing to buy: every need is covered
}

export const KIND_ORDER: BasketKind[] = ["baseline", "on_time", "lowest_cost", "best_fit", "fewest_suppliers"];

export function fmtValue(v: unknown, yes: string, no: string): string {
  if (v === null || v === undefined) return "—";
  if (v === true) return yes;
  if (v === false) return no;
  return String(v);
}

export function copyText(text: string) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {}
}

// Stable per-order key so a retried submit never creates a duplicate order.
export function idempotencyKey(poId: string): string {
  const k = `japita.idem.${poId}`;
  try {
    const saved = localStorage.getItem(k);
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem(k, fresh);
    return fresh;
  } catch {
    return `${poId}-${Date.now()}`;
  }
}
