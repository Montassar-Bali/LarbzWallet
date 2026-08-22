"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, Laptop, ShieldCheck, Smartphone } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { getWalletTheme, setWalletTheme } from "@/lib/wallet";
import type { WalletThemeId } from "@/config/wallets";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

type WalletOption = {
  id: WalletThemeId;
  label: string;
  description: string;
  image: string;
  icon: typeof Smartphone;
  recommended?: boolean;
};

const walletOptions: WalletOption[] = [
  {
    id: "ghost",
    label: "Download Now",
    description: "The mobile-first wallet from your preview, with Home, Trade, Explore, tokens, actions, and settings.",
    image: "/assets/mockup-phone.png",
    icon: Smartphone,
    recommended: true,
  },
  {
    id: "ledger",
    label: "Ledger Wallet",
    description: "A clean, high-contrast Ledger-inspired interface for your simulated portfolio.",
    image: "/assets/mockup-phone-l.png",
    icon: Laptop,
  },
  {
    id: "trust",
    label: "Trust Wallet",
    description: "A familiar blue multi-chain wallet layout for your demo balances.",
    image: "/assets/mockup-phone-t.png",
    icon: ShieldCheck,
  },
];

export function WalletLaunchPage() {
  const router = useRouter();
  const [activeWallet, setActiveWallet] = useState<WalletThemeId>(() => getWalletTheme());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) {
      manifest.href = `/manifests/${activeWallet}.webmanifest`;
    }
  }, [activeWallet]);

  const chooseWallet = (wallet: WalletThemeId) => {
    setWalletTheme(wallet);
    setActiveWallet(wallet);
    window.dispatchEvent(new Event("wallet-theme-change"));
  };

  const addToHomeScreen = async () => {
    setInstalling(true);

    if (installPrompt) {
      try {
        await installPrompt.prompt();
      } catch {
        // The browser can dismiss the native prompt before it resolves.
      }
      setInstallPrompt(null);
    }

    // iOS does not expose beforeinstallprompt. Opening the wallet here keeps the
    // flow useful while the on-page instructions explain the Share menu step.
    router.push("/wallet");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#10154d] text-white" style={{ background: "linear-gradient(145deg, #121852 0%, #20299d 47%, #3139d2 100%)" }}>
      <div className="pointer-events-none fixed inset-0 opacity-60" aria-hidden="true">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#8f9dff]/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-96 w-96 rounded-full bg-[#5e6cff]/20 blur-3xl" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Logo href="/" />
        <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white/75 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-300" /> License active
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-12 pt-6 sm:px-8 sm:pb-20 sm:pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-[#cbd0ff]">One license · three wallet styles</p>
          <h1 className="text-4xl font-bold tracking-[-0.06em] text-white sm:text-6xl">Choose your wallet.</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
            Select the wallet you want to install. Download Now is the interactive mobile wallet shown in your reference photos.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-4 lg:grid-cols-3">
          {walletOptions.map((option) => {
            const selected = activeWallet === option.id;
            const Icon = option.icon;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseWallet(option.id)}
                className={`group relative overflow-hidden rounded-3xl border p-3 text-left transition duration-200 ${
                  selected
                    ? "border-[#c1b8ff] bg-[#8790ff]/25 shadow-[0_20px_70px_-25px_rgba(151,157,255,0.9)]"
                    : "border-white/12 bg-[#161d78]/65 hover:-translate-y-1 hover:border-white/30 hover:bg-[#2633a0]/75"
                }`}
              >
                {option.recommended ? (
                  <span className="absolute right-5 top-5 z-10 rounded-full bg-[#b7adff] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2b237b]">
                    Recommended
                  </span>
                ) : null}
                <div className="relative h-72 overflow-hidden rounded-[1.35rem] bg-[#080a14] sm:h-80">
                  <Image
                    src={option.image}
                    alt={`${option.label} preview`}
                    fill
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 90vw"
                    className="object-contain object-top transition duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#090b1b] to-transparent" />
                </div>
                <div className="px-2 pb-2 pt-5">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-9 w-9 place-items-center rounded-xl ${selected ? "bg-[#b8b0ff] text-[#312987]" : "bg-white/10 text-white"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-semibold text-white">{option.label}</h2>
                      <p className="text-xs text-white/45">{selected ? "Selected wallet" : "Tap to select"}</p>
                    </div>
                    {selected ? <Check className="ml-auto h-5 w-5 text-[#c6beff]" /> : null}
                  </div>
                  <p className="mt-4 min-h-12 text-sm leading-5 text-white/65">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-white/15 bg-[#10165f]/70 p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#a9a2ff]/20 text-[#c9c3ff]"><Download className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold text-white">Install {walletOptions.find((item) => item.id === activeWallet)?.label}</h2>
              <p className="mt-1 text-sm leading-5 text-white/60">
                On iPhone, use Safari&apos;s Share button and choose <span className="text-white/85">Add to Home Screen</span>. On Android, Chrome will show the install prompt automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={addToHomeScreen}
            disabled={installing}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#aaa3ff] px-5 py-4 text-sm font-bold text-[#292277] shadow-[0_16px_30px_-15px_rgba(167,159,255,0.9)] transition hover:bg-[#c0bbff] disabled:cursor-wait disabled:opacity-70"
          >
            {installing ? "Opening wallet..." : "Add to Home Screen"}
            <ExternalLink className="h-4 w-4" />
          </button>
          <p className="mt-3 text-center text-[11px] text-white/40">Balances and transactions are simulated for demonstration only.</p>
        </div>
      </section>
    </main>
  );
}
