"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { ArrowLeft, Fingerprint, Loader2, Store, Truck } from "lucide-react";
import { I18nProvider, LangToggle, useI18n, type Key } from "@/lib/i18n";
import {
  AuthError, cancelPasskey, isPasskeyCancel, login, loginWithPasskey, me, safeNext, supplierPortal, type Me, type Role,
} from "@/lib/auth";

// The supplier side is Japanese, like the supplier portal it leads to.
const JA: Partial<Record<Key, string>> = {
  "au.title": "Japita 仕入先ログイン",
  "au.back": "戻る",
  "au.id": "ログインID",
  "au.password": "パスワード",
  "au.submit": "ログイン",
  "au.signingIn": "ログイン中…",
  "au.invalid": "ログインIDまたはパスワードが正しくありません。",
  "au.throttled": "試行回数が多すぎます。数分後にもう一度お試しください。",
  "au.offline": "サーバーに接続できません。起動中の可能性があります。1分ほどしてからお試しください。",
  "au.noSignup": "アカウントはJapitaチームが発行します（架空のデモアカウントのみ）。",
};

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "passkey" | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [passkeys, setPasskeys] = useState(false);
  const tr = (k: Key) => (role === "supplier" && JA[k]) || t(k);

  // The server decides where an account may go: restaurant -> workspace, supplier -> its own portal.
  async function enter(user: Me) {
    if (user.role === "supplier") {
      router.replace((await supplierPortal()).path);
    } else {
      router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
    }
  }

  useEffect(() => {
    setPasskeys(browserSupportsWebAuthn());
    me().then((u) => u && enter(u)).catch(() => {});
    return () => cancelPasskey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(e: unknown, fallback: Key) {
    if (e instanceof AuthError) setError(e.status === 429 ? "au.throttled" : e.status === 401 ? fallback : "au.offline");
    else if (e instanceof TypeError) setError("au.offline");
    else setError(fallback);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!role || busy) return;
    setBusy("password");
    setError(null);
    try {
      await enter(await login(role, username, password));
    } catch (err) {
      setPassword("");
      fail(err, "au.invalid");
      setBusy(null);
    }
  }

  async function withPasskey() {
    if (busy) return;
    setBusy("passkey");
    setError(null);
    try {
      await enter(await loginWithPasskey());
    } catch (err) {
      if (!isPasskeyCancel(err)) fail(err, "au.passkeyFailed");
      setBusy(null);
    }
  }

  return (
    <main className="jp-login">
      <div className="jp-login-top">
        <LangToggle />
      </div>
      <section className="jp-panel jp-login-card" lang={role === "supplier" ? "ja" : undefined}>
        <Image className="jp-brand-logo" src="/japita-logo.png" alt="Japita" width={112} height={56} priority />
        {!role ? (
          <>
            <h1>{t("au.who")}</h1>
            <div className="jp-login-roles">
              {(
                [
                  ["restaurant", Store, "au.restaurant", "au.restaurantNote"],
                  ["supplier", Truck, "au.supplier", "au.supplierNote"],
                ] as const
              ).map(([r, Icon, label, note]) => (
                <button key={r} type="button" className="jp-login-role" onClick={() => setRole(r)}>
                  <Icon aria-hidden />
                  <span>
                    <strong>{t(label)}</strong>
                    <small className="jp-muted">{t(note)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="jp-login-head">
              <button type="button" className="jp-action" onClick={() => { cancelPasskey(); setRole(null); setError(null); setBusy(null); }}>
                <ArrowLeft aria-hidden />
                {tr("au.back")}
              </button>
              <span className="jp-kicker">{role === "supplier" ? "仕入先 · Supplier" : t("au.restaurant")}</span>
            </div>
            <h1>{tr("au.title")}</h1>
            <form onSubmit={submit} noValidate>
              <label className="jp-field">
                {tr("au.id")}
                <input
                  name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required
                  maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="jp-field">
                {tr("au.password")}
                <input
                  name="password" type="password" autoComplete="current-password" required maxLength={1024}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <p className="jp-error" role="alert">{tr(error)}</p>}
              <button type="submit" className="jp-action jp-primary jp-login-submit" disabled={!!busy || !username || !password}>
                {busy === "password" && <Loader2 className="jp-spinner" aria-hidden />}
                {busy === "password" ? tr("au.signingIn") : tr("au.submit")}
              </button>
            </form>
            {role === "restaurant" && passkeys && (
              <>
                <div className="jp-login-or"><span>{t("au.or")}</span></div>
                <button type="button" className="jp-action jp-login-submit" onClick={withPasskey} disabled={!!busy}>
                  {busy === "passkey" ? <Loader2 className="jp-spinner" aria-hidden /> : <Fingerprint aria-hidden />}
                  {t("au.passkey")}
                </button>
              </>
            )}
          </>
        )}
        <p className="jp-muted jp-login-note">{tr("au.noSignup")}</p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <I18nProvider>
      <div className="jp">
        <LoginForm />
      </div>
    </I18nProvider>
  );
}
