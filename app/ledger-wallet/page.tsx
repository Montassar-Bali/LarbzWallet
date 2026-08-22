import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Ledger Wallet · Larpz Wallet",
  manifest: "/manifests/ledger.webmanifest",
};

export default function LedgerWalletRoute() {
  return <WalletLaunchPage initialWallet="ledger" />;
}
