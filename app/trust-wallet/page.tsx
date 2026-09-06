import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Trust Wallet",
  manifest: "/manifests/trust.webmanifest",
  icons: {
    apple: [{ url: "/icons/wallets/trust.png", sizes: "280x280", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Trust Wallet",
    statusBarStyle: "black-translucent",
  },
};

export default function TrustWalletRoute() {
  return <WalletLaunchPage initialWallet="trust" />;
}
