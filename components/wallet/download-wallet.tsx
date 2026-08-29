"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
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
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { liveMarketSymbols } from "@/config/tokens";
import type { WalletActivity, WalletToken } from "@/lib/types";
import { useLivePrices } from "@/components/wallet/use-live-prices";
import {
  createTransaction,
  deleteToken,
  getTokens,
  getTransactions,
  saveToken,
} from "@/lib/wallet";
import { readStorage, writeStorage } from "@/lib/storage";

type Tab = "Home" | "Trade" | "Predictions" | "Explore";
type Action = "Send" | "Receive" | "Add Cash" | "Trade";
type TokenFlow = "send" | "buy";
type View =
  | "home"
  | "profile"
  | "history"
  | "token-picker"
  | "send-recipient"
  | "send-amount"
  | "send-summary"
  | "sending"
  | "sent"
  | "receive"
  | "add-cash"
  | "buy"
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

type LiveMarketSnapshot = {
  prices: Record<string, number>;
  changes: Record<string, number>;
  images: Record<string, string>;
  marketCaps: Record<string, number>;
};

const profileStorageKey = "larpz_download_profile";
const notificationStorageKey = "larpz_download_notifications_prompted";

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

const liveTokenNames: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  USDT: "Tether",
  USDC: "USD Coin",
  SUI: "Sui",
  MATIC: "Polygon",
  HYPE: "Hyperliquid",
  BNB: "BNB",
  TRX: "TRON",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  DOT: "Polkadot",
  LINK: "Chainlink",
  LTC: "Litecoin",
  TON: "Toncoin",
  SHIB: "Shiba Inu",
  NEAR: "NEAR",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  ATOM: "Cosmos",
  XLM: "Stellar",
  BCH: "Bitcoin Cash",
  XMR: "Monero",
  PEPE: "Pepe",
  WIF: "dogwifhat",
};

const liveTokenCatalogue: WalletToken[] = liveMarketSymbols.map((symbol) => ({
  id: `market-${symbol.toLowerCase()}`,
  name: liveTokenNames[symbol] ?? symbol,
  symbol,
  balance: 0,
  price: 0,
  change24h: 0,
  image: "",
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

function formatSignedMoney(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
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

function applyLiveMarketSnapshot(tokens: WalletToken[], snapshot: LiveMarketSnapshot) {
  return tokens.map((token) => ({
    ...token,
    price: snapshot.prices[token.symbol] ?? token.price,
    change24h: snapshot.changes[token.symbol] ?? token.change24h,
    image: snapshot.images[token.symbol] ?? token.image,
    marketCap: snapshot.marketCaps[token.symbol] ?? token.marketCap,
    updatedAt: snapshot.prices[token.symbol] ? new Date().toISOString() : token.updatedAt,
  }));
}

function sortTokens(tokens: WalletToken[]) {
  return [...tokens].sort((a, b) => {
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
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold shadow-[inset_0_1px_2px_rgba(255,255,255,.35)] ${dimensions}`}
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

function LockAvatar({ value = "🔐", size = "normal" }: { value?: string; size?: "normal" | "large" }) {
  const imageSource = value === "🔐" ? "/assets/logo_m.png" : value.startsWith("/avatars/") ? value : null;

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#242426] ${size === "large" ? "h-24 w-24 text-5xl" : "h-12 w-12 text-2xl"}`}>
      {imageSource ? <Image src={imageSource} alt="Profile avatar" fill unoptimized sizes={size === "large" ? "96px" : "48px"} className="object-cover" /> : value}
    </span>
  );
}

function WalletTabs({ activeTab, onChange, onMenu }: { activeTab: Tab; onChange: (tab: Tab) => void; onMenu: () => void }) {
  const tabs: { value: Tab; label: string }[] = [
    { value: "Home", label: "Home" },
    { value: "Trade", label: "Trade" },
    { value: "Predictions", label: "Predictions" },
    { value: "Explore", label: "Explore" },
  ];

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onClick={onMenu} aria-label="Open wallet menu" className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f4cb42] text-white transition hover:scale-[1.03] active:scale-95">
        <Image src="/assets/logo_m.png" alt="" fill sizes="44px" className="object-cover" priority />
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
    <header className="sticky top-0 z-10 flex items-center justify-between bg-black/90 px-4 pb-5 pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-lg">
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
        <p className="mx-auto mt-5 max-w-[390px] text-[18px] leading-[1.45] text-white/60">Get notified when wallet activity arrives, including simulated receives and live incoming transfers.</p>
        <button type="button" onClick={enableNotifications} className="mt-7 w-full rounded-full bg-[#a295f3] px-5 py-4 text-[18px] font-medium text-black transition hover:bg-[#b4aaff]">Enable Notifications</button>
        <button type="button" onClick={dismiss} className="mt-3 w-full rounded-full bg-[#29292b] px-5 py-4 text-[18px] text-white/70 transition hover:bg-[#343436]">Not Now</button>
      </section>
    </div>
  );
}

function SideDrawer({ profile, onClose, onProfile, onHistory, onSettings, onNotice }: { profile: ProfileRecord; onClose: () => void; onProfile: () => void; onHistory: () => void; onSettings: () => void; onNotice: (message: string) => void }) {
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
        <button type="button" onClick={() => onNotice("Connect X is available in simulation mode.")} className="mt-6 flex items-center gap-2 text-left text-[15px] font-semibold text-[#a99bf7]"><span className="text-lg">𝕏</span> Connect your X account</button>
        <div className="mt-10">
          <button type="button" onClick={onClose} className="flex items-center gap-4 py-3 text-left text-[17px] font-semibold text-white/90"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#202022] text-xs">A1</span> {profile.accountName} <ChevronDown className="h-4 w-4 text-white/50" /></button>
          {item(UserRound, "Profile", onProfile)}
          {item(MessageCircle, "Chats", () => onNotice("Chats are available in simulation mode."))}
          {item(Heart, "Watchlist", () => onNotice("Your watchlist is shown on Home."))}
          {item(Clock3, "Activity", onHistory)}
        </div>
        <div className="mt-auto space-y-1">
          {item(Settings, "Settings", onSettings)}
          {item(CircleHelp, "Help & Support", () => onNotice("Help & Support is available in simulation mode."))}
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
  actionsOpen,
  onTab,
  onMenu,
  onCash,
  onSearch,
  onActions,
  onToken,
  onNotify,
}: {
  tokens: WalletToken[];
  profile: ProfileRecord;
  tab: Tab;
  cashVisible: boolean;
  tokenQuery: string;
  actionsOpen: boolean;
  onTab: (tab: Tab) => void;
  onMenu: () => void;
  onCash: () => void;
  onSearch: (value: string) => void;
  onActions: () => void;
  onToken: (token: WalletToken) => void;
  onNotify: (message: string) => void;
}) {
  const referenceTokens = useMemo(() => referenceHomeTokens(tokens), [tokens]);
  const displayTokens = useMemo(
    () => [
      ...referenceTokens,
      ...sortTokens(tokens.filter((token) => token.balance > 0 && token.symbol !== "SOL" && token.symbol !== "BFS")),
    ],
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

  return (
    <>
      <div className="sticky top-0 z-20 min-w-0 border-b border-white/[0.025] bg-black/85 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-2xl">
        <WalletTabs activeTab={tab} onChange={onTab} onMenu={onMenu} />
      </div>

      {tab === "Home" ? (
        <section className="px-5 pb-40 pt-8">
          <button type="button" onClick={() => onNotify("Account switching is available in simulation mode.")} className="flex max-w-full items-center gap-1.5 truncate text-[18px] font-semibold text-white/70"><span className="truncate">{accountName}</span><ChevronDown className="h-4 w-4 shrink-0" /></button>
          <h1 className="mt-2 overflow-hidden text-[48px] font-semibold leading-none tracking-[-0.065em] text-white">{formatMoney(displayTotal)}</h1>
          <div className={`mt-3 flex items-center gap-2 text-[18px] font-semibold ${displayChangeValue < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}><span className="truncate">{formatSignedMoney(displayChangeValue)}</span><span className={`shrink-0 rounded-[.65rem] px-2 py-0.5 text-black ${displayChangeValue < 0 ? "bg-[#ff1744]" : "bg-[#00e676]"}`}>{displayChange >= 0 ? "+" : ""}{displayChange.toFixed(2)}%</span></div>

          <button type="button" onClick={onCash} className="mt-8 flex h-[72px] w-full items-center justify-between rounded-[1.55rem] border border-white/[0.035] bg-[#191919] px-6 text-left transition hover:bg-[#232323] active:scale-[.99]"><span className="flex items-center gap-4 text-[20px] font-semibold"><Banknote className="h-6 w-6 text-white/50" />Cash</span><span className="shrink-0 text-[20px]">{profile.showCash && cashVisible ? formatMoney(profile.cash) : "••••"}</span></button>

          <WatchlistPromo onBrowse={() => onNotify("Opening the HyperEVM watchlist preview.")} />

          <SectionHeading>Token</SectionHeading>
          <div className="mt-4 space-y-2.5">
            {filteredTokens.map((token) => <TokenRow key={token.id} token={token} onClick={() => onToken(token)} />)}
            {filteredTokens.length === 0 ? <div className="rounded-[1.5rem] bg-[#19191b] px-5 py-7 text-center text-white/55">No tokens match your search.</div> : null}
          </div>
          {showingReference ? <><PerpsSection tokens={tokens} onNotify={onNotify} /><PredictionsStrip onNotify={onNotify} /><DiscoverySections onNotify={onNotify} /></> : null}
        </section>
      ) : tab === "Trade" ? <TradeView tokens={tokens} onToken={onToken} onNotify={onNotify} /> : tab === "Predictions" ? <PredictionsView onNotify={onNotify} /> : <ExploreView onNotify={onNotify} />}

      <div className="fixed bottom-0 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 border-t border-white/[0.035] bg-black/80 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-2xl" style={{ width: "min(100vw, 560px)" }}>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/[0.035] bg-[#202022] px-4 py-3 text-[16px] font-medium text-white/40"><Search className="h-5 w-5 shrink-0" /><input value={tokenQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search Download Now Wallet" aria-label="Search tokens" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/35" /></label>
        <button type="button" onClick={onActions} aria-label={actionsOpen ? "Close wallet actions" : "Open wallet actions"} className={`grid h-14 w-14 shrink-0 place-items-center rounded-full shadow-[0_6px_30px_rgba(0,0,0,.5)] transition hover:scale-105 active:scale-95 ${actionsOpen ? "bg-[#202022] text-white" : "bg-[#a295f3] text-black"}`}>{actionsOpen ? <X className="h-7 w-7" /> : <Plus className="h-8 w-8" />}</button>
      </div>
    </>
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
      <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss watchlist card" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-[#202022] text-white/65"><X className="h-5 w-5" /></button>
      <div className="relative z-10 max-w-[63%]">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-[#a99bf7]">Watchlist</p>
        <h2 className="mt-3 text-[24px] font-semibold leading-[1.08] tracking-[-.04em]">What&apos;s moving on HyperEVM?</h2>
        <button type="button" onClick={onBrowse} className="mt-5 flex items-center gap-1 text-base font-semibold text-[#a99bf7]">Browse <ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="absolute -bottom-3 -right-4 grid h-40 w-40 place-items-center rounded-[2.25rem] border border-[#6ff4d8]/15 bg-[#171a19] text-[#73f4db] shadow-[0_0_50px_rgba(115,244,219,.08)]">
        <span className="absolute inset-4 rounded-full border border-[#73f4db]/15" />
        <span className="absolute inset-8 rounded-full border border-[#73f4db]/25" />
        <Infinity className="h-20 w-20 stroke-[1.5]" />
      </div>
    </aside>
  );
}

function PredictionsStrip({ onNotify }: { onNotify: (message: string) => void }) {
  const predictions = [
    { title: "BTC Up or Down · 5m", time: "Live now", live: true },
    { title: "ETH above $4K?", time: "Closes in 2h", live: false },
  ];
  return (
    <section>
      <SectionHeading action={() => onNotify("Predictions opened.")}>Predictions</SectionHeading>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {predictions.map((prediction) => (
          <button key={prediction.title} type="button" onClick={() => onNotify(`${prediction.title} is a simulated market.`)} className="min-h-40 min-w-[78%] rounded-[1.7rem] border border-white/[0.035] bg-[#191919] p-5 text-left transition hover:bg-[#222223] sm:min-w-[58%]">
            <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#f7931a] text-2xl font-bold text-white">₿</span>{prediction.live ? <span className="flex items-center gap-1 text-base font-bold text-[#ff1744]"><Radio className="h-4 w-4" /> Live</span> : null}</div>
            <p className="mt-7 truncate text-xl font-semibold">{prediction.title}</p>
            <p className="mt-1 text-base text-white/55">{prediction.time}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoverySections({ onNotify }: { onNotify: (message: string) => void }) {
  const explore = [
    { icon: Infinity, title: "Perps", description: "Go long or short on leading markets" },
    { icon: Sparkles, title: "Predictions", description: "Trade outcomes across crypto and culture" },
    { icon: TrendingUp, title: "Stocks", description: "Discover tokenized market opportunities" },
  ];
  return (
    <>
      <section>
        <SectionHeading action={() => onNotify("Watchlist opened.")}>Watchlist</SectionHeading>
        <button type="button" onClick={() => onNotify("Search for assets to add to your watchlist.")} className="mt-4 flex w-full items-center gap-4 rounded-[1.6rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left">
          <Heart className="h-7 w-7 text-[#a99bf7]" />
          <span className="min-w-0"><strong className="block truncate text-lg">Follow what matters</strong><span className="mt-1 block truncate text-base text-white/55">Find assets or live markets to track</span></span>
        </button>
      </section>
      <section>
        <SectionHeading>Explore</SectionHeading>
        <div className="mt-4 space-y-2.5">
          {explore.map(({ icon: Icon, title, description }) => <button key={title} type="button" onClick={() => onNotify(`${title} opened.`)} className="flex w-full items-center gap-4 rounded-[1.55rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left transition hover:bg-[#222223]"><Icon className="h-7 w-7 text-[#a99bf7]" /><span className="min-w-0"><strong className="block text-lg">{title}</strong><span className="mt-1 block truncate text-base text-white/55">{description}</span></span></button>)}
        </div>
      </section>
      <section className="pb-4">
        <SectionHeading>Support</SectionHeading>
        <button type="button" onClick={() => onNotify("FAQ opened.")} className="mt-5 flex w-full items-center justify-between py-3 text-left text-xl font-semibold">View FAQ <ChevronRight className="h-5 w-5 text-white/55" /></button>
        <button type="button" onClick={() => onNotify("Support chat opened.")} className="flex w-full items-center justify-between py-3 text-left text-xl font-semibold">Chat with us <ChevronRight className="h-5 w-5 text-white/55" /></button>
        <button type="button" onClick={() => onNotify("Disclosures opened.")} className="mt-3 flex items-center gap-2 py-3 text-left text-base text-white/35"><Info className="h-4 w-4" /> View disclosures</button>
      </section>
    </>
  );
}

function TradeView({ tokens, onToken, onNotify }: { tokens: WalletToken[]; onToken: (token: WalletToken) => void; onNotify: (message: string) => void }) {
  const [amount, setAmount] = useState("");
  const [activeMarket, setActiveMarket] = useState<"Tokens" | "Perps">("Tokens");
  const tradable = useMemo(() => [...tokens]
    .filter((token) => token.symbol !== "BFS")
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || walletTokenOrder.indexOf(a.symbol) - walletTokenOrder.indexOf(b.symbol)), [tokens]);
  const sol = tokens.find((token) => token.symbol === "SOL") ?? referenceSolanaToken;
  const amountValue = Number(amount) || 0;
  const receiveValue = sol.price > 0 ? amountValue * sol.price : 0;
  return (
    <section className="px-4 pb-48 pt-5">
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ icon: Trophy, label: "Blue Chips" }, { icon: BarChart3, label: "Top Volume" }, { icon: Gem, label: "DeFi" }].map(({ icon: Icon, label }) => <button key={label} type="button" onClick={() => onNotify(`${label} filter selected.`)} className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.04] bg-[#1c1c1e] px-4 py-3 text-base font-semibold"><Icon className="h-5 w-5 text-[#a99bf7]" />{label}</button>)}
      </div>
      <div className="relative mt-5">
        <div className="rounded-[1.8rem] border border-white/[0.035] bg-[#191919] p-6">
          <div className="flex items-center justify-between"><span className="text-lg font-semibold text-white/55">You pay</span><button type="button" aria-label="Trade settings" onClick={() => onNotify("Trade settings opened.")} className="grid h-10 w-10 place-items-center rounded-full bg-[#222224]"><SlidersHorizontal className="h-5 w-5" /></button></div>
          <div className="mt-8 flex items-center gap-3"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" aria-label="Amount of SOL to pay" className="min-w-0 flex-1 bg-transparent text-5xl font-semibold tracking-[-.06em] outline-none placeholder:text-white/25" /><button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-[#252527] px-3 py-2 text-xl font-semibold"><TokenIcon token={sol} size="small" /> SOL <ChevronDown className="h-4 w-4" /></button></div>
          <p className="mt-5 text-right text-base text-white/55">{formatAmount(sol.balance)} SOL available</p>
        </div>
        <button type="button" onClick={() => onNotify("Swap direction changed.")} aria-label="Swap trade direction" className="absolute left-1/2 top-1/2 z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-black bg-[#a295f3] text-black"><Repeat2 className="h-6 w-6 rotate-90" /></button>
        <div className="mt-2 rounded-[1.8rem] border border-white/[0.035] bg-[#191919] p-6">
          <span className="text-lg font-semibold text-white/55">You receive</span>
          <div className="mt-8 flex items-center gap-3"><span className="min-w-0 flex-1 text-5xl font-semibold tracking-[-.06em] text-white/30">{receiveValue ? receiveValue.toFixed(2) : "0"}</span><button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-[#252527] px-3 py-2 text-xl font-semibold"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#a295f3] text-black"><BadgeDollarSign className="h-5 w-5" /></span> Cash <ChevronDown className="h-4 w-4" /></button></div>
          <p className="mt-5 text-right text-base text-white/55">{formatMoney(receiveValue)}</p>
        </div>
      </div>
      <div className="mt-10 flex gap-6 border-b border-white/[0.06] text-[1.7rem] font-semibold tracking-[-.05em]">{(["Tokens", "Perps"] as const).map((market) => <button key={market} type="button" onClick={() => setActiveMarket(market)} className={`pb-3 ${activeMarket === market ? "border-b-2 border-white text-white" : "text-white/30"}`}>{market}</button>)}</div>
      <div className="mt-5 flex gap-2">{["Rank", "Solana", "24h"].map((filter) => <button key={filter} type="button" onClick={() => onNotify(`${filter} filter opened.`)} className="flex items-center gap-2 rounded-full bg-[#202022] px-4 py-2.5 text-base font-semibold text-white/70">{filter}<ChevronDown className="h-4 w-4" /></button>)}</div>
      <div className="mt-6 space-y-1">
        {activeMarket === "Tokens" ? tradable.map((token, index) => <button key={token.id} type="button" onClick={() => onToken(token)} className="flex w-full items-center gap-4 rounded-2xl px-1 py-3 text-left transition hover:bg-white/[0.035]"><span className="relative"><TokenIcon token={token} /><span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#f0c625] text-[10px] font-bold text-black">{index + 1}</span></span><span className="min-w-0 flex-1"><strong className="block truncate text-xl">{token.symbol}</strong><span className="mt-1 block text-base text-white/55">{formatCompactMoney(token.marketCap)} MC</span></span><span className="text-right"><span className="block text-lg">{formatPrice(token.price)}</span><span className={`mt-1 block text-lg font-semibold ${token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></span></button>) : <PerpsMarketList tokens={tradable} onNotify={onNotify} />}
      </div>
    </section>
  );
}

function PerpsMarketList({ tokens, onNotify }: { tokens: WalletToken[]; onNotify: (message: string) => void }) {
  return <>{tokens.slice(0, 5).map((token) => <button key={token.id} type="button" onClick={() => onNotify(`${token.symbol} perpetual market opened.`)} className="flex w-full items-center gap-4 rounded-2xl px-1 py-3 text-left transition hover:bg-white/[0.035]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block text-xl">{token.symbol}-PERP</strong><span className="text-base text-white/50">Up to 20x leverage</span></span><span className={token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</span></button>)}</>;
}

function PredictionsView({ onNotify }: { onNotify: (message: string) => void }) {
  const markets = [
    { title: "BTC Up or Down · 5m", meta: "Live · 1,284 traders", chance: "52% Up" },
    { title: "Will ETH close above $4,000?", meta: "Ends today · 842 traders", chance: "64% Yes" },
    { title: "Solana above $200 this week?", meta: "Ends Friday · 506 traders", chance: "39% Yes" },
  ];
  return <section className="px-4 pb-48 pt-7"><div className="flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-[.12em] text-[#a99bf7]">Live markets</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.06em]">Predictions</h1></div><Radio className="h-7 w-7 text-[#ff1744]" /></div><p className="mt-4 max-w-md text-lg leading-7 text-white/55">Follow fast-moving simulated markets across crypto, finance, and culture.</p><div className="mt-8 space-y-3">{markets.map((market, index) => <button key={market.title} type="button" onClick={() => onNotify(`${market.title} opened.`)} className="w-full rounded-[1.7rem] border border-white/[0.04] bg-[#191919] p-5 text-left transition hover:bg-[#232323]"><div className="flex items-start justify-between"><span className={`grid h-12 w-12 place-items-center rounded-full ${index === 0 ? "bg-[#f7931a]" : index === 1 ? "bg-[#e9e9ec] text-black" : "bg-black"} text-xl font-bold`}>{index === 0 ? "₿" : index === 1 ? "◆" : "≋"}</span><span className="rounded-full bg-[#28252f] px-3 py-2 text-sm font-bold text-[#b5a7ff]">{market.chance}</span></div><h2 className="mt-6 text-xl font-semibold">{market.title}</h2><p className="mt-2 text-base text-white/50">{market.meta}</p></button>)}</div></section>;
}

function ExploreView({ onNotify }: { onNotify: (message: string) => void }) {
  const features = [
    { icon: Infinity, title: "Perpetuals", detail: "Long or short hundreds of markets" },
    { icon: Sparkles, title: "Predictions", detail: "Trade outcomes in live markets" },
    { icon: LineChart, title: "Stocks", detail: "Explore tokenized equities" },
    { icon: Headphones, title: "Live support", detail: "Get help from the wallet team" },
  ];
  return <section className="px-4 pb-48 pt-7"><p className="text-sm font-bold uppercase tracking-[.12em] text-[#a99bf7]">Discover</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.06em]">Explore everything</h1><div className="mt-8 space-y-3">{features.map(({ icon: Icon, title, detail }) => <button key={title} type="button" onClick={() => onNotify(`${title} opened.`)} className="flex w-full items-center gap-5 rounded-[1.7rem] border border-white/[0.04] bg-[#191919] px-5 py-5 text-left transition hover:bg-[#232323]"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#292633] text-[#a99bf7]"><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-xl">{title}</strong><span className="mt-1 block truncate text-base text-white/50">{detail}</span></span><ChevronRight className="h-5 w-5 text-white/35" /></button>)}</div><div className="mt-10 rounded-[1.8rem] bg-[linear-gradient(145deg,#24202f,#151518)] p-6"><h2 className="text-2xl font-semibold">Need a hand?</h2><p className="mt-2 text-base leading-6 text-white/55">Browse common questions or start a conversation with support.</p><button type="button" onClick={() => onNotify("Help & Support opened.")} className="mt-6 rounded-full bg-[#a295f3] px-5 py-3 font-semibold text-black">Help & Support</button></div></section>;
}

function PerpsSection({ tokens, onNotify }: { tokens: WalletToken[]; onNotify: (message: string) => void }) {
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
      <div className="flex items-center gap-2"><h2 className="text-[clamp(1.75rem,8vw,2.3rem)] font-semibold tracking-[-.05em]">Perps</h2><ChevronRight className="h-7 w-7 text-white/65" /></div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map(({ token, leverage }) => (
          <button key={token.symbol} type="button" onClick={() => onNotify(`${token.symbol} perpetuals are available in simulation mode.`)} className="flex min-h-[clamp(10rem,43vw,13rem)] min-w-[clamp(10rem,44vw,13.25rem)] shrink-0 flex-col items-start justify-between rounded-[1.65rem] bg-[#191919] p-5 text-left transition hover:bg-[#232323]">
            <TokenIcon token={token} size="large" />
            <div className="flex items-center gap-2 text-[clamp(1.2rem,5.5vw,1.55rem)] font-semibold"><span>{token.symbol}</span><span className="rounded-lg bg-[#242426] px-2 py-1 text-[clamp(.85rem,4vw,1.05rem)]">{leverage}</span></div>
            <strong className={`text-[clamp(1.35rem,6vw,1.8rem)] ${token.change24h < 0 ? "text-[#ff1744]" : "text-[#00e676]"}`}>{token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function TokenRow({ token, onClick }: { token: WalletToken; onClick: () => void }) {
  const value = token.balance * token.price;
  const changeValue = value * (token.change24h / 100);
  const changeLabel = token.symbol === "BFS" ? "+<$0.01" : value === 0 ? formatMoney(0) : formatSignedMoney(changeValue);
  const changeClass = token.change24h < 0 ? "text-[#f21b3f]" : value === 0 ? "text-white/55" : "text-[#00e676]";

  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-[1.45rem] bg-[#191919] px-4 py-2 text-left transition hover:bg-[#232323]">
      <TokenIcon token={token} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[20px] font-semibold">{token.name}</span><span className="mt-0.5 block truncate text-[17px] text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span>
      <span className="max-w-[36%] shrink-0 text-right"><span className="block truncate text-[20px] font-medium">{formatMoney(value)}</span><span className={`mt-0.5 block truncate text-[18px] font-semibold ${changeClass}`}>{changeLabel}</span></span>
    </button>
  );
}

function ActionMenu({ onAction }: { onAction: (action: Action) => void }) {
  const items: { label: Action; icon: LucideIcon }[] = [
    { label: "Send", icon: Send },
    { label: "Receive", icon: QrCode },
    { label: "Add Cash", icon: BadgeDollarSign },
    { label: "Trade", icon: Shuffle },
  ];
  return <><div className="fixed inset-0 z-30 bg-black/45 backdrop-blur-xl" aria-hidden="true" /><div className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] left-1/2 z-30 flex -translate-x-1/2 flex-col items-end gap-3 bg-transparent" style={{ width: "min(calc(100vw - 32px), 528px)" }}>{items.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => onAction(label)} className="flex items-center gap-3 text-[clamp(1rem,5vw,1.3rem)] font-semibold drop-shadow-lg transition hover:translate-x-[-3px]"><span>{label}</span><span className="grid h-[clamp(3.25rem,15vw,4rem)] w-[clamp(3.25rem,15vw,4rem)] place-items-center rounded-full bg-[#a295f3] text-black shadow-xl"><Icon className="h-[clamp(1.35rem,7vw,1.75rem)] w-[clamp(1.35rem,7vw,1.75rem)]" /></span></button>)}</div></>;
}

function ProfileScreen({ profile, tokens, onBack, onSave, onAddToken, onEditToken, onDeleteToken }: { profile: ProfileRecord; tokens: WalletToken[]; onBack: () => void; onSave: (profile: ProfileRecord, balances: Record<string, number>) => void; onAddToken: () => void; onEditToken: (token: WalletToken) => void; onDeleteToken: (token: WalletToken) => void }) {
  const [draft, setDraft] = useState(profile);
  const [balances, setBalances] = useState<Record<string, string>>(() => Object.fromEntries(tokens.map((token) => [token.id, String(token.balance)])));

  const update = <K extends keyof ProfileRecord>(field: K, value: ProfileRecord[K]) => setDraft((current) => ({ ...current, [field]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(draft, Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, Number(value) || 0])));
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

        <ProfileSection title="Token Holdings"><div className="overflow-hidden rounded-[1.5rem] bg-[#1d1d1f]">{sortTokens(tokens).map((token) => <div key={token.id} className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0"><TokenIcon token={token} size="small" /><span className="min-w-0 flex-1 text-[18px]">{token.name}</span><input type="number" min="0" step="any" value={balances[token.id] ?? "0"} onChange={(event) => setBalances((current) => ({ ...current, [token.id]: event.target.value }))} className="w-28 rounded-2xl bg-[#29292b] px-4 py-3 text-right text-[18px] text-white outline-none" /><button type="button" onClick={() => onEditToken(token)} aria-label={`Edit ${token.name}`} className="rounded-full p-2 text-white/45 hover:text-[#a295f3]"><Pencil className="h-5 w-5" /></button><button type="button" onClick={() => onDeleteToken(token)} aria-label={`Delete ${token.name}`} className="rounded-full p-2 text-white/45 hover:text-[#f21b3f]"><X className="h-5 w-5" /></button></div>)}<button type="button" onClick={onAddToken} className="flex w-full items-center justify-center gap-2 border-t border-white/[0.06] px-5 py-5 text-[17px] text-[#a295f3]"><Plus className="h-5 w-5" /> Add token</button></div></ProfileSection>

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
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black px-4 pb-28"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center justify-between"><div className="flex items-center gap-5"><button type="button" onClick={onBack} aria-label="Go back" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><ArrowLeft className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">{token.symbol}</h1></div><button type="button" onClick={onNext} disabled={!recipient.trim()} className="text-[22px] text-[#a295f3] disabled:text-white/25">Next</button></div><div className="mt-16 flex items-center gap-3 border-b border-white/[0.12] pb-4"><input autoFocus value={recipient} onChange={(event) => onRecipient(event.target.value)} placeholder="To: username or address" className="min-w-0 flex-1 bg-transparent text-[22px] text-white outline-none placeholder:text-white/55" /><button type="button" aria-label="Scan address" className="text-white/80"><QrCode className="h-7 w-7" /></button></div><h2 className="mt-14 flex items-center gap-3 text-[22px] font-medium text-white/65"><Clock3 className="h-6 w-6" /> Recently Used</h2><div className="mt-5 space-y-5">{recent.map((name, index) => <button key={name} type="button" onClick={() => onRecipient(name)} className="flex items-center gap-6 text-left"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#242426] text-[18px] text-white/80">{index === 0 ? "●" : index === 1 ? "M" : "T"}</span><span><span className="block text-[22px]">{name}</span><span className="mt-1 block text-[17px] text-white/55">Used {index === 0 ? "4d" : index === 1 ? "12d" : "14d"} ago</span></span></button>)}</div><h2 className="mt-14 flex items-center gap-3 text-[22px] font-medium text-white/65"><WalletCards className="h-6 w-6" /> Address Book</h2><div className="mt-5 space-y-5">{addresses.map((name) => <button key={name} type="button" onClick={() => onRecipient(`${name} · wDwe...mE6c`)} className="flex items-center gap-6 text-left"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#242426] text-[17px] text-white">{name.slice(0, 2).toUpperCase()}</span><span><span className="block text-[22px]">{name}</span><span className="mt-1 block font-mono text-[17px] text-white/55">wDwe...mE6c</span></span></button>)}</div><button type="button" onClick={onNext} disabled={!recipient.trim()} className="mt-16 w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black disabled:bg-[#403967] disabled:text-white/35">Next</button></div>;
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
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close receive" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Receive</h1></div><div className="flex flex-1 flex-col items-center justify-center"><div className="grid h-64 w-64 place-items-center rounded-3xl bg-white p-5"><QrCode className="h-full w-full text-black" /></div><p className="mt-10 text-center text-[20px] text-white/65">Your simulated wallet address</p><button type="button" onClick={() => navigator.clipboard?.writeText(profile.address)} className="mt-4 flex items-center gap-3 rounded-full bg-[#1d1d1f] px-6 py-4 font-mono text-[17px]"><span>{shortAddress(profile.address)}</span><Copy className="h-5 w-5 text-[#a295f3]" /></button></div><button type="button" onClick={onClose} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">Done</button></div>;
}

function AddCashScreen({ balance, onClose, onAdd }: { balance: number; onClose: () => void; onAdd: (amount: number) => void }) {
  const [amount, setAmount] = useState("");
  const numericAmount = Number(amount) || 0;
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close add cash" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Add Cash</h1></div><div className="flex flex-1 flex-col items-center justify-center"><span className="grid h-20 w-20 place-items-center rounded-full bg-[#a295f3] text-black"><BadgeDollarSign className="h-10 w-10" /></span><p className="mt-8 text-base text-white/50">Current balance · {formatMoney(balance)}</p><label className="mt-5 flex items-center justify-center text-[72px] font-semibold tracking-[-.08em]"><span className="text-white/55">$</span><input autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" aria-label="Cash amount" className="w-[240px] bg-transparent outline-none placeholder:text-white/25" /></label><div className="mt-8 flex gap-2">{[25, 50, 100].map((value) => <button key={value} type="button" onClick={() => setAmount(String(value))} className="rounded-full bg-[#202022] px-5 py-3 text-lg">${value}</button>)}</div></div><button type="button" onClick={() => onAdd(numericAmount)} disabled={numericAmount <= 0} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-semibold text-black disabled:bg-[#403967] disabled:text-white/35">Add {numericAmount > 0 ? formatMoney(numericAmount) : "Cash"}</button></div>;
}

function BuyScreen({ token, onClose, onBuy }: { token: WalletToken; onClose: () => void; onBuy: (amount: number) => void }) {
  const [amount, setAmount] = useState("1");
  const quantity = Number(amount) || 0;
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close buy" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Buy {token.symbol}</h1></div><div className="flex flex-1 flex-col items-center justify-center"><TokenIcon token={token} size="large" /><p className="mt-8 text-[60px] font-medium tracking-[-0.08em]">{formatAmount(quantity)} {token.symbol}</p><p className="mt-3 text-[28px] text-white/55">~{formatMoney(quantity * token.price)}</p><label className="mt-12 w-full rounded-2xl bg-[#1d1d1f] px-5 py-4"><span className="block text-sm text-white/50">Amount to buy</span><input autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full bg-transparent text-[22px] outline-none" /></label></div><button type="button" onClick={() => onBuy(quantity)} disabled={quantity <= 0} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black disabled:bg-[#403967] disabled:text-white/35">Buy {token.symbol}</button></div>;
}

function HistoryScreen({ records, onBack, onRecord }: { records: WalletActivity[]; onBack: () => void; onRecord: (record: WalletActivity) => void }) {
  return <div className="absolute inset-0 z-40 overflow-y-auto bg-black px-4 pb-20"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center justify-between"><button type="button" onClick={onBack} aria-label="Close history" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">History</h1><button type="button" onClick={() => undefined} aria-label="More history options" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><MoreHorizontal className="h-7 w-7" /></button></div>{records.length === 0 ? <p className="mt-40 text-center text-[20px] text-white/55">No recent activity</p> : <div className="mt-12 space-y-3">{records.map((record) => <button key={record.id} type="button" onClick={() => onRecord(record)} className="flex w-full items-center gap-5 rounded-[1.5rem] bg-[#19191b] px-5 py-5 text-left"><span className={`grid h-12 w-12 place-items-center rounded-full ${record.type === "send" ? "bg-[#f21b3f]" : "bg-[#20b486]"} text-black`}>{record.type === "send" ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownLeft className="h-6 w-6" />}</span><span className="min-w-0 flex-1"><span className="block text-[19px] capitalize">{record.type} {record.tokenSymbol}</span><span className="mt-1 block text-[15px] text-white/50">{shortAddress(record.counterpartyLabel)}</span></span><span className="text-right"><span className="block text-[18px]">{record.amount} {record.tokenSymbol}</span><span className="mt-1 block text-[14px] text-white/50">{new Date(record.date).toLocaleDateString()}</span></span></button>)}</div>}</div>;
}

function TransactionDetail({ record, onClose }: { record: WalletActivity; onClose: () => void }) {
  return <div className="absolute inset-0 z-40 flex flex-col bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+18px)]"><div className="mx-auto mt-3 h-1.5 w-20 rounded-full bg-[#363638]" /><div className="mt-14 flex items-center gap-5"><button type="button" onClick={onClose} aria-label="Close transaction" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><X className="h-7 w-7" /></button><h1 className="text-[25px] font-semibold">Sent</h1></div><div className="flex flex-1 flex-col items-center pt-20"><div className="grid h-28 w-28 place-items-center rounded-full bg-[#f5a623] text-black text-5xl">₿</div><p className="mt-8 text-[60px] font-medium tracking-[-0.08em]">-{record.amount} {record.tokenSymbol}</p><div className="mt-12 w-full overflow-hidden rounded-[1.7rem] bg-[#1d1d1f] text-[20px]"><SummaryRow label="Date" value={new Date(record.date).toLocaleString()} /><SummaryRow label="Status" value="Succeeded" /><SummaryRow label="To" value={shortAddress(record.counterpartyLabel)} /><SummaryRow label="Network" value={record.tokenSymbol === "SOL" ? "Solana" : "Bitcoin"} /><SummaryRow label="Network Fee" value={record.tokenSymbol === "SOL" ? "-0.00008 SOL" : "$0.005"} /></div></div><button type="button" onClick={onClose} className="w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">View on Explorer</button></div>;
}

function TokenDetail({ token, onBack, onSend, onReceive, onTrade }: { token: WalletToken; onBack: () => void; onSend: () => void; onReceive: () => void; onTrade: () => void }) {
  const [period, setPeriod] = useState("LIVE");
  const [favorite, setFavorite] = useState(false);
  const positive = token.change24h >= 0;
  const accent = positive ? "#00e676" : "#ff1744";
  const changeValue = token.price * (token.change24h / 100);
  const positivePoints = "0,142 18,151 35,126 51,139 65,118 79,127 94,105 110,119 127,98 142,108 156,87 172,96 187,78 204,92 220,68 237,76 254,56 271,66 288,42 305,51 324,25 344,38 364,14 384,31 404,10";
  const negativePoints = "0,70 42,70 84,69 126,67 168,68 210,66 252,67 270,64 278,150 292,132 334,132 366,137 404,134";
  const candles = [
    { x: 6, y: 77, h: 42, up: false }, { x: 22, y: 87, h: 55, up: true }, { x: 38, y: 70, h: 29, up: true }, { x: 54, y: 64, h: 35, up: false },
    { x: 70, y: 75, h: 25, up: false }, { x: 86, y: 83, h: 24, up: false }, { x: 102, y: 96, h: 45, up: false }, { x: 118, y: 111, h: 30, up: true },
    { x: 134, y: 105, h: 24, up: true }, { x: 150, y: 98, h: 22, up: true }, { x: 166, y: 93, h: 16, up: false }, { x: 182, y: 101, h: 37, up: false },
    { x: 198, y: 114, h: 24, up: true }, { x: 214, y: 91, h: 40, up: true }, { x: 230, y: 82, h: 32, up: false }, { x: 246, y: 96, h: 39, up: false },
    { x: 262, y: 111, h: 25, up: true }, { x: 278, y: 91, h: 30, up: true }, { x: 294, y: 76, h: 28, up: true }, { x: 310, y: 70, h: 28, up: false },
    { x: 326, y: 59, h: 35, up: true }, { x: 342, y: 38, h: 48, up: true }, { x: 358, y: 19, h: 48, up: true }, { x: 374, y: 28, h: 43, up: false },
  ];
  return <div className="absolute inset-0 z-40 flex min-h-full flex-col overflow-y-auto bg-black pb-0">
    <div className="sticky top-0 z-20 border-b border-white/[0.025] bg-black/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-2xl">
      <button type="button" onClick={onBack} aria-label="Go back" className="mx-auto block h-1.5 w-20 rounded-full bg-white/45" />
      <div className="mt-5 flex items-center justify-between"><button type="button" onClick={onBack} aria-label="Back to wallet"><TokenIcon token={token} /></button><div className="flex gap-2"><button type="button" onClick={() => setFavorite((value) => !value)} aria-label={favorite ? "Remove from favorites" : "Add to favorites"} className="grid h-12 w-12 place-items-center rounded-full bg-[#1d1d1f]"><Heart className={`h-6 w-6 ${favorite ? "fill-[#a295f3] text-[#a295f3]" : "text-white"}`} /></button><button type="button" aria-label="More asset options" className="grid h-12 w-12 place-items-center rounded-full bg-[#1d1d1f]"><MoreHorizontal className="h-6 w-6" /></button></div></div>
    </div>
    <div className="px-5 pt-3">
      <h1 className="text-[clamp(2.4rem,12vw,4rem)] font-semibold leading-none tracking-[-.065em]">{token.name}</h1>
      <p className="mt-4 text-[clamp(3rem,15vw,5.2rem)] font-semibold leading-none tracking-[-.075em]">{formatPrice(token.price)}</p>
      <p className="mt-3 text-[clamp(1.1rem,5vw,1.45rem)] font-bold" style={{ color: accent }}>{formatSignedMoney(changeValue)} ({token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(2)}%)</p>
    </div>
    <div className="mt-8">
      <svg viewBox="0 0 410 180" className="h-[265px] w-full" preserveAspectRatio="none" role="img" aria-label={`${token.symbol} simulated ${token.symbol === "BTC" ? "candlestick" : "line"} chart`}>
        {[40, 90, 140].map((y) => <line key={y} x1="0" x2="410" y1={y} y2={y} stroke="rgba(255,255,255,.06)" />)}
        {token.symbol === "BTC" ? candles.map((candle) => { const color = candle.up ? "#00e676" : "#ff1744"; return <g key={candle.x}><line x1={candle.x + 5} x2={candle.x + 5} y1={candle.y - 9} y2={candle.y + candle.h + 9} stroke={color} strokeWidth="2" /><rect x={candle.x} y={candle.y} width="10" height={candle.h} rx="2" fill={color} /></g>; }) : <><polyline points={positive ? positivePoints : negativePoints} fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="404" cy={positive ? 10 : 134} r="5" fill={accent} /></>}
      </svg>
      <div className="flex items-center justify-between px-5 text-sm font-semibold text-white/55">{["LIVE", "1D", "1W", "1M", "1Y", "ALL"].map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-full px-3 py-2 transition ${period === item ? "bg-white text-black" : "hover:text-white"}`}>{item === "ALL" ? "All" : item}</button>)}<SlidersHorizontal className="h-5 w-5" /></div>
    </div>
    <div className="px-5 pb-28">
      {token.balance > 0 ? <section className="mt-12"><SectionHeading>Your positions</SectionHeading><button type="button" onClick={onSend} className="mt-5 flex w-full items-center gap-4 rounded-[1.5rem] bg-[#121213] py-3 text-left"><TokenIcon token={token} /><span className="min-w-0 flex-1"><strong className="block text-xl">{token.symbol} <span className="font-normal text-white/55">{token.symbol === "BFS" ? "Solana" : token.name}</span></strong><span className="mt-1 block text-base text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span><span className="text-right"><span className="block text-lg">{formatMoney(token.price * token.balance)}</span><span className={`mt-1 block font-semibold ${positive ? "text-[#00e676]" : "text-[#ff1744]"}`}>{formatSignedMoney(token.price * token.balance * token.change24h / 100)}</span></span><ChevronRight className="h-5 w-5 text-white/55" /></button><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={onSend} className="flex items-center justify-center gap-2 rounded-full bg-[#202022] px-4 py-3.5 font-semibold"><Send className="h-4 w-4" /> Send</button><button type="button" onClick={onReceive} className="flex items-center justify-center gap-2 rounded-full bg-[#202022] px-4 py-3.5 font-semibold"><QrCode className="h-4 w-4" /> Receive</button></div></section> : null}
      <section className="mt-11"><div className="flex items-center justify-between"><SectionHeading>Live Chat</SectionHeading><span className="mt-10 flex items-center gap-2 text-lg text-[#00e676]"><span className="h-2.5 w-2.5 rounded-full bg-[#00e676]" /> {token.symbol === "BTC" ? "99" : "12"} here</span></div><button type="button" className="mt-5 flex w-full items-center gap-4 rounded-[1.6rem] border border-white/[0.035] bg-[#191919] px-5 py-5 text-left"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#292633] text-[#a99bf7]"><MessageCircle className="h-5 w-5" /></span><span className="truncate text-lg"><strong>@marketwatch</strong> {positive ? "momentum is picking up" : "watching this level closely"}</span></button></section>
      <p className="mt-10 text-base leading-7 text-white/55">Market activity is displayed for simulation and interface-preview purposes. Prices may update from the connected market-data source.</p>
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
  return <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/75 px-3 pb-3 backdrop-blur-sm sm:items-center"><section className="max-h-[92svh] w-full max-w-[510px] overflow-y-auto rounded-[2rem] bg-[#1d1d1f] p-6" aria-label={token ? `Edit ${token.name}` : "Add token"}><div className="flex items-center justify-between"><div><h2 className="text-[22px] font-semibold">{token ? `Edit ${token.name}` : "Add Token"}</h2><p className="mt-1 text-sm text-white/45">Simulation-only wallet data.</p></div><button type="button" onClick={onClose} aria-label="Close token editor"><X className="h-6 w-6" /></button></div><form onSubmit={submit} className="mt-7 space-y-3">{(["name", "symbol", "price", "balance", "change24h", "image"] as (keyof TokenForm)[]).map((field) => <label key={field} className="block rounded-2xl bg-[#29292b] px-4 py-3 text-sm text-white/55"><span>{field === "change24h" ? "24h %" : field === "image" ? "Image URL" : field[0].toUpperCase() + field.slice(1)}</span><input type={field === "price" || field === "balance" || field === "change24h" ? "number" : field === "image" ? "url" : "text"} inputMode={field === "price" || field === "balance" || field === "change24h" ? "decimal" : undefined} value={form[field] ?? ""} onChange={(event) => update(field, event.target.value)} className="mt-1 block w-full bg-transparent text-[17px] text-white outline-none" /></label>)}{error ? <p className="rounded-xl bg-[#f21b3f]/15 px-4 py-3 text-sm text-[#ff91a2]">{error}</p> : null}<div className="flex gap-3 pt-3"><button type="button" onClick={onClose} className="flex-1 rounded-full bg-[#29292b] px-4 py-4 text-[17px] text-white/70">Cancel</button><button type="submit" className="flex-1 rounded-full bg-[#a295f3] px-4 py-4 text-[17px] font-medium text-black">Save Token</button></div></form></section></div>;
}

export function DownloadWallet() {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [profile, setProfile] = useState<ProfileRecord>(defaultProfile);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [view, setView] = useState<View>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [tokenEditorOpen, setTokenEditorOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<WalletToken | null>(null);
  const [flow, setFlow] = useState<TokenFlow>("send");
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [sendAmount, setSendAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sentRecord, setSentRecord] = useState<WalletActivity | null>(null);
  const [records, setRecords] = useState<WalletActivity[]>([]);
  const [tokenQuery, setTokenQuery] = useState("");
  const [cashVisible, setCashVisible] = useState(true);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const [toast, setToast] = useState("");
  const latestMarketSnapshot = useRef<LiveMarketSnapshot>({ prices: {}, changes: {}, images: {}, marketCaps: {} });

  const liveSymbols = liveMarketSymbols;

  useLivePrices(liveSymbols, (prices, changes, images, marketCaps) => {
    const snapshot = { prices, changes, images, marketCaps };
    latestMarketSnapshot.current = snapshot;
    setTokens((current) => applyLiveMarketSnapshot(current, snapshot));
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const loadedTokens = mergeLiveTokenCatalogue(migrateLegacyReferenceHoldings(getTokens()));
      setTokens(applyLiveMarketSnapshot(loadedTokens, latestMarketSnapshot.current));
      setProfile(readStorage(profileStorageKey, defaultProfile));
      setRecords(getTransactions().filter((record) => !["act_001", "act_002", "act_003"].includes(record.id)));
      if (!window.localStorage.getItem(notificationStorageKey)) setNotificationPromptOpen(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };


  const resetSend = () => { setSelectedToken(null); setSendAmount(""); setRecipient(""); };

  const openAction = (action: Action) => {
    setActionsOpen(false);
    if (action === "Send") { setFlow("send"); setView("token-picker"); return; }
    if (action === "Receive") { setView("receive"); return; }
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
      setView("home");
    notify("Profile saved in simulation.");
  };

  const saveEditedToken = (form: TokenForm) => {
    const saved = saveToken({ id: form.id, name: form.name, symbol: form.symbol, price: Number(form.price), balance: Number(form.balance), change24h: Number(form.change24h), image: form.image.trim() || "https://placehold.co/64x64/1d1d1f/ffffff?text=T" });
    setTokens((current) => { const next = [...current]; const index = next.findIndex((token) => token.id === saved.id); if (index >= 0) next[index] = saved; else next.push(saved); return next; });
    setEditingToken(null);
    setTokenEditorOpen(false);
    notify(`${saved.name} saved to your simulated wallet.`);
  };

  const removeToken = (token: WalletToken) => {
    setTokens(deleteToken(token.id));
    notify(`${token.name} deleted from your simulated wallet.`);
  };

  const buyToken = (amount: number) => {
    if (!selectedToken || amount <= 0) return;
    const saved = saveToken({ ...selectedToken, balance: selectedToken.balance + amount });
    setTokens((current) => current.map((token) => token.id === saved.id ? saved : token));
    setSelectedToken(saved);
    setView("home");
    notify(`${formatAmount(amount)} ${saved.symbol} added to your simulated wallet.`);
  };

  const addCash = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextProfile = { ...profile, cash: profile.cash + amount };
    writeStorage(profileStorageKey, nextProfile);
    setProfile(nextProfile);
    setView("home");
    notify(`${formatMoney(amount)} added to your simulated cash balance.`);
  };

  const completeSend = () => {
    if (!selectedToken) return;
    const amount = Number(sendAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedToken.balance) return;
    const savedToken = saveToken({ ...selectedToken, balance: selectedToken.balance - amount });
    const record = createTransaction({ type: "send", tokenSymbol: selectedToken.symbol, amount, counterpartyLabel: recipient || "Demo recipient", date: new Date().toISOString(), status: "completed", recipientId: recipient });
    setTokens((current) => current.map((token) => token.id === savedToken.id ? savedToken : token));
    setRecords((current) => [record, ...current]);
    setSentRecord(record);
    setView("sent");
  };

  const currentToken = selectedToken;

  return (
    <main className="download-wallet-app fixed inset-0 z-0 overflow-hidden bg-[#080809] font-sans text-white sm:bg-[radial-gradient(circle_at_50%_10%,#211d34_0%,#080809_46%)]">
      <div className="relative mx-auto h-full w-full max-w-[560px] overflow-hidden bg-black shadow-2xl shadow-black/70 sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-[2.5rem] sm:border sm:border-white/[0.07]">
        <div className="relative h-full overflow-y-auto overscroll-contain">
{view === "home" ? <HomeView tokens={tokens} profile={profile} tab={activeTab} cashVisible={cashVisible} tokenQuery={tokenQuery} actionsOpen={actionsOpen} onTab={setActiveTab} onMenu={() => setDrawerOpen(true)} onCash={() => setCashVisible((value) => !value)} onSearch={setTokenQuery} onActions={() => setActionsOpen((value) => !value)} onToken={(token) => { setSelectedToken(token); setView("token-detail"); }} onNotify={notify} /> : null}
          {view === "profile" ? <ProfileScreen profile={profile} tokens={tokens} onBack={() => setView("home")} onSave={saveProfile} onAddToken={() => { setEditingToken(null); setTokenEditorOpen(true); }} onEditToken={(token) => { setEditingToken(token); setTokenEditorOpen(true); }} onDeleteToken={removeToken} /> : null}
          {view === "history" ? <HistoryScreen records={records} onBack={() => setView("home")} onRecord={(record) => { setSentRecord(record); setView("sent-detail"); }} /> : null}
          {view === "token-picker" ? <TokenPicker tokens={tokens} flow={flow} onClose={() => { resetSend(); setView("home"); }} onSelect={pickToken} /> : null}
          {view === "send-recipient" && currentToken ? <SendRecipientScreen token={currentToken} recipient={recipient} onRecipient={setRecipient} onBack={() => setView("token-picker")} onNext={() => setView("send-amount")} /> : null}
          {view === "send-amount" && currentToken ? <SendAmountScreen token={currentToken} amount={sendAmount} onAmount={setSendAmount} onBack={() => setView("send-recipient")} onNext={() => setView("send-summary")} /> : null}
          {view === "send-summary" && currentToken ? <SummaryScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onBack={() => setView("send-amount")} onConfirm={() => setView("sending")} /> : null}
          {view === "sending" && currentToken ? <SendingScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onComplete={completeSend} /> : null}
          {view === "sent" && currentToken && sentRecord ? <SentScreen token={currentToken} amount={sentRecord.amount} recipient={sentRecord.counterpartyLabel} onClose={() => { resetSend(); setView("home"); }} onHistory={() => setView("history")} /> : null}
          {view === "receive" ? <ReceiveScreen profile={profile} onClose={() => setView("home")} /> : null}
          {view === "add-cash" ? <AddCashScreen balance={profile.cash} onClose={() => setView("home")} onAdd={addCash} /> : null}
          {view === "buy" && currentToken ? <BuyScreen token={currentToken} onClose={() => { resetSend(); setView("home"); }} onBuy={buyToken} /> : null}
          {view === "token-detail" && currentToken ? <TokenDetail token={currentToken} onBack={() => { setSelectedToken(null); setView("home"); }} onSend={() => { setFlow("send"); setView("send-recipient"); }} onReceive={() => setView("receive")} onTrade={() => { setSelectedToken(null); setView("home"); setActiveTab("Trade"); }} /> : null}
          {view === "sent-detail" && sentRecord ? <TransactionDetail record={sentRecord} onClose={() => setView("history")} /> : null}
          {actionsOpen && view === "home" ? <ActionMenu onAction={openAction} /> : null}
          {drawerOpen ? <SideDrawer profile={profile} onClose={() => setDrawerOpen(false)} onProfile={() => { setDrawerOpen(false); setView("profile"); }} onHistory={() => { setDrawerOpen(false); setView("history"); }} onSettings={() => { setDrawerOpen(false); setView("profile"); }} onNotice={notify} /> : null}
          {tokenEditorOpen ? <TokenEditor token={editingToken} onClose={() => { setEditingToken(null); setTokenEditorOpen(false); }} onSave={saveEditedToken} /> : null}
          {toast ? <div className="absolute bottom-28 left-1/2 z-[80] w-max max-w-[90%] -translate-x-1/2 rounded-full border border-white/[0.06] bg-[#29292b] px-5 py-3 text-center text-sm text-white/85 shadow-xl">{toast}</div> : null}
          {notificationPromptOpen ? <NotificationPrompt onClose={() => setNotificationPromptOpen(false)} /> : null}
        </div>
      </div>
      <style>{`.download-wallet-app div.absolute.inset-0.z-40 > div.mx-auto.mt-3.h-1\\.5.w-20 { margin-top: calc(env(safe-area-inset-top) + 12px); }`}</style>
    </main>
  );
}
