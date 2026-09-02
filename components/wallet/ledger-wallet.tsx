"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Compass,
  CreditCard,
  Home,
  Eye,
  EyeOff,
  History as HistoryIcon,
  LineChart,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";

import { LedgerMarketChart } from "@/components/wallet/ledger-market-chart";
import { liveMarketSymbols, walletMarketSymbols } from "@/config/tokens";
import {
  defaultLedgerWalletSettings,
  ledgerCurrencies,
  normalizeLedgerWalletSettings,
  validateLedgerSettings,
  validateLedgerTokenAddress,
  type LedgerCurrencyCode,
  type LedgerCustomToken,
  type LedgerTokenNetwork,
  type LedgerWalletSettings,
} from "@/lib/ledger-wallet-settings";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import { useWalletRuntime } from "@/components/wallet/wallet-runtime";
import {
  tokensForWalletAccount,
  transactionsForAccount,
  walletActivityFromTransfer,
  walletLedgerEvent,
  type WalletAccount,
} from "@/lib/wallet-ledger";
import {
  applyLiveMarketSnapshot,
  emptyLiveMarketSnapshot,
  mergeCanonicalWalletCatalogue,
  type LiveMarketSnapshot,
} from "@/lib/wallet-market";

const LEDGER_TOKENS_KEY = "larpz_ledger_tokens";
const LEDGER_TRANSACTIONS_KEY = "larpz_ledger_transactions";
const LEDGER_FEATURES_KEY = "larpz_ledger_features";
const LEDGER_SETTINGS_KEY = "larpz_ledger_settings_v2";

const portfolioSymbols = walletMarketSymbols;

type CurrencyCode = LedgerCurrencyCode;
type LedgerView = "home" | "assets" | "history" | "market" | "swap" | "earn" | "card" | "search" | "settings" | "buy" | "perpetuals";
type BottomTab = "Home" | "Swap" | "Earn" | "Card";
type LedgerFeatures = {
  earnPositions: Record<string, number>;
  cardFrozen: boolean;
  cardLimit: number;
};

const defaultLedgerFeatures: LedgerFeatures = {
  earnPositions: {},
  cardFrozen: false,
  cardLimit: 500,
};

function tokenForSymbol(tokens: WalletToken[], symbol: string) {
  return tokens.find((token) => token.symbol === symbol);
}

function ledgerActivityStorageKey(accountId?: string) {
  return accountId ? `${LEDGER_TRANSACTIONS_KEY}:${accountId}` : LEDGER_TRANSACTIONS_KEY;
}

function formatAmount(amount: number, symbol: string) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: symbol === "BTC" ? 5 : 4,
  }).format(amount);
}

function formatMoney(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}

function SplitMoney({ amount, currency, className = "", testId }: { amount: number; currency: CurrencyCode; className?: string; testId?: string }) {
  const formatted = formatMoney(amount, currency);
  const fraction = formatted.match(/([.,]\d{2})$/)?.[1] ?? "";
  const whole = fraction ? formatted.slice(0, -fraction.length) : formatted;
  const shortAmount = Math.abs(amount) < 1;
  return <span data-testid={testId} className={`block max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${className}`}><span>{whole}</span>{fraction ? <span className={`ml-[0.02em] inline-block leading-none tracking-[-0.02em] ${shortAmount ? "-translate-y-[0.04em] text-[0.68em] text-white/80" : "-translate-y-[0.025em] text-[0.6em] text-white/70"}`}>{fraction}</span> : null}</span>;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function tokenIconColor(symbol: string) {
  const colors: Record<string, string> = {
    BTC: "#f7931a",
    ETH: "#8998e8",
    SOL: "#25d8b8",
    TRX: "#ef233c",
    BNB: "#f5b91c",
    USDC: "#4d9ce8",
    USDT: "#45c29b",
  };
  return colors[symbol] ?? "#8b7be7";
}

function networkBadge(symbol: string) {
  if (symbol === "BTC") return "Native SegWit";
  if (symbol === "ETH") return "Ethereum";
  if (symbol === "SOL") return "Solana";
  return symbol;
}

type TokenIconToken = Pick<WalletToken, "image" | "name" | "symbol">;

function TokenIcon({ token, small = false }: { token: TokenIconToken; small?: boolean }) {
  const { image, name, symbol } = token;
  const size = small ? "size-8" : "size-11";
  const textSize = small ? "text-[0.62rem]" : "text-sm";

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-black shadow-[0_0_18px_rgba(135,104,255,0.14)] ${size} ${textSize}`}
      style={{ background: symbol === "SOL" ? "#050607" : tokenIconColor(symbol) }}
    >
      {symbol === "SOL" ? (
        <span className="relative h-full w-full">
          <span className="absolute left-[14%] h-[0.28rem] w-[72%] -skew-x-[25deg] rounded-full bg-[#63f5c4]" style={{ top: "28%" }} />
          <span className="absolute left-[14%] h-[0.28rem] w-[72%] -skew-x-[25deg] rounded-full bg-[#a68cff]" style={{ top: "44%" }} />
          <span className="absolute left-[14%] h-[0.28rem] w-[72%] -skew-x-[25deg] rounded-full bg-[#5b86ff]" style={{ top: "60%" }} />
        </span>
      ) : symbol === "ETH" ? "◆" : symbol === "TRX" ? "△" : symbol === "BTC" ? "₿" : symbol.slice(0, 1)}
      {image ? (
        <Image
          src={image}
          alt={`${name} logo`}
          fill
          unoptimized
          sizes={small ? "32px" : "44px"}
          className="z-10 object-contain"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : null}
    </span>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-[clamp(2.75rem,12vw,3.25rem)] items-center justify-center rounded-full border border-white/8 bg-white/[0.08] text-white/85 transition hover:bg-white/[0.15] active:scale-95"
    >
      <Icon size={20} strokeWidth={1.9} />
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[clamp(5.5rem,23vw,6.5rem)] min-w-0 flex-col items-center justify-center gap-2 rounded-xl bg-[#171717] px-1.5 py-2 text-[clamp(0.72rem,3.3vw,1rem)] font-semibold text-white transition hover:bg-[#242424] active:scale-[0.98]"
    >
      <Icon size={23} strokeWidth={1.7} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function MarketCard({ symbol, change, mood = false, viewAll = false, onClick }: { symbol: string; change: string; mood?: boolean; viewAll?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-[clamp(6rem,25vw,6.5rem)] min-w-[clamp(6rem,25vw,6.5rem)] snap-start flex-col items-center justify-center rounded-2xl bg-[#171717] px-3 text-center transition hover:bg-[#242424] active:scale-[0.98]">
      {viewAll ? (
        <>
          <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-[#383838] text-white/70"><ChevronRight size={18} /></span>
          <span className="text-sm font-bold">View All</span>
        </>
      ) : mood ? (
        <>
          <span className="mb-2 text-[1.55rem] leading-none tracking-[-0.22em] text-[#f08088]">⌒⌒</span>
          <span className="text-base font-bold">49</span>
          <span className="mt-1 text-sm font-semibold">Mood</span>
          <span className="text-xs text-white/55">Neutral</span>
        </>
      ) : (
        <>
          <span className="text-base font-bold">{symbol}</span>
          <span className={`mt-2 text-sm font-bold ${change.startsWith("+") ? "text-[#66ce78]" : "text-[#d87888]"}`}>
            {change}
          </span>
        </>
      )}
    </button>
  );
}

function AssetRow({
  token,
  currency,
  rate,
  onClick,
}: {
  token: WalletToken;
  currency: CurrencyCode;
  rate: number;
  onClick: () => void;
}) {
  const value = token.balance * token.price * rate;
  const positive = token.change24h >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-white/[0.05]"
    >
      <TokenIcon token={token} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[clamp(0.98rem,4.1vw,1.22rem)] font-bold">{token.name}</span>
        <span className="block truncate text-[clamp(0.8rem,3.3vw,0.98rem)] text-white/55">
          {formatAmount(token.balance, token.symbol)} {token.symbol}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[clamp(0.95rem,4vw,1.18rem)] font-bold">{formatMoney(value, currency)}</span>
        <span className={`block text-[clamp(0.76rem,3.2vw,0.92rem)] font-semibold ${positive ? "text-[#65c873]" : "text-[#d87888]"}`}>
          {positive ? "↗" : "↘"} {token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%
        </span>
      </span>
    </button>
  );
}

function MarketAssetRow({ token, currency, rate, onClick }: { token: WalletToken; currency: CurrencyCode; rate: number; onClick: () => void }) {
  const positive = token.change24h >= 0;
  return <button type="button" onClick={onClick} className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-white/[0.05]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block truncate text-lg">{token.name}</strong><span className="block truncate text-sm text-white/45">{token.symbol}</span></span><span className="shrink-0 text-right"><strong className="block">{formatMoney(token.price * rate, currency)}</strong><span className={`block text-sm font-semibold ${positive ? "text-[#65c873]" : "text-[#d87888]"}`}>{positive ? "+" : ""}{token.change24h.toFixed(2)}%</span></span></button>;
}

function HistoryRow({ record, currency, rate, tokens }: { record: WalletActivity; currency: CurrencyCode; rate: number; tokens: WalletToken[] }) {
  const token = tokenForSymbol(tokens, record.tokenSymbol);
  const value = record.amount * (token?.price ?? 0) * rate;
  const received = record.type === "receive";

  return (
    <div className="flex items-center gap-3 px-1 py-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white">
        {received ? <ArrowDown size={22} /> : <ArrowUp size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{record.tokenSymbol} Main</span>
        <span className="block truncate text-sm text-white/55">
          {received ? "Received" : "Sent"} {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(record.date))}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-base font-bold ${received ? "text-[#73d27f]" : "text-white"}`}>
          {received ? "+" : "-"}{formatAmount(record.amount, record.tokenSymbol)} {record.tokenSymbol}
        </span>
        <span className="block text-sm text-white/55">{formatMoney(value, currency)}</span>
      </span>
    </div>
  );
}

function BottomNav({ active, onChange }: { active: BottomTab; onChange: (tab: BottomTab) => void }) {
  const tabs: { label: BottomTab; icon: LucideIcon }[] = [
    { label: "Home", icon: Home },
    { label: "Swap", icon: Repeat2 },
    { label: "Earn", icon: LineChart },
    { label: "Card", icon: CreditCard },
  ];

  return (
    <nav aria-label="Larpz Wallet navigation" data-testid="ledger-bottom-nav" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[534px] rounded-full border border-white/10 bg-[#242424]/95 p-1.5 shadow-2xl backdrop-blur-xl">
      {tabs.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(label)}
          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-full py-2 text-xs font-semibold transition ${active === label ? "bg-[#3a3a3a] text-white" : "text-white/70 hover:text-white"}`}
        >
          <Icon size={21} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function HomeScreen({
  tokens,
  records,
  currency,
  rate,
  total,
  actionPreference,
  refreshing,
  pullDistance,
  onSettings,
  onSearch,
  onRefresh,
  onReceive,
  onSend,
  onBuy,
  onExplore,
  onSwap,
  onAssets,
  onHistory,
  onAccounts,
  onPerpetuals,
  onToken,
}: {
  tokens: WalletToken[];
  records: WalletActivity[];
  currency: CurrencyCode;
  rate: number;
  total: number;
  actionPreference: LedgerWalletSettings["actionPreference"];
  refreshing: boolean;
  pullDistance: number;
  onSettings: () => void;
  onSearch: () => void;
  onRefresh: () => void;
  onReceive: () => void;
  onSend: () => void;
  onBuy: () => void;
  onExplore: () => void;
  onSwap: () => void;
  onAssets: () => void;
  onHistory: () => void;
  onAccounts: () => void;
  onPerpetuals: () => void;
  onToken: (token: WalletToken) => void;
}) {
  const visibleTokens = useMemo(() => {
    return [...tokens]
      .filter((token) => token.balance > 0)
      .sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [tokens]);

  const baseTotal = tokens.reduce((sum, token) => sum + token.balance * token.price, 0);
  const change = baseTotal === 0 ? 0 : tokens.reduce((sum, token) => sum + token.change24h * token.balance * token.price, 0) / baseTotal;
  const firstAction = actionPreference === "send-first"
    ? { icon: ArrowUp, label: "Send", onClick: onSend }
    : { icon: ArrowDown, label: "Receive", onClick: onReceive };
  const lastAction = actionPreference === "send-first"
    ? { icon: ArrowDown, label: "Receive", onClick: onReceive }
    : { icon: ArrowUp, label: "Send", onClick: onSend };
  const perpetualTokens = ["BTC", "ETH", "SOL"].map((symbol) => tokenForSymbol(tokens, symbol)).filter(Boolean) as WalletToken[];

  return (
    <main data-testid="ledger-home" className="relative space-y-8 overflow-x-clip px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7">
      <div className="pointer-events-none absolute inset-x-[-34%] top-0 h-[34rem] opacity-80" style={{ backgroundImage: "radial-gradient(circle at 78% 18%, rgba(211, 75, 174, .28), transparent 34%), radial-gradient(circle at 34% 35%, rgba(107, 72, 176, .23), transparent 48%), radial-gradient(circle, rgba(238, 154, 211, .26) 1px, transparent 1.35px)", backgroundSize: "auto, auto, 8px 8px", maskImage: "linear-gradient(to bottom, black 0%, transparent 90%)" }} />

      <div className="relative flex h-8 items-center justify-center" style={{ transform: `translateY(${Math.min(38, pullDistance / 2)}px)`, opacity: refreshing || pullDistance > 12 ? 1 : 0 }} aria-hidden={!refreshing && pullDistance <= 12}>
        <span role="status" className="flex items-center gap-2 text-sm text-white/55"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing portfolio…" : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}</span>
      </div>

      <section className="relative">
        <div className="flex items-center justify-between gap-3">
          <IconButton icon={UserRound} label="Open Larpz Wallet settings" onClick={onSettings} />
          <div className="flex gap-2">
            <IconButton icon={Compass} label="Discover markets" onClick={onExplore} />
            <IconButton icon={Search} label="Search Larpz Wallet" onClick={onSearch} />
            <IconButton icon={Clock3} label="Open transaction history" onClick={onHistory} />
          </div>
        </div>

        <div className="px-1 pb-1 pt-12 text-center">
          <button type="button" onClick={onRefresh} aria-label="Refresh portfolio" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#a995f2]/20 bg-[#a995f2]/10 px-4 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[#c9bbff]">
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Larpz Wallet · Demo only
          </button>
          <div className="mx-auto flex max-w-full items-end justify-center overflow-hidden px-1">
            <SplitMoney testId="ledger-portfolio-balance" amount={total} currency={currency} className="text-[clamp(2.35rem,12vw,4.35rem)] font-bold leading-none tracking-[-0.075em]" />
          </div>
          <button type="button" onClick={onAssets} className="mt-6 min-h-11 rounded-full bg-[#414043]/85 px-5 py-2 text-sm font-bold text-white/85 transition hover:bg-[#535155]">
            <span className={change >= 0 ? "text-[#70d284]" : "text-[#e78591]"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span> <span className="mx-1 text-white/45">·</span> Today <ChevronRight className="ml-1 inline-block" size={17} />
          </button>
        </div>
      </section>

      <section className="relative grid grid-cols-4 gap-2.5" aria-label="Wallet actions">
        <ActionButton {...firstAction} />
        <ActionButton icon={Repeat2} label="Swap" onClick={onSwap} />
        <ActionButton icon={Plus} label="Buy" onClick={onBuy} />
        <ActionButton {...lastAction} />
      </section>

      <section className="relative">
        <div className="mb-3 flex items-center justify-between gap-4">
          <button type="button" onClick={onExplore} className="flex min-h-11 items-center gap-1 text-left text-[clamp(1.3rem,5vw,1.65rem)] font-bold">Market <ChevronRight size={22} /></button>
          <button type="button" onClick={onExplore} className="min-h-11 text-sm font-semibold text-white/55">Trending⌄</button>
        </div>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MarketCard symbol="Mood" change="Neutral" mood onClick={onExplore} />
          {[...tokens].sort((a, b) => b.change24h - a.change24h).slice(0, 4).map((token) => (
            <MarketCard key={token.symbol} symbol={token.symbol} change={`${token.change24h >= 0 ? "+" : ""}${token.change24h.toFixed(2)}%`} onClick={() => onToken(token)} />
          ))}
          <MarketCard symbol="View All" change="" viewAll onClick={onExplore} />
        </div>
      </section>

      <section>
        <h2 className="text-[clamp(1.3rem,5vw,1.65rem)] font-bold">Perpetuals</h2>
        <button type="button" onClick={onPerpetuals} className="mt-3 flex min-h-[4.6rem] w-full items-center gap-4 rounded-2xl bg-[#171717] px-4 text-left transition hover:bg-[#242424]">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#242326]"><span className="text-2xl">∞</span></span>
          <span className="min-w-0 flex-1"><strong className="block">Explore perpetual markets</strong><span className="mt-1 block truncate text-sm text-white/50">Market data only · no real positions</span></span>
          <ChevronRight className="shrink-0 text-white/65" />
        </button>
        <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {perpetualTokens.map((token, index) => <button key={token.symbol} type="button" onClick={() => onToken(token)} className="min-w-[8.5rem] snap-start rounded-2xl bg-[#171717] p-4 text-left"><TokenIcon token={token} small /><p className="mt-4 font-bold">{token.symbol} <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs text-white/65">{[40, 25, 15][index]}x</span></p><p className={`mt-2 text-sm font-bold ${token.change24h >= 0 ? "text-[#65c873]" : "text-[#d87888]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</p></button>)}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onAssets} className="flex min-h-11 items-center gap-1 text-[clamp(1.3rem,5vw,1.65rem)] font-bold">Crypto <ChevronRight size={22} /></button>
          <button type="button" onClick={onAccounts} className="min-h-11 text-sm font-semibold text-[#b8a5ff]">Accounts</button>
        </div>
        <div className="mt-2 space-y-1">
          {visibleTokens.length > 0 ? visibleTokens.map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />) : <p className="rounded-2xl bg-[#171717] px-4 py-8 text-center text-sm text-white/50">No assets in this account yet.</p>}
        </div>
      </section>

      <section>
        <button type="button" onClick={onHistory} className="mb-2 flex min-h-11 items-center gap-2 text-left text-sm font-bold tracking-wide text-white/55"><HistoryIcon className="size-4" /> TRANSACTION HISTORY</button>
        {records.length > 0 ? (
          <div className="divide-y divide-white/8 rounded-2xl bg-[#171717] px-3">{records.slice(0, 3).map((record) => <HistoryRow key={record.id} record={record} currency={currency} rate={rate} tokens={tokens} />)}</div>
        ) : <p className="rounded-2xl bg-[#171717] px-4 py-8 text-center text-sm text-white/50">No transactions yet.</p>}
      </section>
    </main>
  );
}

function ScreenHeader({ eyebrow, title, onHome }: { eyebrow: string; title: string; onHome: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onHome} aria-label="Back to Larpz Wallet home" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.14]">
        <ArrowLeft size={21} />
      </button>
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-[0.18em] text-white/45">{eyebrow}</p>
        <h1 className="mt-1 truncate text-3xl font-bold">{title}</h1>
      </div>
    </div>
  );
}

function MarketScreen({ tokens, currency, rate, showAdvanced, onToken, onHome }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; showAdvanced: boolean; onToken: (token: WalletToken) => void; onHome: () => void }) {
  const movers = [...tokens].sort((a, b) => b.change24h - a.change24h || b.price - a.price);

  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="MARKETS" title="Explore" onHome={onHome} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-[#583b8d] to-[#21192f] p-4">
          <Compass className="text-[#c7b7ff]" size={24} />
          <p className="mt-8 text-sm font-bold text-white/60">Top mover</p>
          <p className="mt-1 text-2xl font-bold">{movers[0]?.symbol ?? "—"}</p>
          <p className="mt-1 text-sm font-bold text-[#73d27f]">{movers[0] ? `${movers[0].change24h >= 0 ? "+" : ""}${movers[0].change24h.toFixed(2)}%` : "—"}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[#432431] to-[#21191e] p-4">
          <LineChart className="text-[#f0a7ca]" size={24} />
          <p className="mt-8 text-sm font-bold text-white/60">Assets tracked</p>
          <p className="mt-1 text-2xl font-bold">{tokens.length}</p>
          <p className="mt-1 text-sm text-white/50">Live prices</p>
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-bold">Market assets</h2>
        <div className="space-y-1 rounded-2xl bg-white/[0.025] p-3">
          {movers.map((token) => <div key={token.id}><MarketAssetRow token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />{showAdvanced ? <div className="mb-2 ml-14 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white/35"><span>Market cap {token.marketCap ? formatMoney(token.marketCap * rate, currency) : "Unavailable"}</span><span>24h volume {token.volume24h ? formatMoney(token.volume24h * rate, currency) : "Unavailable"}</span></div> : null}</div>)}
        </div>
      </section>
    </main>
  );
}

function SearchScreen({ tokens, records, currency, rate, onToken, onHistory, onHome }: { tokens: WalletToken[]; records: WalletActivity[]; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHistory: () => void; onHome: () => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const matchingTokens = tokens.filter((token) => !normalized || `${token.name} ${token.symbol}`.toLowerCase().includes(normalized));
  const matchingRecords = records.filter((record) => normalized && `${record.tokenSymbol} ${record.counterpartyLabel} ${record.note}`.toLowerCase().includes(normalized));

  return (
    <main className="space-y-6 px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="LARPZ WALLET" title="Search" onHome={onHome} />
      <label className="flex min-h-14 items-center gap-3 rounded-full border border-white/10 bg-[#1d1d1f] px-4 focus-within:border-[#a995f2]">
        <Search className="size-5 shrink-0 text-white/45" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search assets and activity" placeholder="Search assets and activity" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/35" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-11 shrink-0 place-items-center rounded-full"><X className="size-5" /></button> : null}
      </label>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white/45">Assets</h2>
        <div className="mt-3 space-y-1 rounded-2xl bg-[#171717] p-3">
          {matchingTokens.length ? matchingTokens.slice(0, 12).map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />) : <p className="px-4 py-8 text-center text-sm text-white/45">No assets match “{query}”.</p>}
        </div>
      </section>

      {normalized ? (
        <section>
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white/45">Activity</h2><button type="button" onClick={onHistory} className="min-h-11 text-sm font-semibold text-[#b8a5ff]">See all</button></div>
          <div className="mt-2 divide-y divide-white/8 rounded-2xl bg-[#171717] px-3">
            {matchingRecords.length ? matchingRecords.slice(0, 5).map((record) => <HistoryRow key={record.id} record={record} currency={currency} rate={rate} tokens={tokens} />) : <p className="px-4 py-8 text-center text-sm text-white/45">No matching activity.</p>}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function BuyScreen({ tokens, preferredSymbol, currency, rate, onHome, onBuy }: { tokens: WalletToken[]; preferredSymbol?: string; currency: CurrencyCode; rate: number; onHome: () => void; onBuy: (symbol: string, amount: number) => Promise<boolean> }) {
  const available = tokens.filter((token) => token.price > 0);
  const initial = tokenForSymbol(available, preferredSymbol ?? "") ?? tokenForSymbol(available, "BTC") ?? available[0];
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [fiatAmount, setFiatAmount] = useState("");
  const token = tokenForSymbol(available, symbol) ?? initial;
  const numericAmount = Number(fiatAmount);
  const output = token && Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount / rate / token.price : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token && output > 0 && await onBuy(token.symbol, output)) setFiatAmount("");
  }

  return (
    <main className="space-y-6 px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="INTERNAL DEMO" title="Buy" onHome={onHome} />
      <div className="flex items-start gap-3 rounded-2xl border border-[#a995f2]/20 bg-[#a995f2]/10 p-4 text-sm leading-6 text-[#d6ccff]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <p>No payment is processed and no real crypto is purchased. This action only updates the selected Larpz Wallet account.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <section className="rounded-3xl bg-[#171717] p-5">
          <label className="block text-sm font-semibold text-white/55" htmlFor="ledger-buy-asset">Asset</label>
          <select id="ledger-buy-asset" value={token?.symbol ?? ""} onChange={(event) => setSymbol(event.target.value)} className="mt-3 min-h-14 w-full rounded-2xl border border-white/10 bg-[#292929] px-4 text-base font-bold outline-none focus:border-[#a995f2]">
            {available.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>)}
          </select>
          <label className="mt-5 block text-sm font-semibold text-white/55" htmlFor="ledger-buy-amount">Demo amount ({currency})</label>
          <div className="mt-3 flex min-h-16 items-center rounded-2xl border border-white/10 bg-[#292929] px-4 focus-within:border-[#a995f2]">
            <CircleDollarSign className="size-6 text-white/45" />
            <input id="ledger-buy-amount" value={fiatAmount} onChange={(event) => setFiatAmount(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-3 text-3xl font-bold outline-none placeholder:text-white/20" />
          </div>
          <div className="mt-4 flex justify-between gap-4 text-sm text-white/50"><span>You receive</span><span className="max-w-[70%] truncate text-right font-semibold text-white">{output > 0 && token ? `${formatAmount(output, token.symbol)} ${token.symbol}` : "—"}</span></div>
        </section>
        <button type="submit" disabled={!token || output <= 0} className="min-h-14 w-full rounded-full bg-[#b8a5ff] px-5 text-base font-bold text-[#15101e] disabled:opacity-35">Add to demo balance</button>
      </form>
    </main>
  );
}

function PerpetualsScreen({ tokens, onToken, onHome }: { tokens: WalletToken[]; onToken: (token: WalletToken) => void; onHome: () => void }) {
  const markets = tokens.filter((token) => ["BTC", "ETH", "SOL", "HYPE", "SUI"].includes(token.symbol));
  return (
    <main className="space-y-6 px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="MARKET DATA" title="Perpetuals" onHome={onHome} />
      <div className="rounded-3xl bg-[linear-gradient(145deg,#2b203b,#161318)] p-6">
        <TrendingUp className="size-8 text-[#b8a5ff]" />
        <h2 className="mt-6 text-2xl font-bold">Follow leveraged markets</h2>
        <p className="mt-2 leading-6 text-white/55">Price monitoring is available in this internal demo. No leveraged order or real-money position is opened.</p>
      </div>
      <section className="space-y-2">
        {markets.map((token, index) => <button key={token.symbol} type="button" onClick={() => onToken(token)} className="flex min-h-[5.25rem] w-full items-center gap-4 rounded-2xl bg-[#171717] px-4 text-left"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block text-lg">{token.name}</strong><span className="text-sm text-white/50">Up to {[40, 25, 15, 10, 8][index] ?? 5}x market view</span></span><span className={`shrink-0 font-bold ${token.change24h >= 0 ? "text-[#65c873]" : "text-[#d87888]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></button>)}
      </section>
    </main>
  );
}

function SettingsScreen({ settings, onSave, onSecurity, onAccounts, onHome }: { settings: LedgerWalletSettings; onSave: (settings: LedgerWalletSettings) => void; onSecurity: () => void; onAccounts: () => void; onHome: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [addingNetwork, setAddingNetwork] = useState<LedgerTokenNetwork | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [tokenPrice, setTokenPrice] = useState("0");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function addCustomToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addingNetwork) return;
    const addressError = validateLedgerTokenAddress(addingNetwork, contractAddress);
    const symbol = tokenSymbol.trim().toUpperCase();
    const price = Number(tokenPrice);
    if (addressError) return setError(addressError);
    if (!tokenName.trim()) return setError("Enter the token name.");
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return setError("Use a 2–10 character token symbol.");
    if (portfolioSymbols.includes(symbol)) return setError(`${symbol} is already included in the built-in asset catalogue.`);
    if (!Number.isFinite(price) || price < 0) return setError("Enter a valid non-negative display price.");
    if (draft.customTokens.some((token) => token.symbol === symbol || `${token.network}:${token.contractAddress.toLowerCase()}` === `${addingNetwork}:${contractAddress.trim().toLowerCase()}`)) return setError("That custom token is already configured.");
    const token: LedgerCustomToken = { id: createId("ledger-custom"), network: addingNetwork, contractAddress: contractAddress.trim(), name: tokenName.trim(), symbol, price };
    setDraft((current) => ({ ...current, customTokens: [...current.customTokens, token] }));
    setAddingNetwork(null);
    setTokenName("");
    setTokenSymbol("");
    setContractAddress("");
    setTokenPrice("0");
    setError("");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateLedgerSettings(draft);
    if (validationError) {
      setError(validationError);
      setSaved(false);
      return;
    }
    onSave({ ...draft, marketApiKey: draft.marketApiKey.trim() });
    setError("");
    setSaved(true);
  }

  return (
    <main className="px-4 pb-36 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="LARPZ WALLET" title="Settings" onHome={onHome} />
      <form onSubmit={save} className="mt-7 space-y-6">
        <section className="space-y-4 rounded-3xl bg-[#171322] p-5">
          <h2 className="text-lg font-bold">Preferences</h2>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-white/55">Currency</span><select value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value as CurrencyCode }))} className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#292436] px-4 text-base outline-none focus:border-[#a995f2]">{ledgerCurrencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold text-white/55">Optional market API key</span><input type="password" value={draft.marketApiKey} onChange={(event) => { setDraft((current) => ({ ...current, marketApiKey: event.target.value.slice(0, 180) })); setError(""); }} autoComplete="off" aria-label="Optional market API key" placeholder="Saved only on this device" className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#292436] px-4 text-base outline-none focus:border-[#a995f2]" /><span className="mt-2 block text-xs leading-5 text-white/40">Stored on this device and sent only to the protected market proxy when live prices or charts are requested.</span></label>
          <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-[#292436] px-4"><span><strong className="block">Pro market details</strong><span className="mt-1 block text-xs text-white/45">Show expanded market metrics when available</span></span><input type="checkbox" checked={draft.proKeyEnabled} onChange={(event) => setDraft((current) => ({ ...current, proKeyEnabled: event.target.checked }))} className="size-5 accent-[#b8a5ff]" /></label>
        </section>

        <section className="rounded-3xl bg-[#171322] p-5">
          <h2 className="text-lg font-bold">Send and receive</h2>
          <div className="mt-4 grid grid-cols-2 rounded-2xl bg-[#292436] p-1" role="radiogroup" aria-label="Quick action order">
            {(["receive-first", "send-first"] as const).map((preference) => <button key={preference} type="button" role="radio" aria-checked={draft.actionPreference === preference} onClick={() => setDraft((current) => ({ ...current, actionPreference: preference }))} className={`min-h-11 rounded-xl px-2 text-sm font-semibold ${draft.actionPreference === preference ? "bg-[#b8a5ff] text-black" : "text-white/55"}`}>{preference === "receive-first" ? "Receive first" : "Send first"}</button>)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={onAccounts} className="min-h-12 rounded-2xl border border-white/10 text-sm font-semibold">Manage accounts</button><button type="button" onClick={onSecurity} className="min-h-12 rounded-2xl border border-white/10 text-sm font-semibold">Security</button></div>
        </section>

        {(["solana", "ethereum"] as const).map((network) => {
          const customTokens = draft.customTokens.filter((token) => token.network === network);
          return <section key={network} className="rounded-3xl bg-[#171322] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Custom tokens ({network})</p>{customTokens.length ? <div className="mt-3 space-y-2">{customTokens.map((token) => <div key={token.id} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[#292436] px-3"><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{token.name} ({token.symbol})</strong><span className="block truncate text-xs text-white/40">{token.contractAddress}</span></span><button type="button" onClick={() => setDraft((current) => ({ ...current, customTokens: current.customTokens.filter((item) => item.id !== token.id) }))} aria-label={`Remove ${token.name}`} className="grid size-11 shrink-0 place-items-center rounded-full text-red-300"><X className="size-4" /></button></div>)}</div> : null}<button type="button" onClick={() => { setAddingNetwork(network); setError(""); setSaved(false); }} className="mt-3 min-h-12 w-full rounded-2xl border border-dashed border-white/20 px-3 text-sm font-semibold text-white/65">+ Add {network === "solana" ? "SOL" : "ETH"} token by contract address</button></section>;
        })}

        <section className="rounded-3xl bg-[#171322] p-5">
          <h2 className="text-lg font-bold">Appearance</h2>
          <div className="mt-4 grid grid-cols-2 rounded-2xl bg-[#292436] p-1" role="radiogroup" aria-label="Theme">
            {(["dark", "light"] as const).map((scheme) => <button key={scheme} type="button" role="radio" aria-checked={draft.colorScheme === scheme} onClick={() => setDraft((current) => ({ ...current, colorScheme: scheme }))} className={`min-h-11 rounded-xl font-semibold capitalize ${draft.colorScheme === scheme ? "bg-[#b8a5ff] text-black" : "text-white/55"}`}>{scheme}</button>)}
          </div>
          <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold text-white/55">Language</span><select value="en" disabled aria-label="Language" className="min-h-14 w-full rounded-2xl border border-white/10 bg-[#292436] px-4 text-base disabled:opacity-100"><option value="en">EN — English</option></select></label>
        </section>

        {error ? <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
        {saved ? <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Settings saved on this device.</p> : null}
        <button type="submit" className="min-h-14 w-full rounded-full bg-[#b8a5ff] px-5 text-base font-bold text-[#15101e]">Save settings</button>
      </form>

      {addingNetwork ? <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation"><button type="button" aria-label="Close custom token form" className="absolute inset-0" onClick={() => setAddingNetwork(null)} /><form onSubmit={addCustomToken} className="relative max-h-[92dvh] w-full max-w-[500px] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-[#171322] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-[2rem]" aria-label={`Add ${addingNetwork} token`}><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b8a5ff]">{addingNetwork}</p><h2 className="mt-1 text-2xl font-bold">Add custom token</h2></div><button type="button" onClick={() => setAddingNetwork(null)} aria-label="Close" className="grid size-11 place-items-center rounded-full bg-white/[0.08]"><X className="size-5" /></button></div><div className="mt-6 space-y-3"><input required value={tokenName} onChange={(event) => setTokenName(event.target.value)} aria-label="Custom token name" placeholder="Token name" className="min-h-14 w-full rounded-2xl bg-[#292436] px-4 text-base outline-none focus:ring-2 focus:ring-[#a995f2]" /><input required value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value.toUpperCase())} aria-label="Custom token symbol" placeholder="Symbol" maxLength={10} className="min-h-14 w-full rounded-2xl bg-[#292436] px-4 text-base uppercase outline-none focus:ring-2 focus:ring-[#a995f2]" /><input required value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} aria-label="Custom token contract address" placeholder={addingNetwork === "ethereum" ? "0x… contract address" : "Solana base58 token address"} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-h-14 w-full rounded-2xl bg-[#292436] px-4 font-mono text-base outline-none focus:ring-2 focus:ring-[#a995f2]" /><input value={tokenPrice} onChange={(event) => setTokenPrice(event.target.value)} aria-label="Custom token display price" type="number" min="0" step="any" inputMode="decimal" placeholder="Display price (USD)" className="min-h-14 w-full rounded-2xl bg-[#292436] px-4 text-base outline-none focus:ring-2 focus:ring-[#a995f2]" /></div>{error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="submit" className="mt-6 min-h-14 w-full rounded-full bg-[#b8a5ff] px-5 font-bold text-black">Add to settings</button></form></div> : null}
    </main>
  );
}

function AssetDetailScreen({ token, tokens, accounts, currentAccountId, currency, rate, marketApiKey, onSelectToken, onBack, onTransfer, onReceive, onSwap, onBuy, onAccounts, onSettings }: { token: WalletToken; tokens: WalletToken[]; accounts: WalletAccount[]; currentAccountId?: string; currency: CurrencyCode; rate: number; marketApiKey: string; onSelectToken: (symbol: string) => void; onBack: () => void; onTransfer: () => void; onReceive: () => void; onSwap: () => void; onBuy: () => void; onAccounts: () => void; onSettings: () => void }) {
  const [period, setPeriod] = useState("1D");
  const [moreOpen, setMoreOpen] = useState(false);
  const value = token.balance * token.price * rate;
  const fiatChange = token.price * token.change24h / 100 * rate;
  const positive = token.change24h >= 0;

  return (
    <main className="min-h-[100dvh] pb-32 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="sticky top-0 z-20 grid grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] items-center gap-3 bg-black/90 px-4 py-3 backdrop-blur-xl sm:px-7">
        <button type="button" onClick={onBack} aria-label="Back to Larpz Wallet home" className="grid size-11 place-items-center rounded-full bg-white/[0.08]"><ArrowLeft className="size-5" /></button>
        <label className="relative mx-auto flex min-h-12 max-w-[11rem] items-center gap-2 overflow-hidden rounded-full bg-[#242326] px-4 font-bold"><TokenIcon token={token} small /><span className="truncate">{token.symbol}</span><select value={token.symbol} onChange={(event) => onSelectToken(event.target.value)} aria-label="Select asset" className="absolute inset-0 cursor-pointer text-base opacity-0">{tokens.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>)}</select></label>
        <div className="relative"><button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label="More asset options" aria-expanded={moreOpen} className="grid size-11 place-items-center rounded-full bg-white/[0.08]"><MoreHorizontal className="size-5" /></button>{moreOpen ? <div className="absolute right-0 top-13 z-30 min-w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#242326] p-1.5 shadow-2xl"><button type="button" onClick={onReceive} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/[0.06]"><QrCode className="size-4 text-[#b8a5ff]" /> Receive {token.symbol}</button><button type="button" onClick={onAccounts} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/[0.06]"><Wallet className="size-4 text-[#b8a5ff]" /> Accounts</button><button type="button" onClick={onSettings} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-white/[0.06]"><Settings className="size-4 text-[#b8a5ff]" /> Settings</button></div> : null}</div>
      </header>

      <section className="px-4 pt-8 sm:px-7">
        <p className="text-lg text-white/50">Market price</p>
        <SplitMoney amount={token.price * rate} currency={currency} className="mt-2 text-[clamp(2.6rem,13vw,4.4rem)] font-bold leading-none tracking-[-0.065em]" />
        <p className="mt-4 text-lg"><span className={positive ? "text-[#67ce7b]" : "text-[#e77f8c]"}>{positive ? "▲" : "▼"} {Math.abs(token.change24h).toFixed(2)}%</span><span className="ml-3 text-white/50">{fiatChange >= 0 ? "+" : ""}{formatMoney(fiatChange, currency)} · 24 hours</span></p>
      </section>

      <section className="mt-7">
        <LedgerMarketChart symbol={token.symbol} period={period} livePrice={token.price} currency={currency} rate={rate} marketApiKey={marketApiKey} />
        <div className="mx-4 mt-3 grid grid-cols-5 rounded-xl bg-[#211f22] p-1 sm:mx-7" role="tablist" aria-label="Chart period">{["1D", "1W", "1M", "1Y", "ALL"].map((timeframe) => <button key={timeframe} type="button" role="tab" aria-selected={period === timeframe} onClick={() => setPeriod(timeframe)} className={`min-h-11 rounded-lg text-sm font-semibold ${period === timeframe ? "bg-[#444246] text-white" : "text-white/50"}`}>{timeframe}</button>)}</div>
      </section>

      <section className="mt-10 flex items-end justify-between gap-4 px-4 sm:px-7">
        <div className="min-w-0"><p className="text-sm text-white/50">Total balance</p><SplitMoney amount={value} currency={currency} className="mt-2 text-[clamp(1.8rem,8vw,2.7rem)] font-bold tracking-[-0.04em]" /><p className="mt-1 truncate text-base text-white/50">{formatAmount(token.balance, token.symbol)} {token.symbol}</p></div>
        <button type="button" onClick={onTransfer} className="flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#242326] px-5 font-semibold"><ArrowDownUp className="size-5" /> Transfer</button>
      </section>

      <section className="mt-11 px-4 sm:px-7">
        <div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold">Accounts</h2><button type="button" onClick={onAccounts} aria-label="Add account" className="flex min-h-11 items-center gap-2 font-bold text-[#cf8cff]"><Plus className="size-5 rounded-full bg-[#cf8cff] p-0.5 text-black" /> Add</button></div>
        <div className="mt-4 space-y-2">{accounts.map((account) => { const accountBalance = account.balances[token.symbol] ?? 0; return <button key={account.id} type="button" onClick={onAccounts} className={`flex min-h-[6rem] w-full items-center gap-3 rounded-2xl border px-4 text-left ${account.id === currentAccountId ? "border-[#a995f2]/35 bg-[#1c1921]" : "border-white/5 bg-[#171717]"}`}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#29272b]"><UserRound className="size-5" /></span><span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><strong className="truncate">{account.name}</strong><small className="shrink-0 rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.06em] text-white/55">{networkBadge(token.symbol)}</small></span><span className="mt-1 block truncate font-mono text-xs text-white/45">{account.address}</span></span><span className="max-w-[42%] shrink-0 text-right"><strong className="block truncate">{formatMoney(accountBalance * token.price * rate, currency)}</strong><span className="mt-1 block truncate text-sm text-white/45">{formatAmount(accountBalance, token.symbol)} {token.symbol}</span></span></button>; })}</div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[560px] gap-3 border-t border-white/[0.06] bg-black/90 px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-7"><button type="button" onClick={onBuy} className="min-h-14 flex-1 rounded-full bg-[#242326] font-bold">Buy</button><button type="button" onClick={onSwap} className="min-h-14 flex-[1.2] rounded-full bg-white font-bold text-black">Swap</button><button type="button" onClick={() => setMoreOpen((open) => !open)} aria-label="More asset actions" className="grid min-h-14 min-w-14 place-items-center rounded-full bg-[#242326]"><MoreHorizontal /></button></div>
    </main>
  );
}

function SwapScreen({ tokens, currency, rate, initialFrom, onHome, onSwap }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; initialFrom?: string; onHome: () => void; onSwap: (from: string, to: string, amount: number) => Promise<boolean> }) {
  const tradable = tokens.filter((token) => token.price > 0);
  const defaultFrom = tokenForSymbol(tradable, initialFrom ?? "") ?? tokenForSymbol(tradable, "BTC") ?? tradable[0];
  const defaultTo = tokenForSymbol(tradable, defaultFrom?.symbol === "SOL" ? "ETH" : "SOL") ?? tradable.find((token) => token.symbol !== defaultFrom?.symbol) ?? defaultFrom;
  const [from, setFrom] = useState(defaultFrom?.symbol ?? "");
  const [to, setTo] = useState(defaultTo?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const fromToken = tokenForSymbol(tradable, from) ?? defaultFrom;
  const toToken = tokenForSymbol(tradable, to) ?? defaultTo;
  const numericAmount = Number(amount);
  const output = fromToken && toToken && Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * fromToken.price / toToken.price * 0.997
    : 0;
  const canSwap = Boolean(fromToken && toToken && fromToken.symbol !== toToken.symbol && numericAmount > 0 && numericAmount <= fromToken.balance);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromToken || !toToken || !canSwap) return;
    if (await onSwap(fromToken.symbol, toToken.symbol, numericAmount)) setAmount("");
  }

  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="EXCHANGE" title="Swap" onHome={onHome} />
      <form onSubmit={submit} className="space-y-3">
        <section className="rounded-3xl border border-white/8 bg-[#171717] p-5">
          <div className="flex items-center justify-between text-sm font-semibold text-white/55"><span>You pay</span><button type="button" onClick={() => setAmount(String(fromToken?.balance ?? 0))} className="text-[#b8a5ff]">Max</button></div>
          <div className="mt-4 flex items-center gap-3">
            <input aria-label="Swap amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="min-w-0 flex-1 bg-transparent text-4xl font-bold outline-none placeholder:text-white/20" />
            <select aria-label="Token to pay" value={fromToken?.symbol ?? ""} onChange={(event) => setFrom(event.target.value)} className="max-w-[8.5rem] rounded-full bg-[#2a2a2a] px-4 py-3 text-base font-bold outline-none">
              {tradable.map((token) => <option key={token.symbol} value={token.symbol} disabled={token.symbol === toToken?.symbol}>{token.symbol}</option>)}
            </select>
          </div>
          <p className="mt-4 text-sm text-white/45">Available: {formatAmount(fromToken?.balance ?? 0, fromToken?.symbol ?? "")} {fromToken?.symbol}</p>
        </section>

        <div className="relative z-10 flex h-0 justify-center">
          <button type="button" aria-label="Switch swap tokens" onClick={() => { setFrom(toToken?.symbol ?? from); setTo(fromToken?.symbol ?? to); }} className="flex size-12 -translate-y-1/2 items-center justify-center rounded-full border-4 border-black bg-[#a995f2] text-black transition active:scale-95"><ArrowDownUp size={21} /></button>
        </div>

        <section className="rounded-3xl border border-white/8 bg-[#171717] p-5">
          <p className="text-sm font-semibold text-white/55">You receive</p>
          <div className="mt-4 flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-4xl font-bold">{output > 0 ? formatAmount(output, toToken?.symbol ?? "") : "0"}</p>
            <select aria-label="Token to receive" value={toToken?.symbol ?? ""} onChange={(event) => setTo(event.target.value)} className="max-w-[8.5rem] rounded-full bg-[#2a2a2a] px-4 py-3 text-base font-bold outline-none">
              {tradable.map((token) => <option key={token.symbol} value={token.symbol} disabled={token.symbol === fromToken?.symbol}>{token.symbol}</option>)}
            </select>
          </div>
          <p className="mt-4 text-sm text-white/45">{toToken ? formatMoney(output * toToken.price * rate, currency) : "—"} · 0.3% exchange fee</p>
        </section>

        <button type="submit" disabled={!canSwap} className="w-full rounded-2xl bg-[#b8a5ff] py-4 text-base font-bold text-[#15101e] transition enabled:hover:bg-[#c8baff] disabled:cursor-not-allowed disabled:opacity-35">
          {!numericAmount ? "Enter an amount" : numericAmount > (fromToken?.balance ?? 0) ? "Insufficient balance" : "Review swap"}
        </button>
      </form>
    </main>
  );
}

function EarnScreen({ tokens, positions, onHome, onStart, onWithdraw }: { tokens: WalletToken[]; positions: Record<string, number>; onHome: () => void; onStart: (symbol: string, amount: number) => Promise<boolean>; onWithdraw: (symbol: string) => Promise<void> }) {
  const eligible = tokens.filter((token) => token.price > 0);
  const firstAvailable = eligible.find((token) => token.balance > 0) ?? eligible[0];
  const [symbol, setSymbol] = useState(firstAvailable?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const token = tokenForSymbol(eligible, symbol) ?? firstAvailable;
  const activePositions = Object.entries(positions).filter(([, value]) => value > 0);
  const annualRate = symbol === "USDT" || symbol === "USDC" ? 4.8 : symbol === "SOL" ? 6.1 : 3.2;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (token && await onStart(token.symbol, numericAmount)) setAmount("");
  }

  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="REWARDS" title="Earn" onHome={onHome} />
      {activePositions.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white/55">YOUR POSITIONS</h2>
          {activePositions.map(([positionSymbol, positionAmount]) => (
            <div key={positionSymbol} className="flex items-center gap-3 rounded-2xl bg-[#171717] p-4">
              <TokenIcon token={tokenForSymbol(tokens, positionSymbol) ?? { symbol: positionSymbol, name: positionSymbol, image: "" }} small />
              <div className="min-w-0 flex-1"><p className="font-bold">{positionSymbol}</p><p className="text-sm text-white/50">{formatAmount(positionAmount, positionSymbol)} earning</p></div>
              <button type="button" onClick={() => onWithdraw(positionSymbol)} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold">Withdraw</button>
            </div>
          ))}
        </section>
      ) : null}
      <form onSubmit={submit} className="rounded-3xl border border-white/8 bg-[#171717] p-5">
        <div className="flex items-center justify-between"><p className="font-bold">Start earning</p><span className="rounded-full bg-[#2d5237] px-3 py-1 text-xs font-bold text-[#82dc91]">{annualRate.toFixed(1)}% APY</span></div>
        <select aria-label="Asset to earn" value={token?.symbol ?? ""} onChange={(event) => setSymbol(event.target.value)} className="mt-5 w-full rounded-xl border border-white/8 bg-[#292929] px-4 py-3 text-base font-bold outline-none">
          {eligible.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>)}
        </select>
        <div className="mt-3 flex items-center rounded-xl border border-white/8 bg-[#292929] pr-3 focus-within:border-[#a995f2]">
          <input aria-label="Amount to earn" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-4 text-xl font-bold outline-none" />
          <button type="button" onClick={() => setAmount(String(token?.balance ?? 0))} className="text-sm font-bold text-[#b8a5ff]">MAX</button>
        </div>
        <p className="mt-3 text-sm text-white/45">Available: {formatAmount(token?.balance ?? 0, token?.symbol ?? "")} {token?.symbol}</p>
        <button type="submit" className="mt-5 w-full rounded-2xl bg-[#b8a5ff] py-4 font-bold text-[#15101e]">Start earning</button>
      </form>
    </main>
  );
}

function CardScreen({ total, currency, frozen, limit, records, onHome, onToggleFrozen, onSaveLimit, onHistory }: { total: number; currency: CurrencyCode; frozen: boolean; limit: number; records: WalletActivity[]; onHome: () => void; onToggleFrozen: () => void; onSaveLimit: (limit: number) => void; onHistory: () => void }) {
  const [showNumber, setShowNumber] = useState(false);
  const [draftLimit, setDraftLimit] = useState(String(limit));

  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="LARPZ CARD" title="Card" onHome={onHome} />
      <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-br from-[#b8a5ff] via-[#735fa9] to-[#282033] p-6 text-[#17111f] shadow-2xl">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-start justify-between"><p className="text-lg font-black tracking-[0.12em]">LARPZ</p><CreditCard size={28} /></div>
        <p className="relative mt-16 text-xl font-bold tracking-[0.18em]">{showNumber ? "5412  8940  2731  4242" : "••••  ••••  ••••  4242"}</p>
        <div className="relative mt-7 flex items-end justify-between"><div><p className="text-[0.62rem] font-bold opacity-60">AVAILABLE</p><p className="mt-1 text-lg font-black">{formatMoney(total, currency)}</p></div><span className="rounded-full bg-black/15 px-3 py-1 text-xs font-bold">{frozen ? "FROZEN" : "ACTIVE"}</span></div>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setShowNumber((current) => !current)} className="flex items-center justify-center gap-2 rounded-2xl bg-[#171717] py-4 text-sm font-bold">{showNumber ? <EyeOff size={19} /> : <Eye size={19} />}{showNumber ? "Hide details" : "Show details"}</button>
        <button type="button" onClick={onToggleFrozen} className="rounded-2xl bg-[#171717] py-4 text-sm font-bold">{frozen ? "Unfreeze card" : "Freeze card"}</button>
      </div>
      <section className="rounded-2xl bg-[#171717] p-5">
        <label className="text-sm font-bold text-white/60" htmlFor="ledger-card-limit">Monthly spending limit</label>
        <div className="mt-3 flex gap-2"><input id="ledger-card-limit" type="number" min="0" step="10" value={draftLimit} onChange={(event) => setDraftLimit(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/8 bg-[#292929] px-4 py-3 text-base outline-none focus:border-[#a995f2]" /><button type="button" onClick={() => onSaveLimit(Math.max(0, Number(draftLimit) || 0))} className="rounded-xl bg-[#b8a5ff] px-5 font-bold text-[#15101e]">Save</button></div>
        <p className="mt-3 text-xs text-white/45">Current limit: {formatMoney(limit, currency)}</p>
      </section>
      <button type="button" onClick={onHistory} className="flex w-full items-center justify-between rounded-2xl bg-[#171717] px-5 py-4 text-left"><span><span className="block font-bold">Card activity</span><span className="mt-1 block text-sm text-white/45">{records.length} wallet transactions</span></span><ChevronRight size={20} /></button>
    </main>
  );
}

function AssetsScreen({ tokens, currency, rate, onToken, onHome }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHome: () => void }) {
  return (
    <main className="space-y-5 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.18em] text-white/45">PORTFOLIO</p><h1 className="mt-1 text-3xl font-bold">All assets</h1></div><button type="button" onClick={onHome} className="rounded-full bg-white/[0.08] px-4 py-2 text-sm font-bold">Home</button></div>
      <div className="space-y-1 rounded-2xl bg-white/[0.025] p-3">{[...tokens].sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name)).map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />)}</div>
    </main>
  );
}

function HistoryScreen({ records, tokens, currency, rate, onHome, onAdd }: { records: WalletActivity[]; tokens: WalletToken[]; currency: CurrencyCode; rate: number; onHome: () => void; onAdd: () => void }) {
  const groups = records.reduce<Record<string, WalletActivity[]>>((result, record) => {
    const key = formatHistoryDate(record.date);
    result[key] ??= [];
    result[key].push(record);
    return result;
  }, {});

  return (
    <main className="space-y-5 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.18em] text-white/45">ACTIVITY</p><h1 className="mt-1 text-3xl font-bold">Transaction history</h1></div><button type="button" aria-label="New transfer" onClick={onAdd} className="flex size-11 items-center justify-center rounded-full bg-[#a995f2] text-black"><Plus size={22} /></button></div>
      {Object.keys(groups).length > 0 ? Object.entries(groups).map(([date, items]) => <section key={date}><div className="rounded-xl bg-[#292929] px-4 py-3 text-sm font-bold text-white/70">{date}</div><div className="divide-y divide-white/8">{items.map((record) => <HistoryRow key={record.id} record={record} currency={currency} rate={rate} tokens={tokens} />)}</div></section>) : <p className="rounded-xl bg-white/[0.04] px-4 py-5 text-sm text-white/50">No transactions yet.</p>}
      <button type="button" onClick={onHome} className="w-full rounded-full border border-white/25 py-3 text-sm font-bold">Back to home</button>
    </main>
  );
}

export function LedgerWallet() {
  const runtime = useWalletRuntime();
  const [view, setView] = useState<LedgerView>("home");
  const [activeTab, setActiveTab] = useState<BottomTab>("Home");
  const [tokens, setTokens] = useState<WalletToken[]>(() => mergeCanonicalWalletCatalogue([]));
  const tokensRef = useRef(tokens);
  const latestMarketSnapshot = useRef<LiveMarketSnapshot>(emptyLiveMarketSnapshot);
  const [records, setRecords] = useState<WalletActivity[]>([]);
  const [settings, setSettings] = useState<LedgerWalletSettings>(defaultLedgerWalletSettings);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [preferredSwapSymbol, setPreferredSwapSymbol] = useState<string>();
  const [preferredBuySymbol, setPreferredBuySymbol] = useState<string>();
  const [features, setFeatures] = useState<LedgerFeatures>(defaultLedgerFeatures);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStart = useRef<number | null>(null);

  useLivePrices(liveMarketSymbols, (prices, changes, images, marketCaps, changes1h, changes7d, volumes24h) => {
    const snapshot = { prices, changes, images, marketCaps, changes1h, changes7d, volumes24h };
    latestMarketSnapshot.current = snapshot;
    const next = applyLiveMarketSnapshot(
      mergeCanonicalWalletCatalogue(tokensRef.current),
      snapshot,
    );
    tokensRef.current = next;
    setTokens(next);
    runtime.updateMarketAssets(next);
  }, refreshKey, (success) => {
    if (!refreshing) return;
    setRefreshing(false);
    notify(success ? "Portfolio refreshed" : "Live prices are unavailable; saved quotes are still shown");
  }, settings.marketApiKey);

  useEffect(() => {
    document.documentElement.dataset.walletTheme = "ledger";
    const timeout = window.setTimeout(() => {
      const storedTokens = readStorage<WalletToken[]>(LEDGER_TOKENS_KEY, []);
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(storedTokens),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
      setSettings(normalizeLedgerWalletSettings(readStorage<unknown>(LEDGER_SETTINGS_KEY, defaultLedgerWalletSettings)));
    }, 0);

    const refreshSharedWallet = () => {
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(readStorage<WalletToken[]>(LEDGER_TOKENS_KEY, [])),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
    };
    window.addEventListener(walletLedgerEvent, refreshSharedWallet);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(walletLedgerEvent, refreshSharedWallet);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.ledgerColorScheme = settings.colorScheme;
    return () => {
      delete document.documentElement.dataset.ledgerColorScheme;
    };
  }, [settings.colorScheme]);

  useEffect(() => {
    if (!runtime.state || !runtime.currentAccount) return;
    const timeoutId = window.setTimeout(() => {
      const accountTokens = tokensForWalletAccount(tokensRef.current, runtime.state!, runtime.currentAccount!);
      const configuredSymbols = new Set(settings.customTokens.map((token) => token.symbol));
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(accountTokens).filter((token) => portfolioSymbols.includes(token.symbol) || configuredSymbols.has(token.symbol)),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount, runtime.state, settings.customTokens]);

  useEffect(() => {
    if (!runtime.currentAccount) return;
    const accountId = runtime.currentAccount.id;
    const timeoutId = window.setTimeout(() => {
      setFeatures(readStorage<LedgerFeatures>(`${LEDGER_FEATURES_KEY}:${accountId}`, defaultLedgerFeatures));
      const storageKey = ledgerActivityStorageKey(accountId);
      const hasScopedHistory = window.localStorage.getItem(storageKey) !== null;
      const accountRecords = hasScopedHistory
        ? readStorage<WalletActivity[]>(storageKey, [])
        : readStorage<WalletActivity[]>(LEDGER_TRANSACTIONS_KEY, []);
      setRecords(accountRecords);
      if (!hasScopedHistory) writeStorage(storageKey, accountRecords);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount]);

  const currency = settings.currency;
  const selectedCurrency = ledgerCurrencies.find((item) => item.code === currency) ?? ledgerCurrencies[0];
  const total = tokens.reduce((sum, token) => sum + (token.balance + (features.earnPositions[token.symbol] ?? 0)) * token.price * selectedCurrency.rate, 0);
  const selectedToken = selectedSymbol ? tokenForSymbol(tokens, selectedSymbol) ?? null : null;
  const sharedRecords = useMemo(() => runtime.state && runtime.currentAccount
    ? transactionsForAccount(runtime.state, runtime.currentAccount.id).map((transaction) => walletActivityFromTransfer(transaction, runtime.currentAccount!.id))
    : [], [runtime.currentAccount, runtime.state]);
  const activityRecords = useMemo(() => {
    const merged = new Map<string, WalletActivity>();
    for (const record of [...records, ...sharedRecords]) merged.set(record.id, record);
    return [...merged.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [records, sharedRecords]);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  }

  function persistTokens(next: WalletToken[]) {
    const normalized = applyLiveMarketSnapshot(
      mergeCanonicalWalletCatalogue(
        next.map((token) => ({ ...token, updatedAt: new Date().toISOString() })),
      ),
      latestMarketSnapshot.current,
    );
    tokensRef.current = normalized;
    setTokens(normalized);
    writeStorage(LEDGER_TOKENS_KEY, normalized);
  }

  function persistFeatures(next: LedgerFeatures) {
    setFeatures(next);
    const accountId = runtime.currentAccount?.id;
    if (accountId) writeStorage(`${LEDGER_FEATURES_KEY}:${accountId}`, next);
  }

  function persistActivity(next: WalletActivity[]) {
    setRecords(next);
    writeStorage(ledgerActivityStorageKey(runtime.currentAccount?.id), next);
  }

  async function updateRuntimeBalances(next: WalletToken[]) {
    const saved = await runtime.replaceCurrentBalances(Object.fromEntries(next.map((token) => [token.symbol, token.balance])));
    if (!saved) {
      notify("The shared account could not be updated. No changes were saved.");
      return false;
    }
    persistTokens(next);
    return true;
  }

  function goHome() {
    setView("home");
    setActiveTab("Home");
  }

  function openSwap(symbol?: string) {
    setSelectedSymbol(null);
    setPreferredSwapSymbol(symbol);
    setView("swap");
    setActiveTab("Swap");
  }

  function openBuy(symbol?: string) {
    setSelectedSymbol(null);
    setPreferredBuySymbol(symbol);
    setView("buy");
  }

  function openAsset(token: WalletToken | string) {
    const symbol = typeof token === "string" ? token : token.symbol;
    setSelectedSymbol(symbol);
    setView("assets");
    setActiveTab("Home");
  }

  function triggerRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setPullDistance(0);
    runtime.refresh();
    setRefreshKey((value) => value + 1);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (view !== "home" || window.scrollY > 0 || refreshing) return;
    pullStart.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (pullStart.current === null) return;
    const distance = Math.max(0, (event.touches[0]?.clientY ?? pullStart.current) - pullStart.current);
    setPullDistance(Math.min(96, distance * 0.55));
  }

  function handleTouchEnd() {
    if (pullDistance >= 72) triggerRefresh();
    else setPullDistance(0);
    pullStart.current = null;
  }

  function saveSettings(nextSettings: LedgerWalletSettings) {
    const normalized = normalizeLedgerWalletSettings(nextSettings);
    const validationError = validateLedgerSettings(normalized);
    if (validationError) {
      notify(validationError);
      return;
    }

    const customSymbols = new Set(normalized.customTokens.map((token) => token.symbol));
    const nextTokens = tokens
      .filter((token) => portfolioSymbols.includes(token.symbol) || customSymbols.has(token.symbol))
      .map((token) => {
        const custom = normalized.customTokens.find((item) => item.symbol === token.symbol);
        return custom ? { ...token, name: custom.name, price: custom.price } : token;
      });
    for (const custom of normalized.customTokens) {
      if (nextTokens.some((token) => token.symbol === custom.symbol)) continue;
      nextTokens.push({
        id: custom.id,
        name: custom.name,
        symbol: custom.symbol,
        price: custom.price,
        balance: 0,
        change24h: 0,
        image: "",
        updatedAt: new Date().toISOString(),
      });
    }
    setSettings(normalized);
    writeStorage(LEDGER_SETTINGS_KEY, normalized);
    runtime.updateMarketAssets(nextTokens);
    void updateRuntimeBalances(nextTokens);
    notify("Settings saved");
  }

  async function completeBuy(symbol: string, amount: number) {
    const token = tokenForSymbol(tokens, symbol);
    if (!token || !Number.isFinite(amount) || amount <= 0) {
      notify("Choose an asset and enter a valid amount");
      return false;
    }
    const nextTokens = tokens.map((item) => item.symbol === symbol ? { ...item, balance: item.balance + amount } : item);
    if (!await updateRuntimeBalances(nextTokens)) return false;
    const record: WalletActivity = {
      id: createId("ledger-buy"),
      type: "receive",
      tokenSymbol: symbol,
      amount,
      counterpartyLabel: "Larpz Wallet demo buy",
      date: new Date().toISOString(),
      status: "completed",
      note: "INTERNAL DEMO CREDIT — NO PAYMENT PROCESSED",
    };
    const nextRecords = [record, ...records];
    persistActivity(nextRecords);
    notify(`${formatAmount(amount, symbol)} ${symbol} added to this demo account`);
    return true;
  }

  async function completeSwap(fromSymbol: string, toSymbol: string, amount: number) {
    const fromToken = tokenForSymbol(tokens, fromSymbol);
    const toToken = tokenForSymbol(tokens, toSymbol);
    if (!fromToken || !toToken || fromSymbol === toSymbol || !Number.isFinite(amount) || amount <= 0) {
      notify("Choose two different assets and enter a valid amount");
      return false;
    }
    if (amount > fromToken.balance) {
      notify(`Not enough ${fromSymbol}`);
      return false;
    }

    const received = amount * fromToken.price / toToken.price * 0.997;
    const nextTokens = tokens.map((token) => {
      if (token.symbol === fromSymbol) return { ...token, balance: token.balance - amount };
      if (token.symbol === toSymbol) return { ...token, balance: token.balance + received };
      return token;
    });
    if (!await updateRuntimeBalances(nextTokens)) return false;

    const timestamp = new Date().toISOString();
    const nextRecords: WalletActivity[] = [
      { id: createId("ledger-swap-in"), type: "receive", tokenSymbol: toSymbol, amount: received, counterpartyLabel: `${fromSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
      { id: createId("ledger-swap-out"), type: "send", tokenSymbol: fromSymbol, amount, counterpartyLabel: `${toSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
      ...records,
    ];
    persistActivity(nextRecords);
    notify(`Swapped ${formatAmount(amount, fromSymbol)} ${fromSymbol} for ${formatAmount(received, toSymbol)} ${toSymbol}`);
    return true;
  }

  async function startEarning(symbol: string, amount: number) {
    const token = tokenForSymbol(tokens, symbol);
    if (!token || !Number.isFinite(amount) || amount <= 0) {
      notify("Enter an amount greater than zero");
      return false;
    }
    if (amount > token.balance) {
      notify(`Not enough ${symbol}`);
      return false;
    }
    if (!await updateRuntimeBalances(tokens.map((item) => item.symbol === symbol ? { ...item, balance: item.balance - amount } : item))) return false;
    persistFeatures({ ...features, earnPositions: { ...features.earnPositions, [symbol]: (features.earnPositions[symbol] ?? 0) + amount } });
    notify(`${formatAmount(amount, symbol)} ${symbol} moved to Earn`);
    return true;
  }

  async function withdrawEarnings(symbol: string) {
    const amount = features.earnPositions[symbol] ?? 0;
    if (amount <= 0) return;
    const token = tokenForSymbol(tokens, symbol);
    if (!token) {
      notify(`${symbol} is not available in this account`);
      return;
    }
    if (!await updateRuntimeBalances(tokens.map((item) => item.symbol === symbol ? { ...item, balance: item.balance + amount } : item))) return;
    persistFeatures({ ...features, earnPositions: { ...features.earnPositions, [symbol]: 0 } });
    notify(`${formatAmount(amount, symbol)} ${symbol} returned to your balance`);
  }

  function toggleCardFrozen() {
    const next = { ...features, cardFrozen: !features.cardFrozen };
    persistFeatures(next);
    notify(next.cardFrozen ? "Card frozen" : "Card active");
  }

  function saveCardLimit(limit: number) {
    persistFeatures({ ...features, cardLimit: limit });
    notify("Spending limit saved");
  }

  function changeBottomTab(tab: BottomTab) {
    setActiveTab(tab);
    if (tab === "Home") {
      goHome();
      return;
    }
    if (tab === "Swap") {
      setPreferredSwapSymbol(undefined);
      setView("swap");
      return;
    }
    setView(tab === "Earn" ? "earn" : "card");
  }

  return (
    <div data-ledger-color-scheme={settings.colorScheme} className="ledger-wallet-font min-h-[100dvh] overflow-x-clip bg-black font-sans text-white selection:bg-[#a995f2] selection:text-black">
      <div
        className="relative mx-auto min-h-[100dvh] max-w-[560px] overflow-x-clip bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="pointer-events-none fixed inset-0 mx-auto max-w-[560px] opacity-80" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(91, 37, 128, .25), transparent 28%), radial-gradient(circle at 90% 65%, rgba(65, 24, 103, .18), transparent 30%)" }} />
        <div className="relative">
          {view === "home" ? <HomeScreen tokens={tokens} records={activityRecords} currency={currency} rate={selectedCurrency.rate} total={total} actionPreference={settings.actionPreference} refreshing={refreshing} pullDistance={pullDistance} onSettings={() => setView("settings")} onSearch={() => setView("search")} onRefresh={triggerRefresh} onReceive={() => runtime.openReceive()} onSend={() => runtime.openTransfer()} onBuy={() => openBuy()} onExplore={() => setView("market")} onSwap={() => openSwap()} onAssets={() => { setSelectedSymbol(null); setView("assets"); }} onHistory={() => setView("history")} onAccounts={runtime.openAccounts} onPerpetuals={() => setView("perpetuals")} onToken={openAsset} /> : null}
          {view === "assets" && !selectedToken ? <AssetsScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} onToken={openAsset} onHome={goHome} /> : null}
          {view === "assets" && selectedToken ? <AssetDetailScreen token={selectedToken} tokens={tokens} accounts={runtime.state?.wallets.ledger.accounts ?? []} currentAccountId={runtime.currentAccount?.id} currency={currency} rate={selectedCurrency.rate} marketApiKey={settings.marketApiKey} onSelectToken={setSelectedSymbol} onBack={() => { setSelectedSymbol(null); goHome(); }} onTransfer={() => runtime.openTransfer(selectedToken.symbol)} onReceive={() => runtime.openReceive()} onSwap={() => openSwap(selectedToken.symbol)} onBuy={() => openBuy(selectedToken.symbol)} onAccounts={runtime.openAccounts} onSettings={() => { setSelectedSymbol(null); setView("settings"); }} /> : null}
          {view === "history" ? <HistoryScreen records={activityRecords} tokens={tokens} currency={currency} rate={selectedCurrency.rate} onHome={goHome} onAdd={() => runtime.openTransfer()} /> : null}
          {view === "market" ? <MarketScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} showAdvanced={settings.proKeyEnabled} onToken={openAsset} onHome={goHome} /> : null}
          {view === "search" ? <SearchScreen tokens={tokens} records={activityRecords} currency={currency} rate={selectedCurrency.rate} onToken={openAsset} onHistory={() => setView("history")} onHome={goHome} /> : null}
          {view === "settings" ? <SettingsScreen settings={settings} onSave={saveSettings} onSecurity={runtime.openSecurity} onAccounts={runtime.openAccounts} onHome={goHome} /> : null}
          {view === "buy" ? <BuyScreen tokens={tokens} preferredSymbol={preferredBuySymbol} currency={currency} rate={selectedCurrency.rate} onHome={goHome} onBuy={completeBuy} /> : null}
          {view === "perpetuals" ? <PerpetualsScreen tokens={tokens} onToken={openAsset} onHome={goHome} /> : null}
          {view === "swap" ? <SwapScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} initialFrom={preferredSwapSymbol} onHome={goHome} onSwap={completeSwap} /> : null}
          {view === "earn" ? <EarnScreen tokens={tokens} positions={features.earnPositions} onHome={goHome} onStart={startEarning} onWithdraw={withdrawEarnings} /> : null}
          {view === "card" ? <CardScreen total={total} currency={currency} frozen={features.cardFrozen} limit={features.cardLimit} records={activityRecords} onHome={goHome} onToggleFrozen={toggleCardFrozen} onSaveLimit={saveCardLimit} onHistory={() => setView("history")} /> : null}
        </div>

        {!selectedToken && ["home", "swap", "earn", "card"].includes(view) ? <BottomNav active={activeTab} onChange={changeBottomTab} /> : null}

        {notice ? <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-[470px] rounded-xl border border-[#b8a5ff]/35 bg-[#282134]/95 px-4 py-3 text-center text-sm font-semibold text-[#ded5ff] shadow-2xl backdrop-blur-xl">{notice}</div> : null}
      </div>
    </div>
  );
}
