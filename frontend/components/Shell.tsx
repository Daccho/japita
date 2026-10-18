"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, Loader2, ShoppingBasket, SlidersHorizontal, Store } from "lucide-react";
import AppShell from "@/components/AppShell";
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
  const { t, fx } = useI18n();
  const d = useDates();
  const { data } = useWorkspace();
  const week = data?.state.week;
  const bowls = BOWLS.reduce((s, k) => s + (week?.servings[k] ?? 0), 0);
  return (
    <footer className="jp-footer">
      {week?.dates?.length === 2 && (
        <span>{t("foot.week", { dates: d.range(week.dates[0], week.dates[1]), bowls: bowls.toLocaleString("en-IE") })}</span>
      )}
      {fx.note && <span>{fx.note}</span>}
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
    <AppShell
      homeHref="/restaurants"
      controls={
        <>
          <div className="jp-segment" role="group" aria-label={t("profile.switch")}>
            <span className="jp-segment-label">{t("profile.switch")}</span>
            {PROFILES.map((p) => (
              <button key={p} type="button" aria-pressed={profileId === p} onClick={() => setProfileId(p)}>
                {t(`profile.${p}` as Key)}
              </button>
            ))}
          </div>
          <LangToggle />
        </>
      }
      account={{ name: user.display_name, signOutLabel: t("au.logout"), onSignOut: signOut }}
      navLabel="Main navigation"
      nav={NAV.map(({ href, key, icon }) => ({
        id: href,
        href,
        icon,
        label: t(key),
        current: href === "/restaurants" ? path === "/restaurants" : path.startsWith(href),
        count: href === "/restaurants/basket" ? lines : undefined,
      }))}
      sidebarFoot={
        <>
          Kumo Ramen
          <br />
          {t("side.place")}
        </>
      }
      after={<AdvisorDock />}
    >
      {data ? children : <FirstLoad />}
      <Footer />
    </AppShell>
  );
}
