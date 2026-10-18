// Thin client for the FastAPI backend. Types mirror backend/japita (api.py, calc.py, stock.py, orders.py, portal.py).
import type { DrawingReference } from "@/lib/drawings";

// Same-origin proxy to the backend (next.config.ts), so the session cookie travels with every request.
export const API_BASE = "/api";

import type { Key, T } from "@/lib/i18n";

/** A failed API call. `code` is the backend's stable error code, or "network" when the server was unreachable. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, public path: string) {
    super(`${status} ${code} ${path}`);
  }
}

// The free API instance sleeps when idle; while it wakes the proxy answers 502/503/504 without our error body.
// Retry quietly for about a minute before showing anything.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SESSION_HINT = "japita.session";

async function errorCode(res: Response): Promise<string> {
  try {
    const code = (await res.json())?.error?.code;
    if (typeof code === "string") return code;
  } catch {}
  return [502, 503, 504].includes(res.status) ? "network" : res.status === 401 ? "auth_required" : "internal";
}

async function request<R>(path: string, init?: RequestInit): Promise<R> {
  const method = (init?.method ?? "GET").toUpperCase();
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
    } catch {}
    if (res?.ok) return res.json() as Promise<R>;
    const code = res ? await errorCode(res) : "network";
    // A write is retried only when it surely did not reach the API (no response, or the proxy could not connect).
    const safe = method === "GET" || !res || res.status !== 504;
    if (code === "network" && safe && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    // The session expired or was revoked: the server refuses, so go back to sign-in (keeping this page as `next`).
    if (res?.status === 401 && typeof window !== "undefined") {
      forgetSession();
      window.location.assign(loginUrl());
    }
    throw new ApiError(res?.status ?? 0, code, path);
  }
}

export function loginUrl() {
  const next = window.location.pathname + window.location.search;
  return `/login?role=restaurant&next=${encodeURIComponent(next)}`;
}

// Remembered after /auth/me confirms a restaurant session, so the next visit can paint the cached workspace while
// the session check runs. The API still refuses every request without a valid session.
export function rememberSession(user: unknown) {
  try {
    localStorage.setItem(SESSION_HINT, JSON.stringify({ user, at: Date.now() }));
  } catch {}
}

export function rememberedSession<U>(maxAgeMs: number): U | null {
  try {
    const raw = localStorage.getItem(SESSION_HINT);
    const hint = raw ? (JSON.parse(raw) as { user: U; at: number }) : null;
    return hint && Date.now() - hint.at < maxAgeMs ? hint.user : null;
  } catch {
    return null;
  }
}

// On sign-out or an expired session: forget the hint and the cached restaurant data in this browser.
export function forgetSession() {
  try {
    for (const k of Object.keys(localStorage)) if (k === SESSION_HINT || k.startsWith("japita.cache.")) localStorage.removeItem(k);
  } catch {}
}

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

// Long model calls run as background jobs on the API: start, then poll until done or error.
type JobStatus<R> = { job_id: string; status: "running" | "done" | "error"; result?: R; error?: { code: string } };
const JOB_POLL_MS = 2500;

async function runJob<R>(start: Promise<{ job_id: string }>): Promise<R> {
  const { job_id } = await start;
  for (;;) {
    await sleep(JOB_POLL_MS);
    const job = await request<JobStatus<R>>(`/jobs/${encodeURIComponent(job_id)}`);
    if (job.status === "done") return job.result as R;
    if (job.status === "error") throw new ApiError(200, job.error?.code ?? "internal", `/jobs/${job_id}`);
  }
}

// Error code -> translated message with a suggested action. Users never see raw HTTP bodies or status codes.
const ERROR_KEYS: Record<string, Key> = {
  network: "err.network",
  auth_required: "err.auth_required",
  forbidden: "err.forbidden",
  invalid_input: "err.invalid_input",
  not_found: "err.not_found",
  conflict: "err.conflict",
  model_unavailable: "err.model_unavailable",
  model_timeout: "err.model_timeout",
  evolus_rate_limited: "err.evolus_rate_limited",
  evolus_credits_exhausted: "err.evolus_credits_exhausted",
  evolus_unavailable: "err.evolus_unavailable",
  job_not_found: "err.job_not_found",
  internal: "err.internal",
  basket_changed_reapprove: "err.basket_changed_reapprove",
  no_current_basket: "err.no_current_basket",
  order_not_approved: "err.order_not_approved",
  idempotency_key_reused: "err.conflict",
  clarification_already_sent: "err.clarification_already_sent",
  no_supplier_reply: "err.no_supplier_reply",
  choose_value: "err.choose_value",
  clarification_not_sent: "err.clarification_not_sent",
  no_pending_update: "err.no_pending_update",
  owner_only_field: "err.owner_only_field",
};

export function errorCodeOf(e: unknown): string {
  return e instanceof ApiError ? e.code : "internal";
}

export function errorText(e: unknown, t: T): string {
  if (!(e instanceof ApiError)) return t("err.internal");
  const key = ERROR_KEYS[e.code] ??
    (e.status === 409 ? "err.conflict" : e.status === 404 ? "err.not_found" : e.status === 422 || e.status === 400 ? "err.invalid_input" : "err.internal");
  return t(key);
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
  country?: string | null;
  address?: string | null;
  city?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  pending_profile?: PendingProfile;
};
export type ProfileField =
  | "name"
  | "country"
  | "address"
  | "city"
  | "contact_name"
  | "email"
  | "phone"
  | "delivery_days"
  | "min_order_eur"
  | "shipping_eur"
  | "lead_time_days";
export type PendingProfile = {
  changes: Partial<Record<ProfileField, string | number | Day[] | null>>;
  note_ja?: string | null;
  note_translations?: Translations;
  submitted_at: string;
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
export type Spending = {
  budget_eur: number;
  planned_eur: number | null;
  committed_eur: number;
  sent_eur: number;
  remaining_eur: number;
};
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
    runJob<AgentAnswer>(request("/agent/ask", json("POST", { question, profile_id: profileId }))),
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
  applyProfileUpdate: (supplierId: string) => request<Supplier>(`/suppliers/${supplierId}/profile-update/apply`, { method: "POST" }),
  rejectProfileUpdate: (supplierId: string) => request<Supplier>(`/suppliers/${supplierId}/profile-update/reject`, { method: "POST" }),
  rejectSupplierUpdate: (offerId: string) => request<Offer>(`/offers/${offerId}/supplier-update/reject`, { method: "POST" }),
  weeklyCheck: (profileId: string) =>
    runJob<WeeklyCheck>(request(`/evolus/weekly-intake?${q(profileId)}`, { method: "POST" })),
  // Legacy single-request supplier page (app/supplier/[token]).
  supplierRequest: (token: string) => request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}`),
  supplierReply: (token: string, textJa: string) =>
    request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}/reply`, json("POST", { text_ja: textJa })),
};

// Menu prices are the restaurant's own selling prices in Italy and always stay in EUR.
export const menuEur = (n: number) =>
  `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 76800 g -> "76.8 kg"; 9000 ml -> "9 L".
export const qty = (n: number, unit: string) =>
  unit === "g" || unit === "ml"
    ? n >= 1000 || n === 0
      ? `${(n / 1000).toLocaleString("en-IE", { maximumFractionDigits: 1 })} ${unit === "g" ? "kg" : "L"}`
      : `${n.toLocaleString("en-IE")} ${unit}`
    : `${n} ${unit}`;

// Price per kg or per L.
export const unitPrice = (o: Pick<Offer, "price_eur" | "pack_size" | "unit">, money: (eur: number) => string) =>
  `${money((o.price_eur / o.pack_size) * 1000)} / ${o.unit === "g" ? "kg" : "L"}`;
