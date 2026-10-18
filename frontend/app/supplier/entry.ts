import { serverGet } from "@/lib/server-api";

/** Where an old portal or request link goes: the supplier's portal when signed in as a supplier, else sign-in. */
export async function supplierEntry(): Promise<string> {
  const me = await serverGet<{ role: string }>("/auth/me");
  return me.ok && me.data.role === "supplier" ? "/suppliers" : "/login?role=supplier&next=/suppliers";
}
