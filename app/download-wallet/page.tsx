import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Download Now · Larpz Wallet",
  manifest: "/manifests/ghost.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Larpz Wallet",
    statusBarStyle: "black-translucent",
  },
};

export default function DownloadWalletRoute() {
  return <WalletLaunchPage initialWallet="ghost" />;
}
