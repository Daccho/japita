import Profile from "@/components/pages/Profile";
import { PROFILE_TABS, profileTabPath, type ProfileTab } from "@/lib/paths";
import { restaurantLang, serverView } from "@/lib/server-api";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab: ProfileTab = (PROFILE_TABS as readonly string[]).includes(asked ?? "") ? (asked as ProfileTab) : "overview";
  const lang = await restaurantLang();
  return <Profile tab={tab} initial={await serverView<unknown>(profileTabPath(tab, lang))} />;
}
