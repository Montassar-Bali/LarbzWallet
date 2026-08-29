import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Phantom",
  manifest: "/manifests/ghost.webmanifest",
  icons: {
    icon: [{ url: "/icons/phantom-pwa-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/phantom-pwa-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Phantom",
    statusBarStyle: "black-translucent",
  },
};

export default function DownloadWalletRoute() {
  return <WalletLaunchPage initialWallet="ghost" />;
}
