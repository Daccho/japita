import type { DrawingReference } from "@/lib/drawings";
import { purchasingRequest as getJson, runPurchasingJob } from "@/lib/api";
type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Translations = { en?: string; it?: string; ja?: string };
const json = (method: string, body: unknown, headers: Record<string,string> = {}): RequestInit => ({method, headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
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
  restaurant_details?: Record<string, string>;
  links?: Record<string, string>;
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
  supplier_country?: string | null;
  dispatch_country?: string | null;
  geography_source?: string | null;
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
  origin_route: "japan" | "europe" | "italy" | "unknown";
  comparison_group: string;
  attributes: Record<string, unknown>;
  evidence: Record<string, string | null>;
  document: string | null;
  pending_update?: PendingUpdate;
  pending_new?: boolean;
  availability_status?: "unknown" | "confirmed" | "unavailable";
  availability_source?: string | null;
  available_qty?: number | null;
  valid_until?: string | null;
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
export type BasketKind = "baseline" | "lowest_cost" | "best_fit" | "fewest_suppliers" | "on_time" | "recommended";
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
  coverage: "covered" | "shortfall" | "unknown";
  projected_shortfalls: Record<string, { first_stockout: string; qty: number; unit: string }>;
  assumptions: string[];
};
export type OpenQuestion = {
  offer_id: string;
  product: string;
  supplier: string;
  field: string;
  rule: string;
  resolved_by: "owner" | "supplier";
  drafted: boolean;
  status?: string;
};
export type BasketResult = {
  input_version: string;
  recommended_kind: BasketKind | null;
  remaining_budget_eur: number;
  priority_order: string[];
  timing_known: boolean;
  budget_conflict: boolean;
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
export type PurchasingData = { profile_id: string; state:State; baskets:BasketResult; brief:PurchaseBrief };
export type PurchaseBrief = {
  display: {risks:{ingredient:string;date:string;first:string;total:string}[];priorities:string[];basket:{title:string;total:string;goods:string;shipping:string;difference:string|null;lines:string[]}|null};
  nothing_to_buy: boolean;
  excluded: BasketResult["excluded"];
  input_version: string; week_id: string; timing_known: boolean; recommended: Basket | null;
  priority_order: string[]; budget_conflict: boolean; remaining_budget_eur: number;
  risks: { ingredient: string; unit: string; date: string; first_shortfall: number; total_shortfall: number }[];
  questions: OpenQuestion[]; purchase_orders: PurchaseOrder[]; clarifications: Clarification[];
  comparisons: Record<string, { groups: { comparison_group: string; count: number; median_eur: number | null; offers: { offer_id: string; product: string; unit_price_eur: number; per: string; offer_date: string }[] }[] }>;
};
export type AdvisorContext = { offer_id?: string; basket_kind?: string };
export type PurchasingAnswer = { drafts: {id:string;text:string}[]; answer: string; clarifications: Clarification[]; brief: PurchaseBrief; input_version: string; stale: boolean;
  explanation: { validated: boolean; focus: string; evidence: (RuleOutcome & { offer_id: string; product: string })[] } };
export type CatalogCriteria = { ingredient?: string | null; relationship?: "existing" | "candidate"; supplier_country?: string | null; dispatch_country?: string | null; product_origin?: string | null; fresh?: boolean | null; needed_by?: string | null; name?: string | null };
export type CatalogQuote = { offer_id: string; supplier_id: string; product: string; ingredient: string; comparison_key: string;
  basis_qty: number; unit: string; packs: number; purchase_qty: number; goods_eur: number; shipping_eur: number | null;
  delivered_total_eur: number | null; minimum_met: boolean; earliest_delivery: string | null; evidence: Evidence;
  orderability: { orderable: boolean; reasons: string[] }; delivered_text:string; basis_text:string };
export type CatalogResult = { criteria: CatalogCriteria; unsupported: string[]; unchecked: { offer_id: string; product: string; fields: string[] }[]; offers: CatalogQuote[] };
export type WeeklyCheck = { status: string; output_text: string | null };

const q = (profileId: string) => `profile_id=${encodeURIComponent(profileId)}`;

export const purchasingApi = {
  state: () => getJson<State>("/state"),
  saveMenu: (items: MenuDish[]) => getJson<RestaurantMenu>("/menu", json("PUT", { items })),
  baskets: (profileId: string) => getJson<BasketResult>(`/baskets?${q(profileId)}`),
  timeline: (profileId: string) => getJson<Timeline>(`/stock/timeline?${q(profileId)}`),
  evidence: (offerId: string, profileId: string) => getJson<Evidence>(`/offers/${offerId}/evidence?${q(profileId)}`),
  putProfile: (p: Profile) => getJson<Profile>(`/profiles/${p.id}`, json("PUT", p)),
  putWeek: (week: Week, profileId: string, version: string) => getJson<Week>(`/week?${q(profileId)}`, json("PUT", week, { "If-Match": version })),
  putRecipe: (recipe: State["recipe"], profileId: string, version: string) => getJson<State["recipe"]>(`/recipe?${q(profileId)}`, json("PUT", recipe, { "If-Match": version })),
  putOffer: (offer: Offer) => getJson<Offer>(`/offers/${offer.id}/purchasing-terms`, json("PUT", { availability_status: offer.availability_status, availability_source: offer.availability_source, available_qty: offer.available_qty, valid_until: offer.valid_until })),
  putSupplier: (supplier: Supplier) => getJson<Supplier>(`/suppliers/${supplier.id}/geography`, json("PUT", { supplier_country: supplier.supplier_country, dispatch_country: supplier.dispatch_country, geography_source: supplier.geography_source })),
  putContext: (profileId: string, body: { restaurant_details?: Record<string, string>; links?: Record<string, string> }) => getJson<Profile>(`/profiles/${profileId}/context`, json("PATCH", body)),
  chefAssessment: (offerId: string, approved: boolean, note: string) => getJson<Offer>(`/offers/${offerId}/chef-assessment`, json("PUT", { approved, note })),
  brief: (profileId: string) => getJson<PurchaseBrief>(`/advisor/brief?${q(profileId)}`),
  catalog: (query: string, profileId: string, criteria: CatalogCriteria) => runPurchasingJob<CatalogResult>(getJson("/catalog/search", json("POST", { query, profile_id: profileId, criteria }))),
  ask: (question: string, profileId: string, conversationId: string, lang: string, context: AdvisorContext = {}) =>
    runPurchasingJob<PurchasingAnswer>(getJson("/agent/ask", json("POST", { question, profile_id: profileId, conversation_id: conversationId, lang, ...context }))),
  approveClarification: (id: string) => getJson<Clarification>(`/clarifications/${id}/approve`, { method: "POST" }),
  applyClarification: (id: string, profileId: string, value?: unknown) =>
    getJson<{ clarification: Clarification; baskets: BasketResult }>(
      `/clarifications/${id}/apply?${q(profileId)}`,
      json("POST", value === undefined ? {} : { value }),
    ),
  approveBasket: (kind: string, profileId: string) =>
    getJson<{ approval: Approval; purchase_orders: PurchaseOrder[] }>("/baskets/approve", json("POST", { kind, profile_id: profileId })),
  approval: (profileId: string) => getJson<Approval | null>(`/baskets/approval?${q(profileId)}`),
  purchaseOrders: () => getJson<PurchaseOrder[]>("/purchase-orders"),
  submitOrder: (poId: string, idempotencyKey: string) =>
    getJson<PurchaseOrder>(`/purchase-orders/${poId}/submit`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey } }),
  spending: (profileId: string) => getJson<Spending>(`/spending?${q(profileId)}`),
  portalLink: (supplierId: string) => getJson<{ token: string; path: string }>(`/suppliers/${supplierId}/portal-link`),
  applySupplierUpdate: (offerId: string) => getJson<Offer>(`/offers/${offerId}/supplier-update/apply`, { method: "POST" }),
  rejectSupplierUpdate: (offerId: string) => getJson<Offer>(`/offers/${offerId}/supplier-update/reject`, { method: "POST" }),
  weeklyCheck: (profileId: string) =>
    runPurchasingJob<WeeklyCheck>(getJson(`/evolus/weekly-intake?${q(profileId)}`, { method: "POST" })),
  // Legacy single-request supplier page (app/supplier/[token]).
  supplierRequest: (token: string) => getJson<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}`),
  supplierReply: (token: string, textJa: string) =>
    getJson<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}/reply`, json("POST", { text_ja: textJa })),
};
