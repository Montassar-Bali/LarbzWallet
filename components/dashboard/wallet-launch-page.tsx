"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Download, Menu, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";

import { WalletAppRoute } from "@/components/wallet/wallet-app-route";
import { getWalletTheme, setWalletTheme } from "@/lib/wallet";
import { walletInstallPaths, type WalletThemeId } from "@/config/wallets";

const walletOptions: { id: WalletThemeId; label: string; icon: LucideIcon; featured?: boolean }[] = [
  { id: "ghost", label: "Download Now", icon: Download, featured: true },
  { id: "ledger", label: "Get Ledger Wallet", icon: RefreshCw },
  { id: "trust", label: "Get Trust Wallet", icon: ShieldCheck },
];

const homeScreenNames: Record<WalletThemeId, string> = {
  ghost: "Download Now Wallet",
  ledger: "Ledger Wallet",
  trust: "Trust Wallet",
};

export function WalletLaunchPage({ initialWallet }: { initialWallet?: WalletThemeId }) {
  const [activeWallet, setActiveWallet] = useState<WalletThemeId>(() => initialWallet ?? getWalletTheme());
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) {
      manifest.href = `/manifests/${activeWallet}.webmanifest`;
    }

    const walletUrl = new URL(walletInstallPaths[activeWallet], window.location.origin);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      canonical.href = walletUrl.href;
    }

    const selectedLabel = homeScreenNames[activeWallet];
    document.title = `${selectedLabel} · Larpz Wallet`;
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.content = selectedLabel;
    }

    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleIcon) {
      appleIcon.href = activeWallet === "ghost"
        ? "/assets/logo_m.png"
        : activeWallet === "ledger"
          ? "/icons/wallets/ledger.png"
          : "/icons/wallets/trust.png";
    }
  }, [activeWallet]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => {
      const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setStandalone(mediaQuery.matches || iosStandalone);
    };

    updateStandalone();
    mediaQuery.addEventListener?.("change", updateStandalone);
    mediaQuery.addListener?.(updateStandalone);

    return () => {
      mediaQuery.removeEventListener?.("change", updateStandalone);
      mediaQuery.removeListener?.(updateStandalone);
    };
  }, []);

  const chooseWallet = (wallet: WalletThemeId) => {
    setActiveWallet(wallet);
    setWalletTheme(wallet);

    // Load the route as a new document so Safari reads this wallet's static
    // title, icon, and manifest before opening Add to Home Screen.
    window.location.assign(walletInstallPaths[wallet]);

    window.dispatchEvent(new Event("wallet-theme-change"));
  };

  if (standalone && initialWallet) {
    return <WalletAppRoute initialTheme={initialWallet} />;
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#2639df] text-white" style={{ background: "linear-gradient(180deg, #1f2cbd 0%, #2938dc 48%, #2d42f0 100%)" }}>
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col bg-[#2738d8]/55 shadow-2xl shadow-[#10177c]/35">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/10 bg-[#2232bd]/75 px-5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-[#9eabff] shadow-lg shadow-[#161c9a]/30">
              <Image src="/assets/logo_m.png" alt="Flex Wallet logo" width={40} height={40} className="h-full w-full object-cover" priority />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">Flex Wallet</span>
          </div>
          <button type="button" aria-label="Open wallet menu" className="grid h-10 w-10 place-items-center rounded-xl text-white/90 transition hover:bg-white/10">
            <Menu className="h-6 w-6" />
          </button>
        </header>

        <section className="flex flex-1 flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-14 text-center sm:pt-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-[11px] font-medium text-white/80 shadow-lg shadow-[#161b96]/20">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            License Active
          </div>
          <h1 className="mt-9 text-[3.35rem] font-bold leading-[0.98] tracking-[-0.07em] text-white sm:text-6xl">Your<br />Dashboard.</h1>
          <p className="mt-7 max-w-[300px] text-sm leading-6 text-white/65 sm:max-w-sm sm:text-base">
            Follow the steps below to download and install Flex Wallet on your device. It only takes a minute.
          </p>

          <div className="mt-9 flex w-full max-w-[230px] flex-col gap-3">
            {walletOptions.map(({ id, label, icon: Icon, featured }) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeWallet === id}
                onClick={() => chooseWallet(id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 ${
                  featured
                    ? activeWallet === id
                      ? "border-white/40 bg-[#9eabff] text-white shadow-[#1721a2]/40"
                      : "border-transparent bg-[#8e9dff] text-white shadow-[#1721a2]/30 hover:bg-[#9eabff]"
                    : activeWallet === id
                      ? "border-white/35 bg-[#3447dc] text-white shadow-[#1721a2]/40"
                      : "border-transparent bg-[#2433c7]/80 text-white/90 shadow-[#1721a2]/25 hover:bg-[#3447dc]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {activeWallet === id ? <Check className="h-4 w-4" /> : null}
              </button>
            ))}
          </div>

          <p className="mt-8 max-w-[250px] text-[11px] leading-5 text-white/50">
            Select a wallet, then tap Share → Add to Home Screen. The shortcut will open this wallet&apos;s own interface.
          </p>
        </section>
      </div>
    </main>
  );
}
