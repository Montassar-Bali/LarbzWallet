import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Trust Wallet · Larpz Wallet",
  manifest: "/manifests/trust.webmanifest",
};

export default function TrustWalletRoute() {
  return <WalletLaunchPage initialWallet="trust" />;
}
