import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WalletProviders } from "@/components/WalletProviders";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://tornacurb.vercel.app"),
  title: "TornaCurb, a central limit order book for pre-IPO stock tokens",
  description:
    "There is no exchange for OpenAI stock, so an AMM has no formed price to quote against. TornaCurb is a central limit order book for pre-IPO stock tokens on Solana, built on Torna: every B+ tree node is its own account, so quotes at different price levels commit in the same slot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=clash-grotesk@300,400,500,600,700&display=swap"
        />
      </head>
      <body className="flex min-h-full flex-col">
        <WalletProviders>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProviders>
        <Analytics />
      </body>
    </html>
  );
}
