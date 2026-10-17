import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Sans_JP, Inter } from "next/font/google";
import "./globals.css";
import ModelBadge from "@/components/ModelBadge";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const noto = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-noto" });

export const metadata: Metadata = {
  title: "Japita",
  description: "Weekly purchasing advisor for Japanese restaurants in Italy, with Japanese suppliers read by Gemma on AMD",
};

const NAV = [
  { href: "/", label: "This week" },
  { href: "/suppliers", label: "Suppliers & offers" },
  { href: "/basket", label: "Basket & advisor" },
  { href: "/goals", label: "Restaurant goals" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${noto.variable} font-[family-name:var(--font-inter),var(--font-noto)] antialiased`}>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-red-700">Japita</span>
              <span className="text-xs text-stone-500">Italian kitchens · Japanese suppliers</span>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded px-2 py-1 text-stone-700 hover:bg-stone-100">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <ModelBadge />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-stone-500">
          Fictional demo data: suppliers, prices, and specifications are invented. Decision support only, not legal or
          customs clearance. Orders and supplier messages require human approval.
        </footer>
      </body>
    </html>
  );
}
