"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut, Menu, UserRound, X, type LucideIcon } from "lucide-react";
import Notifications from "@/components/Notifications";

// The Ajitama workspace frame shared by the restaurant workspace and the supplier portal: the yellow header with the
// Japita logo, the language toggle, the notification bell, the menu button that opens the section navigation as a
// dropdown, and the account avatar that opens the account menu (profile, sign out); below it the full-width body.

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

export type AvatarData = { url: string | null; initials: string };
/** The signed-in account: its avatar in the header opens the account menu (profile, language, sign out). */
export type Account = {
  name: string;
  avatar?: AvatarData | null;
  place?: string | null;
  signOutLabel: string;
  onSignOut: () => void;
  /** "Profile": the restaurant profile page or the supplier's company profile. */
  profile?: { label: string; href?: string; onSelect?: () => void; current?: boolean } | null;
  /** Accessible name of the account button, e.g. "Account". */
  menuLabel?: string;
};
/** Name, place and avatar of the signed-in account (shown in the account menu). */
export type SidebarAccount = { name: string; place?: string | null; avatar?: AvatarData | null };

/** A company's logo, or its initials on a yolk circle. */
export function Avatar({ avatar, name, size = 32 }: { avatar?: AvatarData | null; name: string; size?: number }) {
  const initials = avatar?.initials || name.trim().slice(0, 1).toUpperCase();
  return (
    <span className="jp-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {avatar?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar.url} alt="" width={size} height={size} />
      ) : (
        initials
      )}
    </span>
  );
}

/** Language choice, same look on both sides. */
export function LangSegment<L extends string>({ langs, value, onChange }: { langs: readonly L[]; value: L; onChange: (l: L) => void }) {
  return (
    <div className="jp-segment" role="group" aria-label="Language">
      {langs.map((l) => (
        <button key={l} type="button" aria-pressed={value === l} onClick={() => onChange(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// A header button with a dropdown panel; closes on selection, outside click and Escape.
function Dropdown({
  id,
  label,
  className,
  trigger,
  children,
}: {
  id: string;
  label: string;
  className: string;
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="jp-menu" ref={ref}>
      <button ref={button} type="button" className={className} aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen(!open)}>
        {trigger(open)}
      </button>
      <div className="jp-menu-panel" id={id} hidden={!open}>
        {children(() => setOpen(false))}
      </div>
    </div>
  );
}

function NavLinks({ nav, navLabel, close }: { nav: NavItem[]; navLabel: string; close: () => void }) {
  return (
    <nav className="jp-nav" aria-label={navLabel}>
      {nav.map(({ id, label, icon: Icon, current, href, onSelect, count }) => {
        const inner = (
          <>
            <Icon aria-hidden />
            <span className="jp-nav-label">{label}</span>
            {!!count && <span className="jp-nav-count">{count}</span>}
          </>
        );
        return href ? (
          <Link key={id} href={href} aria-current={current ? "page" : undefined} onClick={close}>
            {inner}
          </Link>
        ) : (
          <button
            key={id}
            type="button"
            aria-current={current ? "page" : undefined}
            onClick={() => {
              close();
              onSelect?.();
            }}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

function AccountMenu({ account, controls }: { account: Account; controls?: ReactNode }) {
  const p = account.profile;
  return (
    <Dropdown
      id="jp-account-panel"
      label={account.menuLabel ?? account.name}
      className="jp-account-button"
      trigger={() => (
        <>
          <Avatar avatar={account.avatar} name={account.name} size={32} />
          <span className="jp-account-button-name">{account.name}</span>
        </>
      )}
    >
      {(close) => (
        <>
          <div className="jp-menu-account">
            <Avatar avatar={account.avatar} name={account.name} size={40} />
            <div>
              <strong>{account.name}</strong>
              {account.place && <span>{account.place}</span>}
            </div>
          </div>
          {p && (
            <NavLinks
              navLabel={account.name}
              close={close}
              nav={[{ id: "profile", label: p.label, icon: UserRound, current: !!p.current, href: p.href, onSelect: p.onSelect }]}
            />
          )}
          {controls && <div className="jp-menu-compact">{controls}</div>}
          <div className="jp-menu-signout">
            <button type="button" className="jp-action" onClick={account.onSignOut}>
              <LogOut aria-hidden />
              {account.signOutLabel}
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}

function NavMenu({ nav, navLabel, menuLabel }: { nav: NavItem[]; navLabel: string; menuLabel: string }) {
  const count = nav.reduce((s, n) => s + (n.count ?? 0), 0);
  return (
    <Dropdown
      id="jp-menu-panel"
      label={menuLabel}
      className="jp-menu-button"
      trigger={(open) => (
        <>
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
          <span className="jp-menu-button-label">{menuLabel}</span>
          {!open && count > 0 && (
            <span className="jp-nav-count" aria-hidden>
              {count}
            </span>
          )}
        </>
      )}
    >
      {(close) => <NavLinks nav={nav} navLabel={navLabel} close={close} />}
    </Dropdown>
  );
}

// The yellow header: also used alone by pages without navigation, such as sign-in.
export function AppHeader({
  homeHref,
  controls,
  account,
  nav,
  navLabel = "Navigation",
  menuLabel = "Menu",
  who,
}: {
  homeHref?: string;
  controls?: ReactNode;
  account?: Account | null;
  nav?: NavItem[];
  navLabel?: string;
  menuLabel?: string;
  who?: SidebarAccount | null;
}) {
  const logo = <Image className="jp-brand-logo" src="/japita-logo-jp.webp" alt="Japita" width={1024} height={302} sizes="(max-width: 480px) 144px, 160px" priority />;
  const hasMenu = !!nav?.length;
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
      <div className={`jp-top-controls ${hasMenu ? "jp-has-menu" : ""}`}>
        {/* On phones the account menu carries the language toggle; without an account it stays in the header. */}
        {controls && <div className={account ? "jp-top-wide" : "jp-top-controls-always"}>{controls}</div>}
        <div className="jp-toolbar jp-header-bell">
          <Notifications />
        </div>
        {hasMenu && <NavMenu nav={nav!} navLabel={navLabel} menuLabel={menuLabel} />}
        {account && <AccountMenu account={{ ...account, place: account.place ?? who?.place, avatar: account.avatar ?? who?.avatar }} controls={controls} />}
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
  menuLabel,
  sidebarFoot,
  children,
  after,
}: {
  homeHref?: string;
  controls?: ReactNode;
  account?: Account | null;
  nav: NavItem[];
  navLabel: string;
  menuLabel?: string;
  /** Place and avatar of the signed-in account, shown in the account menu. */
  sidebarFoot?: SidebarAccount | null;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="jp">
      <div className="jp-app">
        <AppHeader homeHref={homeHref} controls={controls} account={account} nav={nav} navLabel={navLabel} menuLabel={menuLabel} who={sidebarFoot} />
        <main className="jp-body jp-body-wide">{children}</main>
        {after}
      </div>
    </div>
  );
}
