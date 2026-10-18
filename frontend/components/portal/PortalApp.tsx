"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, LinkIcon, MessageSquareText, Package, RefreshCw, Store, WifiOff } from "lucide-react";
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
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-aj-ink bg-aj-yolk text-aj-ink">
            {notFound ? <LinkIcon className="h-7 w-7" aria-hidden /> : <WifiOff className="h-7 w-7" aria-hidden />}
          </div>
          <h1 className="font-aj-display text-lg font-normal text-aj-ink">{notFound ? t.notFoundTitle : t.offlineTitle}</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-aj-muted">{notFound ? t.notFoundBody : t.offlineBody}</p>
          {!notFound && (
            <button
              type="button"
              onClick={reload}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-aj-ink bg-aj-ink px-5 text-sm font-bold text-white shadow-aj-control active:translate-y-0.5 active:shadow-aj-pressed"
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
          <div className="h-16 animate-pulse rounded-[12px] bg-aj-yolk-tint" />
          <div className="h-11 animate-pulse rounded-[10px] bg-aj-yolk-tint" />
          <div className="h-48 animate-pulse rounded-[12px] border-2 border-aj-line bg-white" />
          <div className="h-48 animate-pulse rounded-[12px] border-2 border-aj-line bg-white" />
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

  return (
    <Shell>
      <header className="border-b-2 border-aj-ink bg-aj-yolk px-4 pb-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-aj-ink-soft">{t.supplierPortal}</p>
            <h1 className="mt-1 font-aj-display text-[22px] font-normal leading-tight text-aj-ink">{view.supplier.name}</h1>
            <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-aj-ink-soft">
              <Store className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t.forRestaurant(view.restaurant)}</span>
            </p>
          </div>
          <LangToggle />
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-b-2 border-aj-ink bg-white px-4 py-2.5">
        <div className="grid grid-cols-3 gap-2" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border-2 border-aj-ink text-sm font-bold shadow-aj-control transition-[transform,box-shadow] duration-75 active:translate-y-0.5 active:shadow-aj-pressed motion-reduce:transition-none ${
                  on ? "bg-aj-ink text-white" : "bg-white text-aj-ink hover:bg-aj-yolk-tint"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
                {counts[id] > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-aj-ink bg-aj-chili px-1 text-[11px] font-bold leading-none text-aj-alert-ink">
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
        {fx.note && tab !== "requests" && <p className="mt-6 text-center text-xs text-aj-muted tabular-nums">{fx.note}</p>}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4" role="status">
          <p className="flex max-w-md items-center gap-2 rounded-[10px] border-2 border-aj-ink border-l-4 bg-aj-yolk-tint px-4 py-2.5 text-sm font-medium text-aj-ink shadow-aj-control">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-aj-ink" aria-hidden />
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
    <div className="flex shrink-0 gap-0.5 rounded-[10px] border-2 border-aj-ink bg-white p-0.5 text-xs font-bold shadow-aj-dropdown" role="group" aria-label="Language">
      {opts.map(([l, label]) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-8 rounded-[7px] px-2.5 transition-colors ${
            lang === l ? "bg-aj-ink text-white" : "text-aj-ink hover:bg-aj-yolk-tint"
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
    <div className="min-h-screen bg-aj-page font-[family-name:var(--font-zen-kaku),var(--font-noto),sans-serif] text-aj-ink">
      <div className="mx-auto min-h-screen max-w-xl bg-aj-page sm:border-x-2 sm:border-aj-ink">{children}</div>
    </div>
  );
}
