import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalApp, type PortalMe } from "@/components/portal/PortalApp";
import { isTab } from "@/lib/portal";
import type { NotificationFeed } from "@/components/Notifications";
import { PORTAL_LANG_COOKIE } from "@/lib/lang-cookies";
import type { PortalView } from "@/lib/portal";
import { serverGet, serverView } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "サプライヤーポータル",
  robots: { index: false, follow: false },
};

// The signed-in supplier's portal (/suppliers?tab=requests|orders|products|profile), rendered on the server with its data. When the API is slow the page renders
// at once and the browser fetches the same views.
export default async function SupplierHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const lang = (await cookies()).get(PORTAL_LANG_COOKIE)?.value === "en" ? "en" : "ja";
  const me = await serverGet<PortalMe>(`/auth/me?lang=${lang}`);
  if (!me.ok && me.status === 401) redirect("/login?role=supplier&next=/suppliers");
  if (me.ok && me.data.role === "restaurant") redirect("/restaurants");
  const [view, feed] = me.ok
    ? await Promise.all([
        serverView<PortalView>(`/portal/me?lang=${lang}`),
        serverView<NotificationFeed>(`/portal/me/notifications?lang=${lang}`),
      ])
    : [null, null];
  // The open section is always in the URL, so reload, back and forward keep it.
  if (!isTab(tab) && view) redirect(`/suppliers?tab=${view.default_tab}`);
  return <PortalApp lang={lang} me={me.ok ? me.data : null} view={view} feed={feed} tab={isTab(tab) ? tab : null} />;
}
