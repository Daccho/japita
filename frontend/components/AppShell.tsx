"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut, type LucideIcon } from "lucide-react";

// The Ajitama workspace frame shared by the restaurant workspace and the supplier portal: yellow header with the
// Japita logo, header controls and the signed-in account; a navigation rail (a horizontal bar on phones); the page body.

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
  /** Link target; without it the item is a button that calls onSelect. */
  href?: string;
  onSelect?: () => void;
  count?: number;
};

export type Account = { name: string; signOutLabel: string; onSignOut: () => void };

// The yellow header alone: also used by pages without navigation, such as sign-in.
export function AppHeader({ homeHref, controls, account }: { homeHref?: string; controls?: ReactNode; account?: Account | null }) {
  const logo = <Image className="jp-brand-logo" src="/japita-logo-ajitama-flat.svg" alt="Japita" width={128} height={92} priority />;
  return (
    <header className="jp-top">
      <div className="jp-workspace-brands">
        {homeHref ? (
          <Link href={homeHref} className="jp-brand">
            {logo}
          </Link>
        ) : (
          <span className="jp-brand">{logo}</span>
        )}
      </div>
      <div className="jp-top-controls">
        {controls}
        {account && (
          <div className="jp-account">
            <span className="jp-muted">{account.name}</span>
            <button type="button" className="jp-action" onClick={account.onSignOut}>
              <LogOut aria-hidden />
              {account.signOutLabel}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default function AppShell({
  homeHref,
  controls,
  account,
  nav,
  navLabel,
  sidebarFoot,
  children,
  after,
}: {
  homeHref?: string;
  controls?: ReactNode;
  account?: Account | null;
  nav: NavItem[];
  navLabel: string;
  sidebarFoot?: ReactNode;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="jp">
      <div className="jp-app">
        <AppHeader homeHref={homeHref} controls={controls} account={account} />
        <div className="jp-shell">
          <aside className="jp-sidebar">
            <nav className="jp-nav" aria-label={navLabel}>
              {nav.map(({ id, label, icon: Icon, current, href, onSelect, count }) => {
                const inner = (
                  <>
                    <Icon aria-hidden />
                    {label}
                    {!!count && <span className="jp-nav-count">{count}</span>}
                  </>
                );
                return href ? (
                  <Link key={id} href={href} aria-current={current ? "page" : undefined}>
                    {inner}
                  </Link>
                ) : (
                  <button key={id} type="button" aria-current={current ? "page" : undefined} onClick={onSelect}>
                    {inner}
                  </button>
                );
              })}
            </nav>
            {sidebarFoot && <div className="jp-sidebar-foot">{sidebarFoot}</div>}
          </aside>
          <main className="jp-body">{children}</main>
        </div>
        {after}
      </div>
    </div>
  );
}
