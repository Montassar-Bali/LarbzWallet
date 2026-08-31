"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Home,
  Link2,
  Moon,
  Palette,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { defaultTokens, liveMarketSymbols } from "@/config/tokens";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import { useWalletRuntime } from "@/components/wallet/wallet-runtime";
import { tokensForWalletAccount, transactionsForAccount, walletLedgerEvent } from "@/lib/wallet-ledger";
import {
  applyLiveMarketSnapshot,
  emptyLiveMarketSnapshot,
  mergeCanonicalWalletCatalogue,
  type LiveMarketSnapshot,
} from "@/lib/wallet-market";

type TrustTab = "home" | "swap" | "discover" | "browser";
type Appearance = "light" | "dark";
type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD";
type TransactionKind = "send" | "receive";

type TrustProfile = {
  walletName: string;
  currency: CurrencyCode;
  appearance: Appearance;
};

const TRUST_TOKENS_KEY = "larpz_trust_wallet_tokens";
const TRUST_TRANSACTIONS_KEY = "larpz_trust_wallet_transactions";
const TRUST_PROFILE_KEY = "larpz_trust_wallet_profile";

const defaultTrustProfile: TrustProfile = {
  walletName: "Main wallet",
  currency: "USD",
  appearance: "light",
};

const currencyRates: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
};

const currencySymbols: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
};

const tokenColors: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#8796e8",
  BNB: "#f0b90b",
  MATIC: "#8247e5",
  USDC: "#2775ca",
  USDT: "#26a17b",
  SOL: "#6d5cff",
  SUI: "#4da2ff",
};

const tokenMarks: Record<string, string> = {
  BTC: "₿",
  ETH: "◆",
  BNB: "◆",
  MATIC: "⬡",
  USDC: "$",
  USDT: "₮",
  SOL: "≡",
  SUI: "S",
};

const actionItems: { label: string; icon: LucideIcon }[] = [
  { label: "Send", icon: Send },
  { label: "Receive", icon: ArrowDownLeft },
  { label: "Buy", icon: Plus },
  { label: "Earn", icon: Sparkles },
];

const navItems: { id: TrustTab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "swap", label: "Swap", icon: RefreshCw },
  { id: "discover", label: "Discover", icon: Sparkles },
  { id: "browser", label: "Browser", icon: Globe },
];

const chartPoints =
  "0,115 24,108 48,123 72,98 96,105 120,83 144,95 168,72 192,87 216,62 240,76 264,49 288,68 312,38 336,55 360,31 384,45";

function formatMoney(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value * currencyRates[currency]);
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getTokenMark(symbol: string) {
  return tokenMarks[symbol] ?? symbol.slice(0, 1);
}

function TokenImage({
  token,
  size,
}: {
  token: Pick<WalletToken, "name" | "image">;
  size: "small" | "normal" | "large";
}) {
  const [failed, setFailed] = useState(false);
  if (!token.image || failed) return null;

  return (
    <Image
      src={token.image}
      alt={`${token.name} logo`}
      fill
      unoptimized
      sizes={size === "small" ? "32px" : size === "large" ? "56px" : "44px"}
      className="z-10 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function TokenIcon({
  token,
  size = "normal",
}: {
  token: Pick<WalletToken, "symbol" | "name" | "image">;
  size?: "small" | "normal" | "large";
}) {
  const sizes = {
    small: "h-8 w-8 text-xs",
    normal: "h-11 w-11 text-lg",
    large: "h-14 w-14 text-2xl",
  };

  return (
    <span
      className={"relative isolate grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white shadow-inner shadow-white/30 " + sizes[size]}
      style={{
        background:
          token.symbol === "SOL"
            ? "linear-gradient(145deg, #4d42c8, #d74fc5)"
            : tokenColors[token.symbol] ?? "#61708e",
      }}
    >
      <span aria-hidden="true">{getTokenMark(token.symbol)}</span>
      <TokenImage key={token.image} token={token} size={size} />
    </span>
  );
}

function Notice({ message, dark }: { message: string; dark: boolean }) {
  return (
    <div
      className={
        "fixed left-1/2 top-4 z-[90] w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 rounded-2xl px-4 py-3 text-center text-sm font-semibold shadow-2xl " +
        (dark ? "bg-[#29303d] text-white" : "bg-[#172d54] text-white")
      }
    >
      {message}
    </div>
  );
}

function ModalBackdrop({
  children,
  dark,
  onClose,
  label,
  align = "bottom",
}: {
  children: ReactNode;
  dark: boolean;
  onClose: () => void;
  label: string;
  align?: "bottom" | "center";
}) {
  return (
    <div
      className={
        "fixed inset-0 z-50 flex bg-black/60 p-3 backdrop-blur-sm " +
        (align === "center" ? "items-center justify-center" : "items-end justify-center")
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={label}
        className={
          "max-h-[94dvh] w-full max-w-[34rem] overflow-y-auto rounded-[2rem] border p-5 shadow-2xl sm:p-6 " +
          (dark
            ? "border-white/10 bg-[#171a21] text-white"
            : "border-[#e3e8f2] bg-white text-[#1d2433]")
        }
      >
        {children}
      </section>
    </div>
  );
}

function SectionHeading({
  children,
  action,
  dark,
}: {
  children: ReactNode;
  action?: ReactNode;
  dark: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className={"text-lg font-bold " + (dark ? "text-white" : "text-[#1d2433]")}>{children}</h2>
      {action}
    </div>
  );
}

function TrustTokenRow({
  token,
  currency,
  dark,
  onClick,
}: {
  token: WalletToken;
  currency: CurrencyCode;
  dark: boolean;
  onClick: () => void;
}) {
  const value = token.price * token.balance;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition active:scale-[.99] " +
        (dark ? "hover:bg-white/5" : "hover:bg-[#f4f7fb]")
      }
    >
      <TokenIcon token={token} />
      <span className="min-w-0 flex-1">
        <span className={"block truncate text-[15px] font-bold " + (dark ? "text-white" : "text-[#1d2433]")}>
          {token.name}
        </span>
        <span className={"mt-0.5 block text-xs " + (dark ? "text-white/45" : "text-[#7c879a]")}>
          {formatAmount(token.balance)} {token.symbol}
        </span>
      </span>
      <span className="text-right">
        <span className={"block text-[15px] font-bold " + (dark ? "text-white" : "text-[#1d2433]")}>
          {formatMoney(value, currency)}
        </span>
        <span className={"mt-0.5 block text-xs " + (token.change24h >= 0 ? "text-[#2caa73]" : "text-[#df5e70]")}>
          {token.change24h >= 0 ? "+" : ""}
          {token.change24h.toFixed(2)}%
        </span>
      </span>
      <ChevronRight className={"h-4 w-4 shrink-0 " + (dark ? "text-white/25" : "text-[#aab3c1]")} />
    </button>
  );
}

function WalletIdentity({
  profile,
  total,
  dark,
  balanceVisible,
  onToggleBalance,
  onAccounts,
  onCopyAddress,
  onReceive,
  onShare,
}: {
  profile: TrustProfile;
  total: number;
  dark: boolean;
  balanceVisible: boolean;
  onToggleBalance: () => void;
  onAccounts: () => void;
  onCopyAddress: () => void;
  onReceive: () => void;
  onShare: () => void;
}) {
  return (
    <>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAccounts}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#4d91f7] text-lg font-black text-white shadow-lg shadow-blue-500/20">
            T
          </span>
          <span className="min-w-0">
            <span className={"block truncate text-sm font-bold " + (dark ? "text-white" : "text-[#1d2433]")}>
              {profile.walletName}
            </span>
            <span className={"flex items-center gap-1 text-xs " + (dark ? "text-white/45" : "text-[#8c96a8]")}>
              Personal wallet <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          {[
            { label: "Copy wallet address", icon: Copy, action: onCopyAddress },
            { label: "Show wallet QR", icon: QrCode, action: onReceive },
            { label: "Share wallet link", icon: Link2, action: onShare },
          ].map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={action}
              className={
                "grid h-9 w-9 place-items-center rounded-full " +
                (dark ? "text-white/65 hover:bg-white/10" : "text-[#738096] hover:bg-[#eaf0f8]")
              }
            >
              <Icon className="h-[17px] w-[17px]" />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <p className={"text-[clamp(2.35rem,10vw,3.4rem)] font-black leading-none tracking-[-0.07em] " + (dark ? "text-white" : "text-[#1d2433]")}>
            {balanceVisible ? formatMoney(total, profile.currency) : "••••••"}
          </p>
          <p className={"mt-2 text-sm font-semibold " + (dark ? "text-[#e36d78]" : "text-[#e36d78]")}>
            -3.16% <span className={dark ? "text-white/40" : "text-[#8994a6]"}>Today</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleBalance}
          aria-label={balanceVisible ? "Hide wallet balance" : "Show wallet balance"}
          className={
            "grid h-10 w-10 place-items-center rounded-full " +
            (dark ? "text-white/60 hover:bg-white/10" : "text-[#7d899d] hover:bg-[#eaf0f8]")
          }
        >
          {balanceVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
      </div>
    </>
  );
}

function ActionButton({
  label,
  icon: Icon,
  dark,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  dark: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <span
        className={
          "grid h-14 w-full max-w-[5.25rem] place-items-center rounded-full shadow-sm transition active:scale-95 " +
          (dark ? "bg-[#242933] text-white" : "bg-white text-[#3d4a61] shadow-[#afbdd1]/35")
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className={"text-xs font-bold " + (dark ? "text-white/70" : "text-[#637087]")}>{label}</span>
    </button>
  );
}

function FundingBanner({
  dark,
  onDeposit,
  onDismiss,
}: {
  dark: boolean;
  onDeposit: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className={
        "relative mt-7 overflow-hidden rounded-3xl border p-4 " +
        (dark
          ? "border-[#3f4651] bg-gradient-to-br from-[#27313c] to-[#1b2028]"
          : "border-[#d8e4f5] bg-gradient-to-br from-[#eff7ff] to-[#ffffff]")
      }
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#62c7ff]/30 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 left-16 h-24 w-24 rounded-full bg-[#a9dcff]/30 blur-2xl" />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss funding banner"
        className={"absolute right-3 top-3 " + (dark ? "text-white/45" : "text-[#9aa8bb]")}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="relative flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ffcb73] via-[#8bd6e9] to-[#6378ec] text-2xl shadow-lg">
          ✦
        </div>
        <div className="min-w-0 pr-5">
          <p className={"text-sm font-black " + (dark ? "text-white" : "text-[#26344b]")}>Add funds from exchange</p>
          <p className={"mt-1 text-xs leading-5 " + (dark ? "text-white/55" : "text-[#738197]")}>
            Add funds to this wallet account
          </p>
          <button
            type="button"
            onClick={onDeposit}
            className={"mt-2 text-xs font-black " + (dark ? "text-[#70b5ff]" : "text-[#397dd4]")}
          >
            Deposit now <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative mt-4 flex justify-center gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className={"h-1.5 w-1.5 rounded-full " + (dot === 0 ? "bg-[#4f91ef]" : dark ? "bg-white/25" : "bg-[#ccd8e8]")} />
        ))}
      </div>
    </section>
  );
}

function ActivityPreview({
  transactions,
  dark,
  currency,
  onSeeAll,
}: {
  transactions: WalletActivity[];
  dark: boolean;
  currency: CurrencyCode;
  onSeeAll: () => void;
}) {
  return (
    <section className="mt-8">
      <SectionHeading
        dark={dark}
        action={
          <button type="button" onClick={onSeeAll} className={"text-xs font-bold " + (dark ? "text-[#75aefb]" : "text-[#397dd4]")}>
            See all
          </button>
        }
      >
        Recent activity
      </SectionHeading>
      <div className={"mt-2 divide-y rounded-2xl px-2 " + (dark ? "divide-white/10 bg-white/[.03]" : "divide-[#edf0f5] bg-white")}>
        {transactions.length === 0 ? (
          <p className={"px-3 py-5 text-sm " + (dark ? "text-white/45" : "text-[#8b96a8]")}>No activity yet.</p>
        ) : (
          transactions.slice(0, 3).map((transaction) => (
            <div key={transaction.id} className="flex items-center gap-3 py-3">
              <span className={"grid h-9 w-9 place-items-center rounded-full " + (transaction.type === "receive" ? "bg-[#dff7eb] text-[#2caa73]" : "bg-[#ffe7e9] text-[#df5e70]")}>
                {transaction.type === "receive" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={"block text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>
                  {transaction.type === "receive" ? "Received" : "Sent"} {transaction.tokenSymbol}
                </span>
                <span className={"block text-xs " + (dark ? "text-white/40" : "text-[#929cad]")}>
                  {formatDate(transaction.date)}
                </span>
              </span>
              <span className={"text-right text-sm font-bold " + (transaction.type === "receive" ? "text-[#2caa73]" : dark ? "text-white/75" : "text-[#59677c]")}>
                {transaction.type === "receive" ? "+" : "-"}
                {formatAmount(transaction.amount)} {transaction.tokenSymbol}
                <span className={"mt-0.5 block text-[10px] font-normal " + (dark ? "text-white/35" : "text-[#9aa4b3]")}>
                  {transaction.status === "completed" ? "Completed" : currency}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TrustHome({
  tokens,
  transactions,
  profile,
  total,
  dark,
  balanceVisible,
  onToggleBalance,
  onSettings,
  onSelectToken,
  onTransaction,
  onAccounts,
  onHistory,
  onCopyAddress,
  onShare,
  onDiscover,
}: {
  tokens: WalletToken[];
  transactions: WalletActivity[];
  profile: TrustProfile;
  total: number;
  dark: boolean;
  balanceVisible: boolean;
  onToggleBalance: () => void;
  onSettings: () => void;
  onSelectToken: (token: WalletToken) => void;
  onTransaction: (kind: TransactionKind) => void;
  onAccounts: () => void;
  onHistory: () => void;
  onCopyAddress: () => void;
  onShare: () => void;
  onDiscover: () => void;
}) {
  const [query, setQuery] = useState("");
  const [assetMode, setAssetMode] = useState<"crypto" | "nfts">("crypto");
  const [fundingVisible, setFundingVisible] = useState(true);
  const filteredTokens = [...tokens]
    .filter((token) => {
      const normalized = query.trim().toLowerCase();
      return !normalized || token.name.toLowerCase().includes(normalized) || token.symbol.toLowerCase().includes(normalized);
    })
    .sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name));

  return (
    <>
      <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
        <button
          type="button"
          aria-label="Open settings"
          onClick={onSettings}
          className={"grid h-11 w-11 place-items-center rounded-full " + (dark ? "bg-white/10 text-white" : "bg-white text-[#52627b] shadow-sm shadow-[#b7c4d5]/30")}
        >
          <Settings className="h-[19px] w-[19px]" />
        </button>
        <p className={"text-center text-base font-black " + (dark ? "text-white" : "text-[#1d2433]")}>Home</p>
        <button
          type="button"
          aria-label="Open notifications"
          onClick={onHistory}
          className={"grid h-11 w-11 place-items-center rounded-full " + (dark ? "bg-white/10 text-white" : "bg-white text-[#52627b] shadow-sm shadow-[#b7c4d5]/30")}
        >
          <Bell className="h-[19px] w-[19px]" />
        </button>
      </header>
      <label className={"mt-5 flex h-12 items-center gap-3 rounded-2xl px-4 " + (dark ? "bg-[#20252d] text-white/45" : "bg-white text-[#9aa6b8] shadow-sm shadow-[#b7c4d5]/20")}>
        <Search className="h-[18px] w-[18px]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tokens"
          className={"min-w-0 flex-1 bg-transparent text-base outline-none " + (dark ? "text-white placeholder:text-white/35" : "text-[#26344b] placeholder:text-[#9aa6b8]")}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear token search" className="rounded-full">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>
      <WalletIdentity
        profile={profile}
        total={total}
        dark={dark}
        balanceVisible={balanceVisible}
        onToggleBalance={onToggleBalance}
        onAccounts={onAccounts}
        onCopyAddress={onCopyAddress}
        onReceive={() => onTransaction("receive")}
        onShare={onShare}
      />
      <div className="mt-6 flex items-start justify-between gap-2">
        {actionItems.map(({ label, icon: Icon }) => (
          <ActionButton
            key={label}
            label={label}
            icon={Icon}
            dark={dark}
            onClick={() => {
              if (label === "Send" || label === "Receive") {
                onTransaction(label.toLowerCase() as TransactionKind);
              } else if (label === "Buy") {
                onTransaction("receive");
              } else {
                onDiscover();
              }
            }}
          />
        ))}
      </div>
      {fundingVisible ? <FundingBanner dark={dark} onDeposit={() => onTransaction("receive")} onDismiss={() => setFundingVisible(false)} /> : null}
      <section className="mt-8">
        <div className={"flex items-center gap-7 border-b " + (dark ? "border-white/10" : "border-[#e3e9f2]")}>
          {(["crypto", "nfts"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setAssetMode(mode)}
              className={
                "relative px-1 pb-3 text-sm font-black capitalize " +
                (assetMode === mode ? (dark ? "text-white" : "text-[#1d2433]") : dark ? "text-white/40" : "text-[#9aa6b8]")
              }
            >
              {mode === "crypto" ? "Crypto" : "NFTs"}
              {assetMode === mode ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#4e91f5]" /> : null}
            </button>
          ))}
        </div>
        {assetMode === "crypto" ? (
          <div className="mt-2">
            <SectionHeading
              dark={dark}
              action={
                <button type="button" onClick={onSettings} className={"text-xs font-bold " + (dark ? "text-[#75aefb]" : "text-[#397dd4]")}>
                  Manage
                </button>
              }
            >
              Your assets
            </SectionHeading>
            <div className="mt-1">
              {filteredTokens.length > 0 ? (
                filteredTokens.map((token) => <TrustTokenRow key={token.id} token={token} currency={profile.currency} dark={dark} onClick={() => onSelectToken(token)} />)
              ) : (
                <p className={"rounded-2xl px-3 py-5 text-sm " + (dark ? "bg-white/[.04] text-white/45" : "bg-white text-[#8b96a8]")}>No matching tokens.</p>
              )}
            </div>
          </div>
        ) : (
          <div className={"mt-4 rounded-3xl p-6 text-center " + (dark ? "bg-white/[.04]" : "bg-white shadow-sm shadow-[#b7c4d5]/20")}>
            <Sparkles className={"mx-auto h-8 w-8 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
            <p className={"mt-3 text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>No NFTs yet</p>
            <p className={"mt-1 text-xs leading-5 " + (dark ? "text-white/45" : "text-[#8b96a8]")}>Collectibles added to this wallet will appear here.</p>
          </div>
        )}
      </section>
      <ActivityPreview transactions={transactions} dark={dark} currency={profile.currency} onSeeAll={onHistory} />
    </>
  );
}

function WalletSelect({
  value,
  onChange,
  tokens,
  dark,
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: WalletToken[];
  dark: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={"h-12 w-full appearance-none rounded-2xl border px-4 pr-10 text-base font-bold outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")}
      >
        {tokens.map((token) => (
          <option key={token.id} value={token.symbol}>
            {token.name} ({token.symbol})
          </option>
        ))}
      </select>
      <ChevronDown className={"pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 " + (dark ? "text-white/45" : "text-[#9aa6b8]")} />
    </div>
  );
}

function SwapScreen({
  tokens,
  dark,
  onTransaction,
  onSwap,
}: {
  tokens: WalletToken[];
  dark: boolean;
  onTransaction: (kind: TransactionKind) => void;
  onSwap: (fromSymbol: string, toSymbol: string, amount: number) => { ok: boolean; message: string };
}) {
  const [from, setFrom] = useState(tokens[0]?.symbol ?? "USDT");
  const [to, setTo] = useState(tokens[1]?.symbol ?? "BTC");
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const fromToken = tokens.find((token) => token.symbol === from) ?? tokens[0];
  const toToken = tokens.find((token) => token.symbol === to) ?? tokens[1] ?? tokens[0];
  const output = fromToken && toToken && Number(amount) > 0 ? (Number(amount) * fromToken.price) / Math.max(toToken.price, 0.000001) : 0;

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <p className={"text-xs font-black uppercase tracking-[.2em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Swap</p>
          <h1 className={"mt-2 text-3xl font-black tracking-tight " + (dark ? "text-white" : "text-[#1d2433]")}>Trade tokens</h1>
        </div>
        <span className={"grid h-11 w-11 place-items-center rounded-full " + (dark ? "bg-white/10 text-[#75aefb]" : "bg-white text-[#4e91f5] shadow-sm")}>
          <RefreshCw className="h-5 w-5" />
        </span>
      </div>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>Convert one asset balance into another using the latest available prices.</p>
      <div className={"mt-7 rounded-3xl p-4 " + (dark ? "bg-[#1c2129]" : "bg-white shadow-sm shadow-[#b7c4d5]/25")}>
        <label className={"text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>You pay</label>
        <div className="mt-2 flex gap-2">
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className={"min-w-0 flex-1 rounded-2xl px-4 text-2xl font-black outline-none " + (dark ? "bg-[#282e38] text-white placeholder:text-white/25" : "bg-[#f3f6fa] text-[#1d2433] placeholder:text-[#b4bfce]")} />
          <div className="w-[43%] min-w-0">
            <WalletSelect value={from} onChange={setFrom} tokens={tokens} dark={dark} />
          </div>
        </div>
        <div className="my-4 flex items-center gap-3">
          <span className={"h-px flex-1 " + (dark ? "bg-white/10" : "bg-[#e9edf3]")} />
          <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Reverse swap direction" className={"grid h-9 w-9 place-items-center rounded-full " + (dark ? "bg-[#303743] text-white" : "bg-[#eef3f9] text-[#52627b]")}>
            <RefreshCw className="h-4 w-4" />
          </button>
          <span className={"h-px flex-1 " + (dark ? "bg-white/10" : "bg-[#e9edf3]")} />
        </div>
        <label className={"text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>You receive</label>
        <div className="mt-2 flex gap-2">
          <div className={"min-w-0 flex-1 rounded-2xl px-4 py-3 text-2xl font-black " + (dark ? "bg-[#282e38] text-white" : "bg-[#f3f6fa] text-[#1d2433]")}>{output ? formatAmount(output) : "0.00"}</div>
          <div className="w-[43%] min-w-0">
            <WalletSelect value={to} onChange={setTo} tokens={tokens} dark={dark} />
          </div>
        </div>
        <div className={"mt-4 flex items-center justify-between text-xs " + (dark ? "text-white/40" : "text-[#8994a6]")}>
          <span>Rate</span>
          <span>{fromToken && toToken ? "1 " + from + " ≈ " + formatAmount(fromToken.price / Math.max(toToken.price, 0.000001)) + " " + to : "Rate unavailable"}</span>
        </div>
      </div>
      {feedback ? (
        <p className={"mt-4 rounded-2xl px-4 py-3 text-sm font-semibold " + (feedback.ok ? "bg-[#dff7eb] text-[#248a60]" : "bg-[#ffe7e9] text-[#c8495d]")}>
          {feedback.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          const result = onSwap(from, to, Number(amount));
          setFeedback(result);
          if (result.ok) setAmount("");
        }}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white shadow-lg shadow-blue-500/20"
      >
        Swap tokens <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onTransaction("receive")} className={"mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-bold " + (dark ? "border-white/10 text-white/70" : "border-[#e1e7f0] text-[#52627b]")}>
        Add funds <Plus className="h-4 w-4" />
      </button>
      <div className={"mt-6 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#1c2129] text-white/45" : "bg-white text-[#7f8a9d] shadow-sm")}>
        <ShieldCheck className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        Quotes use current market prices. Completed swaps update both asset balances immediately.
      </div>
    </section>
  );
}

function DiscoverScreen({
  tokens,
  dark,
  currency,
  onSelectToken,
}: {
  tokens: WalletToken[];
  dark: boolean;
  currency: CurrencyCode;
  onSelectToken: (token: WalletToken) => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const movers = [...tokens].sort((a, b) => b.change24h - a.change24h);

  return (
    <section>
      <p className={"text-xs font-black uppercase tracking-[.2em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Discover</p>
      <h1 className={"mt-2 text-3xl font-black tracking-tight " + (dark ? "text-white" : "text-[#1d2433]")}>Explore crypto</h1>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>Browse market cards and open any asset for price and balance details.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          { title: "Market movers", body: "Open today’s strongest asset.", color: "from-[#4e91f5] to-[#76c7ff]", action: () => movers[0] && onSelectToken(movers[0]) },
          { title: "Learn crypto", body: "Read practical wallet safety tips.", color: "from-[#8c65e8] to-[#d17bff]", action: () => setGuideOpen((open) => !open) },
        ].map((card) => (
          <button key={card.title} type="button" onClick={card.action} className={"rounded-3xl bg-gradient-to-br p-4 text-left text-white " + card.color}>
            <Sparkles className="h-5 w-5" />
            <p className="mt-8 text-sm font-black">{card.title}</p>
            <p className="mt-1 text-xs leading-5 text-white/75">{card.body}</p>
          </button>
        ))}
      </div>
      {guideOpen ? (
        <div className={"mt-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#1c2129] text-white/65" : "bg-white text-[#637087] shadow-sm")}>
          Verify recipient addresses, review the asset and amount before sending, and never share a recovery phrase or private key.
        </div>
      ) : null}
      <SectionHeading dark={dark}>
        Popular assets
      </SectionHeading>
      <div className={"mt-2 rounded-2xl p-2 " + (dark ? "bg-[#1c2129]" : "bg-white shadow-sm")}>
        {movers.map((token) => (
          <TrustTokenRow key={token.id} token={token} currency={currency} dark={dark} onClick={() => onSelectToken(token)} />
        ))}
      </div>
    </section>
  );
}

function BrowserScreen({ dark }: { dark: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const links = [
    { title: "Wallet help center", summary: "Learn how wallet accounts and transfers work.", body: "Use Receive to view an account address, Send to move an asset, and Activity to review completed transfers." },
    { title: "Market overview", summary: "Review prices and daily movement.", body: "Open Discover to compare current asset prices and 24-hour performance, then select a token for more detail." },
    { title: "Wallet safety guide", summary: "Protect access to your wallet.", body: "Use device security, verify every recipient, and never disclose a recovery phrase, private key, or unlock code." },
  ];
  const normalized = query.trim().toLowerCase();
  const filteredLinks = links.filter((link) => !normalized || link.title.toLowerCase().includes(normalized) || link.summary.toLowerCase().includes(normalized));
  const selectedLink = links.find((link) => link.title === selected);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelected(filteredLinks[0]?.title ?? "");
  };

  return (
    <section>
      <p className={"text-xs font-black uppercase tracking-[.2em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Browser</p>
      <h1 className={"mt-2 text-3xl font-black tracking-tight " + (dark ? "text-white" : "text-[#1d2433]")}>Web3 browser</h1>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>Search wallet guides and market information.</p>
      <form onSubmit={submitSearch} className={"mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 " + (dark ? "bg-[#1c2129]" : "bg-white shadow-sm")}>
        <Globe className={"h-5 w-5 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides" className={"min-w-0 flex-1 bg-transparent text-base outline-none " + (dark ? "text-white placeholder:text-white/35" : "text-[#303c50] placeholder:text-[#9aa6b8]")} />
        <button type="submit" aria-label="Search browser" className={"rounded-full p-1 " + (dark ? "text-white/60" : "text-[#7c879a]")}>
          <Search className="h-4 w-4" />
        </button>
      </form>
      {selectedLink ? (
        <article className={"mt-4 rounded-2xl p-4 " + (dark ? "bg-[#252b35] text-white" : "bg-[#eaf3ff] text-[#303c50]")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">{selectedLink.title}</h2>
              <p className={"mt-2 text-xs leading-5 " + (dark ? "text-white/55" : "text-[#637087]")}>{selectedLink.body}</p>
            </div>
            <button type="button" onClick={() => setSelected("")} aria-label="Close guide"><X className="h-4 w-4" /></button>
          </div>
        </article>
      ) : null}
      <div className="mt-6 space-y-3">
        {filteredLinks.map((link, index) => (
          <button key={link.title} type="button" onClick={() => setSelected(link.title)} className={"flex w-full items-center gap-3 rounded-2xl p-4 text-left " + (dark ? "bg-[#1c2129] hover:bg-[#232a34]" : "bg-white shadow-sm hover:bg-[#f4f7fb]")}>
            <span className={"grid h-10 w-10 place-items-center rounded-full " + (dark ? "bg-white/10 text-[#75aefb]" : "bg-[#eaf3ff] text-[#4e91f5]")}>
              {index === 0 ? <CircleHelp className="h-5 w-5" /> : index === 1 ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={"block text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>{link.title}</span>
              <span className={"mt-1 block text-xs " + (dark ? "text-white/40" : "text-[#8b96a8]")}>{link.summary}</span>
            </span>
            <ChevronRight className={"h-4 w-4 " + (dark ? "text-white/30" : "text-[#aab3c1]")} />
          </button>
        ))}
        {filteredLinks.length === 0 ? <p className={"rounded-2xl p-4 text-sm " + (dark ? "bg-[#1c2129] text-white/45" : "bg-white text-[#7f8a9d]")}>No matching guides.</p> : null}
      </div>
      <div className={"mt-6 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#1c2129] text-white/45" : "bg-white text-[#7f8a9d] shadow-sm")}>
        <ShieldCheck className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        These guides never request seed phrases, private keys, or wallet credentials.
      </div>
    </section>
  );
}

function TransactionModal({
  kind,
  tokens,
  dark,
  onClose,
  onSubmit,
}: {
  kind: TransactionKind;
  tokens: WalletToken[];
  dark: boolean;
  onClose: () => void;
  onSubmit: (input: { type: TransactionKind; tokenSymbol: string; amount: number; counterpartyLabel: string; date: string }) => void;
}) {
  const [type, setType] = useState<TransactionKind>(kind);
  const [tokenSymbol, setTokenSymbol] = useState(tokens[0]?.symbol ?? "USDT");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    onSubmit({
      type,
      tokenSymbol,
      amount: parsedAmount,
      counterpartyLabel: counterparty.trim() || "Wallet contact",
      date: new Date(date + "T" + time).toISOString(),
    });
  };

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label="Add transaction">
      <div className="flex items-center justify-between">
        <div>
          <p className={"text-xs font-black uppercase tracking-[.18em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Transaction</p>
          <h2 className="mt-2 text-2xl font-black">Add transaction</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close transaction form" className={"rounded-full p-2 " + (dark ? "text-white/60 hover:bg-white/10" : "text-[#7d899d] hover:bg-[#eef3f9]")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className={"mt-5 flex rounded-2xl p-1 " + (dark ? "bg-[#20252d]" : "bg-[#f0f4f9]")}>
        {(["receive", "send"] as const).map((transactionType) => (
          <button key={transactionType} type="button" onClick={() => setType(transactionType)} className={"flex-1 rounded-xl py-3 text-sm font-black capitalize " + (type === transactionType ? (dark ? "bg-[#3a4350] text-white" : "bg-white text-[#303c50] shadow-sm") : dark ? "text-white/40" : "text-[#929cad]")}>
            {transactionType}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Asset</span>
          <WalletSelect value={tokenSymbol} onChange={setTokenSymbol} tokens={tokens} dark={dark} />
        </label>
        <label className="block">
          <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Amount</span>
          <input required value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="any" placeholder="0.00" className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        </label>
        <label className="block">
          <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>{type === "send" ? "Recipient label" : "Sender label"}</span>
          <input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder="Example: Creator Wallet" className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Date</span>
            <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className={"h-12 w-full rounded-2xl border px-3 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
          </label>
          <label className="block">
            <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Time</span>
            <input value={time} onChange={(event) => setTime(event.target.value)} type="time" className={"h-12 w-full rounded-2xl border px-3 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
          </label>
        </div>
        {error ? <p className="rounded-2xl bg-[#ffe7e9] px-4 py-3 text-sm font-semibold text-[#c8495d]">{error}</p> : null}
      <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white">
          Save transaction <Check className="h-4 w-4" />
        </button>
      </form>
    </ModalBackdrop>
  );
}

function TokenDetailModal({
  token,
  currency,
  dark,
  onClose,
  onTransaction,
}: {
  token: WalletToken;
  currency: CurrencyCode;
  dark: boolean;
  onClose: () => void;
  onTransaction: (kind: TransactionKind) => void;
}) {
  const [period, setPeriod] = useState("1D");

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label={token.name + " details"} align="center">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TokenIcon token={token} size="large" />
          <div>
            <h2 className="text-2xl font-black">{token.name}</h2>
            <p className={"mt-1 text-sm " + (dark ? "text-white/45" : "text-[#8994a6]")}>{token.symbol} · Wallet asset</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close token details" className={"rounded-full p-2 " + (dark ? "text-white/60 hover:bg-white/10" : "text-[#7d899d] hover:bg-[#eef3f9]")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-6 flex items-end justify-between">
        <div>
          <p className={"text-xs " + (dark ? "text-white/45" : "text-[#929cad]")}>Current price</p>
          <p className="mt-1 text-2xl font-black">{formatMoney(token.price, currency)}</p>
        </div>
        <p className={"text-sm font-bold " + (token.change24h >= 0 ? "text-[#2caa73]" : "text-[#df5e70]")}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</p>
      </div>
      <div className={"mt-5 rounded-3xl p-3 " + (dark ? "bg-[#20252d]" : "bg-[#f4f7fb]")}>
        <svg viewBox="0 0 384 150" className="h-36 w-full" role="img" aria-label={token.symbol + " price chart"}>
          <defs>
            <linearGradient id="trust-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4e91f5" stopOpacity=".4" />
              <stop offset="100%" stopColor="#4e91f5" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={"0,150 " + chartPoints + " 384,150"} fill="url(#trust-chart-fill)" stroke="none" />
          <polyline points={chartPoints} fill="none" stroke="#4e91f5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        </svg>
        <div className={"flex justify-between px-1 text-[10px] font-bold " + (dark ? "text-white/35" : "text-[#9aa6b8]")}>
          {["1H", "1D", "1W", "1M", "1Y", "ALL"].map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} className={option === period ? "text-[#4e91f5]" : ""}>{option}</button>)}
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className={"text-xs " + (dark ? "text-white/45" : "text-[#929cad]")}>Your balance</p>
          <p className="mt-1 text-xl font-black">{formatMoney(token.price * token.balance, currency)}</p>
        </div>
        <p className={"text-sm font-semibold " + (dark ? "text-white/55" : "text-[#7f8a9d]")}>{formatAmount(token.balance)} {token.symbol}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onTransaction("send")} className={"flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black " + (dark ? "bg-[#303743] text-white" : "bg-[#eaf3ff] text-[#397dd4]")}>
          <ArrowUpRight className="h-4 w-4" /> Send
        </button>
        <button type="button" onClick={() => onTransaction("receive")} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white">
          <ArrowDownLeft className="h-4 w-4" /> Receive
        </button>
      </div>
    </ModalBackdrop>
  );
}

function SettingsModal({
  profile,
  tokens,
  dark,
  onClose,
  onSave,
  onAddToken,
  onClearActivity,
  onAccounts,
  onSecurity,
}: {
  profile: TrustProfile;
  tokens: WalletToken[];
  dark: boolean;
  onClose: () => void;
  onSave: (profile: TrustProfile, balances: Record<string, number>) => void;
  onAddToken: () => void;
  onClearActivity: () => void;
  onAccounts: () => void;
  onSecurity: () => void;
}) {
  const [walletName, setWalletName] = useState(profile.walletName);
  const [currency, setCurrency] = useState<CurrencyCode>(profile.currency);
  const [appearance, setAppearance] = useState<Appearance>(profile.appearance);
  const [balances, setBalances] = useState<Record<string, string>>(() => Object.fromEntries(tokens.map((token) => [token.id, String(token.balance)])));

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label="Trust Wallet settings">
      <div className="flex items-center justify-between">
        <div>
          <p className={"text-xs font-black uppercase tracking-[.18em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Wallet settings</p>
          <h2 className="mt-2 text-2xl font-black">Customize</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close settings" className={"rounded-full p-2 " + (dark ? "text-white/60 hover:bg-white/10" : "text-[#7d899d] hover:bg-[#eef3f9]")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <label className="mt-6 block">
        <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Wallet name</span>
        <input value={walletName} onChange={(event) => setWalletName(event.target.value)} className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
      </label>
      <div className="mt-5">
        <p className={"mb-2 text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Appearance</p>
        <div className={"flex rounded-2xl p-1 " + (dark ? "bg-[#20252d]" : "bg-[#f0f4f9]")}>
          {(["light", "dark"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setAppearance(mode)} className={"flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold capitalize " + (appearance === mode ? (dark ? "bg-[#3a4350] text-white" : "bg-white text-[#303c50] shadow-sm") : dark ? "text-white/40" : "text-[#929cad]")}>
              {mode === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {mode}
            </button>
          ))}
        </div>
      </div>
      <label className="mt-5 block">
        <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Display currency</span>
        <div className="relative">
          <select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className={"h-12 w-full appearance-none rounded-2xl border px-4 pr-10 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")}>
            {(Object.keys(currencySymbols) as CurrencyCode[]).map((code) => <option key={code} value={code}>{currencySymbols[code]} {code}</option>)}
          </select>
          <ChevronDown className={"pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 " + (dark ? "text-white/45" : "text-[#9aa6b8]")} />
        </div>
      </label>
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className={"text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Wallet balances</p>
          <span className={"text-[10px] font-black uppercase tracking-widest " + (dark ? "text-white/30" : "text-[#a4aebb]")}>Editable balances</span>
        </div>
        <div className="mt-2 space-y-2">
          {tokens.map((token) => (
            <label key={token.id} className={"flex items-center gap-3 rounded-2xl p-2 " + (dark ? "bg-[#20252d]" : "bg-[#f7f9fc]")}>
              <TokenIcon token={token} size="small" />
              <span className={"w-14 text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>{token.symbol}</span>
              <input value={balances[token.id] ?? "0"} onChange={(event) => setBalances((current) => ({ ...current, [token.id]: event.target.value }))} inputMode="decimal" className={"h-10 min-w-0 flex-1 rounded-xl border px-3 text-right text-base outline-none " + (dark ? "border-white/10 bg-[#2a3039] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
            </label>
          ))}
        </div>
      </div>
      <button type="button" onClick={onAddToken} className={"mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-bold " + (dark ? "border-white/20 text-white/65 hover:bg-white/5" : "border-[#b9c9dd] text-[#52627b] hover:bg-[#f5f8fc]")}>
        <Plus className="h-4 w-4" /> Add token
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={onAccounts} className={"flex h-12 items-center justify-center gap-2 rounded-2xl border text-xs font-bold " + (dark ? "border-white/15 text-white/75" : "border-[#d5deea] text-[#52627b]")}><WalletCards className="h-4 w-4" /> Accounts</button>
        <button type="button" onClick={onSecurity} className={"flex h-12 items-center justify-center gap-2 rounded-2xl border text-xs font-bold " + (dark ? "border-white/15 text-white/75" : "border-[#d5deea] text-[#52627b]")}><ShieldCheck className="h-4 w-4" /> Security</button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClearActivity} className={"h-11 rounded-2xl border text-xs font-bold " + (dark ? "border-[#df5e70]/30 text-[#df8792]" : "border-[#ffd4d8] text-[#c8495d]")}>Clear activity</button>
        <button type="button" onClick={() => onSave({ walletName: walletName.trim() || "Main wallet", currency, appearance }, Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, Number(value) || 0])))} className="h-11 rounded-2xl bg-[#4e91f5] text-xs font-black text-white">Save settings</button>
      </div>
      <div className={"mt-5 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#20252d] text-white/45" : "bg-[#f4f7fb] text-[#7f8a9d]")}>
        <Palette className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        Wallet customization never asks for recovery phrases or private keys.
      </div>
    </ModalBackdrop>
  );
}

function AddTokenModal({
  dark,
  onClose,
  onSave,
}: {
  dark: boolean;
  onClose: () => void;
  onSave: (token: { name: string; symbol: string; price: number; balance: number }) => void;
}) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("1");
  const [balance, setBalance] = useState("0");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = Number(price);
    const parsedBalance = Number(balance);
    if (!name.trim() || !symbol.trim() || !Number.isFinite(parsedPrice) || !Number.isFinite(parsedBalance) || parsedPrice < 0 || parsedBalance < 0) {
      setError("Enter a name, symbol, price, and valid balance.");
      return;
    }
    onSave({ name: name.trim(), symbol: symbol.trim().toUpperCase(), price: parsedPrice, balance: parsedBalance });
  };

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label="Add token" align="center">
      <div className="flex items-center justify-between">
        <div>
          <p className={"text-xs font-black uppercase tracking-[.18em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Local asset</p>
          <h2 className="mt-2 text-2xl font-black">Add token</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close add token form" className={"rounded-full p-2 " + (dark ? "text-white/60 hover:bg-white/10" : "text-[#7d899d] hover:bg-[#eef3f9]")}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/45" : "text-[#7f8a9d]")}>Create a display-only token. No contract address or network connection is used.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        <input required value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Symbol, e.g. DEMO" className={"h-12 w-full rounded-2xl border px-4 text-base uppercase outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        <div className="grid grid-cols-2 gap-3">
          <input required type="number" min="0" step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
          <input required type="number" min="0" step="any" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" className={"h-12 w-full rounded-2xl border px-4 text-base outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        </div>
        {error ? <p className="rounded-2xl bg-[#ffe7e9] px-4 py-3 text-sm font-semibold text-[#c8495d]">{error}</p> : null}
        <button type="submit" className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white">Add token <Plus className="h-4 w-4" /></button>
      </form>
    </ModalBackdrop>
  );
}

function createTrustTokens(): WalletToken[] {
  const sourceTokens = new Map(defaultTokens.map((token) => [token.symbol, token]));
  const make = (symbol: string, fallback: { id: string; name: string; price: number; balance: number; change24h: number }): WalletToken => {
    const source = sourceTokens.get(symbol);
    return {
      id: "trust-" + fallback.id,
      name: source?.name ?? fallback.name,
      symbol,
      price: source?.price ?? fallback.price,
      balance: fallback.balance,
      change24h: fallback.change24h,
      image: source?.image ?? "",
      updatedAt: new Date().toISOString(),
    };
  };

  return mergeCanonicalWalletCatalogue([
    make("BTC", { id: "btc", name: "Bitcoin", price: 69250, balance: 0.01, change24h: -2.46 }),
    make("ETH", { id: "eth", name: "Ethereum", price: 3720, balance: 0.05, change24h: -3.56 }),
    make("BNB", { id: "bnb", name: "BNB", price: 650, balance: 0.3, change24h: -1.22 }),
    make("MATIC", { id: "matic", name: "Polygon", price: 0.25, balance: 200, change24h: 1.04 }),
    make("USDC", { id: "usdc", name: "USD Coin", price: 1, balance: 45, change24h: 0.46 }),
    make("USDT", { id: "usdt", name: "Tether", price: 1, balance: 59.7, change24h: 0.42 }),
    make("SOL", { id: "sol", name: "Solana", price: 73.38, balance: 0.01, change24h: -3.13 }),
  ]);
}

const defaultTrustTransactions: WalletActivity[] = [
  {
    id: "trust-seed-1",
    type: "receive",
    tokenSymbol: "USDC",
    amount: 45,
    counterpartyLabel: "Wallet transfer",
    date: "2026-05-15T14:16:00.000Z",
    status: "completed",
    note: "DEMO TRANSACTION",
  },
  {
    id: "trust-seed-2",
    type: "send",
    tokenSymbol: "SOL",
    amount: 0.02,
    counterpartyLabel: "Wallet transfer",
    date: "2026-04-14T22:07:00.000Z",
    status: "completed",
    note: "DEMO TRANSACTION",
  },
];

export function TrustWallet() {
  const runtime = useWalletRuntime();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [transactions, setTransactions] = useState<WalletActivity[]>([]);
  const [profile, setProfile] = useState<TrustProfile>(defaultTrustProfile);
  const [tab, setTab] = useState<TrustTab>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  const [transactionKind, setTransactionKind] = useState<TransactionKind | null>(null);
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [notice, setNotice] = useState("");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const latestMarketSnapshot = useRef<LiveMarketSnapshot>(emptyLiveMarketSnapshot);

  useLivePrices(liveMarketSymbols, (prices, changes, images, marketCaps, changes1h, changes7d, volumes24h) => {
    const snapshot = { prices, changes, images, marketCaps, changes1h, changes7d, volumes24h };
    latestMarketSnapshot.current = snapshot;
    setTokens((current) =>
      applyLiveMarketSnapshot(mergeCanonicalWalletCatalogue(current), snapshot),
    );
    runtime.updateMarketAssets(applyLiveMarketSnapshot(mergeCanonicalWalletCatalogue([]), snapshot));
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedTokens = readStorage<WalletToken[]>(TRUST_TOKENS_KEY, []);
      const storedTransactions = readStorage<WalletActivity[]>(TRUST_TRANSACTIONS_KEY, []);
      const storedProfile = readStorage<TrustProfile>(TRUST_PROFILE_KEY, defaultTrustProfile);
      const nextTokens = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(storedTokens.length > 0 ? storedTokens : createTrustTokens()),
        latestMarketSnapshot.current,
      );
      const nextTransactions = storedTransactions.length > 0 ? storedTransactions : defaultTrustTransactions;
      setTokens(nextTokens);
      setTransactions(nextTransactions);
      setProfile({ ...defaultTrustProfile, ...storedProfile });
      if (storedTokens.length === 0) writeStorage(TRUST_TOKENS_KEY, nextTokens);
      if (storedTransactions.length === 0) writeStorage(TRUST_TRANSACTIONS_KEY, nextTransactions);
      if (storedProfile === defaultTrustProfile) writeStorage(TRUST_PROFILE_KEY, defaultTrustProfile);
    }, 0);

    document.documentElement.dataset.walletTheme = "trust";
    const refreshSharedWallet = () => {
      setTokens(applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(readStorage<WalletToken[]>(TRUST_TOKENS_KEY, createTrustTokens())),
        latestMarketSnapshot.current,
      ));
      setTransactions(readStorage<WalletActivity[]>(TRUST_TRANSACTIONS_KEY, []));
      setProfile((current) => ({ ...current, ...readStorage<TrustProfile>(TRUST_PROFILE_KEY, current) }));
    };
    window.addEventListener(walletLedgerEvent, refreshSharedWallet);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(walletLedgerEvent, refreshSharedWallet);
      delete document.documentElement.dataset.walletTheme;
    };
  }, []);

  useEffect(() => {
    if (!runtime.state || !runtime.currentAccount) return;
    const timeoutId = window.setTimeout(() => {
      setTokens((current) => applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(tokensForWalletAccount(current, runtime.state!, runtime.currentAccount!)),
        latestMarketSnapshot.current,
      ));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount, runtime.state]);

  const dark = profile.appearance === "dark";
  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.price * token.balance, 0), [tokens]);
  const activeProfile = { ...profile, walletName: runtime.currentAccount?.name ?? profile.walletName };
  const visibleTransactions = useMemo<WalletActivity[]>(() => {
    if (!runtime.state || !runtime.currentAccount) return transactions;
    const accountId = runtime.currentAccount.id;
    const sharedTransactions = transactionsForAccount(runtime.state, accountId).map((transaction) => {
      const received = transaction.destinationAccountId === accountId;
      return {
        id: transaction.id,
        type: received ? "receive" as const : "send" as const,
        tokenSymbol: transaction.tokenSymbol,
        amount: transaction.amount,
        counterpartyLabel: received ? transaction.senderAddress : transaction.recipientAddress,
        date: transaction.timestamp,
        status: transaction.status,
        note: "DEMO TRANSFER",
      };
    });
    const sharedIds = new Set(sharedTransactions.map((transaction) => transaction.id));
    return [...sharedTransactions, ...transactions.filter((transaction) => !sharedIds.has(transaction.id))]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [runtime.currentAccount, runtime.state, transactions]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const copyWalletAddress = async () => {
    const address = runtime.currentAccount?.address;
    if (!address) {
      notify("Wallet address is still loading.");
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      notify("Wallet address copied.");
    } catch {
      notify("Could not copy the address. Open Receive to copy it manually.");
    }
  };

  const shareWalletAddress = async () => {
    const address = runtime.currentAccount?.address;
    if (!address) {
      notify("Wallet address is still loading.");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: activeProfile.walletName, text: "Trust Wallet address: " + address });
        notify("Wallet address shared.");
        return;
      }
      await navigator.clipboard.writeText(address);
      notify("Sharing is unavailable, so the address was copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify("Could not share the wallet address.");
    }
  };

  const performSwap = (fromSymbol: string, toSymbol: string, swapAmount: number) => {
    if (!Number.isFinite(swapAmount) || swapAmount <= 0) return { ok: false, message: "Enter an amount greater than zero." };
    if (fromSymbol === toSymbol) return { ok: false, message: "Choose two different assets." };
    const fromToken = tokens.find((token) => token.symbol === fromSymbol);
    const toToken = tokens.find((token) => token.symbol === toSymbol);
    if (!fromToken || !toToken || fromToken.price <= 0 || toToken.price <= 0) return { ok: false, message: "A current market price is unavailable for this pair." };
    if (swapAmount > fromToken.balance) return { ok: false, message: "Not enough " + fromSymbol + " balance." };

    const receivedAmount = (swapAmount * fromToken.price) / toToken.price;
    const updatedAt = new Date().toISOString();
    const nextTokens = tokens.map((token) => {
      if (token.id === fromToken.id) return { ...token, balance: token.balance - swapAmount, updatedAt };
      if (token.id === toToken.id) return { ...token, balance: token.balance + receivedAmount, updatedAt };
      return token;
    });
    const activity: WalletActivity[] = [
      {
        id: createId("trust-swap-receive"),
        type: "receive",
        tokenSymbol: toSymbol,
        amount: receivedAmount,
        counterpartyLabel: "Swapped from " + fromSymbol,
        date: updatedAt,
        status: "completed",
        note: "DEMO SWAP",
      },
      {
        id: createId("trust-swap-send"),
        type: "send",
        tokenSymbol: fromSymbol,
        amount: swapAmount,
        counterpartyLabel: "Swapped to " + toSymbol,
        date: updatedAt,
        status: "completed",
        note: "DEMO SWAP",
      },
      ...transactions,
    ];
    setTokens(nextTokens);
    setTransactions(activity);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    writeStorage(TRUST_TRANSACTIONS_KEY, activity);
    runtime.replaceCurrentBalances(Object.fromEntries(nextTokens.map((token) => [token.symbol, token.balance])));
    return { ok: true, message: "Swapped " + formatAmount(swapAmount) + " " + fromSymbol + " for " + formatAmount(receivedAmount) + " " + toSymbol + "." };
  };

  const saveSettings = (nextProfile: TrustProfile, balances: Record<string, number>) => {
    const nextTokens = tokens.map((token) => balances[token.id] === undefined ? token : { ...token, balance: Math.max(0, balances[token.id]), updatedAt: new Date().toISOString() });
    setTokens(nextTokens);
    setProfile(nextProfile);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    writeStorage(TRUST_PROFILE_KEY, nextProfile);
    runtime.replaceCurrentBalances(Object.fromEntries(nextTokens.map((token) => [token.symbol, token.balance])));
    runtime.renameCurrentAccount(nextProfile.walletName);
    setSettingsOpen(false);
    notify("Trust-style wallet settings saved locally.");
  };

  const addToken = (input: { name: string; symbol: string; price: number; balance: number }) => {
    const nextToken: WalletToken = {
      ...input,
      id: createId("trust-token"),
      change24h: 0,
      image: "",
      updatedAt: new Date().toISOString(),
    };
    const nextTokens = [...tokens, nextToken];
    setTokens(nextTokens);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    runtime.updateMarketAssets(nextTokens);
    runtime.replaceCurrentBalances(Object.fromEntries(nextTokens.map((token) => [token.symbol, token.balance])));
    setAddTokenOpen(false);
    setSettingsOpen(false);
    notify(nextToken.symbol + " added to your wallet.");
  };

  const clearActivity = () => {
    setTransactions([]);
    writeStorage(TRUST_TRANSACTIONS_KEY, []);
    setSettingsOpen(false);
    notify("Activity cleared.");
  };

  const handleTransaction = (input: { type: TransactionKind; tokenSymbol: string; amount: number; counterpartyLabel: string; date: string }) => {
    const currentToken = tokens.find((token) => token.symbol === input.tokenSymbol);
    if (!currentToken) return;
    if (input.type === "send" && input.amount > currentToken.balance) {
      notify("Not enough balance for this send.");
      return;
    }
    const nextTokens = tokens.map((token) => token.id === currentToken.id ? { ...token, balance: token.balance + (input.type === "receive" ? input.amount : -input.amount), updatedAt: new Date().toISOString() } : token);
    const record: WalletActivity = {
      id: createId("trust-activity"),
      type: input.type,
      tokenSymbol: input.tokenSymbol,
      amount: input.amount,
      counterpartyLabel: input.counterpartyLabel,
      date: input.date,
      status: "completed",
      note: "DEMO TRANSACTION",
    };
    const nextTransactions = [record, ...transactions];
    setTokens(nextTokens);
    setTransactions(nextTransactions);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    writeStorage(TRUST_TRANSACTIONS_KEY, nextTransactions);
    setTransactionKind(null);
    setSelectedToken(null);
    notify((input.type === "receive" ? "Received " : "Sent ") + formatAmount(input.amount) + " " + input.tokenSymbol + ".");
  };

  const openSharedTransaction = (kind: TransactionKind) => {
    setSelectedToken(null);
    if (kind === "send") runtime.openTransfer();
    else runtime.openReceive();
  };

  return (
    <main className={"min-h-[100dvh] " + (dark ? "bg-[#07101c]" : "bg-[#07162a]")}>
      <div className={"relative mx-auto h-[100dvh] w-full max-w-[35rem] overflow-hidden shadow-2xl " + (dark ? "bg-[#101319] text-white" : "bg-[#f6f8fc] text-[#1d2433]")}>
        <div className={"pointer-events-none absolute inset-0 " + (dark ? "bg-[radial-gradient(circle_at_80%_12%,rgba(84,139,255,.16),transparent_32%)]" : "bg-[radial-gradient(circle_at_80%_8%,rgba(78,145,245,.11),transparent_32%)]")} />
        <div className="relative h-full overflow-y-auto px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          {tab === "home" ? (
            <TrustHome
              tokens={tokens}
              transactions={visibleTransactions}
              profile={activeProfile}
              total={total}
              dark={dark}
              balanceVisible={balanceVisible}
              onToggleBalance={() => setBalanceVisible((visible) => !visible)}
              onSettings={() => setSettingsOpen(true)}
              onSelectToken={setSelectedToken}
              onTransaction={openSharedTransaction}
              onAccounts={runtime.openAccounts}
              onHistory={runtime.openHistory}
              onCopyAddress={() => void copyWalletAddress()}
              onShare={() => void shareWalletAddress()}
              onDiscover={() => setTab("discover")}
            />
          ) : tab === "swap" ? (
            <SwapScreen tokens={tokens} dark={dark} onTransaction={openSharedTransaction} onSwap={performSwap} />
          ) : tab === "discover" ? (
            <DiscoverScreen tokens={tokens} dark={dark} currency={profile.currency} onSelectToken={setSelectedToken} />
          ) : (
            <BrowserScreen dark={dark} />
          )}
        </div>
        <nav className={"absolute inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-[1.5rem] border p-2 shadow-2xl backdrop-blur-xl " + (dark ? "border-white/10 bg-[#20252d]/95" : "border-[#dfe6ef] bg-white/95") } aria-label="Trust Wallet navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={"flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-[10px] font-black transition " + (tab === id ? (dark ? "bg-[#3a4350] text-white" : "bg-[#eaf3ff] text-[#397dd4]") : dark ? "text-white/40" : "text-[#8994a6]")}>
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
        </nav>
        {settingsOpen ? <SettingsModal profile={activeProfile} tokens={tokens} dark={dark} onClose={() => setSettingsOpen(false)} onSave={saveSettings} onAddToken={() => { setSettingsOpen(false); setAddTokenOpen(true); }} onClearActivity={clearActivity} onAccounts={() => { setSettingsOpen(false); runtime.openAccounts(); }} onSecurity={() => { setSettingsOpen(false); runtime.openSecurity(); }} /> : null}
        {addTokenOpen ? <AddTokenModal dark={dark} onClose={() => setAddTokenOpen(false)} onSave={addToken} /> : null}
        {transactionKind ? <TransactionModal kind={transactionKind} tokens={tokens} dark={dark} onClose={() => setTransactionKind(null)} onSubmit={handleTransaction} /> : null}
        {selectedToken ? <TokenDetailModal token={selectedToken} currency={profile.currency} dark={dark} onClose={() => setSelectedToken(null)} onTransaction={openSharedTransaction} /> : null}
        {notice ? <Notice message={notice} dark={dark} /> : null}
        <span className={"pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[.2em] " + (dark ? "text-white/15" : "text-[#aeb8c6]")}>Demo · No real funds</span>
      </div>
    </main>
  );
}
