import Week from "@/components/pages/Week";
import type { WeekView } from "@/lib/api";
import { restaurantLang, serverView } from "@/lib/server-api";

export default async function WeekPage() {
  const lang = await restaurantLang();
  return <Week initial={await serverView<WeekView>(`/views/week?lang=${lang}`)} />;
}
