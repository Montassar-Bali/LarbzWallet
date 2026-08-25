import type { Metadata } from "next";

import { LedgerWallet } from "@/components/wallet/ledger-wallet";

export const metadata: Metadata = {
  title: "Ledger Wallet",
  manifest: "/manifests/ledger.webmanifest",
  icons: {
    apple: [{ url: "/icons/wallets/ledger.png", sizes: "280x280", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Ledger Wallet",
    statusBarStyle: "black-translucent",
  },
};

export default function LedgerWalletRoute() {
  return <LedgerWallet />;
}
