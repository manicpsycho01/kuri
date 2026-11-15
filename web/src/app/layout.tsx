import type { Metadata, Viewport } from "next";
import { Anek_Latin, DM_Mono } from "next/font/google";
import { SmoothScroll } from "@/components/SmoothScroll";
import "./globals.css";

const anek = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--font-anek" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dmmono" });

const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3600";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: "Kuri — a chit fund nobody can run away with", template: "%s · Kuri" },
  description:
    "India's chit fund, rebuilt as Solidity smart contracts: monthly instalments, a sealed-bid auction for the pot, dividends for everyone else — and no organiser who can disappear with the money. Play a circle in your browser, or use the live contracts on Base Sepolia.",
  openGraph: { title: "Kuri", description: "A chit fund nobody can run away with. Real Solidity contracts — play a circle in your browser.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#04070a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${anek.variable} ${dmMono.variable}`}>
      <body>
        <a href="#main" className="label fixed top-3 left-3 z-50 -translate-y-24 rounded-full bg-ice px-4 py-3 text-night focus-visible:translate-y-0">Skip to content</a>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
