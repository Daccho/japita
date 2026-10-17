import type { Metadata } from "next";
import { Archivo, Bodoni_Moda, Dela_Gothic_One, Inter, Noto_Sans_JP, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const noto = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-noto" });
// Ajitama design fonts (docs/design.md): UI, display, printed-menu headings and menu copy.
// Their variables are set on <html> so the :root design tokens can reference them.
const zenKaku = Zen_Kaku_Gothic_New({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-zen-kaku" });
const dela = Dela_Gothic_One({ subsets: ["latin"], weight: "400", variable: "--font-dela" });
const bodoni = Bodoni_Moda({ subsets: ["latin"], weight: ["400", "600", "700", "800"], style: ["normal", "italic"], variable: "--font-bodoni" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Japita",
  description: "Restaurant supplier and purchasing workspace: existing suppliers, new options and weekly basket advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${inter.variable} ${noto.variable} ${zenKaku.variable} ${dela.variable} ${bodoni.variable} ${archivo.variable}`}>
      <body className="font-[family-name:var(--font-zen-kaku),var(--font-noto)] antialiased">
        {children}
      </body>
    </html>
  );
}
