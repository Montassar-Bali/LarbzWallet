"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { DownloadWallet } from "@/components/wallet/download-wallet";
import type { WalletThemeId } from "@/config/wallets";
import { getWalletTheme } from "@/lib/wallet";

const alternateWallets: Record<Exclude<WalletThemeId, "ghost">, { label: string; image: string; description: string }> = {
  ledger: {
    label: "Ledger Wallet",
    image: "/assets/mockup-phone-l.png",
    description: "Your Ledger-inspired simulation is ready. Open the dashboard to customize its fictional balances.",
  },
  trust: {
    label: "Trust Wallet",
    image: "/assets/mockup-phone-t.png",
    description: "Your Trust-inspired simulation is ready. Open the dashboard to customize its fictional balances.",
  },
};

function AlternateWallet({ themeId }: { themeId: Exclude<WalletThemeId, "ghost"> }) {
  const wallet = alternateWallets[themeId];

  return (
    <main className="min-h-screen bg-[#07090f] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col items-center justify-center text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Wallet ready</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.06em]">{wallet.label}</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-white/55">{wallet.description}</p>
        <div className="mt-8 w-full max-w-[250px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-black shadow-2xl shadow-black">
          <Image src={wallet.image} alt={`${wallet.label} preview`} width={1419} height={2796} className="h-auto w-full object-contain" priority />
        </div>
        <Link href="/dashboard" className="mt-8 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#090a10] transition hover:bg-white/85">
          Open dashboard
        </Link>
        <p className="mt-4 text-xs text-white/35">Simulation only — no real wallets or transactions are connected.</p>
      </div>
    </main>
  );
}

export function WalletAppRoute() {
  const themeId = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("wallet-theme-change", onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener("wallet-theme-change", onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getWalletTheme,
    () => "ghost" as WalletThemeId,
  );

  if (themeId === "ghost") {
    return <DownloadWallet />;
  }

  return <AlternateWallet themeId={themeId} />;
}
