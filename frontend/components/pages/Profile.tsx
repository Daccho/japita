"use client";

import { useState } from "react";
import { useI18n, type Key } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import Overview from "@/components/profile/Overview";
import MenuSheet from "@/components/profile/MenuSheet";
import BuyingPreferences from "@/components/profile/BuyingPreferences";
import Links from "@/components/profile/Links";
import { PROFILE_TABS, type ProfileTab } from "@/lib/paths";
import type { LinksView, MenuView, ProfileView, RestaurantProfileView } from "@/lib/api";

const TAB_LABEL: Record<ProfileTab, Key> = { overview: "pr.overview", menu: "pr.menu", buying: "pr.buying", links: "pr.links" };

// Restaurant profile with its four tabs; the open tab lives in the address (?tab=) and is rendered by the server.
export default function Profile({ tab: initialTab, initial }: { tab: ProfileTab; initial: unknown }) {
  const { t } = useI18n();
  const [tab, setTabState] = useState<ProfileTab>(initialTab);
  const setTab = (k: ProfileTab) => {
    setTabState(k);
    window.history.replaceState(null, "", k === "overview" ? "/restaurants/profile" : `/restaurants/profile?tab=${k}`);
  };
  const first = <T,>(k: ProfileTab) => (k === initialTab ? (initial as T | null) : null);

  return (
    <>
      <PageHeader title={t("pr.title")} sub={t("pr.sub")} />
      <nav className="jp-profile-tabs" aria-label={t("pr.title")}>
        {PROFILE_TABS.map((k) => (
          <button key={k} type="button" aria-pressed={tab === k} aria-controls="jp-profile-content" onClick={() => setTab(k)}>
            {t(TAB_LABEL[k])}
          </button>
        ))}
      </nav>
      <div id="jp-profile-content">
        {tab === "overview" ? (
          <Overview initial={first<RestaurantProfileView>("overview")} />
        ) : tab === "menu" ? (
          <MenuSheet initial={first<MenuView>("menu")} />
        ) : tab === "buying" ? (
          <BuyingPreferences initial={first<ProfileView>("buying")} />
        ) : (
          <Links initial={first<LinksView>("links")} />
        )}
      </div>
    </>
  );
}
