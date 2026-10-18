import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { LOGIN_LANG_COOKIE } from "@/lib/lang-cookies";

type Lang = "en" | "it" | "ja";

const DICT: Record<Lang, { title: string; body: string; home: string }> = {
  en: {
    title: "Page not found",
    body: "This page does not exist or has moved. Check the address, or go back to Japita.",
    home: "Back to Japita",
  },
  it: {
    title: "Pagina non trovata",
    body: "Questa pagina non esiste o è stata spostata. Controlla l'indirizzo o torna a Japita.",
    home: "Torna a Japita",
  },
  ja: {
    title: "ページが見つかりません",
    body: "お探しのページは存在しないか、移動した可能性があります。アドレスを確認するか、Japitaに戻ってください。",
    home: "Japitaに戻る",
  },
};

// Speaks the language last chosen on the sign-in page (the one choice that covers all three languages).
export default async function NotFound() {
  const saved = (await cookies()).get(LOGIN_LANG_COOKIE)?.value;
  const lang: Lang = saved === "it" || saved === "ja" ? saved : "en";
  const t = DICT[lang];
  return (
    <div className="jp" lang={lang}>
      <div className="jp-app">
        <main className="jp-login">
          <section className="jp-panel jp-login-card jp-not-found">
            <Image className="jp-brand-logo" src="/japita-logo.png" alt="Japita" width={112} height={56} priority />
            <p className="jp-not-found-code" aria-hidden>404</p>
            <h1>{t.title}</h1>
            <p className="jp-muted">{t.body}</p>
            <Link href="/" className="jp-action jp-primary jp-login-submit">
              <ArrowLeft aria-hidden />
              {t.home}
            </Link>
          </section>
        </main>
      </div>
    </div>
  );
}
