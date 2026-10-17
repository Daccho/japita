"use client";

import { useEffect, useState } from "react";
import { useI18n, type Key } from "@/lib/i18n";
import PageHeader from "@/components/PageHeader";
import Overview from "@/components/profile/Overview";
import MenuSheet from "@/components/profile/MenuSheet";
import BuyingPreferences from "@/components/profile/BuyingPreferences";
import Links from "@/components/profile/Links";

const TABS = [
  ["overview", "pr.overview"],
  ["menu", "pr.menu"],
  ["buying", "pr.buying"],
  ["links", "pr.links"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function ProfilePage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    const saved = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some(([k]) => k === saved)) setTab(saved as Tab);
  }, []);

  return (
    <>
      <PageHeader kicker="Kumo Ramen Milano" title={t("pr.title")} sub={t("pr.sub")} />
      <nav className="jp-profile-tabs" aria-label={t("pr.title")}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k} aria-controls="jp-profile-content" onClick={() => setTab(k)}>
            {t(label as Key)}
          </button>
        ))}
      </nav>
      <div id="jp-profile-content">
        {tab === "overview" ? <Overview /> : tab === "menu" ? <MenuSheet /> : tab === "buying" ? <BuyingPreferences /> : <Links />}
      </div>
    </>
  );
}
