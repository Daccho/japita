import Basket from "@/components/pages/Basket";
import type { BasketView, ClarificationsView } from "@/lib/api";
import { restaurantLang, serverView } from "@/lib/server-api";

export default async function BasketPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const plan = (await searchParams).plan ?? null;
  const lang = await restaurantLang();
  const [basket, questions] = await Promise.all([
    serverView<BasketView>(`/views/basket?lang=${lang}${plan ? `&kind=${encodeURIComponent(plan)}` : ""}`),
    serverView<ClarificationsView>(`/views/clarifications?lang=${lang}`),
  ]);
  return <Basket initial={basket} initialPlan={plan} questions={questions} />;
}
