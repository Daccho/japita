// Typed client for the supplier portal (Japanese, mobile). Shapes mirror backend/japita/portal.py.

const API_BASE = "/api"; // same-origin proxy, see next.config.ts

export type FormField = {
  field: string;
  label_ja: string;
  label_en?: string;
  input: "number" | "boolean" | "text";
  unit?: string;
  min?: number;
  max?: number;
};

export type PortalRequest = {
  id: string;
  token: string;
  offer_id: string;
  question_ja: string;
  question_en?: string | null;
  form: FormField;
  state: "awaiting_reply" | "replied";
  sent_at: string | null;
  reply_ja: string | null;
};

export type OrderLine = {
  ingredient: string;
  ingredient_ja: string | null;
  ingredient_en?: string | null;
  product: string;
  packs: number;
  pack_size: number;
  unit: "g" | "ml";
  purchase_qty: number;
  cost_eur: number;
};

export type DeliveryChange = { from: string; to: string; at: string; note_ja: string | null };

export type PortalOrder = {
  id: string;
  state: "submitted" | "acknowledged";
  submitted_at: string | null;
  delivery_date: string;
  total_eur: number;
  goods_eur: number;
  shipping_eur: number | null;
  acknowledgment: { received_at: string; note_ja: string | null } | null;
  delivery_changes: DeliveryChange[];
  lines: OrderLine[];
};

export type Origin = "japan" | "europe" | "italy";

export type PendingUpdate = {
  product?: string;
  price_eur?: number;
  pack_size?: number;
  attributes?: Record<string, unknown>;
  note_ja?: string | null;
  submitted_at: string;
};

export type PortalProduct = {
  id: string;
  ingredient: string;
  ingredient_ja: string | null;
  ingredient_en?: string | null;
  product: string;
  unit: "g" | "ml";
  pack_size: number;
  price_eur: number;
  offer_date: string;
  origin_route: Origin;
  attributes: Record<string, unknown>;
  pending_update: PendingUpdate | null;
  pending_new: boolean;
  form: FormField[];
};

export type PortalView = {
  restaurant: string;
  supplier: { id: string; name: string };
  requests: PortalRequest[];
  orders: PortalOrder[];
  products: PortalProduct[];
  new_product_forms: Record<string, FormField[]>;
  ingredient_ja: Record<string, string>;
  ingredient_en?: Record<string, string>;
};

export type ProductUpdate = {
  product?: string;
  price_eur?: number;
  pack_size?: number;
  attributes: Record<string, unknown>;
  note_ja?: string;
};

export type NewProduct = {
  ingredient: string;
  product: string;
  unit: "g" | "ml";
  pack_size: number;
  price_eur: number;
  origin_route: Origin;
  attributes: Record<string, unknown>;
  note_ja?: string;
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

export const portalApi = {
  view: (token: string) => call<PortalView>(`/portal/${t(token)}`),
  reply: (requestToken: string, body: { value?: unknown; note_ja?: string }) =>
    call<unknown>(`/supplier/requests/${t(requestToken)}/reply`, post(body)),
  accept: (token: string, poId: string, body: { delivery_date?: string; note_ja?: string }) =>
    call<PortalView>(`/portal/${t(token)}/orders/${t(poId)}/accept`, post(body)),
  changeDelivery: (token: string, poId: string, body: { delivery_date: string; note_ja?: string }) =>
    call<PortalView>(`/portal/${t(token)}/orders/${t(poId)}/delivery`, post(body)),
  updateProduct: (token: string, offerId: string, body: ProductUpdate) =>
    call<PortalView>(`/portal/${t(token)}/products/${t(offerId)}`, post(body)),
  newProduct: (token: string, body: NewProduct) => call<PortalView>(`/portal/${t(token)}/products`, post(body)),
};
