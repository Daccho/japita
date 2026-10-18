// Thin client for the FastAPI backend. Types mirror backend/japita (api.py, calc.py, stock.py, orders.py, portal.py).
import type { DrawingReference } from "@/lib/drawings";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`${status} ${path}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw new ApiError(res.status, path, (await res.text()).slice(0, 500));
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

// Human-readable detail from a FastAPI error body, if any.
export function errorDetail(e: unknown): string {
  if (e instanceof ApiError) {
    try {
      const d = JSON.parse(e.body).detail;
      if (typeof d === "string") return d;
    } catch {}
    return e.body || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export type Translations = { it?: string; en?: string };
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type Rule = { field: string; op: "eq" | "in" | "gte" | "lte"; value: unknown; label: string };
export type Profile = {
  id: string;
  name: string;
  concept: string;
  menu_price_eur: number[];
  weekly_budget_eur: number;
  priorities: Record<string, "low" | "medium" | "high">;
  accepted_delivery_days: Day[];
  ingredients: Record<string, { mandatory: Rule[]; negotiable: Rule[] }>;
};
export type Supplier = {
  id: string;
  name: string;
  relationship: "existing" | "candidate";
  account_status: "approved" | "pending" | "none";
  min_order_eur: number;
  shipping_eur: number | null;
  delivery_days: Day[];
  lead_time_days?: number;
};
export type PendingUpdate = {
  product?: string;
  price_eur?: number;
  pack_size?: number;
  attributes?: Record<string, unknown>;
  evidence?: Record<string, string>;
  note_ja?: string | null;
  note_translations?: Translations;
  submitted_at: string;
};
export type Offer = {
  drawing: DrawingReference;
  id: string;
  supplier_id: string;
  ingredient: string;
  product: string;
  unit: "g" | "ml";
  pack_size: number;
  price_eur: number;
  offer_date: string;
  origin_route: "japan" | "europe" | "italy";
  comparison_group: string;
  attributes: Record<string, unknown>;
  evidence: Record<string, string | null>;
  document: string | null;
  pending_update?: PendingUpdate;
  pending_new?: boolean;
};
export type Extraction = {
  status: "ok" | "needs_review" | "unknown";
  value: unknown;
  read_1: unknown;
  read_2: unknown;
  source_text: string | null;
};
export type Clarification = {
  id: string;
  offer_id: string;
  field: string;
  text_ja: string;
  translations?: Translations;
  reason: string;
  reason_translations?: Translations;
  // draft -> sent (owner approved, token issued) -> supplier_replied -> replied (owner applied)
  state: "draft" | "sent" | "supplier_replied" | "replied";
  token?: string;
  sent_at?: string;
  reply?: { text_ja: string; translations?: Translations; extraction: Extraction; received_at: string };
  applied_value?: unknown;
};
export type SupplierRequest = {
  notice_ja: string;
  restaurant: string;
  supplier: string;
  product: string;
  question_ja: string;
  sent_at: string | null;
  state: "awaiting_reply" | "replied";
  reply_ja: string | null;
  replied_at: string | null;
};
export type Delivery = {
  id: string;
  supplier_id: string;
  ingredient: string;
  qty: number;
  unit: string;
  date: string;
  status: "confirmed" | "delayed" | "cancelled";
  revised_date?: string | null;
  usable_until?: string | null;
  note?: string;
  purchase_order_id?: string;
};
export type Week = {
  id: string;
  dates: string[];
  as_of?: string | null;
  servings: Record<string, number>;
  days?: { date: string; servings: Record<string, number> }[];
  deliveries?: Delivery[];
  stock: Record<string, { usable: number; confirmed_arrivals: number; unit: string; usable_until?: string | null }>;
};
export type RecipeLine = { ingredient: string; unit: "g" | "ml"; per_item: Record<string, number> };
export type MenuDish = {
  id: string; name: string; description: string; price_eur: number | null;
  group: "ramen" | "extras" | "sides"; ingredients: string[]; ingredient_keys: string[];
};
export type RestaurantIngredient = { id: string; name: string; drawing: DrawingReference };
export type RestaurantMenu = { items: MenuDish[]; ingredients: RestaurantIngredient[] };

export type State = {
  profiles: Record<string, Profile>;
  suppliers: Record<string, Supplier>;
  offers: Offer[];
  clarifications: Clarification[];
  review_flags: Record<string, Record<string, { read_1: unknown; read_2: unknown }>>;
  recipe: { name?: string; lines: RecipeLine[]; menu_items?: MenuDish[] };
  menu?: RestaurantMenu;
  week: Week;
  purchase_orders?: PurchaseOrder[];
};
export type Need = {
  ingredient: string;
  unit: string;
  gross: number;
  usable_stock: number;
  confirmed_arrivals: number;
  required: number;
  servings: number;
  menu_items: string[];
};
export type RuleOutcome = {
  rule?: string;
  preference?: string;
  field: string;
  outcome: "ok" | "fail" | "needs_review" | "missing_evidence";
  value: unknown;
  source_text: string | null;
  resolved_by?: "owner" | "supplier";
};
export type Evidence = {
  offer_id: string;
  status: "ok" | "fails_mandatory" | "needs_review" | "missing_evidence";
  mandatory: RuleOutcome[];
  negotiable: RuleOutcome[];
  preferences_met: number;
  preferences_total: number;
  orderability: { orderable: boolean; reasons: string[] };
};
export type BasketLine = {
  ingredient: string;
  offer_id: string;
  product: string;
  supplier_id: string;
  required: number;
  pack_size: number;
  unit: string;
  packs: number;
  purchase_qty: number;
  cost_eur: number;
  earliest_delivery: string | null;
  needed_by: string | null;
  arrives_in_time: boolean | null;
};
export type BasketKind = "baseline" | "lowest_cost" | "best_fit" | "fewest_suppliers" | "on_time";
export type Basket = {
  kind: BasketKind;
  rule: string;
  also: BasketKind[];
  lines: BasketLine[];
  suppliers: { supplier_id: string; name: string; relationship: string; subtotal_eur: number; shipping_eur: number | null; min_order_eur: number }[];
  goods_eur: number;
  shipping_eur: number | null;
  delivered_total_eur: number;
  supplier_count: number;
  preferences_met: number;
  preferences_total: number;
  unmet_preferences: string[];
  late_lines: string[];
  within_budget: boolean;
  vs_baseline_eur?: number;
};
export type OpenQuestion = {
  offer_id: string;
  product: string;
  supplier: string;
  field: string;
  rule: string;
  resolved_by: "owner" | "supplier";
  drafted: boolean;
};
export type BasketResult = {
  budget_eur?: number;
  needs?: Record<string, Need>;
  stockouts?: Record<string, string>;
  no_on_time_option?: boolean;
  baskets: Basket[];
  excluded: { offer_id: string; product: string; reasons: string[]; missing_fields?: { field: string; rule: string; resolved_by: string }[] }[];
  open_questions?: OpenQuestion[];
  conflict?: string;
};
export type TimelineDay = {
  date: string;
  weekday: Day;
  demand: number;
  arrived: number;
  expired: number;
  available_start: number;
  used: number;
  shortfall: number;
  end_stock: number;
};
export type Timeline = {
  available: boolean;
  as_of?: string | null;
  ingredients?: Record<string, { ingredient: string; unit: string; days: TimelineDay[]; first_stockout: string | null; total_shortfall: number }>;
};
export type Approval = {
  id: string;
  profile_id: string;
  kind: BasketKind;
  version: string;
  state: string;
  approved_at: string;
  delivered_total_eur: number;
  lines: BasketLine[];
  late_lines: string[];
  stale: boolean;
};
export type DeliveryChange = { from: string; to: string; at: string; note_ja?: string | null; note_translations?: Translations };
export type PurchaseOrder = {
  id: string;
  approval_id: string;
  supplier_id: string;
  supplier_name: string;
  lines: BasketLine[];
  goods_eur: number;
  shipping_eur: number | null;
  total_eur: number;
  delivery_date: string | null;
  state: "approved" | "submitted" | "acknowledged" | "cancelled";
  submitted_at?: string;
  acknowledgment: { received_at: string; note_ja?: string | null; note_translations?: Translations } | null;
  delivery_changes?: DeliveryChange[];
};
export type Spending = { budget_eur: number; planned_eur: number | null; committed_eur: number; remaining_eur: number };
export type AgentAnswer = { answer: string; clarifications: Clarification[] };
export type WeeklyCheck = { status: string; output_text: string | null };

const q = (profileId: string) => `profile_id=${encodeURIComponent(profileId)}`;

export const api = {
  state: () => request<State>("/state"),
  saveMenu: (items: MenuDish[]) => request<RestaurantMenu>("/menu", json("PUT", { items })),
  baskets: (profileId: string) => request<BasketResult>(`/baskets?${q(profileId)}`),
  timeline: (profileId: string) => request<Timeline>(`/stock/timeline?${q(profileId)}`),
  evidence: (offerId: string, profileId: string) => request<Evidence>(`/offers/${offerId}/evidence?${q(profileId)}`),
  putProfile: (p: Profile) => request<Profile>(`/profiles/${p.id}`, json("PUT", p)),
  ask: (question: string, profileId: string) =>
    request<AgentAnswer>("/agent/ask", json("POST", { question, profile_id: profileId })),
  approveClarification: (id: string) => request<Clarification>(`/clarifications/${id}/approve`, { method: "POST" }),
  applyClarification: (id: string, profileId: string, value?: unknown) =>
    request<{ clarification: Clarification; baskets: BasketResult }>(
      `/clarifications/${id}/apply?${q(profileId)}`,
      json("POST", value === undefined ? {} : { value }),
    ),
  approveBasket: (kind: string, profileId: string) =>
    request<{ approval: Approval; purchase_orders: PurchaseOrder[] }>("/baskets/approve", json("POST", { kind, profile_id: profileId })),
  approval: (profileId: string) => request<Approval | null>(`/baskets/approval?${q(profileId)}`),
  purchaseOrders: () => request<PurchaseOrder[]>("/purchase-orders"),
  submitOrder: (poId: string, idempotencyKey: string) =>
    request<PurchaseOrder>(`/purchase-orders/${poId}/submit`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
  spending: (profileId: string) => request<Spending>(`/spending?${q(profileId)}`),
  portalLink: (supplierId: string) => request<{ token: string; path: string }>(`/suppliers/${supplierId}/portal-link`),
  applySupplierUpdate: (offerId: string) => request<Offer>(`/offers/${offerId}/supplier-update/apply`, { method: "POST" }),
  rejectSupplierUpdate: (offerId: string) => request<Offer>(`/offers/${offerId}/supplier-update/reject`, { method: "POST" }),
  weeklyCheck: (profileId: string) => request<WeeklyCheck>(`/evolus/weekly-intake?${q(profileId)}`, { method: "POST" }),
  // Legacy single-request supplier page (app/supplier/[token]).
  supplierRequest: (token: string) => request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}`),
  supplierReply: (token: string, textJa: string) =>
    request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}/reply`, json("POST", { text_ja: textJa })),
};

export const money = (n: number | null | undefined, unknown = "?") =>
  n === null || n === undefined
    ? unknown
    : `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 76800 g -> "76.8 kg"; 9000 ml -> "9 L".
export const qty = (n: number, unit: string) =>
  unit === "g" || unit === "ml"
    ? n >= 1000 || n === 0
      ? `${(n / 1000).toLocaleString("en-IE", { maximumFractionDigits: 1 })} ${unit === "g" ? "kg" : "L"}`
      : `${n.toLocaleString("en-IE")} ${unit}`
    : `${n} ${unit}`;

// Price per kg or per L.
export const unitPrice = (o: Pick<Offer, "price_eur" | "pack_size" | "unit">) =>
  `${money((o.price_eur / o.pack_size) * 1000)} / ${o.unit === "g" ? "kg" : "L"}`;
