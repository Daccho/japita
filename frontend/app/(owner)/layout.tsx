"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import ModelBadge from "@/components/ModelBadge";
import { I18nProvider, LangToggle, useI18n, type Key } from "@/lib/i18n";

const NAV: { href: string; key: Key }[] = [
  { href: "/", key: "nav.week" },
  { href: "/suppliers", key: "nav.suppliers" },
  { href: "/basket", key: "nav.basket" },
  { href: "/goals", key: "nav.goals" },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/japita-logo.png"
              alt="Japita"
              width={112}
              height={56}
              className="h-14 w-28 shrink-0 rounded object-cover object-[50%_44%]"
              priority
            />
            <span className="text-xs text-stone-500">{t("tagline")}</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded px-2 py-1 hover:bg-stone-100 ${path === n.href ? "bg-stone-100 font-semibold text-stone-900" : "text-stone-700"}`}
              >
                {t(n.key)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ModelBadge />
            <LangToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-stone-500">{t("footer")}</footer>
    </>
  );
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <Shell>{children}</Shell>
    </I18nProvider>
  );
}
