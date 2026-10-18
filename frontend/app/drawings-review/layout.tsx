"use client";

import type { ReactNode } from "react";
import AuthGate from "@/components/AuthGate";
import { I18nProvider } from "@/lib/i18n";

export default function DrawingsReviewLayout({ children }: { children: ReactNode }) {
  return <I18nProvider><AuthGate>{children}</AuthGate></I18nProvider>;
}
