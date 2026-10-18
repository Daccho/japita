"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChefHat, Factory, Loader2, PackageOpen } from "lucide-react";
import { AppHeader } from "@/components/AppShell";
import { useInitialLang } from "@/lib/initial-lang";
import { LANG_COOKIE, LOGIN_LANG_COOKIE, PORTAL_LANG_COOKIE, saveLangCookie } from "@/lib/lang-cookies";
import { AuthError, login, me, safeNext, type Me, type Role } from "@/lib/auth";

type LoginLang = "en" | "it" | "ja";
const LANGS: LoginLang[] = ["en", "it", "ja"];
type Msg =
  | "who" | "restaurant" | "restaurantNote" | "supplier" | "supplierNote" | "title" | "back" | "id" | "password"
  | "submit" | "signingIn" | "invalid" | "throttled" | "offline";

// The entry page speaks all three languages of the product: English (default), Italian, Japanese.
const DICT: Record<LoginLang, Record<Msg, string>> = {
  en: {
    who: "Who is signing in?", restaurant: "Restaurant", restaurantNote: "Weekly purchasing, suppliers and baskets",
    supplier: "Supplier", supplierNote: "Orders and questions from restaurants", title: "Sign in to Japita",
    back: "Change", id: "Login ID", password: "Password", submit: "Sign in", signingIn: "Signing in…",
    invalid: "Login ID or password is not correct.", throttled: "Too many attempts. Wait a few minutes and try again.",
    offline: "Cannot reach the server. It may be waking up; try again in a minute.",
  },
  it: {
    who: "Chi sta accedendo?", restaurant: "Ristorante", restaurantNote: "Acquisti settimanali, fornitori e carrelli",
    supplier: "Fornitore", supplierNote: "Ordini e domande dai ristoranti", title: "Accedi a Japita",
    back: "Cambia", id: "ID di accesso", password: "Password", submit: "Accedi", signingIn: "Accesso in corso…",
    invalid: "ID di accesso o password non corretti.", throttled: "Troppi tentativi. Attendi qualche minuto e riprova.",
    offline: "Server non raggiungibile. Potrebbe essere in avvio: riprova tra un minuto.",
  },
  ja: {
    who: "どちらでログインしますか？", restaurant: "飲食店", restaurantNote: "毎週の仕入れ、仕入先、買い物かご",
    supplier: "サプライヤー", supplierNote: "飲食店からの注文と問い合わせ", title: "Japitaにログイン",
    back: "戻る", id: "ログインID", password: "パスワード", submit: "ログイン", signingIn: "ログイン中…",
    invalid: "ログインIDまたはパスワードが正しくありません。", throttled: "試行回数が多すぎます。数分後にもう一度お試しください。",
    offline: "サーバーに接続できません。起動中の可能性があります。1分ほどしてからお試しください。",
  },
};

function LoginForm() {
  const initial = useInitialLang().login;
  const [lang, setLangState] = useState<LoginLang>(LANGS.includes(initial as LoginLang) ? (initial as LoginLang) : "en");
  const t = (k: Msg) => DICT[lang][k];
  const setLang = (l: LoginLang) => {
    setLangState(l);
    saveLangCookie(LOGIN_LANG_COOKIE, l);
  };
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | null>(null);
  const [error, setError] = useState<Msg | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // The server decides where an account may go: restaurant -> workspace, supplier -> its own portal.
  async function enter(user: Me) {
    // Carry the chosen language over: the workspace speaks Italian/English, the supplier portal Japanese/English.
    saveLangCookie(LANG_COOKIE, lang === "it" ? "it" : "en");
    saveLangCookie(PORTAL_LANG_COOKIE, lang === "ja" ? "ja" : "en");
    if (user.role === "supplier") {
      router.replace("/suppliers");
    } else {
      const next = safeNext(new URLSearchParams(window.location.search).get("next"));
      router.replace(next.startsWith("/suppliers") || next.startsWith("/supplier/") ? "/restaurants" : next);
    }
  }

  useEffect(() => {
    // "/" is the role choice; "/login?role=..." opens that side's sign-in form directly.
    const r = new URLSearchParams(window.location.search).get("role");
    if (r === "restaurant" || r === "supplier") setRole(r);
    me().then((u) => u && enter(u)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(e: unknown, fallback: Msg) {
    if (e instanceof AuthError) setError(e.status === 429 ? "throttled" : e.status === 401 ? fallback : "offline");
    else if (e instanceof TypeError) setError("offline");
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
      fail(err, "invalid");
      setBusy(null);
    }
  }

  return (
    <>
    <AppHeader
      controls={
        <div className="jp-segment" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === "ja" ? "日本語" : l.toUpperCase()}
            </button>
          ))}
        </div>
      }
    />
    <main className="jp-login">
      <section className="jp-panel jp-login-card">
        {!role ? (
          <>
            <h1>{t("who")}</h1>
            <div className="jp-login-roles">
              {(
                [
                  ["restaurant", "restaurant", "restaurantNote"],
                  ["supplier", "supplier", "supplierNote"],
                ] as const
              ).map(([r, label, note]) => (
                <button key={r} type="button" className="jp-login-role" onClick={() => setRole(r)}>
                  <span className="jp-login-tile" aria-hidden>
                    {r === "restaurant" ? (
                      <ChefHat />
                    ) : (
                      <>
                        <Factory />
                        <PackageOpen className="jp-login-tile-badge" />
                      </>
                    )}
                  </span>
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
              <button type="button" className="jp-action" onClick={() => { setRole(null); setError(null); setBusy(null); }}>
                <ArrowLeft aria-hidden />
                {t("back")}
              </button>
              <span className="jp-kicker">{t(role)}</span>
            </div>
            <h1>{t("title")}</h1>
            <form onSubmit={submit} noValidate>
              <label className="jp-field">
                {t("id")}
                <input
                  name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required
                  maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label className="jp-field">
                {t("password")}
                <input
                  name="password" type="password" autoComplete="current-password" required maxLength={1024}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <p className="jp-error" role="alert">{t(error)}</p>}
              <button type="submit" className="jp-action jp-primary jp-login-submit" disabled={!!busy || !username || !password}>
                {busy === "password" && <Loader2 className="jp-spinner" aria-hidden />}
                {busy === "password" ? t("signingIn") : t("submit")}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="jp">
      <div className="jp-app">
        <LoginForm />
      </div>
    </div>
  );
}
