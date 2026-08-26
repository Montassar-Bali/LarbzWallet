"use client";

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
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { defaultTokens, liveMarketSymbols } from "@/config/tokens";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";

type TrustTab = "home" | "swap" | "discover" | "browser";
type Appearance = "light" | "dark";
type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD";
type TransactionKind = "send" | "receive";

  const trustLiveSymbols = liveMarketSymbols;

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

function TokenIcon({
  token,
  size = "normal",
}: {
  token: Pick<WalletToken, "symbol">;
  size?: "small" | "normal" | "large";
}) {
  const sizes = {
    small: "h-8 w-8 text-xs",
    normal: "h-11 w-11 text-lg",
    large: "h-14 w-14 text-2xl",
  };

  return (
    <span
      className={"grid shrink-0 place-items-center rounded-full font-bold text-white shadow-inner shadow-white/30 " + sizes[size]}
      style={{
        background:
          token.symbol === "SOL"
            ? "linear-gradient(145deg, #4d42c8, #d74fc5)"
            : tokenColors[token.symbol] ?? "#61708e",
      }}
    >
      {getTokenMark(token.symbol)}
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
  onNotice,
}: {
  profile: TrustProfile;
  total: number;
  dark: boolean;
  balanceVisible: boolean;
  onToggleBalance: () => void;
  onNotice: (message: string) => void;
}) {
  return (
    <>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNotice("Wallet switcher opened in simulation mode.")}
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
            { label: "Copy wallet address", icon: Copy },
            { label: "Show wallet QR", icon: QrCode },
            { label: "Share wallet link", icon: Link2 },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={() => onNotice(label + " is simulated.")}
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
  onNotice,
}: {
  dark: boolean;
  onDeposit: () => void;
  onNotice: (message: string) => void;
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
        onClick={() => onNotice("Funding banner dismissed in simulation.")}
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
            Move crypto into your simulated wallet
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
  onNotice,
}: {
  transactions: WalletActivity[];
  dark: boolean;
  currency: CurrencyCode;
  onNotice: (message: string) => void;
}) {
  return (
    <section className="mt-8">
      <SectionHeading
        dark={dark}
        action={
          <button type="button" onClick={() => onNotice("All activity opened in simulation mode.")} className={"text-xs font-bold " + (dark ? "text-[#75aefb]" : "text-[#397dd4]")}>
            See all
          </button>
        }
      >
        Recent activity
      </SectionHeading>
      <div className={"mt-2 divide-y rounded-2xl px-2 " + (dark ? "divide-white/10 bg-white/[.03]" : "divide-[#edf0f5] bg-white")}>
        {transactions.length === 0 ? (
          <p className={"px-3 py-5 text-sm " + (dark ? "text-white/45" : "text-[#8b96a8]")}>No simulated activity yet.</p>
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
                  {formatDate(transaction.date)} · Simulated
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
  onNotice,
  onSelectToken,
  onTransaction,
}: {
  tokens: WalletToken[];
  transactions: WalletActivity[];
  profile: TrustProfile;
  total: number;
  dark: boolean;
  balanceVisible: boolean;
  onToggleBalance: () => void;
  onSettings: () => void;
  onNotice: (message: string) => void;
  onSelectToken: (token: WalletToken) => void;
  onTransaction: (kind: TransactionKind) => void;
}) {
  const [query, setQuery] = useState("");
  const [assetMode, setAssetMode] = useState<"crypto" | "nfts">("crypto");
  const filteredTokens = tokens.filter((token) => {
    const normalized = query.trim().toLowerCase();
    return !normalized || token.name.toLowerCase().includes(normalized) || token.symbol.toLowerCase().includes(normalized);
  });

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
          onClick={() => onNotice("Notifications are simulated for this wallet.")}
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
          className={"min-w-0 flex-1 bg-transparent text-sm outline-none " + (dark ? "text-white placeholder:text-white/35" : "text-[#26344b] placeholder:text-[#9aa6b8]")}
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear token search" className="rounded-full">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>
      <WalletIdentity profile={profile} total={total} dark={dark} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} onNotice={onNotice} />
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
              } else {
                onNotice(label + " is available in simulation mode.");
              }
            }}
          />
        ))}
      </div>
      <FundingBanner dark={dark} onDeposit={() => onTransaction("receive")} onNotice={onNotice} />
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
                <button type="button" onClick={() => onNotice("Token management is simulated.")} className={"text-xs font-bold " + (dark ? "text-[#75aefb]" : "text-[#397dd4]")}>
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
            <p className={"mt-3 text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>No NFTs in this simulation</p>
            <p className={"mt-1 text-xs leading-5 " + (dark ? "text-white/45" : "text-[#8b96a8]")}>NFT support is shown as a preview only.</p>
          </div>
        )}
      </section>
      <ActivityPreview transactions={transactions} dark={dark} currency={profile.currency} onNotice={onNotice} />
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
        className={"h-12 w-full appearance-none rounded-2xl border px-4 pr-10 text-sm font-bold outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")}
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
  onNotice,
  onTransaction,
}: {
  tokens: WalletToken[];
  dark: boolean;
  onNotice: (message: string) => void;
  onTransaction: (kind: TransactionKind) => void;
}) {
  const [from, setFrom] = useState(tokens[0]?.symbol ?? "USDT");
  const [to, setTo] = useState(tokens[1]?.symbol ?? "BTC");
  const [amount, setAmount] = useState("");
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
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>Preview a swap using your simulated balances. Nothing is sent to a network.</p>
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
          <span>{fromToken && toToken ? "1 " + from + " ≈ " + formatAmount(fromToken.price / Math.max(toToken.price, 0.000001)) + " " + to : "Simulation rate"}</span>
        </div>
      </div>
      <button type="button" onClick={() => onNotice(output > 0 ? "Swap preview created. No real transaction was sent." : "Enter an amount to preview the swap.")} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white shadow-lg shadow-blue-500/20">
        Preview swap <ChevronRight className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onTransaction("receive")} className={"mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-bold " + (dark ? "border-white/10 text-white/70" : "border-[#e1e7f0] text-[#52627b]")}>
        Add simulated funds <Plus className="h-4 w-4" />
      </button>
      <div className={"mt-6 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#1c2129] text-white/45" : "bg-white text-[#7f8a9d] shadow-sm")}>
        <ShieldCheck className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        Trust-style simulation only. Wallet balances are stored locally on this device.
      </div>
    </section>
  );
}

function DiscoverScreen({
  tokens,
  dark,
  currency,
  onSelectToken,
  onNotice,
}: {
  tokens: WalletToken[];
  dark: boolean;
  currency: CurrencyCode;
  onSelectToken: (token: WalletToken) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <section>
      <p className={"text-xs font-black uppercase tracking-[.2em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Discover</p>
      <h1 className={"mt-2 text-3xl font-black tracking-tight " + (dark ? "text-white" : "text-[#1d2433]")}>Explore crypto</h1>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>Browse simulated market cards and open any asset for details.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          { title: "Market movers", body: "Assets with the biggest simulated changes.", color: "from-[#4e91f5] to-[#76c7ff]" },
          { title: "Learn crypto", body: "Helpful wallet tips, shown as a preview.", color: "from-[#8c65e8] to-[#d17bff]" },
        ].map((card) => (
          <button key={card.title} type="button" onClick={() => onNotice(card.title + " opened in simulation mode.")} className={"rounded-3xl bg-gradient-to-br p-4 text-left text-white " + card.color}>
            <Sparkles className="h-5 w-5" />
            <p className="mt-8 text-sm font-black">{card.title}</p>
            <p className="mt-1 text-xs leading-5 text-white/75">{card.body}</p>
          </button>
        ))}
      </div>
      <SectionHeading dark={dark} action={<button type="button" onClick={() => onNotice("Token list is already showing all simulated assets.")} className={"text-xs font-bold " + (dark ? "text-[#75aefb]" : "text-[#397dd4]")}>View all</button>}>
        Popular assets
      </SectionHeading>
      <div className={"mt-2 rounded-2xl p-2 " + (dark ? "bg-[#1c2129]" : "bg-white shadow-sm")}>
        {[...tokens].sort((a, b) => b.change24h - a.change24h).slice(0, 6).map((token) => (
          <TrustTokenRow key={token.id} token={token} currency={currency} dark={dark} onClick={() => onSelectToken(token)} />
        ))}
      </div>
    </section>
  );
}

function BrowserScreen({ dark, onNotice }: { dark: boolean; onNotice: (message: string) => void }) {
  const links = ["Trust-style help center", "Market overview", "Wallet safety guide"];
  return (
    <section>
      <p className={"text-xs font-black uppercase tracking-[.2em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Browser</p>
      <h1 className={"mt-2 text-3xl font-black tracking-tight " + (dark ? "text-white" : "text-[#1d2433]")}>Web3 browser</h1>
      <p className={"mt-3 text-sm leading-6 " + (dark ? "text-white/50" : "text-[#7f8a9d]")}>A safe, local preview of wallet browsing tools.</p>
      <div className={"mt-6 flex items-center gap-3 rounded-2xl px-4 py-3 " + (dark ? "bg-[#1c2129]" : "bg-white shadow-sm")}>
        <Globe className={"h-5 w-5 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        <input placeholder="Search a simulated website" className={"min-w-0 flex-1 bg-transparent text-sm outline-none " + (dark ? "text-white placeholder:text-white/35" : "text-[#303c50] placeholder:text-[#9aa6b8]")} />
        <button type="button" onClick={() => onNotice("Browser search is simulated.")} aria-label="Search browser" className={"rounded-full p-1 " + (dark ? "text-white/60" : "text-[#7c879a]")}>
          <Search className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {links.map((link, index) => (
          <button key={link} type="button" onClick={() => onNotice(link + " opened in simulation mode.")} className={"flex w-full items-center gap-3 rounded-2xl p-4 text-left " + (dark ? "bg-[#1c2129] hover:bg-[#232a34]" : "bg-white shadow-sm hover:bg-[#f4f7fb]")}>
            <span className={"grid h-10 w-10 place-items-center rounded-full " + (dark ? "bg-white/10 text-[#75aefb]" : "bg-[#eaf3ff] text-[#4e91f5]")}>
              {index === 0 ? <CircleHelp className="h-5 w-5" /> : index === 1 ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={"block text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>{link}</span>
              <span className={"mt-1 block text-xs " + (dark ? "text-white/40" : "text-[#8b96a8]")}>No external connection</span>
            </span>
            <ChevronRight className={"h-4 w-4 " + (dark ? "text-white/30" : "text-[#aab3c1]")} />
          </button>
        ))}
      </div>
      <div className={"mt-6 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#1c2129] text-white/45" : "bg-white text-[#7f8a9d] shadow-sm")}>
        <ShieldCheck className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        This browser does not request seed phrases, private keys, or real wallet connections.
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
      counterpartyLabel: counterparty.trim() || "Simulated contact",
      date: new Date(date + "T" + time).toISOString(),
    });
  };

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label="Add simulated transaction">
      <div className="flex items-center justify-between">
        <div>
          <p className={"text-xs font-black uppercase tracking-[.18em] " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")}>Simulation</p>
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
          <input required value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="any" placeholder="0.00" className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        </label>
        <label className="block">
          <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>{type === "send" ? "Recipient label" : "Sender label"}</span>
          <input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder="Example: Creator Wallet" className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Date</span>
            <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className={"h-12 w-full rounded-2xl border px-3 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
          </label>
          <label className="block">
            <span className={"mb-2 block text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Time</span>
            <input value={time} onChange={(event) => setTime(event.target.value)} type="time" className={"h-12 w-full rounded-2xl border px-3 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
          </label>
        </div>
        {error ? <p className="rounded-2xl bg-[#ffe7e9] px-4 py-3 text-sm font-semibold text-[#c8495d]">{error}</p> : null}
      <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#4e91f5] text-sm font-black text-white">
          Save simulated transaction <Check className="h-4 w-4" />
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
  onNotice,
}: {
  token: WalletToken;
  currency: CurrencyCode;
  dark: boolean;
  onClose: () => void;
  onTransaction: (kind: TransactionKind) => void;
  onNotice: (message: string) => void;
}) {
  return (
    <ModalBackdrop dark={dark} onClose={onClose} label={token.name + " details"} align="center">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TokenIcon token={token} size="large" />
          <div>
            <h2 className="text-2xl font-black">{token.name}</h2>
            <p className={"mt-1 text-sm " + (dark ? "text-white/45" : "text-[#8994a6]")}>{token.symbol} · Simulated asset</p>
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
        <svg viewBox="0 0 384 150" className="h-36 w-full" role="img" aria-label={"Simulated " + token.symbol + " price chart"}>
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
          {["1H", "1D", "1W", "1M", "1Y", "ALL"].map((period) => <button key={period} type="button" onClick={() => onNotice(period + " chart selected in simulation.")} className={period === "1D" ? "text-[#4e91f5]" : ""}>{period}</button>)}
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
}: {
  profile: TrustProfile;
  tokens: WalletToken[];
  dark: boolean;
  onClose: () => void;
  onSave: (profile: TrustProfile, balances: Record<string, number>) => void;
  onAddToken: () => void;
  onClearActivity: () => void;
}) {
  const [walletName, setWalletName] = useState(profile.walletName);
  const [currency, setCurrency] = useState<CurrencyCode>(profile.currency);
  const [appearance, setAppearance] = useState<Appearance>(profile.appearance);
  const [balances, setBalances] = useState<Record<string, string>>(() => Object.fromEntries(tokens.map((token) => [token.id, String(token.balance)])));

  return (
    <ModalBackdrop dark={dark} onClose={onClose} label="Trust Wallet simulation settings">
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
        <input value={walletName} onChange={(event) => setWalletName(event.target.value)} className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
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
          <select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className={"h-12 w-full appearance-none rounded-2xl border px-4 pr-10 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")}>
            {(Object.keys(currencySymbols) as CurrencyCode[]).map((code) => <option key={code} value={code}>{currencySymbols[code]} {code}</option>)}
          </select>
          <ChevronDown className={"pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 " + (dark ? "text-white/45" : "text-[#9aa6b8]")} />
        </div>
      </label>
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className={"text-xs font-bold " + (dark ? "text-white/45" : "text-[#929cad]")}>Simulated balances</p>
          <span className={"text-[10px] font-black uppercase tracking-widest " + (dark ? "text-white/30" : "text-[#a4aebb]")}>Local only</span>
        </div>
        <div className="mt-2 space-y-2">
          {tokens.map((token) => (
            <label key={token.id} className={"flex items-center gap-3 rounded-2xl p-2 " + (dark ? "bg-[#20252d]" : "bg-[#f7f9fc]")}>
              <TokenIcon token={token} size="small" />
              <span className={"w-14 text-sm font-bold " + (dark ? "text-white" : "text-[#303c50]")}>{token.symbol}</span>
              <input value={balances[token.id] ?? "0"} onChange={(event) => setBalances((current) => ({ ...current, [token.id]: event.target.value }))} inputMode="decimal" className={"h-10 min-w-0 flex-1 rounded-xl border px-3 text-right text-sm outline-none " + (dark ? "border-white/10 bg-[#2a3039] text-white" : "border-[#e2e8f1] bg-white text-[#303c50]")} />
            </label>
          ))}
        </div>
      </div>
      <button type="button" onClick={onAddToken} className={"mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-bold " + (dark ? "border-white/20 text-white/65 hover:bg-white/5" : "border-[#b9c9dd] text-[#52627b] hover:bg-[#f5f8fc]")}>
        <Plus className="h-4 w-4" /> Add simulated token
      </button>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClearActivity} className={"h-11 rounded-2xl border text-xs font-bold " + (dark ? "border-[#df5e70]/30 text-[#df8792]" : "border-[#ffd4d8] text-[#c8495d]")}>Clear activity</button>
        <button type="button" onClick={() => onSave({ walletName: walletName.trim() || "Main wallet", currency, appearance }, Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, Number(value) || 0])))} className="h-11 rounded-2xl bg-[#4e91f5] text-xs font-black text-white">Save settings</button>
      </div>
      <div className={"mt-5 flex gap-3 rounded-2xl p-4 text-xs leading-5 " + (dark ? "bg-[#20252d] text-white/45" : "bg-[#f4f7fb] text-[#7f8a9d]")}>
        <Palette className={"mt-0.5 h-4 w-4 shrink-0 " + (dark ? "text-[#75aefb]" : "text-[#4e91f5]")} />
        This is a Trust-style wallet simulation. It never asks for recovery phrases or private keys.
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
    <ModalBackdrop dark={dark} onClose={onClose} label="Add simulated token" align="center">
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
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        <input required value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Symbol, e.g. DEMO" className={"h-12 w-full rounded-2xl border px-4 text-sm uppercase outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
        <div className="grid grid-cols-2 gap-3">
          <input required type="number" min="0" step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
          <input required type="number" min="0" step="any" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" className={"h-12 w-full rounded-2xl border px-4 text-sm outline-none " + (dark ? "border-white/10 bg-[#20252d] text-white placeholder:text-white/25" : "border-[#e2e8f1] bg-white text-[#303c50] placeholder:text-[#aeb9c8]")} />
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

  return [
    make("BTC", { id: "btc", name: "Bitcoin", price: 69250, balance: 0.01, change24h: -2.46 }),
    make("ETH", { id: "eth", name: "Ethereum", price: 3720, balance: 0.05, change24h: -3.56 }),
    make("BNB", { id: "bnb", name: "BNB", price: 650, balance: 0.3, change24h: -1.22 }),
    make("MATIC", { id: "matic", name: "Polygon", price: 0.25, balance: 200, change24h: 1.04 }),
    make("USDC", { id: "usdc", name: "USD Coin", price: 1, balance: 45, change24h: 0.46 }),
    make("USDT", { id: "usdt", name: "Tether", price: 1, balance: 59.7, change24h: 0.42 }),
    make("SOL", { id: "sol", name: "Solana", price: 73.38, balance: 0.01, change24h: -3.13 }),
  ];
}

const defaultTrustTransactions: WalletActivity[] = [
  {
    id: "trust-seed-1",
    type: "receive",
    tokenSymbol: "USDC",
    amount: 45,
    counterpartyLabel: "Simulation",
    date: "2026-05-15T14:16:00.000Z",
    status: "completed",
    note: "SIMULATED TRANSACTION",
  },
  {
    id: "trust-seed-2",
    type: "send",
    tokenSymbol: "SOL",
    amount: 0.02,
    counterpartyLabel: "Simulation",
    date: "2026-04-14T22:07:00.000Z",
    status: "completed",
    note: "SIMULATED TRANSACTION",
  },
];

export function TrustWallet() {
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

  useLivePrices(trustLiveSymbols, (prices, changes) => {
    setTokens((current) =>
      current.map((token) => ({
        ...token,
        price: prices[token.symbol] ?? token.price,
        change24h: changes[token.symbol] ?? token.change24h,
      })),
    );
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedTokens = readStorage<WalletToken[]>(TRUST_TOKENS_KEY, []);
      const storedTransactions = readStorage<WalletActivity[]>(TRUST_TRANSACTIONS_KEY, []);
      const storedProfile = readStorage<TrustProfile>(TRUST_PROFILE_KEY, defaultTrustProfile);
      const nextTokens = storedTokens.length > 0 ? storedTokens : createTrustTokens();
      const nextTransactions = storedTransactions.length > 0 ? storedTransactions : defaultTrustTransactions;
      setTokens(nextTokens);
      setTransactions(nextTransactions);
      setProfile({ ...defaultTrustProfile, ...storedProfile });
      if (storedTokens.length === 0) writeStorage(TRUST_TOKENS_KEY, nextTokens);
      if (storedTransactions.length === 0) writeStorage(TRUST_TRANSACTIONS_KEY, nextTransactions);
      if (storedProfile === defaultTrustProfile) writeStorage(TRUST_PROFILE_KEY, defaultTrustProfile);
    }, 0);

    document.documentElement.dataset.walletTheme = "trust";
    return () => {
      window.clearTimeout(timeoutId);
      delete document.documentElement.dataset.walletTheme;
    };
  }, []);

  const dark = profile.appearance === "dark";
  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.price * token.balance, 0), [tokens]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const saveSettings = (nextProfile: TrustProfile, balances: Record<string, number>) => {
    const nextTokens = tokens.map((token) => balances[token.id] === undefined ? token : { ...token, balance: Math.max(0, balances[token.id]), updatedAt: new Date().toISOString() });
    setTokens(nextTokens);
    setProfile(nextProfile);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    writeStorage(TRUST_PROFILE_KEY, nextProfile);
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
    setAddTokenOpen(false);
    setSettingsOpen(false);
    notify(nextToken.symbol + " added to your simulated wallet.");
  };

  const clearActivity = () => {
    setTransactions([]);
    writeStorage(TRUST_TRANSACTIONS_KEY, []);
    setSettingsOpen(false);
    notify("Simulated activity cleared.");
  };

  const handleTransaction = (input: { type: TransactionKind; tokenSymbol: string; amount: number; counterpartyLabel: string; date: string }) => {
    const currentToken = tokens.find((token) => token.symbol === input.tokenSymbol);
    if (!currentToken) return;
    if (input.type === "send" && input.amount > currentToken.balance) {
      notify("Not enough simulated balance for this send.");
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
      note: "SIMULATED TRANSACTION",
    };
    const nextTransactions = [record, ...transactions];
    setTokens(nextTokens);
    setTransactions(nextTransactions);
    writeStorage(TRUST_TOKENS_KEY, nextTokens);
    writeStorage(TRUST_TRANSACTIONS_KEY, nextTransactions);
    setTransactionKind(null);
    setSelectedToken(null);
    notify((input.type === "receive" ? "Received " : "Sent ") + formatAmount(input.amount) + " " + input.tokenSymbol + " in simulation.");
  };

  return (
    <main className={"min-h-[100dvh] " + (dark ? "bg-[#07101c]" : "bg-[#07162a]")}>
      <div className={"relative mx-auto h-[100dvh] w-full max-w-[35rem] overflow-hidden shadow-2xl " + (dark ? "bg-[#101319] text-white" : "bg-[#f6f8fc] text-[#1d2433]")}>
        <div className={"pointer-events-none absolute inset-0 " + (dark ? "bg-[radial-gradient(circle_at_80%_12%,rgba(84,139,255,.16),transparent_32%)]" : "bg-[radial-gradient(circle_at_80%_8%,rgba(78,145,245,.11),transparent_32%)]")} />
        <div className="relative h-full overflow-y-auto px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          {tab === "home" ? (
            <TrustHome
              tokens={tokens}
              transactions={transactions}
              profile={profile}
              total={total}
              dark={dark}
              balanceVisible={balanceVisible}
              onToggleBalance={() => setBalanceVisible((visible) => !visible)}
              onSettings={() => setSettingsOpen(true)}
              onNotice={notify}
              onSelectToken={setSelectedToken}
              onTransaction={setTransactionKind}
            />
          ) : tab === "swap" ? (
            <SwapScreen tokens={tokens} dark={dark} onNotice={notify} onTransaction={setTransactionKind} />
          ) : tab === "discover" ? (
            <DiscoverScreen tokens={tokens} dark={dark} currency={profile.currency} onSelectToken={setSelectedToken} onNotice={notify} />
          ) : (
            <BrowserScreen dark={dark} onNotice={notify} />
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
        {settingsOpen ? <SettingsModal profile={profile} tokens={tokens} dark={dark} onClose={() => setSettingsOpen(false)} onSave={saveSettings} onAddToken={() => { setSettingsOpen(false); setAddTokenOpen(true); }} onClearActivity={clearActivity} /> : null}
        {addTokenOpen ? <AddTokenModal dark={dark} onClose={() => setAddTokenOpen(false)} onSave={addToken} /> : null}
        {transactionKind ? <TransactionModal kind={transactionKind} tokens={tokens} dark={dark} onClose={() => setTransactionKind(null)} onSubmit={handleTransaction} /> : null}
        {selectedToken ? <TokenDetailModal token={selectedToken} currency={profile.currency} dark={dark} onClose={() => setSelectedToken(null)} onTransaction={setTransactionKind} onNotice={notify} /> : null}
        {notice ? <Notice message={notice} dark={dark} /> : null}
        <span className={"pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[.25em] " + (dark ? "text-white/15" : "text-[#aeb8c6]")}>Simulation</span>
      </div>
    </main>
  );
}
