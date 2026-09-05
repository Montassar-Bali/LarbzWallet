"use client";

import {
  ArrowLeft,
  ArrowRightLeft,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Bell,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Compass,
  CreditCard,
  Eye,
  EyeOff,
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
import { LedgerPortfolioChart } from "@/components/wallet/ledger-portfolio-chart";
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
  walletAssetDecimals,
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
import styles from "./ledger-wallet.module.css";

const LEDGER_TOKENS_KEY = "larpz_ledger_tokens";
const LEDGER_TRANSACTIONS_KEY = "larpz_ledger_transactions";
const LEDGER_FEATURES_KEY = "larpz_ledger_features";
const LEDGER_SETTINGS_KEY = "larpz_ledger_settings_v2";

const portfolioSymbols = walletMarketSymbols;

type CurrencyCode = LedgerCurrencyCode;
type LedgerView = "home" | "assets" | "allocation" | "history" | "market" | "swap" | "earn" | "card" | "search" | "buy" | "perpetuals" | "notifications";
type BottomTab = "Wallet" | "Earn" | "Discover" | "My Ledger";
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

function ledgerSettingsStorageKey(accountId?: string) {
  return accountId ? `${LEDGER_SETTINGS_KEY}:${accountId}` : LEDGER_SETTINGS_KEY;
}

function formatAmount(amount: number, symbol: string) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: symbol === "BTC" ? 5 : 4,
  }).format(amount);
}

function normalizedAssetAmount(amount: number, symbol: string) {
  return Number(amount.toFixed(walletAssetDecimals(symbol) ?? 8));
}

function formatMoney(amount: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}

function SplitMoney({ amount, currency, className = "", testId, fit = false }: { amount: number; currency: CurrencyCode; className?: string; testId?: string; fit?: boolean }) {
  return <span data-testid={testId} className={`block max-w-full whitespace-nowrap tabular-nums ${fit ? "" : "overflow-hidden text-ellipsis"} ${className}`}>{formatMoney(amount, currency)}</span>;
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
      className={styles.assetRow}
    >
      <TokenIcon token={token} />
      <span className={styles.assetMain}>
        <strong>{token.name}</strong>
        <span>
          {formatAmount(token.balance, token.symbol)} {token.symbol}
        </span>
      </span>
      <span className={styles.assetValue}>
        <strong>{formatMoney(value, currency)}</strong>
        <span className={positive ? styles.positive : styles.negative}>
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
    <div className={styles.historyRow}>
      <TokenIcon token={token ?? { symbol: record.tokenSymbol, name: record.tokenSymbol, image: "" }} />
      <span className={styles.historyCopy}>
        <strong>{received ? "Received" : "Sent"} {record.tokenSymbol}</strong>
        <span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(record.date))}</span>
      </span>
      <span className={styles.historyValue}>
        <strong className={received ? styles.positive : styles.negative}>
          {received ? "+" : "-"}{formatAmount(record.amount, record.tokenSymbol)} {record.tokenSymbol}
        </strong>
        <span>{formatMoney(value, currency)}</span>
      </span>
    </div>
  );
}

function LedgerWalletNavIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={styles.navIcon}>
      <path d="M6.25 8.25h19.5a2 2 0 0 1 2 2v14.25H8.5a3.25 3.25 0 0 1-3.25-3.25V7.5A2.5 2.5 0 0 1 7.75 5h16" />
      <path d="M19.25 13h8.5v7h-8.5a2 2 0 0 1 0-7Z" />
      <circle cx="21.5" cy="16.5" r=".75" className={styles.navIconFill} />
    </svg>
  );
}

function LedgerEarnNavIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={styles.navIcon}>
      <path d="M5 26.25h22" />
      <path d="M7.5 26v-5.5M12.75 26v-9M18 26v-12.5M23.25 26v-16" />
      <path d="m6.75 14.25 6-5.25 4.5 2.5L25.5 4" />
      <path d="M20.25 4h5.25v5.25" />
    </svg>
  );
}

function LedgerDiscoverNavIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={styles.navIcon}>
      <circle cx="16" cy="16" r="6.75" />
      <path d="M26.75 11.25c1.4 1.2.4 4.2-2.25 7.15-3.8 4.2-10.4 7.15-14.75 6.55-1.55-.2-2.55-.85-2.85-1.75" />
      <path d="M5.35 20.2c-1.05-1.4.15-4.15 2.65-6.9 3.75-4.15 9.95-6.95 14.2-6.55 1.7.15 2.8.8 3.15 1.8" />
      <path d="m7.25 20.25-2.2.25.2-2.2M24.75 11.25l2.2-.25-.2 2.2" />
    </svg>
  );
}

function LedgerDeviceNavIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={styles.navIcon}>
      <path d="M5.5 22.25h21v4.5h-21z" />
      <path d="m9 22.25 7.4-14.6a2 2 0 0 1 2.85-.82l5.05 3.25-6.2 12.17" />
      <path d="m17 9 5.55 3.55M13 18.2h6.65" />
    </svg>
  );
}

function BottomNav({ active, onChange, onTransfer }: { active: BottomTab; onChange: (tab: BottomTab) => void; onTransfer: () => void }) {
  const tabs: BottomTab[] = ["Wallet", "Earn", "Discover", "My Ledger"];

  return (
    <nav aria-label="Ledger Wallet navigation" data-testid="ledger-bottom-nav" className={styles.bottomNav}>
      <svg
        aria-hidden="true"
        focusable="false"
        data-testid="ledger-nav-surface"
        className={styles.navSurface}
        viewBox="0 0 430 81"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="ledger-nav-surface-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ledger-nav-highlight)" />
            <stop offset="0.62" stopColor="var(--ledger-nav-surface)" />
            <stop offset="1" stopColor="var(--ledger-nav-surface)" />
          </linearGradient>
        </defs>
        <path
          vectorEffect="non-scaling-stroke"
          d="M34 1H153C171 1 173 46 215 46C257 46 259 1 277 1H396C409 1 419 11 419 24V57C419 70 409 80 396 80H34C21 80 11 70 11 57V24C11 11 21 1 34 1Z"
        />
      </svg>
      <button type="button" aria-current={active === tabs[0] ? "page" : undefined} onClick={() => onChange(tabs[0])} className={`${styles.navItem} ${active === tabs[0] ? styles.navItemActive : ""}`}><LedgerWalletNavIcon /><span>Wallet</span></button>
      <button type="button" aria-current={active === tabs[1] ? "page" : undefined} onClick={() => onChange(tabs[1])} className={`${styles.navItem} ${active === tabs[1] ? styles.navItemActive : ""}`}><LedgerEarnNavIcon /><span>Earn</span></button>
      <button type="button" aria-label="Transfer" onClick={onTransfer} className={styles.centerNav}><span data-testid="ledger-transfer-orb"><ArrowRightLeft size={27} strokeWidth={1.9} /></span></button>
      <button type="button" aria-current={active === tabs[2] ? "page" : undefined} onClick={() => onChange(tabs[2])} className={`${styles.navItem} ${active === tabs[2] ? styles.navItemActive : ""}`}><LedgerDiscoverNavIcon /><span>Discover</span></button>
      <button type="button" aria-current={active === tabs[3] ? "page" : undefined} onClick={() => onChange(tabs[3])} className={`${styles.navItem} ${active === tabs[3] ? styles.navItemActive : ""}`}><LedgerDeviceNavIcon /><span>My Ledger</span></button>
    </nav>
  );
}

function HomeScreen({
  tokens,
  records,
  accounts,
  currentAccountId,
  currency,
  rate,
  total,
  earnPositions,
  actionPreference,
  marketApiKey,
  refreshing,
  pullDistance,
  onSettings,
  onRefresh,
  onReceive,
  onSend,
  onBuy,
  onExplore,
  onSwap,
  onEarn,
  onCard,
  onNotifications,
  onAddTransaction,
  onAssets,
  onHistory,
  onAllocation,
  onAccounts,
  onToken,
}: {
  tokens: WalletToken[];
  records: WalletActivity[];
  accounts: WalletAccount[];
  currentAccountId?: string;
  currency: CurrencyCode;
  rate: number;
  total: number;
  earnPositions: Record<string, number>;
  actionPreference: LedgerWalletSettings["actionPreference"];
  marketApiKey: string;
  refreshing: boolean;
  pullDistance: number;
  onSettings: () => void;
  onRefresh: () => void;
  onReceive: () => void;
  onSend: () => void;
  onBuy: () => void;
  onExplore: () => void;
  onSwap: () => void;
  onEarn: () => void;
  onCard: () => void;
  onNotifications: () => void;
  onAddTransaction: () => void;
  onAssets: () => void;
  onHistory: () => void;
  onAllocation: () => void;
  onAccounts: () => void;
  onToken: (token: WalletToken) => void;
}) {
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [period, setPeriod] = useState("1D");
  const [holdingsTab, setHoldingsTab] = useState<"assets" | "accounts">("assets");
  const visibleTokens = useMemo(() => {
    return [...tokens]
      .filter((token) => token.balance > 0)
      .sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [tokens]);

  const baseTotal = tokens.reduce((sum, token) => sum + (token.balance + (earnPositions[token.symbol] ?? 0)) * token.price, 0);
  const change = baseTotal === 0 ? 0 : tokens.reduce((sum, token) => sum + token.change24h * (token.balance + (earnPositions[token.symbol] ?? 0)) * token.price, 0) / baseTotal;
  const dailyValue = total * change / 100;
  const allocationTotal = baseTotal;
  const allocationColors = ["#2db6c4", "#f2aa3d", "#f4f1f6", "#8e76dc"];
  const allocation = [...tokens]
    .map((token) => ({ token, amount: token.balance + (earnPositions[token.symbol] ?? 0) }))
    .filter(({ token, amount }) => amount > 0 && token.price > 0)
    .sort((a, b) => b.amount * b.token.price - a.amount * a.token.price)
    .slice(0, 4)
    .map(({ token, amount }, index) => ({ token, color: allocationColors[index], percent: allocationTotal > 0 ? amount * token.price / allocationTotal * 100 : 0 }));
  let allocationOffset = 0;
  const allocationGradient = allocation.length
    ? `conic-gradient(${allocation.map((entry) => {
      const start = allocationOffset;
      allocationOffset += entry.percent;
      return `${entry.color} ${start.toFixed(2)}% ${allocationOffset.toFixed(2)}%`;
    }).join(", ")})`
    : "conic-gradient(rgba(255,255,255,.09) 0 100%)";
  const sendAction = { label: "Send", icon: ArrowUp, onClick: onSend };
  const receiveAction = { label: "Receive", icon: ArrowDown, onClick: onReceive };
  const actions: { label: string; icon: LucideIcon; onClick: () => void }[] = [
    { label: "Buy", icon: Plus, onClick: onBuy },
    { label: "Swap", icon: Repeat2, onClick: onSwap },
    ...(actionPreference === "receive-first" ? [receiveAction, sendAction] : [sendAction, receiveAction]),
    { label: "Earn", icon: Coins, onClick: onEarn },
  ];
  const previewRecords = records.slice(0, 4);
  const formattedTotalLength = formatMoney(total, currency).length;
  const heroSizeClass = formattedTotalLength > 20 ? styles.heroValueCompact : formattedTotalLength > 15 ? styles.heroValueLong : "";

  return (
    <main data-testid="ledger-home" className={styles.home}>
      <div data-testid="ledger-refresh-status" className={styles.pullStatus} style={{ transform: `translate(-50%, ${Math.min(42, pullDistance / 2)}px)`, opacity: refreshing || pullDistance > 12 ? 1 : 0 }} aria-hidden={!refreshing && pullDistance <= 12}>
        <RefreshCw className={refreshing ? "animate-spin" : ""} size={14} />
        <span role="status">{refreshing ? "Refreshing portfolio…" : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}</span>
      </div>

      <header className={styles.header}>
        <div className={styles.walletHeading}>
          <h1>Wallet</h1>
          <button type="button" className={styles.visibilityButton} aria-label={balanceVisible ? "Hide portfolio balance" : "Show portfolio balance"} aria-pressed={!balanceVisible} onClick={() => setBalanceVisible((visible) => !visible)}>
            {balanceVisible ? <Eye size={22} strokeWidth={1.8} /> : <EyeOff size={22} strokeWidth={1.8} />}
          </button>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerIcon} aria-label="Open Larpz card" onClick={onCard}><CreditCard size={23} strokeWidth={1.8} /></button>
          <button type="button" className={styles.headerIcon} aria-label="Discover markets" onClick={onExplore}><LineChart size={23} strokeWidth={1.8} /></button>
          <button type="button" className={styles.headerIcon} aria-label="Open notifications" onClick={onNotifications}><Bell size={23} strokeWidth={1.8} /></button>
          <button type="button" className={styles.headerIcon} aria-label="Open Larpz Wallet settings" onClick={onSettings}><Settings size={23} strokeWidth={1.8} /></button>
        </div>
      </header>

      <div data-testid="ledger-primary-tabs" className={styles.topTabs} role="tablist" aria-label="Wallet content">
        <button type="button" role="tab" aria-selected="true" className={`${styles.topTab} ${styles.topTabActive}`}>Crypto</button>
        <button type="button" role="tab" aria-selected="false" className={styles.topTab} onClick={onExplore}>Market</button>
      </div>

      <section className={styles.hero} aria-label="Portfolio overview">
        {balanceVisible
          ? <SplitMoney fit testId="ledger-portfolio-balance" amount={total} currency={currency} className={`${styles.heroValue} ${heroSizeClass}`} />
          : <span data-testid="ledger-portfolio-balance" className={styles.heroValue}>••••••</span>}
        <button type="button" onClick={onRefresh} aria-label="Refresh portfolio" className={`${styles.heroChange} ${change >= 0 ? styles.positive : styles.negative}`}>
          {balanceVisible ? `${change >= 0 ? "↗ +" : "↘ "}${change.toFixed(2)}% (${dailyValue >= 0 ? "+" : ""}${formatMoney(dailyValue, currency)})` : "Balance hidden"}
        </button>
        <LedgerPortfolioChart key={period} tokens={tokens} period={period} currency={currency} rate={rate} total={total} marketApiKey={marketApiKey} additionalBalances={earnPositions} />
        <div className={styles.periods} role="tablist" aria-label="Portfolio chart period">
          {["1D", "1W", "1M", "1Y", "ALL"].map((timeframe) => <button key={timeframe} type="button" role="tab" aria-selected={period === timeframe} onClick={() => setPeriod(timeframe)} className={`${styles.period} ${period === timeframe ? styles.periodActive : ""}`}>{timeframe}</button>)}
        </div>
      </section>

      <section data-testid="ledger-actions" className={styles.actionRow} aria-label="Wallet actions">
        {actions.map(({ label, icon: Icon, onClick }) => <button key={label} type="button" className={styles.action} onClick={onClick}><Icon size={23} strokeWidth={1.8} /><span>{label}</span></button>)}
      </section>

      <section className={styles.portfolioSection}>
        <div data-testid="ledger-holdings-tabs" className={styles.segments} role="tablist" aria-label="Portfolio content">
          <button type="button" role="tab" aria-selected={holdingsTab === "assets"} onClick={() => setHoldingsTab("assets")} className={`${styles.segment} ${holdingsTab === "assets" ? styles.segmentActive : ""}`}>Assets</button>
          <button type="button" role="tab" aria-selected={holdingsTab === "accounts"} onClick={() => setHoldingsTab("accounts")} className={`${styles.segment} ${holdingsTab === "accounts" ? styles.segmentActive : ""}`}>Accounts</button>
        </div>
        <div className={styles.assetList}>
          {holdingsTab === "assets" ? (
            visibleTokens.length > 0
              ? visibleTokens.map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />)
              : <p className={styles.emptyState}>No assets in this account yet.</p>
          ) : (
            accounts.length > 0 ? accounts.map((account) => {
              const accountValue = tokens.reduce((sum, token) => sum + (account.balances[token.symbol] ?? 0) * token.price * rate, 0);
              const primaryHolding = [...tokens]
                .map((token) => ({ token, amount: account.balances[token.symbol] ?? 0 }))
                .filter((entry) => entry.amount > 0)
                .sort((a, b) => b.amount * b.token.price - a.amount * a.token.price)[0];
              return <button key={account.id} type="button" className={`${styles.assetRow} ${styles.accountRow}`} onClick={onAccounts}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.07]"><UserRound size={20} /></span><span className={styles.assetMain}><span className={styles.accountTitle}><strong>{account.name}</strong><small>{account.id === currentAccountId ? "Current" : "Multi-network"}</small></span><span className={styles.accountAddress}>{account.address}</span></span><span className={styles.assetValue}><strong>{formatMoney(accountValue, currency)}</strong><span>{primaryHolding ? `${formatAmount(primaryHolding.amount, primaryHolding.token.symbol)} ${primaryHolding.token.symbol}` : "No assets"}</span></span></button>;
            }) : <p className={styles.emptyState}>No Larpz Wallet accounts are available.</p>
          )}
        </div>
        <button type="button" className={styles.outlineButton} onClick={holdingsTab === "assets" ? onAssets : onAccounts}>{holdingsTab === "assets" ? "See all assets" : <><Plus size={18} />Add account</>}</button>
      </section>

      <section data-testid="ledger-allocation" className={styles.sectionBlock}>
        <h2 className={styles.sectionTitle}>Allocation</h2>
        <button type="button" className={styles.allocationButton} onClick={onAllocation} aria-label="View detailed portfolio allocation">
          <span className={styles.donut} style={{ background: allocationGradient }} />
          {allocation.length ? <ul className={styles.allocationLegend}>{allocation.map(({ token, color, percent }) => <li key={token.symbol}><span className={styles.legendDot} style={{ background: color }} /><span>{token.symbol} {percent.toFixed(0)}%</span></li>)}</ul> : <span className={styles.neutral}>No allocation yet</span>}
          <ChevronRight size={21} />
        </button>
      </section>

      <section className={styles.sectionBlock}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={styles.sectionTitle}>Transaction history</h2>
          <button type="button" aria-label="Add transaction" onClick={onAddTransaction} className={styles.headerIcon}><Plus size={19} /></button>
        </div>
        <div className={styles.historyList}>
          {previewRecords.length ? previewRecords.map((record, index) => {
            const currentDate = formatHistoryDate(record.date);
            const previousDate = index > 0 ? formatHistoryDate(previewRecords[index - 1].date) : "";
            return <div key={record.id}>{currentDate !== previousDate ? <span className={styles.dateChip}>{currentDate}</span> : null}<HistoryRow record={record} currency={currency} rate={rate} tokens={tokens} /></div>;
          }) : <p className={styles.emptyState}>No transactions yet.</p>}
        </div>
        <button type="button" className={styles.outlineButton} onClick={onHistory}>See all</button>
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
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const token = tokenForSymbol(available, symbol) ?? initial;
  const numericAmount = Number(fiatAmount);
  const output = token && Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount / rate / token.price : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || output <= 0 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (await onBuy(token.symbol, output)) setFiatAmount("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="space-y-6 px-4 pb-32 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="PURCHASE" title="Buy" onHome={onHome} />
      <div className="flex items-start gap-3 rounded-2xl border border-[#a995f2]/20 bg-[#a995f2]/10 p-4 text-sm leading-6 text-[#d6ccff]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" />
        <p>Select an asset and enter an amount for this internal wallet simulation. No real funds are charged or transferred.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <section className="rounded-3xl bg-[#171717] p-5">
          <label className="block text-sm font-semibold text-white/55" htmlFor="ledger-buy-asset">Asset</label>
          <select id="ledger-buy-asset" value={token?.symbol ?? ""} onChange={(event) => setSymbol(event.target.value)} className="mt-3 min-h-14 w-full rounded-2xl border border-white/10 bg-[#292929] px-4 text-base font-bold outline-none focus:border-[#a995f2]">
            {available.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>)}
          </select>
          <label className="mt-5 block text-sm font-semibold text-white/55" htmlFor="ledger-buy-amount">Amount ({currency})</label>
          <div className="mt-3 flex min-h-16 items-center rounded-2xl border border-white/10 bg-[#292929] px-4 focus-within:border-[#a995f2]">
            <CircleDollarSign className="size-6 text-white/45" />
            <input id="ledger-buy-amount" value={fiatAmount} onChange={(event) => setFiatAmount(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-3 text-3xl font-bold outline-none placeholder:text-white/20" />
          </div>
          <div className="mt-4 flex justify-between gap-4 text-sm text-white/50"><span>You receive</span><span className="max-w-[70%] truncate text-right font-semibold text-white">{output > 0 && token ? `${formatAmount(output, token.symbol)} ${token.symbol}` : "—"}</span></div>
        </section>
        <button type="submit" disabled={!token || output <= 0 || submitting} className="min-h-14 w-full rounded-full bg-[#b8a5ff] px-5 text-base font-bold text-[#15101e] disabled:opacity-35">{submitting ? "Adding…" : "Add simulated balance"}</button>
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
        <p className="mt-2 leading-6 text-white/55">Track leveraged market positions with real-time price data and up to 40x leverage.</p>
      </div>
      <section className="space-y-2">
        {markets.map((token, index) => <button key={token.symbol} type="button" onClick={() => onToken(token)} className="flex min-h-[5.25rem] w-full items-center gap-4 rounded-2xl bg-[#171717] px-4 text-left"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block text-lg">{token.name}</strong><span className="text-sm text-white/50">Up to {[40, 25, 15, 10, 8][index] ?? 5}x market view</span></span><span className={`shrink-0 font-bold ${token.change24h >= 0 ? "text-[#65c873]" : "text-[#d87888]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></button>)}
      </section>
    </main>
  );
}

function useDialogLifecycle(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeHandler = useRef(onClose);

  useEffect(() => {
    closeHandler.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      const initial = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus], button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
      initial?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandler.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return dialogRef;
}

function SettingsScreen({ settings, tokens, onSave, onSecurity, onAccounts, onClose }: { settings: LedgerWalletSettings; tokens: WalletToken[]; onSave: (settings: LedgerWalletSettings, balances: Record<string, number>) => Promise<boolean>; onSecurity: () => void; onAccounts: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [draftBalances, setDraftBalances] = useState<Record<string, string>>(() => Object.fromEntries(tokens.map((token) => [token.symbol, String(token.balance)])));
  const [dirtyBalances, setDirtyBalances] = useState<Set<string>>(() => new Set());
  const [addingNetwork, setAddingNetwork] = useState<LedgerTokenNetwork | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [tokenPrice, setTokenPrice] = useState("0");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useDialogLifecycle(onClose);

  function updateBalance(symbol: string, value: string) {
    setDraftBalances((current) => ({ ...current, [symbol]: value }));
    setDirtyBalances((current) => new Set(current).add(symbol));
    setError("");
    setSaved(false);
  }

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
    if (draft.customTokens.some((token) => {
      const matchesAddress = token.network === addingNetwork && (addingNetwork === "ethereum"
        ? token.contractAddress.toLowerCase() === contractAddress.trim().toLowerCase()
        : token.contractAddress === contractAddress.trim());
      return token.symbol === symbol || matchesAddress;
    })) return setError("That custom token is already configured.");
    const token: LedgerCustomToken = { id: createId("ledger-custom"), network: addingNetwork, contractAddress: contractAddress.trim(), name: tokenName.trim(), symbol, price };
    setDraft((current) => ({ ...current, customTokens: [...current.customTokens, token] }));
    setAddingNetwork(null);
    setTokenName("");
    setTokenSymbol("");
    setContractAddress("");
    setTokenPrice("0");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const validationError = validateLedgerSettings(draft);
    if (validationError) {
      setError(validationError);
      setSaved(false);
      return;
    }
    const balances = Object.fromEntries([...dirtyBalances].map((symbol) => [symbol, Number(draftBalances[symbol])]));
    const invalidBalance = Object.entries(balances).find(([, value]) => !Number.isFinite(value) || value < 0);
    if (invalidBalance) {
      setError(`Enter a valid non-negative ${invalidBalance[0]} balance.`);
      setSaved(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (!await onSave({ ...draft, marketApiKey: draft.marketApiKey.trim() }, balances)) {
        setError("The portfolio could not be saved. Try again.");
        setSaved(false);
        return;
      }
      setDirtyBalances(new Set());
      setError("");
      setSaved(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="presentation">
      <button type="button" disabled={saving} className={styles.sheetDismiss} aria-label="Close Edit Portfolio" onClick={onClose} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ledger-edit-portfolio-title" data-testid="ledger-edit-portfolio-sheet" className={`${styles.sheet} ${styles.settingsSheet}`}>
        <header className={styles.sheetHeader}><h2 id="ledger-edit-portfolio-title">Edit Portfolio</h2><button type="button" data-dialog-initial-focus className={styles.closeButton} aria-label="Close" disabled={saving} onClick={onClose}><X size={21} /></button></header>
        <form onSubmit={save} className={styles.sheetForm}>
          <div className={styles.sheetBody}>
        <div className={styles.formGrid}>
          {["BTC", "SOL", "ETH", "TRX", "BNB"].map((symbol) => <label key={symbol} className={styles.formRow}><span>{symbol}</span><input aria-label={`${symbol} balance`} type="number" inputMode="decimal" min="0" step="any" value={draftBalances[symbol] ?? "0"} onChange={(event) => updateBalance(symbol, event.target.value)} /></label>)}
          <label className={styles.formRow}><span>USDT</span><span className={styles.stableFields}><input aria-label="USDT balance" type="number" inputMode="decimal" min="0" step="any" value={draftBalances.USDT ?? "0"} onChange={(event) => updateBalance("USDT", event.target.value)} /><select aria-label="USDT network" value={draft.stablecoinNetworks.USDT} onChange={(event) => setDraft((current) => ({ ...current, stablecoinNetworks: { ...current.stablecoinNetworks, USDT: event.target.value as LedgerWalletSettings["stablecoinNetworks"]["USDT"] } }))}><option value="BNB">BNB</option><option value="ETH">ETH</option><option value="TRX">TRX</option></select></span></label>
          <label className={styles.formRow}><span>USDC</span><span className={styles.stableFields}><input aria-label="USDC balance" type="number" inputMode="decimal" min="0" step="any" value={draftBalances.USDC ?? "0"} onChange={(event) => updateBalance("USDC", event.target.value)} /><select aria-label="USDC network" value={draft.stablecoinNetworks.USDC} onChange={(event) => setDraft((current) => ({ ...current, stablecoinNetworks: { ...current.stablecoinNetworks, USDC: event.target.value as LedgerWalletSettings["stablecoinNetworks"]["USDC"] } }))}><option value="TRX">TRX</option><option value="ETH">ETH</option><option value="SOL">SOL</option></select></span></label>
          <label className={styles.formRow}><span>Currency</span><select aria-label="Currency" value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value as CurrencyCode }))}>{ledgerCurrencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.label}</option>)}</select></label>
          <label className={styles.formRow}><span>API Key</span><input type="password" value={draft.marketApiKey} onChange={(event) => { setDraft((current) => ({ ...current, marketApiKey: event.target.value.slice(0, 180) })); setError(""); setSaved(false); }} autoComplete="off" aria-label="Optional CoinGecko API key" placeholder="Optional CoinGecko API key" /></label>
          <label className={styles.formRow}><span>Pro Key</span><span className={styles.checkboxRow}><input aria-label="Pro market details" type="checkbox" checked={draft.proKeyEnabled} onChange={(event) => setDraft((current) => ({ ...current, proKeyEnabled: event.target.checked }))} /><span>Show expanded market data</span></span></label>
        </div>

        <p className={styles.sectionCaption}>Quick actions</p>
        <div className={styles.themeChoice} role="radiogroup" aria-label="Quick action order">
          {(["receive-first", "send-first"] as const).map((preference) => <button key={preference} type="button" role="radio" aria-checked={draft.actionPreference === preference} onClick={() => setDraft((current) => ({ ...current, actionPreference: preference }))} className={draft.actionPreference === preference ? styles.choiceActive : ""}>{preference === "receive-first" ? "Receive first" : "Send first"}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={onAccounts} className={styles.dashedButton}>Manage accounts</button><button type="button" onClick={onSecurity} className={styles.dashedButton}>Security</button></div>

        {(["solana", "ethereum"] as const).map((network) => {
          const customTokens = draft.customTokens.filter((token) => token.network === network);
          return <section key={network}><p className={styles.sectionCaption}>Custom tokens ({network})</p>{customTokens.length ? <div>{customTokens.map((token) => <div key={token.id} className={styles.miniToken}><span><strong>{token.name} ({token.symbol})</strong><small>{token.contractAddress}</small></span><button type="button" onClick={() => setDraft((current) => ({ ...current, customTokens: current.customTokens.filter((item) => item.id !== token.id) }))} aria-label={`Remove ${token.name}`} className={styles.removeToken}><X size={16} /></button></div>)}</div> : null}<button type="button" onClick={() => { setAddingNetwork(network); setError(""); setSaved(false); }} className={styles.dashedButton}>+ Add {network === "solana" ? "SOL" : "ETH"} token by contract address</button></section>;
        })}

        <section>
          <p className={styles.sectionCaption}>Appearance</p>
          <div className={styles.themeChoice} role="radiogroup" aria-label="Theme">
            {(["dark", "light"] as const).map((scheme) => <button key={scheme} type="button" role="radio" aria-checked={draft.colorScheme === scheme} onClick={() => setDraft((current) => ({ ...current, colorScheme: scheme }))} className={draft.colorScheme === scheme ? styles.choiceActive : ""}>{scheme === "dark" ? "Dark" : "Light"}</button>)}
          </div>
          <label className={`${styles.formRow} mt-3`}><span>Language</span><select value="en" disabled aria-label="Language"><option value="en">EN — English</option></select></label>
        </section>

        {error ? <p role="alert" className={`${styles.sheetMessage} ${styles.sheetError}`}>{error}</p> : null}
        {saved ? <p role="status" className={`${styles.sheetMessage} ${styles.sheetSuccess}`}>Portfolio settings saved for this account.</p> : null}
          </div>
          <footer className={styles.sheetFooter}><button type="submit" disabled={saving} className={styles.primaryButton}>{saving ? "Saving…" : "Save"}</button></footer>
        </form>

        {addingNetwork ? <div className={styles.sheetBackdrop} role="presentation"><button type="button" aria-label="Close custom token form" className={styles.sheetDismiss} onClick={() => setAddingNetwork(null)} /><form onSubmit={addCustomToken} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setAddingNetwork(null); } }} className={`${styles.sheet} ${styles.transactionSheet}`} role="dialog" aria-modal="true" aria-labelledby="ledger-custom-token-title"><header className={styles.sheetHeader}><div><p className={styles.sectionTitle}>{addingNetwork}</p><h2 id="ledger-custom-token-title">Add custom token</h2></div><button type="button" onClick={() => setAddingNetwork(null)} aria-label="Close" className={styles.closeButton}><X size={20} /></button></header><div className={styles.sheetBody}><div className={styles.customTokenForm}><input autoFocus required value={tokenName} onChange={(event) => setTokenName(event.target.value)} aria-label="Custom token name" placeholder="Token name" /><input required value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value.toUpperCase())} aria-label="Custom token symbol" placeholder="Symbol" maxLength={10} /><input required value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} aria-label="Custom token contract address" placeholder={addingNetwork === "ethereum" ? "0x… contract address" : "Solana base58 token address"} autoCapitalize="none" autoCorrect="off" spellCheck={false} /><input value={tokenPrice} onChange={(event) => setTokenPrice(event.target.value)} aria-label="Custom token display price" type="number" min="0" step="any" inputMode="decimal" placeholder="Display price (USD)" />{error ? <p role="alert" className={`${styles.sheetMessage} ${styles.sheetError}`}>{error}</p> : null}<button type="submit" className={styles.primaryButton}>Add to settings</button></div></div></form></div> : null}
      </section>
    </div>
  );
}

type ManualTransactionInput = {
  clientRequestId: string;
  type: "receive" | "send";
  symbol: string;
  amount: number;
  date: string;
};

function AddTransactionSheet({ tokens, onSubmit, onClose }: { tokens: WalletToken[]; onSubmit: (input: ManualTransactionInput) => Promise<string>; onClose: () => void }) {
  const [type, setType] = useState<"receive" | "send">("receive");
  const [symbol, setSymbol] = useState(tokenForSymbol(tokens, "BTC")?.symbol ?? tokens[0]?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const requestId = useRef(createId("ledger-manual"));
  const dialogRef = useDialogLifecycle(onClose);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const numericAmount = Number(amount);
    const timestamp = new Date(`${date}T${time}`);
    if (!symbol) return setError("Choose a crypto asset.");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter an amount greater than zero.");
    const precision = walletAssetDecimals(symbol) ?? 8;
    const normalizedInput = amount.trim();
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalizedInput)) return setError("Enter the amount as a standard decimal number.");
    const fractionLength = normalizedInput.split(".")[1]?.length ?? 0;
    if (fractionLength > precision) return setError(`${symbol} supports up to ${precision} decimal places.`);
    if (!Number.isFinite(timestamp.getTime())) return setError("Enter a valid date and time.");
    submittingRef.current = true;
    setSubmitting(true);
    setSaved(false);
    setError("");
    try {
      const result = await onSubmit({ clientRequestId: requestId.current, type, symbol, amount: normalizedAssetAmount(numericAmount, symbol), date: timestamp.toISOString() });
      if (result) {
        setError(result);
      } else {
        setSaved(true);
        setAmount("");
        requestId.current = createId("ledger-manual");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.sheetBackdrop} role="presentation">
      <button type="button" disabled={submitting} className={styles.sheetDismiss} aria-label="Close Add Transaction" onClick={onClose} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ledger-add-transaction-title" data-testid="ledger-add-transaction-sheet" className={`${styles.sheet} ${styles.transactionSheet}`}>
        <header className={styles.sheetHeader}><h2 id="ledger-add-transaction-title">Add Transaction</h2><button type="button" data-dialog-initial-focus disabled={submitting} className={styles.closeButton} aria-label="Close" onClick={onClose}><X size={21} /></button></header>
        <form onSubmit={submit} className={styles.sheetForm}>
          <div className={styles.sheetBody}>
            <div className={styles.formRow}><span>Type</span><div className={styles.transactionType} role="radiogroup" aria-label="Transaction type">{(["receive", "send"] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={type === value} className={type === value ? styles.choiceActive : ""} onClick={() => { setType(value); setError(""); }}>{value === "receive" ? "Received" : "Sent"}</button>)}</div></div>
            <label className={styles.formRow}><span>Crypto</span><select aria-label="Transaction crypto" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{tokens.filter((token) => token.price > 0).map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol} — {token.name}</option>)}</select></label>
            <label className={styles.formRow}><span>Amount</span><input aria-label="Transaction amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(event) => { setAmount(event.target.value); setError(""); setSaved(false); }} placeholder="0.00" /></label>
            <label className={styles.formRow}><span>Date</span><input aria-label="Transaction date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className={styles.formRow}><span>Time</span><input aria-label="Transaction time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
            {error ? <p role="alert" className={`${styles.sheetMessage} ${styles.sheetError}`}>{error}</p> : null}
            {saved ? <p role="status" className={`${styles.sheetMessage} ${styles.sheetSuccess}`}>Transaction added to this Larpz Wallet account.</p> : null}
          </div>
          <footer className={styles.sheetFooter}><button type="submit" disabled={submitting} className={styles.primaryButton}>{submitting ? "Adding…" : "Add Transaction"}</button></footer>
        </form>
      </section>
    </div>
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
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const fromToken = tokenForSymbol(tradable, from) ?? defaultFrom;
  const toToken = tokenForSymbol(tradable, to) ?? defaultTo;
  const numericAmount = Number(amount);
  const output = fromToken && toToken && Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * fromToken.price / toToken.price * 0.997
    : 0;
  const canSwap = Boolean(fromToken && toToken && fromToken.symbol !== toToken.symbol && numericAmount > 0 && numericAmount <= fromToken.balance);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromToken || !toToken || !canSwap || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (await onSwap(fromToken.symbol, toToken.symbol, numericAmount)) setAmount("");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="EXCHANGE" title="Swap" onHome={onHome} />
      <form onSubmit={submit} className="space-y-3">
        <section className="rounded-3xl border border-white/8 bg-[#171717] p-5">
          <div className="flex items-center justify-between text-sm font-semibold text-white/55"><span>You pay</span><button type="button" onClick={() => setAmount(String(fromToken?.balance ?? 0))} className="min-h-11 min-w-11 text-[#b8a5ff]">Max</button></div>
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

        <button type="submit" disabled={!canSwap || submitting} className="w-full rounded-2xl bg-[#b8a5ff] py-4 text-base font-bold text-[#15101e] transition enabled:hover:bg-[#c8baff] disabled:cursor-not-allowed disabled:opacity-35">
          {submitting ? "Swapping…" : !numericAmount ? "Enter an amount" : numericAmount > (fromToken?.balance ?? 0) ? "Insufficient balance" : "Review swap"}
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
  const [submitting, setSubmitting] = useState(false);
  const [withdrawingSymbol, setWithdrawingSymbol] = useState("");
  const pendingRef = useRef(false);
  const token = tokenForSymbol(eligible, symbol) ?? firstAvailable;
  const activePositions = Object.entries(positions).filter(([, value]) => value > 0);
  const annualRate = symbol === "USDT" || symbol === "USDC" ? 4.8 : symbol === "SOL" ? 6.1 : 3.2;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!token || pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    try {
      if (await onStart(token.symbol, numericAmount)) setAmount("");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  }

  async function withdraw(positionSymbol: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setWithdrawingSymbol(positionSymbol);
    try {
      await onWithdraw(positionSymbol);
    } finally {
      pendingRef.current = false;
      setWithdrawingSymbol("");
    }
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
              <button type="button" disabled={Boolean(withdrawingSymbol) || submitting} onClick={() => void withdraw(positionSymbol)} className="min-h-11 rounded-full border border-white/15 px-3 py-2 text-xs font-bold disabled:opacity-45">{withdrawingSymbol === positionSymbol ? "Withdrawing…" : "Withdraw"}</button>
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
          <button type="button" onClick={() => setAmount(String(token?.balance ?? 0))} className="min-h-11 min-w-11 text-sm font-bold text-[#b8a5ff]">MAX</button>
        </div>
        <p className="mt-3 text-sm text-white/45">Available: {formatAmount(token?.balance ?? 0, token?.symbol ?? "")} {token?.symbol}</p>
        <button type="submit" disabled={submitting || Boolean(withdrawingSymbol)} className="mt-5 w-full rounded-2xl bg-[#b8a5ff] py-4 font-bold text-[#15101e] disabled:opacity-45">{submitting ? "Allocating…" : "Start earning"}</button>
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

function NotificationsScreen({ records, onHome, onHistory }: { records: WalletActivity[]; onHome: () => void; onHistory: () => void }) {
  return (
    <main className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="LARPZ WALLET" title="Notifications" onHome={onHome} />
      <section className="space-y-2">
        {records.length ? records.slice(0, 8).map((record) => <button key={record.id} type="button" onClick={onHistory} className="flex min-h-[4.75rem] w-full items-center gap-3 rounded-2xl border border-white/8 bg-[#17141c] px-4 text-left"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#342a40]"><Bell size={18} /></span><span className="min-w-0 flex-1"><strong className="block truncate">{record.type === "receive" ? "Received" : "Sent"} {record.tokenSymbol}</strong><span className="mt-1 block truncate text-sm text-white/45">{new Date(record.date).toLocaleString("en-US")}</span></span><ChevronRight size={18} className="text-white/40" /></button>) : <p className="rounded-2xl border border-white/8 bg-[#17141c] px-5 py-12 text-center text-sm text-white/50">You have no notifications yet.</p>}
      </section>
    </main>
  );
}

function AssetsScreen({ tokens, currency, rate, onToken, onHome }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHome: () => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTokens = [...tokens]
    .filter((token) => !normalizedQuery || `${token.name} ${token.symbol}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name));

  return (
    <main className="space-y-5 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="PORTFOLIO" title="All assets" onHome={onHome} />
      <label className="flex min-h-14 items-center gap-3 rounded-full border border-white/10 bg-[#1d1d1f] px-4 focus-within:border-[#a995f2]">
        <Search className="size-5 shrink-0 text-white/45" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search all assets" placeholder="Search assets" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/35" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear asset search" className="grid size-11 shrink-0 place-items-center rounded-full"><X size={18} /></button> : null}
      </label>
      <div data-testid="ledger-all-assets" className="space-y-1 rounded-2xl bg-white/[0.025] p-3">{filteredTokens.length ? filteredTokens.map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />) : <p className="px-4 py-12 text-center text-sm text-white/45">No assets match “{query}”.</p>}</div>
    </main>
  );
}

function AllocationScreen({ tokens, positions, currency, rate, onToken, onHome }: { tokens: WalletToken[]; positions: Record<string, number>; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHome: () => void }) {
  const colors = ["#2db6c4", "#f2aa3d", "#f4f1f6", "#8e76dc", "#de6c7b", "#58a97a", "#6e93dc"];
  const entries = tokens
    .map((token) => {
      const amount = token.balance + (positions[token.symbol] ?? 0);
      return { token, amount, value: amount * token.price * rate };
    })
    .filter((entry) => entry.amount > 0 && entry.token.price > 0)
    .sort((a, b) => b.value - a.value);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  let offset = 0;
  const gradient = entries.length ? `conic-gradient(${entries.map((entry, index) => {
    const start = offset;
    offset += total > 0 ? entry.value / total * 100 : 0;
    return `${colors[index % colors.length]} ${start.toFixed(2)}% ${offset.toFixed(2)}%`;
  }).join(", ")})` : "conic-gradient(rgba(255,255,255,.09) 0 100%)";

  return (
    <main data-testid="ledger-allocation-detail" className="space-y-6 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <ScreenHeader eyebrow="PORTFOLIO" title="Allocation" onHome={onHome} />
      <section className={styles.allocationHero}>
        <span className={styles.allocationDetailDonut} style={{ background: gradient }} />
        <div><span className="text-xs font-bold uppercase tracking-[0.14em] text-white/45">Portfolio value</span><SplitMoney amount={total} currency={currency} className="mt-2 text-2xl font-bold" /></div>
      </section>
      <section className="space-y-1">
        {entries.length ? entries.map((entry, index) => {
          const percent = total > 0 ? entry.value / total * 100 : 0;
          return <button key={entry.token.id} type="button" onClick={() => onToken(entry.token)} className="flex min-h-[4.75rem] w-full items-center gap-3 border-b border-white/8 px-1 text-left"><TokenIcon token={entry.token} /><span className="min-w-0 flex-1"><strong className="block truncate">{entry.token.name}</strong><span className="mt-1 flex items-center gap-2 text-sm text-white/45"><i className="size-2 rounded-full" style={{ background: colors[index % colors.length] }} />{percent.toFixed(2)}%</span></span><span className="max-w-[48%] text-right"><strong className="block truncate">{formatMoney(entry.value, currency)}</strong><span className="mt-1 block truncate text-sm text-white/45">{formatAmount(entry.amount, entry.token.symbol)} {entry.token.symbol}</span></span></button>;
        }) : <p className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-14 text-center text-sm text-white/45">Add an asset to see your allocation breakdown.</p>}
      </section>
    </main>
  );
}

function HistoryScreen({ records, tokens, currency, rate, onHome, onAdd }: { records: WalletActivity[]; tokens: WalletToken[]; currency: CurrencyCode; rate: number; onHome: () => void; onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "send" | "receive">("all");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecords = records.filter((record) => (filter === "all" || record.type === filter) && (!normalizedQuery || `${record.tokenSymbol} ${record.counterpartyLabel} ${record.note}`.toLowerCase().includes(normalizedQuery)));
  const groups = filteredRecords.reduce<Record<string, WalletActivity[]>>((result, record) => {
    const key = formatHistoryDate(record.date);
    result[key] ??= [];
    result[key].push(record);
    return result;
  }, {});

  return (
    <main className="space-y-5 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-7">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.18em] text-white/45">ACTIVITY</p><h1 className="mt-1 text-3xl font-bold">Transaction history</h1></div><button type="button" aria-label="Add transaction" onClick={onAdd} className="flex size-11 items-center justify-center rounded-full bg-[#a995f2] text-black"><Plus size={22} /></button></div>
      <label className="flex min-h-14 items-center gap-3 rounded-full border border-white/10 bg-[#1d1d1f] px-4 focus-within:border-[#a995f2]"><Search className="size-5 shrink-0 text-white/45" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search transaction history" placeholder="Search transactions" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/35" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear transaction search" className="grid size-11 shrink-0 place-items-center rounded-full"><X size={18} /></button> : null}</label>
      <div className={styles.historyFilters} role="group" aria-label="Filter transaction history">{(["all", "receive", "send"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={filter === value ? styles.choiceActive : ""}>{value === "all" ? "All" : value === "receive" ? "Received" : "Sent"}</button>)}</div>
      {Object.keys(groups).length > 0 ? Object.entries(groups).map(([date, items]) => <section key={date}><div className="rounded-xl bg-[#292929] px-4 py-3 text-sm font-bold text-white/70">{date}</div><div className="divide-y divide-white/8">{items.map((record) => <HistoryRow key={record.id} record={record} currency={currency} rate={rate} tokens={tokens} />)}</div></section>) : <p className="rounded-xl bg-white/[0.04] px-4 py-5 text-sm text-white/50">No transactions yet.</p>}
      <button type="button" onClick={onHome} className="w-full rounded-full border border-white/25 py-3 text-sm font-bold">Back to home</button>
    </main>
  );
}

function LedgerAccountLoading({ colorScheme }: { colorScheme: LedgerWalletSettings["colorScheme"] }) {
  return (
    <div data-testid="ledger-wallet-loading" data-ledger-color-scheme={colorScheme} className={`${styles.shell} ledger-wallet-font font-sans`}>
      <main className={`${styles.frame} ${styles.loadingScreen}`} role="status" aria-label="Loading Larpz Wallet account">
        <div className={styles.ambient} />
        <div className={styles.loadingHeader}><span /><span /></div>
        <div className={styles.loadingBalance} />
        <div className={styles.loadingChart} />
        <div className={styles.loadingActions}>{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
        <div className={styles.loadingList}>{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div>
        <span className="sr-only">Loading account balances and activity…</span>
      </main>
    </div>
  );
}

export function LedgerWallet() {
  const runtime = useWalletRuntime();
  const currentRuntimeAccountId = runtime.currentAccount?.id;
  const [view, setView] = useState<LedgerView>("home");
  const [activeTab, setActiveTab] = useState<BottomTab>("Wallet");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [tokens, setTokens] = useState<WalletToken[]>(() => mergeCanonicalWalletCatalogue([]));
  const tokensRef = useRef(tokens);
  const latestMarketSnapshot = useRef<LiveMarketSnapshot>(emptyLiveMarketSnapshot);
  const [records, setRecords] = useState<WalletActivity[]>([]);
  const [settings, setSettings] = useState<LedgerWalletSettings>(defaultLedgerWalletSettings);
  const [hydratedAccountId, setHydratedAccountId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [preferredSwapSymbol, setPreferredSwapSymbol] = useState<string>();
  const [preferredBuySymbol, setPreferredBuySymbol] = useState<string>();
  const [features, setFeatures] = useState<LedgerFeatures>(defaultLedgerFeatures);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStart = useRef<number | null>(null);
  const balanceOperationPending = useRef(false);

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
    const previousWalletTheme = document.documentElement.dataset.walletTheme;
    document.documentElement.dataset.walletTheme = "ledger";
    const timeout = window.setTimeout(() => {
      const storedTokens = readStorage<WalletToken[]>(LEDGER_TOKENS_KEY, []);
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(storedTokens),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
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
      if (previousWalletTheme) document.documentElement.dataset.walletTheme = previousWalletTheme;
      else delete document.documentElement.dataset.walletTheme;
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
    if (hydratedAccountId !== runtime.currentAccount.id) return;
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
  }, [hydratedAccountId, runtime.currentAccount, runtime.state, settings.customTokens]);

  useEffect(() => {
    if (!currentRuntimeAccountId) return;
    const accountId = currentRuntimeAccountId;
    const timeoutId = window.setTimeout(() => {
      const settingsKey = ledgerSettingsStorageKey(accountId);
      const hasScopedSettings = window.localStorage.getItem(settingsKey) !== null;
      const accountSettings = normalizeLedgerWalletSettings(hasScopedSettings
        ? readStorage<unknown>(settingsKey, defaultLedgerWalletSettings)
        : readStorage<unknown>(LEDGER_SETTINGS_KEY, defaultLedgerWalletSettings));
      setSettings(accountSettings);
      if (!hasScopedSettings) writeStorage(settingsKey, accountSettings);
      setFeatures(readStorage<LedgerFeatures>(`${LEDGER_FEATURES_KEY}:${accountId}`, defaultLedgerFeatures));
      const storageKey = ledgerActivityStorageKey(accountId);
      const hasScopedHistory = window.localStorage.getItem(storageKey) !== null;
      const accountRecords = hasScopedHistory
        ? readStorage<WalletActivity[]>(storageKey, [])
        : readStorage<WalletActivity[]>(LEDGER_TRANSACTIONS_KEY, []);
      setRecords(accountRecords);
      if (!hasScopedHistory) writeStorage(storageKey, accountRecords);
      setHydratedAccountId(accountId);
      setSettingsOpen(false);
      setTransactionOpen(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [currentRuntimeAccountId]);

  const currency = settings.currency;
  const selectedCurrency = ledgerCurrencies.find((item) => item.code === currency) ?? ledgerCurrencies[0];
  const total = tokens.reduce((sum, token) => sum + (token.balance + (features.earnPositions[token.symbol] ?? 0)) * token.price * selectedCurrency.rate, 0);
  const selectedToken = selectedSymbol ? tokenForSymbol(tokens, selectedSymbol) ?? null : null;
  const sharedRecords = useMemo(() => runtime.state && runtime.currentAccount
    ? transactionsForAccount(runtime.state, runtime.currentAccount.id).map((transaction) => walletActivityFromTransfer(transaction, runtime.currentAccount!.id))
    : [], [runtime.currentAccount, runtime.state]);
  const operationRecords = useMemo(() => runtime.state && runtime.currentAccount
    ? runtime.state.operations
      .filter((operation) => operation.walletId === "ledger" && operation.accountId === runtime.currentAccount!.id)
      .flatMap((operation) => operation.activities)
    : [], [runtime.currentAccount, runtime.state]);
  const activityRecords = useMemo(() => {
    const merged = new Map<string, WalletActivity>();
    for (const record of [...records, ...sharedRecords, ...operationRecords]) merged.set(record.id, record);
    return [...merged.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [operationRecords, records, sharedRecords]);

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

  async function applyLedgerBalanceOperation(clientRequestId: string, deltas: Record<string, number>, activities: WalletActivity[]) {
    if (balanceOperationPending.current) {
      return { ok: false as const, error: "Another account update is already in progress." };
    }
    balanceOperationPending.current = true;
    try {
      const operation = await runtime.applyBalanceOperation({ clientRequestId, deltas, activities });
      const nextTokens = tokens.map((token) => ({ ...token, balance: normalizedAssetAmount(token.balance + (operation.deltas[token.symbol] ?? 0), token.symbol) }));
      persistTokens(nextTokens);
      const activityIds = new Set(operation.activities.map((activity) => activity.id));
      persistActivity([...operation.activities, ...records.filter((record) => !activityIds.has(record.id))]);
      return { ok: true as const, operation };
    } catch (caught) {
      return { ok: false as const, error: caught instanceof Error ? caught.message : "The account could not be updated." };
    } finally {
      balanceOperationPending.current = false;
    }
  }

  function goHome() {
    setView("home");
    setActiveTab("Wallet");
  }

  function openSwap(symbol?: string) {
    setSelectedSymbol(null);
    setPreferredSwapSymbol(symbol);
    setView("swap");
    setActiveTab("Wallet");
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
    setActiveTab("Wallet");
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
    if (event.target instanceof Element && event.target.closest("[data-testid='ledger-portfolio-chart']")) return;
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

  async function saveSettings(nextSettings: LedgerWalletSettings, balances: Record<string, number>) {
    const normalized = normalizeLedgerWalletSettings(nextSettings);
    const validationError = validateLedgerSettings(normalized);
    if (validationError) {
      notify(validationError);
      return false;
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
    const balancedTokens = nextTokens.map((token) => ({ ...token, balance: balances[token.symbol] ?? token.balance }));
    runtime.updateMarketAssets(balancedTokens);
    if (!await updateRuntimeBalances(balancedTokens)) return false;
    setSettings(normalized);
    writeStorage(ledgerSettingsStorageKey(runtime.currentAccount?.id), normalized);
    notify("Portfolio saved");
    return true;
  }

  async function completeManualTransaction(input: ManualTransactionInput) {
    const token = tokenForSymbol(tokens, input.symbol);
    if (!token) return "Choose a supported crypto asset.";
    if (!Number.isFinite(input.amount) || input.amount <= 0) return "Enter an amount greater than zero.";
    const precision = walletAssetDecimals(input.symbol) ?? 8;
    if (normalizedAssetAmount(input.amount, input.symbol) !== input.amount) return `${input.symbol} supports up to ${precision} decimal places.`;
    if (input.type === "send" && input.amount > token.balance) return `Insufficient ${input.symbol}.`;
    const record: WalletActivity = {
      id: `activity:${input.clientRequestId}`,
      type: input.type,
      tokenSymbol: input.symbol,
      amount: input.amount,
      counterpartyLabel: "Manual portfolio entry",
      date: input.date,
      status: "completed",
      note: "INTERNAL DEMO TRANSACTION — NO REAL FUNDS",
    };
    const result = await applyLedgerBalanceOperation(input.clientRequestId, { [input.symbol]: input.type === "receive" ? input.amount : -input.amount }, [record]);
    if (!result.ok) return result.error;
    notify(`${input.type === "receive" ? "Received" : "Sent"} ${formatAmount(input.amount, input.symbol)} ${input.symbol}`);
    return "";
  }

  async function completeBuy(symbol: string, amount: number) {
    const token = tokenForSymbol(tokens, symbol);
    if (!token || !Number.isFinite(amount) || amount <= 0) {
      notify("Choose an asset and enter a valid amount");
      return false;
    }
    const creditedAmount = normalizedAssetAmount(amount, symbol);
    const clientRequestId = createId("ledger-buy");
    const record: WalletActivity = {
      id: `activity:${clientRequestId}`,
      type: "receive",
      tokenSymbol: symbol,
      amount: creditedAmount,
      counterpartyLabel: "Purchase",
      date: new Date().toISOString(),
      status: "completed",
      note: "CREDIT — PURCHASE CONFIRMED",
    };
    const result = await applyLedgerBalanceOperation(clientRequestId, { [symbol]: creditedAmount }, [record]);
    if (!result.ok) {
      notify(result.error);
      return false;
    }
    notify(`${formatAmount(creditedAmount, symbol)} ${symbol} added to your account`);
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

    const debited = normalizedAssetAmount(amount, fromSymbol);
    const received = normalizedAssetAmount(amount * fromToken.price / toToken.price * 0.997, toSymbol);
    const clientRequestId = createId("ledger-swap");
    const timestamp = new Date().toISOString();
    const swapRecords: WalletActivity[] = [
      { id: `activity:${clientRequestId}:in`, type: "receive", tokenSymbol: toSymbol, amount: received, counterpartyLabel: `${fromSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
      { id: `activity:${clientRequestId}:out`, type: "send", tokenSymbol: fromSymbol, amount: debited, counterpartyLabel: `${toSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
    ];
    const result = await applyLedgerBalanceOperation(clientRequestId, { [fromSymbol]: -debited, [toSymbol]: received }, swapRecords);
    if (!result.ok) {
      notify(result.error);
      return false;
    }
    notify(`Swapped ${formatAmount(debited, fromSymbol)} ${fromSymbol} for ${formatAmount(received, toSymbol)} ${toSymbol}`);
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
    const allocated = normalizedAssetAmount(amount, symbol);
    const clientRequestId = createId("ledger-earn");
    const record: WalletActivity = { id: `activity:${clientRequestId}`, type: "send", tokenSymbol: symbol, amount: allocated, counterpartyLabel: "Larpz Earn", date: new Date().toISOString(), status: "completed", note: "INTERNAL EARN ALLOCATION" };
    const result = await applyLedgerBalanceOperation(clientRequestId, { [symbol]: -allocated }, [record]);
    if (!result.ok) {
      notify(result.error);
      return false;
    }
    persistFeatures({ ...features, earnPositions: { ...features.earnPositions, [symbol]: normalizedAssetAmount((features.earnPositions[symbol] ?? 0) + allocated, symbol) } });
    notify(`${formatAmount(allocated, symbol)} ${symbol} moved to Earn`);
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
    const returned = normalizedAssetAmount(amount, symbol);
    const clientRequestId = createId("ledger-withdraw");
    const record: WalletActivity = { id: `activity:${clientRequestId}`, type: "receive", tokenSymbol: symbol, amount: returned, counterpartyLabel: "Larpz Earn", date: new Date().toISOString(), status: "completed", note: "INTERNAL EARN REDEMPTION" };
    const result = await applyLedgerBalanceOperation(clientRequestId, { [symbol]: returned }, [record]);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    persistFeatures({ ...features, earnPositions: { ...features.earnPositions, [symbol]: 0 } });
    notify(`${formatAmount(returned, symbol)} ${symbol} returned to your balance`);
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
    if (tab === "Wallet") {
      goHome();
      return;
    }
    if (tab === "My Ledger") {
      setSettingsOpen(true);
      return;
    }
    setView(tab === "Earn" ? "earn" : "market");
  }

  if (!runtime.state || !runtime.currentAccount || hydratedAccountId !== runtime.currentAccount.id) {
    return <LedgerAccountLoading colorScheme={settings.colorScheme} />;
  }

  return (
    <div data-testid="ledger-wallet" data-ledger-color-scheme={settings.colorScheme} className={`${styles.shell} ledger-wallet-font font-sans`}>
      <div
        className={styles.frame}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className={styles.ambient} />
        <div className="relative">
          {view === "home" ? <HomeScreen tokens={tokens} records={activityRecords} accounts={runtime.state?.wallets.ledger.accounts ?? []} currentAccountId={runtime.currentAccount?.id} currency={currency} rate={selectedCurrency.rate} total={total} earnPositions={features.earnPositions} actionPreference={settings.actionPreference} marketApiKey={settings.marketApiKey} refreshing={refreshing} pullDistance={pullDistance} onSettings={() => setSettingsOpen(true)} onRefresh={triggerRefresh} onReceive={() => runtime.openReceive()} onSend={() => runtime.openTransfer()} onBuy={() => openBuy()} onExplore={() => { setView("market"); setActiveTab("Discover"); }} onSwap={() => openSwap()} onEarn={() => { setView("earn"); setActiveTab("Earn"); }} onCard={() => { setView("card"); setActiveTab("Wallet"); }} onNotifications={() => setView("notifications")} onAddTransaction={() => setTransactionOpen(true)} onAssets={() => { setSelectedSymbol(null); setView("assets"); }} onHistory={() => setView("history")} onAllocation={() => setView("allocation")} onAccounts={runtime.openAccounts} onToken={openAsset} /> : null}
          {view === "assets" && !selectedToken ? <AssetsScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} onToken={openAsset} onHome={goHome} /> : null}
          {view === "assets" && selectedToken ? <AssetDetailScreen token={selectedToken} tokens={tokens} accounts={runtime.state?.wallets.ledger.accounts ?? []} currentAccountId={runtime.currentAccount?.id} currency={currency} rate={selectedCurrency.rate} marketApiKey={settings.marketApiKey} onSelectToken={setSelectedSymbol} onBack={() => { setSelectedSymbol(null); goHome(); }} onTransfer={() => runtime.openTransfer(selectedToken.symbol)} onReceive={() => runtime.openReceive()} onSwap={() => openSwap(selectedToken.symbol)} onBuy={() => openBuy(selectedToken.symbol)} onAccounts={runtime.openAccounts} onSettings={() => setSettingsOpen(true)} /> : null}
          {view === "allocation" ? <AllocationScreen tokens={tokens} positions={features.earnPositions} currency={currency} rate={selectedCurrency.rate} onToken={openAsset} onHome={goHome} /> : null}
          {view === "history" ? <HistoryScreen records={activityRecords} tokens={tokens} currency={currency} rate={selectedCurrency.rate} onHome={goHome} onAdd={() => setTransactionOpen(true)} /> : null}
          {view === "market" ? <MarketScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} showAdvanced={settings.proKeyEnabled} onToken={openAsset} onHome={goHome} /> : null}
          {view === "search" ? <SearchScreen tokens={tokens} records={activityRecords} currency={currency} rate={selectedCurrency.rate} onToken={openAsset} onHistory={() => setView("history")} onHome={goHome} /> : null}
          {view === "buy" ? <BuyScreen tokens={tokens} preferredSymbol={preferredBuySymbol} currency={currency} rate={selectedCurrency.rate} onHome={goHome} onBuy={completeBuy} /> : null}
          {view === "perpetuals" ? <PerpetualsScreen tokens={tokens} onToken={openAsset} onHome={goHome} /> : null}
          {view === "swap" ? <SwapScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} initialFrom={preferredSwapSymbol} onHome={goHome} onSwap={completeSwap} /> : null}
          {view === "earn" ? <EarnScreen tokens={tokens} positions={features.earnPositions} onHome={goHome} onStart={startEarning} onWithdraw={withdrawEarnings} /> : null}
          {view === "card" ? <CardScreen total={total} currency={currency} frozen={features.cardFrozen} limit={features.cardLimit} records={activityRecords} onHome={goHome} onToggleFrozen={toggleCardFrozen} onSaveLimit={saveCardLimit} onHistory={() => setView("history")} /> : null}
          {view === "notifications" ? <NotificationsScreen records={activityRecords} onHome={goHome} onHistory={() => setView("history")} /> : null}
        </div>

        {!selectedToken && ["home", "earn", "market", "card"].includes(view) ? <BottomNav active={activeTab} onChange={changeBottomTab} onTransfer={() => runtime.openTransfer()} /> : null}

        {settingsOpen ? <SettingsScreen settings={settings} tokens={tokens} onSave={saveSettings} onSecurity={runtime.openSecurity} onAccounts={runtime.openAccounts} onClose={() => { setSettingsOpen(false); setActiveTab(view === "earn" ? "Earn" : view === "market" ? "Discover" : "Wallet"); }} /> : null}
        {transactionOpen ? <AddTransactionSheet tokens={tokens} onSubmit={completeManualTransaction} onClose={() => setTransactionOpen(false)} /> : null}

        {notice ? <div role="status" className={styles.notice}>{notice}</div> : null}
      </div>
    </div>
  );
}
