"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, ClipboardList, LinkIcon, Loader2, MessageSquareText, Package, RefreshCw, WifiOff } from "lucide-react";
import AppShell, { type NavItem } from "@/components/AppShell";
import { portalApi, PortalError, type PortalView } from "@/lib/portal";
import { PortalLangProvider, useLang, type Lang } from "./i18n";
import { OrdersTab } from "./OrdersTab";
import { ProductsTab } from "./ProductsTab";
import { ProfileTab } from "./ProfileTab";
import { RequestsTab } from "./RequestsTab";
import type { TabProps } from "./types";

type Tab = "requests" | "orders" | "products" | "profile";

/** Signed-in supplier account shown in the header; absent on shared-link pages. */
export type PortalAccount = { name: string; onSignOut: () => void };

export function PortalApp({ token, account, homeHref }: { token: string; account?: PortalAccount | null; homeHref?: string }) {
  return (
    <PortalLangProvider>
      <Portal token={token} account={account ?? null} homeHref={homeHref} />
    </PortalLangProvider>
  );
}

function Portal({ token, account, homeHref }: { token: string; account: PortalAccount | null; homeHref?: string }) {
  const { t, fx } = useLang();
  const [view, setView] = useState<PortalView | null>(null);
  const [failure, setFailure] = useState<"notfound" | "offline" | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const v = await portalApi.view(token);
      setView(v);
      setFailure(null);
      // Open the section that needs attention first, only on the first load.
      setTab(
        (cur) =>
          cur ??
          (v.requests.some((r) => r.state === "awaiting_reply")
            ? "requests"
            : v.orders.some((o) => o.state === "submitted")
              ? "orders"
              : v.requests.length
                ? "requests"
                : v.orders.length
                  ? "orders"
                  : "products"),
      );
    } catch (e) {
      setFailure(e instanceof PortalError && e.status === 404 ? "notfound" : "offline");
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const select = (id: Tab) => {
    setTab(id);
    window.scrollTo({ top: 0 });
  };
  const counts: Record<Tab, number> = {
    requests: view?.requests.filter((r) => r.state === "awaiting_reply").length ?? 0,
    orders: view?.orders.filter((o) => o.state === "submitted").length ?? 0,
    products: 0,
    profile: 0,
  };
  const sections: { id: Tab; label: string; intro: string; icon: NavItem["icon"] }[] = [
    { id: "requests", label: t.tabRequests, intro: t.introRequests, icon: MessageSquareText },
    { id: "orders", label: t.tabOrders, intro: t.introOrders, icon: ClipboardList },
    { id: "products", label: t.tabProducts, intro: t.introProducts, icon: Package },
    { id: "profile", label: t.tabProfile, intro: t.introProfile, icon: Building2 },
  ];
  const nav: NavItem[] = view
    ? sections.map(({ id, label, icon }) => ({ id, label, icon, current: tab === id, onSelect: () => select(id), count: counts[id] }))
    : [];

  const frame = (body: React.ReactNode) => (
    <AppShell
      homeHref={homeHref}
      controls={<LangToggle />}
      account={account && { name: account.name, signOutLabel: t.signOut, onSignOut: account.onSignOut }}
      navLabel={t.navLabel}
      nav={nav}
      sidebarFoot={
        view && (
          <>
            {view.supplier.name}
            <br />
            {t.forRestaurant(view.restaurant)}
          </>
        )
      }
      after={
        toast && (
          <div className="jp-floating-toast" role="status">
            <p className="jp-toast" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 aria-hidden style={{ width: 16, height: 16, flexShrink: 0 }} />
              {toast}
            </p>
          </div>
        )
      }
    >
      {body}
    </AppShell>
  );

  if (failure === "notfound" || (failure === "offline" && !view)) {
    const notFound = failure === "notfound";
    return frame(
      <section className="jp-panel jp-portal-empty" style={{ maxWidth: 520 }}>
        <span className="jp-thumb-icon">{notFound ? <LinkIcon aria-hidden /> : <WifiOff aria-hidden />}</span>
        <h2>{notFound ? t.notFoundTitle : t.offlineTitle}</h2>
        <p className="jp-muted">{notFound ? t.notFoundBody : t.offlineBody}</p>
        {!notFound && (
          <button type="button" className="jp-action jp-primary" onClick={reload}>
            <RefreshCw aria-hidden />
            {t.retry}
          </button>
        )}
      </section>,
    );
  }

  if (!view || !tab) {
    return frame(
      <section className="jp-panel" role="status" style={{ maxWidth: 520 }}>
        <p className="jp-muted" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 13 }}>
          <Loader2 className="jp-spinner" aria-hidden style={{ width: 16, height: 16 }} />
          {t.loading}
        </p>
      </section>,
    );
  }

  const section = sections.find((s) => s.id === tab)!;
  const props: TabProps = { view, token, onView: setView, reload, notify };
  return frame(
    <>
      <div className="jp-header">
        <div>
          <span className="jp-kicker">{view.supplier.name}</span>
          <h1 style={{ marginTop: 8 }}>{section.label}</h1>
          <p className="jp-muted">{section.intro}</p>
        </div>
      </div>
      <div className="jp-portal-body">
        {tab === "requests" && <RequestsTab {...props} />}
        {tab === "orders" && <OrdersTab {...props} />}
        {tab === "products" && <ProductsTab {...props} />}
        {tab === "profile" && <ProfileTab {...props} />}
      </div>
      {fx.note && tab !== "requests" && (
        <footer className="jp-footer">
          <span>{fx.note}</span>
        </footer>
      )}
    </>,
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="jp-segment" role="group" aria-label="Language">
      {(["ja", "en"] as Lang[]).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
