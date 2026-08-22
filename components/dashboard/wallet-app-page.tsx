"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Grid2X2,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Shuffle,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WalletToken } from "@/lib/types";
import { getTokens, getWalletTheme, saveToken } from "@/lib/wallet";

type Tab = "home" | "trade" | "explore";
type Action = "send" | "receive" | "buy" | "trade";

const tokenColors: Record<string, string> = {
  SOL: "#19c5ff",
  ETH: "#d7e3ff",
  BTC: "#ffb647",
  USDT: "#37c993",
  USDC: "#4c8dff",
};

function TokenMark({ token }: { token: WalletToken }) {
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-[#08154d] shadow-[0_3px_12px_rgba(0,0,0,0.18)]"
      style={{ backgroundColor: tokenColors[token.symbol] ?? "#aebaff" }}
    >
      {token.symbol === "BTC" ? "B" : token.symbol === "ETH" ? "◆" : token.symbol.slice(0, 1)}
    </span>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function WalletAppPage() {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<WalletToken | null>(null);
  const [editValue, setEditValue] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.dataset.walletTheme = getWalletTheme();
    const timeoutId = window.setTimeout(() => setTokens(getTokens()), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.balance * token.price, 0), [tokens]);

  const selectAction = (action: Action) => {
    setActionsOpen(false);
    setNotice(`${action[0].toUpperCase()}${action.slice(1)} preview opened. This is a simulated wallet action.`);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const saveBalance = () => {
    if (!editing) return;
    const balance = Number(editValue);
    if (!Number.isFinite(balance) || balance < 0) return;
    const saved = saveToken({ ...editing, balance });
    setTokens((current) => current.map((token) => (token.id === saved.id ? saved : token)));
    setEditing(null);
  };

  return (
    <main className="wallet-app min-h-screen bg-[#2638d9] text-white" style={{ background: "linear-gradient(180deg, #151e82 0%, #2738d9 28%, #293ce1 100%)" }}>
      <div className="mx-auto min-h-screen w-full max-w-[520px] overflow-hidden bg-[#202fd0] shadow-2xl shadow-black/30">
        <header className="flex h-[76px] items-center justify-between border-b border-white/10 bg-[#18269c]/80 px-5 backdrop-blur-md">
          <button type="button" onClick={() => setDrawerOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10" aria-label="Open wallet menu"><Menu className="h-5 w-5" /></button>
          <div className="flex items-center gap-2.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#aebaff] text-[#293bd5]"><Sparkles className="h-5 w-5" /></span><span className="font-semibold tracking-tight">Larpz Wallet</span></div>
          <button type="button" onClick={() => setNotice("You have no new notifications.")} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10" aria-label="Notifications"><Bell className="h-5 w-5" /></button>
        </header>

        <section className="px-5 pb-24 pt-6">
          <div className="mb-7 flex items-center gap-2 rounded-full bg-black/15 p-1 text-xs font-semibold">
            {(["home", "trade", "explore"] as Tab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`flex-1 rounded-full px-4 py-2.5 capitalize transition ${tab === item ? "bg-[#b7c1ff] text-[#2435c6] shadow-lg" : "text-white/65"}`}>{item}</button>)}
          </div>

          <div className="mb-6 px-1"><p className="text-xs font-medium text-white/65">Larpz Wallet <ChevronDown className="ml-1 inline h-3 w-3" /></p><h1 className="mt-1 text-[42px] font-bold tracking-[-0.055em]">{formatMoney(total)}</h1><div className="mt-1 flex items-center gap-2 text-xs text-white/60"><span>$0.00</span><span className="rounded bg-white/20 px-2 py-0.5">0.00%</span></div></div>

          {tab === "home" ? <>
            <div className="mb-6 flex items-center justify-between rounded-2xl bg-white/15 px-4 py-4 shadow-lg shadow-[#1722a0]/20"><span className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><Copy className="h-4 w-4" /></span>Cash</span><span className="text-sm font-semibold">$0.00</span></div>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Tokens <ChevronRight className="inline h-4 w-4" /></h2><button type="button" onClick={() => setSettingsOpen(true)} className="text-xs text-white/65"><SlidersHorizontal className="mr-1 inline h-3.5 w-3.5" /> Edit</button></div>
            <div className="space-y-2.5">{tokens.map((token) => <button key={token.id} type="button" onClick={() => { setEditing(token); setEditValue(String(token.balance)); }} className="flex w-full items-center gap-3 rounded-2xl bg-white/15 px-3 py-3 text-left shadow-lg shadow-[#1826a7]/20 transition hover:bg-white/20"><TokenMark token={token} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{token.name} <span className="text-white/50">●</span></span><span className="block text-xs text-white/55">{token.balance} {token.symbol}</span></span><span className="text-right"><span className="block text-sm font-semibold">{formatMoney(token.balance * token.price)}</span><span className="block text-xs text-white/55">${token.price.toLocaleString()}</span></span></button>)}</div>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-black/15 px-4 py-3 text-sm text-white/60"><Search className="h-4 w-4" /> Search Phantom <Plus className="ml-auto h-5 w-5 rounded-full bg-[#b5bfff] p-1 text-[#2738d9]" /></div>
          </> : <div className="rounded-3xl bg-black/15 p-6 text-center"><div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/15"><Shuffle className="h-7 w-7" /></div><h2 className="text-xl font-bold">{tab === "trade" ? "Trade preview" : "Explore the market"}</h2><p className="mt-2 text-sm leading-6 text-white/65">This demo wallet keeps every action simulated. Choose an action from the button below.</p></div>}
        </section>

        <button type="button" onClick={() => setActionsOpen((open) => !open)} className="fixed bottom-7 right-[calc(50%-235px)] z-30 grid h-14 w-14 place-items-center rounded-full bg-[#bac4ff] text-[#2638d9] shadow-xl shadow-[#101b9e]/50 sm:right-8" aria-label="Wallet actions">{actionsOpen ? <X className="h-6 w-6" /> : <Plus className="h-7 w-7" />}</button>
        {actionsOpen && <div className="fixed bottom-24 right-[calc(50%-226px)] z-20 flex flex-col items-end gap-2 sm:right-8">{(["send", "receive", "buy", "trade"] as Action[]).map((action) => <button key={action} type="button" onClick={() => selectAction(action)} className="flex items-center gap-3 text-sm font-semibold"><span className="rounded-full bg-[#1826a9] px-4 py-2 shadow-lg">{action[0].toUpperCase()}{action.slice(1)}</span><span className="grid h-10 w-10 place-items-center rounded-full bg-[#c2caff] text-[#2638d9]">{action === "send" ? <ArrowUpRight className="h-4 w-4" /> : action === "receive" ? <ArrowDownLeft className="h-4 w-4" /> : action === "buy" ? <Plus className="h-4 w-4" /> : <Shuffle className="h-4 w-4" />}</span></button>)}</div>}

        {notice && <div className="fixed left-1/2 top-5 z-50 w-[calc(100%-32px)] max-w-[488px] -translate-x-1/2 rounded-2xl bg-[#101d92] px-4 py-3 text-center text-sm shadow-xl">{notice}</div>}
        {drawerOpen && <><button type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-black/45" /><aside className="fixed inset-y-0 left-0 z-50 w-[min(82vw,360px)] bg-[#101b9b] px-6 py-7 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-2xl font-bold">@flexwallet</p><p className="mt-1 text-xs text-white/50">Demo account</p></div><button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu"><X /></button></div><button type="button" onClick={() => setDrawerOpen(false)} className="mt-10 flex w-full items-center gap-3 rounded-xl bg-white/15 px-4 py-3 text-left text-sm font-semibold"><Sparkles className="h-4 w-4" /> Flex Wallet <ChevronDown className="ml-auto h-4 w-4" /></button><nav className="mt-5 space-y-1">{[[UserRound, "Profile"], [Grid2X2, "Chats"], [Clock3, "History"], [Settings, "Settings"], [CircleHelp, "Help & Support"]].map(([Icon, label]) => <button key={label as string} type="button" onClick={() => { setDrawerOpen(false); if (label === "Settings") setSettingsOpen(true); else setNotice(`${label} is available in this simulation.`); }} className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left text-sm font-semibold text-white/80 hover:bg-white/10"><Icon className="h-5 w-5" />{label as string}</button>)}</nav><div className="mt-auto pt-20 text-xs leading-5 text-white/40">Larpz Wallet is a visual wallet simulator. No real assets are held or transferred.</div></aside></>}

        {settingsOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"><section className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl bg-[#324bd1] p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Settings</h2><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X /></button></div><div className="mt-6 space-y-4"><label className="block text-xs font-semibold uppercase tracking-wider text-white/60">Profile<input className="mt-2 w-full rounded-xl border-0 bg-white/15 px-4 py-3 text-sm outline-none" defaultValue="flexwallet" /></label><label className="block text-xs font-semibold uppercase tracking-wider text-white/60">Name<input className="mt-2 w-full rounded-xl border-0 bg-white/15 px-4 py-3 text-sm outline-none" defaultValue="Flex Wallet" /></label><div><p className="text-xs font-semibold uppercase tracking-wider text-white/60">Currency</p><div className="mt-2 rounded-xl bg-white/15 px-4 py-3 text-sm">$ USD <ChevronDown className="float-right h-4 w-4" /></div></div><div><p className="text-xs font-semibold uppercase tracking-wider text-white/60">Token balances</p><div className="mt-2 space-y-2">{tokens.map((token) => <button type="button" key={token.id} onClick={() => { setEditing(token); setEditValue(String(token.balance)); setSettingsOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-white/15 px-3 py-2.5 text-left"><TokenMark token={token} /><span className="flex-1 text-sm">{token.name}</span><Pencil className="h-4 w-4 text-white/60" /></button>)}</div></div><button type="button" onClick={() => setSettingsOpen(false)} className="w-full rounded-xl bg-[#aebaff] py-3 font-bold text-[#2435c6]">Save</button></div></section></div>}
        {editing && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-5"><section className="w-full max-w-sm rounded-3xl bg-[#3149cf] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-bold">Edit {editing.name}</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close balance editor"><X /></button></div><label className="mt-6 block text-sm text-white/70">Balance<input autoFocus inputMode="decimal" value={editValue} onChange={(event) => setEditValue(event.target.value)} className="mt-2 w-full rounded-xl border-0 bg-white/15 px-4 py-3 text-lg outline-none" /></label><button type="button" onClick={saveBalance} className="mt-5 w-full rounded-xl bg-[#aebaff] py-3 font-bold text-[#2435c6]">Save balance</button></section></div>}
      </div>
    </main>
  );
}
