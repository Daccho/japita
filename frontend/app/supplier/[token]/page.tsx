import { redirect } from "next/navigation";
import { supplierEntry } from "@/app/supplier/entry";

// Request links lead to the signed-in supplier's own portal; there is no public request page.
export default async function SupplierRequestLink() {
  redirect(await supplierEntry());
}
