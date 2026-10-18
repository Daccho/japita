"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ChefHat, Factory, Loader2, PackageOpen } from "lucide-react";
import { AppHeader } from "@/components/AppShell";
import { useInitialLang } from "@/lib/initial-lang";
import { LANG_COOKIE, LOGIN_LANG_COOKIE, PORTAL_LANG_COOKIE, saveLangCookie } from "@/lib/lang-cookies";
import { AuthError, login, me, safeNext, signup, type Me, type Role } from "@/lib/auth";

type LoginLang = "en" | "it" | "ja";
const LANGS: LoginLang[] = ["en", "it", "ja"];
type Msg =
  | "who" | "restaurant" | "restaurantNote" | "supplier" | "supplierNote" | "title" | "back" | "id" | "password"
  | "submit" | "signingIn" | "invalid" | "throttled" | "offline"
  | "newHere" | "create" | "haveAccount" | "signIn" | "signupTitle" | "restaurantName" | "supplierName" | "city"
  | "country" | "contactName" | "email" | "idHint" | "passwordHint" | "creating" | "restaurantStart"
  | "supplierStart" | "taken" | "weak" | "badId" | "tooMany";

// The entry page speaks all three languages of the product: English (default), Italian, Japanese.
const DICT: Record<LoginLang, Record<Msg, string>> = {
  en: {
    who: "Who is signing in?", restaurant: "Restaurant", restaurantNote: "Weekly purchasing, suppliers and baskets",
    supplier: "Supplier", supplierNote: "Orders and questions from restaurants", title: "Sign in to Japita",
    back: "Change", id: "Login ID", password: "Password", submit: "Sign in", signingIn: "Signing in…",
    invalid: "Login ID or password is not correct.", throttled: "Too many attempts. Wait a few minutes and try again.",
    offline: "Cannot reach the server. It may be waking up; try again in a minute.",
    newHere: "New to Japita?", create: "Create an account", haveAccount: "Already have an account?", signIn: "Sign in",
    signupTitle: "Create your Japita account", restaurantName: "Restaurant name", supplierName: "Company name",
    city: "City", country: "Country", contactName: "Contact person", email: "Email",
    idHint: "3–64 characters: lowercase letters, digits, '.', '_' or '-'", passwordHint: "At least 12 characters",
    creating: "Creating…",
    restaurantStart: "Your workspace starts empty: add your menu, weekly servings and suppliers.",
    supplierStart: "Restaurants on Japita will see you as a new supplier. They confirm your terms before ordering.",
    taken: "This login ID is already in use.", weak: "The password needs at least 12 characters.",
    badId: "Use 3–64 lowercase letters, digits, '.', '_' or '-'.",
    tooMany: "Too many new accounts from this network. Try again later.",
  },
  it: {
    who: "Chi sta accedendo?", restaurant: "Ristorante", restaurantNote: "Acquisti settimanali, fornitori e carrelli",
    supplier: "Fornitore", supplierNote: "Ordini e domande dai ristoranti", title: "Accedi a Japita",
    back: "Cambia", id: "ID di accesso", password: "Password", submit: "Accedi", signingIn: "Accesso in corso…",
    invalid: "ID di accesso o password non corretti.", throttled: "Troppi tentativi. Attendi qualche minuto e riprova.",
    offline: "Server non raggiungibile. Potrebbe essere in avvio: riprova tra un minuto.",
    newHere: "Nuovo su Japita?", create: "Crea un account", haveAccount: "Hai già un account?", signIn: "Accedi",
    signupTitle: "Crea il tuo account Japita", restaurantName: "Nome del ristorante", supplierName: "Nome dell'azienda",
    city: "Città", country: "Paese", contactName: "Referente", email: "Email",
    idHint: "3–64 caratteri: lettere minuscole, cifre, '.', '_' o '-'", passwordHint: "Almeno 12 caratteri",
    creating: "Creazione in corso…",
    restaurantStart: "Il tuo spazio di lavoro parte vuoto: aggiungi menu, coperti settimanali e fornitori.",
    supplierStart: "I ristoranti su Japita ti vedranno come nuovo fornitore. Confermano le tue condizioni prima di ordinare.",
    taken: "Questo ID di accesso è già in uso.", weak: "La password deve avere almeno 12 caratteri.",
    badId: "Usa 3–64 lettere minuscole, cifre, '.', '_' o '-'.",
    tooMany: "Troppi nuovi account da questa rete. Riprova più tardi.",
  },
  ja: {
    who: "どちらでログインしますか？", restaurant: "飲食店", restaurantNote: "毎週の仕入れ、仕入先、買い物かご",
    supplier: "サプライヤー", supplierNote: "飲食店からの注文と問い合わせ", title: "Japitaにログイン",
    back: "戻る", id: "ログインID", password: "パスワード", submit: "ログイン", signingIn: "ログイン中…",
    invalid: "ログインIDまたはパスワードが正しくありません。", throttled: "試行回数が多すぎます。数分後にもう一度お試しください。",
    offline: "サーバーに接続できません。起動中の可能性があります。1分ほどしてからお試しください。",
    newHere: "はじめてご利用ですか？", create: "アカウントを作成", haveAccount: "アカウントをお持ちですか？",
    signIn: "ログイン", signupTitle: "Japitaのアカウントを作成", restaurantName: "店舗名", supplierName: "会社名",
    city: "都市", country: "国", contactName: "担当者名", email: "メールアドレス",
    idHint: "3〜64文字：英小文字・数字・「.」「_」「-」", passwordHint: "12文字以上",
    creating: "作成中…",
    restaurantStart: "ワークスペースは空の状態から始まります。メニュー、週の食数、仕入先を登録してください。",
    supplierStart: "Japitaの飲食店に新しい仕入先として表示されます。発注の前に飲食店が取引条件を確認します。",
    taken: "このログインIDはすでに使われています。", weak: "パスワードは12文字以上にしてください。",
    badId: "英小文字・数字・「.」「_」「-」で3〜64文字にしてください。",
    tooMany: "このネットワークからの新規作成が多すぎます。しばらくしてからお試しください。",
  },
};

type SignupFields = { name: string; city: string; country: string; contact_name: string; email: string };
const EMPTY_SIGNUP: SignupFields = { name: "", city: "", country: "", contact_name: "", email: "" };

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fields, setFields] = useState<SignupFields>(EMPTY_SIGNUP);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "signup" | null>(null);
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
    const codes: Record<string, Msg> = { username_taken: "taken", weak_password: "weak", invalid_username: "badId" };
    if (e instanceof AuthError && codes[e.code]) setError(codes[e.code]);
    else if (e instanceof AuthError && e.status === 429) setError(mode === "signup" ? "tooMany" : "throttled");
    else if (e instanceof AuthError) setError(e.status === 401 || e.status === 422 ? fallback : "offline");
    else if (e instanceof TypeError) setError("offline");
    else setError(fallback);
  }

  function switchMode(m: "signin" | "signup") {
    setMode(m);
    setError(null);
    setPassword("");
  }

  async function submitSignup(e: FormEvent) {
    e.preventDefault();
    if (!role || busy) return;
    setBusy("signup");
    setError(null);
    try {
      const extra = role === "supplier" ? { contact_name: fields.contact_name, email: fields.email } : {};
      await enter(await signup({ role, username, password, name: fields.name, city: fields.city,
                                 country: fields.country, ...extra }));
    } catch (err) {
      fail(err, "badId");
      setBusy(null);
    }
  }

  const field = (key: keyof SignupFields, label: Msg, props: { required?: boolean; type?: string; autoComplete?: string; maxLength: number }) => (
    <label className="jp-field" key={key}>
      {t(label)}
      <input
        name={key} type={props.type ?? "text"} autoComplete={props.autoComplete} required={props.required}
        maxLength={props.maxLength} value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
      />
    </label>
  );

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
              <button type="button" className="jp-action" onClick={() => { setRole(null); setMode("signin"); setError(null); setBusy(null); }}>
                <ArrowLeft aria-hidden />
                {t("back")}
              </button>
              <span className="jp-kicker">{t(role)}</span>
            </div>
            {mode === "signup" ? (
              <>
                <h1>{t("signupTitle")}</h1>
                <p className="jp-login-note">{t(role === "restaurant" ? "restaurantStart" : "supplierStart")}</p>
                <form onSubmit={submitSignup} noValidate>
                  {field("name", role === "restaurant" ? "restaurantName" : "supplierName", { required: true, autoComplete: "organization", maxLength: 120 })}
                  {field("city", "city", { autoComplete: "address-level2", maxLength: 80 })}
                  {field("country", "country", { autoComplete: "country-name", maxLength: 60 })}
                  {role === "supplier" && field("contact_name", "contactName", { autoComplete: "name", maxLength: 120 })}
                  {role === "supplier" && field("email", "email", { type: "email", autoComplete: "email", maxLength: 200 })}
                  <label className="jp-field">
                    {t("id")}
                    <input
                      name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required
                      maxLength={64} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      aria-describedby="signup-id-hint"
                    />
                    <small id="signup-id-hint" className="jp-muted">{t("idHint")}</small>
                  </label>
                  <label className="jp-field">
                    {t("password")}
                    <input
                      name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024}
                      value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="signup-pw-hint"
                    />
                    <small id="signup-pw-hint" className="jp-muted">{t("passwordHint")}</small>
                  </label>
                  {error && <p className="jp-error" role="alert">{t(error)}</p>}
                  <button
                    type="submit" className="jp-action jp-primary jp-login-submit"
                    disabled={!!busy || !fields.name.trim() || !username || password.length < 12}
                  >
                    {busy === "signup" && <Loader2 className="jp-spinner" aria-hidden />}
                    {busy === "signup" ? t("creating") : t("create")}
                  </button>
                </form>
                <p className="jp-login-note">
                  {t("haveAccount")}{" "}
                  <button type="button" className="jp-login-switch" onClick={() => switchMode("signin")}>{t("signIn")}</button>
                </p>
              </>
            ) : (
            <>
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
            <p className="jp-login-note">
              {t("newHere")}{" "}
              <button type="button" className="jp-login-switch" onClick={() => switchMode("signup")}>{t("create")}</button>
            </p>
            </>
            )}
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
