"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, Loader2, LogOut, ShoppingBasket, SlidersHorizontal, Store } from "lucide-react";
import { LangToggle, useDates, useI18n, type Key } from "@/lib/i18n";
import { PROFILES, useWorkspace } from "@/components/workspace";
import { suggestedBasket } from "@/components/helpers";
import AdvisorDock from "@/components/Advisor";
import { useAccount } from "@/components/AuthGate";
import { forgetSession } from "@/lib/api";
import { logout } from "@/lib/auth";

const NAV: { href: string; key: Key; icon: typeof Store }[] = [
  { href: "/restaurants", key: "nav.week", icon: CalendarDays },
  { href: "/restaurants/suppliers", key: "nav.suppliers", icon: Store },
  { href: "/restaurants/basket", key: "nav.basket", icon: ShoppingBasket },
  { href: "/restaurants/profile", key: "nav.profile", icon: SlidersHorizontal },
];

const BOWLS = ["tonkotsu", "set_full", "set_kaedama", "veggie_miso"];

export function Footer() {
  const { t } = useI18n();
  const d = useDates();
  const { data } = useWorkspace();
  const week = data?.state.week;
  const bowls = BOWLS.reduce((s, k) => s + (week?.servings[k] ?? 0), 0);
  return (
    <footer className="jp-footer">
      <span>{t("foot.sample")}</span>
      {week?.dates?.length === 2 && (
        <span>{t("foot.week", { dates: d.range(week.dates[0], week.dates[1]), bowls: bowls.toLocaleString("en-IE") })}</span>
      )}
    </footer>
  );
}

// First visit in this browser: the header and navigation are already usable; only the page body waits.
function FirstLoad() {
  const { t } = useI18n();
  return (
    <section className="jp-panel" role="status" style={{ maxWidth: 520 }}>
      <p className="jp-muted" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 13 }}>
        <Loader2 className="jp-spinner" aria-hidden style={{ width: 16, height: 16 }} />
        {t("load.sync")}
      </p>
    </section>
  );
}

// Small, non-blocking hint while cached data is shown and the API is waking up.
function SyncHint() {
  const { t } = useI18n();
  const { live } = useWorkspace();
  if (live) return null;
  return (
    <span className="jp-muted" role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <Loader2 className="jp-spinner" aria-hidden style={{ width: 14, height: 14 }} />
      {t("load.sync")}
    </span>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const { data, profileId, setProfileId } = useWorkspace();
  const lines = suggestedBasket(data?.baskets)?.lines.length;
  const { user } = useAccount();
  const signOut = () =>
    logout().finally(() => {
      forgetSession();
      window.location.replace("/");
    });
  return (
    <div className="jp">
      <div className="jp-app">
        <header className="jp-top">
          <div className="jp-workspace-brands">
            <Link href="/restaurants" className="jp-brand">
              <Image className="jp-brand-logo" src="/japita-logo-ajitama-flat.svg" alt="Japita" width={128} height={92} priority />
            </Link>
          </div>
          <div className="jp-top-controls">
            <div className="jp-segment" role="group" aria-label={t("profile.switch")}>
              <span className="jp-segment-label">{t("profile.switch")}</span>
              {PROFILES.map((p) => (
                <button key={p} type="button" aria-pressed={profileId === p} onClick={() => setProfileId(p)}>
                  {t(`profile.${p}` as Key)}
                </button>
              ))}
            </div>
            <LangToggle />
            <SyncHint />
            <div className="jp-account">
              <span className="jp-muted">{user.display_name}</span>
              <button type="button" className="jp-action" onClick={signOut}>
                <LogOut aria-hidden />
                {t("au.logout")}
              </button>
            </div>
          </div>
        </header>
        <div className="jp-shell">
          <aside className="jp-sidebar">
            <nav className="jp-nav" aria-label="Main navigation">
              {NAV.map(({ href, key, icon: Icon }) => (
                <Link key={href} href={href} aria-current={(href === "/restaurants" ? path === "/restaurants" : path.startsWith(href)) ? "page" : undefined}>
                  <Icon aria-hidden />
                  {t(key)}
                  {href === "/restaurants/basket" && !!lines && <span className="jp-nav-count">{lines}</span>}
                </Link>
              ))}
            </nav>
            <div className="jp-sidebar-foot">
              {user.display_name}
              <br />
              {user.username === "kumo-milano" && (
                <>
                  {t("side.place")}
                  <br />
                </>
              )}
              <br />
              {t("side.demo")}
            </div>
          </aside>
          <main className="jp-body">
            {data ? children : <FirstLoad />}
            <Footer />
          </main>
        </div>
        <AdvisorDock />
      </div>
    </div>
  );
}
