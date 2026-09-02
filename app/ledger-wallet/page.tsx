import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Larpz Wallet",
  manifest: "/manifests/ledger.webmanifest",
  icons: {
    apple: [{ url: "/assets/logo_m.png", sizes: "1200x1200", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Larpz Wallet",
    statusBarStyle: "black-translucent",
  },
};

export default function LedgerWalletRoute() {
  return <WalletLaunchPage initialWallet="ledger" />;
}
