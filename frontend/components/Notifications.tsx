"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { sendJson } from "@/lib/api";
import { useView } from "@/components/live";

// The notification bell shared by the restaurant workspace and the supplier portal. The server builds the feed
// (texts, links, read state per account); opening the bell marks the shown items as read on the server.

export type NotificationItem = {
  id: string;
  kind: string;
  badge: string;
  warn: boolean;
  title: string;
  body: string;
  href: string;
  action: string;
  unread: boolean;
  tab?: string;
};
export type NotificationFeed = {
  title: string;
  close_label: string;
  empty_text: string | null;
  aria: string;
  unread: number;
  items: NotificationItem[];
};

type Ctx = { feed: NotificationFeed | null; markSeen: () => void; onNavigate?: (item: NotificationItem) => void };
const FeedCtx = createContext<Ctx | null>(null);

/** Loads a feed (`path`, `seenPath` take the same query) and offers it to the bell in the page header. */
export function NotificationsProvider({
  path,
  seenPath,
  initial,
  onNavigate,
  children,
}: {
  path: string;
  seenPath: string;
  initial: NotificationFeed | null;
  onNavigate?: (item: NotificationItem) => void;
  children: ReactNode;
}) {
  const { data, setData } = useView<NotificationFeed>(path, initial);
  const markSeen = () => {
    const ids = (data?.items ?? []).filter((i) => i.unread).map((i) => i.id);
    if (!ids.length) return;
    sendJson<NotificationFeed>("POST", seenPath, { ids })
      .then((f) => setData(f))
      .catch(() => {});
  };
  return <FeedCtx.Provider value={{ feed: data, markSeen, onNavigate }}>{children}</FeedCtx.Provider>;
}

export default function Notifications() {
  const ctx = useContext(FeedCtx);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const feed = ctx?.feed ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!ctx || !feed) return null;
  const toggle = () => {
    if (!open) ctx.markSeen();
    setOpen(!open);
  };
  const unread = feed.unread;

  return (
    <div ref={ref} style={{ display: "contents" }}>
      <button
        type="button"
        className="jp-notification-bell"
        aria-label={unread ? feed.aria : feed.title}
        aria-expanded={open}
        aria-controls="jp-notifications"
        onClick={toggle}
      >
        <Bell aria-hidden />
        {unread > 0 && (
          <span className="jp-unread" aria-hidden>
            {unread}
          </span>
        )}
      </button>
      <section className="jp-notifications" id="jp-notifications" aria-label={feed.title} hidden={!open}>
        <div className="jp-line-head">
          <h3>{feed.title}</h3>
          <button type="button" className="jp-close" aria-label={feed.close_label} onClick={() => setOpen(false)}>
            <X aria-hidden />
          </button>
        </div>
        {feed.items.length === 0 && feed.empty_text && <p>{feed.empty_text}</p>}
        {feed.items.map((i) => (
          <div key={i.id} className="jp-notification-item">
            <span className={`jp-badge ${i.warn ? "jp-warning" : ""}`}>{i.badge}</span>
            <h3 style={{ marginTop: 10 }}>{i.title}</h3>
            <p>{i.body}</p>
            {ctx.onNavigate ? (
              <button
                type="button"
                className="jp-action"
                onClick={() => {
                  setOpen(false);
                  ctx.onNavigate!(i);
                }}
              >
                {i.action}
              </button>
            ) : (
              <Link href={i.href} className="jp-action" onClick={() => setOpen(false)}>
                {i.action}
              </Link>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
