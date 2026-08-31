"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  CreditCard,
  Gem,
  Headphones,
  Heart,
  Info,
  Infinity,
  LineChart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Shuffle,
  Sparkles,
  TrendingUp,
  Trophy,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";

import { canonicalWalletTokens, liveMarketSymbols } from "@/config/tokens";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import { useWalletRuntime } from "@/components/wallet/wallet-runtime";
import {
  createTransaction,
  deleteToken,
  getTokens,
  getTransactions,
  saveToken,
} from "@/lib/wallet";
import { createId, readStorage, writeStorage } from "@/lib/storage";
import { tokensForWalletAccount, walletLedgerEvent } from "@/lib/wallet-ledger";
import { applyLiveMarketSnapshot, emptyLiveMarketSnapshot, type LiveMarketSnapshot } from "@/lib/wallet-market";

type Tab = "Home" | "Trade" | "Predictions" | "Explore";
type Action = "Send" | "Receive" | "Add Cash" | "Trade";
type HomeRefreshStatus = "idle" | "pulling" | "ready" | "refreshing" | "complete";
type TokenFlow = "send" | "buy";
type View =
  | "home"
  | "profile"
  | "history"
  | "watchlist"
  | "community"
  | "support"
  | "disclosures"
  | "token-picker"
  | "send-recipient"
  | "send-amount"
  | "send-summary"
  | "sending"
  | "sent"
  | "receive"
  | "add-cash"
  | "buy"
  | "perp-market"
  | "token-detail"
  | "sent-detail";

type ProfileRecord = {
  username: string;
  accountName: string;
  address: string;
  bio: string;
  email: string;
  twitter: string;
  discord: string;
  currency: string;
  avatar: string;
  cash: number;
  showCash: boolean;
};

type TokenForm = {
  id?: string;
  name: string;
  symbol: string;
  price: string;
  balance: string;
  change24h: string;
  image: string;
};

type TradeRequest = {
  payAsset: string;
  receiveAsset: string;
  payAmount: number;
  receiveAmount: number;
};

type PerpSide = "long" | "short";

type PerpPosition = {
  id: string;
  symbol: string;
  side: PerpSide;
  leverage: number;
  collateral: number;
  notional: number;
  entryPrice: number;
  openedAt: string;
};

type PerpOrderRequest = {
  symbol: string;
  side: PerpSide;
  leverage: number;
  collateral: number;
};

type MarketChartPoint = {
  time: number;
  price: number;
};

type CommunityMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

const profileStorageKey = "larpz_download_profile";
const notificationStorageKey = "larpz_download_notifications_prompted";
const watchlistStorageKey = "larpz_download_watchlist";
const perpPositionsStorageKey = "larpz_download_perp_positions";
const communityMessagesStorageKey = "larpz_download_community_messages";
const defaultWatchlistSymbols = ["BTC", "ETH", "SOL"];

const defaultProfile: ProfileRecord = {
  username: "larperwallet",
  accountName: "Account 1",
  address: "Ph1be3947eb8e444c8a84bc9361be564",
  bio: "",
  email: "",
  twitter: "",
  discord: "",
  currency: "USD",
  avatar: "🔐",
  cash: 0,
  showCash: true,
};

function readProfile() {
  const stored = readStorage<Partial<ProfileRecord>>(profileStorageKey, {});
  return {
    ...defaultProfile,
    ...stored,
    cash: typeof stored.cash === "number" && Number.isFinite(stored.cash) && stored.cash >= 0 ? stored.cash : defaultProfile.cash,
    showCash: stored.showCash !== false,
  };
}

const profileEmojis = [
  "🔥", "🔐", "🔮", "🖼️", "💯", "🔌",
  "⚒️", "⛓️", "🚀", "🌙", "💩", "👻",
  "👽", "👾", "🤖", "😼", "😁", "🫡",
  "🫥", "🤡", "💎", "🙌", "🗣️", "💪",
];

const profileAvatars = Array.from(
  { length: 20 },
  (_, index) => `/avatars/avatar-${String(index + 1).padStart(2, "0")}.svg`,
);

const preferredWalletTokenSymbols = [
  "USDT", "SOL", "ETH", "BTC", "SUI", "MATIC", "HYPE", "BNB",
];

const walletTokenOrder = [
  ...preferredWalletTokenSymbols,
  ...liveMarketSymbols.filter((symbol) => !preferredWalletTokenSymbols.includes(symbol)),
];

const blueChipSymbols = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "USDT", "USDC", "DOGE", "ADA", "TRX", "AVAX", "LINK"]);
const defiSymbols = new Set(["HYPE", "LINK", "AVAX", "DOT", "MATIC", "ARB", "OP", "ATOM", "SUI", "NEAR"]);
const currencyTypeSymbols: Record<string, Set<string>> = {
  Solana: new Set(["SOL", "WIF"]),
  Ethereum: new Set(["ETH", "USDT", "USDC", "LINK", "MATIC", "SHIB", "PEPE", "ARB", "OP"]),
  Stablecoins: new Set(["USDT", "USDC"]),
  Memes: new Set(["DOGE", "SHIB", "PEPE", "WIF"]),
};

const tokenVisuals: Record<string, { background: string; mark: string; foreground?: string }> = {
  BTC: { background: "#f5a623", mark: "₿" },
  ETH: { background: "#f1f3f6", mark: "◆", foreground: "#252a35" },
  SOL: { background: "#050607", mark: "≡" },
  BFS: { background: "radial-gradient(circle at 35% 30%, #ffe65b 0%, #f7a52b 48%, #eb4b39 69%, #2ab4ca 100%)", mark: "BFS" },
  USDT: { background: "#20b486", mark: "₮" },
  USDC: { background: "#2775ca", mark: "$" },
  SUI: { background: "#4b98f5", mark: "S", foreground: "white" },
  MATIC: { background: "#8247e5", mark: "⬡", foreground: "white" },
  HYPE: { background: "#063b38", mark: "〰", foreground: "#63f4dc" },
  BNB: { background: "#f3ba2f", mark: "◆", foreground: "white" },
};

const liveTokenCatalogue: WalletToken[] = canonicalWalletTokens.map((token) => ({
  ...token,
  id: `market-${token.symbol.toLowerCase()}`,
  updatedAt: "",
}));

const emptyTokenForm: TokenForm = {
  name: "",
  symbol: "",
  price: "",
  balance: "",
  change24h: "0",
  image: "",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Updating…";
  const maximumFractionDigits = value >= 1 ? 2 : value >= 0.01 ? 4 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

function formatCompactMoney(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "Updating…";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function changeForPeriod(token: WalletToken, period: "1h" | "24h" | "7d") {
  if (period === "1h") return token.change1h ?? token.change24h;
  if (period === "7d") return token.change7d ?? token.change24h;
  return token.change24h;
}

function formatSignedMoney(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
}

function maxPerpLeverage(symbol: string) {
  if (symbol === "BTC") return 40;
  if (symbol === "ETH") return 25;
  if (symbol === "HYPE") return 10;
  return 20;
}

function perpPositionPnl(position: PerpPosition, currentPrice: number) {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || position.entryPrice <= 0) return 0;
  const priceMove = (currentPrice - position.entryPrice) / position.entryPrice;
  return position.notional * (position.side === "long" ? priceMove : -priceMove);
}

function perpLiquidationPrice(entryPrice: number, side: PerpSide, leverage: number) {
  const maintenanceBuffer = 0.005;
  const move = Math.max(0, 1 / leverage - maintenanceBuffer);
  return side === "long" ? entryPrice * (1 - move) : entryPrice * (1 + move);
}

function shortAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

const referenceSolanaToken: WalletToken = {
  id: "solana-reference",
  name: "Solana",
  symbol: "SOL",
  balance: 0.09413,
  price: 9.23 / 0.09413,
  change24h: 2.97,
  image: "",
  updatedAt: "",
};

const referenceBfsToken: WalletToken = {
  id: "bfs-reference",
  name: "BFS",
  symbol: "BFS",
  balance: 176.12138,
  price: 0.05 / 176.12138,
  change24h: 0.01,
  image: "",
  updatedAt: "",
};

function referenceHomeTokens(tokens: WalletToken[]) {
  const storedSolana = tokens.find((token) => token.symbol === "SOL");
  const storedBfs = tokens.find((token) => token.symbol === "BFS");

  return [
    storedSolana
      ? { ...referenceSolanaToken, ...storedSolana, id: storedSolana.id }
      : referenceSolanaToken,
    storedBfs
      ? { ...referenceBfsToken, ...storedBfs, id: storedBfs.id }
      : referenceBfsToken,
  ];
}

function mergeLiveTokenCatalogue(tokens: WalletToken[]) {
  const known = new Map<string, WalletToken>();
  for (const token of [...liveTokenCatalogue, referenceSolanaToken, referenceBfsToken]) {
    known.set(token.symbol, token);
  }
  for (const token of tokens) {
    const isEmptyCatalogueToken =
      token.id.startsWith("market-") && token.balance === 0 && token.price === 0;
    if (!isEmptyCatalogueToken) known.set(token.symbol, token);
  }
  return [...known.values()];
}

function migrateLegacyReferenceHoldings(tokens: WalletToken[]) {
  const legacyUsdt = tokens.find((token) => token.symbol === "USDT");
  const legacySolana = tokens.find((token) => token.symbol === "SOL");
  const isLegacySeed = legacyUsdt?.balance === 65 && legacySolana?.balance === 0.05178;
  if (!isLegacySeed) return tokens;

  const migrated = tokens.map((token) => {
    if (token.symbol === "USDT") return saveToken({ ...token, balance: 0 });
    if (token.symbol === "SOL") return saveToken({ ...token, balance: 0.09413 });
    return token;
  });
  if (!migrated.some((token) => token.symbol === "BFS")) {
    migrated.push(saveToken(referenceBfsToken));
  }
  return migrated;
}

function sortTokens(tokens: WalletToken[]) {
  return [...tokens].sort((a, b) => {
    const valueDifference = b.price * b.balance - a.price * a.balance;
    if (Math.abs(valueDifference) > Number.EPSILON) return valueDifference;
    const aIndex = walletTokenOrder.indexOf(a.symbol);
    const bIndex = walletTokenOrder.indexOf(b.symbol);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

function tokenMark(token: WalletToken) {
  return tokenVisuals[token.symbol]?.mark ?? token.symbol.slice(0, 1);
}

function TokenIcon({ token, size = "normal" }: { token: WalletToken; size?: "small" | "normal" | "large" }) {
  const visual = tokenVisuals[token.symbol] ?? { background: "#8068e8", mark: tokenMark(token) };
  const dimensions = size === "small" ? "h-8 w-8 text-sm" : size === "large" ? "h-[clamp(4rem,20vw,5rem)] w-[clamp(4rem,20vw,5rem)] text-[clamp(1.8rem,8vw,2.25rem)]" : "h-[clamp(2.5rem,12vw,3rem)] w-[clamp(2.5rem,12vw,3rem)] text-[clamp(1rem,5vw,1.25rem)]";

  return (
    <span
      className={`relative isolate grid shrink-0 place-items-center overflow-hidden rounded-full font-bold shadow-[inset_0_1px_2px_rgba(255,255,255,.35)] ${dimensions}`}
      style={{ background: visual.background, color: visual.foreground ?? "white" }}
    >
      <TokenGlyph token={token} />
      {token.image && token.symbol !== "BFS" ? <Image src={token.image} alt={`${token.name} logo`} fill unoptimized sizes="80px" className="z-10 object-contain" /> : null}
      {token.symbol === "USDT" ? <span className="absolute bottom-0 right-0 z-20 grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] text-black">▤</span> : null}
    </span>
  );
}

function TokenGlyph({ token }: { token: WalletToken }) {
  if (token.symbol === "SOL") {
    return (
      <span className="flex -skew-y-6 flex-col gap-[3px]">
        <span className="h-[0.16em] w-[1.1em] rounded-sm bg-gradient-to-r from-[#55f6c7] via-[#5e8cff] to-[#b537f2]" />
        <span className="h-[0.16em] w-[1.1em] rounded-sm bg-gradient-to-r from-[#b537f2] via-[#5e8cff] to-[#55f6c7]" />
        <span className="h-[0.16em] w-[1.1em] rounded-sm bg-gradient-to-r from-[#55f6c7] via-[#5e8cff] to-[#b537f2]" />
      </span>
    );
  }

  if (token.symbol === "BFS") {
    return <Image src="/bfs-coin.svg" alt="" fill unoptimized sizes="80px" className="z-10 object-contain" />;
  }

  return <span className="relative z-0">{tokenMark(token)}</span>;
}

function PhantomCashMark({ className = "h-5 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} data-testid="phantom-cash-mark" viewBox="0 0 28 24">
      <path
        clipRule="evenodd"
        d="M4.25 3.5h19.5A2.75 2.75 0 0 1 26.5 6.25v11.5a2.75 2.75 0 0 1-2.75 2.75H4.25a2.75 2.75 0 0 1-2.75-2.75V6.25A2.75 2.75 0 0 1 4.25 3.5ZM14 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5ZM5.75 6.75a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm16.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function LockAvatar({ value = "🔐", size = "normal" }: { value?: string; size?: "small" | "normal" | "large" }) {
  const imageSource = value === "🔐" ? "/assets/logo_m.png" : value.startsWith("/avatars/") ? value : null;
  const dimensions = size === "large" ? "h-24 w-24 text-5xl" : size === "small" ? "h-11 w-11 text-xl" : "h-12 w-12 text-2xl";
  const imageSize = size === "large" ? "96px" : size === "small" ? "44px" : "48px";

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#242426] ${dimensions}`}>
      {imageSource ? <Image src={imageSource} alt="Profile avatar" fill unoptimized sizes={imageSize} className="object-cover" /> : value}
    </span>
  );
}

function WalletTabs({ activeTab, avatar, onChange, onMenu }: { activeTab: Tab; avatar: string; onChange: (tab: Tab) => void; onMenu: () => void }) {
  const tabs: { value: Tab; label: string }[] = [
    { value: "Home", label: "Home" },
    { value: "Trade", label: "Trade" },
    { value: "Predictions", label: "Predictions" },
    { value: "Explore", label: "Explore" },
  ];

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onClick={onMenu} aria-label="Open wallet menu" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition hover:scale-[1.03] active:scale-95">
        <LockAvatar value={avatar} size="small" />
      </button>
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-[clamp(.9rem,4.3vw,1.1rem)] font-semibold transition ${activeTab === value ? "bg-[#a295f3] text-black" : "bg-[#252527] text-white/65 hover:bg-[#303033] hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ScreenHeader({ title, onBack, action, actionLabel }: { title: string; onBack: () => void; action?: () => void; actionLabel?: string }) {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-black px-4 pb-5 pt-[calc(env(safe-area-inset-top)+18px)]">
      <button type="button" onClick={onBack} aria-label="Go back" className="grid h-12 w-12 place-items-center rounded-full bg-[#242426] text-white transition hover:bg-[#303033]"><ArrowLeft className="h-6 w-6" /></button>
      <h1 className="text-[23px] font-semibold tracking-[-0.04em]">{title}</h1>
      {actionLabel ? <button type={action ? "button" : "submit"} onClick={action} className="px-1 text-[20px] font-medium text-[#a295f3]">{actionLabel}</button> : <span className="w-12" />}
    </header>
  );
}

function NotificationPrompt({ onClose }: { onClose: () => void }) {
  const enableNotifications = async () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    window.localStorage.setItem(notificationStorageKey, "true");
    onClose();
  };

  const dismiss = () => {
    window.localStorage.setItem(notificationStorageKey, "true");
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center bg-black/55 px-3 pb-24 backdrop-blur-[7px] sm:items-center sm:pb-0">
      <section className="w-full max-w-[510px] rounded-[2rem] border border-white/10 bg-[#1d1d1f] px-6 pb-5 pt-8 text-center shadow-[0_24px_80px_rgba(0,0,0,.8)]" aria-label="Enable notifications">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#29283b] text-[#a295f3]"><Bell className="h-10 w-10" /></div>
        <h2 className="mt-7 text-[24px] font-semibold tracking-[-0.04em]">Enable notifications</h2>
        <p className="mx-auto mt-5 max-w-[390px] text-[18px] leading-[1.45] text-white/60">Get notified when wallet activity arrives, including incoming transfers and price updates.</p>
        <button type="button" onClick={enableNotifications} className="mt-7 w-full rounded-full bg-[#a295f3] px-5 py-4 text-[18px] font-medium text-black transition hover:bg-[#b4aaff]">Enable Notifications</button>
        <button type="button" onClick={dismiss} className="mt-3 w-full rounded-full bg-[#29292b] px-5 py-4 text-[18px] text-white/70 transition hover:bg-[#343436]">Not Now</button>
      </section>
    </div>
  );
}

function SideDrawer({ profile, onClose, onAccounts, onProfile, onCommunity, onWatchlist, onHistory, onSettings, onSupport, onNotice }: { profile: ProfileRecord; onClose: () => void; onAccounts: () => void; onProfile: () => void; onCommunity: () => void; onWatchlist: () => void; onHistory: () => void; onSettings: () => void; onSupport: () => void; onNotice: (message: string) => void }) {
  const item = (icon: LucideIcon, label: string, onClick: () => void) => {
    const Icon = icon;
    return <button type="button" onClick={onClick} className="flex w-full items-center gap-5 px-1 py-4 text-left text-[20px] font-medium text-white transition hover:text-[#a295f3]"><Icon className="h-6 w-6" />{label}</button>;
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-[2px]" role="presentation">
      <button type="button" onClick={onClose} aria-label="Close menu" className="absolute inset-0 cursor-default" />
      <aside className="relative flex h-full w-[min(84vw,390px)] flex-col border-r border-white/[0.06] bg-black px-7 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+30px)] shadow-[20px_0_60px_rgba(0,0,0,.75)]">
        <div className="flex items-start justify-between">
          <div><LockAvatar value={profile.avatar} /><p className="mt-6 text-[25px] font-semibold tracking-[-0.04em]">@{profile.username}</p></div>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(profile.address); onNotice("Wallet address copied."); }} aria-label="Copy wallet address" className="grid h-12 w-12 place-items-center rounded-full bg-[#202022] text-white/75 transition hover:text-white"><Copy className="h-5 w-5" /></button>
        </div>
        <button type="button" onClick={onProfile} className="mt-6 flex items-center gap-2 text-left text-[15px] font-semibold text-[#a99bf7]"><span className="text-lg">𝕏</span> Connect your X account</button>
        <div className="mt-10">
          <button type="button" onClick={onAccounts} className="flex items-center gap-4 py-3 text-left text-[17px] font-semibold text-white/90"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#202022] text-xs">A</span> {profile.accountName} <ChevronDown className="h-4 w-4 text-white/50" /></button>
          {item(UserRound, "Profile", onProfile)}
          {item(MessageCircle, "Chats", onCommunity)}
          {item(Heart, "Watchlist", onWatchlist)}
          {item(Clock3, "Activity", onHistory)}
        </div>
        <div className="mt-auto space-y-1">
          {item(Settings, "Settings", onSettings)}
          {item(CircleHelp, "Help & Support", onSupport)}
        </div>
      </aside>
    </div>
  );
}

function HomeView({
  tokens,
  profile,
  tab,
  cashVisible,
  tokenQuery,
  watchlistSymbols,
  refreshOffset,
  refreshStatus,
  onTab,
  onMenu,
  onCash,
  onOpenWatchlist,
  onAccounts,
  onExecuteTrade,
  perpPositions,
  onOpenPerp,
  onClosePerp,
  onToken,
  onCommunity,
  onSupport,
  onDisclosures,
  onRefresh,
}: {
  tokens: WalletToken[];
  profile: ProfileRecord;
  tab: Tab;
  cashVisible: boolean;
  tokenQuery: string;
  watchlistSymbols: string[];
  refreshOffset: number;
  refreshStatus: HomeRefreshStatus;
  onTab: (tab: Tab) => void;
  onMenu: () => void;
  onCash: () => void;
  onOpenWatchlist: () => void;
  onAccounts: () => void;
  onExecuteTrade: (trade: TradeRequest) => boolean;
  perpPositions: PerpPosition[];
  onOpenPerp: (token: WalletToken) => void;
  onClosePerp: (position: PerpPosition) => void;
  onToken: (token: WalletToken) => void;
  onCommunity: () => void;
  onSupport: () => void;
  onDisclosures: () => void;
  onRefresh: () => void;
}) {
  const referenceTokens = useMemo(() => referenceHomeTokens(tokens), [tokens]);
  const displayTokens = useMemo(
    () => sortTokens([
      ...referenceTokens,
      ...tokens.filter((token) => token.balance > 0 && token.symbol !== "SOL" && token.symbol !== "BFS"),
    ]),
    [referenceTokens, tokens],
  );
  const filteredTokens = useMemo(() => {
    const query = tokenQuery.trim().toLowerCase();
    if (!query) return displayTokens;
    return displayTokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query),
    );
  }, [displayTokens, tokenQuery]);
  const watchlistTokens = useMemo(
    () => watchlistSymbols
      .map((symbol) => tokens.find((token) => token.symbol === symbol))
      .filter((token): token is WalletToken => Boolean(token)),
    [tokens, watchlistSymbols],
  );
  const displayTotal = displayTokens.reduce(
    (sum, token) => sum + token.balance * token.price,
    profile.cash,
  );
  const displayChangeValue = displayTokens.reduce(
    (sum, token) => sum + token.price * token.balance * (token.change24h / 100),
    0,
  );
  const displayChange =
    displayTotal === 0 ? 0 : (displayChangeValue / displayTotal) * 100;
  const showingReference = tokenQuery.trim().length === 0;
  const accountName = profile.accountName;
  const isDraggingRefresh = refreshStatus === "pulling" || refreshStatus === "ready";
  const isRefreshing = refreshStatus === "refreshing";
  const refreshStatusText = refreshStatus === "refreshing"
    ? "Refreshing wallet"
    : refreshStatus === "complete"
      ? "Wallet updated"
      : refreshStatus === "ready"
        ? "Release to refresh"
        : "Pull to refresh";
  const pulledContentStyle = {
    transform: `translate3d(0, ${refreshOffset}px, 0)`,
    transition: isDraggingRefresh ? "none" : "transform 260ms cubic-bezier(.22,.8,.24,1)",
  };

  return (
    <>
      {refreshStatus !== "idle" ? (
        <div
          role="status"
          aria-live="polite"
          className="phantom-refresh-status pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+13px)] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.06] bg-[#19191b] py-1.5 pl-2 pr-3 text-xs font-semibold text-white/65 shadow-[0_10px_35px_rgba(0,0,0,.55)]"
          style={{ opacity: Math.min(1, refreshOffset / 28) }}
        >
          <span className={`grid h-7 w-7 place-items-center rounded-full ${refreshStatus === "complete" ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#a295f3]/15 text-[#a99bf7]"}`}>
            {refreshStatus === "complete" ? <Check className="h-4 w-4" /> : <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} style={isDraggingRefresh ? { transform: `rotate(${Math.min(240, refreshOffset * 4)}deg)` } : undefined} />}
          </span>
          <span>{refreshStatusText}</span>
        </div>
      ) : null}

      <div className="phantom-home-nav sticky top-0 z-20 min-w-0 border-b border-white/[0.025] bg-black/85 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-2xl" style={pulledContentStyle}>
        <WalletTabs activeTab={tab} avatar={profile.avatar} onChange={onTab} onMenu={onMenu} />
      </div>

      {tab === "Home" ? (
        <section className="phantom-home-content px-5 pb-40 pt-8" style={pulledContentStyle}>
          <div className="flex items-center justify-between gap-4"><button type="button" onClick={onAccounts} className="flex min-w-0 max-w-full items-center gap-1.5 truncate text-[18px] font-semibold text-white/70"><span className="truncate">{accountName}</span><ChevronDown className="h-4 w-4 shrink-0" /></button><span className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={onRefresh} disabled={isRefreshing} aria-label="Refresh wallet data" className="grid h-8 w-8 place-items-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-wait"><RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-[#a99bf7]" : ""}`} /></button><span aria-label="Parody wallet disclosure" className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/30">Parody wallet</span></span></div>
          <h1 className="mt-2 overflow-hidden text-[48px] font-semibold leading-none tracking-[-0.065em] text-white">{formatMoney(displayTotal)}</h1>
          <div className={`mt-3 flex items-center gap-2 text-[18px] font-semibold ${displayChangeValue < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}><span className="truncate">{formatSignedMoney(displayChangeValue)}</span><span className={`shrink-0 rounded-[.65rem] px-2 py-0.5 text-black ${displayChangeValue < 0 ? "bg-[#ff1744]" : "bg-[#00e676]"}`}>{displayChange >= 0 ? "+" : ""}{displayChange.toFixed(2)}%</span></div>

          <button type="button" onClick={onCash} className="mt-8 flex h-[72px] w-full items-center justify-between rounded-[1.55rem] border border-white/[0.035] bg-[#191919] px-6 text-left transition hover:bg-[#232323] active:scale-[.99]"><span className="flex items-center gap-4 text-[20px] font-semibold"><PhantomCashMark /><span data-testid="phantom-cash-label">Cash</span></span><span className="shrink-0 text-[20px]">{profile.showCash && cashVisible ? formatMoney(profile.cash) : "••••"}</span></button>

          <WatchlistPromo onBrowse={onOpenWatchlist} />

          <SectionHeading>Token</SectionHeading>
          <div className="mt-4 space-y-2.5">
            {filteredTokens.map((token, index) => <TokenRow key={token.id} token={token} animationDelay={260 + Math.min(index, 6) * 45} onClick={() => onToken(token)} />)}
            {filteredTokens.length === 0 ? <div className="rounded-[1.5rem] bg-[#19191b] px-5 py-7 text-center text-white/55">No tokens match your search.</div> : null}
          </div>
          {showingReference ? <><PerpsSection tokens={tokens} positions={perpPositions} onOpen={onOpenPerp} /><PredictionsStrip onOpen={() => onTab("Predictions")} /><DiscoverySections watchlistTokens={watchlistTokens} onWatchlist={onOpenWatchlist} onToken={onToken} onPerps={() => onTab("Trade")} onPredictions={() => onTab("Predictions")} onMarkets={() => onTab("Trade")} onCommunity={onCommunity} onSupport={onSupport} onDisclosures={onDisclosures} /></> : null}
        </section>
      ) : tab === "Trade" ? <TradeView tokens={tokens} cashBalance={profile.cash} perpPositions={perpPositions} onToken={onToken} onExecuteTrade={onExecuteTrade} onOpenPerp={onOpenPerp} onClosePerp={onClosePerp} /> : tab === "Predictions" ? <PredictionsView /> : <ExploreView onPerps={() => onTab("Trade")} onPredictions={() => onTab("Predictions")} onMarkets={() => onTab("Trade")} onSupport={onSupport} />}

    </>
  );
}

function HomeDock({ tokenQuery, actionsOpen, onSearch, onActions }: { tokenQuery: string; actionsOpen: boolean; onSearch: (value: string) => void; onActions: () => void }) {
  return (
    <div data-no-pull-refresh className="phantom-home-dock absolute inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[560px] items-center gap-3 border-t border-white/[0.035] bg-black/80 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-2xl">
      <label data-testid="phantom-home-search" className="flex h-14 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-white/[0.035] bg-[#202022] px-4 text-[16px] font-medium text-white/40">
        <Search className="h-5 w-5 shrink-0" />
        <input value={tokenQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search Phantom" aria-label="Search Phantom" className="min-w-0 w-full flex-1 bg-transparent outline-none placeholder:text-white/35" />
      </label>
      <button type="button" onClick={onActions} aria-label={actionsOpen ? "Close wallet actions" : "Open wallet actions"} className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[0_6px_30px_rgba(0,0,0,.5)] transition hover:scale-105 active:scale-95 ${actionsOpen ? "bg-[#202022] text-white" : "bg-[#a295f3] text-black"}`}>{actionsOpen ? <X className="h-7 w-7" /> : <Plus className="h-8 w-8" />}</button>
    </div>
  );
}

function SectionHeading({ children, action }: { children: ReactNode; action?: () => void }) {
  const heading = <h2 className="text-[28px] font-semibold tracking-[-.05em]">{children}</h2>;
  if (!action) return <div className="mt-8 flex items-center gap-1.5">{heading}</div>;
  return <button type="button" onClick={action} className="mt-8 flex items-center gap-1.5 text-left">{heading}<ChevronRight className="h-6 w-6 text-white/65" /></button>;
}

function WatchlistPromo({ onBrowse }: { onBrowse: () => void }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <aside className="relative mt-6 min-h-[170px] overflow-hidden rounded-[1.8rem] border border-white/[0.04] bg-[linear-gradient(145deg,#171719,#101011)] p-6">
      <div className="relative z-10 max-w-[63%]">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-[#a99bf7]">Watchlist</p>
        <h2 className="mt-3 text-[24px] font-semibold leading-[1.08] tracking-[-.04em]">What&apos;s moving on HyperEVM?</h2>
        <button type="button" onClick={onBrowse} className="mt-5 flex items-center gap-1 text-base font-semibold text-[#a99bf7]">Browse <ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="absolute -bottom-3 -right-1 h-40 w-[138px] overflow-hidden rounded-[2rem] shadow-[0_0_50px_rgba(115,244,219,.08)]">
        <Image src="/assets/hyperevm-watchlist.png" alt="HyperEVM watchlist artwork" fill sizes="138px" className="object-cover" priority />
        <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss watchlist card" className="absolute right-0 top-0 z-20 h-11 w-11 rounded-full focus-visible:ring-2 focus-visible:ring-[#a99bf7]" />
      </div>
    </aside>
  );
}

function PredictionsStrip({ onOpen }: { onOpen: () => void }) {
  const predictions = [
    { title: "BTC Up or Down · 5m", time: "Live now", live: true },
    { title: "ETH above $4K?", time: "Closes in 2h", live: false },
  ];
  return (
    <section>
      <SectionHeading action={onOpen}>Predictions</SectionHeading>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {predictions.map((prediction) => (
          <button key={prediction.title} type="button" onClick={onOpen} className="min-h-40 min-w-[78%] rounded-[1.7rem] border border-white/[0.035] bg-[#191919] p-5 text-left transition hover:bg-[#222223] sm:min-w-[58%]">
            <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#f7931a] text-2xl font-bold text-white">₿</span>{prediction.live ? <span className="flex items-center gap-1 text-base font-bold text-[#ff1744]"><Radio className="h-4 w-4" /> Live</span> : null}</div>
            <p className="mt-7 truncate text-xl font-semibold">{prediction.title}</p>
            <p className="mt-1 text-base text-white/55">{prediction.time}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoverySections({ watchlistTokens, onWatchlist, onToken, onPerps, onPredictions, onMarkets, onCommunity, onSupport, onDisclosures }: { watchlistTokens: WalletToken[]; onWatchlist: () => void; onToken: (token: WalletToken) => void; onPerps: () => void; onPredictions: () => void; onMarkets: () => void; onCommunity: () => void; onSupport: () => void; onDisclosures: () => void }) {
  const explore = [
    { icon: Infinity, title: "Perps", description: "Go long or short on leading markets", action: onPerps },
    { icon: Sparkles, title: "Predictions", description: "Follow outcomes across crypto and culture", action: onPredictions },
    { icon: TrendingUp, title: "Markets", description: "Discover live currency opportunities", action: onMarkets },
  ];
  return (
    <>
      <section>
        <SectionHeading action={onWatchlist}>Watchlist</SectionHeading>
        {watchlistTokens.length ? <div className="mt-4 space-y-2.5">{watchlistTokens.slice(0, 5).map((token) => <button key={token.id} type="button" onClick={() => onToken(token)} className="flex w-full items-center gap-4 rounded-[1.55rem] border border-white/[0.035] bg-[#191919] px-4 py-3 text-left transition hover:bg-[#222223]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block truncate text-lg">{token.name}</strong><span className="mt-0.5 block text-base text-white/50">{token.symbol}</span></span><span className="shrink-0 text-right"><span className="block text-lg">{formatPrice(token.price)}</span><span className={`mt-0.5 block text-base font-semibold ${token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></span></button>)}</div> : <button type="button" onClick={onWatchlist} className="mt-4 flex w-full items-center gap-4 rounded-[1.6rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left">
          <Heart className="h-7 w-7 text-[#a99bf7]" />
          <span className="min-w-0"><strong className="block truncate text-lg">Follow what matters</strong><span className="mt-1 block truncate text-base text-white/55">Find currencies and live markets to track</span></span>
        </button>}
        {watchlistTokens.length > 0 ? <button type="button" onClick={onWatchlist} className="mt-3 w-full py-2 text-center text-base font-semibold text-[#a99bf7]">Manage watchlist</button> : null}
      </section>
      <section>
        <SectionHeading>Explore</SectionHeading>
        <div className="mt-4 space-y-2.5">
          {explore.map(({ icon: Icon, title, description, action }) => <button key={title} type="button" onClick={action} className="flex w-full items-center gap-4 rounded-[1.55rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left transition hover:bg-[#222223]"><Icon className="h-7 w-7 text-[#a99bf7]" /><span className="min-w-0"><strong className="block text-lg">{title}</strong><span className="mt-1 block truncate text-base text-white/55">{description}</span></span></button>)}
        </div>
      </section>
      <section className="pb-4">
        <SectionHeading>Support</SectionHeading>
        <button type="button" onClick={onSupport} className="mt-5 flex w-full items-center justify-between py-3 text-left text-xl font-semibold">View FAQ <ChevronRight className="h-5 w-5 text-white/55" /></button>
        <button type="button" onClick={onCommunity} className="flex w-full items-center justify-between py-3 text-left text-xl font-semibold">Chat with us <ChevronRight className="h-5 w-5 text-white/55" /></button>
        <button type="button" onClick={onDisclosures} className="mt-3 flex items-center gap-2 py-3 text-left text-base text-white/35"><Info className="h-4 w-4" /> View disclosures</button>
      </section>
    </>
  );
}

function WatchlistScreen({ tokens, watchlistSymbols, onBack, onToken, onToggle }: { tokens: WalletToken[]; watchlistSymbols: string[]; onBack: () => void; onToken: (token: WalletToken) => void; onToggle: (token: WalletToken) => void }) {
  const [query, setQuery] = useState("");
  const filteredTokens = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...tokens]
      .filter((token) => token.symbol !== "BFS")
      .filter((token) => !normalizedQuery || token.name.toLowerCase().includes(normalizedQuery) || token.symbol.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const aWatched = watchlistSymbols.includes(a.symbol);
        const bWatched = watchlistSymbols.includes(b.symbol);
        if (aWatched !== bWatched) return aWatched ? -1 : 1;
        return (b.marketCap ?? 0) - (a.marketCap ?? 0) || a.name.localeCompare(b.name);
      });
  }, [query, tokens, watchlistSymbols]);
  const watchedCount = watchlistSymbols.filter((symbol) => tokens.some((token) => token.symbol === symbol)).length;

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-black pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <ScreenHeader title="Watchlist" onBack={onBack} />
      <div className="px-4 pb-12">
        <div className="mt-4 rounded-[1.7rem] border border-white/[0.04] bg-[linear-gradient(145deg,#211d2c,#151517)] p-5">
          <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#a295f3] text-black"><Heart className="h-7 w-7 fill-current" /></span><div><h1 className="text-2xl font-semibold tracking-[-.04em]">Your currencies</h1><p className="mt-1 text-base text-white/50">{watchedCount} {watchedCount === 1 ? "currency" : "currencies"} followed</p></div></div>
        </div>

        <label className="mt-5 flex items-center gap-3 rounded-full bg-[#202022] px-5 py-4 text-white/45"><Search className="h-5 w-5 shrink-0" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search currencies" aria-label="Search watchlist currencies" className="min-w-0 flex-1 bg-transparent text-[17px] text-white outline-none placeholder:text-white/35" /></label>

        <div className="mb-3 mt-8 flex items-end justify-between px-1"><div><p className="text-sm font-bold uppercase tracking-[.12em] text-[#a99bf7]">Markets</p><h2 className="mt-1 text-[28px] font-semibold tracking-[-.05em]">Add currencies</h2></div><span className="pb-1 text-sm text-white/40">Live prices</span></div>
        <div className="overflow-hidden rounded-[1.7rem] border border-white/[0.04] bg-[#191919]">
          {filteredTokens.map((token) => {
            const isWatched = watchlistSymbols.includes(token.symbol);
            return <div key={token.id} className="flex items-center border-b border-white/[0.055] px-4 py-3 last:border-0"><button type="button" onClick={() => onToken(token)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block truncate text-[18px]">{token.name}</strong><span className="mt-0.5 block text-[15px] text-white/45">{token.symbol}</span></span><span className="shrink-0 text-right"><span className="block text-[17px]">{formatPrice(token.price)}</span><span className={`mt-0.5 block text-[15px] font-semibold ${token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></span></button><button type="button" onClick={() => onToggle(token)} aria-label={isWatched ? `Remove ${token.name} from watchlist` : `Add ${token.name} to watchlist`} aria-pressed={isWatched} className="ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#252527] transition hover:bg-[#303033]"><Heart className={`h-5 w-5 ${isWatched ? "fill-[#a295f3] text-[#a295f3]" : "text-white/55"}`} /></button></div>;
          })}
          {filteredTokens.length === 0 ? <div className="px-5 py-12 text-center"><Search className="mx-auto h-8 w-8 text-white/25" /><p className="mt-3 text-lg text-white/55">No currencies found.</p></div> : null}
        </div>
      </div>
    </div>
  );
}

function CashIcon({ size = "normal" }: { size?: "small" | "normal" }) {
  return <span className={`grid shrink-0 place-items-center rounded-full bg-[#a295f3] text-black ${size === "small" ? "h-8 w-8" : "h-12 w-12"}`}><BadgeDollarSign className={size === "small" ? "h-5 w-5" : "h-7 w-7"} /></span>;
}

function TradeAssetPicker({ title, tokens, cashBalance, selectedAsset, onClose, onSelect }: { title: string; tokens: WalletToken[]; cashBalance: number; selectedAsset: string; onClose: () => void; onSelect: (asset: string) => void }) {
  const [query, setQuery] = useState("");
  const availableTokens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...tokens]
      .filter((token) => !normalized || token.name.toLowerCase().includes(normalized) || token.symbol.toLowerCase().includes(normalized))
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || a.name.localeCompare(b.name));
  }, [query, tokens]);

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 px-2 backdrop-blur-md sm:items-center"><button type="button" onClick={onClose} aria-label="Close currency picker" className="absolute inset-0" /><section className="relative max-h-[84svh] w-full max-w-[548px] overflow-hidden rounded-t-[2rem] border border-white/[0.06] bg-[#151516] pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-2xl sm:rounded-[2rem]" aria-label={title}><div className="flex items-center justify-between px-5 pb-3 pt-5"><div><p className="text-sm font-bold uppercase tracking-[.1em] text-[#a99bf7]">Trade</p><h2 className="mt-1 text-[26px] font-semibold tracking-[-.04em]">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close currency picker" className="grid h-11 w-11 place-items-center rounded-full bg-[#252527]"><X className="h-5 w-5" /></button></div><label className="mx-4 mt-2 flex items-center gap-3 rounded-full bg-[#242426] px-4 py-3.5"><Search className="h-5 w-5 text-white/40" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search currencies" aria-label="Search trade currencies" className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-white/35" /></label><div className="mt-4 max-h-[62svh] overflow-y-auto px-3"><button type="button" aria-label="Select Cash" onClick={() => onSelect("CASH")} className="flex w-full items-center gap-4 rounded-[1.3rem] px-3 py-3 text-left transition hover:bg-white/[0.05]"><CashIcon /><span className="min-w-0 flex-1"><strong className="block text-[19px]">Cash</strong><span className="text-[15px] text-white/45">USD balance</span></span><span className="text-right text-[17px]">{formatMoney(cashBalance)}</span>{selectedAsset === "CASH" ? <Check className="h-5 w-5 text-[#a99bf7]" /> : <span className="w-5" />}</button>{availableTokens.map((token) => <button key={token.id} type="button" aria-label={`Select ${token.name}`} onClick={() => onSelect(token.symbol)} className="flex w-full items-center gap-4 rounded-[1.3rem] px-3 py-3 text-left transition hover:bg-white/[0.05]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block truncate text-[19px]">{token.name}</strong><span className="text-[15px] text-white/45">{token.symbol} · {formatAmount(token.balance)} available</span></span><span className="shrink-0 text-right text-[17px]">{formatPrice(token.price)}</span>{selectedAsset === token.symbol ? <Check className="h-5 w-5 text-[#a99bf7]" /> : <span className="w-5" />}</button>)}</div></section></div>;
}

function MarketFilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label;
  return <label className="relative flex shrink-0 items-center gap-2 rounded-full bg-[#202022] px-4 py-2.5 text-base font-semibold text-white/70"><span>{selectedLabel}</span><ChevronDown className="h-4 w-4" /><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="absolute inset-0 cursor-pointer opacity-0">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function TradeView({ tokens, cashBalance, perpPositions, onToken, onExecuteTrade, onOpenPerp, onClosePerp }: { tokens: WalletToken[]; cashBalance: number; perpPositions: PerpPosition[]; onToken: (token: WalletToken) => void; onExecuteTrade: (trade: TradeRequest) => boolean; onOpenPerp: (token: WalletToken) => void; onClosePerp: (position: PerpPosition) => void }) {
  const [amount, setAmount] = useState("");
  const [payAsset, setPayAsset] = useState("SOL");
  const [receiveAsset, setReceiveAsset] = useState("CASH");
  const [assetPicker, setAssetPicker] = useState<"pay" | "receive" | null>(null);
  const [tradeError, setTradeError] = useState("");
  const [activeMarket, setActiveMarket] = useState<"Tokens" | "Perps">("Tokens");
  const [category, setCategory] = useState<"Blue Chips" | "Top Volume" | "DeFi">("Blue Chips");
  const [sortMode, setSortMode] = useState("rank");
  const [currencyType, setCurrencyType] = useState("all");
  const [period, setPeriod] = useState<"1h" | "24h" | "7d">("24h");
  const tradable = useMemo(() => [...tokens].filter((token) => token.symbol !== "BFS" && token.price > 0), [tokens]);
  const payToken = payAsset === "CASH" ? null : tokens.find((token) => token.symbol === payAsset) ?? null;
  const receiveToken = receiveAsset === "CASH" ? null : tokens.find((token) => token.symbol === receiveAsset) ?? null;
  const payPrice = payAsset === "CASH" ? 1 : payToken?.price ?? 0;
  const receivePrice = receiveAsset === "CASH" ? 1 : receiveToken?.price ?? 0;
  const amountValue = Number(amount) || 0;
  const receiveValue = payPrice > 0 && receivePrice > 0 ? amountValue * payPrice / receivePrice : 0;
  const payAvailable = payAsset === "CASH" ? cashBalance : payToken?.balance ?? 0;
  const payUsdValue = amountValue * payPrice;

  const marketTokens = useMemo(() => {
    let filtered = tradable.filter((token) => category === "Blue Chips" ? blueChipSymbols.has(token.symbol) : category === "DeFi" ? defiSymbols.has(token.symbol) : true);
    if (currencyType !== "all") {
      const allowed = currencyTypeSymbols[currencyType];
      filtered = allowed ? filtered.filter((token) => allowed.has(token.symbol)) : filtered;
    }
    return [...filtered].sort((a, b) => {
      if (sortMode === "gainers") return changeForPeriod(b, period) - changeForPeriod(a, period);
      if (sortMode === "losers") return changeForPeriod(a, period) - changeForPeriod(b, period);
      if (sortMode === "price-high") return b.price - a.price;
      if (sortMode === "price-low") return a.price - b.price;
      if (category === "Top Volume") return (b.volume24h ?? 0) - (a.volume24h ?? 0);
      return (b.marketCap ?? 0) - (a.marketCap ?? 0);
    });
  }, [category, currencyType, period, sortMode, tradable]);

  const selectAsset = (asset: string) => {
    if (assetPicker === "pay") {
      if (asset === receiveAsset) setReceiveAsset(payAsset);
      setPayAsset(asset);
    } else if (assetPicker === "receive") {
      if (asset === payAsset) setPayAsset(receiveAsset);
      setReceiveAsset(asset);
    }
    setAssetPicker(null);
    setTradeError("");
  };

  const swapDirection = () => {
    setPayAsset(receiveAsset);
    setReceiveAsset(payAsset);
    setAmount("");
    setTradeError("");
  };

  const executeTrade = () => {
    if (payAsset === receiveAsset) { setTradeError("Choose two different currencies."); return; }
    if (!Number.isFinite(amountValue) || amountValue <= 0) { setTradeError("Enter an amount to trade."); return; }
    if (!payPrice || !receivePrice) { setTradeError("A live quote is not available for this currency."); return; }
    if (amountValue > payAvailable) { setTradeError(`Insufficient ${payAsset === "CASH" ? "cash" : payAsset} balance.`); return; }
    if (onExecuteTrade({ payAsset, receiveAsset, payAmount: amountValue, receiveAmount: receiveValue })) {
      setAmount("");
      setTradeError("");
    }
  };

  const assetButton = (asset: string, token: WalletToken | null, picker: "pay" | "receive") => <button type="button" onClick={() => setAssetPicker(picker)} aria-label={`Choose ${picker} currency`} className="flex shrink-0 items-center gap-2 rounded-full bg-[#252527] px-3 py-2 text-xl font-semibold">{asset === "CASH" ? <CashIcon size="small" /> : token ? <TokenIcon token={token} size="small" /> : null}{asset === "CASH" ? "Cash" : asset}<ChevronDown className="h-4 w-4" /></button>;

  const categories: { label: "Blue Chips" | "Top Volume" | "DeFi"; icon: LucideIcon }[] = [{ icon: Trophy, label: "Blue Chips" }, { icon: BarChart3, label: "Top Volume" }, { icon: Gem, label: "DeFi" }];

  return (
    <section className="px-4 pb-48 pt-5">
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map(({ icon: Icon, label }) => <button key={label} type="button" onClick={() => setCategory(label)} aria-pressed={category === label} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-3 text-base font-semibold transition ${category === label ? "border-[#a295f3]/50 bg-[#a295f3] text-black" : "border-white/[0.04] bg-[#1c1c1e] text-white"}`}><Icon className={`h-5 w-5 ${category === label ? "text-black" : "text-[#a99bf7]"}`} />{label}</button>)}
      </div>
      <div className="relative mt-5">
        <div className="rounded-[1.8rem] border border-white/[0.035] bg-[#191919] p-6">
          <div className="flex items-center justify-between"><span className="text-lg font-semibold text-white/55">You pay</span><button type="button" aria-label="Use maximum available balance" onClick={() => setAmount(payAvailable > 0 ? String(payAvailable) : "")} className="rounded-full bg-[#252527] px-3 py-2 text-sm font-bold text-[#a99bf7]">MAX</button></div>
          <div className="mt-8 flex items-center gap-3"><input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setTradeError(""); }} placeholder="0" aria-label={`Amount of ${payAsset === "CASH" ? "cash" : payAsset} to pay`} className="min-w-0 flex-1 bg-transparent text-5xl font-semibold tracking-[-.06em] outline-none placeholder:text-white/25" />{assetButton(payAsset, payToken, "pay")}</div>
          <div className="mt-5 flex items-center justify-between text-base text-white/55"><span>{amountValue ? formatMoney(payUsdValue) : "$0.00"}</span><span>{payAsset === "CASH" ? formatMoney(payAvailable) : `${formatAmount(payAvailable)} ${payAsset}`} available</span></div>
        </div>
        <button type="button" onClick={swapDirection} aria-label="Swap trade direction" className="absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-black bg-[#a295f3] text-black"><Repeat2 className="h-6 w-6 rotate-90" /></button>
        <div className="mt-2 rounded-[1.8rem] border border-white/[0.035] bg-[#191919] p-6">
          <span className="text-lg font-semibold text-white/55">You receive</span>
          <div className="mt-8 flex items-center gap-3"><span className={`min-w-0 flex-1 truncate text-5xl font-semibold tracking-[-.06em] ${receiveValue ? "text-white" : "text-white/30"}`}>{receiveAsset === "CASH" ? (receiveValue ? formatMoney(receiveValue) : "$0.00") : receiveValue ? formatAmount(receiveValue) : "0"}</span>{assetButton(receiveAsset, receiveToken, "receive")}</div>
          <p className="mt-5 text-right text-base text-white/55">{receiveValue ? formatMoney(receiveValue * receivePrice) : "$0.00"}</p>
        </div>
      </div>
      {tradeError ? <p className="mt-3 rounded-2xl bg-[#ff1744]/12 px-4 py-3 text-center text-sm font-medium text-[#ff7189]">{tradeError}</p> : null}
      <button type="button" onClick={executeTrade} disabled={!amountValue || payAsset === receiveAsset} className="mt-4 w-full rounded-full bg-[#a295f3] px-5 py-4 text-[18px] font-semibold text-black transition hover:bg-[#b5aaff] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-35">Trade {payAsset === "CASH" ? "Cash" : payAsset} for {receiveAsset === "CASH" ? "Cash" : receiveAsset}</button>

      <div className="mt-10 flex gap-6 border-b border-white/[0.06] text-[1.7rem] font-semibold tracking-[-.05em]">{(["Tokens", "Perps"] as const).map((market) => <button key={market} type="button" onClick={() => setActiveMarket(market)} className={`pb-3 ${activeMarket === market ? "border-b-2 border-white text-white" : "text-white/30"}`}>{market}</button>)}</div>
      {activeMarket === "Perps" && perpPositions.length ? <CompactPerpPositions positions={perpPositions} tokens={tokens} onOpen={onOpenPerp} onClose={onClosePerp} /> : null}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><MarketFilterSelect label="Market ranking" value={sortMode} onChange={setSortMode} options={[{ value: "rank", label: "Rank" }, { value: "gainers", label: "Top gainers" }, { value: "losers", label: "Top losers" }, { value: "price-high", label: "Price: high" }, { value: "price-low", label: "Price: low" }]} /><MarketFilterSelect label="Currency type" value={currencyType} onChange={setCurrencyType} options={[{ value: "all", label: "All currencies" }, { value: "Solana", label: "Solana" }, { value: "Ethereum", label: "Ethereum" }, { value: "Stablecoins", label: "Stablecoins" }, { value: "Memes", label: "Memes" }]} /><MarketFilterSelect label="Change period" value={period} onChange={(value) => setPeriod(value as "1h" | "24h" | "7d")} options={[{ value: "1h", label: "1h" }, { value: "24h", label: "24h" }, { value: "7d", label: "7d" }]} /></div>
      <div className="mt-6 space-y-1">
        {activeMarket === "Tokens" ? marketTokens.map((token, index) => { const change = changeForPeriod(token, period); return <button key={token.id} type="button" aria-label={`Open ${token.name} market`} onClick={() => onToken(token)} className="flex w-full items-center gap-4 rounded-2xl px-1 py-3 text-left transition hover:bg-white/[0.035]"><span className="relative"><TokenIcon token={token} /><span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#f0c625] text-[10px] font-bold text-black">{index + 1}</span></span><span className="min-w-0 flex-1"><strong className="block truncate text-xl">{token.symbol}</strong><span className="mt-1 block truncate text-base text-white/55">{category === "Top Volume" ? `${formatCompactMoney(token.volume24h)} volume` : `${formatCompactMoney(token.marketCap)} MC`}</span></span><span className="text-right"><span className="block text-lg">{formatPrice(token.price)}</span><span className={`mt-1 block text-lg font-semibold ${change < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></span></button>; }) : <PerpsMarketList tokens={marketTokens} period={period} onOpen={onOpenPerp} />}
        {marketTokens.length === 0 ? <div className="rounded-[1.5rem] bg-[#191919] px-5 py-10 text-center text-white/50">No markets match these filters.</div> : null}
      </div>
      {assetPicker ? <TradeAssetPicker title={assetPicker === "pay" ? "Choose what to pay" : "Choose what to receive"} tokens={tokens} cashBalance={cashBalance} selectedAsset={assetPicker === "pay" ? payAsset : receiveAsset} onClose={() => setAssetPicker(null)} onSelect={selectAsset} /> : null}
    </section>
  );
}

function PerpsMarketList({ tokens, period, onOpen }: { tokens: WalletToken[]; period: "1h" | "24h" | "7d"; onOpen: (token: WalletToken) => void }) {
  return <>{tokens.slice(0, 8).map((token) => { const change = changeForPeriod(token, period); return <button key={token.id} type="button" onClick={() => onOpen(token)} className="flex w-full items-center gap-4 rounded-2xl px-1 py-3 text-left transition hover:bg-white/[0.035]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block text-xl">{token.symbol}-PERP</strong><span className="text-base text-white/50">Up to {maxPerpLeverage(token.symbol)}x leverage</span></span><span className="shrink-0 text-right"><span className="block text-base">{formatPrice(token.price)}</span><span className={change < 0 ? "text-[#ff1744]" : "text-[#00e676]"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span></span><ChevronRight className="h-5 w-5 text-white/35" /></button>; })}</>;
}

function CompactPerpPositions({ positions, tokens, onOpen, onClose }: { positions: PerpPosition[]; tokens: WalletToken[]; onOpen: (token: WalletToken) => void; onClose: (position: PerpPosition) => void }) {
  return (
    <section className="mt-5 rounded-[1.6rem] border border-white/[0.045] bg-[#151516] p-4">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Open positions</h3><span className="rounded-full bg-[#292633] px-3 py-1 text-sm font-bold text-[#a99bf7]">{positions.length}</span></div>
      <div className="mt-3 space-y-2">
        {positions.map((position) => {
          const token = tokens.find((item) => item.symbol === position.symbol);
          const currentPrice = token?.price ?? position.entryPrice;
          const pnl = perpPositionPnl(position, currentPrice);
          return <div key={position.id} className="flex items-center gap-3 rounded-[1.2rem] bg-[#202022] p-3"><button type="button" onClick={() => token && onOpen(token)} disabled={!token} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${position.side === "long" ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#ff1744]/15 text-[#ff5573]"}`}>{position.side}</span><span className="min-w-0"><strong className="block truncate">{position.symbol} · {position.leverage}x</strong><span className={`text-sm font-semibold ${pnl < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{formatSignedMoney(pnl)}</span></span></button><button type="button" onClick={() => onClose(position)} className="rounded-full bg-[#303033] px-3 py-2 text-sm font-semibold">Close</button></div>;
        })}
      </div>
    </section>
  );
}

function PerpMarketScreen({ token, cashBalance, positions, onBack, onOpenPosition, onClosePosition }: { token: WalletToken; cashBalance: number; positions: PerpPosition[]; onBack: () => void; onOpenPosition: (request: PerpOrderRequest) => string | null; onClosePosition: (position: PerpPosition) => void }) {
  const [side, setSide] = useState<PerpSide>("long");
  const maxLeverage = maxPerpLeverage(token.symbol);
  const [leverage, setLeverage] = useState(Math.min(5, maxLeverage));
  const [collateral, setCollateral] = useState("");
  const [error, setError] = useState("");
  const collateralValue = Number(collateral) || 0;
  const notional = collateralValue * leverage;
  const openingFee = notional * 0.0005;
  const totalRequired = collateralValue + openingFee;
  const liquidationPrice = token.price > 0 ? perpLiquidationPrice(token.price, side, leverage) : 0;
  const tokenPositions = positions.filter((position) => position.symbol === token.symbol);
  const leverageOptions = [1, 2, 5, 10, 20, 25, 40].filter((value) => value <= maxLeverage);
  const positive = token.change24h >= 0;

  const submit = () => {
    if (!Number.isFinite(collateralValue) || collateralValue <= 0) { setError("Enter a collateral amount."); return; }
    if (token.price <= 0) { setError("Waiting for a live market price."); return; }
    if (totalRequired > cashBalance) { setError(`Insufficient cash. You need ${formatMoney(totalRequired)} including the opening fee.`); return; }
    const result = onOpenPosition({ symbol: token.symbol, side, leverage, collateral: collateralValue });
    if (result) { setError(result); return; }
    setCollateral("");
    setError("");
  };

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-black pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <ScreenHeader title={`${token.symbol}-PERP`} onBack={onBack} />
      <section className="px-4 pb-12">
        <div className="flex items-center gap-4 pt-3"><TokenIcon token={token} size="large" /><div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[.1em] text-white/45"><span className="h-2 w-2 rounded-full bg-[#00e676]" /> Live market</p><h1 className="mt-1 truncate text-[38px] font-semibold leading-none tracking-[-.06em]">{formatPrice(token.price)}</h1><p className={`mt-2 text-lg font-semibold ${positive ? "text-[#00e676]" : "text-[#ff1744]"}`}>{positive ? "+" : ""}{token.change24h.toFixed(2)}% today</p></div></div>

        <div className="relative mt-6 h-32 overflow-hidden rounded-[1.6rem] bg-[linear-gradient(180deg,rgba(162,149,243,.12),rgba(0,0,0,0))] px-3 py-4">
          <div className="absolute inset-x-0 top-1/3 border-t border-white/[0.05]" /><div className="absolute inset-x-0 top-2/3 border-t border-white/[0.05]" />
          <svg viewBox="0 0 360 100" preserveAspectRatio="none" className="relative h-full w-full" aria-hidden="true"><polyline fill="none" stroke={positive ? "#00e676" : "#ff1744"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={positive ? "0,82 38,72 72,77 105,56 142,62 178,42 211,49 248,28 285,38 326,16 360,22" : "0,18 38,28 72,23 105,44 142,38 178,58 211,51 248,72 285,62 326,84 360,78"} /></svg>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-[1.35rem] bg-[#191919] p-1.5">
          {(["long", "short"] as PerpSide[]).map((value) => <button key={value} type="button" onClick={() => { setSide(value); setError(""); }} aria-pressed={side === value} className={`rounded-[1rem] px-4 py-3.5 text-lg font-bold capitalize transition ${side === value ? value === "long" ? "bg-[#00e676] text-black" : "bg-[#ff1744] text-white" : "text-white/45"}`}>{value}</button>)}
        </div>

        <div className="mt-3 rounded-[1.7rem] border border-white/[0.04] bg-[#191919] p-5">
          <div className="flex items-center justify-between"><span className="text-base font-semibold text-white/55">Collateral</span><button type="button" onClick={() => setCollateral(String(Math.max(0, cashBalance / (1 + leverage * 0.0005))))} className="rounded-full bg-[#29292b] px-3 py-1.5 text-sm font-bold text-[#a99bf7]">MAX</button></div>
          <div className="mt-5 flex items-center gap-3"><span className="text-4xl text-white/45">$</span><input inputMode="decimal" type="number" min="0" step="any" value={collateral} onChange={(event) => { setCollateral(event.target.value); setError(""); }} placeholder="0.00" aria-label="Perpetual position collateral" className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-[-.05em] outline-none placeholder:text-white/20" /><span className="rounded-full bg-[#29292b] px-3 py-2 font-semibold">USD</span></div>
          <div className="mt-4 flex items-center justify-between text-sm text-white/45"><span>Available</span><span>{formatMoney(cashBalance)}</span></div>
        </div>

        <div className="mt-3 rounded-[1.7rem] border border-white/[0.04] bg-[#191919] p-5">
          <div className="flex items-center justify-between"><span className="text-base font-semibold text-white/55">Leverage</span><strong className="text-2xl text-[#a99bf7]">{leverage}x</strong></div>
          <input type="range" min="1" max={maxLeverage} step="1" value={leverage} onChange={(event) => { setLeverage(Number(event.target.value)); setError(""); }} aria-label="Position leverage" className="mt-5 w-full accent-[#a295f3]" />
          <div className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{leverageOptions.map((value) => <button key={value} type="button" onClick={() => setLeverage(value)} className={`min-w-12 flex-1 rounded-full px-3 py-2 text-sm font-bold ${leverage === value ? "bg-[#a295f3] text-black" : "bg-[#29292b] text-white/60"}`}>{value}x</button>)}</div>
        </div>

        <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-white/[0.04] bg-[#151516] text-[15px]"><PerpMetric label="Position size" value={formatMoney(notional)} /><PerpMetric label="Entry price" value={formatPrice(token.price)} /><PerpMetric label="Liquidation price" value={formatPrice(liquidationPrice)} /><PerpMetric label="Opening fee · 0.05%" value={formatMoney(openingFee)} /></div>
        {error ? <p role="alert" className="mt-3 rounded-2xl bg-[#ff1744]/12 px-4 py-3 text-center text-sm font-medium text-[#ff7189]">{error}</p> : null}
        <button type="button" onClick={submit} disabled={!collateralValue || token.price <= 0} className={`mt-4 w-full rounded-full px-5 py-4 text-lg font-bold transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-35 ${side === "long" ? "bg-[#00e676] text-black" : "bg-[#ff1744] text-white"}`}>Open {leverage}x {side}</button>
        <p className="mt-3 text-center text-xs leading-5 text-white/35">Positions use your wallet balance with live market pricing.</p>

        <div className="mt-9 flex items-center justify-between"><h2 className="text-[28px] font-semibold tracking-[-.05em]">Your positions</h2><span className="text-sm text-white/45">{tokenPositions.length} open</span></div>
        <div className="mt-4 space-y-3">{tokenPositions.map((position) => <PerpPositionCard key={position.id} position={position} currentPrice={token.price} onClose={() => onClosePosition(position)} />)}{tokenPositions.length === 0 ? <div className="rounded-[1.6rem] bg-[#191919] px-5 py-8 text-center"><Infinity className="mx-auto h-8 w-8 text-[#a99bf7]" /><p className="mt-3 text-lg font-semibold">No open {token.symbol} positions</p><p className="mt-1 text-sm text-white/45">Choose long or short to open one.</p></div> : null}</div>
      </section>
    </div>
  );
}

function PerpMetric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3.5 last:border-0"><span className="text-white/45">{label}</span><strong>{value}</strong></div>;
}

function PerpPositionCard({ position, currentPrice, onClose }: { position: PerpPosition; currentPrice: number; onClose: () => void }) {
  const pnl = perpPositionPnl(position, currentPrice);
  const equity = Math.max(0, position.collateral + pnl);
  const pnlPercent = position.collateral > 0 ? pnl / position.collateral * 100 : 0;
  const liquidated = equity === 0 && pnl < 0;
  return <article className="rounded-[1.6rem] border border-white/[0.04] bg-[#191919] p-5"><div className="flex items-start justify-between"><div className="flex items-center gap-2"><span className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${position.side === "long" ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#ff1744]/15 text-[#ff5573]"}`}>{position.side}</span><strong className="text-lg">{position.symbol} · {position.leverage}x</strong></div><span className={`text-right text-lg font-bold ${pnl < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{formatSignedMoney(pnl)}<small className="block text-xs">{pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%</small></span></div><div className="mt-5 grid grid-cols-3 gap-2 text-sm"><div><span className="block text-white/40">Entry</span><strong className="mt-1 block truncate">{formatPrice(position.entryPrice)}</strong></div><div><span className="block text-white/40">Mark</span><strong className="mt-1 block truncate">{formatPrice(currentPrice)}</strong></div><div><span className="block text-white/40">Equity</span><strong className="mt-1 block truncate">{formatMoney(equity)}</strong></div></div><button type="button" onClick={onClose} className={`mt-5 w-full rounded-full px-4 py-3 font-semibold ${liquidated ? "bg-[#ff1744] text-white" : "bg-[#303033] text-white"}`}>{liquidated ? "Settle liquidated position" : "Close position"}</button></article>;
}

function PredictionsView() {
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);
  const [followedMarkets, setFollowedMarkets] = useState<string[]>([]);
  const markets = [
    { title: "BTC Up or Down · 5m", meta: "Live · 1,284 traders", chance: "52% Up" },
    { title: "Will ETH close above $4,000?", meta: "Ends today · 842 traders", chance: "64% Yes" },
    { title: "Solana above $200 this week?", meta: "Ends Friday · 506 traders", chance: "39% Yes" },
  ];
  const toggleFollow = (title: string) => setFollowedMarkets((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title]);
  return <section className="px-4 pb-48 pt-7"><div className="flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-[.12em] text-[#a99bf7]">Live markets</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.06em]">Predictions</h1></div><Radio className="h-7 w-7 text-[#ff1744]" /></div><p className="mt-4 max-w-md text-lg leading-7 text-white/55">Follow fast-moving markets across crypto, finance, and culture.</p><div className="mt-8 space-y-3">{markets.map((market, index) => { const expanded = expandedMarket === market.title; const followed = followedMarkets.includes(market.title); return <article key={market.title} className="overflow-hidden rounded-[1.7rem] border border-white/[0.04] bg-[#191919]"><button type="button" onClick={() => setExpandedMarket(expanded ? null : market.title)} aria-expanded={expanded} className="w-full p-5 text-left transition hover:bg-[#232323]"><div className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-full ${index === 0 ? "bg-[#f7931a]" : index === 1 ? "bg-[#e9e9ec] text-black" : "bg-black"} text-xl font-bold`}>{index === 0 ? "₿" : index === 1 ? "◆" : "≋"}</span><span className="rounded-full bg-[#28252f] px-3 py-2 text-sm font-bold text-[#b5a7ff]">{market.chance}</span></div><h2 className="mt-6 text-xl font-semibold">{market.title}</h2><p className="mt-2 text-base text-white/50">{market.meta}</p></button>{expanded ? <div className="border-t border-white/[0.05] px-5 py-4"><p className="text-sm leading-6 text-white/50">Track this market from the Predictions tab and return any time to see the latest probability.</p><button type="button" onClick={() => toggleFollow(market.title)} aria-pressed={followed} className={`mt-4 w-full rounded-full px-4 py-3 font-semibold ${followed ? "bg-[#2a2732] text-[#b5a7ff]" : "bg-[#a295f3] text-black"}`}>{followed ? "Following" : "Follow market"}</button></div> : null}</article>; })}</div></section>;
}

function ExploreView({ onPerps, onPredictions, onMarkets, onSupport }: { onPerps: () => void; onPredictions: () => void; onMarkets: () => void; onSupport: () => void }) {
  const features = [
    { icon: Infinity, title: "Perpetuals", detail: "Long or short leading markets", action: onPerps },
    { icon: Sparkles, title: "Predictions", detail: "Follow outcomes in live markets", action: onPredictions },
    { icon: LineChart, title: "Token markets", detail: "Explore live currency prices", action: onMarkets },
    { icon: Headphones, title: "Help & Support", detail: "Browse answers and contact options", action: onSupport },
  ];
  return <section className="px-4 pb-48 pt-7"><p className="text-sm font-bold uppercase tracking-[.12em] text-[#a99bf7]">Discover</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.06em]">Explore everything</h1><div className="mt-8 space-y-3">{features.map(({ icon: Icon, title, detail, action }) => <button key={title} type="button" onClick={action} className="flex w-full items-center gap-5 rounded-[1.7rem] border border-white/[0.04] bg-[#191919] px-5 py-5 text-left transition hover:bg-[#232323]"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#292633] text-[#a99bf7]"><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-xl">{title}</strong><span className="mt-1 block truncate text-base text-white/50">{detail}</span></span><ChevronRight className="h-5 w-5 text-white/35" /></button>)}</div><div className="mt-10 rounded-[1.8rem] bg-[linear-gradient(145deg,#24202f,#151518)] p-6"><h2 className="text-2xl font-semibold">Need a hand?</h2><p className="mt-2 text-base leading-6 text-white/55">Browse common questions or start a conversation with support.</p><button type="button" onClick={onSupport} className="mt-6 rounded-full bg-[#a295f3] px-5 py-3 font-semibold text-black">Help & Support</button></div></section>;
}

function PerpsSection({ tokens, positions, onOpen }: { tokens: WalletToken[]; positions: PerpPosition[]; onOpen: (token: WalletToken) => void }) {
  const tokenFor = (symbol: string, name: string): WalletToken => tokens.find((token) => token.symbol === symbol) ?? {
    id: `perps-${symbol}`,
    name,
    symbol,
    price: 0,
    balance: 0,
    change24h: 0,
    image: "",
    updatedAt: "",
  };
  const cards = [
    { token: tokenFor("BTC", "Bitcoin"), leverage: "40x" },
    { token: tokenFor("HYPE", "Hyperliquid"), leverage: "10x" },
    { token: tokenFor("ETH", "Ethereum"), leverage: "25x" },
  ];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><h2 className="text-[clamp(1.75rem,8vw,2.3rem)] font-semibold tracking-[-.05em]">Perps</h2><ChevronRight className="h-7 w-7 text-white/65" /></div>{positions.length ? <span className="rounded-full bg-[#292633] px-3 py-1.5 text-sm font-bold text-[#a99bf7]">{positions.length} open</span> : null}</div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map(({ token, leverage }) => (
          <button key={token.symbol} type="button" onClick={() => onOpen(token)} className="flex min-h-[clamp(10rem,43vw,13rem)] min-w-[clamp(10rem,44vw,13.25rem)] shrink-0 flex-col items-start justify-between rounded-[1.65rem] bg-[#191919] p-5 text-left transition hover:bg-[#232323]">
            <TokenIcon token={token} size="large" />
            <div className="flex items-center gap-2 text-[clamp(1.2rem,5.5vw,1.55rem)] font-semibold"><span>{token.symbol}</span><span className="rounded-lg bg-[#242426] px-2 py-1 text-[clamp(.85rem,4vw,1.05rem)]">{leverage}</span></div>
            <strong className={`text-[clamp(1.35rem,6vw,1.8rem)] ${token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function TokenRow({ token, animationDelay, onClick }: { token: WalletToken; animationDelay?: number; onClick: () => void }) {
  const value = token.balance * token.price;
  const changeValue = value * (token.change24h / 100);
  const changeLabel = token.symbol === "BFS" ? "+<$0.01" : value === 0 ? formatMoney(0) : formatSignedMoney(changeValue);
  const changeClass = token.change24h < 0 ? "text-[#f21b3f]" : value === 0 ? "text-white/55" : "text-[#00e676]";

  return (
    <button type="button" onClick={onClick} className="phantom-home-token-row flex min-h-16 w-full items-center gap-3 rounded-[1.45rem] bg-[#191919] px-4 py-2 text-left transition hover:bg-[#232323]" style={animationDelay === undefined ? undefined : { animationDelay: `${animationDelay}ms` }}>
      <TokenIcon token={token} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[20px] font-semibold">{token.name}</span><span className="mt-0.5 block truncate text-[17px] text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span>
      <span className="max-w-[36%] shrink-0 text-right"><span className="block truncate text-[20px] font-medium">{formatMoney(value)}</span><span className={`mt-0.5 block truncate text-[18px] font-semibold ${changeClass}`}>{changeLabel}</span></span>
    </button>
  );
}

function ActionMenu({ onAction, onClose }: { onAction: (action: Action) => void; onClose: () => void }) {
  const items: { action: Action; label: string; icon: LucideIcon }[] = [
    { action: "Send", label: "Send", icon: Send },
    { action: "Receive", label: "Receive", icon: QrCode },
    { action: "Add Cash", label: "Add cash", icon: BadgeDollarSign },
    { action: "Trade", label: "Trade", icon: Shuffle },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex justify-center" role="dialog" aria-label="Wallet actions">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close wallet actions"
        className="absolute inset-0 bg-black/50 backdrop-blur-[18px]"
      />
      <div className="pointer-events-none relative h-full w-full max-w-[560px]">
        <div className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+112px)] right-5 flex flex-col items-end gap-4">
          {items.map(({ action, label, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              className="flex items-center gap-4 text-xl font-semibold tracking-[-0.025em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.9)] transition active:scale-[.98]"
            >
              <span>{label}</span>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#a99bf7] text-black shadow-[0_10px_30px_rgba(0,0,0,.38)]">
                <Icon className="h-6 w-6 stroke-[2.25]" />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close wallet actions"
          className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+14px)] right-5 grid h-12 w-12 place-items-center rounded-full border border-white/[0.04] bg-[#202022] text-white shadow-[0_10px_30px_rgba(0,0,0,.42)] transition active:scale-95"
        >
          <X className="h-6 w-6 stroke-[2.25]" />
        </button>
      </div>
    </div>
  );
}

function ProfileScreen({ profile, tokens, onBack, onSave, onAddToken, onEditToken, onDeleteToken }: { profile: ProfileRecord; tokens: WalletToken[]; onBack: () => void; onSave: (profile: ProfileRecord, balances: Record<string, number>) => void; onAddToken: () => void; onEditToken: (token: WalletToken) => void; onDeleteToken: (token: WalletToken) => void }) {
  const [draft, setDraft] = useState(profile);
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});

  const update = <K extends keyof ProfileRecord>(field: K, value: ProfileRecord[K]) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft, Object.fromEntries(tokens.map((token) => {
      const value = balanceDrafts[token.id];
      return [token.id, value === undefined ? token.balance : Number(value) || 0];
    })));
  };

  return (
    <form onSubmit={submit} className="absolute inset-0 z-40 overflow-y-auto bg-black pb-16">
      <ScreenHeader title="Edit Profile" onBack={onBack} actionLabel="Save" />
      <div className="px-6 pb-20">
        <div className="flex flex-col items-center pt-12"><div aria-label="Current profile avatar"><LockAvatar value={draft.avatar} size="large" /></div><p className="mt-6 text-[27px] font-semibold tracking-[-0.05em]">@{draft.username || "username"}</p></div>

        <ProfileSection title="Avatars"><div className="grid grid-cols-5 gap-3 rounded-[1.5rem] bg-[#1d1d1f] p-5">{profileAvatars.map((avatar, index) => <button key={avatar} type="button" onClick={() => update("avatar", avatar)} className={`relative aspect-square overflow-hidden rounded-full bg-[#29292b] transition ${draft.avatar === avatar ? "ring-2 ring-[#a295f3] ring-offset-2 ring-offset-[#1d1d1f]" : "hover:scale-105 hover:ring-2 hover:ring-white/20"}`} aria-label={`Use avatar ${index + 1}`}><Image src={avatar} alt="" fill unoptimized sizes="72px" className="object-cover" />{draft.avatar === avatar ? <span className="absolute bottom-0 right-0 z-10 grid h-5 w-5 place-items-center rounded-full bg-[#a295f3] text-black"><Check className="h-3.5 w-3.5 stroke-[3]" /></span> : null}</button>)}</div></ProfileSection>

        <ProfileSection title="Icons"><div className="grid grid-cols-6 gap-3 rounded-[1.5rem] bg-[#1d1d1f] p-5">{profileEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => update("avatar", emoji)} className={`grid aspect-square place-items-center rounded-full bg-[#29292b] text-[29px] transition ${draft.avatar === emoji ? "bg-[#a295f3] ring-2 ring-[#a295f3] ring-offset-2 ring-offset-[#1d1d1f]" : "hover:bg-[#38383b]"}`} aria-label={`Use ${emoji} icon`}>{emoji}</button>)}</div></ProfileSection>

        <ProfileSection title="Profile"><div className="overflow-hidden rounded-[1.5rem] bg-[#1d1d1f]"><ProfileInput label="Username" prefix="@" value={draft.username} onChange={(value) => update("username", value)} /><ProfileInput label="Account Name" value={draft.accountName} onChange={(value) => update("accountName", value)} /><div className="px-5 py-5"><div className="flex items-center justify-between text-[18px] text-white/55"><span>Wallet Address</span><button type="button" onClick={() => update("address", `Ph${Math.random().toString(36).slice(2, 30)}`)} className="text-[#a295f3]">↻ GENERATE</button></div><input value={draft.address} onChange={(event) => update("address", event.target.value)} className="mt-4 w-full bg-transparent font-mono text-[17px] text-white outline-none" /></div></div></ProfileSection>

        <ProfileSection title="Bio"><textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} placeholder="Tell people about yourself..." className="min-h-44 w-full resize-none rounded-[1.5rem] bg-[#1d1d1f] px-5 py-5 text-[18px] text-white outline-none placeholder:text-white/30" /></ProfileSection>

        <ProfileSection title="Contact & Socials"><div className="overflow-hidden rounded-[1.5rem] bg-[#1d1d1f]"><ProfileInput label="Email" placeholder="you@email.com" value={draft.email} onChange={(value) => update("email", value)} /><ProfileInput label="Twitter / X" placeholder="@handle" value={draft.twitter} onChange={(value) => update("twitter", value)} /><ProfileInput label="Discord" placeholder="username#0000" value={draft.discord} onChange={(value) => update("discord", value)} /></div></ProfileSection>

        <ProfileSection title="Currency"><div className="flex items-center justify-between rounded-[1.5rem] bg-[#1d1d1f] px-5 py-5 text-[18px] text-white/65"><span>Base Currency</span><select value={draft.currency} onChange={(event) => update("currency", event.target.value)} className="rounded-full bg-[#29292b] px-4 py-2 text-[18px] font-medium text-[#a295f3] outline-none"><option>USD</option><option>EUR</option><option>GBP</option></select></div></ProfileSection>

        <ProfileSection title="Cash Balance"><div className="flex items-center justify-between rounded-[1.5rem] bg-[#1d1d1f] px-5 py-5 text-[18px] text-white/65"><span>Cash (USD)</span><input type="number" min="0" step="any" value={draft.cash} onChange={(event) => update("cash", Number(event.target.value) || 0)} className="w-28 rounded-2xl bg-[#29292b] px-4 py-3 text-right text-[19px] text-white outline-none" /></div></ProfileSection>

        <ProfileSection title="Token Holdings"><div className="overflow-hidden rounded-[1.5rem] bg-[#1d1d1f]">{sortTokens(tokens).map((token) => <div key={token.id} className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0"><TokenIcon token={token} size="small" /><span className="min-w-0 flex-1 text-[18px]">{token.name}</span><input type="number" min="0" step="any" value={balanceDrafts[token.id] ?? String(token.balance)} onChange={(event) => setBalanceDrafts((current) => ({ ...current, [token.id]: event.target.value }))} aria-label={`${token.name} holding`} className="w-28 rounded-2xl bg-[#29292b] px-4 py-3 text-right text-[18px] text-white outline-none" /><button type="button" onClick={() => onEditToken(token)} aria-label={`Edit ${token.name}`} className="rounded-full p-2 text-white/45 hover:text-[#a295f3]"><Pencil className="h-5 w-5" /></button><button type="button" onClick={() => onDeleteToken(token)} aria-label={`Delete ${token.name}`} className="rounded-full p-2 text-white/45 hover:text-[#f21b3f]"><X className="h-5 w-5" /></button></div>)}<button type="button" onClick={onAddToken} className="flex w-full items-center justify-center gap-2 border-t border-white/[0.06] px-5 py-5 text-[17px] text-[#a295f3]"><Plus className="h-5 w-5" /> Add token</button></div></ProfileSection>

        <button type="submit" className="mt-10 w-full rounded-full bg-[#a295f3] px-5 py-4 text-[18px] font-medium text-black">Save Profile</button>
      </div>
    </form>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10"><h2 className="mb-4 text-[16px] font-medium uppercase tracking-[0.12em] text-white/65">{title}</h2>{children}</section>;
}

function ProfileInput({ label, prefix, placeholder, value, onChange }: { label: string; prefix?: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-5 last:border-0"><span className="text-[18px] text-white/55">{label}</span>{prefix ? <span className="ml-auto text-[18px] text-white/45">{prefix}</span> : null}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-right text-[18px] text-white outline-none placeholder:text-white/30" /></label>;
}

function TokenPicker({ tokens, flow, onClose, onSelect }: { tokens: WalletToken[]; flow: TokenFlow; onClose: () => void; onSelect: (token: WalletToken) => void }) {
  const [query, setQuery] = useState("");
  const filtered = sortTokens(tokens).filter((token) => `${token.name} ${token.symbol}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black px-4 pb-10"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close token picker" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">{flow === "send" ? "Select Token" : "Buy"}</h1></div><label className="mt-9 flex items-center gap-4 rounded-full bg-[#1d1d1f] px-6 py-5 text-[20px] text-white/40"><Search className="h-6 w-6" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/35" /></label><div className="mt-9 space-y-3">{filtered.map((token) => <button key={token.id} type="button" onClick={() => onSelect(token)} className="flex w-full items-center gap-5 rounded-[1.5rem] bg-[#19191b] px-6 py-5 text-left transition hover:bg-[#242426]"><TokenIcon token={token} size="large" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[25px] font-medium">{token.name}<span className="text-[#a295f3]">✿</span></span><span className="mt-1 block text-[19px] text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span></button>)}{filtered.length === 0 ? <p className="py-10 text-center text-white/50">No token found.</p> : null}</div></div>;
}

function SendRecipientScreen({ token, recipient, onRecipient, onBack, onNext }: { token: WalletToken; recipient: string; onRecipient: (value: string) => void; onBack: () => void; onNext: () => void }) {
  const recent = ["Account 1", "Main Wallet", "Trading"];
  const addresses = ["Account 1", "Main Wallet", "Trading", "Savings"];
  const [pasteError, setPasteError] = useState("");
  const pasteAddress = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) throw new Error("Clipboard is empty.");
      onRecipient(value.trim());
      setPasteError("");
    } catch {
      setPasteError("Allow clipboard access, then try again.");
    }
  };
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black px-4 pb-28"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center justify-between"><div className="flex items-center gap-5"><button type="button" onClick={onBack} aria-label="Go back" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><ArrowLeft className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">{token.symbol}</h1></div><button type="button" onClick={onNext} disabled={!recipient.trim()} className="text-[22px] text-[#a295f3] disabled:text-white/25">Next</button></div><div className="mt-16 flex items-center gap-3 border-b border-white/[0.12] pb-4"><input autoFocus value={recipient} onChange={(event) => { onRecipient(event.target.value); setPasteError(""); }} placeholder="To: username or address" className="min-w-0 flex-1 bg-transparent text-[22px] text-white outline-none placeholder:text-white/55" /><button type="button" onClick={() => void pasteAddress()} aria-label="Paste wallet address" className="text-white/80"><Copy className="h-7 w-7" /></button></div>{pasteError ? <p role="alert" className="mt-3 text-sm text-[#ff7189]">{pasteError}</p> : null}<h2 className="mt-14 flex items-center gap-3 text-[22px] font-medium text-white/65"><Clock3 className="h-6 w-6" /> Recently Used</h2><div className="mt-5 space-y-5">{recent.map((name, index) => <button key={name} type="button" onClick={() => onRecipient(name)} className="flex items-center gap-6 text-left"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#242426] text-[18px] text-white/80">{index === 0 ? "●" : index === 1 ? "M" : "T"}</span><span><span className="block text-[22px]">{name}</span><span className="mt-1 block text-[17px] text-white/55">Used {index === 0 ? "4d" : index === 1 ? "12d" : "14d"} ago</span></span></button>)}</div><h2 className="mt-14 flex items-center gap-3 text-[22px] font-medium text-white/65"><WalletCards className="h-6 w-6" /> Address Book</h2><div className="mt-5 space-y-5">{addresses.map((name) => <button key={name} type="button" onClick={() => onRecipient(`${name} · wDwe...mE6c`)} className="flex items-center gap-6 text-left"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#242426] text-[17px] text-white">{name.slice(0, 2).toUpperCase()}</span><span><span className="block text-[22px]">{name}</span><span className="mt-1 block font-mono text-[17px] text-white/55">wDwe...mE6c</span></span></button>)}</div><button type="button" onClick={onNext} disabled={!recipient.trim()} className="mt-16 w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black disabled:bg-[#403967] disabled:text-white/35">Next</button></div>;
}

function SendAmountScreen({ token, amount, onAmount, onBack, onNext }: { token: WalletToken; amount: string; onAmount: (value: string) => void; onBack: () => void; onNext: () => void }) {
  const numericAmount = Number(amount) || 0;
  const canContinue = numericAmount > 0 && numericAmount <= token.balance;
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center justify-between"><div className="flex items-center gap-5"><button type="button" onClick={onBack} aria-label="Go back" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><ArrowLeft className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Enter Amount</h1></div><button type="button" onClick={onNext} disabled={!canContinue} className="text-[22px] text-[#a295f3] disabled:text-white/25">Next</button></div><div className="flex flex-1 flex-col items-center justify-center"><label className="flex items-baseline justify-center text-[72px] font-medium tracking-[-0.08em]"><input autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => onAmount(event.target.value)} placeholder="0" aria-label={`Amount in ${token.symbol}`} className="w-[190px] bg-transparent text-right outline-none placeholder:text-white" /><span className="ml-3">{token.symbol}</span></label><p className="mt-5 text-[31px] text-white/55">~{formatMoney(numericAmount * token.price)}</p></div><div className="flex items-center justify-between pb-5 text-[18px]"><div><p className="text-white/55">Available To Send</p><p className="mt-2 font-medium">{formatAmount(token.balance)} {token.symbol}</p></div><button type="button" onClick={() => onAmount(String(token.balance))} className="rounded-full bg-[#242426] px-7 py-4 text-[19px]">Max</button></div><button type="button" onClick={onNext} disabled={!canContinue} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black disabled:bg-[#403967] disabled:text-white/35">Next</button></div>;
}

function SummaryScreen({ token, amount, recipient, onBack, onConfirm }: { token: WalletToken; amount: number; recipient: string; onBack: () => void; onConfirm: () => void }) {
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onBack} aria-label="Go back" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><ArrowLeft className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Summary</h1></div><div className="flex flex-1 flex-col items-center pt-20"><Send className="h-16 w-16 text-[#a295f3]" /><p className="mt-8 text-[72px] font-semibold tracking-[-0.08em]">{formatAmount(amount)} {token.symbol}</p><p className="mt-3 text-[28px] text-white/55">~{formatMoney(amount * token.price)}</p><div className="mt-14 w-full overflow-hidden rounded-[1.7rem] bg-[#1d1d1f] text-[20px]"><SummaryRow label="To" value={shortAddress(recipient)} /><SummaryRow label="Network" value={token.symbol === "BTC" ? "Bitcoin" : "Solana"} /><SummaryRow label="Network fee" value={token.symbol === "SOL" ? "0.00008 SOL" : "$0.005"} /></div></div><button type="button" onClick={onConfirm} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">Send</button></div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-white/[0.06] px-7 py-6 last:border-0"><span className="text-white/55">{label}</span><span className="font-medium">{value}</span></div>;
}

function SendingScreen({ token, amount, recipient, onComplete }: { token: WalletToken; amount: number; recipient: string; onComplete: () => void }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onComplete, 1500);
    return () => window.clearTimeout(timeoutId);
  }, [onComplete]);
  return <div className="absolute inset-0 z-40 flex flex-col items-center bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="flex flex-1 flex-col items-center justify-center"><div className="grid h-28 w-28 place-items-center rounded-full bg-[#242426] text-[48px] text-[#a295f3] animate-pulse">•••</div><h1 className="mt-9 text-[32px] font-semibold">Sending...</h1><p className="mt-4 text-[19px] text-white/70">{formatAmount(amount)} {token.symbol} to {shortAddress(recipient)}</p></div><button type="button" onClick={onComplete} className="w-full rounded-full bg-[#1d1d1f] px-5 py-5 text-[20px] text-white/75">Close</button></div>;
}

function SentScreen({ token, amount, recipient, onClose, onHistory }: { token: WalletToken; amount: number; recipient: string; onClose: () => void; onHistory: () => void }) {
  return <div className="absolute inset-0 z-40 flex flex-col items-center bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="flex flex-1 flex-col items-center justify-center"><div className="grid h-28 w-28 place-items-center rounded-full bg-[#20b486] text-black"><Check className="h-16 w-16" /></div><h1 className="mt-9 text-[32px] font-semibold">Sent!</h1><p className="mt-4 text-center text-[19px] text-white/80">{formatAmount(amount)} {token.symbol} sent to {shortAddress(recipient)}</p><button type="button" onClick={onHistory} className="mt-8 text-[19px] text-[#a295f3]">View transaction</button></div><button type="button" onClick={onClose} className="w-full rounded-full bg-[#1d1d1f] px-5 py-5 text-[20px] text-white/75">Close</button></div>;
}

function ReceiveScreen({ profile, onClose }: { profile: ProfileRecord; onClose: () => void }) {
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close receive" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Receive</h1></div><div className="flex flex-1 flex-col items-center justify-center"><div className="grid h-64 w-64 place-items-center rounded-3xl bg-white p-5"><QrCode className="h-full w-full text-black" /></div><p className="mt-10 text-center text-[20px] text-white/65">Your wallet address</p><button type="button" onClick={() => navigator.clipboard?.writeText(profile.address)} className="mt-4 flex items-center gap-3 rounded-full bg-[#1d1d1f] px-6 py-4 font-mono text-[17px]"><span>{shortAddress(profile.address)}</span><Copy className="h-5 w-5 text-[#a295f3]" /></button></div><button type="button" onClick={onClose} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">Done</button></div>;
}

function AddCashScreen({ balance, onClose, onAdd }: { balance: number; onClose: () => void; onAdd: (amount: number) => void }) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<"amount" | "review">("amount");
  const [paymentMethod, setPaymentMethod] = useState<"apple-pay" | "card">("apple-pay");
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const numericAmount = Number(amount) || 0;
  const maximumAmount = 25_000;
  const amountIsValid = numericAmount > 0 && numericAmount <= maximumAmount;
  const paymentLabel = paymentMethod === "apple-pay" ? "Apple Pay" : "Card";
  const fee = numericAmount > 0 ? numericAmount * 0.03 + 0.02 : 0;
  const amountLabel = numericAmount.toLocaleString("en-US", { maximumFractionDigits: 2 });

  useEffect(() => {
    if (!paymentMethodsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaymentMethodsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [paymentMethodsOpen]);

  const enterKey = (key: string) => {
    if (key === "backspace") {
      setAmount((current) => current.slice(0, -1));
      return;
    }
    if (key === ".") {
      setAmount((current) => current.includes(".") ? current : `${current || "0"}.`);
      return;
    }
    setAmount((current) => {
      const [whole, decimals = ""] = current.split(".");
      if (current.includes(".") && decimals.length >= 2) return current;
      if (!current.includes(".") && whole.length >= 7) return current;
      return current === "0" ? key : `${current}${key}`;
    });
  };

  const choosePreset = (value: number) => {
    setAmount(String(value));
    setStage("review");
  };

  const paymentSheet = paymentMethodsOpen ? (
    <div className="absolute inset-0 z-50 flex items-end bg-black/70" role="presentation">
      <button type="button" onClick={() => setPaymentMethodsOpen(false)} aria-label="Close payment methods" className="absolute inset-0" />
      <section role="dialog" aria-modal="true" aria-labelledby="payment-methods-title" className="relative w-full rounded-t-[2.25rem] border-t border-white/[0.06] bg-[#121213] px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5 shadow-[0_-20px_70px_rgba(0,0,0,.75)]">
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button autoFocus type="button" onClick={() => setPaymentMethodsOpen(false)} aria-label="Close payment methods" className="grid h-11 w-11 place-items-center rounded-full bg-[#202022]"><X className="h-5 w-5" /></button>
          <h2 id="payment-methods-title" className="text-center text-[20px] font-semibold">Payment methods</h2>
          <span />
        </div>
        <div className="mt-7" role="radiogroup" aria-label="Payment method">
          <button type="button" role="radio" aria-checked={paymentMethod === "apple-pay"} onClick={() => { setPaymentMethod("apple-pay"); setPaymentMethodsOpen(false); }} className="flex min-h-16 w-full items-center gap-4 rounded-[1.2rem] px-1 text-left">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] bg-[#1f1f21] text-[15px] font-semibold">Pay</span>
            <span className="min-w-0 flex-1"><strong className="block text-[19px]">Apple Pay</strong><span className="text-[15px] text-white/45">Debit card required</span></span>
            {paymentMethod === "apple-pay" ? <Check className="h-6 w-6 text-[#a99bf7]" /> : null}
          </button>
          <button type="button" role="radio" aria-checked={paymentMethod === "card"} onClick={() => { setPaymentMethod("card"); setPaymentMethodsOpen(false); }} className="mt-2 flex min-h-16 w-full items-center gap-4 rounded-[1.2rem] px-1 text-left">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[1rem] bg-[#1f1f21]"><CreditCard className="h-6 w-6" /></span>
            <strong className="min-w-0 flex-1 text-[19px]">Card</strong>
            {paymentMethod === "card" ? <Check className="h-6 w-6 text-[#a99bf7]" /> : null}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  if (stage === "review") {
    return (
      <div className="absolute inset-0 z-40 flex h-full flex-col overflow-hidden bg-black px-5 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <header className="flex shrink-0 items-center gap-4 pt-[calc(env(safe-area-inset-top)+24px)]">
          <button type="button" onClick={() => setStage("amount")} aria-label="Edit cash amount" className="grid h-12 w-12 place-items-center rounded-full bg-[#202022]"><ArrowLeft className="h-6 w-6" /></button>
          <div><h1 className="text-[24px] font-semibold tracking-[-.035em]">Add Cash</h1><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.15em] text-[#a99bf7]/60">Parody wallet · No payment is processed</p></div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 items-center px-1"><output aria-live="polite" className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(4.5rem,22vw,7rem)] font-semibold leading-none tracking-[-.075em]">${amountLabel}</output></div>
          <div className="mb-5">
            <div className="border-b border-white/[0.09] py-4"><span className="block text-[14px] font-medium text-white/45">Add</span><strong className="mt-1 block text-[17px]">{amountLabel} CASH</strong></div>
            <button type="button" onClick={() => setPaymentMethodsOpen(true)} className="flex w-full items-center justify-between border-b border-white/[0.09] py-4 text-left"><span><span className="block text-[14px] font-medium text-white/45">Payment</span><strong className="mt-1 block text-[17px]">{paymentLabel} · {formatMoney(fee)} fee</strong></span><ChevronDown className="h-5 w-5 text-white/55" /></button>
            <div className="py-4"><span className="block text-[14px] font-medium text-white/45">Delivery</span><strong className="mt-1 block text-[17px]">Instantly</strong></div>
          </div>
          <button type="button" onClick={() => onAdd(numericAmount)} disabled={!amountIsValid} className="mb-1 min-h-14 w-full rounded-full bg-[#a295f3] px-5 text-[20px] font-semibold text-black disabled:bg-[#443e61] disabled:text-black/50">Add Cash</button>
          <p className="mt-3 text-center text-[12px] text-white/35">Current in-app balance: {formatMoney(balance)}</p>
        </div>
        {paymentSheet}
      </div>
    );
  }

  const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];

  return (
    <div className="absolute inset-0 z-40 flex h-full flex-col overflow-hidden bg-black px-5 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <header className="flex shrink-0 items-center gap-4 pt-[calc(env(safe-area-inset-top)+24px)]">
        <button type="button" onClick={onClose} aria-label="Close add cash" className="grid h-12 w-12 place-items-center rounded-full bg-[#202022]"><X className="h-6 w-6" /></button>
        <div><h1 className="text-[24px] font-semibold tracking-[-.035em]">Add Cash</h1><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[.15em] text-[#a99bf7]/60">Parody wallet · No payment is processed</p></div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-[12rem] flex-1 items-center px-1"><output aria-live="polite" aria-describedby={numericAmount > maximumAmount ? "cash-limit-error" : undefined} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(4.5rem,22vw,7rem)] font-semibold leading-none tracking-[-.075em] text-white/70">${amountLabel}</output></div>
        {numericAmount > maximumAmount ? <p id="cash-limit-error" role="alert" className="mb-4 text-[16px] font-semibold text-[#ff1744]">The maximum purchase amount is $25,000.00.</p> : null}
        <button type="button" onClick={() => setPaymentMethodsOpen(true)} className="flex min-h-12 w-full items-center justify-between text-left text-[18px] font-semibold"><span>{paymentLabel}</span><ChevronDown className="h-5 w-5 text-white/55" /></button>
        {amount ? (
          <button type="button" onClick={() => setStage("review")} disabled={!amountIsValid} className="mt-3 min-h-14 w-full rounded-full bg-[#a295f3] px-5 text-[19px] font-semibold text-black disabled:bg-[#443e61] disabled:text-black/50">Review</button>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[50, 100, 500].map((value) => <button key={value} type="button" onClick={() => choosePreset(value)} className="min-h-12 rounded-full bg-[#171718] text-[18px] font-medium">${value}</button>)}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3">
          {keypad.map((key) => <button key={key} type="button" onClick={() => enterKey(key)} aria-label={key === "backspace" ? "Delete digit" : key === "." ? "Decimal point" : `Digit ${key}`} className="grid min-h-[3.7rem] place-items-center text-[27px] font-medium active:bg-white/[0.04]">{key === "backspace" ? <ArrowLeft className="h-7 w-7" /> : key}</button>)}
        </div>
      </div>
      {paymentSheet}
    </div>
  );
}

function BuyScreen({ token, onClose, onBuy }: { token: WalletToken; onClose: () => void; onBuy: (amount: number) => void }) {
  const [amount, setAmount] = useState("1");
  const quantity = Number(amount) || 0;
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close buy" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Buy {token.symbol}</h1></div><div className="flex flex-1 flex-col items-center justify-center"><TokenIcon token={token} size="large" /><p className="mt-8 text-[60px] font-medium tracking-[-0.08em]">{formatAmount(quantity)} {token.symbol}</p><p className="mt-3 text-[28px] text-white/55">~{formatMoney(quantity * token.price)}</p><label className="mt-12 w-full rounded-2xl bg-[#1d1d1f] px-5 py-4"><span className="block text-sm text-white/50">Amount to buy</span><input autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full bg-transparent text-[22px] outline-none" /></label></div><button type="button" onClick={() => onBuy(quantity)} disabled={quantity <= 0} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black disabled:bg-[#403967] disabled:text-white/35">Buy {token.symbol}</button></div>;
}

function HistoryScreen({ records, onBack, onRecord }: { records: WalletActivity[]; onBack: () => void; onRecord: (record: WalletActivity) => void }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "send" | "receive">("all");
  const visibleRecords = filter === "all" ? records : records.filter((record) => record.type === filter);
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black px-4 pb-20"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center justify-between"><button type="button" onClick={onBack} aria-label="Close history" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">History</h1><button type="button" onClick={() => setFiltersOpen((current) => !current)} aria-label="Filter history" aria-expanded={filtersOpen} className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><MoreHorizontal className="h-7 w-7" /></button></div>{filtersOpen ? <div className="mt-5 flex gap-2 rounded-[1.3rem] bg-[#19191b] p-2">{(["all", "send", "receive"] as const).map((value) => <button key={value} type="button" onClick={() => { setFilter(value); setFiltersOpen(false); }} aria-pressed={filter === value} className={`flex-1 rounded-full px-3 py-2.5 text-sm font-semibold capitalize ${filter === value ? "bg-[#a295f3] text-black" : "text-white/55"}`}>{value === "all" ? "All" : value === "send" ? "Sent" : "Received"}</button>)}</div> : null}{visibleRecords.length === 0 ? <p className="mt-40 text-center text-[20px] text-white/55">No {filter === "all" ? "recent" : filter === "send" ? "sent" : "received"} activity</p> : <div className="mt-12 space-y-3">{visibleRecords.map((record) => <button key={record.id} type="button" onClick={() => onRecord(record)} className="flex w-full items-center gap-5 rounded-[1.5rem] bg-[#19191b] px-5 py-5 text-left"><span className={`grid h-12 w-12 place-items-center rounded-full ${record.type === "send" ? "bg-[#f21b3f]" : "bg-[#20b486]"} text-black`}>{record.type === "send" ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}</span><span className="min-w-0 flex-1"><span className="block text-[19px] capitalize">{record.type} {record.tokenSymbol}</span><span className="mt-1 block text-[15px] text-white/50">{shortAddress(record.counterpartyLabel)}</span></span><span className="text-right"><span className="block text-[18px]">{record.amount} {record.tokenSymbol}</span><span className="mt-1 block text-[14px] text-white/50">{new Date(record.date).toLocaleDateString()}</span></span></button>)}</div>}</div>;
}

function CommunityScreen({ username, onBack }: { username: string; onBack: () => void }) {
  const starterMessages: CommunityMessage[] = [
    { id: "market-1", author: "marketwatch", text: "SOL and BTC live prices are updating now.", createdAt: new Date(0).toISOString() },
  ];
  const [messages, setMessages] = useState<CommunityMessage[]>(() => readStorage(communityMessagesStorageKey, starterMessages));
  const [draft, setDraft] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const next = [...messages, { id: createId("chat"), author: username || "wallet-user", text, createdAt: new Date().toISOString() }];
    setMessages(next);
    writeStorage(communityMessagesStorageKey, next);
    setDraft("");
  };
  return <div className="absolute inset-0 z-40 flex flex-col bg-black"><ScreenHeader title="Community Chat" onBack={onBack} /><div className="flex-1 space-y-3 overflow-y-auto px-4 py-6">{messages.map((message) => <article key={message.id} className={`max-w-[88%] rounded-[1.4rem] px-4 py-3 ${message.author === username ? "ml-auto bg-[#a295f3] text-black" : "bg-[#1d1d1f]"}`}><strong className={`block text-sm ${message.author === username ? "text-black/60" : "text-[#a99bf7]"}`}>@{message.author}</strong><p className="mt-1 text-[17px] leading-6">{message.text}</p>{message.createdAt !== new Date(0).toISOString() ? <time className={`mt-2 block text-xs ${message.author === username ? "text-black/45" : "text-white/35"}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time> : null}</article>)}</div><form onSubmit={submit} className="flex items-center gap-3 border-t border-white/[0.05] bg-black/90 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur-xl"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message" aria-label="Community message" className="min-w-0 flex-1 rounded-full bg-[#202022] px-5 py-4 text-[17px] outline-none placeholder:text-white/35" /><button type="submit" disabled={!draft.trim()} aria-label="Send community message" className="grid h-13 w-13 shrink-0 place-items-center rounded-full bg-[#a295f3] text-black disabled:opacity-35"><Send className="h-6 w-6" /></button></form></div>;
}

function SupportScreen({ onBack, onCommunity }: { onBack: () => void; onCommunity: () => void }) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const questions = [
    { question: "How do I move funds between my wallets?", answer: "Open Send, choose the source and destination wallet accounts, select a currency and confirm the transfer." },
    { question: "Why is a balance different on another wallet?", answer: "Phantom, Ledger and Trust keep separate balances. Choose the intended wallet and account before confirming." },
    { question: "How do I manage my watchlist?", answer: "Open Watchlist from the side menu, then use the heart next to any live currency." },
  ];
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black pb-[calc(env(safe-area-inset-bottom)+36px)]"><ScreenHeader title="Help & Support" onBack={onBack} /><section className="px-4 py-6"><div className="rounded-[1.8rem] bg-[linear-gradient(145deg,#24202f,#151518)] p-6"><CircleHelp className="h-10 w-10 text-[#a99bf7]" /><h1 className="mt-5 text-3xl font-semibold tracking-[-.05em]">How can we help?</h1><p className="mt-2 leading-6 text-white/55">Browse the common questions below or open Community Chat.</p></div><h2 className="mb-3 mt-9 text-sm font-bold uppercase tracking-[.12em] text-white/45">Frequently asked questions</h2><div className="space-y-2">{questions.map(({ question, answer }) => { const open = openQuestion === question; return <article key={question} className="overflow-hidden rounded-[1.35rem] bg-[#191919]"><button type="button" onClick={() => setOpenQuestion(open ? null : question)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-lg font-semibold"><span>{question}</span><ChevronDown className={`h-5 w-5 shrink-0 text-white/45 transition ${open ? "rotate-180" : ""}`} /></button>{open ? <p className="border-t border-white/[0.05] px-5 py-4 leading-6 text-white/55">{answer}</p> : null}</article>; })}</div><button type="button" onClick={onCommunity} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] px-5 py-4 text-lg font-semibold text-black"><MessageCircle className="h-5 w-5" /> Open Community Chat</button></section></div>;
}

function DisclosuresScreen({ onBack }: { onBack: () => void }) {
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black pb-[calc(env(safe-area-inset-bottom)+36px)]"><ScreenHeader title="Disclosures" onBack={onBack} /><section className="space-y-3 px-4 py-6"><div className="rounded-[1.7rem] bg-[#191919] p-6"><Info className="h-8 w-8 text-[#a99bf7]" /><h1 className="mt-5 text-2xl font-semibold">About this wallet</h1><p className="mt-3 leading-7 text-white/55">This experience does not hold, send, or receive real cryptocurrency. Market prices may be live, but all portfolio actions stay inside the app.</p></div><div className="rounded-[1.7rem] bg-[#191919] p-6"><h2 className="text-xl font-semibold">Market data</h2><p className="mt-3 leading-7 text-white/55">Prices can be delayed or temporarily unavailable and should not be used for financial decisions.</p></div><button type="button" onClick={onBack} className="w-full rounded-full bg-[#a295f3] px-5 py-4 text-lg font-semibold text-black">Done</button></section></div>;
}

function TransactionDetail({ record, onClose }: { record: WalletActivity; onClose: () => void }) {
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close transaction" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Sent</h1></div><div className="flex flex-1 flex-col items-center pt-20"><div className="grid h-28 w-28 place-items-center rounded-full bg-[#f5a623] text-black text-5xl">₿</div><p className="mt-8 text-[60px] font-medium tracking-[-0.08em]">-{record.amount} {record.tokenSymbol}</p><div className="mt-12 w-full overflow-hidden rounded-[1.7rem] bg-[#1d1d1f] text-[20px]"><SummaryRow label="Date" value={new Date(record.date).toLocaleString()} /><SummaryRow label="Status" value="Succeeded" /><SummaryRow label="To" value={shortAddress(record.counterpartyLabel)} /><SummaryRow label="Network" value={record.tokenSymbol === "SOL" ? "Solana" : "Bitcoin"} /><SummaryRow label="Network Fee" value={record.tokenSymbol === "SOL" ? "-0.00008 SOL" : "$0.005"} /></div></div><button type="button" onClick={onClose} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">Done</button></div>;
}

function useLiveMarketChart(symbol: string, period: string, livePrice: number) {
  const [points, setPoints] = useState<MarketChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/market-chart?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Chart request failed.");
        const payload = await response.json() as { points?: MarketChartPoint[] };
        if (!Array.isArray(payload.points) || payload.points.length < 2) throw new Error("Chart data is unavailable.");
        const nextPoints = payload.points.filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0);
        if (livePrice > 0) nextPoints.push({ time: Date.now(), price: livePrice });
        if (!cancelled) { setPoints(nextPoints); setUnavailable(false); }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), period === "LIVE" || period === "1D" ? 30_000 : 5 * 60_000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(interval); };
  }, [livePrice, period, symbol]);

  return { points, loading, unavailable };
}

function LiveMarketChart({ points, loading, unavailable, symbol, period }: { points: MarketChartPoint[]; loading: boolean; unavailable: boolean; symbol: string; period: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 410;
  const height = 260;
  const padding = 10;
  const firstTime = points[0]?.time ?? 0;
  const lastTime = points.at(-1)?.time ?? firstTime + 1;
  const prices = points.map((point) => point.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const rawRange = maximum - minimum;
  const range = rawRange || Math.max(maximum * 0.01, 1);
  const chartPoints = points.map((point) => ({
    ...point,
    x: padding + ((point.time - firstTime) / Math.max(1, lastTime - firstTime)) * (width - padding * 2),
    y: padding + ((maximum - point.price + range * 0.04) / (range * 1.08)) * (height - padding * 2),
  }));
  const selectedIndex = hoverIndex === null ? chartPoints.length - 1 : Math.min(hoverIndex, chartPoints.length - 1);
  const selected = chartPoints[selectedIndex];
  const chartPositive = (points.at(-1)?.price ?? 0) >= (points[0]?.price ?? 0);
  const accent = chartPositive ? "#31ed65" : "#ff1744";
  const line = chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");

  const inspect = (clientX: number, left: number, renderedWidth: number) => {
    if (!chartPoints.length) return;
    const ratio = Math.max(0, Math.min(1, (clientX - left) / renderedWidth));
    const targetTime = firstTime + ratio * (lastTime - firstTime);
    let closest = 0;
    for (let index = 1; index < chartPoints.length; index += 1) if (Math.abs(chartPoints[index].time - targetTime) < Math.abs(chartPoints[closest].time - targetTime)) closest = index;
    setHoverIndex(closest);
  };

  if (!points.length) return <div className="grid h-[clamp(13rem,25svh,19rem)] place-items-center px-5 text-center text-white/45">{loading ? <span className="flex items-center gap-3"><span className="h-3 w-3 animate-pulse rounded-full bg-[#a295f3]" /> Loading live {symbol} chart…</span> : unavailable ? "Live chart is temporarily unavailable." : "Waiting for market data…"}</div>;

  return (
    <div className="relative h-[clamp(13rem,25svh,19rem)] touch-none select-none" onPointerMove={(event) => inspect(event.clientX, event.currentTarget.getBoundingClientRect().left, event.currentTarget.getBoundingClientRect().width)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); inspect(event.clientX, event.currentTarget.getBoundingClientRect().left, event.currentTarget.getBoundingClientRect().width); }} onPointerLeave={() => setHoverIndex(null)}>
      {selected && hoverIndex !== null ? <div className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-xl bg-[#252527] px-3 py-2 text-center shadow-xl" style={{ left: `${Math.max(14, Math.min(86, selected.x / width * 100))}%` }}><strong className="block text-sm">{formatPrice(selected.price)}</strong><span className="mt-0.5 block text-[11px] text-white/45">{new Date(selected.time).toLocaleString("en-US", period === "LIVE" || period === "1D" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: period === "1Y" || period === "ALL" ? "numeric" : undefined })}</span></div> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={`${symbol} live ${period} price chart`}>
        <polyline points={line} fill="none" stroke={accent} strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {selected ? <><line x1={selected.x} x2={selected.x} y1="0" y2={height} stroke={hoverIndex === null ? "transparent" : "rgba(255,255,255,.28)"} strokeDasharray="5 6" /><circle cx={selected.x} cy={selected.y} r={hoverIndex === null ? 5 : 7} fill={accent} stroke="black" strokeWidth="3" vectorEffect="non-scaling-stroke" /></> : null}
      </svg>
      {loading ? <span className="absolute right-4 top-3 h-2.5 w-2.5 animate-pulse rounded-full bg-[#a295f3]" aria-label="Refreshing chart" /> : null}
    </div>
  );
}

function TokenDetail({ token, isWatched, onBack, onToggleWatchlist, onSend, onReceive, onTrade, onChat }: { token: WalletToken; isWatched: boolean; onBack: () => void; onToggleWatchlist: () => void; onSend: () => void; onReceive: () => void; onTrade: () => void; onChat: () => void }) {
  const [period, setPeriod] = useState("LIVE");
  const [moreOpen, setMoreOpen] = useState(false);
  const [dismissOffset, setDismissOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const dragMoved = useRef(false);
  const positive = token.change24h >= 0;
  const accent = positive ? "#00e676" : "#ff1744";
  const changeValue = token.price * (token.change24h / 100);
  const { points, loading, unavailable } = useLiveMarketChart(token.symbol, period, token.price);
  const liveChatCount = token.symbol === "SOL" ? 291 : token.symbol === "BTC" ? 99 : 12;
  const finishDismissDrag = (clientY: number) => {
    if (dragStartY.current === null) return;
    const distance = Math.max(0, clientY - dragStartY.current);
    dragStartY.current = null;
    setIsDragging(false);
    if (distance >= 90) {
      onBack();
      return;
    }
    setDismissOffset(0);
  };

  return <div
    className="absolute inset-0 z-40 flex min-h-full flex-col overflow-y-auto bg-black pb-0 will-change-transform"
    style={{
      transform: `translateY(${dismissOffset}px)`,
      opacity: Math.max(0.72, 1 - dismissOffset / 900),
      transition: isDragging ? "none" : "transform 220ms cubic-bezier(.22,1,.36,1), opacity 220ms ease",
    }}
  >
    <div className="sticky top-0 z-20 border-b border-white/[0.025] bg-black/90 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-2xl">
      <button
        type="button"
        onClick={() => {
          if (!dragMoved.current) onBack();
          dragMoved.current = false;
        }}
        aria-label="Swipe down to close asset details"
        className="mx-auto flex h-9 w-28 touch-none cursor-grab items-start justify-center pt-1 active:cursor-grabbing"
        onPointerDown={(event) => {
          dragStartY.current = event.clientY;
          dragMoved.current = false;
          setDismissOffset(0);
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragStartY.current === null) return;
          const distance = Math.max(0, event.clientY - dragStartY.current);
          if (distance > 8) dragMoved.current = true;
          setDismissOffset(distance);
        }}
        onPointerUp={(event) => finishDismissDrag(event.clientY)}
        onPointerCancel={() => {
          dragStartY.current = null;
          dragMoved.current = false;
          setIsDragging(false);
          setDismissOffset(0);
        }}
      >
        <span className="block h-1.5 w-20 rounded-full bg-white/45" />
      </button>
      <div className="mt-5 flex items-center justify-between"><button type="button" onClick={onBack} aria-label="Back to wallet"><TokenIcon token={token} /></button><div className="relative flex gap-2"><button type="button" onClick={onToggleWatchlist} aria-label={isWatched ? `Remove ${token.name} from watchlist` : `Add ${token.name} to watchlist`} aria-pressed={isWatched} className="grid h-12 w-12 place-items-center rounded-full bg-[#1d1d1f]"><Heart className={`h-6 w-6 ${isWatched ? "fill-[#a295f3] text-[#a295f3]" : "text-white"}`} /></button><button type="button" onClick={() => setMoreOpen((current) => !current)} aria-label="More asset options" aria-expanded={moreOpen} className="grid h-12 w-12 place-items-center rounded-full bg-[#1d1d1f]"><MoreHorizontal className="h-6 w-6" /></button>{moreOpen ? <div className="absolute right-0 top-14 z-30 min-w-48 overflow-hidden rounded-[1.2rem] border border-white/[0.06] bg-[#252527] p-1.5 shadow-2xl"><button type="button" onClick={onSend} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-white/[0.05]"><Send className="h-5 w-5 text-[#a99bf7]" /> Send {token.symbol}</button><button type="button" onClick={onReceive} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-white/[0.05]"><QrCode className="h-5 w-5 text-[#a99bf7]" /> Receive</button><button type="button" onClick={() => { onToggleWatchlist(); setMoreOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-white/[0.05]"><Heart className="h-5 w-5 text-[#a99bf7]" /> {isWatched ? "Unfollow" : "Follow"}</button></div> : null}</div></div>
    </div>
    <div className="px-5 pt-3">
      <h1 className="flex items-center gap-2 text-[clamp(2.4rem,12vw,4rem)] font-semibold leading-none tracking-[-.065em]">{token.name}<ChevronDown className="mt-2 h-7 w-7 text-white/55" /></h1>
      <p className="mt-4 text-[clamp(3rem,15vw,5.2rem)] font-semibold leading-none tracking-[-.075em]">{formatPrice(token.price)}</p>
      <p className="mt-3 text-[clamp(1.1rem,5vw,1.45rem)] font-bold" style={{ color: accent }}>{formatSignedMoney(changeValue)} ({token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%)</p>
    </div>
    <div className="mt-5">
      <LiveMarketChart points={points} loading={loading} unavailable={unavailable} symbol={token.symbol} period={period} />
      <div className="flex items-center justify-between px-4 text-sm font-semibold text-white/55">{["LIVE", "1D", "1W", "1M", "1Y", "ALL"].map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} aria-pressed={period === item} className={`rounded-full px-3 py-2 transition ${period === item ? "bg-white text-black" : "hover:text-white"}`}>{item === "ALL" ? "All" : item}</button>)}<SlidersHorizontal className="h-5 w-5" /></div>
    </div>
    <div className="px-5 pb-28">
      {token.balance > 0 ? <section className="mt-12"><SectionHeading>Your positions</SectionHeading><button type="button" onClick={onSend} className="mt-4 flex w-full items-center gap-4 py-3 text-left"><TokenIcon token={token} size="small" /><span className="min-w-0 flex-1"><strong className="block text-xl">{token.symbol} <span className="font-normal text-white/55">{token.name}</span></strong><span className="mt-1 block text-base text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span><span className="text-right"><span className="block text-lg">{formatMoney(token.price * token.balance)}</span><span className={`mt-1 block font-semibold ${positive ? "text-[#00e676]" : "text-[#ff1744]"}`}>{formatSignedMoney(token.price * token.balance * token.change24h / 100)}</span></span><ChevronRight className="h-6 w-6 text-white/55" /></button></section> : null}
      <section className="mt-11"><div className="flex items-center justify-between"><SectionHeading>Live Chat</SectionHeading><span className="mt-10 flex items-center gap-2 text-lg text-[#00e676]"><span className="h-2.5 w-2.5 rounded-full bg-[#00e676]" /> {liveChatCount} here</span></div><button type="button" onClick={onChat} className="mt-5 flex w-full items-center gap-4 rounded-[1.6rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#292633] text-[#a99bf7]"><MessageCircle className="h-5 w-5" /></span><span className="truncate text-lg"><strong>@marketwatch</strong> {positive ? `${token.symbol} momentum is picking up` : `watching ${token.symbol} support closely`}</span></button></section>
    </div>
    <div className="sticky bottom-0 z-20 mt-auto flex items-center gap-4 border-t border-white/[0.04] bg-black/85 px-5 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-4 backdrop-blur-2xl"><div className="min-w-0 flex-1"><span className="block text-sm text-white/45">Market capitalization</span><strong className="mt-1 block truncate text-lg">{formatCompactMoney(token.marketCap)}</strong></div><button type="button" onClick={onTrade} className="min-w-[44%] rounded-full bg-[#a295f3] px-7 py-4 text-xl font-semibold text-black transition hover:bg-[#b6aaff] active:scale-[.98]">Trade</button></div>
  </div>;
}

function TokenEditor({ token, onClose, onSave }: { token: WalletToken | null; onClose: () => void; onSave: (form: TokenForm) => void }) {
  const [form, setForm] = useState<TokenForm>(() => token ? { id: token.id, name: token.name, symbol: token.symbol, price: String(token.price), balance: String(token.balance), change24h: String(token.change24h), image: token.image } : emptyTokenForm);
  const [error, setError] = useState("");
  const update = (field: keyof TokenForm, value: string) => { setForm((current) => ({ ...current, [field]: value })); setError(""); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number(form.price);
    const balance = Number(form.balance);
    const change24h = Number(form.change24h);
    if (!form.name.trim() || !form.symbol.trim() || ![price, balance, change24h].every(Number.isFinite) || price < 0 || balance < 0) { setError("Enter a name, symbol, and valid numeric values."); return; }
    onSave({ ...form, name: form.name.trim(), symbol: form.symbol.trim().toUpperCase(), price: String(price), balance: String(balance), change24h: String(change24h) });
  };
  return <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/75 px-3 pb-3 backdrop-blur-sm sm:items-center"><section className="max-h-[92svh] w-full max-w-[510px] overflow-y-auto rounded-[2rem] bg-[#1d1d1f] p-6" aria-label={token ? `Edit ${token.name}` : "Add token"}><div className="flex items-center justify-between"><div><h2 className="text-[22px] font-semibold">{token ? `Edit ${token.name}` : "Add Token"}</h2><p className="mt-1 text-sm text-white/45">Portfolio data is stored for this wallet.</p></div><button type="button" onClick={onClose} aria-label="Close token editor"><X className="h-6 w-6" /></button></div><form onSubmit={submit} className="mt-7 space-y-3">{(["name", "symbol", "price", "balance", "change24h", "image"] as (keyof TokenForm)[]).map((field) => <label key={field} className="block rounded-2xl bg-[#29292b] px-4 py-3 text-sm text-white/55"><span>{field === "change24h" ? "24h %" : field === "image" ? "Image URL" : field[0].toUpperCase() + field.slice(1)}</span><input type={field === "price" || field === "balance" || field === "change24h" ? "number" : field === "image" ? "url" : "text"} inputMode={field === "price" || field === "balance" || field === "change24h" ? "decimal" : undefined} value={form[field] ?? ""} onChange={(event) => update(field, event.target.value)} className="mt-1 block w-full bg-transparent text-[17px] text-white outline-none" /></label>)}{error ? <p className="rounded-xl bg-[#f21b3f]/15 px-4 py-3 text-sm text-[#ff91a2]">{error}</p> : null}<div className="flex gap-3 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-full bg-[#29292b] px-4 py-4 text-[17px] text-white/70">Cancel</button><button type="submit" className="flex-1 rounded-full bg-[#a295f3] px-4 py-4 text-[17px] font-medium text-black">Save Token</button></div></form></section></div>;
}

export function DownloadWallet() {
  const runtime = useWalletRuntime();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [profile, setProfile] = useState<ProfileRecord>(defaultProfile);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [view, setView] = useState<View>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [tokenEditorOpen, setTokenEditorOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<WalletToken | null>(null);
  const [flow] = useState<TokenFlow>("send");
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [sendAmount, setSendAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sentRecord, setSentRecord] = useState<WalletActivity | null>(null);
  const [records, setRecords] = useState<WalletActivity[]>([]);
  const [tokenQuery, setTokenQuery] = useState("");
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(defaultWatchlistSymbols);
  const [perpPositions, setPerpPositions] = useState<PerpPosition[]>([]);
  const [selectedPerpSymbol, setSelectedPerpSymbol] = useState("BTC");
  const [perpOriginTab, setPerpOriginTab] = useState<Tab>("Home");
  const [tokenDetailOrigin, setTokenDetailOrigin] = useState<"home" | "watchlist">("home");
  const [cashVisible, setCashVisible] = useState(true);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [homePullOffset, setHomePullOffset] = useState(0);
  const [homeRefreshStatus, setHomeRefreshStatus] = useState<HomeRefreshStatus>("idle");
  const latestMarketSnapshot = useRef<LiveMarketSnapshot>(emptyLiveMarketSnapshot);
  const homeScrollRef = useRef<HTMLDivElement>(null);
  const homePullStart = useRef<{ x: number; y: number } | null>(null);
  const homeRawPull = useRef(0);
  const homeRefreshTimers = useRef<number[]>([]);

  const liveSymbols = liveMarketSymbols;

  useLivePrices(liveSymbols, (prices, changes, images, marketCaps, changes1h, changes7d, volumes24h) => {
    const snapshot = { prices, changes, changes1h, changes7d, images, marketCaps, volumes24h };
    latestMarketSnapshot.current = snapshot;
    setTokens((current) => applyLiveMarketSnapshot(current, snapshot));
    runtime.updateMarketAssets(applyLiveMarketSnapshot(liveTokenCatalogue, snapshot));
  }, homeRefreshKey);

  useEffect(() => () => {
    homeRefreshTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const refreshSharedWallet = () => {
      const loadedTokens = mergeLiveTokenCatalogue(getTokens());
      setTokens(applyLiveMarketSnapshot(loadedTokens, latestMarketSnapshot.current));
      setProfile(readProfile());
      setRecords(getTransactions().filter((record) => !["act_001", "act_002", "act_003"].includes(record.id)));
    };
    const timeoutId = window.setTimeout(() => {
      const loadedTokens = mergeLiveTokenCatalogue(migrateLegacyReferenceHoldings(getTokens()));
      setTokens(applyLiveMarketSnapshot(loadedTokens, latestMarketSnapshot.current));
      setProfile(readProfile());
      setRecords(getTransactions().filter((record) => !["act_001", "act_002", "act_003"].includes(record.id)));
      const storedWatchlist = readStorage<unknown>(watchlistStorageKey, defaultWatchlistSymbols);
      const normalizedWatchlist = Array.isArray(storedWatchlist)
        ? [...new Set(storedWatchlist.filter((symbol): symbol is string => typeof symbol === "string").map((symbol) => symbol.toUpperCase()))]
        : defaultWatchlistSymbols;
      setWatchlistSymbols(normalizedWatchlist);
      const storedPositions = readStorage<unknown>(perpPositionsStorageKey, []);
      setPerpPositions(Array.isArray(storedPositions) ? storedPositions.filter((position): position is PerpPosition => {
        if (!position || typeof position !== "object") return false;
        const candidate = position as Partial<PerpPosition>;
        return typeof candidate.id === "string" && typeof candidate.symbol === "string" && (candidate.side === "long" || candidate.side === "short") && typeof candidate.leverage === "number" && candidate.leverage >= 1 && typeof candidate.collateral === "number" && candidate.collateral > 0 && typeof candidate.notional === "number" && candidate.notional > 0 && typeof candidate.entryPrice === "number" && candidate.entryPrice > 0 && typeof candidate.openedAt === "string";
      }) : []);
      if (!window.localStorage.getItem(notificationStorageKey)) setNotificationPromptOpen(true);
    }, 0);
    window.addEventListener(walletLedgerEvent, refreshSharedWallet);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(walletLedgerEvent, refreshSharedWallet);
    };
  }, []);

  useEffect(() => {
    if (!runtime.state || !runtime.currentAccount) return;
    const timeoutId = window.setTimeout(() => {
      setTokens((current) => applyLiveMarketSnapshot(
        tokensForWalletAccount(current, runtime.state!, runtime.currentAccount!),
        latestMarketSnapshot.current,
      ));
      setProfile((current) => ({ ...current, cash: runtime.currentAccount?.balances.USD ?? 0 }));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [runtime.currentAccount, runtime.state]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };


  const resetSend = () => { setSelectedToken(null); setSendAmount(""); setRecipient(""); };

  const openTokenDetail = (token: WalletToken, origin: "home" | "watchlist" = "home") => {
    setSelectedToken(token);
    setTokenDetailOrigin(origin);
    setView("token-detail");
  };

  const openPerpMarket = (token: WalletToken) => {
    setSelectedPerpSymbol(token.symbol);
    setPerpOriginTab(activeTab);
    setView("perp-market");
  };

  const toggleWatchlist = (token: WalletToken) => {
    const isWatched = watchlistSymbols.includes(token.symbol);
    const next = isWatched
      ? watchlistSymbols.filter((symbol) => symbol !== token.symbol)
      : [...watchlistSymbols, token.symbol];
    setWatchlistSymbols(next);
    writeStorage(watchlistStorageKey, next);
    notify(`${token.name} ${isWatched ? "removed from" : "added to"} your watchlist.`);
  };

  const openAction = (action: Action) => {
    setActionsOpen(false);
    if (action === "Send") { runtime.openTransfer(); return; }
    if (action === "Receive") { runtime.openReceive(); return; }
    if (action === "Add Cash") { setView("add-cash"); return; }
    setActiveTab("Trade");
  };

  const pickToken = (token: WalletToken) => {
    setSelectedToken(token);
    if (flow === "send") setView("send-recipient");
    else setView("buy");
  };

  const saveProfile = (nextProfile: ProfileRecord, balances: Record<string, number>) => {
    writeStorage(profileStorageKey, nextProfile);
    setProfile(nextProfile);
    const updated = tokens.map((token) => balances[token.id] === undefined ? token : saveToken({ ...token, balance: balances[token.id] }));
    setTokens(updated);
    runtime.replaceCurrentBalances({ ...Object.fromEntries(updated.map((token) => [token.symbol, token.balance])), USD: nextProfile.cash });
    runtime.renameCurrentAccount(nextProfile.accountName);
    setView("home");
    notify("Profile saved.");
  };

  const saveEditedToken = (form: TokenForm) => {
    const saved = saveToken({ id: form.id, name: form.name, symbol: form.symbol, price: Number(form.price), balance: Number(form.balance), change24h: Number(form.change24h), image: form.image.trim() || "https://placehold.co/64x64/1d1d1f/ffffff?text=T" });
    setTokens((current) => { const next = [...current]; const index = next.findIndex((token) => token.id === saved.id); if (index >= 0) next[index] = saved; else next.push(saved); return next; });
    runtime.updateMarketAssets([...tokens.filter((token) => token.id !== saved.id), saved]);
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((token) => [token.symbol, token.id === saved.id ? saved.balance : token.balance])), [saved.symbol]: saved.balance, USD: profile.cash });
    setEditingToken(null);
    setTokenEditorOpen(false);
    notify(`${saved.name} saved to your wallet.`);
  };

  const removeToken = (token: WalletToken) => {
    setTokens(deleteToken(token.id));
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((item) => [item.symbol, item.id === token.id ? 0 : item.balance])), USD: profile.cash });
    setWatchlistSymbols((current) => {
      const next = current.filter((symbol) => symbol !== token.symbol);
      writeStorage(watchlistStorageKey, next);
      return next;
    });
    notify(`${token.name} deleted from your wallet.`);
  };

  const executeMarketTrade = ({ payAsset, receiveAsset, payAmount, receiveAmount }: TradeRequest) => {
    if (payAsset === receiveAsset || !Number.isFinite(payAmount) || !Number.isFinite(receiveAmount) || payAmount <= 0 || receiveAmount <= 0) return false;
    const payToken = payAsset === "CASH" ? null : tokens.find((token) => token.symbol === payAsset);
    const receiveToken = receiveAsset === "CASH" ? null : tokens.find((token) => token.symbol === receiveAsset);
    if ((payAsset !== "CASH" && !payToken) || (receiveAsset !== "CASH" && !receiveToken)) return false;
    if (payAsset === "CASH" ? payAmount > profile.cash : payAmount > (payToken?.balance ?? 0)) return false;

    const deltas = new Map<string, number>();
    if (payToken) deltas.set(payToken.symbol, -payAmount);
    if (receiveToken) deltas.set(receiveToken.symbol, (deltas.get(receiveToken.symbol) ?? 0) + receiveAmount);
    if (deltas.size) {
      const updatedTokens = tokens.map((token) => {
        const delta = deltas.get(token.symbol);
        return delta === undefined ? token : saveToken({ ...token, balance: Math.max(0, token.balance + delta) });
      });
      setTokens(updatedTokens);
    }

    const nextCash = profile.cash + (receiveAsset === "CASH" ? receiveAmount : 0) - (payAsset === "CASH" ? payAmount : 0);
    if (nextCash !== profile.cash) {
      const nextProfile = { ...profile, cash: Math.max(0, nextCash) };
      writeStorage(profileStorageKey, nextProfile);
      setProfile(nextProfile);
    }
    runtime.replaceCurrentBalances({
      ...Object.fromEntries(tokens.map((token) => [token.symbol, Math.max(0, token.balance + (deltas.get(token.symbol) ?? 0))])),
      USD: Math.max(0, nextCash),
    });

    const payLabel = payAsset === "CASH" ? formatMoney(payAmount) : `${formatAmount(payAmount)} ${payAsset}`;
    const receiveLabel = receiveAsset === "CASH" ? formatMoney(receiveAmount) : `${formatAmount(receiveAmount)} ${receiveAsset}`;
    notify(`Traded ${payLabel} for ${receiveLabel}.`);
    return true;
  };

  const openPerpPosition = ({ symbol, side, leverage, collateral }: PerpOrderRequest) => {
    const token = tokens.find((item) => item.symbol === symbol);
    if (!token || !Number.isFinite(token.price) || token.price <= 0) return "A live market price is not available.";
    if (!Number.isFinite(collateral) || collateral <= 0) return "Enter a valid collateral amount.";
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > maxPerpLeverage(symbol)) return "Choose a valid leverage level.";
    const notional = collateral * leverage;
    const openingFee = notional * 0.0005;
    const requiredCash = collateral + openingFee;
    if (requiredCash > profile.cash + 0.000001) return `Insufficient cash. Add ${formatMoney(requiredCash - profile.cash)} more.`;

    const position: PerpPosition = {
      id: createId("perp"),
      symbol,
      side,
      leverage,
      collateral,
      notional,
      entryPrice: token.price,
      openedAt: new Date().toISOString(),
    };
    const nextPositions = [position, ...perpPositions];
    const nextProfile = { ...profile, cash: Math.max(0, profile.cash - requiredCash) };
    setPerpPositions(nextPositions);
    writeStorage(perpPositionsStorageKey, nextPositions);
    setProfile(nextProfile);
    writeStorage(profileStorageKey, nextProfile);
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((token) => [token.symbol, token.balance])), USD: nextProfile.cash });
    notify(`Opened ${leverage}x ${side} on ${symbol}.`);
    return null;
  };

  const closePerpPosition = (position: PerpPosition) => {
    const token = tokens.find((item) => item.symbol === position.symbol);
    const currentPrice = token?.price ?? position.entryPrice;
    const pnl = perpPositionPnl(position, currentPrice);
    const closingFee = position.notional * 0.0005;
    const payout = Math.max(0, position.collateral + pnl - closingFee);
    const nextPositions = perpPositions.filter((item) => item.id !== position.id);
    const nextProfile = { ...profile, cash: profile.cash + payout };
    setPerpPositions(nextPositions);
    writeStorage(perpPositionsStorageKey, nextPositions);
    setProfile(nextProfile);
    writeStorage(profileStorageKey, nextProfile);
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((token) => [token.symbol, token.balance])), USD: nextProfile.cash });
    notify(`Closed ${position.symbol} ${position.side} · ${formatSignedMoney(pnl - closingFee)} after fee.`);
  };

  const buyToken = (amount: number) => {
    if (!selectedToken || amount <= 0) return;
    const saved = saveToken({ ...selectedToken, balance: selectedToken.balance + amount });
    setTokens((current) => current.map((token) => token.id === saved.id ? saved : token));
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((token) => [token.symbol, token.id === saved.id ? saved.balance : token.balance])), USD: profile.cash });
    setSelectedToken(saved);
    setView("home");
    notify(`${formatAmount(amount)} ${saved.symbol} added to your wallet.`);
  };

  const addCash = (amount: number) => {
    const normalizedAmount = Math.round(amount * 100) / 100;
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > 25_000) {
      notify("Enter an amount between $0.01 and $25,000.00.");
      return;
    }
    const nextProfile = { ...profile, cash: Math.round((profile.cash + normalizedAmount) * 100) / 100 };
    writeStorage(profileStorageKey, nextProfile);
    setProfile(nextProfile);
    runtime.replaceCurrentBalances({ ...Object.fromEntries(tokens.map((token) => [token.symbol, token.balance])), USD: nextProfile.cash });
    setView("home");
    notify(`${formatMoney(normalizedAmount)} added to your in-app cash balance.`);
  };

  const completeSend = () => {
    if (!selectedToken) return;
    const amount = Number(sendAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedToken.balance) return;
    const savedToken = saveToken({ ...selectedToken, balance: selectedToken.balance - amount });
    const record = createTransaction({ type: "send", tokenSymbol: selectedToken.symbol, amount, counterpartyLabel: recipient || "Recipient", date: new Date().toISOString(), status: "completed", recipientId: recipient });
    setTokens((current) => current.map((token) => token.id === savedToken.id ? savedToken : token));
    setRecords((current) => [record, ...current]);
    setSentRecord(record);
    setView("sent");
  };

  const currentToken = selectedToken
    ? tokens.find((token) => token.id === selectedToken.id) ?? selectedToken
    : null;
  const currentPerpToken = tokens.find((token) => token.symbol === selectedPerpSymbol) ?? null;

  const clearHomeRefreshTimers = () => {
    homeRefreshTimers.current.forEach((timer) => window.clearTimeout(timer));
    homeRefreshTimers.current = [];
  };

  const startHomeRefresh = () => {
    if (homeRefreshStatus === "refreshing") return;
    clearHomeRefreshTimers();
    homePullStart.current = null;
    homeRawPull.current = 0;
    setHomePullOffset(56);
    setHomeRefreshStatus("refreshing");
    runtime.refresh();
    setHomeRefreshKey((current) => current + 1);
    homeRefreshTimers.current = [
      window.setTimeout(() => {
        setHomeRefreshStatus("complete");
      }, 700),
      window.setTimeout(() => {
        setHomePullOffset(0);
        setHomeRefreshStatus("idle");
      }, 1_120),
    ];
  };

  const canPullToRefresh = view === "home"
    && activeTab === "Home"
    && !drawerOpen
    && !actionsOpen
    && !tokenEditorOpen
    && !notificationPromptOpen
    && homeRefreshStatus !== "refreshing";

  const handleHomeTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!canPullToRefresh || (homeScrollRef.current?.scrollTop ?? 0) > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true'], [data-no-pull-refresh]")) return;
    const touch = event.touches[0];
    if (!touch) return;
    homePullStart.current = { x: touch.clientX, y: touch.clientY };
    homeRawPull.current = 0;
  };

  const handleHomeTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = homePullStart.current;
    const touch = event.touches[0];
    if (!start || !touch || (homeScrollRef.current?.scrollTop ?? 0) > 0) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) return;
    event.preventDefault();
    const nextOffset = Math.min(64, deltaY * 0.52);
    homeRawPull.current = deltaY;
    setHomePullOffset(nextOffset);
    setHomeRefreshStatus(deltaY >= 82 ? "ready" : "pulling");
  };

  const handleHomeTouchEnd = () => {
    if (!homePullStart.current) return;
    const shouldRefresh = homeRawPull.current >= 82;
    homePullStart.current = null;
    homeRawPull.current = 0;
    if (shouldRefresh) {
      startHomeRefresh();
      return;
    }
    setHomePullOffset(0);
    setHomeRefreshStatus("idle");
  };

  const handleHomeTouchCancel = () => {
    homePullStart.current = null;
    homeRawPull.current = 0;
    setHomePullOffset(0);
    setHomeRefreshStatus("idle");
  };

  return (
    <main className="download-wallet-app fixed inset-0 z-0 overflow-hidden bg-[#080809] font-sans text-white sm:bg-[radial-gradient(circle_at_50%_10%,#211d34_0%,#080809_46%)]">
      <div className="relative mx-auto h-full w-full max-w-[560px] overflow-hidden bg-black shadow-2xl shadow-black/70 sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-[2.5rem] sm:border sm:border-white/[0.07]">
        <div ref={homeScrollRef} data-testid="phantom-home-scroll" onTouchStart={handleHomeTouchStart} onTouchMove={handleHomeTouchMove} onTouchEnd={handleHomeTouchEnd} onTouchCancel={handleHomeTouchCancel} className="relative h-full overflow-y-auto overscroll-contain">
{view === "home" ? <HomeView tokens={tokens} profile={profile} tab={activeTab} cashVisible={cashVisible} tokenQuery={tokenQuery} watchlistSymbols={watchlistSymbols} refreshOffset={homePullOffset} refreshStatus={homeRefreshStatus} onRefresh={startHomeRefresh} onTab={setActiveTab} onMenu={() => setDrawerOpen(true)} onCash={() => setCashVisible((value) => !value)} onOpenWatchlist={() => setView("watchlist")} onAccounts={runtime.openAccounts} onExecuteTrade={executeMarketTrade} perpPositions={perpPositions} onOpenPerp={openPerpMarket} onClosePerp={closePerpPosition} onToken={(token) => openTokenDetail(token)} onCommunity={() => setView("community")} onSupport={() => setView("support")} onDisclosures={() => setView("disclosures")} /> : null}
          {view === "profile" ? <ProfileScreen profile={profile} tokens={tokens} onBack={() => setView("home")} onSave={saveProfile} onAddToken={() => { setEditingToken(null); setTokenEditorOpen(true); }} onEditToken={(token) => { setEditingToken(token); setTokenEditorOpen(true); }} onDeleteToken={removeToken} /> : null}
          {view === "history" ? <HistoryScreen records={records} onBack={() => setView("home")} onRecord={(record) => { setSentRecord(record); setView("sent-detail"); }} /> : null}
          {view === "watchlist" ? <WatchlistScreen tokens={tokens} watchlistSymbols={watchlistSymbols} onBack={() => setView("home")} onToken={(token) => openTokenDetail(token, "watchlist")} onToggle={toggleWatchlist} /> : null}
          {view === "community" ? <CommunityScreen username={profile.username} onBack={() => setView("home")} /> : null}
          {view === "support" ? <SupportScreen onBack={() => setView("home")} onCommunity={() => setView("community")} /> : null}
          {view === "disclosures" ? <DisclosuresScreen onBack={() => setView("home")} /> : null}
          {view === "token-picker" ? <TokenPicker tokens={tokens} flow={flow} onClose={() => { resetSend(); setView("home"); }} onSelect={pickToken} /> : null}
          {view === "send-recipient" && currentToken ? <SendRecipientScreen token={currentToken} recipient={recipient} onRecipient={setRecipient} onBack={() => setView("token-picker")} onNext={() => setView("send-amount")} /> : null}
          {view === "send-amount" && currentToken ? <SendAmountScreen token={currentToken} amount={sendAmount} onAmount={setSendAmount} onBack={() => setView("send-recipient")} onNext={() => setView("send-summary")} /> : null}
          {view === "send-summary" && currentToken ? <SummaryScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onBack={() => setView("send-amount")} onConfirm={() => setView("sending")} /> : null}
          {view === "sending" && currentToken ? <SendingScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onComplete={completeSend} /> : null}
          {view === "sent" && currentToken && sentRecord ? <SentScreen token={currentToken} amount={sentRecord.amount} recipient={sentRecord.counterpartyLabel} onClose={() => { resetSend(); setView("home"); }} onHistory={() => setView("history")} /> : null}
          {view === "receive" ? <ReceiveScreen profile={profile} onClose={() => setView("home")} /> : null}
          {view === "add-cash" ? <AddCashScreen balance={profile.cash} onClose={() => setView("home")} onAdd={addCash} /> : null}
          {view === "buy" && currentToken ? <BuyScreen token={currentToken} onClose={() => { resetSend(); setView("home"); }} onBuy={buyToken} /> : null}
          {view === "perp-market" && currentPerpToken ? <PerpMarketScreen token={currentPerpToken} cashBalance={profile.cash} positions={perpPositions} onBack={() => { setView("home"); setActiveTab(perpOriginTab); }} onOpenPosition={openPerpPosition} onClosePosition={closePerpPosition} /> : null}
          {view === "token-detail" && currentToken ? <TokenDetail token={currentToken} isWatched={watchlistSymbols.includes(currentToken.symbol)} onBack={() => { setSelectedToken(null); setView(tokenDetailOrigin); }} onToggleWatchlist={() => toggleWatchlist(currentToken)} onSend={() => runtime.openTransfer(currentToken.symbol)} onReceive={runtime.openReceive} onTrade={() => { setSelectedToken(null); setView("home"); setActiveTab("Trade"); }} onChat={() => { setSelectedToken(null); setView("community"); }} /> : null}
          {view === "sent-detail" && sentRecord ? <TransactionDetail record={sentRecord} onClose={() => setView("history")} /> : null}
          {actionsOpen && view === "home" ? <ActionMenu onAction={openAction} onClose={() => setActionsOpen(false)} /> : null}
          {drawerOpen ? <SideDrawer profile={profile} onClose={() => setDrawerOpen(false)} onAccounts={() => { setDrawerOpen(false); runtime.openAccounts(); }} onProfile={() => { setDrawerOpen(false); setView("profile"); }} onCommunity={() => { setDrawerOpen(false); setView("community"); }} onWatchlist={() => { setDrawerOpen(false); setView("watchlist"); }} onHistory={() => { setDrawerOpen(false); runtime.openHistory(); }} onSettings={() => { setDrawerOpen(false); runtime.openSecurity(); }} onSupport={() => { setDrawerOpen(false); setView("support"); }} onNotice={notify} /> : null}
          {tokenEditorOpen ? <TokenEditor token={editingToken} onClose={() => { setEditingToken(null); setTokenEditorOpen(false); }} onSave={saveEditedToken} /> : null}
          {toast ? <div className="absolute bottom-28 left-1/2 z-[80] w-max max-w-[90%] -translate-x-1/2 rounded-full border border-white/[0.06] bg-[#29292b] px-5 py-3 text-center text-sm text-white/85 shadow-xl">{toast}</div> : null}
          {notificationPromptOpen ? <NotificationPrompt onClose={() => setNotificationPromptOpen(false)} /> : null}
        </div>
        {view === "home" ? <HomeDock tokenQuery={tokenQuery} actionsOpen={actionsOpen} onSearch={setTokenQuery} onActions={() => setActionsOpen((value) => !value)} /> : null}
      </div>
      <style>{`.download-wallet-app div.absolute.inset-0.z-40 > div.mx-auto.mt-3.h-1\\.5.w-20 { margin-top: calc(env(safe-area-inset-top) + 12px); }`}</style>
    </main>
  );
}
