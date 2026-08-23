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
  Trash2,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WalletToken } from "@/lib/types";
import { deleteToken, getTokens, saveToken } from "@/lib/wallet";

type Tab = "Home" | "Trade" | "Explore";

type Token = WalletToken & {
  tone: string;
  mark: string;
};

const tokenVisuals: Record<string, Pick<Token, "tone" | "mark">> = {
  SOL: { tone: "from-[#16a5ff] to-[#6859ff]", mark: "≡" },
  ETH: { tone: "from-[#f5f6fa] to-[#cfd5e5] text-[#51617a]", mark: "◆" },
  BTC: { tone: "from-[#ffc46d] to-[#ed9d30]", mark: "₿" },
  MON: { tone: "from-[#9fd8ff] to-[#6d7bff]", mark: "M" },
  SUI: { tone: "from-[#59e3ff] to-[#2d9cff]", mark: "S" },
};

function decorateToken(token: WalletToken): Token {
  return {
    ...token,
    ...(tokenVisuals[token.symbol] ?? { tone: "from-[#a9a0ff] to-[#5966dc]", mark: token.symbol.slice(0, 1) }),
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

type TokenForm = {
  id?: string;
  name: string;
  symbol: string;
  price: string;
  balance: string;
  change24h: string;
  image: string;
};

const emptyTokenForm: TokenForm = {
  name: "",
  symbol: "",
  price: "",
  balance: "",
  change24h: "0",
  image: "",
};

function tokenToForm(token: WalletToken | null): TokenForm {
  if (!token) {
    return emptyTokenForm;
  }

  return {
    id: token.id,
    name: token.name,
    symbol: token.symbol,
    price: String(token.price),
    balance: String(token.balance),
    change24h: String(token.change24h),
    image: token.image,
  };
}

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

function SettingsPanel({
  onClose,
  tokens,
  onEditToken,
  onAddToken,
  onDeleteToken,
}: {
  onClose: () => void;
  tokens: Token[];
  onEditToken: (token: Token) => void;
  onAddToken: () => void;
  onDeleteToken: (token: Token) => void;
}) {
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
          {tokens.length === 0 ? <p className="rounded-xl bg-[#415782] px-3 py-3 text-sm text-white/55">No tokens yet.</p> : null}
          {tokens.map((token) => <div key={token.id} className="flex items-center gap-2 rounded-xl bg-[#415782] px-3 py-2.5 text-sm"><button type="button" onClick={() => onEditToken(token)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-white"><TokenMark token={token} /><span className="truncate">{token.name} <span className="text-white/45">({token.symbol})</span></span></button><span className="text-white/55">{token.balance.toLocaleString()}</span><button type="button" onClick={() => onDeleteToken(token)} aria-label={`Delete ${token.name}`} className="rounded-lg p-2 text-white/45 hover:bg-rose-400/15 hover:text-rose-200"><Trash2 className="h-4 w-4" /></button></div>)}
        </SettingsSection>
        <SettingsSection title="Custom Tokens">
          <button type="button" onClick={onAddToken} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.04] px-3 py-3 text-sm font-semibold text-white/75 hover:bg-white/[0.08]"><Plus className="h-4 w-4" /> Add Token</button>
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

function SettingsField({ label, value, onChange, muted, type = "text" }: { label: string; value: string; onChange: (value: string) => void; muted?: boolean; type?: "text" | "number" | "url" }) {
  return <label className="flex items-center gap-3 rounded-xl bg-[#415782] px-3 py-2.5 text-sm"><span className="w-16 shrink-0 text-white/45">{label}</span><input type={type} inputMode={type === "number" ? "decimal" : undefined} className={`min-w-0 flex-1 bg-transparent text-right outline-none ${muted ? "text-white/45" : "text-white"}`} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TokenEditor({
  token,
  onClose,
  onSave,
}: {
  token: WalletToken | null;
  onClose: () => void;
  onSave: (form: TokenForm) => void;
}) {
  const [form, setForm] = useState<TokenForm>(() => tokenToForm(token));
  const [error, setError] = useState("");

  const update = (field: keyof TokenForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number(form.price);
    const balance = Number(form.balance);
    const change24h = Number(form.change24h);

    if (!form.name.trim() || !form.symbol.trim()) {
      setError("Enter a token name and symbol.");
      return;
    }

    if (![price, balance, change24h].every(Number.isFinite) || price < 0 || balance < 0) {
      setError("Price and balance must be zero or greater.");
      return;
    }

    onSave({
      ...form,
      name: form.name.trim(),
      symbol: form.symbol.trim().toUpperCase(),
      price: String(price),
      balance: String(balance),
      change24h: String(change24h),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-3 sm:items-center">
      <section className="max-h-[92svh] w-full max-w-[500px] overflow-y-auto rounded-[2rem] border border-white/15 bg-[#293b68] p-5 shadow-2xl sm:p-6" aria-label={token ? `Edit ${token.name}` : "Add token"}>
        <div className="flex items-center justify-between">
          <div><h2 className="text-lg font-bold text-white">{token ? `Edit ${token.name}` : "Add Token"}</h2><p className="mt-1 text-xs text-white/50">Simulation-only portfolio data.</p></div>
          <button type="button" onClick={onClose} aria-label="Close token editor" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <SettingsField label="Name" value={form.name} onChange={(value) => update("name", value)} />
          <SettingsField label="Symbol" value={form.symbol} onChange={(value) => update("symbol", value)} />
          <SettingsField label="Price" type="number" value={form.price} onChange={(value) => update("price", value)} />
          <SettingsField label="Balance" type="number" value={form.balance} onChange={(value) => update("balance", value)} />
          <SettingsField label="24h %" type="number" value={form.change24h} onChange={(value) => update("change24h", value)} />
          <SettingsField label="Image URL" type="url" value={form.image} onChange={(value) => update("image", value)} />
          {error ? <p className="rounded-xl bg-rose-400/15 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
          <div className="flex gap-2 pt-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/15">Cancel</button><button type="submit" className="flex-1 rounded-xl bg-[#a9a0ff] px-4 py-3 text-sm font-bold text-[#29264c] hover:bg-[#c0baff]">Save Token</button></div>
        </form>
      </section>
    </div>
  );
}

function BuyPanel({
  tokens,
  onClose,
  onBuy,
}: {
  tokens: Token[];
  onClose: () => void;
  onBuy: (token: Token, amount: number) => void;
}) {
  const [tokenId, setTokenId] = useState(tokens[0]?.id ?? "");
  const [amount, setAmount] = useState("1");
  const [error, setError] = useState("");
  const selectedToken = tokens.find((token) => token.id === tokenId) ?? tokens[0];
  const quantity = Number(amount);
  const estimatedValue = selectedToken && Number.isFinite(quantity) ? selectedToken.price * quantity : 0;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedToken) {
      setError("Add a token before buying it.");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    onBuy(selectedToken, quantity);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/65 p-3 sm:items-center">
      <section className="max-h-[92svh] w-full max-w-[500px] overflow-y-auto rounded-[2rem] border border-white/15 bg-[#293b68] p-5 shadow-2xl sm:p-6" aria-label="Buy simulated asset">
        <div className="flex items-center justify-between">
          <div><h2 className="text-lg font-bold text-white">Buy</h2><p className="mt-1 text-xs text-white/50">Simulated purchase · no payment is processed.</p></div>
          <button type="button" onClick={onClose} aria-label="Close buy panel" className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {tokens.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-[#415782] p-4 text-sm text-white/70">Add a token in Manage before opening a simulated purchase.</div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#b7c5ed]/70">Asset</p>
              <select value={selectedToken?.id ?? ""} onChange={(event) => setTokenId(event.target.value)} className="w-full rounded-xl bg-[#415782] px-3 py-3 text-sm font-semibold text-white outline-none">
                {tokens.map((token) => <option key={token.id} value={token.id}>{token.name} ({token.symbol}) · {formatMoney(token.price)}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#b7c5ed]/70">Amount</p><span className="text-xs text-white/45">Current: {selectedToken?.balance.toLocaleString() ?? "0"}</span></div>
              <input autoFocus inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(event) => { setAmount(event.target.value); setError(""); }} className="w-full rounded-xl bg-[#415782] px-3 py-3 text-lg text-white outline-none placeholder:text-white/35" placeholder="0" />
              <div className="mt-2 flex gap-2">{["0.1", "1", "10"].map((preset) => <button key={preset} type="button" onClick={() => setAmount(preset)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/15">+{preset}</button>)}</div>
            </div>
            <div className="rounded-2xl bg-[#415782] px-4 py-3 text-sm"><div className="flex items-center justify-between text-white/55"><span>Estimated value</span><span className="font-semibold text-white">{formatMoney(estimatedValue)}</span></div><div className="mt-2 flex items-center justify-between text-white/55"><span>New balance</span><span className="font-semibold text-white">{selectedToken ? (selectedToken.balance + (Number.isFinite(quantity) ? quantity : 0)).toLocaleString() : "0"} {selectedToken?.symbol}</span></div></div>
            {error ? <p className="rounded-xl bg-rose-400/15 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#a9a0ff] px-4 py-3.5 text-sm font-bold text-[#29264c] hover:bg-[#c0baff]"><ShoppingBag className="h-4 w-4" /> Buy {selectedToken?.symbol}</button>
          </form>
        )}
      </section>
    </div>
  );
}

export function DownloadWallet() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<WalletToken | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [cashVisible, setCashVisible] = useState(true);
  const [tokenQuery, setTokenQuery] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setTokens(getTokens().map(decorateToken)), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const total = useMemo(() => tokens.reduce((sum, token) => sum + token.price * token.balance, 0), [tokens]);
  const totalChange = useMemo(() => {
    if (total === 0) {
      return 0;
    }

    return tokens.reduce((sum, token) => sum + ((token.price * token.balance) / total) * token.change24h, 0);
  }, [tokens, total]);
  const visibleTokens = useMemo(() => {
    const query = tokenQuery.trim().toLowerCase();
    if (!query) {
      return tokens;
    }

    return tokens.filter((token) => token.name.toLowerCase().includes(query) || token.symbol.toLowerCase().includes(query));
  }, [tokenQuery, tokens]);

  const openAddToken = () => {
    setSettingsOpen(false);
    setEditingToken(null);
    setEditorOpen(true);
  };

  const openEditToken = (token: WalletToken) => {
    setSettingsOpen(false);
    setEditingToken(token);
    setEditorOpen(true);
  };

  const handleSaveToken = (form: TokenForm) => {
    const saved = saveToken({
      id: form.id,
      name: form.name,
      symbol: form.symbol,
      price: Number(form.price),
      balance: Number(form.balance),
      change24h: Number(form.change24h),
      image: form.image.trim() || "https://placehold.co/64x64/0f172a/e2e8f0?text=T",
    });

    setTokens((current) => {
      const next = decorateToken(saved);
      const index = current.findIndex((token) => token.id === saved.id);
      if (index < 0) {
        return [...current, next];
      }

      const updated = [...current];
      updated[index] = next;
      return updated;
    });
    setEditorOpen(false);
    setEditingToken(null);
    notify(`${saved.name} saved to your simulated wallet.`);
  };

  const handleDeleteToken = (token: Token) => {
    setTokens(deleteToken(token.id).map(decorateToken));
    notify(`${token.name} deleted from your simulated wallet.`);
  };

  const handleBuyToken = (token: Token, amount: number) => {
    const saved = saveToken({ ...token, balance: token.balance + amount });
    setTokens((current) => current.map((item) => item.id === saved.id ? decorateToken(saved) : item));
    setBuyOpen(false);
    notify(`${amount.toLocaleString()} ${token.symbol} added to your simulated wallet.`);
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
              <div className="mt-1 text-[3.8rem] font-medium leading-none tracking-[-0.07em] text-white">{formatMoney(total)}</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-white/45"><span>{formatMoney(total * (totalChange / 100))}</span><span className="rounded-md bg-[#a9a0ff]/25 px-2 py-1 text-[#beb7ff]">{totalChange.toFixed(2)}%</span></div>

              <button type="button" onClick={() => setCashVisible((value) => !value)} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-[#303951] px-4 py-3.5 text-left transition hover:bg-[#39445f]">
                <span className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">▣</span> Cash</span>
                <span className="flex items-center gap-2 text-sm font-semibold text-white/75">{cashVisible ? "$0.00" : "••••"}{cashVisible ? <Eye className="h-4 w-4 text-white/35" /> : <EyeOff className="h-4 w-4 text-white/35" />}</span>
              </button>

              <div className="mt-7 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold tracking-[-0.04em]">Tokens</h2><ChevronRight className="h-6 w-6 text-white/70" /></div><button type="button" onClick={() => setSettingsOpen(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white/65 hover:bg-white/10 hover:text-white"><Settings className="h-3.5 w-3.5" /> Manage</button></div>
              <div className="mt-3 space-y-1">
                {visibleTokens.map((token) => (
                  <button key={token.id} type="button" onClick={() => openEditToken(token)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left transition hover:bg-white/[0.05]">
                    <TokenMark token={token} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium text-white/90">{token.name} <span className="text-xs text-[#b0a5ff]">●</span></span><span className="mt-0.5 block text-xs text-white/45">{token.balance.toLocaleString()} {token.symbol}</span></span>
                    <span className="text-right"><span className="block text-sm text-white/80">{formatMoney(token.balance * token.price)}</span><span className="mt-0.5 block text-xs text-white/40">{token.change24h.toFixed(2)}%</span></span>
                  </button>
                ))}
                {tokens.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/50"><p>No tokens yet.</p><button type="button" onClick={openAddToken} className="mt-3 rounded-xl bg-[#a9a0ff] px-4 py-2 text-xs font-bold text-[#211d43]">Add your first token</button></div> : null}
                {tokens.length > 0 && visibleTokens.length === 0 ? <p className="rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-sm text-white/50">No tokens match “{tokenQuery}”.</p> : null}
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
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-[#232734] px-3 py-3 text-sm text-white/45"><Search className="h-4 w-4 shrink-0" /><input value={tokenQuery} onChange={(event) => setTokenQuery(event.target.value)} placeholder="Search tokens" aria-label="Search tokens" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" /></label>
          <button type="button" onClick={() => setActionsOpen((value) => !value)} aria-label="Open wallet actions" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#a9a0ff] text-[#211d43] shadow-lg shadow-[#a9a0ff]/20 transition hover:scale-105"><Plus className={`h-6 w-6 transition ${actionsOpen ? "rotate-45" : ""}`} /></button>
        </div>

        {actionsOpen ? <div className="absolute bottom-[5.4rem] right-5 z-30 space-y-2 sm:bottom-[6.3rem] sm:right-7">{actionItems.map(({ label, icon: Icon, tone }) => <button key={label} type="button" onClick={() => { setActionsOpen(false); if (label === "Buy") { setBuyOpen(true); } else { notify(`${label} opened in simulation mode`); } }} className="flex items-center gap-3 text-sm font-semibold text-white drop-shadow-lg"><span>{label}</span><span className={`grid h-10 w-10 place-items-center rounded-full shadow-xl ${tone}`}><Icon className="h-5 w-5" /></span></button>)}</div> : null}
        {drawerOpen ? <SideDrawer onClose={() => setDrawerOpen(false)} onSettings={() => { setDrawerOpen(false); setSettingsOpen(true); }} /> : null}
        {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} tokens={tokens} onEditToken={openEditToken} onAddToken={openAddToken} onDeleteToken={handleDeleteToken} /> : null}
        {editorOpen ? <TokenEditor key={editingToken?.id ?? "new-token"} token={editingToken} onClose={() => { setEditorOpen(false); setEditingToken(null); }} onSave={handleSaveToken} /> : null}
        {buyOpen ? <BuyPanel tokens={tokens} onClose={() => setBuyOpen(false)} onBuy={handleBuyToken} /> : null}
        {toast ? <div className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#27314b] px-4 py-2 text-xs text-white/85 shadow-xl">{toast}</div> : null}
      </div>
    </main>
  );
}
