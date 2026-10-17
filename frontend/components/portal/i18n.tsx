"use client";

// Supplier portal language toggle (日本語 default / English). Self-contained: does not use lib/i18n.tsx.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ja" | "en";

const ja = {
  tabRequests: "依頼",
  tabOrders: "受注",
  tabProducts: "商品",
  forRestaurant: (r: string) => `${r} 様向け`,
  supplierPortal: "サプライヤーポータル",
  loading: "読み込み中…",
  notFoundTitle: "ページが見つかりません",
  notFoundBody: "リンクをご確認ください。店舗から共有された最新のリンクをお使いください。",
  offlineTitle: "サーバーに接続できません",
  offlineBody: "通信環境をご確認のうえ、もう一度お試しください。",
  retry: "再読み込み",
  // requests
  noRequests: "現在、確認依頼はありません",
  noRequestsBody: (r: string) => `${r}から商品について質問が届くと、ここに表示されます。`,
  product: "商品",
  replied: "回答済み",
  awaitingReply: "回答待ち",
  questionFrom: (when: string) => `店舗からの質問・${when}`,
  yourReply: "あなたの回答",
  sent: "送信済み",
  sendReply: "回答を送信",
  enterReply: "回答を入力してください。",
  replySent: "回答を送信しました。ありがとうございます。",
  // shared form
  comment: "コメント",
  commentHint: "任意・店舗向けに翻訳されます",
  commentPlaceholder: "補足があればご記入ください",
  commentPrefix: "コメント：",
  sending: "送信中…",
  sendingTranslating: "送信中…（店舗向けに翻訳しています）",
  yes: "はい",
  no: "いいえ",
  enterNumber: "数値を入力",
  enterText: "入力",
  optional: "任意",
  cancel: "キャンセル",
  notSet: "未登録",
  mustBeNumber: (l: string) => `${l}は数値で入力してください。`,
  atLeast: (l: string, v: string) => `${l}は${v}以上で入力してください。`,
  atMost: (l: string, v: string) => `${l}は${v}以下で入力してください。`,
  genericError: "送信できませんでした。もう一度お試しください。",
  // orders
  noOrders: "現在、注文はありません",
  noOrdersBody: (r: string) => `${r}から注文が届くと、ここに表示されます。`,
  orderNumber: "注文番号",
  received: (when: string) => `受信 ${when}`,
  accepted: "受注済み",
  awaitingAccept: "受注待ち",
  plannedDelivery: "納品予定日",
  requestedDelivery: "希望納品日",
  total: (q: string) => `計 ${q}`,
  subtotal: "商品小計",
  shipping: "送料",
  free: "無料",
  grandTotal: "合計（税抜）",
  acceptedAt: (when: string) => `受注日時 ${when}`,
  changeHistory: "納品日の変更履歴",
  newDeliveryDate: "新しい納品日",
  deliveryDate: "納品日",
  requestedDateHint: "店舗の希望日が入っています。必要に応じて変更してください。",
  notePlaceholderChange: "変更の理由など",
  notePlaceholderAccept: "納品時間帯など",
  acceptOrder: "受注する",
  changeDelivery: "納品日を変更",
  sendChange: "変更を送信",
  pickDate: "納品日を選択してください。",
  sameDate: "現在の納品日と同じです。別の日付をお選びください。",
  orderAccepted: "注文を受注しました。",
  deliveryChanged: "納品日を変更しました。",
  // products
  addProduct: "新商品を登録",
  noProducts: "登録された商品はありません",
  noProductsBody: "「新商品を登録」から取扱商品を店舗に提案できます。",
  other: "その他",
  pendingReview: "店舗の確認待ち",
  sentAt: (when: string) => `${when} 送信`,
  pendingNewBody: "新商品として提案済みです。店舗が承認すると比較対象に加わります。",
  productName: "商品名",
  price: "価格",
  packSize: "内容量",
  newProduct: "新商品",
  updatedOn: (d: string) => `情報更新日 ${d}`,
  fixChange: "変更内容を修正",
  updateProduct: "商品情報を更新",
  pricePerPack: "価格（1点あたり）",
  notePlaceholderPrice: "価格改定の理由など",
  reviewedFirst: "送信した変更は、店舗が確認してから反映されます。",
  invalidPrice: "価格を正しく入力してください。",
  invalidPack: "内容量を正しく入力してください。",
  nothingChanged: "変更内容がありません。少なくとも1つの項目を変更してください。",
  updateSent: "変更を店舗に送信しました。店舗の確認後に反映されます。",
  close: "閉じる",
  newProductIntro: (r: string) => `${r}に新しい商品を提案します。店舗の確認後に比較対象に加わります。`,
  ingredient: "食材",
  productNamePlaceholder: "例：博多細麺 1kg",
  unit: "単位",
  priceNew: "価格（1点あたり・送料別）",
  origin: "出荷元",
  notePlaceholderNew: "商品の特徴など",
  enterProductName: "商品名を入力してください。",
  proposeProduct: "店舗に提案する",
  productProposed: "新商品を店舗に提案しました。店舗の確認後に比較対象に加わります。",
  originJapan: "日本から輸入",
  originEurope: "欧州内",
  originItaly: "イタリア国内",
};

type Dict = typeof ja;

const en: Dict = {
  tabRequests: "Requests",
  tabOrders: "Orders",
  tabProducts: "Products",
  forRestaurant: (r) => `For ${r}`,
  supplierPortal: "Supplier portal",
  loading: "Loading…",
  notFoundTitle: "Page not found",
  notFoundBody: "Please check the link. Use the latest link shared by the restaurant.",
  offlineTitle: "Cannot reach the server",
  offlineBody: "Please check your connection and try again.",
  retry: "Reload",
  noRequests: "No requests right now",
  noRequestsBody: (r) => `Questions from ${r} about your products will appear here.`,
  product: "Product",
  replied: "Answered",
  awaitingReply: "Awaiting reply",
  questionFrom: (when) => `Question from the restaurant · ${when}`,
  yourReply: "Your reply",
  sent: "Sent",
  sendReply: "Send reply",
  enterReply: "Please enter a reply.",
  replySent: "Reply sent. Thank you.",
  comment: "Comment",
  commentHint: "optional · translated for the restaurant",
  commentPlaceholder: "Anything else the restaurant should know",
  commentPrefix: "Comment: ",
  sending: "Sending…",
  sendingTranslating: "Sending… (translating for the restaurant)",
  yes: "Yes",
  no: "No",
  enterNumber: "Enter a number",
  enterText: "Enter",
  optional: "optional",
  cancel: "Cancel",
  notSet: "Not set",
  mustBeNumber: (l) => `${l} must be a number.`,
  atLeast: (l, v) => `${l} must be at least ${v}.`,
  atMost: (l, v) => `${l} must be at most ${v}.`,
  genericError: "Could not send. Please try again.",
  noOrders: "No orders right now",
  noOrdersBody: (r) => `Orders from ${r} will appear here.`,
  orderNumber: "Order no.",
  received: (when) => `Received ${when}`,
  accepted: "Accepted",
  awaitingAccept: "Awaiting acceptance",
  plannedDelivery: "Delivery date",
  requestedDelivery: "Requested delivery",
  total: (q) => `total ${q}`,
  subtotal: "Goods subtotal",
  shipping: "Shipping",
  free: "Free",
  grandTotal: "Total (excl. VAT)",
  acceptedAt: (when) => `Accepted ${when}`,
  changeHistory: "Delivery date changes",
  newDeliveryDate: "New delivery date",
  deliveryDate: "Delivery date",
  requestedDateHint: "Pre-filled with the restaurant's requested date. Change it if needed.",
  notePlaceholderChange: "Reason for the change, etc.",
  notePlaceholderAccept: "Delivery time window, etc.",
  acceptOrder: "Accept order",
  changeDelivery: "Change delivery date",
  sendChange: "Send change",
  pickDate: "Please choose a delivery date.",
  sameDate: "That is the current delivery date. Please choose another date.",
  orderAccepted: "Order accepted.",
  deliveryChanged: "Delivery date changed.",
  addProduct: "Add a new product",
  noProducts: "No products registered",
  noProductsBody: "Use “Add a new product” to propose items to the restaurant.",
  other: "Other",
  pendingReview: "Awaiting restaurant review",
  sentAt: (when) => `sent ${when}`,
  pendingNewBody: "Proposed as a new product. It joins the comparison once the restaurant approves it.",
  productName: "Product name",
  price: "Price",
  packSize: "Pack size",
  newProduct: "New",
  updatedOn: (d) => `Info updated ${d}`,
  fixChange: "Edit proposed change",
  updateProduct: "Update product info",
  pricePerPack: "Price (per pack)",
  notePlaceholderPrice: "Reason for the price change, etc.",
  reviewedFirst: "Changes take effect after the restaurant reviews them.",
  invalidPrice: "Please enter a valid price.",
  invalidPack: "Please enter a valid pack size.",
  nothingChanged: "Nothing changed. Please change at least one field.",
  updateSent: "Change sent. It takes effect after the restaurant reviews it.",
  close: "Close",
  newProductIntro: (r) => `Propose a new product to ${r}. It joins the comparison after their review.`,
  ingredient: "Ingredient",
  productNamePlaceholder: "e.g. Hakata thin noodles 1 kg",
  unit: "Unit",
  priceNew: "Price (per pack, excl. shipping)",
  origin: "Ships from",
  notePlaceholderNew: "Product highlights, etc.",
  enterProductName: "Please enter a product name.",
  proposeProduct: "Propose to restaurant",
  productProposed: "New product proposed. It joins the comparison after the restaurant reviews it.",
  originJapan: "Imported from Japan",
  originEurope: "Within Europe",
  originItaly: "Within Italy",
};

const DICTS: Record<Lang, Dict> = { ja, en };
const STORAGE_KEY = "japita.portal.lang";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: "ja", t: ja, setLang: () => {} });

export function PortalLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ja");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "ja") setLangState(saved);
    } catch {
      // storage unavailable: keep Japanese
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // storage unavailable: choice lasts for this visit only
    }
  }, []);
  return <LangContext.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
