"use client";

import { useEffect, useSyncExternalStore } from "react";

import { AlternateWallet } from "@/components/wallet/alternate-wallet";
import { DownloadWalletWithSplash } from "@/components/wallet/download-wallet-splash";
import { LedgerWallet } from "@/components/wallet/ledger-wallet";
import { TrustWallet } from "@/components/wallet/trust-wallet";
import { WalletRuntimeProvider } from "@/components/wallet/wallet-runtime";
import type { WalletThemeId } from "@/config/wallets";
import { defaultWalletTheme } from "@/config/wallets";
import { getWalletTheme, isWalletThemeId, setWalletTheme } from "@/lib/wallet";

function getUrlWalletTheme(): WalletThemeId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("wallet");
  return isWalletThemeId(value) ? value : null;
}

function getCurrentWalletTheme() {
  return getUrlWalletTheme() ?? getWalletTheme();
}

export function WalletAppRoute({ initialTheme }: { initialTheme?: WalletThemeId }) {
  const themeId = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("wallet-theme-change", onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener("wallet-theme-change", onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () => initialTheme ?? getCurrentWalletTheme(),
    () => initialTheme ?? defaultWalletTheme,
  );

  useEffect(() => {
    if (initialTheme) {
      setWalletTheme(initialTheme);
    }
  }, [initialTheme]);

  if (themeId === "ghost") {
    return <div className="phantom-wallet-font"><WalletRuntimeProvider walletId="ghost"><DownloadWalletWithSplash /></WalletRuntimeProvider></div>;
  }

  if (themeId === "trust") {
    return <WalletRuntimeProvider walletId="trust"><TrustWallet /></WalletRuntimeProvider>;
  }

  if (themeId === "ledger") {
    return <WalletRuntimeProvider walletId="ledger"><LedgerWallet /></WalletRuntimeProvider>;
  }

  return <AlternateWallet themeId={themeId} />;
}
