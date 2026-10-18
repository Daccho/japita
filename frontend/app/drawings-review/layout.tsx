import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { I18nProvider } from "@/lib/i18n";
import { serverGet } from "@/lib/server-api";

// Restaurant accounts only; the API checks the session again on every request.
export default async function DrawingsReviewLayout({ children }: { children: ReactNode }) {
  const me = await serverGet<{ role: string }>("/auth/me");
  if (!me.ok && me.status === 401) redirect("/login?role=restaurant&next=/drawings-review");
  if (me.ok && me.data.role !== "restaurant") redirect("/suppliers");
  return <I18nProvider>{children}</I18nProvider>;
}
