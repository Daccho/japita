"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ClipboardList, Loader2, MessageSquareText, Package, RefreshCw, WifiOff } from "lucide-react";
import AppShell, { LangSegment, type AvatarData, type NavItem } from "@/components/AppShell";
import { LiveProvider, EmptyState, useToast, useView } from "@/components/live";
import { NotificationsProvider, type NotificationFeed } from "@/components/Notifications";
import PageHeader from "@/components/PageHeader";
import { logout } from "@/lib/auth";
import { isTab, PORTAL_TABS, type PortalTab, type PortalView } from "@/lib/portal";
import { PortalLangProvider, saveLang, useLang, type Lang } from "./i18n";
import { OrdersTab } from "./OrdersTab";
import { ProductsTab } from "./ProductsTab";
import { ProfileTab } from "./ProfileTab";
import { RequestsTab } from "./RequestsTab";
import type { TabProps } from "./types";

/** The signed-in account (GET /auth/me). */
export type PortalMe = {
  display_name: string;
  role: "restaurant" | "supplier";
  avatar?: AvatarData | null;
  place_text?: string | null;
  /** Restaurants that list this supplier; the portal shows the current one. */
  restaurants?: { workspace: string; name: string; current: boolean }[];
};

// The supplier picks which restaurant's requests, orders and products the portal shows. The API reads the choice
// from this cookie and ignores a restaurant that does not list the supplier.
function chooseRestaurant(workspace: string) {
  document.cookie = `japita_supplier_restaurant=${encodeURIComponent(workspace)}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

const TABS = PORTAL_TABS;
const ICONS: Record<PortalTab, NavItem["icon"]> = {
  requests: MessageSquareText,
  orders: ClipboardList,
  products: Package,
  profile: Building2,
};


/** The signed-in supplier's portal: server-rendered view data, kept fresh by polling and after each action. */
export function PortalApp({
  lang: initialLang,
  me,
  view,
  feed,
  tab,
}: {
  lang: Lang;
  me: PortalMe | null;
  view: PortalView | null;
  feed: NotificationFeed | null;
  tab: PortalTab | null;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => setLangState(initialLang), [initialLang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    saveLang(l);
    router.refresh();
  };
  // The open section lives in the URL (/suppliers?tab=…); switching shows it at once and updates the URL.
  const [current, setCurrent] = useState<PortalTab | null>(tab);
  useEffect(() => setCurrent(tab), [tab]);
  const select = (id: PortalTab) => {
    setCurrent(id);
    router.replace(`/suppliers?tab=${id}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };
  return (
    <PortalLangProvider lang={lang} setLang={setLang}>
      <LiveProvider>
        <NotificationsProvider
          path={`/portal/me/notifications?lang=${lang}`}
          seenPath={`/portal/me/notifications/seen?lang=${lang}`}
          initial={feed}
          onNavigate={(item) => isTab(item.tab) && select(item.tab)}
        >
          <Portal me={me} initialView={view} tab={current} select={select} />
        </NotificationsProvider>
      </LiveProvider>
    </PortalLangProvider>
  );
}

function Portal({
  me: initialMe,
  initialView,
  tab: chosen,
  select,
}: {
  me: PortalMe | null;
  initialView: PortalView | null;
  tab: PortalTab | null;
  select: (id: PortalTab) => void;
}) {
  const { t, lang, setLang } = useLang();
  const notify = useToast();
  const { data: me } = useView<PortalMe>(initialMe ? null : `/auth/me?lang=${lang}`, initialMe);
  const { data: view, setData: setView, error, reload } = useView<PortalView>(`/portal/me?lang=${lang}`, initialView);
  const [firstTab, setFirstTab] = useState<PortalTab | null>(initialView?.default_tab ?? null);
  useEffect(() => {
    if (!firstTab && view) setFirstTab(view.default_tab);
  }, [firstTab, view]);
  useEffect(() => {
    if (me?.role === "restaurant") window.location.replace("/restaurants");
  }, [me?.role]);
  const tab = chosen ?? firstTab;

  const nav: NavItem[] = (view?.tabs ?? TABS.map((id) => ({ id, label: "", intro: "", count: 0 })))
    .filter((s) => s.label && s.id !== "profile")
    .map((s) => ({ id: s.id, label: s.label, icon: ICONS[s.id], current: tab === s.id, onSelect: () => select(s.id), count: s.count }));
  // The tab chosen on first load stays open while the data refreshes.

  const name = me?.display_name ?? view?.supplier.name ?? "";
  const signOut = () => logout().finally(() => window.location.replace("/"));

  const profileLabel = view?.tabs.find((s) => s.id === "profile")?.label ?? t.tabProfile;
  const section = view?.tabs.find((s) => s.id === tab);
  const props: TabProps | null = view ? { view, onView: setView, notify } : null;

  return (
    <AppShell
      homeHref="/suppliers"
      controls={
        <>
          {(me?.restaurants?.length ?? 0) > 1 && (
            <label className="jp-portal-switch">
              <select
                aria-label={t.restaurant}
                value={me?.restaurants?.find((r) => r.current)?.workspace}
                onChange={(e) => chooseRestaurant(e.target.value)}
              >
                {me?.restaurants?.map((r) => (
                  <option key={r.workspace} value={r.workspace}>{r.name}</option>
                ))}
              </select>
            </label>
          )}
          <LangSegment langs={["ja", "en"] as const} value={lang} onChange={setLang} />
        </>
      }
      account={
        name
          ? {
              name,
              avatar: me?.avatar ?? view?.supplier_avatar,
              place: me?.place_text ?? view?.for_restaurant_text,
              signOutLabel: t.signOut,
              menuLabel: t.account,
              onSignOut: signOut,
              profile: { label: profileLabel, onSelect: () => select("profile"), current: tab === "profile" },
            }
          : null
      }
      navLabel={t.navLabel}
      menuLabel={t.menu}
      nav={nav}
      sidebarFoot={name ? { name, place: me?.place_text ?? view?.for_restaurant_text, avatar: me?.avatar ?? view?.supplier_avatar } : null}
    >
      {!view || !section || !props ? (
        error ? (
          <div style={{ maxWidth: 520 }}>
            <EmptyState icon={<WifiOff aria-hidden />} title={t.offlineTitle} body={t.offlineBody} />
            <button type="button" className="jp-action jp-primary" style={{ marginTop: 12 }} onClick={reload}>
              <RefreshCw aria-hidden />
              {t.retry}
            </button>
          </div>
        ) : (
          <p className="jp-muted" role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Loader2 className="jp-spinner" aria-hidden style={{ width: 16, height: 16 }} />
            {t.loading}
          </p>
        )
      ) : (
        <>
          <PageHeader kicker={view.supplier.name} title={section.label} sub={section.intro} />
          <div className="jp-portal-body">
            {tab === "requests" && <RequestsTab {...props} />}
            {tab === "orders" && <OrdersTab {...props} />}
            {tab === "products" && <ProductsTab {...props} />}
            {tab === "profile" && <ProfileTab {...props} />}
          </div>
        </>
      )}
    </AppShell>
  );
}
