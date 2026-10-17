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
  notice_ja: string;
  notice_en?: string;
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

/** Error with an HTTP status and messages that are safe to show to the supplier (Japanese and English). */
export class PortalError extends Error {
  constructor(
    public status: number,
    public ja: string,
    public en: string,
  ) {
    super(ja);
  }
}

// Known backend messages (English or Japanese) -> [Japanese, English].
const MESSAGES: [RegExp, string, string][] = [
  [/before the planning date/, "納品日は発注の基準日より前には設定できません。別の日付をお選びください。", "The delivery date cannot be before the order's planning date. Please choose another date."],
  [/only accepted orders/, "受注済みの注文のみ納品日を変更できます。", "Only accepted orders can have their delivery date changed."],
  [/purchase order is/, "この注文は現在受注できない状態です。画面を更新してください。", "This order cannot be accepted right now. Please reload the page."],
  [/nothing to update/, "変更内容がありません。少なくとも1つの項目を変更してください。", "Nothing changed. Please change at least one field."],
  [/invalid value for|入力値の形式/, "入力値の形式が正しくありません。", "One of the values has an invalid format."],
  [/cannot be entered by a supplier/, "この項目は入力できません。", "This field cannot be entered."],
  [/unknown ingredient/, "この食材は登録できません。", "This ingredient cannot be registered."],
  [/isoformat/, "日付の形式が正しくありません。", "The date format is invalid."],
  [/すでにご回答/, "この依頼にはすでにご回答いただいています。", "This request has already been answered."],
  [/回答を入力/, "回答を入力してください。", "Please enter a reply."],
  [/注文が見つかりません/, "注文が見つかりません。", "Order not found."],
  [/商品が見つかりません/, "商品が見つかりません。", "Product not found."],
];

function toError(status: number, detail: unknown): PortalError {
  if (typeof detail === "string") {
    const hit = MESSAGES.find(([re]) => re.test(detail));
    if (hit) return new PortalError(status, hit[1], hit[2]);
  }
  if (status === 422)
    return new PortalError(status, "入力内容をご確認ください（未入力または形式が正しくない項目があります）。", "Please check your input (a field is missing or has an invalid format).");
  if (status === 404) return new PortalError(status, "ページが見つかりません。リンクをご確認ください。", "Page not found. Please check the link.");
  if (status === 409) return new PortalError(status, "この操作は現在できません。画面を更新してください。", "This action is not possible right now. Please reload the page.");
  return new PortalError(status, "送信できませんでした。しばらくしてからもう一度お試しください。", "Could not send. Please try again in a moment.");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new PortalError(0, "サーバーに接続できません。通信環境をご確認ください。", "Cannot reach the server. Please check your connection.");
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      // non-JSON error body
    }
    throw toError(res.status, detail);
  }
  return res.json() as Promise<T>;
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
