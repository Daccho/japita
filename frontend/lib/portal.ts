// Typed client for the signed-in supplier's portal (Japanese / English). Shapes mirror backend/japita/portal.py and
// portal_display.py: the view carries ready-to-show texts; this client only posts actions.

const API_BASE = "/api"; // same-origin proxy, see next.config.ts

export type FormField = {
  field: string;
  label_ja: string;
  label_en?: string;
  input: "number" | "boolean" | "text" | "choice";
  unit?: string;
  min?: number;
  max?: number;
  hint_ja?: string;
  hint_en?: string;
  choices?: { value: string; label_ja: string; label_en: string }[];
};

export type PortalRequest = {
  id: string;
  token: string;
  offer_id: string;
  form: FormField;
  state: "awaiting_reply" | "answered" | "applied" | "not_used";
  reply_ja: string | null;
  // display texts
  state_text: string;
  badge: "ok" | "warning" | "neutral";
  next_step_text?: string | null;
  question: string;
  sent_text: string;
  label: string;
  hint: string | null;
};

export type OrderLine = {
  ingredient: string;
  product: string;
  ingredient_name: string;
  qty_text: string;
  cost_text: string;
};

export type DeliveryChange = { from: string; to: string; at: string; note_ja: string | null; from_text: string; to_text: string; at_text: string };

export type PortalOrder = {
  id: string;
  state: "submitted" | "acknowledged";
  delivery_date: string;
  acknowledgment: { received_at: string; note_ja: string | null } | null;
  delivery_changes: DeliveryChange[];
  lines: OrderLine[];
  // display texts
  title: string;
  number_text: string;
  received_text: string;
  state_text: string;
  badge: "ok" | "warning" | "neutral";
  delivery_label: string;
  delivery_text: string;
  goods_text: string;
  shipping_text: string;
  total_text: string;
  accepted_text: string | null;
  can_accept: boolean;
  can_change_delivery: boolean;
};

export type Origin = "japan" | "europe" | "italy";

export type Drawing = import("@/lib/drawings").DrawingReference;

export type PendingView = {
  title: string;
  sent_text: string;
  body: string | null;
  changes: { label: string; value: string }[];
  note_ja: string | null;
};

export type PortalProduct = {
  id: string;
  ingredient: string;
  product: string;
  unit: "g" | "ml";
  pack_size: number;
  origin_route: Origin;
  attributes: Record<string, unknown>;
  pending_update: { submitted_at: string } | null;
  pending_new: boolean;
  form: FormField[];
  drawing?: Drawing | null;
  // display texts
  ingredient_name: string;
  is_restaurant_ingredient: boolean;
  not_ingredient_text: string | null;
  price_text: string;
  price_amount: number;
  pack_text: string;
  origin_text: string;
  updated_text: string;
  attribute_rows: { field: string; label: string; value_text: string }[];
  pending_view: PendingView | null;
};

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type SupplierProfile = {
  name: string;
  country: string | null;
  address: string | null;
  city: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  logo_url?: string | null;
  delivery_days: Day[] | null;
  min_order_eur: number | null;
  shipping_eur: number | null;
  lead_time_days: number | null;
};

export type PendingProfile = {
  changes: Partial<SupplierProfile>;
  note_ja?: string | null;
  submitted_at: string;
};

/** Profile changes a supplier proposes; money in `currency` is converted to EUR by the API. */
export type ProfileUpdate = Partial<Omit<SupplierProfile, "min_order_eur" | "shipping_eur">> & {
  min_order?: number;
  shipping?: number;
  currency?: string;
  note_ja?: string;
};

export type Avatar = { url: string | null; initials: string };
export type PortalTab = "requests" | "orders" | "products" | "profile";
export const PORTAL_TABS: PortalTab[] = ["requests", "orders", "products", "profile"];
export const isTab = (v: string | null | undefined): v is PortalTab => !!v && (PORTAL_TABS as string[]).includes(v);

export type PortalView = {
  restaurant: string;
  restaurant_name?: string;
  restaurant_avatar?: Avatar | null;
  supplier: { id: string; name: string };
  supplier_avatar?: Avatar | null;
  profile: SupplierProfile;
  pending_profile: PendingProfile | null;
  pending_profile_view?: PendingView | null;
  requests: PortalRequest[];
  orders: PortalOrder[];
  products: PortalProduct[];
  new_product_forms: Record<string, FormField[]>;
  ingredient_ja: Record<string, string>;
  ingredient_en?: Record<string, string>;
  // display data
  lang: "ja" | "en";
  currency: string;
  fx_note: string | null;
  default_tab: PortalTab;
  counts: Record<PortalTab, number>;
  tabs: { id: PortalTab; label: string; intro: string; count: number }[];
  product_groups: { ingredient: string; title: string; product_ids: string[] }[];
  for_restaurant_text: string;
  empty: Record<"requests" | "orders" | "products", { title: string; body: string }>;
  profile_view: {
    min_order_text: string;
    shipping_text: string;
    min_order_amount: number | null;
    shipping_amount: number | null;
    delivery_days_text: string;
    lead_time_text: string;
  };
};

export type ProductUpdate = {
  product?: string;
  /** Price in `currency`; the API converts it to EUR with the current ECB rate. */
  price?: number;
  currency?: string;
  pack_size?: number;
  attributes: Record<string, unknown>;
  note_ja?: string;
};

export type NewProduct = {
  ingredient: string;
  product: string;
  unit: "g" | "ml";
  pack_size: number;
  price?: number;
  currency?: string;
  origin_route: Origin;
  attributes: Record<string, unknown>;
  note_ja?: string;
};

export type FormsLookup = {
  ingredient: string | null;
  ingredient_ja: string | null;
  ingredient_en: string | null;
  default_unit: "g" | "ml";
  form: FormField[];
};

/** Error with a stable code and messages that are safe to show to the supplier (Japanese and English). */
export class PortalError extends Error {
  constructor(
    public status: number,
    public ja: string,
    public en: string,
    public code: string = "internal",
  ) {
    super(ja);
  }
}

// Backend error code -> [Japanese, English], each with what to do next. Raw server text is never shown.
const MESSAGES: Record<string, [string, string]> = {
  network: ["サーバーに接続できません。起動中の可能性があります。1分ほどしてからもう一度お試しください。", "Cannot reach the server. It may be starting up; please try again in a minute."],
  delivery_date_before_planning: ["納品日は発注の基準日より前には設定できません。別の日付をお選びください。", "The delivery date cannot be before the order's planning date. Please choose another date."],
  same_delivery_date: ["現在の納品日と同じです。別の日付をお選びください。", "That is the current delivery date. Please choose another date."],
  forbidden: ["この操作はサプライヤーアカウントでのみ行えます。", "Only the supplier account can do this."],
  invalid_url: ["URLの形式が正しくありません。https:// で始まるURLを入力してください。", "The URL is invalid. Please enter a URL starting with https://."],
  invalid_date: ["日付の形式が正しくありません。カレンダーから選び直してください。", "The date format is invalid. Please pick the date again."],
  order_not_accepted: ["受注済みの注文のみ納品日を変更できます。画面を更新してください。", "Only accepted orders can have their delivery date changed. Please reload the page."],
  order_not_submitted: ["この注文は現在受注できない状態です。画面を更新してください。", "This order cannot be accepted right now. Please reload the page."],
  nothing_to_update: ["変更内容がありません。少なくとも1つの項目を変更してください。", "Nothing changed. Please change at least one field."],
  invalid_value: ["入力値の形式が正しくありません。数値や選択肢をご確認ください。", "One of the values has an invalid format. Please check numbers and choices."],
  owner_only_field: ["この項目はレストラン側で判断するため、入力できません。", "This field is decided by the restaurant and cannot be entered."],
  unknown_field: ["この項目は入力できません。画面を更新してください。", "This field cannot be entered. Please reload the page."],
  unknown_ingredient: ["この食材は登録できません。", "This ingredient cannot be registered."],
  reply_already_sent: ["この依頼にはすでにご回答いただいています。", "This request has already been answered."],
  empty_reply: ["回答を入力してください。", "Please enter a reply."],
  link_not_found: ["ページが見つかりません。リンクをご確認ください。", "Page not found. Please check the link."],
  order_not_found: ["注文が見つかりません。画面を更新してください。", "Order not found. Please reload the page."],
  product_not_found: ["商品が見つかりません。画面を更新してください。", "Product not found. Please reload the page."],
  invalid_currency: ["この通貨は使用できません。", "This currency is not supported."],
  invalid_input: ["入力内容をご確認ください（未入力または形式が正しくない項目があります）。", "Please check your input (a field is missing or has an invalid format)."],
  model_unavailable: ["翻訳サービスに接続できません。しばらくしてからもう一度お試しください。", "The translation service is not reachable. Please try again shortly."],
  model_timeout: ["処理に時間がかかりすぎました。もう一度お試しください。", "This took too long. Please try again."],
  conflict: ["この操作は現在できません。画面を更新してください。", "This action is not possible right now. Please reload the page."],
  not_found: ["ページが見つかりません。リンクをご確認ください。", "Page not found. Please check the link."],
  internal: ["送信できませんでした。しばらくしてからもう一度お試しください。", "Could not send. Please try again in a moment."],
};

function toError(status: number, code: string): PortalError {
  const fallback = status === 409 ? "conflict" : status === 404 ? "not_found" : status === 422 ? "invalid_input" : "internal";
  const key = MESSAGES[code] ? code : fallback;
  const [ja, en] = MESSAGES[key];
  return new PortalError(status, ja, en, code);
}

// The API may be waking up (proxy 502/503/504 without our error body): retry quietly for about a minute.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
    } catch {}
    if (res?.ok) return res.json() as Promise<T>;
    let code = "";
    if (res) {
      try {
        const c = (await res.json())?.error?.code;
        if (typeof c === "string") code = c;
      } catch {}
    }
    if (!code) code = !res || [502, 503, 504].includes(res.status) ? "network" : "internal";
    if (res?.status === 401 && typeof window !== "undefined") {
      window.location.assign("/login?role=supplier&next=/suppliers"); // the session ended
    }
    const safe = method === "GET" || !res || res.status !== 504; // a write is retried only if it surely did not land
    if (code === "network" && safe && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    throw toError(res?.status ?? 0, code);
  }
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const t = encodeURIComponent;

// Every portal route is for the signed-in supplier's own portal (the session names the supplier).
export const portalApi = {
  reply: (requestId: string, body: { value?: unknown; note_ja?: string }) =>
    call<PortalView>(`/portal/me/requests/${t(requestId)}/reply`, post(body)),
  accept: (poId: string, body: { delivery_date?: string; note_ja?: string }) =>
    call<PortalView>(`/portal/me/orders/${t(poId)}/accept`, post(body)),
  changeDelivery: (poId: string, body: { delivery_date: string; note_ja?: string }) =>
    call<PortalView>(`/portal/me/orders/${t(poId)}/delivery`, post(body)),
  updateProduct: (offerId: string, body: ProductUpdate) => call<PortalView>(`/portal/me/products/${t(offerId)}`, post(body)),
  newProduct: (body: NewProduct) => call<PortalView>(`/portal/me/products`, post(body)),
  updateProfile: (body: ProfileUpdate) => call<PortalView>(`/portal/me/profile`, post(body)),
  forms: (ingredient: string) => call<FormsLookup>(`/portal/me/forms?ingredient=${t(ingredient)}`),
};
