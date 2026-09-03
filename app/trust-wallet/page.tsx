import type { Metadata } from "next";

import { WalletLaunchPage } from "@/components/dashboard/wallet-launch-page";

export const metadata: Metadata = {
  title: "Larpz Wallet · Trust Style",
  manifest: "/manifests/trust.webmanifest",
  icons: {
    apple: [{ url: "/assets/logo_m.png", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Larpz Wallet",
    statusBarStyle: "black-translucent",
  },
};

export default function TrustWalletRoute() {
  return <WalletLaunchPage initialWallet="trust" />;
}
