"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, ShoppingBasket, Store } from "lucide-react";
import AppShell from "@/components/AppShell";
import { I18nProvider, LangToggle, useI18n, type Key } from "@/lib/i18n";
import { WorkspaceProvider } from "@/components/workspace";
import AdvisorDock from "@/components/Advisor";
import { LiveProvider, useView } from "@/components/live";
import { NotificationsProvider, type NotificationFeed } from "@/components/Notifications";
import { forgetSession, type ShellView } from "@/lib/api";
import { logout } from "@/lib/auth";
import { RequiredTextContext } from "@/components/Required";

const NAV: { href: string; key: Key; icon: typeof Store; count?: "basket" }[] = [
  { href: "/restaurants", key: "nav.week", icon: CalendarDays },
  { href: "/restaurants/suppliers", key: "nav.suppliers", icon: Store },
  { href: "/restaurants/basket", key: "nav.basket", icon: ShoppingBasket, count: "basket" },
];

function Frame({ shell: initial, children }: { shell: ShellView | null; children: ReactNode }) {
  const { t, lang } = useI18n();
  const path = usePathname();
  const { data: shell } = useView<ShellView>(`/views/shell?lang=${lang}`, initial);
  const signOut = () =>
    logout().finally(() => {
      forgetSession();
      window.location.replace("/");
    });
  const name = shell?.account.name ?? "";
  return (
    <RequiredTextContext.Provider value={shell?.labels["form.required"] ?? null}>
    <AppShell
      homeHref="/restaurants"
      controls={<LangToggle />}
      account={
        shell
          ? {
              name,
              avatar: shell.account.avatar,
              place: shell.account.place_text,
              signOutLabel: t("au.logout"),
              onSignOut: signOut,
              menuLabel: t("au.account"),
              profile: { label: t("nav.profile"), href: "/restaurants/profile", current: path.startsWith("/restaurants/profile") },
            }
          : null
      }
      navLabel={t("nav.main")}
      menuLabel={t("nav.menu")}
      nav={NAV.map(({ href, key, icon, count }) => ({
        id: href,
        href,
        icon,
        label: t(key),
        current: href === "/restaurants" ? path === "/restaurants" : path.startsWith(href),
        count: count ? shell?.nav_counts[count] : undefined,
      }))}
      after={<AdvisorDock />}
    >
      {children}
      {shell?.footer.week_text && (
        <footer className="jp-footer">
          <span>{shell.footer.week_text}</span>
        </footer>
      )}
    </AppShell>
    </RequiredTextContext.Provider>
  );
}

function Feed({ feed, children }: { feed: NotificationFeed | null; children: ReactNode }) {
  const { lang } = useI18n();
  return (
    <NotificationsProvider path={`/notifications?lang=${lang}`} seenPath={`/notifications/seen?lang=${lang}`} initial={feed}>
      {children}
    </NotificationsProvider>
  );
}

export default function Shell({ shell, feed, children }: { shell: ShellView | null; feed: NotificationFeed | null; children: ReactNode }) {
  return (
    <I18nProvider>
      <LiveProvider>
        <WorkspaceProvider>
          <Feed feed={feed}>
            <Frame shell={shell}>{children}</Frame>
          </Feed>
        </WorkspaceProvider>
      </LiveProvider>
    </I18nProvider>
  );
}
