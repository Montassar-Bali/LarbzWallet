"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  Grid2X2,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Shuffle,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import type { WalletThemeId } from "@/config/wallets";

type AlternateWalletId = Exclude<WalletThemeId, "ghost">;
type Tab = "wallet" | "discover" | "settings";

type Token = {
  name: string;
  symbol: string;
  balance: string;
  value: string;
  color: string;
  mark: string;
};

type WalletDesign = {
  name: string;
  subtitle: string;
  logo: string;
  background: string;
  surface: string;
  softSurface: string;
  accent: string;
  accentText: string;
  tokens: Token[];
  actions: { label: string; icon: LucideIcon }[];
};

const designs: Record<AlternateWalletId, WalletDesign> = {
  ledger: {
    name: "Larpz Wallet",
    subtitle: "Internal demo wallet",
    logo: "/assets/logo_m.png",
    background: "#000000",
    surface: "#171717",
    softSurface: "#111111",
    accent: "#a995f2",
    accentText: "#15101e",
    tokens: [
      { name: "Bitcoin", symbol: "BTC", balance: "0 BTC", value: "$0.00", color: "#f7931a", mark: "₿" },
      { name: "Ethereum", symbol: "ETH", balance: "0 ETH", value: "$0.00", color: "#627eea", mark: "◆" },
      { name: "Solana", symbol: "SOL", balance: "0 SOL", value: "$0.00", color: "#9945ff", mark: "≡" },
      { name: "Tether", symbol: "USDT", balance: "0 USDT", value: "$0.00", color: "#26a17b", mark: "₮" },
    ],
    actions: [
      { label: "Send", icon: ArrowUpRight },
      { label: "Receive", icon: ArrowDownLeft },
      { label: "Buy", icon: Plus },
      { label: "Swap", icon: Shuffle },
    ],
  },
  trust: {
    name: "Trust Wallet",
    subtitle: "Wallet 1",
    logo: "/icons/wallets/trust.png",
    background: "#06162b",
    surface: "#0d2947",
    softSurface: "#09203a",
    accent: "#4ea6ff",
    accentText: "#06162b",
    tokens: [
      { name: "Bitcoin", symbol: "BTC", balance: "0 BTC", value: "$0.00", color: "#f7931a", mark: "₿" },
      { name: "Ethereum", symbol: "ETH", balance: "0 ETH", value: "$0.00", color: "#627eea", mark: "◆" },
      { name: "BNB Smart Chain", symbol: "BNB", balance: "0 BNB", value: "$0.00", color: "#f3ba2f", mark: "B" },
      { name: "Solana", symbol: "SOL", balance: "0 SOL", value: "$0.00", color: "#9945ff", mark: "≡" },
    ],
    actions: [
      { label: "Send", icon: ArrowUpRight },
      { label: "Receive", icon: ArrowDownLeft },
      { label: "Buy", icon: Plus },
      { label: "Swap", icon: Shuffle },
    ],
  },
};

function TokenMark({ token }: { token: Token }) {
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold text-white shadow-inner shadow-white/20"
      style={{ background: `linear-gradient(135deg, ${token.color}, ${token.color}99)` }}
    >
      {token.mark}
    </span>
  );
}

function WalletAction({
  label,
  icon: Icon,
  accent,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 text-xs font-semibold text-white/75 transition hover:text-white"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10" style={{ color: accent }}>
        <Icon className="h-5 w-5" />
      </span>
      {label}
    </button>
  );
}

export function AlternateWallet({ themeId }: { themeId: AlternateWalletId }) {
  const design = designs[themeId];
  const [tab, setTab] = useState<Tab>("wallet");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [notice, setNotice] = useState("");

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  return (
    <main className="min-h-screen text-white" style={{ background: design.background }}>
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col overflow-hidden" style={{ background: design.background }}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Image src={design.logo} alt={`${design.name} logo`} width={40} height={40} className="h-10 w-10 rounded-xl" priority />
            <div>
              <p className="text-base font-semibold tracking-tight">{design.name}</p>
              <p className="text-xs text-white/45">Simulation wallet</p>
            </div>
          </div>
          <button type="button" onClick={() => notify("Wallet menu is available in simulation mode.")} aria-label="Open wallet menu" className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.07] text-white/75 hover:bg-white/10">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </header>

        <section className="flex-1 overflow-y-auto px-5 pb-32 pt-5">
          <div className="mb-6 flex rounded-2xl p-1" style={{ background: design.softSurface }}>
            {([
              ["wallet", "Wallet", WalletCards],
              ["discover", "Discover", Compass],
              ["settings", "Settings", Settings],
            ] as [Tab, string, LucideIcon][]).map(([item, label, Icon]) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition ${tab === item ? "text-white shadow-lg" : "text-white/45 hover:text-white/75"}`}
                style={tab === item ? { background: design.surface, color: design.accent } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {tab === "wallet" ? (
            <>
              <div className="rounded-3xl p-5 shadow-2xl" style={{ background: `linear-gradient(145deg, ${design.surface}, ${design.softSurface})` }}>
                <div className="flex items-center justify-between text-xs text-white/55">
                  <span>{design.subtitle}</span>
                  <ChevronDown className="h-4 w-4" />
                </div>
                <div className="mt-7 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/45">Total balance</p>
                    <p className="mt-2 text-[2.75rem] font-semibold leading-none tracking-[-0.07em]">{balanceVisible ? "$0.00" : "••••"}</p>
                    <p className="mt-2 text-xs text-white/45">$0.00 USD</p>
                  </div>
                  <button type="button" onClick={() => setBalanceVisible((visible) => !visible)} aria-label={balanceVisible ? "Hide balance" : "Show balance"} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/65 hover:bg-white/15">
                    {balanceVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-2 rounded-3xl p-4" style={{ background: design.surface }}>
                {design.actions.map(({ label, icon: Icon }) => <WalletAction key={label} label={label} icon={Icon} accent={design.accent} onClick={() => notify(`${label} opened in simulation mode.`)} />)}
              </div>

              <div className="mt-7 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-[-0.04em]">Assets</h1>
                  <p className="mt-1 text-xs text-white/40">Your simulated portfolio</p>
                </div>
                <button type="button" onClick={() => notify("Asset search is available in simulation mode.")} aria-label="Search assets" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.07] text-white/60 hover:bg-white/10"><Search className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 space-y-2">
                {design.tokens.map((token) => (
                  <button key={token.symbol} type="button" onClick={() => notify(`${token.name} selected`)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.06]" style={{ background: design.softSurface }}>
                    <TokenMark token={token} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{token.name}</span>
                      <span className="mt-0.5 block text-xs text-white/40">{token.balance}</span>
                    </span>
                    <span className="text-right"><span className="block text-sm font-semibold">{token.value}</span><span className="mt-0.5 block text-xs text-white/35">0.00%</span></span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => notify("Add asset is available in simulation mode.")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-3 text-xs font-semibold text-white/55 hover:border-white/30 hover:text-white/80"><Plus className="h-4 w-4" /> Add asset</button>
            </>
          ) : (
            <div className="rounded-3xl p-6" style={{ background: design.surface }}>
              <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${design.accent}20`, color: design.accent }}>
                {tab === "discover" ? <Compass className="h-6 w-6" /> : <Settings className="h-6 w-6" />}
              </div>
              <h1 className="mt-6 text-2xl font-semibold">{tab === "discover" ? "Discover" : "Settings"}</h1>
              <p className="mt-3 text-sm leading-6 text-white/50">This {design.name} screen is part of the visual wallet simulator. No real assets or transactions are connected.</p>
              <button type="button" onClick={() => notify(`${tab === "discover" ? "Discover" : "Settings"} opened in simulation mode.`)} className="mt-6 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: design.accent, color: design.accentText }}>Continue</button>
            </div>
          )}
        </section>

        <nav className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-[534px] items-center justify-around rounded-2xl border border-white/10 p-2 shadow-2xl backdrop-blur-xl" style={{ background: `${design.background}ee` }} aria-label={`${design.name} navigation`}>
          <button type="button" onClick={() => setTab("wallet")} className="flex flex-col items-center gap-1 rounded-xl px-5 py-2 text-[11px] font-semibold" style={tab === "wallet" ? { color: design.accent } : { color: "rgba(255,255,255,.45)" }}><WalletCards className="h-4 w-4" />Wallet</button>
          <button type="button" onClick={() => setTab("discover")} className="flex flex-col items-center gap-1 rounded-xl px-5 py-2 text-[11px] font-semibold" style={tab === "discover" ? { color: design.accent } : { color: "rgba(255,255,255,.45)" }}><Grid2X2 className="h-4 w-4" />Discover</button>
          <button type="button" onClick={() => setTab("settings")} className="flex flex-col items-center gap-1 rounded-xl px-5 py-2 text-[11px] font-semibold" style={tab === "settings" ? { color: design.accent } : { color: "rgba(255,255,255,.45)" }}><Settings className="h-4 w-4" />Settings</button>
        </nav>

        {notice ? <div className="fixed left-1/2 top-5 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-white/85 shadow-xl">{notice}</div> : null}
      </div>
    </main>
  );
}
