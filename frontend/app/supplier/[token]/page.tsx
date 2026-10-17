"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type SupplierRequest } from "@/lib/api";

// Test supplier page (Japan side). Japanese only. Opened by the secret link the owner's approval creates.
export default function SupplierPage() {
  const { token } = useParams<{ token: string }>();
  const [req, setReq] = useState<SupplierRequest | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReq(await api.supplierRequest(token));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.startsWith("404") ? "依頼が見つかりません。リンクをご確認ください。" : "サーバーに接続できません。しばらくしてから再度お試しください。");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      setReq(await api.supplierReply(token, text.trim()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("409")) {
        setError("この依頼にはすでにご回答いただいています。");
        load();
      } else {
        setError("送信できませんでした。もう一度お試しください。");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div lang="ja" className="min-h-screen bg-aj-page">
      <div className="border-b-2 border-aj-ink bg-aj-yolk px-4 py-3 text-center text-sm font-bold text-aj-ink">
        {req?.notice_ja ?? "これはデモ用のテスト仕入先画面です。実際の取引・発注は行われません。"}
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-xs tracking-widest text-aj-muted">JAPITA ・ 仕入先様向け お問い合わせ（テスト）</p>

        {error && <p className="mt-4 rounded-[10px] bg-aj-chili-tint p-3 text-sm font-bold text-aj-chili-text">{error}</p>}
        {!req && !error && <p className="mt-6 text-aj-muted">読み込み中…</p>}

        {req && (
          <div className="mt-4 space-y-5">
            <div className="rounded-[12px] border-2 border-aj-ink bg-white p-5">
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
                <dt className="text-aj-muted">宛先</dt>
                <dd className="font-medium">{req.supplier} 御中</dd>
                <dt className="text-aj-muted">差出人</dt>
                <dd>{req.restaurant}（イタリア・ミラノ）</dd>
                <dt className="text-aj-muted">対象商品</dt>
                <dd>{req.product}</dd>
                {req.sent_at && (
                  <>
                    <dt className="text-aj-muted">受信日時</dt>
                    <dd>{formatJa(req.sent_at)}</dd>
                  </>
                )}
              </dl>
              <hr className="my-4 border-aj-line" />
              <p className="whitespace-pre-wrap leading-relaxed">{req.question_ja}</p>
            </div>

            {req.state === "awaiting_reply" ? (
              <div className="rounded-[12px] border-2 border-aj-ink bg-white p-5">
                <label htmlFor="reply" className="mb-2 block font-semibold">ご回答</label>
                <textarea
                  id="reply"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="例：お問い合わせの件、加水率は28%でございます。"
                  className="w-full rounded-[10px] border-2 border-aj-ink p-3 leading-relaxed"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={send}
                    disabled={sending || !text.trim()}
                    className="rounded-[10px] border-2 border-aj-ink bg-aj-ink px-5 py-2 font-bold text-white shadow-aj-control active:translate-y-0.5 active:shadow-aj-pressed disabled:opacity-50 disabled:shadow-none"
                  >
                    {sending ? "送信中…" : "回答を送信する"}
                  </button>
                  {sending && <span className="text-sm text-aj-muted">内容を確認しています（約10秒）…</span>}
                </div>
                <p className="mt-3 text-xs text-aj-muted">
                  送信いただいた回答は、AI（AMD 上の Gemma）が読み取り、店舗担当者が確認したうえで反映されます。
                </p>
              </div>
            ) : (
              <div className="rounded-[12px] border-2 border-aj-ink bg-aj-yolk-tint p-5">
                <p className="font-semibold text-aj-ink">ご回答ありがとうございました。</p>
                {req.reply_ja && <p className="mt-2 whitespace-pre-wrap text-sm">{req.reply_ja}</p>}
                {req.replied_at && <p className="mt-2 text-xs text-aj-muted">送信日時：{formatJa(req.replied_at)}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatJa(iso: string) {
  try {
    return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
