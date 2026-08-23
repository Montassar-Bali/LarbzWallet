"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Grid2X2,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  Shuffle,
  Sparkles,
  UserRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { WalletActivity, WalletToken } from "@/lib/types";
import {
  createTransaction,
  deleteToken,
  getTokens,
  getTransactions,
  saveToken,
} from "@/lib/wallet";
import { readStorage, writeStorage } from "@/lib/storage";

type Tab = "Home" | "Trade" | "Explore";
type Action = "Send" | "Receive" | "Buy" | "Trade";
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

const walletTokenOrder = ["USDT", "SOL", "ETH", "BTC", "SUI", "MATIC", "HYPE", "BNB"];

const tokenVisuals: Record<string, { background: string; mark: string; foreground?: string }> = {
  BTC: { background: "#f5a623", mark: "₿" },
  ETH: { background: "#f1f3f6", mark: "◆", foreground: "#252a35" },
  SOL: { background: "#050607", mark: "≡" },
  USDT: { background: "#20b486", mark: "₮" },
  USDC: { background: "#2775ca", mark: "$" },
  SUI: { background: "#4b98f5", mark: "S", foreground: "white" },
  MATIC: { background: "#8247e5", mark: "⬡", foreground: "white" },
  HYPE: { background: "#063b38", mark: "〰", foreground: "#63f4dc" },
  BNB: { background: "#f3ba2f", mark: "◆", foreground: "white" },
};

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

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function shortAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
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
  const dimensions = size === "small" ? "h-8 w-8 text-sm" : size === "large" ? "h-20 w-20 text-4xl" : "h-12 w-12 text-xl";

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold shadow-[inset_0_1px_2px_rgba(255,255,255,.35)] ${dimensions}`}
      style={{ background: visual.background, color: visual.foreground ?? "white" }}
    >
      <span className="relative z-0">{tokenMark(token)}</span>
      {token.image ? <Image src={token.image} alt="" fill unoptimized sizes="80px" className="z-10 object-contain p-[10%]" /> : null}
      {token.symbol === "USDT" ? <span className="absolute bottom-0 right-0 z-20 grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] text-black">▤</span> : null}
    </span>
  );
}

function LockAvatar({ value = "🔐", size = "normal" }: { value?: string; size?: "normal" | "large" }) {
  return <span className={`grid shrink-0 place-items-center rounded-full bg-[#242426] ${size === "large" ? "h-24 w-24 text-5xl" : "h-12 w-12 text-2xl"}`}>{value}</span>;
}

function WalletTabs({ activeTab, onChange, onMenu }: { activeTab: Tab; onChange: (tab: Tab) => void; onMenu: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onMenu} aria-label="Open wallet menu" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#252527] text-[25px] transition hover:bg-[#303033]">
        🔐
      </button>
      {(["Home", "Trade", "Explore"] as Tab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`rounded-full px-5 py-3 text-[15px] font-medium transition ${activeTab === tab ? "bg-[#a295f3] text-black" : "bg-[#252527] text-white/65 hover:bg-[#303033] hover:text-white"}`}
        >
          {tab}
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
    <div className="absolute inset-0 z-50 bg-black/60" role="presentation">
      <button type="button" onClick={onClose} aria-label="Close menu" className="absolute inset-0 cursor-default" />
      <aside className="relative flex h-full w-[min(78vw,350px)] flex-col bg-black px-8 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+36px)] shadow-[20px_0_60px_rgba(0,0,0,.5)]">
        <div>
          <LockAvatar value={profile.avatar} />
          <p className="mt-7 text-[25px] font-semibold tracking-[-0.04em]">@{profile.username}</p>
        </div>
        <div className="mt-10">
          <button type="button" onClick={onClose} className="flex items-center gap-4 py-3 text-left text-[16px] font-medium text-white/80"><WalletCards className="h-5 w-5" /> {profile.accountName} <ChevronDown className="h-4 w-4 text-white/50" /></button>
          {item(UserRound, "Profile", onProfile)}
          {item(Grid2X2, "Chats", () => onNotice("Chats are available in simulation mode."))}
          {item(Clock3, "History", onHistory)}
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
  total,
  totalChange,
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
  total: number;
  totalChange: number;
  onTab: (tab: Tab) => void;
  onMenu: () => void;
  onCash: () => void;
  onSearch: (value: string) => void;
  onActions: () => void;
  onToken: (token: WalletToken) => void;
  onNotify: (message: string) => void;
}) {
  const filteredTokens = useMemo(() => {
    const query = tokenQuery.trim().toLowerCase();
    const ordered = sortTokens(tokens);
    if (!query) return ordered;
    return ordered.filter((token) => token.name.toLowerCase().includes(query) || token.symbol.toLowerCase().includes(query));
  }, [tokenQuery, tokens]);

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+20px)]">
        <WalletTabs activeTab={tab} onChange={onTab} onMenu={onMenu} />
      </div>

      {tab === "Home" ? (
        <section className="px-4 pb-32 pt-11">
          <button type="button" onClick={() => onNotify("Account switching is available in simulation mode.")} className="flex items-center gap-2 text-[17px] text-white/70">{profile.accountName}<ChevronDown className="h-5 w-5" /></button>
          <h1 className="mt-2 text-[4.1rem] font-normal leading-none tracking-[-0.07em] text-white">{formatMoney(total)}</h1>
          <div className="mt-4 flex items-center gap-3 text-[15px] font-medium"><span className={totalChange >= 0 ? "text-[#e8e8ea]" : "text-[#f21b3f]"}>{formatMoney(total * (totalChange / 100))}</span><span className="rounded-xl bg-[#f21b3f] px-3 py-1.5 text-black">{totalChange.toFixed(2)}%</span></div>

          <button type="button" onClick={onCash} className="mt-9 flex w-full items-center justify-between rounded-[1.65rem] bg-[#19191b] px-7 py-6 text-left transition hover:bg-[#232326]"><span className="flex items-center gap-6 text-[20px]"><span className="text-[24px] text-white/70">▣</span>Cash</span><span className="text-[20px]">{profile.showCash && cashVisible ? formatMoney(profile.cash) : "••••"}</span></button>

          <div className="mt-12 flex items-center gap-2"><h2 className="text-[24px] font-medium tracking-[-0.04em]">Tokens</h2><ChevronRight className="h-7 w-7" /></div>
          <div className="mt-4 space-y-2.5">
            {filteredTokens.map((token) => <TokenRow key={token.id} token={token} onClick={() => onToken(token)} />)}
            {filteredTokens.length === 0 ? <div className="rounded-[1.5rem] bg-[#19191b] px-5 py-7 text-center text-white/55">No tokens match your search.</div> : null}
          </div>
        </section>
      ) : (
        <section className="px-4 pb-32 pt-12">
          <div className="rounded-[1.75rem] bg-[#19191b] p-7">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#a295f3] text-black">{tab === "Trade" ? <Shuffle className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}</div>
            <h1 className="mt-7 text-3xl font-semibold">{tab}</h1>
            <p className="mt-3 text-[17px] leading-7 text-white/55">Explore the simulated wallet market and preview actions without connecting a real account.</p>
            <button type="button" onClick={() => onNotify(`${tab} is available in simulation mode.`)} className="mt-7 rounded-full bg-[#a295f3] px-6 py-3.5 font-medium text-black">Preview {tab}</button>
          </div>
        </section>
      )}

      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+18px)] left-1/2 z-20 flex -translate-x-1/2 items-center gap-3" style={{ width: "min(calc(100vw - 32px), 528px)" }}>
        <label className="flex min-w-0 flex-1 items-center gap-4 rounded-full bg-[#242426] px-6 py-4 text-[18px] text-white/40"><Search className="h-6 w-6 shrink-0" /><input value={tokenQuery} onChange={(event) => onSearch(event.target.value)} placeholder="Search Ph4ntom" aria-label="Search tokens" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/35" /></label>
        <button type="button" onClick={onActions} aria-label="Open wallet actions" className={`grid h-[66px] w-[66px] shrink-0 place-items-center rounded-full bg-[#a295f3] text-black shadow-[0_6px_30px_rgba(162,149,243,.35)] transition hover:scale-105 ${actionsOpen ? "rotate-45" : ""}`}><Plus className="h-9 w-9" /></button>
      </div>
    </>
  );
}

function TokenRow({ token, onClick }: { token: WalletToken; onClick: () => void }) {
  const value = token.balance * token.price;
  const changeValue = value * (token.change24h / 100);
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-5 rounded-[1.5rem] bg-[#19191b] px-6 py-4 text-left transition hover:bg-[#242426]">
      <TokenIcon token={token} />
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[20px] font-medium"><span className="truncate">{token.name}</span><span className="text-[19px] text-[#a295f3]">✿</span></span><span className="mt-1 block text-[17px] text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span>
      <span className="text-right"><span className="block text-[18px]">{formatMoney(value)}</span><span className={`mt-1 block text-[16px] ${token.change24h < 0 ? "text-[#f21b3f]" : value === 0 ? "text-white/55" : "text-[#f21b3f]"}`}>{value === 0 ? formatMoney(0) : formatMoney(changeValue)}</span></span>
    </button>
  );
}

function ActionMenu({ onAction }: { onAction: (action: Action) => void }) {
  const items: { label: Action; icon: LucideIcon }[] = [
    { label: "Send", icon: Send },
    { label: "Receive", icon: QrCode },
    { label: "Buy", icon: WalletCards },
    { label: "Trade", icon: Shuffle },
  ];
  return <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+100px)] left-1/2 z-30 flex -translate-x-1/2 flex-col items-end gap-4" style={{ width: "min(calc(100vw - 32px), 528px)" }}>{items.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => onAction(label)} className="flex items-center gap-4 text-[20px] font-medium"><span>{label}</span><span className="grid h-[60px] w-[60px] place-items-center rounded-full bg-[#a295f3] text-black shadow-xl"><Icon className="h-7 w-7" /></span></button>)}</div>;
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
        <div className="flex flex-col items-center pt-12"><button type="button" onClick={() => undefined} aria-label="Change profile icon"><LockAvatar value={draft.avatar} size="large" /></button><p className="mt-6 text-[27px] font-semibold tracking-[-0.05em]">@{draft.username || "username"}</p></div>

        <ProfileSection title="Icon"><div className="grid grid-cols-6 gap-3 rounded-[1.5rem] bg-[#1d1d1f] p-5">{profileEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => update("avatar", emoji)} className={`grid aspect-square place-items-center rounded-full bg-[#29292b] text-[29px] transition ${draft.avatar === emoji ? "bg-[#a295f3] ring-2 ring-[#a295f3] ring-offset-2 ring-offset-[#1d1d1f]" : "hover:bg-[#38383b]"}`} aria-label={`Use ${emoji} avatar`}>{emoji}</button>)}</div></ProfileSection>

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

function TokenDetail({ token, onBack, onSend, onReceive }: { token: WalletToken; onBack: () => void; onSend: () => void; onReceive: () => void }) {
  const chartPoints = "0,88 18,98 35,82 51,103 65,94 79,120 94,108 110,139 127,127 142,151 156,126 172,142 187,115 204,129 220,104 237,116 254,98 271,106 288,79 305,91 324,59 344,70 364,43 384,61 404,31";
  return <div className="absolute inset-0 z-40 flex min-h-full flex-col overflow-y-auto bg-black px-4 pb-10"><div className="mt-[calc(env(safe-area-inset-top)+20px)] flex items-center justify-between"><button type="button" onClick={onBack} aria-label="Go back" className="grid h-14 w-14 place-items-center rounded-full bg-[#242426]"><ArrowLeft className="h-7 w-7" /></button><button type="button" onClick={() => undefined} aria-label="Favorite token" className="text-4xl text-white/75">☆</button></div><div className="mt-9 flex items-center justify-between"><div className="flex items-center gap-4"><TokenIcon token={token} size="large" /><div><p className="text-[25px] font-semibold">{token.symbol}</p><p className="text-[17px] text-white/55">{token.name}</p></div></div><div className="text-right"><p className="text-[22px]">{formatMoney(token.price)}</p><p className="mt-1 text-[16px] text-[#f21b3f]">{formatMoney(token.price * token.change24h / 100)} ({token.change24h.toFixed(2)}%)</p></div></div><div className="mt-12 rounded-[1.5rem] bg-[#1d1d1f] p-3"><svg viewBox="0 0 405 170" className="h-48 w-full" role="img" aria-label={`${token.symbol} simulated price chart`}><polyline points={chartPoints} fill="none" stroke="#ff69a9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="flex justify-between text-[14px] text-white/45">{["1H", "1D", "1W", "1M", "1Y", "ALL"].map((period) => <button key={period} type="button" className={period === "1D" ? "rounded-full bg-[#3a374d] px-3 py-1 text-white" : "px-2 py-1"}>{period}</button>)}</div></div><div className="mt-10 flex items-end justify-between"><div><p className="text-[17px] text-white/65">Your balance</p><p className="mt-2 text-[28px]">{formatMoney(token.price * token.balance)}</p></div><p className="text-[17px] text-white/65">{formatAmount(token.balance)} {token.symbol}</p></div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onSend} className="rounded-full bg-[#242426] px-4 py-4 text-[17px]">↗ Send</button><button type="button" onClick={onReceive} className="rounded-full bg-[#242426] px-4 py-4 text-[17px]">⇩ Receive</button></div><h2 className="mt-10 text-[20px]">Recent history <ChevronRight className="inline h-5 w-5" /></h2><div className="mt-6 grid grid-cols-2 gap-5 text-[16px] text-white/55"><div>Market cap<p className="mt-1 text-white">{formatMoney(token.price * 1_000_000)}</p></div><div>24h volume<p className="mt-1 text-white">{formatMoney(token.price * 25_000)}</p></div><div>Network<p className="mt-1 text-white">Simulated</p></div><div>Updated<p className="mt-1 text-white">Just now</p></div></div><button type="button" onClick={onSend} className="mt-auto pt-10"><span className="block w-full rounded-full bg-[#a295f3] px-5 py-5 text-[20px] font-medium text-black">Swap</span></button></div>;
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTokens(getTokens());
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

  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.price * token.balance, 0), [tokens]);
  const totalChange = useMemo(() => total === 0 ? 0 : tokens.reduce((sum, token) => sum + ((token.price * token.balance) / total) * token.change24h, 0), [tokens, total]);

  const resetSend = () => { setSelectedToken(null); setSendAmount(""); setRecipient(""); };

  const openAction = (action: Action) => {
    setActionsOpen(false);
    if (action === "Send" || action === "Buy") { setFlow(action === "Send" ? "send" : "buy"); setView("token-picker"); return; }
    if (action === "Receive") { setView("receive"); return; }
    notify("Trade is available in simulation mode.");
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
    <main className="download-wallet-app fixed inset-0 z-0 overflow-hidden bg-black font-sans text-white">
      <div className="relative mx-auto h-full w-full max-w-[560px] overflow-hidden bg-black shadow-2xl shadow-black/50">
        <div className="relative h-full overflow-y-auto overscroll-contain">
          {view === "home" ? <HomeView tokens={tokens} profile={profile} tab={activeTab} cashVisible={cashVisible} tokenQuery={tokenQuery} actionsOpen={actionsOpen} total={total} totalChange={totalChange} onTab={setActiveTab} onMenu={() => setDrawerOpen(true)} onCash={() => setCashVisible((value) => !value)} onSearch={setTokenQuery} onActions={() => setActionsOpen((value) => !value)} onToken={(token) => { setSelectedToken(token); setView("token-detail"); }} onNotify={notify} /> : null}
          {view === "profile" ? <ProfileScreen profile={profile} tokens={tokens} onBack={() => setView("home")} onSave={saveProfile} onAddToken={() => { setEditingToken(null); setTokenEditorOpen(true); }} onEditToken={(token) => { setEditingToken(token); setTokenEditorOpen(true); }} onDeleteToken={removeToken} /> : null}
          {view === "history" ? <HistoryScreen records={records} onBack={() => setView("home")} onRecord={(record) => { setSentRecord(record); setView("sent-detail"); }} /> : null}
          {view === "token-picker" ? <TokenPicker tokens={tokens} flow={flow} onClose={() => { resetSend(); setView("home"); }} onSelect={pickToken} /> : null}
          {view === "send-recipient" && currentToken ? <SendRecipientScreen token={currentToken} recipient={recipient} onRecipient={setRecipient} onBack={() => setView("token-picker")} onNext={() => setView("send-amount")} /> : null}
          {view === "send-amount" && currentToken ? <SendAmountScreen token={currentToken} amount={sendAmount} onAmount={setSendAmount} onBack={() => setView("send-recipient")} onNext={() => setView("send-summary")} /> : null}
          {view === "send-summary" && currentToken ? <SummaryScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onBack={() => setView("send-amount")} onConfirm={() => setView("sending")} /> : null}
          {view === "sending" && currentToken ? <SendingScreen token={currentToken} amount={Number(sendAmount) || 0} recipient={recipient} onComplete={completeSend} /> : null}
          {view === "sent" && currentToken && sentRecord ? <SentScreen token={currentToken} amount={sentRecord.amount} recipient={sentRecord.counterpartyLabel} onClose={() => { resetSend(); setView("home"); }} onHistory={() => setView("history")} /> : null}
          {view === "receive" ? <ReceiveScreen profile={profile} onClose={() => setView("home")} /> : null}
          {view === "buy" && currentToken ? <BuyScreen token={currentToken} onClose={() => { resetSend(); setView("home"); }} onBuy={buyToken} /> : null}
          {view === "token-detail" && currentToken ? <TokenDetail token={currentToken} onBack={() => { setSelectedToken(null); setView("home"); }} onSend={() => { setFlow("send"); setView("send-recipient"); }} onReceive={() => setView("receive")} /> : null}
          {view === "sent-detail" && sentRecord ? <TransactionDetail record={sentRecord} onClose={() => setView("history")} /> : null}
          {actionsOpen && view === "home" ? <ActionMenu onAction={openAction} /> : null}
          {drawerOpen ? <SideDrawer profile={profile} onClose={() => setDrawerOpen(false)} onProfile={() => { setDrawerOpen(false); setView("profile"); }} onHistory={() => { setDrawerOpen(false); setView("history"); }} onSettings={() => { setDrawerOpen(false); setView("profile"); }} onNotice={notify} /> : null}
          {tokenEditorOpen ? <TokenEditor token={editingToken} onClose={() => { setEditingToken(null); setTokenEditorOpen(false); }} onSave={saveEditedToken} /> : null}
          {toast ? <div className="absolute bottom-28 left-1/2 z-[80] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#29292b] px-5 py-3 text-sm text-white/85 shadow-xl">{toast}</div> : null}
          {notificationPromptOpen ? <NotificationPrompt onClose={() => setNotificationPromptOpen(false)} /> : null}
        </div>
      </div>
      <style>{`.download-wallet-app div.absolute.inset-0.z-40 > div.mx-auto.mt-3.h-1\\.5.w-20 { margin-top: calc(env(safe-area-inset-top) + 12px); }`}</style>
    </main>
  );
}
