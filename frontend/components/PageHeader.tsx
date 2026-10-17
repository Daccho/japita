"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ShoppingBasket } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import Notifications from "@/components/Notifications";

// Page title with the toolbar at the upper right: a page action (Review basket by default) and the bell.
export default function PageHeader({ kicker, title, sub, action }: { kicker: string; title: string; sub?: ReactNode; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="jp-header">
      <div>
        <span className="jp-kicker">{kicker}</span>
        <h1 style={{ marginTop: 8 }}>{title}</h1>
        {sub && <p className="jp-muted">{sub}</p>}
      </div>
      <div className="jp-toolbar">
        {action ?? (
          <Link href="/basket" className="jp-action">
            <ShoppingBasket aria-hidden />
            {t("review.basket")}
          </Link>
        )}
        <Notifications />
      </div>
    </div>
  );
}
