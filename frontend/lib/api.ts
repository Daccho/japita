// Thin client for the FastAPI backend. Pages render the server's ready-made view data (docs/api-views.md); this
// module only fetches views and posts actions.
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
  const path = window.location.pathname;
  const role = path.startsWith("/supplier") ? "supplier" : "restaurant";
  const next = role === "supplier" ? "/suppliers" : path + window.location.search;
  return `/login?role=${role}&next=${encodeURIComponent(next)}`;
}

/** GET a JSON view from the API (same-origin proxy, session cookie included). */
export const getJson = <R,>(path: string) => request<R>(path);

/** POST/PUT/PATCH JSON to the API; resolves with the response body. */
export const sendJson = <R,>(method: "POST" | "PUT" | "PATCH", path: string, body?: unknown, headers: Record<string, string> = {}) =>
  request<R>(path, body === undefined ? { method, headers } : json(method, body, headers));

// On sign-out or an expired session: forget anything older versions of the app kept in this browser.
export const purchasingRequest = request;
export const runPurchasingJob = runJob;

export function forgetSession() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("japita.")) localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("japita.advisor.conversation.")) sessionStorage.removeItem(k);
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

export type Badge = "ok" | "warning" | "neutral";

// --- view shapes (docs/api-views.md) ------------------------------------------------------------------

export type Avatar = { url: string | null; initials: string };
export type Labels = Record<string, string>;
type Money = { lang: string; currency: string; fx_note: string | null; labels: Labels };

export type ShellView = {
  lang: string;
  account: { name: string; avatar: Avatar | null; place_text: string | null };
  footer: { week_text: string | null; fx_note: string | null };
  nav_counts: { basket?: number };
  labels: Labels;
};

export type PurchaseOrderView = {
  id: string;
  supplier: string;
  state: string;
  state_text: string;
  badge: Badge;
  lines: { offer_id: string; text: string }[];
  delivery_date: string | null;
  delivery_text: string;
  total_text: string;
  changes: { text: string; note: string | null }[];
  note: string | null;
  note_label: string;
  can_submit: boolean;
  submit_text: string;
  sending_text: string;
  submit_key?: string;
};

export type DayView = {
  date: string;
  label: string;
  short_label: string;
  status: "short" | "arrival" | "ok";
  value_text: string;
  aria: string;
  title: string;
  detail: { label: string; value: string; warn: boolean; sub?: boolean }[];
};

export type WeekView = Money & {
  approval_notice?: { text: string; action: string; href: string } | null;
  kicker: string;
  sub: string;
  alerts: { id: string; ingredient: string; title: string; body: string; action: string; href: string }[];
  needs: {
    ingredient: string;
    label: string;
    need_text: string;
    to_buy_text: string;
    from_text: string | null;
    status: "runs_out" | "covered";
    status_text: string;
    days: DayView[];
  }[];
  orders: PurchaseOrderView[];
  orders_empty_text: string | null;
  spending: { committed_text: string; used_pct: number; sent_text: string | null; remaining_text: string; planned_text: string | null };
  suggested: null | {
    kind: string;
    title: string;
    total_text: string;
    timing_text: string;
    lines: { ingredient_label: string; supplier: string }[];
    action: { label: string; href: string };
  };
};

export type ImportCheckItem = {
  rule_id: string;
  outcome: "ok" | "info" | "needs_review" | "missing_document";
  outcome_text: string;
  tone: "ok" | "warning" | "neutral";
  title: string;
  explanation: string;
  missing_text: string | null;
  source: { label: string; title: string; url: string; accessed_text: string };
  question_text: string | null;
  ask: { label: string; question: string } | null;
};

/** An offer's import and labelling checks (decision support, never a clearance). */
export type ImportChecks = {
  show: boolean;
  label: string;
  chip_text: string | null;
  tone: "ok" | "warning" | "neutral" | null;
  note: string;
  checks: ImportCheckItem[];
};

export type PlanLine = {
  offer_id: string;
  product: string;
  ingredient_label: string;
  supplier: string;
  detail_text: string;
  timing_text: string;
  cost_text: string;
  badge: { text: string; warn: boolean } | null;
  is_new: boolean;
  new_text: string | null;
  drawing?: DrawingReference | null;
  import_checks?: ImportChecks | null;
};

export type BasketView = Money & {
  mode: "choose" | "settled" | "none";
  no_on_time: null | {
    title: string;
    body: string;
    ask_label: string;
    ask_question: string;
    questions: { offer_id: string; field: string; text: string; drafted: boolean; drafted_text: string | null; hint: string | null }[];
  };
  conflict_text: string | null;
  plans: {
    kind: string;
    title: string;
    total_text: string;
    vs_text: string;
    timing: { text: string; warn: boolean };
    also_text: string | null;
    selected: boolean;
    approved: boolean;
    has_new: boolean;
    savings_text: string | null;
  }[];
  selected: null | {
    kind: string;
    title: string;
    prefs_text: string;
    lines: PlanLine[];
    tradeoffs: { ingredient: string; field: string; text: string; hint: string | null }[];
    total_text: string;
    goods_shipping_text: string;
    budget_pct: number;
    within_budget: boolean;
    budget_text: string;
    savings_text: string | null;
    approval: { state: "approved" | "stale" | "other" | "none"; text: string | null };
    can_approve: boolean;
    approve_text: string;
    approving_text: string;
    send_key?: string;
    confirm?: { title: string; text: string; lines: { supplier: string; total_text: string }[]; confirm_text: string; cancel_text: string } | null;
  };
  settled: null | {
    title: string;
    approved_text: string;
    note: string;
    lines: { offer_id: string; product: string; detail_text: string; cost_text: string }[];
    total_text: string;
  };
  orders: PurchaseOrderView[];
  excluded: { offer_id: string; product: string; supplier: string; reasons: string[] }[];
};

export type ClarificationsView = {
  lang: string;
  labels: Labels;
  empty_text: string | null;
  items: {
    id: string;
    product: string;
    supplier: string;
    state: string;
    state_text: string;
    badge: Badge;
    field_label: string;
    reason: string;
    question_ja: string;
    translation: string | null;
    can_approve: boolean;
    waiting_text: string | null;
    reply: null | { translation: string | null; text_ja: string };
    value_text: string | null;
    choose_text: string | null;
    choices: { value: unknown; label: string }[];
    applied_text: string | null;
  }[];
};

export type SupplierRow = {
  id: string;
  name: string;
  avatar?: Avatar | null;
  status_text: string;
  pending: boolean;
  pending_text: string | null;
  drawing?: DrawingReference | null;
  image_alt: string;
  product: string;
  product_count_text: string;
  price_text: string;
  price_pack_text: string | null;
};

export type SuppliersView = Money & {
  view: "existing" | "candidate";
  sub: string;
  filters: {
    q: string | null;
    ingredient: string;
    name: string;
    sort: string;
    active_count: number;
    active_text: string;
    note: string;
    ingredients: { value: string; label: string }[];
    sorts: { value: string; label: string }[];
    show_name: boolean;
    show_search: boolean;
  };
  show_results: boolean;
  count_text: string | null;
  empty: null | { title: string; body: string };
  search_empty: null | { title: string; body: string };
  rows: SupplierRow[];
};

export type Change = { label: string; from: string; to: string; hint?: string | null };
export type Proposal = {
  title: string;
  changes: Change[];
  note: string | null;
  note_label: string;
  note_ja: string | null;
  note_ja_label: string;
  apply_text: string;
  reject_text: string;
};

export type OfferCardView = {
  id: string;
  ingredient_label: string;
  product: string;
  origin_text: string;
  date_text: string;
  pack_text: string;
  unit_price_text: string;
  drawing?: DrawingReference | null;
  image_alt: string;
  image_caption: string;
  status: { key: string; text: string; warn: boolean } | null;
  checks: { kind: string; ok: boolean; missing: boolean; text: string; hint: string | null; who_text: string | null }[];
  proposal: (Proposal & { is_new: boolean }) | null;
  import_checks?: ImportChecks | null;
  is_new: boolean;
  new_text: string | null;
};

export type SupplierDetailView = Money & {
  id: string;
  name: string;
  avatar?: Avatar | null;
  terms_text: string;
  profile_proposal: Proposal | null;
  offers: OfferCardView[];
};

export type ProfileView = Money & {
  profile_id: string;
  active_profile_id: string;
  profiles: { id: string; label: string; description: string; active: boolean; suggested_total_text: string; switch_effect?: { text: string } }[];
  badge_text: string;
  ingredients: {
    ingredient: string;
    label: string;
    empty_text: string | null;
    rules: { field: string; label: string; kind: string; kind_text: string; move_to: string; move_text: string; hint: string | null }[];
  }[];
  budget: { label: string; currency: string; amount: number; min: number; max: number; text: string; note: string };
  days: { day: string; label: string; on: boolean }[];
  impact?: { text: string };
};

export type RestaurantProfileView = {
  lang: string;
  values: Record<string, string>;
  name: string;
  subtitle: string;
  logo_url?: string | null;
  avatar?: Avatar | null;
  facts: { label: string; value: string }[];
  questionnaire: { label: string; value: string }[];
  fields: { key: string; label: string; multiline: boolean; max_length: number }[];
  labels: Labels;
};

export type LinksView = {
  lang: string;
  links: Record<string, string>;
  max_length: number;
  labels: Labels;
  groups: { key: string; title: string; items: { id: string; label: string; url: string | null; text: string; placeholder: string; action_text: string }[] }[];
};

export type MenuDish = {
  id: string;
  name: string;
  description: string;
  price_eur: number | null;
  group: "ramen" | "extras" | "sides";
  ingredients: string[];
  ingredient_keys: string[];
};

export type MenuView = {
  lang: string;
  items: MenuDish[];
  masthead: { name: string; subtitle: string; logo_url: string };
  groups: { key: MenuDish["group"]; title: string }[];
  prices: Record<string, string>;
  planning: { title: string; note: string; rows: { id: string; summary: string; ingredients: string[]; uses_text: string }[] };
  labels: Labels;
};

export type AgentAnswer = {
  answer: string;
  drafts: { id: string; product: string; field_label: string; translation: string | null; text: string }[];
};
export type WeeklyCheck = { status: string; output_text: string | null };

const enc = encodeURIComponent;

// Actions. Each returns the API response; pages then re-fetch their views.
export const api = {
  ask: (question: string, lang: string) => runJob<AgentAnswer>(request("/agent/ask", json("POST", { question, lang }))),
  weeklyCheck: () => runJob<WeeklyCheck>(request("/evolus/weekly-intake", { method: "POST" })),
  approveClarification: (id: string) => request(`/clarifications/${enc(id)}/approve`, { method: "POST" }),
  applyClarification: (id: string, value?: unknown) =>
    request(`/clarifications/${enc(id)}/apply`, json("POST", value === undefined ? {} : { value })),
  approveBasket: (kind: string) => request("/baskets/approve", json("POST", { kind })),
  approveAndSend: (kind: string, key: string) => request("/baskets/approve-and-send", json("POST", { kind }, { "Idempotency-Key": key })),
  submitOrder: (poId: string, key: string) =>
    request(`/purchase-orders/${enc(poId)}/submit`, { method: "POST", headers: { "Idempotency-Key": key } }),
  applySupplierUpdate: (offerId: string) => request(`/offers/${enc(offerId)}/supplier-update/apply`, { method: "POST" }),
  rejectSupplierUpdate: (offerId: string) => request(`/offers/${enc(offerId)}/supplier-update/reject`, { method: "POST" }),
  applyProfileUpdate: (supplierId: string) => request(`/suppliers/${enc(supplierId)}/profile-update/apply`, { method: "POST" }),
  rejectProfileUpdate: (supplierId: string) => request(`/suppliers/${enc(supplierId)}/profile-update/reject`, { method: "POST" }),
  moveRule: (profileId: string, ingredient: string, field: string, lang: string) =>
    request<ProfileView>(`/profiles/${enc(profileId)}/rules/move?lang=${lang}`, json("PATCH", { ingredient, field })),
  patchProfile: (profileId: string, body: { budget?: { amount: number; currency: string }; accepted_delivery_days?: string[] }, lang: string) =>
    request<ProfileView>(`/profiles/${enc(profileId)}?lang=${lang}`, json("PATCH", body)),
  setActiveProfile: (id: string) => request("/restaurant/settings", json("PUT", { active_profile_id: id })),
  saveRestaurantProfile: (values: Record<string, string>, lang: string) =>
    request<RestaurantProfileView>(`/restaurant/profile?lang=${lang}`, json("PUT", { values })),
  saveLinks: (links: Record<string, string | null>, lang: string) =>
    request<LinksView>(`/restaurant/links?lang=${lang}`, json("PUT", { links })),
  saveMenu: (items: MenuDish[]) => request("/menu", json("PUT", { items })),
};
