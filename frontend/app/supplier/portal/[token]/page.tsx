import type { Metadata } from "next";
import { PortalApp } from "@/components/portal/PortalApp";

// Supplier portal (Japanese by default, English toggle). Opened from the private link the restaurant shares.
export const metadata: Metadata = {
  title: "サプライヤーポータル",
  robots: { index: false, follow: false },
};

export default async function SupplierPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalApp token={token} />;
}
