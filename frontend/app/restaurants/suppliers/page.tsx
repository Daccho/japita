import Suppliers from "@/components/pages/Suppliers";
import { suppliersPath, type SupplierQuery } from "@/lib/paths";
import type { SupplierDetailView, SuppliersView } from "@/lib/api";
import { restaurantLang, serverView } from "@/lib/server-api";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const lang = await restaurantLang();
  const query: SupplierQuery = {
    view: ["discover", "candidate"].includes(one(sp.view) ?? "") ? "candidate" : "existing",
    q: one(sp.q) ?? null,
    ingredient: one(sp.ingredient) ?? "all",
    name: one(sp.name) ?? "",
    sort: one(sp.sort) ?? "name-asc",
  };
  const open = one(sp.supplier) ?? null;
  const [list, detail] = await Promise.all([
    serverView<SuppliersView>(suppliersPath(query, lang)),
    open ? serverView<SupplierDetailView>(`/views/suppliers/${encodeURIComponent(open)}?lang=${lang}`) : Promise.resolve(null),
  ]);
  // A supplier opened from a notification shows in its own list (existing or candidate).
  return <Suppliers initial={list} initialQuery={query} initialOpen={open} initialDetail={detail} />;
}
