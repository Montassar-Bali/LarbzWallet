"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Bell,
  Check,
  ChevronRight,
  Compass,
  CreditCard,
  Home,
  Eye,
  EyeOff,
  LineChart,
  Plus,
  Repeat2,
  Settings,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { liveMarketSymbols, walletMarketSymbols } from "@/config/tokens";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import { useWalletRuntime } from "@/components/wallet/wallet-runtime";
import { tokensForWalletAccount, walletLedgerEvent } from "@/lib/wallet-ledger";
import {
  applyLiveMarketSnapshot,
  emptyLiveMarketSnapshot,
  mergeCanonicalWalletCatalogue,
  type LiveMarketSnapshot,
} from "@/lib/wallet-market";

const LEDGER_TOKENS_KEY = "larpz_ledger_tokens";
const LEDGER_TRANSACTIONS_KEY = "larpz_ledger_transactions";
const LEDGER_FEATURES_KEY = "larpz_ledger_features";

const portfolioSymbols = walletMarketSymbols;

const currencies = [
  { code: "USD", label: "$ USD", rate: 1 },
  { code: "EUR", label: "€ EUR", rate: 0.92 },
  { code: "GBP", label: "£ GBP", rate: 0.78 },
  { code: "CAD", label: "CA$ CAD", rate: 1.37 },
  { code: "AUD", label: "A$ AUD", rate: 1.52 },
  { code: "JPY", label: "¥ JPY", rate: 147 },
  { code: "CNY", label: "¥ CNY", rate: 7.2 },
  { code: "INR", label: "₹ INR", rate: 83.5 },
  { code: "BRL", label: "R$ BRL", rate: 5.1 },
  { code: "SEK", label: "kr SEK", rate: 10.7 },
  { code: "NOK", label: "kr NOK", rate: 10.9 },
  { code: "CHF", label: "CHF CHF", rate: 0.88 },
] as const;

type CurrencyCode = (typeof currencies)[number]["code"];
type LedgerView = "home" | "assets" | "history" | "market" | "swap" | "earn" | "card";
type BottomTab = "Home" | "Swap" | "Earn" | "Card";
type TransactionType = "receive" | "send";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function tokenForSymbol(tokens: WalletToken[], symbol: string) {
  return tokens.find((token) => token.symbol === symbol);
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
    <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-[534px] rounded-full border border-white/10 bg-[#242424]/95 p-1.5 shadow-2xl backdrop-blur-xl">
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

function CurrencyPicker({ selected, onSelect, onClose }: { selected: CurrencyCode; onSelect: (currency: CurrencyCode) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#1b1823] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-lg font-bold">Currency</h2>
          <button type="button" aria-label="Close currency picker" onClick={onClose} className="text-white/60 hover:text-white"><X size={20} /></button>
        </div>
        <div className="max-h-[65dvh] overflow-y-auto p-2">
          {currencies.map((currency) => (
            <button
              key={currency.code}
              type="button"
              onClick={() => onSelect(currency.code)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-lg transition hover:bg-white/[0.08]"
            >
              <span className="w-5 text-center text-white/80">{selected === currency.code ? <Check size={19} /> : null}</span>
              <span>{currency.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PortfolioModal({
  tokens,
  editValues,
  currency,
  proKey,
  onChangeValue,
  onChangeProKey,
  onCurrency,
  onAddCustom,
  onSave,
  onClose,
}: {
  tokens: WalletToken[];
  editValues: Record<string, string>;
  currency: CurrencyCode;
  proKey: boolean;
  onChangeValue: (symbol: string, value: string) => void;
  onChangeProKey: (value: boolean) => void;
  onCurrency: () => void;
  onAddCustom: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <section className="max-h-[94dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[2rem] border border-[#413052] bg-[#171322] p-5 pb-8 shadow-2xl sm:rounded-[2rem] sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold">Edit Portfolio</h2>
          <button type="button" aria-label="Close portfolio editor" onClick={onClose} className="text-white/65 hover:text-white"><X size={22} /></button>
        </div>

        <div className="space-y-2">
          {portfolioSymbols.map((symbol) => (
            <label key={symbol} className="flex items-center gap-3 border-b border-white/6 py-2.5">
              <span className="w-14 shrink-0 text-sm font-bold text-white/65">{symbol}</span>
              <input
                type="number"
                inputMode="decimal"
                value={editValues[symbol] ?? "0"}
                onChange={(event) => onChangeValue(symbol, event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-right text-base text-white outline-none transition focus:border-[#a188ff]"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 border-b border-white/6 py-2.5">
          <span className="w-14 shrink-0 text-sm font-bold text-white/65">Curr.</span>
          <button type="button" onClick={onCurrency} className="flex flex-1 items-center justify-between rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-left text-base">
            <span>{currencies.find((item) => item.code === currency)?.label}</span><ChevronRight size={18} className="rotate-90 text-white/55" />
          </button>
        </div>

        <label className="flex items-center gap-3 border-b border-white/6 py-3">
          <span className="w-14 shrink-0 text-sm font-bold text-white/65">Pro Key</span>
          <input type="checkbox" checked={proKey} onChange={(event) => onChangeProKey(event.target.checked)} className="size-5 accent-[#b7a5ff]" />
        </label>

        <CustomTokenSection tokens={tokens} onAdd={onAddCustom} />

        <div className="mt-5 flex items-center gap-3 border-t border-white/6 pt-4">
          <span className="w-14 shrink-0 text-sm font-bold text-white/65">Language</span>
          <span className="flex-1 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base text-white/80">EN - English</span>
        </div>

        <button type="button" onClick={onSave} className="mt-5 w-full rounded-xl bg-[#b8a5ff] py-3.5 text-base font-bold text-[#15101e] transition hover:bg-[#c8baff] active:scale-[0.99]">Save</button>
      </section>
    </div>
  );
}

function CustomTokenSection({ tokens, onAdd }: { tokens: WalletToken[]; onAdd: () => void }) {
  const customTokens = tokens.filter((token) => !portfolioSymbols.includes(token.symbol));

  return (
    <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.025] p-3">
      <p className="mb-3 text-xs font-bold tracking-[0.14em] text-white/55">CUSTOM TOKENS</p>
      {customTokens.length > 0 ? (
        <div className="mb-3 space-y-2">
          {customTokens.map((token) => <div key={token.id} className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2 text-sm"><span>{token.name} ({token.symbol})</span><span className="text-white/60">{formatAmount(token.balance, token.symbol)}</span></div>)}
        </div>
      ) : null}
      <button type="button" onClick={onAdd} className="w-full rounded-xl border border-dashed border-white/15 px-3 py-3 text-sm font-semibold text-white/70 transition hover:border-[#a188ff] hover:text-white">+ Add Token</button>
    </div>
  );
}

function CustomTokenModal({ onSave, onClose }: { onSave: (token: { name: string; symbol: string; price: number; balance: number }) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("1");
  const [balance, setBalance] = useState("0");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !symbol.trim()) {
      return;
    }

    onSave({ name: name.trim(), symbol: symbol.trim().toUpperCase(), price: Number(price) || 0, balance: Number(balance) || 0 });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-[390px] rounded-[2rem] border border-[#413052] bg-[#171322] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Add Custom Token</h2><button type="button" aria-label="Close custom token form" onClick={onClose} className="text-white/65"><X size={21} /></button></div>
        <div className="space-y-3">
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" className="w-full rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base outline-none focus:border-[#a188ff]" />
          <input required value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Symbol, e.g. SPX" className="w-full rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base uppercase outline-none focus:border-[#a188ff]" />
          <input type="number" min="0" step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price" className="w-full rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base outline-none focus:border-[#a188ff]" />
          <input type="number" min="0" step="any" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" className="w-full rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base outline-none focus:border-[#a188ff]" />
        </div>
        <button type="submit" className="mt-5 w-full rounded-xl bg-[#b8a5ff] py-3.5 font-bold text-[#15101e]">Add Token</button>
      </form>
    </div>
  );
}

function TransactionModal({
  type,
  crypto,
  amount,
  date,
  time,
  tokens,
  onType,
  onCrypto,
  onAmount,
  onDate,
  onTime,
  onSubmit,
  onClear,
  onClose,
}: {
  type: TransactionType;
  crypto: string;
  amount: string;
  date: string;
  time: string;
  tokens: WalletToken[];
  onType: (type: TransactionType) => void;
  onCrypto: (value: string) => void;
  onAmount: (value: string) => void;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={onSubmit} className="w-full max-w-[520px] rounded-t-[2rem] border border-[#413052] bg-[#171322] p-5 pb-8 shadow-2xl sm:rounded-[2rem] sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Add Transaction</h2><button type="button" aria-label="Close transaction form" onClick={onClose} className="text-white/65"><X size={22} /></button></div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-[#292436] p-1">
          {(["receive", "send"] as const).map((item) => <button key={item} type="button" onClick={() => onType(item)} className={`rounded-lg py-3 text-sm font-bold capitalize transition ${type === item ? "bg-[#a995f2] text-[#15101e]" : "text-white/65"}`}>{item === "receive" ? "Received" : "Sent"}</button>)}
        </div>
        <div className="space-y-3">
          <label className="grid grid-cols-[5rem_1fr] items-center gap-3"><span className="text-sm font-bold text-white/60">Crypto</span><select value={crypto} onChange={(event) => onCrypto(event.target.value)} className="min-w-0 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base text-white outline-none focus:border-[#a188ff]">{tokens.map((token) => <option key={token.symbol} value={token.symbol}>{token.symbol} - {token.name}</option>)}</select></label>
          <label className="grid grid-cols-[5rem_1fr] items-center gap-3"><span className="text-sm font-bold text-white/60">Amount</span><input required min="0" step="any" type="number" inputMode="decimal" value={amount} onChange={(event) => onAmount(event.target.value)} placeholder="0.00" className="min-w-0 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-right text-base outline-none focus:border-[#a188ff]" /></label>
          <label className="grid grid-cols-[5rem_1fr] items-center gap-3"><span className="text-sm font-bold text-white/60">Date</span><input required type="date" value={date} onChange={(event) => onDate(event.target.value)} className="min-w-0 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base outline-none focus:border-[#a188ff]" /></label>
          <label className="grid grid-cols-[5rem_1fr] items-center gap-3"><span className="text-sm font-bold text-white/60">Time</span><input required type="time" value={time} onChange={(event) => onTime(event.target.value)} className="min-w-0 rounded-xl border border-white/8 bg-[#292436] px-3 py-3 text-base outline-none focus:border-[#a188ff]" /></label>
        </div>
        <button type="submit" className="mt-6 w-full rounded-xl bg-[#b8a5ff] py-3.5 font-bold text-[#15101e]">Add Transaction</button>
        <button type="button" onClick={onClear} className="mt-3 w-full rounded-xl border border-[#a85b67]/40 py-3.5 font-bold text-[#e57983]">Clear transactions</button>
      </form>
    </div>
  );
}

function HomeScreen({
  tokens,
  records,
  currency,
  rate,
  total,
  onEdit,
  onTransaction,
  onExplore,
  onSwap,
  onAssets,
  onHistory,
  onAccounts,
  onToken,
}: {
  tokens: WalletToken[];
  records: WalletActivity[];
  currency: CurrencyCode;
  rate: number;
  total: number;
  onEdit: () => void;
  onTransaction: (type: TransactionType) => void;
  onExplore: () => void;
  onSwap: () => void;
  onAssets: () => void;
  onHistory: () => void;
  onAccounts: () => void;
  onToken: (token: WalletToken) => void;
}) {
  const visibleTokens = useMemo(() => {
    return [...tokens].sort((a, b) => b.balance * b.price - a.balance * a.price || a.name.localeCompare(b.name)).slice(0, 8);
  }, [tokens]);

  const change = total === 0 ? 0 : visibleTokens.reduce((sum, token) => sum + token.change24h * token.balance * token.price, 0) / Math.max(total, 1);

  return (
    <main className="relative space-y-6 overflow-hidden px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7">
      <div className="pointer-events-none absolute inset-x-[-26%] top-0 h-[430px] opacity-90" style={{ backgroundImage: "radial-gradient(circle at 78% 19%, rgba(236, 58, 171, .28), transparent 35%), radial-gradient(circle at 38% 42%, rgba(139, 54, 172, .22), transparent 53%), radial-gradient(circle, rgba(255, 108, 191, .36) 1px, transparent 1.4px)", backgroundSize: "auto, auto, 8px 8px" }} />
      <section className="relative px-1 pb-1 pt-1">
        <div className="relative flex items-center justify-between px-1">
          <IconButton icon={Wallet} label="Edit portfolio" onClick={onEdit} />
          <div className="flex gap-2">
            <IconButton icon={Compass} label="Explore" onClick={onExplore} />
            <IconButton icon={Bell} label="Notifications" onClick={onHistory} />
            <IconButton icon={Settings} label="Edit portfolio" onClick={onEdit} />
          </div>
        </div>

        <div className="relative px-1 pb-3 pt-9 text-center">
          <div className="relative mb-4 flex justify-center">
            <span className="rounded-full border border-[#a995f2]/25 bg-[#a995f2]/10 px-2.5 py-1 text-[0.58rem] font-bold tracking-[0.14em] text-[#c9bbff]">
              Demo · No real funds
            </span>
          </div>
          <div className="flex items-end justify-center gap-1 overflow-hidden">
            <span className="truncate text-[clamp(2rem,10.5vw,4.3rem)] font-bold leading-none tracking-[-0.07em]">{formatMoney(total, currency)}</span>
          </div>
          <button type="button" onClick={onAssets} className="mt-5 rounded-full bg-[#4a484b] px-5 py-2 text-sm font-bold text-white/80 transition hover:bg-[#5a575b]">
            {change >= 0 ? "+" : ""}{change.toFixed(2)}% · Today <ChevronRight className="ml-1 inline-block" size={17} />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <ActionButton icon={ArrowDownUp} label="Transfer" onClick={() => onTransaction("send")} />
        <ActionButton icon={Repeat2} label="Swap" onClick={onSwap} />
        <ActionButton icon={Plus} label="Buy" onClick={() => onTransaction("receive")} />
      </section>

      <section>
        <button type="button" onClick={onExplore} className="mb-3 flex items-center gap-1 text-left text-[clamp(1.2rem,5vw,1.55rem)] font-bold">Explore the market <ChevronRight size={22} /></button>
        <div className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MarketCard symbol="Mood" change="Neutral" mood onClick={onExplore} />
          <MarketCard symbol="View All" change="" viewAll onClick={onExplore} />
          {total > 0 ? (
            <>
              <MarketCard symbol="FLR" change="+4.77%" onClick={onExplore} />
              <MarketCard symbol="CHZ" change="+2.10%" onClick={onExplore} />
              <MarketCard symbol="HYPE" change="+0.39%" onClick={onExplore} />
              <MarketCard symbol="SUI" change="-1.08%" onClick={onExplore} />
            </>
          ) : null}
        </div>
      </section>

      <section>
        <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/40 p-1">
          <button type="button" className="rounded-lg bg-[#090909] py-3 text-sm font-bold">Assets</button>
          <button type="button" onClick={onAccounts} className="rounded-lg py-3 text-sm font-bold text-white/75 hover:text-white">Accounts</button>
        </div>
        <div className="mt-4 space-y-1">
          {visibleTokens.map((token) => <AssetRow key={token.id} token={token} currency={currency} rate={rate} onClick={() => onToken(token)} />)}
        </div>
        <button type="button" onClick={onAssets} className="mt-3 flex w-full items-center justify-center rounded-full border border-white/35 py-4 text-base font-bold transition hover:bg-white/[0.05]">See all assets</button>
      </section>

      <section>
        <button type="button" onClick={onHistory} className="mb-2 text-left text-sm font-bold tracking-wide text-white/55">TRANSACTION HISTORY</button>
        {records.length > 0 ? (
          <div className="divide-y divide-white/8 rounded-xl bg-black/15">{records.slice(0, 2).map((record) => <HistoryRow key={record.id} record={record} currency={currency} rate={rate} tokens={tokens} />)}</div>
        ) : <div className="h-16" aria-hidden="true" />}
      </section>
    </main>
  );
}

function ScreenHeader({ eyebrow, title, onHome }: { eyebrow: string; title: string; onHome: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onHome} aria-label="Back to Ledger home" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.14]">
        <ArrowLeft size={21} />
      </button>
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-[0.18em] text-white/45">{eyebrow}</p>
        <h1 className="mt-1 truncate text-3xl font-bold">{title}</h1>
      </div>
    </div>
  );
}

function MarketScreen({ tokens, currency, rate, onToken, onHome }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHome: () => void }) {
  const movers = [...tokens].sort((a, b) => b.change24h - a.change24h || b.price - a.price);

  return (
    <main className="space-y-6 px-4 pb-28 pt-6 sm:px-7">
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
          {movers.map((token) => <AssetRow key={token.id} token={{ ...token, balance: 1 }} currency={currency} rate={rate} onClick={() => onToken(token)} />)}
        </div>
      </section>
    </main>
  );
}

function SwapScreen({ tokens, currency, initialFrom, onHome, onSwap }: { tokens: WalletToken[]; currency: CurrencyCode; initialFrom?: string; onHome: () => void; onSwap: (from: string, to: string, amount: number) => boolean }) {
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fromToken || !toToken || !canSwap) return;
    if (onSwap(fromToken.symbol, toToken.symbol, numericAmount)) setAmount("");
  }

  return (
    <main className="space-y-6 px-4 pb-28 pt-6 sm:px-7">
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
          <p className="mt-4 text-sm text-white/45">{toToken ? formatMoney(output * toToken.price, currency) : "—"} · 0.3% exchange fee</p>
        </section>

        <button type="submit" disabled={!canSwap} className="w-full rounded-2xl bg-[#b8a5ff] py-4 text-base font-bold text-[#15101e] transition enabled:hover:bg-[#c8baff] disabled:cursor-not-allowed disabled:opacity-35">
          {!numericAmount ? "Enter an amount" : numericAmount > (fromToken?.balance ?? 0) ? "Insufficient balance" : "Review swap"}
        </button>
      </form>
    </main>
  );
}

function EarnScreen({ tokens, positions, onHome, onStart, onWithdraw }: { tokens: WalletToken[]; positions: Record<string, number>; onHome: () => void; onStart: (symbol: string, amount: number) => boolean; onWithdraw: (symbol: string) => void }) {
  const eligible = tokens.filter((token) => token.price > 0);
  const firstAvailable = eligible.find((token) => token.balance > 0) ?? eligible[0];
  const [symbol, setSymbol] = useState(firstAvailable?.symbol ?? "");
  const [amount, setAmount] = useState("");
  const token = tokenForSymbol(eligible, symbol) ?? firstAvailable;
  const activePositions = Object.entries(positions).filter(([, value]) => value > 0);
  const annualRate = symbol === "USDT" || symbol === "USDC" ? 4.8 : symbol === "SOL" ? 6.1 : 3.2;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (token && onStart(token.symbol, numericAmount)) setAmount("");
  }

  return (
    <main className="space-y-6 px-4 pb-28 pt-6 sm:px-7">
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
    <main className="space-y-6 px-4 pb-28 pt-6 sm:px-7">
      <ScreenHeader eyebrow="LEDGER CARD" title="Card" onHome={onHome} />
      <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-br from-[#b8a5ff] via-[#735fa9] to-[#282033] p-6 text-[#17111f] shadow-2xl">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-start justify-between"><p className="text-lg font-black tracking-[0.12em]">LEDGER</p><CreditCard size={28} /></div>
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

function TokenDetailModal({ token, currency, rate, onClose, onTransfer, onReceive, onSwap }: { token: WalletToken; currency: CurrencyCode; rate: number; onClose: () => void; onTransfer: () => void; onReceive: () => void; onSwap: () => void }) {
  const value = token.balance * token.price * rate;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <section className="w-full max-w-[520px] rounded-t-[2rem] border border-white/10 bg-[#171717] p-6 pb-8 shadow-2xl sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between"><div className="flex items-center gap-3"><TokenIcon token={token} /><div><h2 className="text-xl font-bold">{token.name}</h2><p className="text-sm text-white/45">{token.symbol}</p></div></div><button type="button" aria-label="Close asset details" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-white/[0.08]"><X size={20} /></button></div>
        <div className="mt-8 rounded-2xl bg-black/25 p-5"><p className="text-sm text-white/50">Your balance</p><p className="mt-2 text-3xl font-bold">{formatAmount(token.balance, token.symbol)} {token.symbol}</p><p className="mt-2 text-lg text-white/60">{formatMoney(value, currency)}</p></div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-black/25 p-4"><div><p className="text-xs text-white/45">PRICE</p><p className="mt-1 font-bold">{formatMoney(token.price * rate, currency)}</p></div><div><p className="text-xs text-white/45">24H CHANGE</p><p className={`mt-1 font-bold ${token.change24h >= 0 ? "text-[#73d27f]" : "text-[#d87888]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</p></div></div>
        <div className="mt-5 grid grid-cols-3 gap-2"><button type="button" onClick={onTransfer} className="rounded-xl bg-[#292929] py-3 text-sm font-bold">Transfer</button><button type="button" onClick={onReceive} className="rounded-xl bg-[#292929] py-3 text-sm font-bold">Buy</button><button type="button" onClick={onSwap} className="rounded-xl bg-[#b8a5ff] py-3 text-sm font-bold text-[#15101e]">Swap</button></div>
      </section>
    </div>
  );
}

function AssetsScreen({ tokens, currency, rate, onToken, onHome }: { tokens: WalletToken[]; currency: CurrencyCode; rate: number; onToken: (token: WalletToken) => void; onHome: () => void }) {
  return (
    <main className="space-y-5 px-4 pb-28 pt-6 sm:px-7">
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
    <main className="space-y-5 px-4 pb-28 pt-6 sm:px-7">
      <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.18em] text-white/45">ACTIVITY</p><h1 className="mt-1 text-3xl font-bold">Transaction history</h1></div><button type="button" onClick={onAdd} className="flex size-11 items-center justify-center rounded-full bg-[#a995f2] text-black"><Plus size={22} /></button></div>
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
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [customTokenOpen, setCustomTokenOpen] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [proKey, setProKey] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>("receive");
  const [transactionCrypto, setTransactionCrypto] = useState("BTC");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [transactionTime, setTransactionTime] = useState("");
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [preferredSwapSymbol, setPreferredSwapSymbol] = useState<string>();
  const [features, setFeatures] = useState<LedgerFeatures>(defaultLedgerFeatures);
  const [notice, setNotice] = useState("");

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
  });

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
      const storedRecords = readStorage<WalletActivity[]>(LEDGER_TRANSACTIONS_KEY, []);
      setRecords(storedRecords);
    }, 0);

    const refreshSharedWallet = () => {
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(readStorage<WalletToken[]>(LEDGER_TOKENS_KEY, [])),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
      setRecords(readStorage<WalletActivity[]>(LEDGER_TRANSACTIONS_KEY, []));
    };
    window.addEventListener(walletLedgerEvent, refreshSharedWallet);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(walletLedgerEvent, refreshSharedWallet);
    };
  }, []);

  useEffect(() => {
    if (!runtime.state || !runtime.currentAccount) return;
    const timeoutId = window.setTimeout(() => {
      const next = applyLiveMarketSnapshot(
        mergeCanonicalWalletCatalogue(
          tokensForWalletAccount(tokensRef.current, runtime.state!, runtime.currentAccount!),
        ),
        latestMarketSnapshot.current,
      );
      tokensRef.current = next;
      setTokens(next);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount, runtime.state]);

  useEffect(() => {
    if (!runtime.currentAccount) return;
    const accountId = runtime.currentAccount.id;
    const timeoutId = window.setTimeout(() => {
      setFeatures(readStorage<LedgerFeatures>(`${LEDGER_FEATURES_KEY}:${accountId}`, defaultLedgerFeatures));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount]);

  const selectedCurrency = currencies.find((item) => item.code === currency) ?? currencies[0];
  const total = tokens.reduce((sum, token) => sum + (token.balance + (features.earnPositions[token.symbol] ?? 0)) * token.price * selectedCurrency.rate, 0);

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

  function updateRuntimeBalances(next: WalletToken[]) {
    persistTokens(next);
    runtime.replaceCurrentBalances(Object.fromEntries(next.map((token) => [token.symbol, token.balance])));
  }

  function goHome() {
    setView("home");
    setActiveTab("Home");
  }

  function openSwap(symbol?: string) {
    setSelectedToken(null);
    setPreferredSwapSymbol(symbol);
    setView("swap");
    setActiveTab("Swap");
  }

  function openPortfolio() {
    const values: Record<string, string> = {};
    for (const symbol of portfolioSymbols) values[symbol] = String(tokenForSymbol(tokens, symbol)?.balance ?? 0);
    setEditValues(values);
    setPortfolioOpen(true);
  }

  function savePortfolio() {
    const next = tokens.map((token) => portfolioSymbols.includes(token.symbol) && editValues[token.symbol] !== undefined ? { ...token, balance: Math.max(0, Number(editValues[token.symbol]) || 0) } : token);
    updateRuntimeBalances(next);
    setPortfolioOpen(false);
    notify("Portfolio saved");
  }

  function addCustomToken(input: { name: string; symbol: string; price: number; balance: number }) {
    const existing = tokenForSymbol(tokens, input.symbol);
    const token: WalletToken = {
      id: existing?.id ?? createId("ledger-token"),
      name: input.name,
      symbol: input.symbol,
      price: input.price,
      balance: input.balance,
      change24h: 0,
      image: "",
      updatedAt: new Date().toISOString(),
    };
    const nextTokens = existing ? tokens.map((item) => item.id === existing.id ? token : item) : [...tokens, token];
    runtime.updateMarketAssets(nextTokens);
    updateRuntimeBalances(nextTokens);
    setCustomTokenOpen(false);
    notify(`${input.symbol} added to portfolio`);
  }

  function openTransaction(type: TransactionType = "receive") {
    if (type === "send") runtime.openTransfer();
    else runtime.openReceive();
  }

  function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(transactionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Enter an amount greater than zero");
      return;
    }

    const token = tokenForSymbol(tokens, transactionCrypto);
    const date = new Date(`${transactionDate || today()}T${transactionTime || nowTime()}`).toISOString();
    const record: WalletActivity = {
      id: createId("ledger-act"),
      type: transactionType,
      tokenSymbol: transactionCrypto,
      amount,
      counterpartyLabel: transactionType === "receive" ? "Manual sender" : "Manual recipient",
      date,
      status: "completed",
      note: "MANUAL TRANSACTION",
    };
    const nextRecords = [record, ...records];
    setRecords(nextRecords);
    writeStorage(LEDGER_TRANSACTIONS_KEY, nextRecords);
    if (token) {
      const nextBalance = transactionType === "receive" ? token.balance + amount : Math.max(0, token.balance - amount);
      persistTokens(tokens.map((item) => item.id === token.id ? { ...item, balance: nextBalance } : item));
    }
    setTransactionOpen(false);
    notify(`${transactionType === "receive" ? "Received" : "Sent"} transaction added`);
  }

  function clearTransactions() {
    setRecords([]);
    writeStorage(LEDGER_TRANSACTIONS_KEY, []);
    setTransactionOpen(false);
    notify("Transaction history cleared");
  }

  function completeSwap(fromSymbol: string, toSymbol: string, amount: number) {
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
    updateRuntimeBalances(nextTokens);

    const timestamp = new Date().toISOString();
    const nextRecords: WalletActivity[] = [
      { id: createId("ledger-swap-in"), type: "receive", tokenSymbol: toSymbol, amount: received, counterpartyLabel: `${fromSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
      { id: createId("ledger-swap-out"), type: "send", tokenSymbol: fromSymbol, amount, counterpartyLabel: `${toSymbol} swap`, date: timestamp, status: "completed", note: "TOKEN SWAP" },
      ...records,
    ];
    setRecords(nextRecords);
    writeStorage(LEDGER_TRANSACTIONS_KEY, nextRecords);
    notify(`Swapped ${formatAmount(amount, fromSymbol)} ${fromSymbol} for ${formatAmount(received, toSymbol)} ${toSymbol}`);
    return true;
  }

  function startEarning(symbol: string, amount: number) {
    const token = tokenForSymbol(tokens, symbol);
    if (!token || !Number.isFinite(amount) || amount <= 0) {
      notify("Enter an amount greater than zero");
      return false;
    }
    if (amount > token.balance) {
      notify(`Not enough ${symbol}`);
      return false;
    }
    updateRuntimeBalances(tokens.map((item) => item.symbol === symbol ? { ...item, balance: item.balance - amount } : item));
    persistFeatures({ ...features, earnPositions: { ...features.earnPositions, [symbol]: (features.earnPositions[symbol] ?? 0) + amount } });
    notify(`${formatAmount(amount, symbol)} ${symbol} moved to Earn`);
    return true;
  }

  function withdrawEarnings(symbol: string) {
    const amount = features.earnPositions[symbol] ?? 0;
    if (amount <= 0) return;
    const token = tokenForSymbol(tokens, symbol);
    if (!token) {
      notify(`${symbol} is not available in this account`);
      return;
    }
    updateRuntimeBalances(tokens.map((item) => item.symbol === symbol ? { ...item, balance: item.balance + amount } : item));
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
    <div className="min-h-[100dvh] bg-black font-sans text-white selection:bg-[#a995f2] selection:text-black">
      <div className="relative mx-auto min-h-[100dvh] max-w-[560px] overflow-hidden bg-black">
        <div className="pointer-events-none fixed inset-0 mx-auto max-w-[560px] opacity-80" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(91, 37, 128, .25), transparent 28%), radial-gradient(circle at 90% 65%, rgba(65, 24, 103, .18), transparent 30%)" }} />
        <div className="relative">
          {view === "home" ? <HomeScreen tokens={tokens} records={records} currency={currency} rate={selectedCurrency.rate} total={total} onEdit={openPortfolio} onTransaction={openTransaction} onExplore={() => setView("market")} onSwap={() => openSwap()} onAssets={() => setView("assets")} onHistory={() => setView("history")} onAccounts={runtime.openAccounts} onToken={setSelectedToken} /> : null}
          {view === "assets" ? <AssetsScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} onToken={setSelectedToken} onHome={goHome} /> : null}
          {view === "history" ? <HistoryScreen records={records} tokens={tokens} currency={currency} rate={selectedCurrency.rate} onHome={goHome} onAdd={() => openTransaction("receive")} /> : null}
          {view === "market" ? <MarketScreen tokens={tokens} currency={currency} rate={selectedCurrency.rate} onToken={setSelectedToken} onHome={goHome} /> : null}
          {view === "swap" ? <SwapScreen tokens={tokens} currency={currency} initialFrom={preferredSwapSymbol} onHome={goHome} onSwap={completeSwap} /> : null}
          {view === "earn" ? <EarnScreen tokens={tokens} positions={features.earnPositions} onHome={goHome} onStart={startEarning} onWithdraw={withdrawEarnings} /> : null}
          {view === "card" ? <CardScreen total={total} currency={currency} frozen={features.cardFrozen} limit={features.cardLimit} records={records} onHome={goHome} onToggleFrozen={toggleCardFrozen} onSaveLimit={saveCardLimit} onHistory={() => setView("history")} /> : null}
        </div>

        <BottomNav active={activeTab} onChange={changeBottomTab} />

        {notice ? <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-[470px] rounded-xl border border-[#b8a5ff]/35 bg-[#282134]/95 px-4 py-3 text-center text-sm font-semibold text-[#ded5ff] shadow-2xl backdrop-blur-xl">{notice}</div> : null}
        {portfolioOpen ? <PortfolioModal tokens={tokens} editValues={editValues} currency={currency} proKey={proKey} onChangeValue={(symbol, value) => setEditValues((current) => ({ ...current, [symbol]: value }))} onChangeProKey={setProKey} onCurrency={() => setCurrencyOpen(true)} onAddCustom={() => setCustomTokenOpen(true)} onSave={savePortfolio} onClose={() => setPortfolioOpen(false)} /> : null}
        {currencyOpen ? <CurrencyPicker selected={currency} onSelect={(value) => { setCurrency(value); setCurrencyOpen(false); }} onClose={() => setCurrencyOpen(false)} /> : null}
        {customTokenOpen ? <CustomTokenModal onSave={addCustomToken} onClose={() => setCustomTokenOpen(false)} /> : null}
        {transactionOpen ? <TransactionModal type={transactionType} crypto={transactionCrypto} amount={transactionAmount} date={transactionDate} time={transactionTime} tokens={tokens} onType={setTransactionType} onCrypto={setTransactionCrypto} onAmount={setTransactionAmount} onDate={setTransactionDate} onTime={setTransactionTime} onSubmit={submitTransaction} onClear={clearTransactions} onClose={() => setTransactionOpen(false)} /> : null}
        {selectedToken ? <TokenDetailModal token={selectedToken} currency={currency} rate={selectedCurrency.rate} onClose={() => setSelectedToken(null)} onTransfer={() => { runtime.openTransfer(selectedToken.symbol); setSelectedToken(null); }} onReceive={() => { runtime.openReceive(); setSelectedToken(null); }} onSwap={() => openSwap(selectedToken.symbol)} /> : null}
      </div>
    </div>
  );
}
