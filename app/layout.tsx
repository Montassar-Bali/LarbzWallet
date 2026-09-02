import type { Metadata, Viewport } from "next";
import { DM_Sans, Space_Mono } from "next/font/google";

import { AppProvider } from "@/components/providers/app-provider";
import { siteConfig } from "@/config/site";

import "./globals.css";
import "./larpz-marketing.css";

const headingFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "700"],
  display: "swap",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
  display: "swap",
});

const monoFont = Space_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: "Larp Wallet - Fake Crypto Wallet App",
  description: siteConfig.siteDescription,
  keywords: [
    "crypto wallet simulator",
    "demo wallet",
    "pwa wallet",
    "content creator wallet",
    "simulated transactions",
  ],
  openGraph: {
    title: "Larp Wallet - Fake Crypto Wallet App",
    description: siteConfig.siteDescription,
    url: siteConfig.url,
    siteName: siteConfig.siteName,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Larp Wallet - Fake Crypto Wallet App",
    description: siteConfig.siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/assets/logo_m.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/assets/logo_m.png", sizes: "512x512", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Crypto Wallet Simulator",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#130f24" },
    { media: "(prefers-color-scheme: light)", color: "#130f24" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
