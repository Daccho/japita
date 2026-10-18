// View paths shared by server pages and their client components (plain module: usable on both sides).

export type SupplierQuery = { view: "existing" | "candidate"; q: string | null; ingredient: string; name: string; sort: string };

export function suppliersPath(q: SupplierQuery, lang: string) {
  const p = new URLSearchParams({ lang, view: q.view, ingredient: q.ingredient, sort: q.sort });
  if (q.view === "existing" && q.name) p.set("name", q.name);
  if (q.view === "candidate" && q.q !== null) p.set("q", q.q);
  return `/views/suppliers?${p}`;
}

export const PROFILE_TABS = ["overview", "menu", "buying", "links"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export function profileTabPath(tab: ProfileTab, lang: string) {
  const path = { overview: "/restaurant/profile", menu: "/views/menu", buying: "/views/profile", links: "/restaurant/links" }[tab];
  return `${path}?lang=${lang}`;
}
