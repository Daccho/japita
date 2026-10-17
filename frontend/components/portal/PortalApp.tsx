"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Info, LinkIcon, MessageSquareText, Package, RefreshCw, Store, WifiOff } from "lucide-react";
import { portalApi, PortalError, type PortalView } from "@/lib/portal";
import { PortalLangProvider, useLang, type Lang } from "./i18n";
import { OrdersTab } from "./OrdersTab";
import { ProductsTab } from "./ProductsTab";
import { RequestsTab } from "./RequestsTab";
import type { TabProps } from "./types";

type Tab = "requests" | "orders" | "products";

export function PortalApp({ token }: { token: string }) {
  return (
    <PortalLangProvider>
      <Portal token={token} />
    </PortalLangProvider>
  );
}

function Portal({ token }: { token: string }) {
  const { t, lang } = useLang();
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
      // Open the tab that needs attention first, only on the first load.
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

  if (failure === "notfound" || (failure === "offline" && !view)) {
    const notFound = failure === "notfound";
    return (
      <Shell>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2e9] text-[#335b45]">
            {notFound ? <LinkIcon className="h-7 w-7" aria-hidden /> : <WifiOff className="h-7 w-7" aria-hidden />}
          </div>
          <h1 className="text-lg font-bold text-[#23312b]">{notFound ? t.notFoundTitle : t.offlineTitle}</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#657068]">{notFound ? t.notFoundBody : t.offlineBody}</p>
          {!notFound && (
            <button
              type="button"
              onClick={reload}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#335b45] px-5 text-sm font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t.retry}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (!view || !tab) {
    return (
      <Shell>
        <div className="space-y-4 px-4 pt-6" aria-busy="true" aria-label={t.loading}>
          <div className="h-16 animate-pulse rounded-[14px] bg-[#e7ece2]" />
          <div className="h-11 animate-pulse rounded-full bg-[#e7ece2]" />
          <div className="h-48 animate-pulse rounded-[14px] bg-white" />
          <div className="h-48 animate-pulse rounded-[14px] bg-white" />
        </div>
      </Shell>
    );
  }

  const counts: Record<Tab, number> = {
    requests: view.requests.filter((r) => r.state === "awaiting_reply").length,
    orders: view.orders.filter((o) => o.state === "submitted").length,
    products: 0,
  };
  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "requests", label: t.tabRequests, icon: MessageSquareText },
    { id: "orders", label: t.tabOrders, icon: ClipboardList },
    { id: "products", label: t.tabProducts, icon: Package },
  ];
  const props: TabProps = { view, token, onView: setView, reload, notify };
  const notice = lang === "en" && view.notice_en ? view.notice_en : view.notice_ja;

  return (
    <Shell>
      <header className="px-4 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-[#335b45]">{t.supplierPortal}</p>
            <h1 className="mt-0.5 text-xl font-bold leading-tight text-[#23312b]">{view.supplier.name}</h1>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-[#657068]">
              <Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.forRestaurant(view.restaurant)}</span>
            </p>
          </div>
          <LangToggle />
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#fbf2e4] px-3 py-2 text-xs leading-relaxed text-[#946023]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      </header>

      <nav className="sticky top-0 z-10 border-b border-[#e0e5dc] bg-[#f7f6f1]/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-[#e7ece2] p-1" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className={`relative flex min-h-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition-colors ${
                  on ? "bg-white text-[#23312b] shadow-sm" : "text-[#657068] hover:text-[#23312b]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {counts[id] > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c2410c] px-1.5 text-[11px] font-bold leading-none text-white">
                    {counts[id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="px-4 pb-24 pt-4" role="tabpanel">
        {tab === "requests" && <RequestsTab {...props} />}
        {tab === "orders" && <OrdersTab {...props} />}
        {tab === "products" && <ProductsTab {...props} />}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4" role="status">
          <p className="flex max-w-md items-center gap-2 rounded-full bg-[#23312b] px-4 py-2.5 text-sm text-white shadow-[0_16px_40px_#23312b40]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#a2cfad]" aria-hidden />
            {toast}
          </p>
        </div>
      )}
    </Shell>
  );
}

function LangToggle() {
  const { lang, setLang } = useLang();
  const opts: [Lang, string][] = [
    ["ja", "日本語"],
    ["en", "English"],
  ];
  return (
    <div className="flex shrink-0 rounded-full border border-[#cfd8cb] bg-white p-0.5 text-xs font-bold" role="group" aria-label="Language">
      {opts.map(([l, label]) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-8 rounded-full px-2.5 transition-colors ${
            lang === l ? "bg-[#335b45] text-white" : "text-[#657068] hover:text-[#23312b]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f6f1] font-[family-name:var(--font-noto),var(--font-inter),sans-serif] text-[#23312b]">
      <div className="mx-auto min-h-screen max-w-xl bg-[#f7f6f1] sm:border-x sm:border-[#e0e5dc]">{children}</div>
    </div>
  );
}
