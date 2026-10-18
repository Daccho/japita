import { redirect } from "next/navigation";
import { supplierEntry } from "@/app/supplier/entry";

// Portal links lead to the signed-in supplier's own portal; there is no public portal page.
export default async function SupplierPortalLink() {
  redirect(await supplierEntry());
}
