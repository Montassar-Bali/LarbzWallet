"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Compass,
  Eye,
  EyeOff,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Shuffle,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

type Tab = "Home" | "Trade" | "Explore";

type Token = {
  name: string;
  symbol: string;
  balance: string;
  value: string;
  change: string;
  tone: string;
  mark: string;
};

const tokenRows: Token[] = [
  { name: "Solana", symbol: "SOL", balance: "0 SOL", value: "$0.00", change: "$0.00", tone: "from-[#16a5ff] to-[#6859ff]", mark: "≡" },
  { name: "Ethereum", symbol: "ETH", balance: "0 ETH", value: "$0.00", change: "$0.00", tone: "from-[#f5f6fa] to-[#cfd5e5] text-[#51617a]", mark: "◆" },
  { name: "Bitcoin", symbol: "BTC", balance: "0 BTC", value: "$0.00", change: "$0.00", tone: "from-[#ffc46d] to-[#ed9d30]", mark: "₿" },
  { name: "Monad", symbol: "MON", balance: "0 MON", value: "$0.00", change: "$0.00", tone: "from-[#9fd8ff] to-[#6d7bff]", mark: "M" },
  { name: "Sui", symbol: "SUI", balance: "0 SUI", value: "$0.00", change: "$0.00", tone: "from-[#59e3ff] to-[#2d9cff]", mark: "S" },
];

const actionItems = [
  { label: "Send", icon: ArrowUpRight, tone: "bg-[#a9a0ff] text-[#1a183c]" },
  { label: "Receive", icon: ArrowDownLeft, tone: "bg-[#a9a0ff] text-[#1a183c]" },
  { label: "Buy", icon: ShoppingBag, tone: "bg-[#a9a0ff] text-[#1a183c]" },
  { label: "Trade", icon: Shuffle, tone: "bg-[#a9a0ff] text-[#1a183c]" },
];

function TokenMark({ token }: { token: Token }) {
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${token.tone} text-lg font-bold shadow-inner shadow-white/25`}>
      {token.mark}
    </span>
  );
}

function WalletTabs({ activeTab, onChange, onMenu }: { activeTab: Tab; onChange: (tab: Tab) => void; onMenu: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#202431] text-xl shadow-lg transition hover:bg-[#2b3040]">
        👻
      </button>
      <div className="flex min-w-0 flex-1 gap-2">
        {(["Home", "Trade", "Explore"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab ? "bg-[#aa9eff] text-[#25213e]" : "bg-[#202431] text-white/65 hover:bg-[#2a2f3e] hover:text-white"}`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}

function SideDrawer({ onClose, onSettings }: { onClose: () => void; onSettings: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/65" onClick={onClose} role="presentation">
      <aside className="flex h-full w-[min(86vw,330px)] flex-col border-r border-white/[0.06] bg-[#0d1220] px-5 py-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[#202431] text-xl">👻</div>
            <p className="mt-4 text-lg font-bold text-white">@flexwallet</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-2 text-white/55 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-8 space-y-1">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Wallet</p>
          <button type="button" onClick={onClose} className="flex w-full items-center gap-3 rounded-xl bg-[#1e2537] px-3 py-3 text-left text-sm font-medium text-white"><Wallet className="h-4 w-4 text-[#aaa0ff]" /> Larpz Wallet <ChevronDown className="ml-auto h-4 w-4 text-white/45" /></button>
          <DrawerItem icon={UserRound} label="Profile" />
          <DrawerItem icon={MessageCircle} label="Chats" />
          <DrawerItem icon={Clock} label="History" />
        </div>
        <div className="mt-8 space-y-1 border-t border-white/[0.06] pt-5">
          <button type="button" onClick={onSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/75 transition hover:bg-white/[0.06] hover:text-white"><Settings className="h-4 w-4 text-[#aaa0ff]" /> Settings</button>
          <DrawerItem icon={CircleHelp} label="Help & Support" />
        </div>
        <div className="mt-auto pt-16 text-xs leading-5 text-white/35">Simulation wallet<br />No real assets are connected.</div>
      </aside>
    </div>
  );
}

function DrawerItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <button type="button" onClick={() => undefined} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/75 transition hover:bg-white/[0.06] hover:text-white"><Icon className="h-4 w-4 text-white/45" /> {label}</button>;
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("flexwallet");
  const [displayName, setDisplayName] = useState("Larpz Wallet");
  const [cashAmount, setCashAmount] = useState("0");
  const [showCash, setShowCash] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center">
      <section className="max-h-[92svh] w-full max-w-[500px] overflow-y-auto rounded-[2rem] border border-white/15 bg-[#293b68] p-5 shadow-2xl sm:p-6" aria-label="Wallet settings">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <SettingsSection title="Profile">
          <SettingsField label="Username" value={username} onChange={setUsername} />
          <SettingsField label="Name" value={displayName} onChange={setDisplayName} />
        </SettingsSection>
        <SettingsSection title="Currency">
          <div className="flex items-center justify-between rounded-xl bg-[#415782] px-3 py-3 text-sm"><span className="text-white/55">Display</span><span className="font-semibold text-white">$ USD</span><ChevronDown className="h-4 w-4 text-white/55" /></div>
        </SettingsSection>
        <SettingsSection title="Cash Balance">
          <SettingsField label="Amount" value={cashAmount} onChange={setCashAmount} />
          <button type="button" onClick={() => setShowCash((value) => !value)} className="flex items-center justify-between rounded-xl bg-[#415782] px-3 py-3 text-sm text-white/75"><span>Show balance</span><span className={`flex h-6 w-11 items-center rounded-full p-1 transition ${showCash ? "justify-end bg-[#9e94ff]" : "justify-start bg-white/15"}`}><span className="h-4 w-4 rounded-full bg-white shadow" /></span></button>
        </SettingsSection>
        <SettingsSection title="Tokens">
          {tokenRows.slice(0, 4).map((token) => <div key={token.symbol} className="flex items-center justify-between rounded-xl bg-[#415782] px-3 py-2.5 text-sm"><span className="flex items-center gap-2 text-white"><TokenMark token={token} /><span>{token.name} <span className="text-white/45">({token.symbol})</span></span></span><span className="text-white/55">0</span></div>)}
        </SettingsSection>
        <SettingsSection title="Custom Tokens">
          <button type="button" onClick={() => undefined} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.08]"><Plus className="h-4 w-4" /> Add Token by Contract Address</button>
        </SettingsSection>
        <SettingsSection title="CoinGecko API">
          <SettingsField label="Key" value="Optional - rate limits" onChange={() => undefined} muted />
        </SettingsSection>
        <button type="button" onClick={() => { setSaved(true); window.setTimeout(onClose, 450); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#a9a0ff] px-4 py-3.5 text-sm font-bold text-[#29264c] hover:bg-[#c0baff]">{saved ? <Check className="h-4 w-4" /> : null}{saved ? "Saved" : "Save"}</button>
      </section>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-5 space-y-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b7c5ed]/70">{title}</p>{children}</div>;
}

function SettingsField({ label, value, onChange, muted }: { label: string; value: string; onChange: (value: string) => void; muted?: boolean }) {
  return <label className="flex items-center gap-3 rounded-xl bg-[#415782] px-3 py-2.5 text-sm"><span className="w-16 shrink-0 text-white/45">{label}</span><input className={`min-w-0 flex-1 bg-transparent text-right outline-none ${muted ? "text-white/45" : "text-white"}`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function DownloadWallet() {
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [cashVisible, setCashVisible] = useState(true);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  return (
    <main className="min-h-screen bg-[#050711] text-white">
      <div className="relative mx-auto flex min-h-screen max-w-[560px] flex-col overflow-hidden border-x border-white/[0.05] bg-[#0b1020] shadow-[0_0_100px_rgba(7,11,30,0.6)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(91,83,255,0.16),transparent_30%),radial-gradient(circle_at_20%_90%,rgba(26,104,255,0.14),transparent_35%)]" />
        <div className="relative flex-1 overflow-y-auto px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <div className="mb-6 flex items-center justify-between text-[11px] font-semibold text-white/70"><span>09:32</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/70" /><span className="h-2 w-3 rounded-sm bg-white/70" /><span className="h-2.5 w-5 rounded-[3px] border border-white/60" /></span></div>
          <WalletTabs activeTab={activeTab} onChange={setActiveTab} onMenu={() => setDrawerOpen(true)} />

          {activeTab === "Home" ? (
            <>
              <div className="mt-7 flex items-center gap-1 text-white/55"><span className="text-sm">New Wallet</span><ChevronDown className="h-4 w-4" /></div>
              <div className="mt-1 text-[3.8rem] font-medium leading-none tracking-[-0.07em] text-white">$0.00</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-white/45"><span>$0.00</span><span className="rounded-md bg-[#a9a0ff]/25 px-2 py-1 text-[#beb7ff]">0.00%</span></div>

              <button type="button" onClick={() => setCashVisible((value) => !value)} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-[#303951] px-4 py-3.5 text-left transition hover:bg-[#39445f]">
                <span className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">▣</span> Cash</span>
                <span className="flex items-center gap-2 text-sm font-semibold text-white/75">{cashVisible ? "$0.00" : "••••"}{cashVisible ? <Eye className="h-4 w-4 text-white/35" /> : <EyeOff className="h-4 w-4 text-white/35" />}</span>
              </button>

              <div className="mt-7 flex items-center gap-2"><h2 className="text-2xl font-semibold tracking-[-0.04em]">Tokens</h2><ChevronRight className="h-6 w-6 text-white/70" /></div>
              <div className="mt-3 space-y-1">
                {tokenRows.map((token) => (
                  <button key={token.symbol} type="button" onClick={() => notify(`${token.name} selected`)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left transition hover:bg-white/[0.05]">
                    <TokenMark token={token} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-white/90">{token.name} <span className="text-xs text-[#b0a5ff]">●</span></span><span className="mt-0.5 block text-xs text-white/45">{token.balance}</span></span>
                    <span className="text-right"><span className="block text-sm text-white/80">{token.value}</span><span className="mt-0.5 block text-xs text-white/40">{token.change}</span></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-10 rounded-3xl border border-white/[0.06] bg-[#131b30]/90 p-6">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#a9a0ff]/20 text-[#b9b1ff]">{activeTab === "Trade" ? <Shuffle className="h-6 w-6" /> : <Compass className="h-6 w-6" />}</div>
              <h1 className="mt-6 text-3xl font-semibold tracking-[-0.05em]">{activeTab}</h1>
              <p className="mt-3 text-sm leading-6 text-white/55">This {activeTab.toLowerCase()} view is ready for your simulated wallet. Choose an action below to preview the flow.</p>
              <button type="button" onClick={() => { setActionsOpen(true); setActiveTab("Home"); }} className="mt-6 rounded-xl bg-[#a9a0ff] px-4 py-3 text-sm font-semibold text-[#201d3f]">View wallet actions</button>
            </div>
          )}
        </div>

        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-[#171b28]/95 p-2 shadow-2xl backdrop-blur-xl sm:inset-x-5 sm:bottom-5">
          <div className="flex flex-1 items-center gap-3 rounded-xl bg-[#232734] px-3 py-3 text-sm text-white/35"><Search className="h-4 w-4" /> Search Phantom</div>
          <button type="button" onClick={() => setActionsOpen((value) => !value)} aria-label="Open wallet actions" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#a9a0ff] text-[#211d43] shadow-lg shadow-[#a9a0ff]/20 transition hover:scale-105"><Plus className={`h-6 w-6 transition ${actionsOpen ? "rotate-45" : ""}`} /></button>
        </div>

        {actionsOpen ? <div className="absolute bottom-[5.4rem] right-5 z-30 space-y-2 sm:bottom-[6.3rem] sm:right-7">{actionItems.map(({ label, icon: Icon, tone }) => <button key={label} type="button" onClick={() => { setActionsOpen(false); notify(`${label} opened in simulation mode`); }} className="flex items-center gap-3 text-sm font-semibold text-white drop-shadow-lg"><span>{label}</span><span className={`grid h-10 w-10 place-items-center rounded-full shadow-xl ${tone}`}><Icon className="h-5 w-5" /></span></button>)}</div> : null}
        {drawerOpen ? <SideDrawer onClose={() => setDrawerOpen(false)} onSettings={() => { setDrawerOpen(false); setSettingsOpen(true); }} /> : null}
        {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        {toast ? <div className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#27314b] px-4 py-2 text-xs text-white/85 shadow-xl">{toast}</div> : null}
      </div>
    </main>
  );
}
