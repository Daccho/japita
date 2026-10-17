import type { Metadata } from "next";
import { Noto_Sans_JP, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const noto = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-noto" });

export const metadata: Metadata = {
  title: "Japita",
  description: "Restaurant supplier and purchasing workspace: existing suppliers, new options and weekly basket advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={`${inter.variable} ${noto.variable} font-[family-name:var(--font-inter),var(--font-noto)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
