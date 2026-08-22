import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Download Now · Larpz Wallet",
  manifest: "/manifests/ghost.webmanifest",
};

export default function DownloadWalletRoute() {
  return <WalletLaunchPage initialWallet="ghost" />;
}
