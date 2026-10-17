// Thin client for the FastAPI backend. Types mirror backend/japita/calc.py and api.py.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export type Rule = { field: string; op: "eq" | "in" | "gte" | "lte"; value: unknown; label: string };
export type Profile = {
  id: string;
  name: string;
  concept: string;
  menu_price_eur: number[];
  weekly_budget_eur: number;
  priorities: Record<string, "low" | "medium" | "high">;
  accepted_delivery_days: string[];
  ingredients: Record<string, { mandatory: Rule[]; negotiable: Rule[] }>;
};
export type Supplier = {
  id: string;
  name: string;
  relationship: "existing" | "candidate";
  account_status: string;
  min_order_eur: number;
  shipping_eur: number | null;
  delivery_days: string[];
};
export type Offer = {
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
};
export type ModelCall = { model: string; backend: string; latency_ms: number; request_id: string };
export type Extraction = {
  status: "ok" | "needs_review" | "unknown";
  value: unknown;
  read_1: unknown;
  read_2: unknown;
  source_text: string | null;
  elapsed_ms: number;
  calls: ModelCall[];
};
export type Clarification = {
  id: string;
  offer_id: string;
  field: string;
  text_ja: string;
  translations?: { it?: string; en?: string };
  reason: string;
  // draft -> sent (owner approved, token issued) -> supplier_replied -> replied (owner applied)
  state: "draft" | "sent" | "supplier_replied" | "replied";
  token?: string;
  sent_at?: string;
  reply?: { text_ja: string; translations?: { it?: string; en?: string }; extraction: Extraction; received_at: string };
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
export type State = {
  profiles: Record<string, Profile>;
  suppliers: Record<string, Supplier>;
  offers: Offer[];
  clarifications: Clarification[];
  review_flags: Record<string, Record<string, { read_1: unknown; read_2: unknown }>>;
  recipe: { name?: string; lines: { ingredient: string; qty_per_serving: number; unit: string; menu_items: string[] }[] };
  week: { id: string; dates: string[]; servings: Record<string, number>; stock: Record<string, { usable: number; confirmed_arrivals: number; unit: string }> };
};
export type Need = {
  ingredient: string;
  unit: string;
  gross: number;
  usable_stock: number;
  confirmed_arrivals: number;
  required: number;
  servings: number;
  formula: string;
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
};
export type Basket = {
  kind: string;
  rule: string;
  also: string[];
  lines: BasketLine[];
  suppliers: { supplier_id: string; name: string; relationship: string; subtotal_eur: number; shipping_eur: number | null; min_order_eur: number }[];
  goods_eur: number;
  shipping_eur: number | null;
  delivered_total_eur: number;
  supplier_count: number;
  preferences_met: number;
  preferences_total: number;
  unmet_preferences: string[];
  within_budget: boolean;
  vs_baseline_eur?: number;
};
export type BasketResult = {
  budget_eur?: number;
  baskets: Basket[];
  excluded: { offer_id: string; product: string; reasons: string[] }[];
  infeasible_combinations: { offers: string[]; problems: string[] }[] | number;
  conflict?: string;
};
export type LLMCall = {
  request_id: string;
  model: string;
  backend: string;
  latency_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  purpose?: string;
  created_at?: string;
};
export type AgentStep = {
  type: "tool" | "answer";
  name?: string;
  arguments?: string;
  request_id: string;
  model: string;
  latency_ms: number;
  result_preview?: string;
};

export const api = {
  state: () => request<State>("/state"),
  needs: (profileId: string) => request<Record<string, Need>>(`/needs?profile_id=${profileId}`),
  baskets: (profileId: string) => request<BasketResult>(`/baskets?profile_id=${profileId}`),
  evidence: (offerId: string, profileId: string) =>
    request<Evidence>(`/offers/${offerId}/evidence?profile_id=${profileId}`),
  putProfile: (p: Profile) => request<Profile>(`/profiles/${p.id}`, json("PUT", p)),
  approveClarification: (id: string) => request<Clarification>(`/clarifications/${id}/approve`, { method: "POST" }),
  applyClarification: (id: string, profileId: string, value?: unknown) =>
    request<{ clarification: Clarification; baskets: BasketResult }>(
      `/clarifications/${id}/apply?profile_id=${profileId}`,
      json("POST", value === undefined ? {} : { value }),
    ),
  supplierRequest: (token: string) => request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}`),
  supplierReply: (token: string, textJa: string) =>
    request<SupplierRequest>(`/supplier/requests/${encodeURIComponent(token)}/reply`, json("POST", { text_ja: textJa })),
  ask: (question: string, profileId: string) =>
    request<{ answer: string; steps: AgentStep[]; clarifications: Clarification[] }>(
      "/agent/ask",
      json("POST", { question, profile_id: profileId }),
    ),
  uploadSpec: (offerId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ fields: Record<string, { status: string; value: unknown; read_1: unknown; read_2: unknown; source_text: string | null }>; elapsed_ms: number; calls: LLMCall[] }>(
      `/offers/${offerId}/spec`,
      { method: "POST", body: form },
    );
  },
  health: () => request<LLMCall>("/health/model"),
  llmCalls: (limit = 20) => request<LLMCall[]>(`/llm-calls?limit=${limit}`),
  reseed: () => request<{ seeded: string }>("/state/seed", { method: "POST" }),
};

export const eur = (n: number | null | undefined, unknown = "?") =>
  n === null || n === undefined ? unknown : `€${n.toFixed(2)}`;

export const cheapest = (r: BasketResult) =>
  r.baskets.reduce<number | null>((m, b) => (m === null || b.delivered_total_eur < m ? b.delivered_total_eur : m), null);

export const qty = (n: number, unit: string) =>
  unit === "g" ? `${(n / 1000).toLocaleString("en", { maximumFractionDigits: 1 })} kg` : unit === "ml" ? `${(n / 1000).toLocaleString("en", { maximumFractionDigits: 1 })} L` : `${n} ${unit}`;
