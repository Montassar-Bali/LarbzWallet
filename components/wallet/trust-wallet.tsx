"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  History,
  Home,
  Infinity as InfinityIcon,
  ListFilter,
  LoaderCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { TrustLiveChart } from "@/components/wallet/trust-live-chart";
import { AddressQrCode } from "@/components/wallet/address-qr-code";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import { useWalletRuntime } from "@/components/wallet/wallet-runtime";
import { canonicalWalletTokens, liveMarketSymbols } from "@/config/tokens";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import type { WalletActivity, WalletToken } from "@/lib/types";
import {
  tokensForWalletAccount,
  transactionsForAccount,
  walletLedgerEvent,
  type WalletBalanceOperation,
} from "@/lib/wallet-ledger";
import {
  applyLiveMarketSnapshot,
  emptyLiveMarketSnapshot,
  mergeCanonicalWalletCatalogue,
  type LiveMarketSnapshot,
} from "@/lib/wallet-market";

type Screen = "home" | "market" | "earn" | "discover" | "search" | "buy" | "swap" | "tokens" | "perpetuals" | "watchlist" | "ai" | "settings" | "token" | "asset-receive";
type Currency = "USD" | "EUR" | "GBP" | "CAD" | "AUD";
type ColorScheme = "dark" | "light";
type Picker = "buy" | "swap-from" | "swap-to" | null;
type Profile = { walletName: string; currency: Currency; notifications: boolean; colorScheme: ColorScheme };
type EarnPosition = { id: string; symbol: string; amount: number; apy: number; startedAt: string };
type PerpetualPosition = { id: string; symbol: string; amount: number; leverage: number; side: "long" | "short"; entryPrice: number; openedAt: string };
type PositionLifecycle =
  | { v: 1; product: "earn"; action: "open"; position: EarnPosition }
  | { v: 1; product: "earn"; action: "close"; positionId: string; closedAt: string }
  | { v: 1; product: "perpetual"; action: "open"; position: PerpetualPosition }
  | { v: 1; product: "perpetual"; action: "close"; positionId: string; closedAt: string };
type BuyStage = "entry" | "review" | "success";
type SwapStage = "entry" | "success";
type EarnStage = "list" | "amount" | "review" | "success";
type PerpetualStage = "list" | "order" | "review" | "success";
type PaymentMethod = "apple-pay" | "demo-card";
type MarketStatus = "loading" | "ready" | "error";

const TOKENS_KEY = "larpz_trust_wallet_tokens";
const ACTIVITY_KEY = "larpz_trust_wallet_transactions";
const PROFILE_KEY = "larpz_trust_wallet_profile";
const WATCHLIST_KEY = "larpz_trust_wallet_watchlist";
const EARN_KEY = "larpz_trust_wallet_earn";
const PERPETUALS_KEY = "larpz_trust_wallet_perpetual_positions";
const PROCESSED_OPERATIONS_KEY = "larpz_trust_wallet_processed_operations";
const PREFERENCES_MIGRATION_KEY = "larpz_trust_wallet_preferences_migrated_account";
const POSITION_NOTE_MARKER = " · LARPZ_POSITION:";
const rates: Record<Currency, number> = { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52 };
const flags: Record<Currency, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", CAD: "🇨🇦", AUD: "🇦🇺" };
const defaultProfile: Profile = { walletName: "Main Wallet", currency: "USD", notifications: true, colorScheme: "dark" };
const earnOffers = [
  { symbol: "SOL", apy: 7.18, network: "Solana" },
  { symbol: "ETH", apy: 4.34, network: "Ethereum" },
  { symbol: "ATOM", apy: 15.2, network: "Cosmos" },
  { symbol: "DOT", apy: 12.5, network: "Polkadot" },
];
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];

function accountKey(base: string, accountId?: string) {
  return accountId ? `${base}:${accountId}` : base;
}

function normalizeProfile(value: unknown, fallback: Profile): Profile {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Profile>;
  return {
    walletName: typeof candidate.walletName === "string" && candidate.walletName.trim() ? candidate.walletName : fallback.walletName,
    currency: typeof candidate.currency === "string" && candidate.currency in rates ? candidate.currency as Currency : fallback.currency,
    notifications: typeof candidate.notifications === "boolean" ? candidate.notifications : fallback.notifications,
    colorScheme: candidate.colorScheme === "light" || candidate.colorScheme === "dark" ? candidate.colorScheme : fallback.colorScheme,
  };
}

function cash(value: number, currency: Currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
  }).format(value * rates[currency]);
}

function amount(value: number, digits = 6) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function seededTokens(): WalletToken[] {
  return mergeCanonicalWalletCatalogue(canonicalWalletTokens.map((token) => ({ ...token, updatedAt: new Date().toISOString() })));
}

function nextKey(current: string, key: string) {
  if (key === "backspace") return current.length <= 1 ? "0" : current.slice(0, -1);
  if (key === "." && current.includes(".")) return current;
  if (current === "0" && key !== ".") return key;
  const next = current + key;
  return (next.split(".")[1]?.length ?? 0) > 8 ? current : next;
}

function KeypadAmountInput({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className: string }) {
  return (
    <input
      aria-label={label}
      aria-readonly="true"
      inputMode="none"
      readOnly
      value={value}
      onKeyDown={(event) => {
        const key = event.key === "Backspace" || event.key === "Delete" ? "backspace" : event.key;
        if (key === "backspace" || key === "." || /^[0-9]$/.test(key)) {
          event.preventDefault();
          onChange(nextKey(value, key));
        }
      }}
      className={className}
    />
  );
}

function normalizeEarnPositions(value: unknown): EarnPosition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<EarnPosition>;
    if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9:_-]{3,180}$/.test(candidate.id) || typeof candidate.symbol !== "string" || !/^[A-Z0-9]{2,15}$/.test(candidate.symbol) || !Number.isFinite(candidate.amount) || Number(candidate.amount) <= 0 || !Number.isFinite(candidate.apy) || Number(candidate.apy) < 0 || typeof candidate.startedAt !== "string" || !Number.isFinite(Date.parse(candidate.startedAt))) return [];
    return [{ id: candidate.id, symbol: candidate.symbol, amount: Number(candidate.amount), apy: Number(candidate.apy), startedAt: new Date(candidate.startedAt).toISOString() }];
  });
}

function normalizePerpetualPositions(value: unknown): PerpetualPosition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<PerpetualPosition>;
    if (typeof candidate.id !== "string" || !/^[a-zA-Z0-9:_-]{3,180}$/.test(candidate.id) || typeof candidate.symbol !== "string" || !/^[A-Z0-9]{2,15}$/.test(candidate.symbol) || !Number.isFinite(candidate.amount) || Number(candidate.amount) <= 0 || !Number.isFinite(candidate.leverage) || Number(candidate.leverage) <= 0 || !Number.isFinite(candidate.entryPrice) || Number(candidate.entryPrice) <= 0 || typeof candidate.openedAt !== "string" || !Number.isFinite(Date.parse(candidate.openedAt)) || (candidate.side !== "long" && candidate.side !== "short")) return [];
    return [{ id: candidate.id, symbol: candidate.symbol, amount: Number(candidate.amount), leverage: Number(candidate.leverage), side: candidate.side, entryPrice: Number(candidate.entryPrice), openedAt: new Date(candidate.openedAt).toISOString() }];
  });
}

function positionLifecycleNote(prefix: "INTERNAL EARN" | "INTERNAL PERPETUAL", lifecycle: PositionLifecycle) {
  return `${prefix}${POSITION_NOTE_MARKER}${JSON.stringify(lifecycle)}`;
}

function parsePositionLifecycle(note: string): PositionLifecycle | null {
  const marker = note.indexOf(POSITION_NOTE_MARKER);
  if (marker < 0) return null;
  const prefix = note.slice(0, marker);
  let value: unknown;
  try {
    value = JSON.parse(note.slice(marker + POSITION_NOTE_MARKER.length));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.v !== 1 || (candidate.product !== "earn" && candidate.product !== "perpetual") || (candidate.action !== "open" && candidate.action !== "close")) return null;
  if (prefix !== (candidate.product === "earn" ? "INTERNAL EARN" : "INTERNAL PERPETUAL")) return null;
  if (candidate.action === "open") {
    const position = candidate.product === "earn"
      ? normalizeEarnPositions([candidate.position])[0]
      : normalizePerpetualPositions([candidate.position])[0];
    return position ? { v: 1, product: candidate.product, action: "open", position } as PositionLifecycle : null;
  }
  if (typeof candidate.positionId !== "string" || !candidate.positionId || candidate.positionId.length > 180 || typeof candidate.closedAt !== "string" || !Number.isFinite(Date.parse(candidate.closedAt))) return null;
  return { v: 1, product: candidate.product, action: "close", positionId: candidate.positionId, closedAt: candidate.closedAt } as PositionLifecycle;
}

function positionsFromLedger(operations: WalletBalanceOperation[], accountId?: string) {
  const earn = new Map<string, EarnPosition>();
  const perpetuals = new Map<string, PerpetualPosition>();
  let hasEarnLifecycle = false;
  let hasPerpetualLifecycle = false;
  if (!accountId) return { earn: [], perpetuals: [], hasEarnLifecycle, hasPerpetualLifecycle };

  const events = operations.flatMap((operation, operationIndex) => {
    if (operation.walletId !== "trust" || operation.accountId !== accountId) return [];
    return operation.activities.flatMap((activity, activityIndex) => {
      if (activity.status !== "completed") return [];
      const lifecycle = parsePositionLifecycle(activity.note);
      if (!lifecycle) return [];
      const occurredAt = lifecycle.action === "open"
        ? lifecycle.product === "earn" ? lifecycle.position.startedAt : lifecycle.position.openedAt
        : lifecycle.closedAt;
      return [{ lifecycle, occurredAt, operationIndex, activityIndex }];
    });
  }).sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || right.operationIndex - left.operationIndex
    || left.activityIndex - right.activityIndex);

  for (const { lifecycle } of events) {
    if (lifecycle.product === "earn") {
      hasEarnLifecycle = true;
      if (lifecycle.action === "open") earn.set(lifecycle.position.id, lifecycle.position);
      else earn.delete(lifecycle.positionId);
    } else {
      hasPerpetualLifecycle = true;
      if (lifecycle.action === "open") perpetuals.set(lifecycle.position.id, lifecycle.position);
      else perpetuals.delete(lifecycle.positionId);
    }
  }

  return {
    earn: [...earn.values()].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
    perpetuals: [...perpetuals.values()].sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt)),
    hasEarnLifecycle,
    hasPerpetualLifecycle,
  };
}

function networkName(symbol: string) {
  if (symbol === "BTC") return "Bitcoin";
  if (symbol === "SOL") return "Solana";
  if (["ETH", "USDT", "USDC", "LINK", "UNI", "AAVE", "ARB", "OP"].includes(symbol)) return "Ethereum";
  return `${symbol} network`;
}

function TokenIcon({ token, size = 44 }: { token: Pick<WalletToken, "name" | "symbol" | "image">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const colors: Record<string, string> = { BTC: "#f7931a", ETH: "#6374d8", SOL: "#090a10", USDT: "#26a17b", USDC: "#2775ca", BNB: "#f0b90b" };
  const marks: Record<string, string> = { BTC: "₿", ETH: "◆", SOL: "≋", USDT: "₮", USDC: "$", BNB: "◇" };
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-full text-sm font-black text-white" style={{ width: size, height: size, background: colors[token.symbol] ?? "#303144" }} aria-hidden="true">
      <span className="absolute inset-0 grid place-items-center text-[1.2em]">{marks[token.symbol] ?? token.symbol.slice(0, 2)}</span>
      {!failed && token.image ? <Image src={token.image} alt="" fill unoptimized sizes={`${size}px`} className="z-10 object-contain" onError={() => setFailed(true)} /> : null}
    </span>
  );
}

function IconButton({ label, icon: Icon, onClick, active = false }: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean }) {
  return <button type="button" aria-label={label} onClick={onClick} className={`grid min-h-11 min-w-11 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#665cff] ${active ? "border-[#665cff]/60 bg-[#4437ff]" : "border-white/[.08] bg-[#181925] text-white/85"}`}><Icon className="size-5" /></button>;
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return <header className="grid min-h-14 grid-cols-[3rem_1fr_3rem] items-center gap-2"><IconButton label="Go back" icon={ArrowLeft} onClick={onBack} /><h1 className="truncate text-center text-[22px] font-extrabold tracking-[-.03em]">{title}</h1><div className="flex justify-end">{right}</div></header>;
}

function SplitBalance({ value, currency }: { value: number; currency: Currency }) {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * rates[currency]);
  return <p data-testid="trust-portfolio-balance" aria-label={`Portfolio balance ${formatted}`} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(3rem,14vw,5rem)] font-black leading-none tracking-[-.07em] text-white">{formatted}</p>;
}

function TokenRow({ token, currency, onClick, starred, onStar }: { token: WalletToken; currency: Currency; onClick: () => void; starred?: boolean; onStar?: () => void }) {
  return (
    <div className="flex min-h-[4.7rem] items-center gap-1 rounded-[1.25rem] hover:bg-white/[.025]">
      <button type="button" onClick={onClick} className="flex min-h-[4.7rem] min-w-0 flex-1 items-center gap-3 px-1 text-left focus-visible:outline-2 focus-visible:outline-[#665cff]">
        <TokenIcon token={token} />
        <span className="min-w-0 flex-1"><strong className="block truncate text-[17px] font-extrabold">{token.name}</strong><span className="block truncate text-[14px] font-semibold text-white/42">{amount(token.balance)} {token.symbol}</span></span>
        <span className="max-w-[42%] text-right"><strong className="block truncate text-[16px]">{cash(token.balance * token.price, currency)}</strong><span className={`text-[14px] font-bold ${token.change24h >= 0 ? "text-[#3ed474]" : "text-[#ff5364]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></span>
      </button>
      {onStar ? <button type="button" aria-label={`${starred ? "Remove" : "Add"} ${token.symbol} ${starred ? "from" : "to"} watchlist`} onClick={onStar} className="grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-[#665cff]"><Star className={`size-5 ${starred ? "fill-[#8179ff] text-[#8179ff]" : "text-white/35"}`} /></button> : null}
    </div>
  );
}

function Keypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="grid grid-cols-3" aria-label="Numeric keypad">{keys.map((key) => <button key={key} type="button" aria-label={key === "backspace" ? "Backspace" : key === "." ? "Decimal point" : key} onClick={() => onChange(nextKey(value, key))} className="grid min-h-[4.4rem] place-items-center rounded-2xl text-[29px] font-extrabold active:bg-white/[.06] focus-visible:outline-2 focus-visible:outline-[#665cff]">{key === "backspace" ? <span className="rounded-md border border-current px-1.5 text-sm">×</span> : key}</button>)}</div>;
}

function Action({ label, icon: Icon, onClick, primary = false }: { label: string; icon: LucideIcon; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`flex min-h-[6.3rem] min-w-0 flex-col items-center justify-center gap-2 rounded-[1.35rem] text-sm font-extrabold active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#665cff] ${primary ? "bg-[#4437ff]" : "bg-[#191a28]"}`}><Icon className="size-7" />{label}</button>;
}

function TokenPicker({ tokens, onChoose, onClose }: { tokens: WalletToken[]; onChoose: (token: WalletToken) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = tokens.filter((token) => `${token.name} ${token.symbol}`.toLowerCase().includes(query.toLowerCase()));
  return <div data-testid="trust-token-picker" className="absolute inset-0 z-[70] overflow-y-auto bg-[#10101b] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]"><Header title="Select token" onBack={onClose} /><label className="mt-6 flex min-h-14 items-center gap-3 rounded-[1.2rem] border border-white/[.07] bg-[#181925] px-4"><Search className="size-5 text-white/45" /><input autoFocus aria-label="Search tokens" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tokens" className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-white/28" /></label><div className="mt-5">{filtered.map((token) => <TokenRow key={token.id} token={token} currency="USD" onClick={() => onChoose(token)} />)}{!filtered.length ? <p className="py-20 text-center text-sm text-white/40">No matching tokens.</p> : null}</div></div>;
}

function BottomNav({ active, onOpen }: { active: Screen; onOpen: (screen: Screen) => void }) {
  const items: { label: string; screen: Screen; icon: LucideIcon }[] = [
    { label: "Home", screen: "home", icon: Home },
    { label: "Market", screen: "market", icon: TrendingUp },
    { label: "Earn", screen: "earn", icon: InfinityIcon },
    { label: "Discover", screen: "discover", icon: Globe2 },
  ];
  return <nav data-testid="trust-bottom-nav" aria-label="Larpz Wallet navigation" className="absolute inset-x-3 bottom-[max(.6rem,env(safe-area-inset-bottom))] z-40 flex gap-2"><div className="flex min-w-0 flex-1 rounded-[1.6rem] border border-white/[.09] bg-[#242531]/95 p-1.5 shadow-2xl backdrop-blur-2xl">{items.map(({ label, screen, icon: Icon }) => <button key={label} type="button" aria-label={label} onClick={() => onOpen(screen)} className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] text-[10px] font-extrabold ${active === screen ? "bg-white/[.11]" : "text-white/50"}`}><Icon className="size-5" />{label}</button>)}</div><button type="button" aria-label="Search" onClick={() => onOpen("search")} className={`grid min-h-14 min-w-14 place-items-center rounded-full border border-white/[.09] bg-[#242531]/95 ${active === "search" ? "text-[#8179ff]" : "text-white"}`}><Search className="size-6" /></button></nav>;
}

function SwipeConfirm({ disabled, busy, onConfirm }: { disabled: boolean; busy: boolean; onConfirm: () => void }) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const ref = useRef<HTMLButtonElement>(null);
  function move(clientX: number) {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds) {
      const next = Math.max(0, Math.min(1, (clientX - bounds.left - 34) / Math.max(1, bounds.width - 68)));
      progressRef.current = next;
      setProgress(next);
    }
  }
  return <button ref={ref} type="button" data-testid="trust-swipe-confirm" aria-label="Swipe to swap" disabled={disabled || busy} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); move(event.clientX); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event.clientX); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (progressRef.current > .82) onConfirm(); progressRef.current = 0; setProgress(0); }} onPointerCancel={() => { progressRef.current = 0; setProgress(0); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onConfirm(); }} className="relative min-h-[4.6rem] w-full overflow-hidden rounded-full bg-[#191a28] font-extrabold text-white/55 disabled:text-white/20"><span className="absolute inset-y-1 left-1 grid aspect-square place-items-center rounded-full bg-[#4437ff] text-white" style={{ left: `calc(.25rem + ${progress * 78}%)` }}><ArrowRight className="size-5" /></span>{busy ? <LoaderCircle className="mx-auto size-5 animate-spin" /> : "Swipe to swap"}</button>;
}

export function TrustWallet() {
  const runtime = useWalletRuntime();
  const [tokens, setTokens] = useState<WalletToken[]>(seededTokens);
  const [activity, setActivity] = useState<WalletActivity[]>([]);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [watchlist, setWatchlist] = useState<string[]>(["BTC", "ETH", "SOL"]);
  const [earnPositions, setEarnPositions] = useState<EarnPosition[]>([]);
  const [perpetualPositions, setPerpetualPositions] = useState<PerpetualPosition[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [previous, setPrevious] = useState<Screen>("home");
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");
  const [picker, setPicker] = useState<Picker>(null);
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const latest = useRef<LiveMarketSnapshot>(emptyLiveMarketSnapshot);
  const scroll = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [buyMode, setBuyMode] = useState<"buy" | "sell">("buy");
  const [buyValue, setBuyValue] = useState("0");
  const [buySymbol, setBuySymbol] = useState("ETH");
  const [buyStage, setBuyStage] = useState<BuyStage>("entry");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("apple-pay");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [swapValue, setSwapValue] = useState("0");
  const [swapFrom, setSwapFrom] = useState("SOL");
  const [swapTo, setSwapTo] = useState("ETH");
  const [swapStage, setSwapStage] = useState<SwapStage>("entry");
  const [swapSettingsOpen, setSwapSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [earnStage, setEarnStage] = useState<EarnStage>("list");
  const [earnSymbol, setEarnSymbol] = useState("SOL");
  const [earnValue, setEarnValue] = useState("0");
  const [earnPositionId, setEarnPositionId] = useState<string>();
  const [perpetualStage, setPerpetualStage] = useState<PerpetualStage>("list");
  const [perpetualSymbol, setPerpetualSymbol] = useState("BTC");
  const [perpetualValue, setPerpetualValue] = useState("0");
  const [perpetualSide, setPerpetualSide] = useState<"long" | "short">("long");
  const [perpetualLeverage, setPerpetualLeverage] = useState(2);
  const [perpetualPositionId, setPerpetualPositionId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState("1D");
  const [aiQuery, setAiQuery] = useState("");
  const [messages, setMessages] = useState<string[]>(["Ask about your portfolio. I never request recovery phrases or private keys."]);
  const operationLock = useRef(false);
  const buyRequestId = useRef(createId("trust-buy"));
  const swapRequestId = useRef(createId("trust-swap"));
  const earnRequestId = useRef(createId("trust-earn"));
  const perpetualRequestId = useRef(createId("trust-perpetual"));

  const accountId = runtime.currentAccount?.id;
  const accountName = runtime.currentAccount?.name ?? defaultProfile.walletName;
  const tokenKey = accountKey(TOKENS_KEY, accountId);
  const activityKey = accountKey(ACTIVITY_KEY, accountId);
  const profileKey = accountKey(PROFILE_KEY, accountId);
  const watchlistKey = accountKey(WATCHLIST_KEY, accountId);
  const processedOperationsKey = accountKey(PROCESSED_OPERATIONS_KEY, accountId);
  const earnKey = accountKey(EARN_KEY, accountId);
  const perpetualsKey = accountKey(PERPETUALS_KEY, accountId);

  useLivePrices(liveMarketSymbols, (prices, changes, images, marketCaps, changes1h, changes7d, volumes24h) => {
    const snapshot = { prices, changes, images, marketCaps, changes1h, changes7d, volumes24h };
    latest.current = snapshot;
    setTokens((current) => applyLiveMarketSnapshot(mergeCanonicalWalletCatalogue(current), snapshot));
    runtime.updateMarketAssets(applyLiveMarketSnapshot(mergeCanonicalWalletCatalogue([]), snapshot));
  }, refreshKey, (success) => {
    setMarketStatus(success ? "ready" : "error");
    if (!refreshing) return;
    setRefreshing(false);
    setPull(0);
    show(success ? "Wallet and live prices refreshed." : "Wallet refreshed. Live prices are temporarily unavailable.");
  });

  useEffect(() => {
    document.documentElement.dataset.walletTheme = "trust";
    return () => {
      delete document.documentElement.dataset.walletTheme;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.trustColorScheme = profile.colorScheme;
    return () => {
      delete document.documentElement.dataset.trustColorScheme;
    };
  }, [profile.colorScheme]);

  useEffect(() => {
    if (!accountId) return;
    const timeoutId = window.setTimeout(() => {
      const accountDefaults = { ...defaultProfile, walletName: accountName };
      const defaultWatchlist = ["BTC", "ETH", "SOL"];
      const migrationAccountId = readStorage<string>(PREFERENCES_MIGRATION_KEY, "");
      const shouldMigrateLegacy = !migrationAccountId;
      const profileFallback = shouldMigrateLegacy ? normalizeProfile(readStorage<unknown>(PROFILE_KEY, accountDefaults), accountDefaults) : accountDefaults;
      const watchlistFallback = shouldMigrateLegacy ? readStorage<string[]>(WATCHLIST_KEY, defaultWatchlist) : defaultWatchlist;
      const scopedProfile = normalizeProfile(readStorage<unknown>(profileKey, profileFallback), profileFallback);
      const scopedWatchlist = readStorage<string[]>(watchlistKey, watchlistFallback);
      setProfile(scopedProfile);
      setWatchlist(scopedWatchlist);
      writeStorage(profileKey, scopedProfile);
      writeStorage(watchlistKey, scopedWatchlist);
      if (shouldMigrateLegacy) writeStorage(PREFERENCES_MIGRATION_KEY, accountId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [accountId, accountName, profileKey, watchlistKey]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = readStorage<WalletToken[]>(tokenKey, []);
      const base = stored.length ? stored : seededTokens();
      const merged = runtime.state && runtime.currentAccount ? tokensForWalletAccount(base, runtime.state, runtime.currentAccount) : base;
      const ledgerPositions = positionsFromLedger(runtime.state?.operations ?? [], accountId);
      const legacyEarnPositions = normalizeEarnPositions(readStorage<unknown>(earnKey, []));
      const legacyPerpetualPositions = normalizePerpetualPositions(readStorage<unknown>(perpetualsKey, []));
      const nextEarnPositions = ledgerPositions.hasEarnLifecycle ? ledgerPositions.earn : legacyEarnPositions;
      const nextPerpetualPositions = ledgerPositions.hasPerpetualLifecycle ? ledgerPositions.perpetuals : legacyPerpetualPositions;
      setTokens(applyLiveMarketSnapshot(mergeCanonicalWalletCatalogue(merged), latest.current));
      setActivity(readStorage<WalletActivity[]>(activityKey, []));
      setEarnPositions(nextEarnPositions);
      setPerpetualPositions(nextPerpetualPositions);
      if (ledgerPositions.hasEarnLifecycle) writeStorage(earnKey, nextEarnPositions);
      if (ledgerPositions.hasPerpetualLifecycle) writeStorage(perpetualsKey, nextPerpetualPositions);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [accountId, activityKey, earnKey, perpetualsKey, runtime.currentAccount, runtime.state, tokenKey]);

  useEffect(() => {
    const update = () => {
      if (!runtime.state || !runtime.currentAccount) return;
      setTokens((current) => applyLiveMarketSnapshot(tokensForWalletAccount(mergeCanonicalWalletCatalogue(current), runtime.state!, runtime.currentAccount!), latest.current));
    };
    window.addEventListener(walletLedgerEvent, update);
    return () => window.removeEventListener(walletLedgerEvent, update);
  }, [runtime.currentAccount, runtime.state]);

  const transactions = useMemo(() => {
    if (!runtime.state || !runtime.currentAccount) return activity;
    const id = runtime.currentAccount.id;
    const shared = transactionsForAccount(runtime.state, id).map<WalletActivity>((transaction) => ({
      id: transaction.id,
      type: transaction.destinationAccountId === id ? "receive" : "send",
      tokenSymbol: transaction.tokenSymbol,
      amount: transaction.amount,
      counterpartyLabel: transaction.destinationAccountId === id ? transaction.senderAddress : transaction.recipientAddress,
      date: transaction.timestamp,
      status: transaction.status,
      note: "INTERNAL TRANSFER",
    }));
    const ids = new Set(shared.map((item) => item.id));
    return [...shared, ...activity.filter((item) => !ids.has(item.id))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activity, runtime.currentAccount, runtime.state]);

  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.balance * token.price, 0), [tokens]);
  const selected = tokens.find((token) => token.symbol === selectedSymbol) ?? tokens[0];
  const buyToken = tokens.find((token) => token.symbol === buySymbol) ?? tokens[0];
  const fromToken = tokens.find((token) => token.symbol === swapFrom) ?? tokens[0];
  const toToken = tokens.find((token) => token.symbol === swapTo) ?? tokens[1] ?? tokens[0];
  const earnToken = tokens.find((token) => token.symbol === earnSymbol) ?? tokens[0];
  const earnOffer = earnOffers.find((offer) => offer.symbol === earnToken?.symbol);
  const selectedEarnPosition = earnPositions.find((position) => position.id === earnPositionId);
  const perpetualToken = tokens.find((token) => token.symbol === perpetualSymbol) ?? tokens[0];
  const selectedPerpetualPosition = perpetualPositions.find((position) => position.id === perpetualPositionId);
  const runtimeAccountName = runtime.currentAccount?.name;
  const activeProfile = { ...profile, walletName: !runtimeAccountName || runtimeAccountName === "Account 1" ? profile.walletName : runtimeAccountName };

  function show(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  function open(next: Screen) {
    if (next !== screen) setPrevious(screen);
    setScreen(next);
    setQuery("");
    scroll.current?.scrollTo({ top: 0 });
  }

  function back() {
    setScreen(previous === screen ? "home" : previous);
    setPrevious("home");
    scroll.current?.scrollTo({ top: 0 });
  }

  function selectToken(token: WalletToken) {
    setSelectedSymbol(token.symbol);
    open("token");
  }

  function refreshWallet() {
    if (refreshing) return;
    setRefreshing(true);
    setMarketStatus("loading");
    runtime.refresh();
    setRefreshKey((value) => value + 1);
  }

  function retryMarketData() {
    setMarketStatus("loading");
    setRefreshKey((value) => value + 1);
  }

  function renderMarketStatus() {
    if (marketStatus === "ready") return null;
    const loading = marketStatus === "loading";
    return (
      <div data-testid="trust-market-status" role={loading ? "status" : "alert"} aria-live="polite" className="mt-5 flex min-h-16 items-center gap-3 rounded-[1.15rem] border border-white/[.07] bg-[#171824] px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[.05] text-[#8179ff]">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <TrendingUp className="size-5" />}</span>
        <span className="min-w-0 flex-1"><strong className="block text-sm">{loading ? "Updating live prices" : "Live prices unavailable"}</strong><span className="block text-xs leading-5 text-white/40">{loading ? "Seeded quotes remain available while we connect." : "Showing saved quotes. Your wallet remains available."}</span></span>
        {!loading ? <button type="button" aria-label="Retry live prices" onClick={retryMarketData} className="min-h-11 shrink-0 rounded-full bg-[#292a3a] px-4 text-sm font-extrabold text-[#9d98ff] focus-visible:outline-2 focus-visible:outline-[#665cff]">Retry</button> : null}
      </div>
    );
  }

  async function commit(nextTokens: WalletToken[], records: WalletActivity[], success: string, operationId: string) {
    const processed = readStorage<string[]>(processedOperationsKey, []);
    if (processed.includes(operationId)) {
      show("This operation was already completed.");
      return true;
    }
    const currentBalances = new Map(tokens.map((token) => [token.symbol, token.balance]));
    const deltas = Object.fromEntries(nextTokens.flatMap((token) => {
      const delta = token.balance - (currentBalances.get(token.symbol) ?? 0);
      return Math.abs(delta) > Number.EPSILON ? [[token.symbol, delta]] : [];
    }));
    if (!Object.keys(deltas).length) {
      show("This operation does not change the account balance.");
      return false;
    }
    try {
      await runtime.applyBalanceOperation({ clientRequestId: operationId, deltas, activities: records });
    } catch (caught) {
      show(caught instanceof Error ? caught.message : "The shared wallet could not save this operation. No balance was changed.");
      return false;
    }
    const nextActivity = [...records, ...activity];
    setTokens(nextTokens);
    setActivity(nextActivity);
    writeStorage(tokenKey, nextTokens);
    writeStorage(activityKey, nextActivity);
    writeStorage(processedOperationsKey, [operationId, ...processed].slice(0, 100));
    show(success);
    return true;
  }

  async function performBuySell() {
    if (!buyToken || operationLock.current) return;
    const enteredFiat = Number(buyValue);
    const fiat = enteredFiat / rates[profile.currency];
    if (!Number.isFinite(enteredFiat) || enteredFiat < 1 || enteredFiat > 100_000 || buyToken.price <= 0) { show("Enter an amount from 1 to 100,000."); return; }
    const serviceFee = Math.max(0.25 / rates[profile.currency], fiat * 0.005);
    const tokenAmount = (buyMode === "buy" ? fiat - serviceFee : fiat) / buyToken.price;
    if (buyMode === "sell" && tokenAmount > buyToken.balance) { show(`Not enough ${buyToken.symbol} to sell.`); return; }
    const date = new Date().toISOString();
    const next = tokens.map((token) => token.id === buyToken.id ? { ...token, balance: token.balance + (buyMode === "buy" ? tokenAmount : -tokenAmount), updatedAt: date } : token);
    const requestId = buyRequestId.current;
    const record: WalletActivity = { id: requestId, type: buyMode === "buy" ? "receive" : "send", tokenSymbol: buyToken.symbol, amount: tokenAmount, counterpartyLabel: `${buyMode === "buy" ? "Purchase" : "Sale"} · ${cash(serviceFee, profile.currency)} fee`, date, status: "completed", note: "CONFIRMED" };
    operationLock.current = true;
    setBusy(true);
    try {
      const ok = await commit(next, [record], `${buyMode === "buy" ? "Added" : "Sold"} ${amount(tokenAmount)} ${buyToken.symbol} successfully.`, requestId);
      if (ok) {
        setBuyStage("success");
        buyRequestId.current = createId("trust-buy");
      }
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  async function performSwap() {
    const value = Number(swapValue);
    if (operationLock.current) return;
    if (!fromToken || !toToken || !Number.isFinite(value) || value <= 0 || fromToken.symbol === toToken.symbol) { show("Choose two different assets and enter an amount."); return; }
    if (value > fromToken.balance) { show(`Not enough ${fromToken.symbol} balance.`); return; }
    if (fromToken.price <= 0 || toToken.price <= 0) { show("Live prices are unavailable for this pair."); return; }
    const serviceFee = value * 0.0035;
    const received = (value - serviceFee) * fromToken.price / toToken.price;
    const date = new Date().toISOString();
    const next = tokens.map((token) => token.id === fromToken.id ? { ...token, balance: token.balance - value, updatedAt: date } : token.id === toToken.id ? { ...token, balance: token.balance + received, updatedAt: date } : token);
    const requestId = swapRequestId.current;
    const records: WalletActivity[] = [
      { id: `${requestId}:credit`, type: "receive", tokenSymbol: toToken.symbol, amount: received, counterpartyLabel: `Swapped from ${fromToken.symbol}`, date, status: "completed", note: "INTERNAL SWAP" },
      { id: `${requestId}:debit`, type: "send", tokenSymbol: fromToken.symbol, amount: value, counterpartyLabel: `Swapped to ${toToken.symbol} · 0.35% fee`, date, status: "completed", note: "INTERNAL SWAP" },
    ];
    operationLock.current = true;
    setBusy(true);
    try {
      const ok = await commit(next, records, `Swapped ${amount(value)} ${fromToken.symbol} for ${amount(received)} ${toToken.symbol}.`, requestId);
      if (ok) {
        setSwapStage("success");
        swapRequestId.current = createId("trust-swap");
      }
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function openSwapFor(symbol: string) {
    const fallback = tokens.find((token) => token.symbol !== symbol && token.price > 0);
    setSwapFrom(symbol);
    if (swapTo === symbol) setSwapTo(fallback?.symbol ?? "ETH");
    setSwapValue("0");
    setSwapStage("entry");
    swapRequestId.current = createId("trust-swap");
    open("swap");
  }

  function openReceiveFor(symbol: string) {
    setSelectedSymbol(symbol);
    open("asset-receive");
  }

  function openEarnOffer(symbol: string) {
    setEarnSymbol(symbol);
    setEarnValue("0");
    setEarnPositionId(undefined);
    setEarnStage("amount");
    earnRequestId.current = createId("trust-earn");
    open("earn");
  }

  function reviewEarnRedemption(position: EarnPosition) {
    setEarnSymbol(position.symbol);
    setEarnValue(String(position.amount));
    setEarnPositionId(position.id);
    setEarnStage("review");
    earnRequestId.current = createId("trust-earn-redeem");
  }

  async function performEarn() {
    if (!earnToken || operationLock.current) return;
    const redeeming = Boolean(selectedEarnPosition);
    const value = redeeming ? selectedEarnPosition?.amount ?? 0 : Number(earnValue);
    if (!Number.isFinite(value) || value <= 0) { show("Enter an amount greater than zero."); return; }
    if (!redeeming && value > earnToken.balance) { show(`Not enough ${earnToken.symbol} available.`); return; }
    if (!redeeming && !earnOffer) { show("This earning opportunity is unavailable."); return; }
    const date = new Date().toISOString();
    const nextTokens = tokens.map((token) => token.id === earnToken.id ? { ...token, balance: token.balance + (redeeming ? value : -value), updatedAt: date } : token);
    const requestId = earnRequestId.current;
    const openedPosition: EarnPosition | undefined = redeeming ? undefined : {
      id: requestId,
      symbol: earnToken.symbol,
      amount: value,
      apy: earnOffer?.apy ?? 0,
      startedAt: date,
    };
    const lifecycle: PositionLifecycle = selectedEarnPosition
      ? { v: 1, product: "earn", action: "close", positionId: selectedEarnPosition.id, closedAt: date }
      : { v: 1, product: "earn", action: "open", position: openedPosition! };
    const record: WalletActivity = {
      id: requestId,
      type: redeeming ? "receive" : "send",
      tokenSymbol: earnToken.symbol,
      amount: value,
      counterpartyLabel: redeeming ? "Redeemed from internal Earn" : `Allocated to internal Earn · ${earnOffer?.apy.toFixed(2)}% APY`,
      date,
      status: "completed",
      note: positionLifecycleNote("INTERNAL EARN", lifecycle),
    };
    operationLock.current = true;
    setBusy(true);
    try {
      const ok = await commit(nextTokens, [record], `${redeeming ? "Redeemed" : "Allocated"} ${amount(value)} ${earnToken.symbol}.`, requestId);
      if (!ok) return;
      const nextPositions = redeeming
        ? earnPositions.filter((position) => position.id !== selectedEarnPosition?.id)
        : [openedPosition!, ...earnPositions];
      setEarnPositions(nextPositions);
      writeStorage(earnKey, nextPositions);
      setEarnStage("success");
      earnRequestId.current = createId("trust-earn");
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  function openPerpetualMarket(symbol: string) {
    setPerpetualSymbol(symbol);
    setPerpetualValue("0");
    setPerpetualSide("long");
    setPerpetualLeverage(2);
    setPerpetualPositionId(undefined);
    setPerpetualStage("order");
    perpetualRequestId.current = createId("trust-perpetual");
    open("perpetuals");
  }

  function reviewPerpetualClose(position: PerpetualPosition) {
    setPerpetualSymbol(position.symbol);
    setPerpetualValue(String(position.amount));
    setPerpetualSide(position.side);
    setPerpetualLeverage(position.leverage);
    setPerpetualPositionId(position.id);
    setPerpetualStage("review");
    perpetualRequestId.current = createId("trust-perpetual-close");
  }

  async function performPerpetual() {
    if (!perpetualToken || operationLock.current) return;
    const closing = Boolean(selectedPerpetualPosition);
    const value = closing ? selectedPerpetualPosition?.amount ?? 0 : Number(perpetualValue);
    if (!Number.isFinite(value) || value <= 0) { show("Enter a collateral amount greater than zero."); return; }
    if (!closing && value > perpetualToken.balance) { show(`Not enough ${perpetualToken.symbol} collateral.`); return; }
    if (!closing && perpetualToken.price <= 0) { show("A live entry price is required to open this practice position."); return; }
    const date = new Date().toISOString();
    const nextTokens = tokens.map((token) => token.id === perpetualToken.id ? { ...token, balance: token.balance + (closing ? value : -value), updatedAt: date } : token);
    const requestId = perpetualRequestId.current;
    const openedPosition: PerpetualPosition | undefined = closing ? undefined : {
      id: requestId,
      symbol: perpetualToken.symbol,
      amount: value,
      leverage: perpetualLeverage,
      side: perpetualSide,
      entryPrice: perpetualToken.price,
      openedAt: date,
    };
    const lifecycle: PositionLifecycle = selectedPerpetualPosition
      ? { v: 1, product: "perpetual", action: "close", positionId: selectedPerpetualPosition.id, closedAt: date }
      : { v: 1, product: "perpetual", action: "open", position: openedPosition! };
    const record: WalletActivity = {
      id: requestId,
      type: closing ? "receive" : "send",
      tokenSymbol: perpetualToken.symbol,
      amount: value,
      counterpartyLabel: closing ? `Closed ${selectedPerpetualPosition?.side} practice position` : `Opened ${perpetualSide} ${perpetualLeverage}x practice position`,
      date,
      status: "completed",
      note: positionLifecycleNote("INTERNAL PERPETUAL", lifecycle),
    };
    operationLock.current = true;
    setBusy(true);
    try {
      const ok = await commit(nextTokens, [record], `${closing ? "Closed" : "Opened"} ${perpetualToken.symbol} internal practice position.`, requestId);
      if (!ok) return;
      const nextPositions = closing
        ? perpetualPositions.filter((position) => position.id !== selectedPerpetualPosition?.id)
        : [openedPosition!, ...perpetualPositions];
      setPerpetualPositions(nextPositions);
      writeStorage(perpetualsKey, nextPositions);
      setPerpetualStage("success");
      perpetualRequestId.current = createId("trust-perpetual");
    } finally {
      operationLock.current = false;
      setBusy(false);
    }
  }

  async function copyReceiveAddress() {
    const address = runtime.currentAccount?.address;
    if (!address) { show("Receiving address is unavailable."); return; }
    try {
      await navigator.clipboard.writeText(address);
      show(`${selected?.symbol ?? "Asset"} address copied.`);
    } catch {
      show("Could not copy the receiving address.");
    }
  }

  async function shareReceiveAddress() {
    const address = runtime.currentAccount?.address;
    if (!address) { show("Receiving address is unavailable."); return; }
    try {
      const canShare = typeof navigator.share === "function";
      if (canShare) await navigator.share({ title: `Receive ${selected?.symbol ?? "assets"} in Larpz Wallet`, text: address });
      else await navigator.clipboard.writeText(address);
      show(canShare ? "Receiving address shared." : "Address copied for sharing.");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      show("Could not share the receiving address.");
    }
  }

  function toggleWatch(symbol: string) {
    const next = watchlist.includes(symbol) ? watchlist.filter((item) => item !== symbol) : [...watchlist, symbol];
    setWatchlist(next);
    writeStorage(watchlistKey, next);
    show(`${symbol} ${next.includes(symbol) ? "added to" : "removed from"} your watchlist.`);
  }

  async function saveSettings() {
    const walletName = profile.walletName.trim();
    if (!walletName || busy) return;
    setBusy(true);
    try {
      const accountSaved = await runtime.saveCurrentAccountName(walletName);
      if (!accountSaved) {
        show("Wallet settings could not be saved. Try again.");
        return;
      }
      const saved = { ...profile, walletName };
      setProfile(saved);
      writeStorage(profileKey, saved);
      show("Wallet settings saved.");
      open("home");
    } catch (caught) {
      show(caught instanceof Error ? caught.message : "Wallet settings could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function chooseToken(token: WalletToken) {
    if (picker === "buy") setBuySymbol(token.symbol);
    if (picker === "swap-from") setSwapFrom(token.symbol);
    if (picker === "swap-to") setSwapTo(token.symbol);
    setPicker(null);
  }

  function renderHome() {
    const held = tokens.filter((token) => token.balance > 0);
    const displayed = (held.length ? held : tokens).slice(0, 4);
    const change = total > 0 ? tokens.reduce((sum, token) => sum + token.balance * token.price * token.change24h / 100, 0) : 0;
    const priorTotal = Math.max(0, total - change);
    const changePercent = priorTotal > 0 ? change / priorTotal * 100 : 0;
    const perps = tokens.filter((token) => ["BTC", "ETH", "SOL", "HYPE"].includes(token.symbol));
    const watched = watchlist.map((symbol) => tokens.find((token) => token.symbol === symbol)).filter(Boolean) as WalletToken[];
    return <div data-testid="trust-home" className="pb-8">
      <header className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Open wallet accounts" onClick={runtime.openAccounts} className="flex min-h-12 min-w-0 items-center gap-2 rounded-full border border-white/[.08] bg-[#181925] px-3 text-left">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#4437ff]"><WalletCards className="size-4" /></span>
          <span className="min-w-0"><strong className="block truncate text-sm">{activeProfile.walletName}</strong><span className="block truncate text-[10px] font-bold uppercase tracking-[.045em] text-white/38">Trust Wallet</span></span>
          <ChevronDown className="size-4 shrink-0 text-white/45" />
        </button>
        <div className="flex shrink-0 gap-1.5"><IconButton label="Refresh wallet" icon={refreshing ? LoaderCircle : RefreshCw} onClick={refreshWallet} /><IconButton label="Open transaction history" icon={History} onClick={runtime.openHistory} /><IconButton label="Open QR scanner" icon={QrCode} onClick={runtime.openScanner} /></div>
      </header>
      {refreshing ? <div data-testid="trust-refresh-status" role="status" className="mt-6 flex justify-center gap-2 text-sm font-bold text-white/50"><LoaderCircle className="size-4 animate-spin" />Refreshing wallet…</div> : null}
      {renderMarketStatus()}
      <button type="button" onClick={() => open("perpetuals")} className="mt-7 flex min-h-[4.3rem] w-full items-center gap-3 rounded-[1.2rem] border border-white/[.07] bg-[#151621] px-4 text-left"><span className="grid size-10 place-items-center rounded-xl bg-[#252547] text-[#8179ff]"><InfinityIcon className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">Explore perpetual markets</strong><span className="text-xs text-white/38">Internal practice markets</span></span><ChevronRight className="size-5 text-white/40" /></button>
      <section className="mt-9">
        <div className="flex min-w-0 items-center gap-2">{visible ? <SplitBalance value={total} currency={profile.currency} /> : <p className="min-w-0 flex-1 truncate text-[4rem] font-black">••••</p>}<button type="button" aria-label={visible ? "Hide portfolio balance" : "Show portfolio balance"} onClick={() => setVisible((value) => !value)} className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-white/45 focus-visible:outline-2 focus-visible:outline-[#665cff]">{visible ? <Eye className="size-5" /> : <EyeOff className="size-5" />}</button></div>
        <p className={`mt-3 text-lg font-extrabold ${change === 0 ? "text-white/45" : change > 0 ? "text-[#3ed474]" : "text-[#ff5364]"}`}>{change === 0 ? "" : change > 0 ? "▲ " : "▼ "}{cash(Math.abs(change), profile.currency)} ({Math.abs(changePercent).toFixed(2)}%)</p>
      </section>
      <div className="mt-8 grid grid-cols-4 gap-2.5"><Action label="Send" icon={ArrowUp} onClick={() => runtime.openTransfer()} /><Action label="Receive" icon={ArrowDown} onClick={() => runtime.openReceive()} /><Action label="Swap" icon={RefreshCw} primary onClick={() => open("swap")} /><Action label="Buy" icon={Plus} onClick={() => open("buy")} /></div>
      <section className="mt-10"><button type="button" onClick={() => open("tokens")} className="flex min-h-11 items-center gap-1 text-[23px] font-black">Tokens <ChevronRight className="size-5" /></button><div className="mt-2">{displayed.map((token) => <TokenRow key={token.id} token={token} currency={profile.currency} onClick={() => selectToken(token)} />)}</div><button type="button" onClick={() => open("tokens")} className="mt-3 min-h-11 rounded-2xl bg-[#191a28] px-5 text-sm font-extrabold">View all tokens <ChevronRight className="inline size-4" /></button></section>
      <section className="mt-10"><button type="button" onClick={() => { setPerpetualStage("list"); open("perpetuals"); }} className="flex min-h-11 items-center gap-1 text-[23px] font-black">Perpetuals <ChevronRight className="size-5" /></button><div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">{perps.map((token) => <button key={token.id} type="button" onClick={() => openPerpetualMarket(token.symbol)} className="min-h-[9.3rem] min-w-[10rem] rounded-[1.35rem] bg-[#191a28] p-4 text-left"><TokenIcon token={token} size={42} /><strong className="mt-4 block text-xl">{token.symbol} <span className="text-sm text-white/38">{token.symbol === "BTC" ? "40x" : "25x"}</span></strong><span className="mt-2 block text-sm font-bold text-white/45">{compact(token.volume24h ?? 0)} Vol</span></button>)}</div></section>
      <section className="mt-10"><button type="button" onClick={() => open("earn")} className="flex min-h-11 items-center gap-1 text-[23px] font-black">Earn <ChevronRight className="size-5" /></button><div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">{earnOffers.slice(0, 3).map((offer) => { const token = tokens.find((item) => item.symbol === offer.symbol); return <button key={offer.symbol} type="button" onClick={() => open("earn")} className="min-h-[9.3rem] min-w-[10rem] rounded-[1.35rem] bg-[#191a28] p-4 text-left">{token ? <TokenIcon token={token} size={40} /> : <span className="grid size-10 place-items-center rounded-full bg-[#303144]">{offer.symbol[0]}</span>}<strong className="mt-4 block text-lg">{offer.apy.toFixed(2)}% APY</strong><span className="text-sm font-bold text-white/40">on {offer.symbol}</span></button>; })}</div></section>
      <button type="button" aria-label="Ask Larpz Wallet AI" onClick={() => open("ai")} className="mt-9 flex min-h-[5.2rem] w-full items-center gap-3 rounded-[1.3rem] bg-[linear-gradient(110deg,#1b1c2c,#24253c)] px-5 text-left"><Sparkles className="size-6 text-[#8179ff]" /><span className="min-w-0 flex-1"><strong className="block text-lg">Larpz Wallet AI</strong><span className="text-sm text-white/42">Ask about your internal portfolio</span></span><ChevronRight className="size-5 text-white/45" /></button>
      <section className="mt-9"><button type="button" onClick={() => open("watchlist")} className="flex min-h-11 items-center gap-1 text-[23px] font-black">Watchlist <ChevronRight className="size-5" /></button>{watched.length ? <div>{watched.slice(0, 3).map((token) => <TokenRow key={token.id} token={token} currency={profile.currency} onClick={() => selectToken(token)} />)}</div> : <button type="button" onClick={() => open("watchlist")} className="mt-3 min-h-14 w-full rounded-2xl border border-dashed border-white/12 text-sm font-bold text-white/45">Customize watchlist</button>}</section>
      <section className="mt-10"><div className="flex items-center justify-between"><h2 className="text-[23px] font-black">Activity</h2><button type="button" onClick={runtime.openHistory} className="min-h-11 text-sm font-bold text-[#8179ff]">See all</button></div>{transactions.slice(0, 3).map((item) => <div key={item.id} className="mt-2 flex items-center gap-3 rounded-2xl bg-[#181925] p-4"><span className="grid size-10 place-items-center rounded-full bg-white/[.06]">{item.type === "receive" ? <ArrowDownLeft className="size-5 text-[#3ed474]" /> : <ArrowUp className="size-5 text-[#ff5364]" />}</span><span className="min-w-0 flex-1"><strong className="block">{item.type === "receive" ? "Received" : "Sent"} {item.tokenSymbol}</strong><span className="block truncate text-xs text-white/40">{item.counterpartyLabel}</span></span><strong>{item.type === "receive" ? "+" : "-"}{amount(item.amount)}</strong></div>)}</section>
    </div>;
  }

  function renderBuy() {
    const enteredFiat = Number(buyValue) || 0;
    const fiat = enteredFiat / rates[profile.currency];
    const serviceFee = fiat > 0 ? Math.max(0.25 / rates[profile.currency], fiat * 0.005) : 0;
    const tokenAmount = buyToken?.price ? Math.max(0, buyMode === "buy" ? fiat - serviceFee : fiat) / buyToken.price : 0;
    const paymentLabel = paymentMethod === "apple-pay" ? "Apple Pay" : "Debit card";

    if (buyStage === "success") {
      return <div data-testid="trust-buy-success" className="pb-8"><Header title={buyMode === "buy" ? "Purchase complete" : "Sale complete"} onBack={() => setBuyStage("entry")} /><div className="grid min-h-[65svh] place-items-center text-center"><div><span className="mx-auto grid size-24 place-items-center rounded-full bg-[#4437ff]"><Check className="size-12 stroke-[3]" /></span><h2 className="mt-7 text-3xl font-black">Balance updated</h2><p className="mx-auto mt-3 max-w-xs leading-6 text-white/48">{amount(tokenAmount, 8)} {buyToken?.symbol} was {buyMode === "buy" ? "added to" : "removed from"} your account.</p><button type="button" onClick={() => { setBuyStage("entry"); setBuyValue("0"); open("home"); }} className="mt-8 min-h-14 w-full rounded-full bg-[#4437ff] px-8 text-lg font-extrabold">Done</button></div></div></div>;
    }

    if (buyStage === "review") {
      return <div data-testid="trust-buy-review" className="pb-8"><Header title={`Review ${buyMode}`} onBack={() => setBuyStage("entry")} /><div className="mt-8 rounded-[1.6rem] bg-[#191a28] p-6 text-center"><span className="mx-auto flex w-fit items-center gap-2 rounded-full bg-[#10101b] px-4 py-2 font-bold">{buyToken ? <TokenIcon token={buyToken} size={28} /> : null}{buyToken?.symbol}</span><p className="mt-6 text-[42px] font-black tracking-[-.05em]">{amount(tokenAmount, 8)} {buyToken?.symbol}</p><p className="mt-2 text-white/42">{buyMode === "buy" ? "Added to" : "Removed from"} {activeProfile.walletName}</p><div className="mt-7 border-t border-white/[.07] pt-3 text-left text-sm"><div className="flex justify-between py-3 text-white/55"><span>Amount</span><strong className="text-white">{cash(fiat, profile.currency)}</strong></div><div className="flex justify-between py-3 text-white/55"><span>Service fee</span><strong className="text-white">{cash(serviceFee, profile.currency)}</strong></div><div className="flex justify-between py-3 text-white/55"><span>{buyMode === "buy" ? "Payment method" : "Payout method"}</span><strong className="text-white">{paymentLabel}</strong></div></div></div><button type="button" disabled={busy} onClick={() => void performBuySell()} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-full bg-[#4437ff] text-lg font-extrabold disabled:opacity-40">{busy ? <><LoaderCircle className="mr-2 size-5 animate-spin" />Updating ledger…</> : `Confirm ${buyMode}`}</button></div>;
    }

    return <div data-testid="trust-buy-screen" className="pb-8"><Header title="Buy and sell" onBack={back} /><div className="mx-auto mt-3 grid w-[17rem] max-w-full grid-cols-2 rounded-2xl bg-[#191a28] p-1">{(["buy", "sell"] as const).map((mode) => <button key={mode} type="button" onClick={() => { setBuyMode(mode); setBuyStage("entry"); buyRequestId.current = createId("trust-buy"); }} className={`min-h-11 rounded-xl text-base font-extrabold capitalize ${buyMode === mode ? "bg-[#10101b]" : "text-white/42"}`}>{mode}</button>)}</div><div className="mt-[clamp(2rem,8svh,6rem)] text-center"><div className="flex items-center justify-center gap-2"><span aria-hidden="true" className="text-[clamp(3.4rem,16vw,6rem)] font-black leading-none">{new Intl.NumberFormat("en-US", { style: "currency", currency: profile.currency, maximumFractionDigits: 0 }).formatToParts(0).find((part) => part.type === "currency")?.value}</span><input aria-label="Fiat amount" inputMode="decimal" value={buyValue} onChange={(event) => setBuyValue(event.target.value.replace(/[^0-9.]/g, ""))} className="min-w-0 max-w-[52%] bg-transparent text-right text-[clamp(3.4rem,16vw,6rem)] font-black leading-none tracking-[-.07em] outline-none" /><label className="relative flex min-h-12 items-center gap-2 rounded-2xl bg-[#191a28] px-3 text-base font-extrabold">{flags[profile.currency]} {profile.currency}<ChevronDown className="size-4" /><select aria-label="Fiat currency" value={profile.currency} onChange={(event) => setProfile((current) => ({ ...current, currency: event.target.value as Currency }))} className="absolute inset-0 cursor-pointer text-base opacity-0">{Object.keys(rates).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label></div><button type="button" aria-label="Select purchase token" onClick={() => setPicker("buy")} className="mt-5 inline-flex min-h-12 max-w-full items-center gap-2 rounded-2xl bg-[#191a28] px-4 text-base font-extrabold">{buyToken ? <TokenIcon token={buyToken} size={26} /> : null}<span className="truncate">{amount(tokenAmount, 8)} {buyToken?.symbol}</span><ChevronRight className="size-4 shrink-0 text-white/45" /></button></div><button type="button" onClick={() => setPaymentOpen(true)} className="mt-[clamp(2rem,6svh,4rem)] flex min-h-[4.5rem] w-full items-center gap-4 rounded-[1.2rem] bg-[#191a28] px-4 text-left"><span className="grid size-11 place-items-center rounded-full bg-white text-xs font-black text-black">Pay</span><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white/42">Payment method</span><strong className="block text-lg">{paymentLabel}</strong></span><ChevronRight className="size-5 text-white/45" /></button><Keypad value={buyValue} onChange={setBuyValue} /><p className="mb-3 text-center text-xs text-white/35">Limits: {cash(1, profile.currency)}–{cash(100_000, profile.currency)} · Fee {cash(serviceFee, profile.currency)}</p><button type="button" disabled={!buyToken || fiat < 1 || fiat > 100_000 || busy} onClick={() => setBuyStage("review")} className="flex min-h-14 w-full items-center justify-center rounded-full bg-[#4437ff] text-lg font-extrabold disabled:bg-[#27283a] disabled:text-white/22">{buyMode === "buy" ? "Review purchase" : "Review sale"}</button>{paymentOpen ? <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation"><button type="button" aria-label="Close payment methods" onClick={() => setPaymentOpen(false)} className="absolute inset-0" /><section role="dialog" aria-modal="true" aria-label="Payment methods" className="relative w-full max-w-md rounded-[1.7rem] bg-[#202130] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Payment method</h2><IconButton label="Close payment methods" icon={X} onClick={() => setPaymentOpen(false)} /></div><p className="mt-2 text-sm leading-6 text-white/45">Choose your preferred payment method.</p>{(["apple-pay", "demo-card"] as PaymentMethod[]).map((method) => <button key={method} type="button" onClick={() => { setPaymentMethod(method); setPaymentOpen(false); }} className={`mt-3 flex min-h-14 w-full items-center justify-between rounded-2xl px-4 font-bold ${paymentMethod === method ? "bg-[#4437ff]" : "bg-[#151621]"}`}><span>{method === "apple-pay" ? "Apple Pay" : "Debit card"}</span>{paymentMethod === method ? <Check className="size-5" /> : null}</button>)}</section></div> : null}</div>;
  }

  function renderSwap() {
    const numeric = Number(swapValue) || 0;
    const serviceFee = numeric * 0.0035;
    const output = fromToken && toToken && toToken.price > 0 ? Math.max(0, numeric - serviceFee) * fromToken.price / toToken.price : 0;

    if (swapStage === "success") {
      return <div data-testid="trust-swap-success" className="pb-8"><Header title="Swap complete" onBack={() => setSwapStage("entry")} /><div className="grid min-h-[66svh] place-items-center text-center"><div><span className="mx-auto grid size-24 place-items-center rounded-full bg-[#4437ff]"><Check className="size-12 stroke-[3]" /></span><h2 className="mt-7 text-3xl font-black">Assets swapped</h2><p className="mt-3 text-white/48">The shared account now includes {amount(output)} {toToken?.symbol}.</p><div className="mt-7 grid grid-cols-2 gap-3"><button type="button" onClick={() => { setSwapStage("entry"); setSwapValue("0"); }} className="min-h-14 rounded-full bg-[#191a28] font-extrabold">Swap again</button><button type="button" onClick={() => { setSwapStage("entry"); setSwapValue("0"); open("home"); }} className="min-h-14 rounded-full bg-[#4437ff] font-extrabold">Done</button></div></div></div></div>;
    }

    return <div data-testid="trust-swap-screen" className="pb-8"><Header title="Swap" onBack={back} right={<IconButton label="Swap settings" icon={Settings2} onClick={() => setSwapSettingsOpen(true)} />} /><button type="button" onClick={() => setSwapSettingsOpen(true)} className="mx-auto mt-2 flex min-h-11 items-center gap-2 rounded-full bg-[#191a28] px-4 font-bold">Market order <ChevronDown className="size-4" /></button><div className="mt-5 rounded-[1.45rem] bg-[#191a28] p-5"><div className="flex items-start gap-3"><input aria-label="Swap amount" inputMode="decimal" value={swapValue} onChange={(event) => setSwapValue(event.target.value.replace(/[^0-9.]/g, ""))} className="min-w-0 flex-1 bg-transparent text-[44px] font-black outline-none" /><button type="button" aria-label="Select source token" onClick={() => setPicker("swap-from")} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-[#10101b] px-3 text-lg font-extrabold">{fromToken ? <TokenIcon token={fromToken} size={28} /> : null}{fromToken?.symbol}<ChevronDown className="size-4" /></button></div><div className="mt-6 flex justify-between gap-3 text-sm font-bold text-white/42"><span className="truncate">{cash(numeric * (fromToken?.price ?? 0), "USD")}</span><span className="truncate">Balance {amount(fromToken?.balance ?? 0)}</span></div></div><button type="button" aria-label="Reverse swap tokens" onClick={() => { setSwapFrom(swapTo); setSwapTo(swapFrom); swapRequestId.current = createId("trust-swap"); }} className="relative z-10 mx-auto -my-4 grid size-11 place-items-center rounded-full border-4 border-[#10101b] bg-[#242535]"><ArrowDown className="size-5" /></button><div className="rounded-[1.45rem] bg-[#191a28] p-5"><div className="flex items-start gap-3"><p className="min-w-0 flex-1 truncate text-[44px] font-black text-white/32">{amount(output)}</p><button type="button" aria-label="Select destination token" onClick={() => setPicker("swap-to")} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl bg-[#10101b] px-3 text-lg font-extrabold">{toToken ? <TokenIcon token={toToken} size={28} /> : null}{toToken?.symbol}<ChevronDown className="size-4" /></button></div><div className="mt-6 flex justify-between gap-3 text-sm font-bold text-white/42"><span className="truncate">{cash(output * (toToken?.price ?? 0), "USD")}</span><span className="truncate">Balance {amount(toToken?.balance ?? 0)}</span></div></div><div className="mt-4 rounded-2xl bg-white/[.035] px-4 py-3 text-xs text-white/45"><div className="flex justify-between py-1"><span>Provider fee</span><strong className="text-white/75">{amount(serviceFee)} {fromToken?.symbol}</strong></div><div className="flex justify-between py-1"><span>Maximum slippage</span><strong className="text-white/75">{slippage.toFixed(1)}%</strong></div><div className="flex justify-between py-1"><span>Rate</span><strong className="text-right text-white/75">1 {fromToken?.symbol} ≈ {toToken?.price ? amount((fromToken?.price ?? 0) / toToken.price) : "—"} {toToken?.symbol}</strong></div></div><div className="mt-[clamp(1rem,3svh,2rem)]"><div className="flex justify-between text-xs font-bold text-white/35"><span>Min</span><span>25%</span><span>50%</span><span>75%</span><span>Max</span></div><input aria-label="Swap percentage" type="range" min="0" max="100" value={fromToken?.balance ? Math.min(100, numeric / fromToken.balance * 100) : 0} onChange={(event) => { setSwapValue(String((fromToken?.balance ?? 0) * Number(event.target.value) / 100)); swapRequestId.current = createId("trust-swap"); }} className="min-h-11 w-full accent-[#4437ff]" /></div><Keypad value={swapValue} onChange={(value) => { setSwapValue(value); swapRequestId.current = createId("trust-swap"); }} /><SwipeConfirm disabled={!fromToken || !toToken || numeric <= 0 || numeric > (fromToken?.balance ?? 0) || fromToken?.symbol === toToken?.symbol} busy={busy} onConfirm={() => void performSwap()} />{swapSettingsOpen ? <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation"><button type="button" aria-label="Close swap settings" onClick={() => setSwapSettingsOpen(false)} className="absolute inset-0" /><section role="dialog" aria-modal="true" aria-label="Swap settings" className="relative w-full max-w-md rounded-[1.7rem] bg-[#202130] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Market order settings</h2><IconButton label="Close swap settings" icon={X} onClick={() => setSwapSettingsOpen(false)} /></div><p className="mt-2 text-sm leading-6 text-white/45">The quote uses current server-side market prices. Choose the maximum accepted slippage.</p><div className="mt-5 grid grid-cols-3 gap-2">{[0.1, 0.5, 1].map((value) => <button key={value} type="button" onClick={() => setSlippage(value)} className={`min-h-12 rounded-xl font-bold ${slippage === value ? "bg-[#4437ff]" : "bg-[#151621]"}`}>{value.toFixed(1)}%</button>)}</div><button type="button" onClick={() => setSwapSettingsOpen(false)} className="mt-5 min-h-14 w-full rounded-full bg-[#4437ff] font-extrabold">Done</button></section></div> : null}</div>;
  }

  function renderTokenList(title = "Tokens") {
    const filtered = tokens.filter((token) => (!heldOnly || token.balance > 0) && `${token.name} ${token.symbol}`.toLowerCase().includes(query.toLowerCase()));
    return <div className="pb-8"><Header title={title} onBack={back} right={<IconButton label={heldOnly ? "Show all tokens" : "Show held tokens"} icon={ListFilter} active={heldOnly} onClick={() => setHeldOnly((value) => !value)} />} />{renderMarketStatus()}<label className="mt-5 flex min-h-14 items-center gap-3 rounded-[1.2rem] bg-[#191a28] px-4"><Search className="size-5 text-white/42" /><input aria-label="Search tokens" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/28" /></label><div className="mt-5">{filtered.map((token) => <TokenRow key={token.id} token={token} currency={profile.currency} onClick={() => selectToken(token)} />)}{!filtered.length ? <p className="py-20 text-center text-sm text-white/40">No tokens found.</p> : null}</div></div>;
  }

  function renderToken() {
    if (!selected) return renderHome();
    return (
      <div className="pb-24">
        <Header title={selected.name} onBack={back} right={<IconButton label={watchlist.includes(selected.symbol) ? "Remove from watchlist" : "Add to watchlist"} icon={Star} active={watchlist.includes(selected.symbol)} onClick={() => toggleWatch(selected.symbol)} />} />
        <div className="mt-6 flex min-w-0 items-center gap-3"><TokenIcon token={selected} size={50} /><div className="min-w-0"><p className="text-sm font-bold text-white/42">Market price</p><p className="truncate text-[38px] font-black tracking-[-.045em]">{cash(selected.price, profile.currency)}</p></div></div>
        <p className={`mt-2 font-extrabold ${selected.change24h >= 0 ? "text-[#3ed474]" : "text-[#ff5364]"}`}>{selected.change24h >= 0 ? "▲" : "▼"} {Math.abs(selected.change24h).toFixed(2)}% · 24 hours</p>
        <div className="-mx-4 mt-5"><TrustLiveChart symbol={selected.symbol} period={period} livePrice={selected.price} currency={profile.currency} rate={rates[profile.currency]} /></div>
        <div className="grid grid-cols-5 rounded-2xl bg-[#191a28] p-1">{["1D", "1W", "1M", "1Y", "ALL"].map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`min-h-11 rounded-xl text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#665cff] ${period === item ? "bg-[#343545]" : "text-white/42"}`}>{item}</button>)}</div>
        <div className="mt-8"><p className="text-sm font-bold text-white/42">Total balance</p><p className="truncate text-[32px] font-black">{cash(selected.balance * selected.price, profile.currency)}</p><p className="text-sm font-bold text-white/42">{amount(selected.balance)} {selected.symbol}</p></div>
        <div className="mt-7 grid grid-cols-3 gap-3"><Action label="Send" icon={ArrowUp} onClick={() => runtime.openTransfer(selected.symbol)} /><Action label="Receive" icon={ArrowDown} onClick={() => openReceiveFor(selected.symbol)} /><Action label="Swap" icon={RefreshCw} primary onClick={() => openSwapFor(selected.symbol)} /></div>
        <div className="mt-7 rounded-[1.3rem] bg-[#191a28] p-5"><p className="text-sm font-bold text-white/42">Account</p><div className="mt-3 flex min-w-0 justify-between gap-3"><strong className="truncate">Main {selected.name} account</strong><strong className="shrink-0">{amount(selected.balance)} {selected.symbol}</strong></div></div>
      </div>
    );
  }

  function renderAssetReceive() {
    if (!selected) return renderHome();
    const address = runtime.currentAccount?.address;
    return (
      <div data-testid="trust-asset-receive" className="pb-8">
        <Header title={`Receive ${selected.symbol}`} onBack={back} />
        <div className="mt-6 flex justify-center"><button type="button" aria-label="Choose a different receive token" onClick={() => runtime.openReceive()} className="flex min-h-12 items-center gap-2 rounded-full bg-[#191a28] px-4 font-extrabold"><TokenIcon token={selected} size={26} />{selected.name} <ChevronDown className="size-4 text-white/40" /></button></div>
        {address ? (
          <>
            <AddressQrCode value={address} variant="light" className="mx-auto mt-7 max-w-[20rem]"><TokenIcon token={selected} size={44} /></AddressQrCode>
            <p className="mx-auto mt-5 max-w-sm break-all text-center text-sm font-semibold leading-6 text-white/62">{address}</p>
            <div className="mt-6 rounded-[1.2rem] border border-[#f59e0b]/25 bg-[#f59e0b]/10 p-4 text-sm leading-6 text-white/65">Only send {networkName(selected.symbol)} assets to this address. Sending other tokens may result in permanent loss.</div>
            <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => void copyReceiveAddress()} className="flex min-h-14 items-center justify-center gap-2 rounded-[1.15rem] bg-[#191a28] font-extrabold focus-visible:outline-2 focus-visible:outline-[#665cff]"><Copy className="size-5" />Copy</button><button type="button" onClick={() => void shareReceiveAddress()} className="flex min-h-14 items-center justify-center gap-2 rounded-[1.15rem] bg-[#191a28] font-extrabold focus-visible:outline-2 focus-visible:outline-[#665cff]"><Share2 className="size-5" />Share</button></div>
          </>
        ) : <div role="alert" className="mt-12 rounded-[1.2rem] bg-[#191a28] p-6 text-center"><p className="text-white/55">No receiving account is selected.</p><button type="button" onClick={runtime.openAccounts} className="mt-5 min-h-12 rounded-full bg-[#4437ff] px-6 font-extrabold">Choose account</button></div>}
      </div>
    );
  }

  function renderEarn() {
    const value = selectedEarnPosition?.amount ?? (Number(earnValue) || 0);
    const redeeming = Boolean(selectedEarnPosition);

    if (earnStage === "success") {
      return <div data-testid="trust-earn-success" className="pb-8"><Header title="Earn updated" onBack={() => setEarnStage("list")} /><div className="grid min-h-[65svh] place-items-center text-center"><div><span className="mx-auto grid size-24 place-items-center rounded-full bg-[#4437ff]"><Check className="size-12 stroke-[3]" /></span><h2 className="mt-7 text-3xl font-black">Position updated</h2><p className="mx-auto mt-3 max-w-xs leading-6 text-white/48">Your internal Earn position, available balance, and wallet activity are now synchronized.</p><button type="button" onClick={() => { setEarnStage("list"); setEarnValue("0"); setEarnPositionId(undefined); }} className="mt-8 min-h-14 w-full rounded-full bg-[#4437ff] px-8 text-lg font-extrabold">View positions</button></div></div></div>;
    }

    if (earnStage === "review") {
      return <div data-testid="trust-earn-review" className="pb-8"><Header title={redeeming ? "Review redemption" : "Review allocation"} onBack={() => setEarnStage(redeeming ? "list" : "amount")} /><div className="mt-8 rounded-[1.5rem] bg-[#191a28] p-6"><div className="flex items-center gap-3"><TokenIcon token={earnToken} /><div><h2 className="text-xl font-black">{amount(value)} {earnToken?.symbol}</h2><p className="text-sm text-white/42">{redeeming ? "Return to available balance" : `${earnOffer?.apy.toFixed(2)}% displayed APY`}</p></div></div><div className="mt-6 border-t border-white/[.07] pt-3 text-sm"><div className="flex justify-between py-3 text-white/50"><span>Action</span><strong className="text-white">{redeeming ? "Redeem" : "Allocate"}</strong></div><div className="flex justify-between py-3 text-white/50"><span>Network</span><strong className="text-white">{networkName(earnToken?.symbol ?? "")}</strong></div><div className="flex justify-between py-3 text-white/50"><span>Fee</span><strong className="text-white">None</strong></div></div></div><p className="mt-4 rounded-2xl bg-[#4437ff]/10 p-4 text-sm leading-6 text-white/55">This action moves assets between your available and allocated balances.</p><button type="button" disabled={busy} onClick={() => void performEarn()} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-full bg-[#4437ff] text-lg font-extrabold disabled:opacity-40">{busy ? <><LoaderCircle className="mr-2 size-5 animate-spin" />Updating position…</> : redeeming ? "Confirm redemption" : "Confirm allocation"}</button></div>;
    }

    if (earnStage === "amount") {
      const valid = Boolean(earnToken && earnOffer && value > 0 && value <= earnToken.balance);
      return <div data-testid="trust-earn-amount" className="pb-8"><Header title={`Earn ${earnToken?.symbol ?? ""}`} onBack={() => setEarnStage("list")} /><div className="mt-7 rounded-[1.4rem] bg-[linear-gradient(135deg,#252342,#171825)] p-5"><div className="flex items-center gap-3"><TokenIcon token={earnToken} /><div><h2 className="text-xl font-black">{earnOffer?.apy.toFixed(2)}% APY</h2><p className="text-sm text-white/42">{earnOffer?.network} network</p></div></div></div><div className="mt-8 text-center"><p className="text-sm font-bold text-white/42">Amount to allocate</p><div className="mt-3 flex min-w-0 items-end justify-center gap-2"><KeypadAmountInput label="Earn amount" value={earnValue} onChange={(next) => { setEarnValue(next); earnRequestId.current = createId("trust-earn"); }} className="min-w-0 max-w-[75%] bg-transparent text-right text-[48px] font-black leading-none outline-none" /><strong className="pb-1 text-lg">{earnToken?.symbol}</strong></div><p className="mt-3 text-sm text-white/42">Available {amount(earnToken?.balance ?? 0)} {earnToken?.symbol}</p></div><Keypad value={earnValue} onChange={(next) => { setEarnValue(next); earnRequestId.current = createId("trust-earn"); }} /><button type="button" disabled={!valid} onClick={() => setEarnStage("review")} className="min-h-14 w-full rounded-full bg-[#4437ff] text-lg font-extrabold disabled:bg-[#27283a] disabled:text-white/22">Review allocation</button></div>;
    }

    return <div data-testid="trust-earn" className="pb-8"><Header title="Earn" onBack={back} /><div className="mt-6 rounded-[1.4rem] bg-[linear-gradient(135deg,#252342,#171825)] p-6"><Sparkles className="size-7 text-[#8179ff]" /><h2 className="mt-4 text-2xl font-black">Put your assets to work</h2><p className="mt-2 text-sm leading-6 text-white/45">Allocate assets to tracked positions and earn yield on your holdings.</p></div>{earnPositions.length ? <section className="mt-7"><h2 className="text-xl font-black">Your positions</h2><div className="mt-3 space-y-3">{earnPositions.map((position) => { const token = tokens.find((item) => item.symbol === position.symbol); return <div key={position.id} className="flex min-h-[5.5rem] items-center gap-3 rounded-[1.3rem] border border-[#4437ff]/20 bg-[#191a28] p-4">{token ? <TokenIcon token={token} /> : null}<span className="min-w-0 flex-1"><strong className="block truncate">{amount(position.amount)} {position.symbol}</strong><span className="text-sm text-[#3ed474]">{position.apy.toFixed(2)}% APY · Active</span></span><button type="button" onClick={() => reviewEarnRedemption(position)} className="min-h-11 shrink-0 rounded-full bg-white/[.07] px-3 text-sm font-extrabold">Redeem</button></div>; })}</div></section> : null}<section className="mt-7"><h2 className="text-xl font-black">Opportunities</h2><div className="mt-3 space-y-3">{earnOffers.map((offer) => { const token = tokens.find((item) => item.symbol === offer.symbol); return <button key={offer.symbol} type="button" aria-label={`Allocate ${offer.symbol} to Earn`} onClick={() => openEarnOffer(offer.symbol)} className="flex min-h-[5.4rem] w-full items-center gap-3 rounded-[1.3rem] bg-[#191a28] p-4 text-left focus-visible:outline-2 focus-visible:outline-[#665cff]">{token ? <TokenIcon token={token} /> : <span className="grid size-11 place-items-center rounded-full bg-[#303144]">{offer.symbol[0]}</span>}<span className="min-w-0 flex-1"><strong className="block text-lg">{offer.apy.toFixed(2)}% APY</strong><span className="text-sm text-white/40">{offer.network} · Available {amount(token?.balance ?? 0)}</span></span><span className="rounded-full bg-white/[.06] px-3 py-2 text-xs font-extrabold text-white/55">Start</span></button>; })}</div></section></div>;
  }

  function renderPerpetuals() {
    const perps = tokens.filter((token) => ["BTC", "ETH", "SOL", "HYPE", "BNB"].includes(token.symbol));
    const closing = Boolean(selectedPerpetualPosition);
    const value = selectedPerpetualPosition?.amount ?? (Number(perpetualValue) || 0);

    if (perpetualStage === "success") {
      return <div data-testid="trust-perpetual-success" className="pb-8"><Header title="Practice position updated" onBack={() => setPerpetualStage("list")} /><div className="grid min-h-[65svh] place-items-center text-center"><div><span className="mx-auto grid size-24 place-items-center rounded-full bg-[#4437ff]"><Check className="size-12 stroke-[3]" /></span><h2 className="mt-7 text-3xl font-black">Position updated</h2><p className="mx-auto mt-3 max-w-xs leading-6 text-white/48">Collateral, open positions, and internal wallet activity are synchronized.</p><button type="button" onClick={() => { setPerpetualStage("list"); setPerpetualValue("0"); setPerpetualPositionId(undefined); }} className="mt-8 min-h-14 w-full rounded-full bg-[#4437ff] px-8 text-lg font-extrabold">View practice markets</button></div></div></div>;
    }

    if (perpetualStage === "review") {
      const side = selectedPerpetualPosition?.side ?? perpetualSide;
      const leverage = selectedPerpetualPosition?.leverage ?? perpetualLeverage;
      const entryPrice = selectedPerpetualPosition?.entryPrice ?? perpetualToken?.price ?? 0;
      return <div data-testid="trust-perpetual-review" className="pb-8"><Header title={closing ? "Review close" : "Review practice order"} onBack={() => setPerpetualStage(closing ? "list" : "order")} /><div className="mt-8 rounded-[1.5rem] bg-[#191a28] p-6"><div className="flex items-center gap-3"><TokenIcon token={perpetualToken} /><div><h2 className="text-xl font-black capitalize">{side} {perpetualToken?.symbol} · {leverage}x</h2><p className="text-sm text-white/42">Internal practice position</p></div></div><div className="mt-6 border-t border-white/[.07] pt-3 text-sm"><div className="flex justify-between py-3 text-white/50"><span>Collateral</span><strong className="text-white">{amount(value)} {perpetualToken?.symbol}</strong></div><div className="flex justify-between py-3 text-white/50"><span>{closing ? "Entry price" : "Live entry"}</span><strong className="text-white">{cash(entryPrice, profile.currency)}</strong></div><div className="flex justify-between py-3 text-white/50"><span>Exposure</span><strong className="text-white">{amount(value * leverage)} {perpetualToken?.symbol}</strong></div></div></div><p className="mt-4 rounded-2xl bg-[#4437ff]/10 p-4 text-sm leading-6 text-white/55">{closing ? "Closing will return your collateral to your available balance." : "Opening will lock your collateral for the duration of this position."}</p><button type="button" disabled={busy} onClick={() => void performPerpetual()} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-full bg-[#4437ff] text-lg font-extrabold disabled:opacity-40">{busy ? <><LoaderCircle className="mr-2 size-5 animate-spin" />Updating position…</> : closing ? "Close position" : "Open practice position"}</button></div>;
    }

    if (perpetualStage === "order") {
      const maxLeverage = perpetualToken?.symbol === "BTC" ? 40 : 25;
      const valid = Boolean(perpetualToken && perpetualToken.price > 0 && value > 0 && value <= perpetualToken.balance);
      return <div data-testid="trust-perpetual-order" className="pb-8"><Header title={`${perpetualToken?.symbol ?? ""} perpetual`} onBack={() => setPerpetualStage("list")} right={<IconButton label="View asset details" icon={TrendingUp} onClick={() => perpetualToken && selectToken(perpetualToken)} />} /><div className="mt-5 grid grid-cols-2 rounded-2xl bg-[#191a28] p-1">{(["long", "short"] as const).map((side) => <button key={side} type="button" onClick={() => { setPerpetualSide(side); perpetualRequestId.current = createId("trust-perpetual"); }} className={`min-h-12 rounded-xl font-extrabold capitalize ${perpetualSide === side ? side === "long" ? "bg-[#183927] text-[#3ed474]" : "bg-[#431d29] text-[#ff6575]" : "text-white/42"}`}>{side}</button>)}</div><div className="mt-5 rounded-[1.35rem] bg-[#191a28] p-5"><div className="flex min-w-0 items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-3"><TokenIcon token={perpetualToken} /><span className="min-w-0"><strong className="block truncate text-lg">{perpetualToken?.name}</strong><span className="text-sm text-white/42">Live market</span></span></span><strong className="truncate text-lg">{cash(perpetualToken?.price ?? 0, profile.currency)}</strong></div></div><div className="mt-7 text-center"><p className="text-sm font-bold text-white/42">Collateral amount</p><div className="mt-3 flex min-w-0 items-end justify-center gap-2"><KeypadAmountInput label="Perpetual collateral" value={perpetualValue} onChange={(next) => { setPerpetualValue(next); perpetualRequestId.current = createId("trust-perpetual"); }} className="min-w-0 max-w-[72%] bg-transparent text-right text-[48px] font-black leading-none outline-none" /><strong className="pb-1 text-lg">{perpetualToken?.symbol}</strong></div><p className="mt-3 text-sm text-white/42">Available {amount(perpetualToken?.balance ?? 0)} {perpetualToken?.symbol}</p></div><div className="mt-6"><p className="mb-2 text-sm font-bold text-white/42">Leverage</p><div className="grid grid-cols-4 gap-2">{[2, 5, 10, maxLeverage].map((leverage) => <button key={leverage} type="button" onClick={() => { setPerpetualLeverage(leverage); perpetualRequestId.current = createId("trust-perpetual"); }} className={`min-h-11 rounded-xl font-extrabold ${perpetualLeverage === leverage ? "bg-[#4437ff]" : "bg-[#191a28]"}`}>{leverage}x</button>)}</div></div><Keypad value={perpetualValue} onChange={(next) => { setPerpetualValue(next); perpetualRequestId.current = createId("trust-perpetual"); }} /><button type="button" disabled={!valid} onClick={() => setPerpetualStage("review")} className="min-h-14 w-full rounded-full bg-[#4437ff] text-lg font-extrabold disabled:bg-[#27283a] disabled:text-white/22">Review practice order</button></div>;
    }

    return <div data-testid="trust-perpetuals" className="pb-8"><Header title="Perpetuals" onBack={back} /><div className="mt-6 rounded-[1.4rem] border border-[#4437ff]/30 bg-[#191a28] p-5"><Gauge className="size-6 text-[#8179ff]" /><h2 className="mt-3 text-2xl font-black">Practice markets</h2><p className="mt-2 text-sm leading-6 text-white/45">Open tracked internal positions without using real funds or a derivatives venue.</p></div>{perpetualPositions.length ? <section className="mt-7"><h2 className="text-xl font-black">Open positions</h2><div className="mt-3 space-y-3">{perpetualPositions.map((position) => { const token = tokens.find((item) => item.symbol === position.symbol); return <div key={position.id} className="flex min-h-[5.7rem] items-center gap-3 rounded-[1.3rem] border border-[#4437ff]/20 bg-[#191a28] p-4">{token ? <TokenIcon token={token} /> : null}<span className="min-w-0 flex-1"><strong className="block truncate capitalize">{position.side} {position.symbol} · {position.leverage}x</strong><span className="text-sm text-white/42">{amount(position.amount)} {position.symbol} collateral</span></span><button type="button" onClick={() => reviewPerpetualClose(position)} className="min-h-11 shrink-0 rounded-full bg-white/[.07] px-3 text-sm font-extrabold">Close</button></div>; })}</div></section> : null}<section className="mt-7"><h2 className="text-xl font-black">Markets</h2><div className="mt-3 grid grid-cols-2 gap-3">{perps.map((token) => <button key={token.id} type="button" aria-label={`Open ${token.symbol} perpetual market`} onClick={() => openPerpetualMarket(token.symbol)} className="min-h-[10rem] rounded-[1.35rem] bg-[#191a28] p-4 text-left focus-visible:outline-2 focus-visible:outline-[#665cff]"><TokenIcon token={token} /><strong className="mt-4 block text-xl">{token.symbol} <span className="text-sm text-white/40">{token.symbol === "BTC" ? "40x" : "25x"}</span></strong><span className={`mt-2 block font-bold ${token.change24h >= 0 ? "text-[#3ed474]" : "text-[#ff5364]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></button>)}</div></section></div>;
  }

  function renderWatchlist() {
    return <div className="pb-8"><Header title="Watchlist" onBack={back} /><p className="mt-5 text-sm text-white/45">Tap a star to customize your home watchlist.</p><div className="mt-5">{tokens.map((token) => <TokenRow key={token.id} token={token} currency={profile.currency} onClick={() => selectToken(token)} starred={watchlist.includes(token.symbol)} onStar={() => toggleWatch(token.symbol)} />)}</div></div>;
  }

  function renderAi() {
    const held = [...tokens].filter((token) => token.balance > 0).sort((a, b) => b.balance * b.price - a.balance * a.price);
    function submit(event: FormEvent) { event.preventDefault(); if (!aiQuery.trim()) return; const leader = held[0]; setMessages((items) => [...items, aiQuery.trim(), leader ? `Your largest holding is ${leader.name}, worth ${cash(leader.balance * leader.price, profile.currency)}. Your total portfolio value is ${cash(total, profile.currency)}.` : "This account has no assets yet. Use Buy or Receive to add funds."]); setAiQuery(""); }
    return <div className="flex min-h-[calc(100dvh-10rem)] flex-col pb-8"><Header title="Larpz Wallet AI" onBack={back} /><div className="mt-6 flex-1 space-y-3">{messages.map((message, index) => <div key={`${index}-${message}`} className={`max-w-[88%] rounded-[1.2rem] px-4 py-3 text-sm leading-6 ${index % 2 ? "ml-auto bg-[#4437ff]" : "bg-[#191a28] text-white/65"}`}>{message}</div>)}</div><form onSubmit={submit} className="mt-6 flex items-center gap-2 rounded-full bg-[#191a28] p-2"><input aria-label="Ask Larpz Wallet AI" value={aiQuery} onChange={(event) => setAiQuery(event.target.value)} placeholder="Ask about your portfolio" className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-white/25" /><button type="submit" aria-label="Send AI question" className="grid size-11 place-items-center rounded-full bg-[#4437ff]"><ArrowUp className="size-5" /></button></form></div>;
  }

  function renderDiscover() {
    const cards: { title: string; body: string; icon: LucideIcon; action: () => void }[] = [
      { title: "Wallet security", body: "Review access and device protection.", icon: ShieldCheck, action: runtime.openSecurity },
      { title: "Explore markets", body: "Browse live token prices.", icon: Globe2, action: () => open("market") },
      { title: "Practice perpetuals", body: "View internal simulations.", icon: InfinityIcon, action: () => open("perpetuals") },
      { title: "Wallet settings", body: "Choose currency and preferences.", icon: Settings2, action: () => open("settings") },
    ];
    return <div className="pb-8"><Header title="Discover" onBack={back} /><div className="mt-6 grid grid-cols-2 gap-3">{cards.map(({ title, body, icon: Icon, action }) => <button key={title} type="button" onClick={action} className="min-h-[10rem] rounded-[1.35rem] bg-[#191a28] p-5 text-left"><Icon className="size-7 text-[#8179ff]" /><strong className="mt-5 block text-lg">{title}</strong><span className="mt-2 block text-sm leading-5 text-white/40">{body}</span></button>)}</div></div>;
  }

  function renderSearch() {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery ? tokens.filter((token) => `${token.name} ${token.symbol}`.toLowerCase().includes(normalizedQuery)) : [];
    const features: { label: string; description: string; keywords: string; icon: LucideIcon; action: () => void }[] = [
      { label: "Buy and sell", description: "Add or sell internal assets", keywords: "purchase card apple pay", icon: CreditCard, action: () => open("buy") },
      { label: "Swap", description: "Exchange tokens", keywords: "trade convert", icon: RefreshCw, action: () => openSwapFor(tokens[0]?.symbol ?? "SOL") },
      { label: "Send", description: "Transfer to another account", keywords: "transfer address", icon: ArrowUp, action: () => runtime.openTransfer() },
      { label: "Receive", description: "Show an account QR code", keywords: "deposit qr address", icon: ArrowDown, action: () => runtime.openReceive() },
      { label: "Scan QR", description: "Open the rear-camera scanner", keywords: "camera send", icon: QrCode, action: runtime.openScanner },
      { label: "Earn", description: "Manage internal Earn positions", keywords: "apy stake rewards", icon: Sparkles, action: () => { setEarnStage("list"); open("earn"); } },
      { label: "Perpetuals", description: "Open practice positions", keywords: "leverage futures markets", icon: InfinityIcon, action: () => { setPerpetualStage("list"); open("perpetuals"); } },
      { label: "Watchlist", description: "Manage followed assets", keywords: "favorites stars", icon: Star, action: () => open("watchlist") },
      { label: "Transaction history", description: "Review shared transfers", keywords: "activity payments", icon: History, action: runtime.openHistory },
      { label: "Accounts", description: "Choose a wallet account", keywords: "wallet selector", icon: WalletCards, action: runtime.openAccounts },
      { label: "Settings", description: "Currency and preferences", keywords: "profile security", icon: Settings2, action: () => open("settings") },
      { label: "Larpz Wallet AI", description: "Ask about this portfolio", keywords: "assistant help", icon: Sparkles, action: () => open("ai") },
    ];
    const matchingFeatures = normalizedQuery ? features.filter((feature) => `${feature.label} ${feature.description} ${feature.keywords}`.toLowerCase().includes(normalizedQuery)) : features.slice(0, 6);
    return <div data-testid="trust-search" className="pb-8"><Header title="Search" onBack={back} /><label className="mt-5 flex min-h-14 items-center gap-3 rounded-[1.2rem] bg-[#191a28] px-4"><Search className="size-5 text-white/42" /><input autoFocus aria-label="Search wallet" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tokens and features" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/28" /></label>{matchingFeatures.length ? <section className="mt-6"><h2 className="text-sm font-extrabold uppercase tracking-[.12em] text-white/35">Features</h2><div className="mt-3 grid grid-cols-2 gap-3">{matchingFeatures.map(({ label, description, icon: Icon, action }) => <button key={label} type="button" onClick={action} className="min-h-28 min-w-0 rounded-[1.2rem] bg-[#191a28] p-4 text-left focus-visible:outline-2 focus-visible:outline-[#665cff]"><Icon className="size-6 text-[#8179ff]" /><strong className="mt-3 block truncate">{label}</strong><span className="mt-1 block text-xs leading-5 text-white/38">{description}</span></button>)}</div></section> : null}{filtered.length ? <section className="mt-7"><h2 className="text-sm font-extrabold uppercase tracking-[.12em] text-white/35">Tokens</h2><div className="mt-2">{filtered.map((token) => <TokenRow key={token.id} token={token} currency={profile.currency} onClick={() => selectToken(token)} />)}</div></section> : null}{normalizedQuery && !filtered.length && !matchingFeatures.length ? <p className="py-16 text-center text-white/40">No results found.</p> : null}</div>;
  }

  function renderSettings() {
    return (
      <div className="pb-8">
        <Header title="Wallet settings" onBack={back} />
        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-white/45">Wallet name</span>
            <input aria-label="Wallet name" value={profile.walletName} onChange={(event) => setProfile((current) => ({ ...current, walletName: event.target.value }))} className="min-h-14 w-full rounded-[1.15rem] border border-white/[.08] bg-[#191a28] px-4 text-base font-bold outline-none focus:border-[#665cff]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-white/45">Currency</span>
            <select aria-label="Currency" value={profile.currency} onChange={(event) => setProfile((current) => ({ ...current, currency: event.target.value as Currency }))} className="min-h-14 w-full rounded-[1.15rem] border border-white/[.08] bg-[#191a28] px-4 text-base font-bold outline-none">
              {Object.keys(rates).map((currency) => <option key={currency} value={currency}>{flags[currency as Currency]} {currency}</option>)}
            </select>
          </label>
          <section className="rounded-[1.15rem] bg-[#191a28] p-4" aria-labelledby="trust-appearance-heading">
            <h2 id="trust-appearance-heading" className="font-bold">Appearance</h2>
            <p className="mt-1 text-sm text-white/40">Choose how this Trust-style wallet looks on this device.</p>
            <div className="mt-4 grid grid-cols-2 rounded-[1rem] bg-[#202130] p-1" role="radiogroup" aria-label="Appearance theme">
              {(["dark", "light"] as const).map((scheme) => (
                <button
                  key={scheme}
                  type="button"
                  role="radio"
                  aria-label={`${scheme === "dark" ? "Dark" : "Light"} theme`}
                  aria-checked={profile.colorScheme === scheme}
                  onClick={() => setProfile((current) => ({ ...current, colorScheme: scheme }))}
                  className={`min-h-12 rounded-[.8rem] font-extrabold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#665cff] ${profile.colorScheme === scheme ? "bg-[#4437ff] text-white" : "text-white/55"}`}
                >
                  {scheme}
                </button>
              ))}
            </div>
          </section>
          <button type="button" aria-label="Toggle portfolio notifications" onClick={() => setProfile((current) => ({ ...current, notifications: !current.notifications }))} className="flex min-h-16 w-full items-center justify-between rounded-[1.15rem] bg-[#191a28] px-4 text-left">
            <span><strong className="block">Portfolio notifications</strong><span className="text-sm text-white/40">Internal activity reminders</span></span>
            <span className={`h-7 w-12 rounded-full p-1 ${profile.notifications ? "bg-[#4437ff]" : "bg-white/10"}`}><span className={`block size-5 rounded-full bg-white transition ${profile.notifications ? "translate-x-5" : ""}`} /></span>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={runtime.openAccounts} className="min-h-16 rounded-[1.15rem] bg-[#191a28] font-bold"><WalletCards className="mr-2 inline size-5" />Accounts</button>
            <button type="button" onClick={runtime.openSecurity} className="min-h-16 rounded-[1.15rem] bg-[#191a28] font-bold"><ShieldCheck className="mr-2 inline size-5" />Security</button>
          </div>
          <div className="rounded-[1.15rem] border border-[#4437ff]/25 bg-[#191a28] p-4 text-sm leading-6 text-white/45">Larpz Wallet is an internal no-real-funds experience. It never asks for seed phrases or private keys.</div>
          <button type="button" aria-label="Save settings" aria-busy={busy} disabled={!profile.walletName.trim() || busy} onClick={() => void saveSettings()} className="min-h-14 w-full rounded-full bg-[#4437ff] text-lg font-extrabold text-white disabled:opacity-40">{busy ? "Saving settings…" : "Save settings"}</button>
        </div>
      </div>
    );
  }

  let content: ReactNode;
  if (screen === "home") content = renderHome();
  else if (screen === "buy") content = renderBuy();
  else if (screen === "swap") content = renderSwap();
  else if (screen === "tokens") content = renderTokenList();
  else if (screen === "market") content = renderTokenList("Market");
  else if (screen === "token") content = renderToken();
  else if (screen === "asset-receive") content = renderAssetReceive();
  else if (screen === "earn") content = renderEarn();
  else if (screen === "perpetuals") content = renderPerpetuals();
  else if (screen === "watchlist") content = renderWatchlist();
  else if (screen === "ai") content = renderAi();
  else if (screen === "discover") content = renderDiscover();
  else if (screen === "search") content = renderSearch();
  else if (screen === "settings") content = renderSettings();
  else content = renderHome();

  const showBottomNav = ["home", "market", "discover", "search"].includes(screen) || (screen === "earn" && earnStage === "list");

  return (
    <main data-testid="trust-wallet" data-trust-color-scheme={profile.colorScheme} className="min-h-[100dvh] overflow-hidden bg-[#070811] text-white [font-family:-apple-system,BlinkMacSystemFont,'SF_Pro_Display','Inter',sans-serif]">
      <div className="relative mx-auto h-[100dvh] w-full max-w-[36rem] overflow-hidden bg-[#10101b] shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(68,55,255,.09),transparent_34%)]" />
        <div
          ref={scroll}
          className={`relative h-full overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] ${showBottomNav ? "pb-[calc(7.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"}`}
          onFocusCapture={(event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && ["Fiat amount", "Swap amount"].includes(target.getAttribute("aria-label") ?? "") && window.matchMedia("(pointer: coarse)").matches) target.blur();
          }}
          onTouchStart={(event) => {
            if (screen === "home" && event.currentTarget.scrollTop <= 0) pullStart.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchMove={(event) => {
            if (pullStart.current !== null) setPull(Math.max(0, Math.min(88, (event.touches[0]?.clientY ?? pullStart.current) - pullStart.current)));
          }}
          onTouchEnd={() => {
            if (pull > 68) refreshWallet();
            else setPull(0);
            pullStart.current = null;
          }}
        >
          {pull > 0 && !refreshing ? <div className="flex items-center justify-center text-xs font-bold text-white/45" style={{ height: pull }}><ArrowDown className="mr-2 size-4" />{pull > 68 ? "Release to refresh" : "Pull to refresh"}</div> : null}
          {content}
        </div>
        {showBottomNav ? <BottomNav active={screen} onOpen={open} /> : null}
        {picker ? <TokenPicker tokens={tokens} onChoose={chooseToken} onClose={() => setPicker(null)} /> : null}
        {notice ? <div role="status" className="absolute inset-x-5 top-[max(1rem,env(safe-area-inset-top))] z-[80] rounded-2xl border border-white/10 bg-[#242535]/95 px-4 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur-xl">{notice}</div> : null}
      </div>
    </main>
  );
}
