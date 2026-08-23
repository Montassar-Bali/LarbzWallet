"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  Eye,
  EyeOff,
  History,
  Home,
  MoreHorizontal,
  Plus,
  Repeat2,
  Search,
  ScanLine,
  Settings,
  Shuffle,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WalletToken } from "@/lib/types";
import { getTokens, saveToken } from "@/lib/wallet";

type TrustTab = "home" | "trade" | "explore" | "activity";

const tokenColors: Record<string, string> = {
  BTC: "#f4c35f",
  ETH: "#d4e3ff",
  SOL: "#111c43",
  USDT: "#33c795",
  USDC: "#4c8dff",
};

const actionItems: { label: string; icon: LucideIcon }[] = [
  { label: "Send", icon: ArrowUpRight },
  { label: "Receive", icon: ArrowDown },
  { label: "Swap", icon: Repeat2 },
  { label: "Buy", icon: Plus },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function tokenMark(token: WalletToken) {
  if (token.symbol === "BTC") return "₿";
  if (token.symbol === "ETH") return "◆";
  if (token.symbol === "SOL") return "≡";
  return token.symbol.slice(0, 1);
}

function TokenIcon({ token, size = "normal" }: { token: WalletToken; size?: "small" | "normal" }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-[#172550] shadow-inner shadow-white/40 ${size === "small" ? "h-8 w-8 text-xs" : "h-11 w-11 text-lg"}`}
      style={{ background: token.symbol === "SOL" ? "linear-gradient(135deg,#0d173b,#3645b8)" : tokenColors[token.symbol] ?? "#b5c4ec" }}
    >
      <span className={token.symbol === "SOL" ? "text-white" : undefined}>{tokenMark(token)}</span>
    </span>
  );
}

function Notice({ message }: { message: string }) {
  return <div className="fixed left-1/2 top-5 z-[70] w-[calc(100%-32px)] max-w-[500px] -translate-x-1/2 rounded-2xl bg-[#14285e] px-4 py-3 text-center text-sm text-white shadow-2xl">{message}</div>;
}

function TrustSettings({
  tokens,
  onClose,
  onSave,
  onAddToken,
}: {
  tokens: WalletToken[];
  onClose: () => void;
  onSave: (balances: Record<string, number>) => void;
  onAddToken: (network: "Solana" | "Ethereum") => void;
}) {
  const [balances, setBalances] = useState<Record<string, string>>(() => Object.fromEntries(tokens.map((token) => [token.id, String(token.balance)])));
  const [showMore, setShowMore] = useState(false);
  const shownTokens = showMore ? tokens : tokens.slice(0, 3);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <section className="max-h-[94svh] w-full max-w-[510px] overflow-y-auto rounded-[2rem] bg-[#334b83] p-5 shadow-2xl sm:p-6" aria-label="Trust Wallet settings">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Settings</h2><button type="button" onClick={onClose} aria-label="Close settings" className="rounded-full p-2 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
        <label className="mt-7 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Wallet name<input defaultValue="Flex Wallet" className="mt-2 w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm text-white outline-none" /></label>
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Currency</p><div className="mt-2 flex items-center justify-between rounded-xl bg-[#47639e] px-4 py-3 text-sm"><span>$ USD</span><ChevronDown className="h-4 w-4 text-white/60" /></div></div>
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Coin balances</p><div className="mt-2 space-y-3">{shownTokens.map((token) => <label key={token.id} className="flex items-center gap-3"><TokenIcon token={token} size="small" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{token.name} <span className="text-white/45">({token.symbol})</span></span><input inputMode="decimal" value={balances[token.id] ?? "0"} onChange={(event) => setBalances((current) => ({ ...current, [token.id]: event.target.value }))} className="mt-1 w-full rounded-xl bg-[#47639e] px-3 py-2.5 text-sm text-white outline-none" /></span></label>)}</div><button type="button" onClick={() => setShowMore((value) => !value)} className="mt-4 flex items-center gap-1 text-sm font-semibold text-white/80">{showMore ? "Show less" : "Show more"}<ChevronDown className={`h-4 w-4 transition ${showMore ? "rotate-180" : ""}`} /></button></div>
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Custom tokens (Solana)</p><button type="button" onClick={() => onAddToken("Solana")} className="mt-2 w-full rounded-xl bg-[#47639e] px-4 py-3 text-left text-sm font-semibold text-cyan-200 hover:bg-[#5270ad]">+ Add Solana Token by Contract Address</button></div>
        <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Custom tokens (Ethereum)</p><button type="button" onClick={() => onAddToken("Ethereum")} className="mt-2 w-full rounded-xl bg-[#47639e] px-4 py-3 text-left text-sm font-semibold text-blue-200 hover:bg-[#5270ad]">+ Add Ethereum Token by Contract Address</button></div>
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">CoinGecko API</p><input placeholder="Optional · API rate limits" className="mt-2 w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm text-white outline-none placeholder:text-white/45" /><label className="mt-3 flex items-center gap-2 text-sm text-white/75"><input type="checkbox" className="h-4 w-4 accent-cyan-400" /> Pro API key</label></div>
        <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">Language</p><div className="mt-2 flex items-center justify-between rounded-xl bg-[#47639e] px-4 py-3 text-sm">EN — English<ChevronDown className="h-4 w-4 text-white/60" /></div></div>
        <button type="button" onClick={() => onSave(Object.fromEntries(Object.entries(balances).map(([id, value]) => [id, Number(value) || 0])))} className="mt-6 w-full rounded-xl bg-[#14d4d2] px-4 py-3.5 text-sm font-bold text-[#123260] shadow-lg shadow-cyan-950/20 hover:bg-[#42e2df]">Save</button>
      </section>
    </div>
  );
}

function TokenForm({ network, onClose, onSave }: { network: "Solana" | "Ethereum"; onClose: () => void; onSave: (token: { name: string; symbol: string; price: number; balance: number }) => void }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("0");
  const [balance, setBalance] = useState("0");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPrice = Number(price);
    const parsedBalance = Number(balance);
    if (!name.trim() || !symbol.trim() || !Number.isFinite(parsedPrice) || !Number.isFinite(parsedBalance) || parsedPrice < 0 || parsedBalance < 0) {
      setError("Enter a name, symbol, price, and valid balance.");
      return;
    }
    onSave({ name: name.trim(), symbol: symbol.trim().toUpperCase(), price: parsedPrice, balance: parsedBalance });
  };

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center"><section className="w-full max-w-[500px] rounded-[2rem] bg-[#334b83] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Add {network} token</h2><p className="mt-1 text-xs text-white/50">Simulation-only token.</p></div><button type="button" onClick={onClose} aria-label="Close add token form"><X className="h-5 w-5" /></button></div><form onSubmit={submit} className="mt-5 space-y-3"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" className="w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm outline-none" /><input required value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="Symbol" className="w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm uppercase outline-none" /><input required type="number" min="0" step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Price (USD)" className="w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm outline-none" /><input required type="number" min="0" step="any" value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" className="w-full rounded-xl bg-[#47639e] px-4 py-3 text-sm outline-none" />{error ? <p className="rounded-xl bg-rose-400/15 px-3 py-2 text-sm text-rose-100">{error}</p> : null}<button type="submit" className="w-full rounded-xl bg-[#14d4d2] px-4 py-3 font-bold text-[#123260]">Add token</button></form></section></div>;
}

function TokenDetail({ token, onClose, onAction }: { token: WalletToken; onClose: () => void; onAction: (action: string) => void }) {
  const chartPoints = "0,87 18,98 35,82 51,103 65,94 79,120 94,108 110,139 127,127 142,151 156,126 172,142 187,115 204,129 220,104 237,116 254,98 271,106 288,79 305,91 324,59 344,70 364,43 384,61 404,31";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#080d1b]/60 sm:items-center"><section className="flex min-h-[92svh] w-full max-w-[560px] flex-col bg-[#334b83] px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl"><header className="flex items-center justify-between"><button type="button" onClick={onClose} aria-label="Close token details" className="rounded-full p-2 text-white/80 hover:bg-white/10"><ArrowDown className="h-5 w-5 rotate-90" /></button><button type="button" onClick={() => onAction("Token added to favorites") } aria-label="Favorite token" className="text-2xl text-white/70">☆</button></header><div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-3"><TokenIcon token={token} /><div><p className="text-xl font-semibold">{token.symbol}</p><p className="text-sm text-white/50">{token.name}</p></div></div><div className="text-right"><p className="text-xl font-semibold">{formatMoney(token.price)}</p><p className="text-sm text-rose-300">{formatMoney(token.price * token.change24h / 100)} ({token.change24h.toFixed(2)}%)</p></div></div><div className="mt-8 rounded-2xl bg-[#2f4478] p-3"><svg viewBox="0 0 405 170" className="h-44 w-full" role="img" aria-label={`${token.symbol} simulated price chart`}><polyline points={chartPoints} fill="none" stroke="#ff69a9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="flex items-center justify-between text-xs text-white/45">{["1H", "1D", "1W", "1M", "1Y", "ALL"].map((period) => <button key={period} type="button" onClick={() => onAction(`${period} chart selected`)} className={`rounded-full px-2 py-1 ${period === "1D" ? "bg-[#526aa5] text-white" : ""}`}>{period}</button>)}</div></div><div className="mt-6 flex items-end justify-between"><div><p className="text-sm text-white/65">Your balance</p><p className="mt-1 text-2xl font-semibold">{formatMoney(token.price * token.balance)}</p></div><p className="text-sm text-white/60">{formatAmount(token.balance)} {token.symbol}</p></div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => onAction("Send opened in simulation mode")} className="rounded-xl bg-[#536ca8] px-4 py-3 text-sm font-semibold"><ArrowUpRight className="mr-2 inline h-4 w-4" />Send</button><button type="button" onClick={() => onAction("Receive opened in simulation mode")} className="rounded-xl bg-[#536ca8] px-4 py-3 text-sm font-semibold"><ArrowDown className="mr-2 inline h-4 w-4" />Receive</button></div><div className="mt-7 flex items-center justify-between"><h2 className="text-lg font-semibold">Recent history <ChevronRight className="inline h-4 w-4" /></h2><button type="button" onClick={() => onAction("History opened in simulation mode")} className="rounded-full p-2 text-white/65"><History className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><p className="text-white/45">Market cap</p><p className="mt-1">{formatMoney(token.price * 1000000)}</p></div><div><p className="text-white/45">24h volume</p><p className="mt-1">{formatMoney(token.price * 25000)}</p></div><div><p className="text-white/45">Network</p><p className="mt-1">Simulated</p></div><div><p className="text-white/45">Updated</p><p className="mt-1">Just now</p></div></div><div className="mt-auto flex gap-3 pt-6"><button type="button" onClick={() => onAction("Swap opened in simulation mode")} className="flex-1 rounded-2xl bg-[#14d4d2] px-4 py-4 font-bold text-[#123260]">Swap</button><button type="button" onClick={() => onAction("More token options opened")} aria-label="More token options" className="grid w-14 place-items-center rounded-2xl bg-[#536ca8]"><MoreHorizontal className="h-5 w-5" /></button></div></section></div>;
}

function ActionButton({ label, icon: Icon, onClick, active }: { label: string; icon: LucideIcon; onClick: () => void; active?: boolean }) {
  return <button type="button" onClick={onClick} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-xs font-semibold text-white/80"><span className={`grid h-12 w-full max-w-[82px] place-items-center rounded-xl ${active ? "bg-[#14d4d2] text-[#123260]" : "bg-[#536ca8] text-white"}`}><Icon className="h-5 w-5" /></span>{label}</button>;
}

export function TrustWallet() {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [tab, setTab] = useState<TrustTab>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addNetwork, setAddNetwork] = useState<"Solana" | "Ethereum" | null>(null);
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [notice, setNotice] = useState("");
  const [balanceVisible, setBalanceVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTokens(getTokens()), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.price * token.balance, 0), [tokens]);
  const totalChange = useMemo(() => {
    if (total === 0) return 0;
    return tokens.reduce((sum, token) => sum + ((token.price * token.balance) / total) * token.change24h, 0);
  }, [tokens, total]);
  const visibleTokens = tokens.filter((token) => ["BTC", "SOL"].includes(token.symbol)).slice(0, 2);
  const perps = tokens.filter((token) => ["ETH", "SOL"].includes(token.symbol)).slice(0, 2);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  const saveBalances = (balances: Record<string, number>) => {
    const updated = tokens.map((token) => balances[token.id] === undefined ? token : saveToken({ ...token, balance: balances[token.id] }));
    setTokens(updated);
    setSettingsOpen(false);
    notify("Coin balances saved in simulation.");
  };

  const addToken = (input: { name: string; symbol: string; price: number; balance: number }) => {
    const saved = saveToken({ ...input, change24h: 0, image: "https://placehold.co/64x64/31477f/ffffff?text=T" });
    setTokens((current) => [...current, saved]);
    setAddNetwork(null);
    setSettingsOpen(false);
    notify(`${saved.symbol} added to your simulated wallet.`);
  };

  const handleAction = (action: string) => notify(action);

  return (
    <main className="min-h-screen bg-[#080d1b] text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[560px] flex-col overflow-hidden bg-[#334b83] shadow-2xl shadow-black/30">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_14%,rgba(145,183,255,.18),transparent_28%),linear-gradient(180deg,#334b83_0%,#334b83_100%)]" />
        <div className="relative flex-1 overflow-y-auto px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/75"><span>05:32</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-white/75" /><span className="h-2 w-3 rounded-sm bg-white/75" /><span className="h-2.5 w-5 rounded-[3px] border border-white/65" /></span></div>
          <header className="mt-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-[#d8be62]"><Image src="/icons/wallets/trust.png" alt="Trust Wallet logo" width={44} height={44} className="h-full w-full object-cover" priority /></span><button type="button" onClick={() => notify("Wallet switcher opened in simulation mode.")} className="flex items-center gap-1 rounded-full bg-[#536ca8] px-3 py-2 text-sm font-semibold">Flex Wallet<ChevronDown className="h-4 w-4" /></button></div><div className="flex items-center gap-2"><button type="button" onClick={() => notify("History opened in simulation mode.")} aria-label="Open history" className="grid h-10 w-10 place-items-center rounded-full bg-[#536ca8] text-white/80"><Clock3 className="h-4 w-4" /></button><button type="button" onClick={() => setSettingsOpen(true)} aria-label="Open settings" className="grid h-10 w-10 place-items-center rounded-full bg-[#536ca8] text-white/80"><Settings className="h-4 w-4" /></button></div></header>

          <button type="button" onClick={() => notify("Predictions are available in simulation mode.")} className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-[#253861] px-3 py-3 text-left shadow-lg"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#152e72] text-sm">◈</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">Hyperliquid now live in Predictions</span><span className="block text-[11px] text-white/55">Explore now</span></span><ChevronRight className="h-4 w-4 text-white/50" /></button>

          {tab === "home" ? <>
            <section className="mt-7"><div className="flex items-end justify-between"><div><p className="text-[3rem] font-semibold leading-none tracking-[-0.07em]">{balanceVisible ? formatMoney(total) : "••••••"}</p><p className="mt-3 text-sm text-rose-300">{formatMoney(total * (totalChange / 100))} ({totalChange.toFixed(2)}%)</p></div><button type="button" onClick={() => setBalanceVisible((value) => !value)} aria-label={balanceVisible ? "Hide total balance" : "Show total balance"} className="rounded-full p-2 text-white/65">{balanceVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}</button></div></section>
            <div className="mt-7 flex items-start justify-between gap-2">{actionItems.map(({ label, icon: Icon }) => <ActionButton key={label} label={label} icon={Icon} active={label === "Swap"} onClick={() => handleAction(`${label} opened in simulation mode.`)} />)}</div>
            <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Tokens <ChevronRight className="inline h-4 w-4" /></h2><button type="button" onClick={() => notify("Showing all simulated tokens.")} className="rounded-full bg-[#536ca8] px-3 py-1.5 text-xs font-semibold">View all</button></div><div className="mt-3 space-y-2">{visibleTokens.length > 0 ? visibleTokens.map((token) => <button key={token.id} type="button" onClick={() => setSelectedToken(token)} className="flex w-full items-center gap-3 rounded-2xl bg-[#405991] px-3 py-3 text-left transition hover:bg-[#4b66a0]"><TokenIcon token={token} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{token.name}</span><span className="block text-xs text-white/55">{formatAmount(token.balance)} {token.symbol}</span></span><span className="text-right"><span className="block text-sm font-semibold">{formatMoney(token.price * token.balance)}</span><span className="block text-xs text-rose-300">{formatMoney(token.price * token.change24h / 100)}</span></span><ChevronRight className="h-4 w-4 text-white/45" /></button>) : <p className="rounded-2xl bg-[#405991] px-4 py-5 text-sm text-white/55">No tokens added yet.</p>}</div></section>
            <section className="mt-7"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Perps <ChevronRight className="inline h-4 w-4" /></h2><button type="button" onClick={() => notify("Perps are simulated.")} className="rounded-full bg-[#536ca8] p-2 text-white/65"><ScanLine className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-3">{(perps.length > 0 ? perps : tokens.slice(0, 2)).map((token) => <button key={token.id} type="button" onClick={() => setSelectedToken(token)} className="rounded-2xl bg-[#405991] p-4 text-left"><TokenIcon token={token} size="small" /><p className="mt-3 text-sm font-semibold">{token.symbol} <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">Perp</span></p><p className="mt-1 text-xs text-white/50">{formatMoney(token.price)} · simulated</p></button>)}</div></section>
            <section className="mt-7"><h2 className="text-lg font-semibold">Popular tokens</h2><div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-2xl bg-[#2d4378] p-2">{["Top", "New", "DeFi", "GameFi"].map((item) => <button key={item} type="button" onClick={() => notify(`${item} tokens selected.`)} className={`rounded-xl px-4 py-2 text-xs font-semibold ${item === "Top" ? "bg-[#536ca8] text-white" : "text-white/55"}`}>{item}</button>)}<button type="button" onClick={() => notify("Token search opened in simulation mode.")} aria-label="Search popular tokens" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#536ca8]"><Search className="h-4 w-4" /></button></div></section>
          </> : <section className="mt-8 rounded-3xl bg-[#2d4378] p-6"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#536ca8] text-[#14d4d2]">{tab === "trade" ? <Shuffle className="h-6 w-6" /> : tab === "explore" ? <Compass className="h-6 w-6" /> : <History className="h-6 w-6" />}</div><h1 className="mt-6 text-2xl font-semibold capitalize">{tab}</h1><p className="mt-3 text-sm leading-6 text-white/60">This {tab} area is part of the Trust Wallet simulation. No live network or funds are connected.</p><button type="button" onClick={() => handleAction(`${tab} action opened in simulation mode.`)} className="mt-6 rounded-xl bg-[#14d4d2] px-4 py-3 text-sm font-bold text-[#123260]">Continue</button></section>}
        </div>

        <nav className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-around rounded-2xl border border-white/10 bg-[#293e73]/95 p-2 shadow-2xl backdrop-blur-xl" aria-label="Trust Wallet navigation">{([["home", Home], ["trade", TrendingUp], ["explore", Repeat2], ["activity", WalletCards]] as [TrustTab, LucideIcon][]).map(([item, Icon]) => <button key={item} type="button" onClick={() => setTab(item)} className={`flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-[10px] font-semibold ${tab === item ? "bg-[#536ca8] text-white" : "text-white/45"}`}><Icon className="h-4 w-4" />{item === "home" ? "Home" : item === "trade" ? "Trade" : item === "explore" ? "Explore" : "Activity"}</button>)}</nav>
        {settingsOpen ? <TrustSettings tokens={tokens} onClose={() => setSettingsOpen(false)} onSave={saveBalances} onAddToken={setAddNetwork} /> : null}
        {addNetwork ? <TokenForm network={addNetwork} onClose={() => setAddNetwork(null)} onSave={addToken} /> : null}
        {selectedToken ? <TokenDetail token={selectedToken} onClose={() => setSelectedToken(null)} onAction={handleAction} /> : null}
        {notice ? <Notice message={notice} /> : null}
      </div>
    </main>
  );
}
