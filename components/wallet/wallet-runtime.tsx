"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Fingerprint,
  History,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { WalletThemeId } from "@/config/wallets";
import type { WalletToken } from "@/lib/types";
import {
  calculateNetworkFee,
  createBrowserWalletRepository,
  notifyWalletLedgerChanged,
  selectedAccount,
  sortedAccountAssets,
  transactionsForAccount,
  walletLedgerEvent,
  walletLedgerStorageKey,
  type WalletAccount,
  type WalletLedgerRepository,
  type WalletLedgerState,
  type SimulatedTransaction,
} from "@/lib/wallet-ledger";

type RuntimePanel = "transfer" | "receive" | "accounts" | "history" | "security" | null;

type WalletRuntimeValue = {
  state: WalletLedgerState | null;
  currentAccount: WalletAccount | null;
  openTransfer: (symbol?: string) => void;
  openReceive: () => void;
  openAccounts: () => void;
  openHistory: () => void;
  openSecurity: () => void;
  replaceCurrentBalances: (balances: Record<string, number>) => void;
  renameCurrentAccount: (name: string) => void;
  updateMarketAssets: (tokens: WalletToken[]) => void;
  refresh: () => void;
};

const WalletRuntimeContext = createContext<WalletRuntimeValue | null>(null);

const walletLabels: Record<WalletThemeId, string> = { ghost: "Phantom", ledger: "Ledger", trust: "Trust Wallet" };
const securityUserKey = "phantom_wallet_security_user";
const securitySettingsKey = "phantom_wallet_security_settings";
const unlockedSessionKey = "phantom_wallet_unlocked_at";

type SecuritySettings = { enabled: boolean; timeoutMinutes: number };
type SecurityStatus = { enrolled: boolean; credentialCount: number; pinEnabled: boolean; authenticated: boolean };

function randomClientId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function amount(value: number, maximumFractionDigits = 8) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function readClientJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

async function jsonRequest<T>(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

function useWalletSecurity() {
  const [userId, setUserId] = useState("");
  const [settings, setSettings] = useState<SecuritySettings>({ enabled: false, timeoutMinutes: 5 });
  const [status, setStatus] = useState<SecurityStatus>({ enrolled: false, credentialCount: 0, pinEnabled: false, authenticated: false });
  const [supported, setSupported] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastActivity = useRef(0);
  const backgroundedAt = useRef<number | null>(null);

  const refreshStatus = useCallback(async (id: string) => {
    const next = await jsonRequest<SecurityStatus>(`/api/wallet-security/session?userId=${encodeURIComponent(id)}`, undefined, "GET");
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      let id = window.localStorage.getItem(securityUserKey);
      if (!id) {
        id = randomClientId("walletuser").replace(/[^a-zA-Z0-9_-]/g, "");
        window.localStorage.setItem(securityUserKey, id);
      }
      const storedSettings = readClientJson<SecuritySettings>(securitySettingsKey, { enabled: false, timeoutMinutes: 5 });
      lastActivity.current = Date.now();
      setUserId(id);
      setSettings(storedSettings);
      const hasRecentUnlock = Number(window.sessionStorage.getItem(unlockedSessionKey) || 0) > Date.now() - storedSettings.timeoutMinutes * 60_000;
      void Promise.all([
        browserSupportsWebAuthn() ? platformAuthenticatorIsAvailable().catch(() => false) : Promise.resolve(false),
        refreshStatus(id).catch(() => ({ enrolled: false, credentialCount: 0, pinEnabled: false, authenticated: false })),
      ]).then(([platformSupported, serverStatus]) => {
        setSupported(platformSupported);
        setLocked(storedSettings.enabled && (serverStatus.enrolled || serverStatus.pinEnabled) && !hasRecentUnlock);
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshStatus]);

  const lock = useCallback(async () => {
    window.sessionStorage.removeItem(unlockedSessionKey);
    setLocked(true);
    setError("");
    await fetch("/api/wallet-security/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!settings.enabled || (!status.enrolled && !status.pinEnabled) || locked) return;
    const activity = () => { lastActivity.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= settings.timeoutMinutes * 60_000) void lock();
    }, 5_000);
    const visibility = () => {
      if (document.hidden) backgroundedAt.current = Date.now();
      else if (backgroundedAt.current && Date.now() - backgroundedAt.current >= settings.timeoutMinutes * 60_000) void lock();
      else backgroundedAt.current = null;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(interval);
    };
  }, [lock, locked, settings.enabled, settings.timeoutMinutes, status.enrolled, status.pinEnabled]);

  const register = useCallback(async () => {
    if (!userId || !supported) throw new Error("This device does not offer a supported platform authenticator.");
    setBusy(true);
    setError("");
    try {
      const optionsJSON = await jsonRequest<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/wallet-security/register/options", { userId, userName: "Phantom wallet user" });
      const response = await startRegistration({ optionsJSON });
      await jsonRequest("/api/wallet-security/register/verify", { userId, response });
      const nextSettings = { ...settings, enabled: true };
      setSettings(nextSettings);
      window.localStorage.setItem(securitySettingsKey, JSON.stringify(nextSettings));
      window.sessionStorage.setItem(unlockedSessionKey, String(Date.now()));
      setLocked(false);
      await refreshStatus(userId);
    } catch (caught) {
      const message = caught instanceof Error && caught.name === "NotAllowedError" ? "Biometric enrollment was cancelled or timed out." : caught instanceof Error ? caught.message : "Biometric enrollment failed.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, settings, supported, userId]);

  const unlock = useCallback(async () => {
    if (!userId || !supported) throw new Error("Biometric unlock is not supported on this device.");
    setBusy(true);
    setError("");
    try {
      const optionsJSON = await jsonRequest<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/wallet-security/authenticate/options", { userId });
      const response = await startAuthentication({ optionsJSON });
      await jsonRequest("/api/wallet-security/authenticate/verify", { userId, response });
      window.sessionStorage.setItem(unlockedSessionKey, String(Date.now()));
      lastActivity.current = Date.now();
      setLocked(false);
      await refreshStatus(userId);
    } catch (caught) {
      const message = caught instanceof Error && caught.name === "NotAllowedError" ? "Biometric verification was cancelled or timed out." : caught instanceof Error ? caught.message : "Biometric verification failed.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, supported, userId]);

  const verifyPin = useCallback(async (pin: string) => {
    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/wallet-security/pin", { userId, pin, action: "verify" });
      window.sessionStorage.setItem(unlockedSessionKey, String(Date.now()));
      lastActivity.current = Date.now();
      setLocked(false);
      await refreshStatus(userId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Recovery PIN verification failed.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, userId]);

  const setPin = useCallback(async (pin: string) => {
    setBusy(true);
    setError("");
    try {
      await jsonRequest("/api/wallet-security/pin", { userId, pin, action: "set" });
      const nextSettings = { ...settings, enabled: true };
      setSettings(nextSettings);
      window.localStorage.setItem(securitySettingsKey, JSON.stringify(nextSettings));
      await refreshStatus(userId);
    } finally {
      setBusy(false);
    }
  }, [refreshStatus, settings, userId]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await jsonRequest("/api/wallet-security/session", { userId }, "DELETE");
      const nextSettings = { ...settings, enabled: false };
      setSettings(nextSettings);
      window.localStorage.setItem(securitySettingsKey, JSON.stringify(nextSettings));
      setStatus((current) => ({ ...current, enrolled: false, credentialCount: 0, authenticated: false }));
      setLocked(false);
    } finally {
      setBusy(false);
    }
  }, [settings, userId]);

  const updateTimeout = useCallback((timeoutMinutes: number) => {
    const next = { ...settings, timeoutMinutes };
    setSettings(next);
    window.localStorage.setItem(securitySettingsKey, JSON.stringify(next));
  }, [settings]);

  return { userId, settings, status, supported, locked, busy, error, register, unlock, verifyPin, setPin, disable, lock, updateTimeout };
}

export function WalletRuntimeProvider({ walletId, children }: { walletId: WalletThemeId; children: ReactNode }) {
  const repositoryRef = useRef<WalletLedgerRepository | null>(null);
  const [repository, setRepository] = useState<WalletLedgerRepository | null>(null);
  const [state, setState] = useState<WalletLedgerState | null>(null);
  const [panel, setPanel] = useState<RuntimePanel>(null);
  const [preferredSymbol, setPreferredSymbol] = useState<string>();
  const security = useWalletSecurity();

  const refresh = useCallback(() => {
    const repository = repositoryRef.current;
    if (!repository) return;
    setState(repository.getState());
  }, []);

  const commitAndNotify = useCallback((next: WalletLedgerState) => {
    setState(next);
    notifyWalletLedgerChanged(next);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextRepository = createBrowserWalletRepository();
      if (!nextRepository) return;
      repositoryRef.current = nextRepository;
      setRepository(nextRepository);
      const next = nextRepository.getState();
      setState(next);
      notifyWalletLedgerChanged(next);
    }, 0);
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === walletLedgerStorageKey) refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(walletLedgerEvent, refresh);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(walletLedgerEvent, refresh);
    };
  }, [refresh]);

  const currentAccount = state ? selectedAccount(state, walletId) : null;
  const value = useMemo<WalletRuntimeValue>(() => ({
    state,
    currentAccount,
    openTransfer: (symbol) => { setPreferredSymbol(symbol); setPanel("transfer"); },
    openReceive: () => setPanel("receive"),
    openAccounts: () => setPanel("accounts"),
    openHistory: () => setPanel("history"),
    openSecurity: () => setPanel("security"),
    replaceCurrentBalances: (balances) => {
      if (!repositoryRef.current || !currentAccount) return;
      commitAndNotify(repositoryRef.current.replaceBalances(walletId, currentAccount.id, balances));
    },
    renameCurrentAccount: (name) => {
      if (!repositoryRef.current || !currentAccount || !name.trim()) return;
      commitAndNotify(repositoryRef.current.renameAccount(walletId, currentAccount.id, name));
    },
    updateMarketAssets: (tokens) => {
      if (!repositoryRef.current) return;
      setState(repositoryRef.current.updateAssets(tokens));
    },
    refresh,
  }), [commitAndNotify, currentAccount, refresh, state, walletId]);

  return (
    <WalletRuntimeContext.Provider value={value}>
      {children}
      {state && panel && repository ? <WalletRuntimeSheet walletId={walletId} initialPanel={panel} preferredSymbol={preferredSymbol} state={state} repository={repository} security={security} onCommit={commitAndNotify} onClose={() => setPanel(null)} /> : null}
      {security.locked ? <WalletLockScreen security={security} /> : null}
    </WalletRuntimeContext.Provider>
  );
}

export function useWalletRuntime() {
  const value = useContext(WalletRuntimeContext);
  if (!value) throw new Error("useWalletRuntime must be used inside WalletRuntimeProvider.");
  return value;
}

function WalletRuntimeSheet({ walletId, initialPanel, preferredSymbol, state, repository, security, onCommit, onClose }: {
  walletId: WalletThemeId;
  initialPanel: Exclude<RuntimePanel, null>;
  preferredSymbol?: string;
  state: WalletLedgerState;
  repository: WalletLedgerRepository;
  security: ReturnType<typeof useWalletSecurity>;
  onCommit: (state: WalletLedgerState) => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState(initialPanel);
  const touchStart = useRef(0);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    sheetRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  const title = panel === "transfer" ? "Send" : panel === "receive" ? "Receive" : panel === "accounts" ? "Accounts" : panel === "history" ? "Activity" : "Security";
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center" role="presentation">
      <button type="button" aria-label="Close wallet sheet" className="absolute inset-0" onClick={onClose} />
      <section ref={sheetRef} tabIndex={-1} aria-label={title} className="relative flex max-h-[94dvh] min-h-[68dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[2.2rem] border border-white/10 bg-[#111112] text-white shadow-[0_-20px_80px_rgba(0,0,0,.7)] outline-none sm:max-h-[88dvh] sm:rounded-[2.2rem]" onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? 0; }} onTouchEnd={(event) => { if ((event.changedTouches[0]?.clientY ?? 0) - touchStart.current > 110) onClose(); }}>
        <header className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-3">
          <div className="mx-auto h-1.5 w-16 rounded-full bg-white/35" />
          <div className="mt-4 flex items-center justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a99bf7]">Wallet simulator</p><h1 className="mt-1 text-[28px] font-semibold tracking-[-.04em]">{title}</h1></div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-[#252527]"><X className="h-5 w-5" /></button>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Wallet tools">
            {(["transfer", "receive", "accounts", "history", "security"] as const).map((item) => {
              const Icon = item === "transfer" ? Send : item === "receive" ? QrCode : item === "accounts" ? WalletCards : item === "history" ? History : Settings;
              return <button key={item} type="button" onClick={() => setPanel(item)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold capitalize ${panel === item ? "bg-[#a295f3] text-black" : "bg-[#232325] text-white/60"}`}><Icon className="h-4 w-4" />{item}</button>;
            })}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5">
          {panel === "transfer" ? <TransferPanel walletId={walletId} preferredSymbol={preferredSymbol} state={state} repository={repository} onCommit={onCommit} /> : null}
          {panel === "receive" ? <ReceivePanel walletId={walletId} state={state} /> : null}
          {panel === "accounts" ? <AccountsPanel activeWalletId={walletId} state={state} repository={repository} onCommit={onCommit} /> : null}
          {panel === "history" ? <HistoryPanel walletId={walletId} state={state} /> : null}
          {panel === "security" ? <SecurityPanel security={security} /> : null}
        </div>
      </section>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-white/40">{children}</span>;
}

function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="relative block"><select {...props} className="h-14 w-full appearance-none rounded-[1.2rem] border border-white/[0.06] bg-[#202022] px-4 pr-11 text-[16px] font-medium text-white outline-none focus:ring-2 focus:ring-[#a295f3] disabled:opacity-40" /><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" /></span>;
}

function TransferPanel({ walletId, preferredSymbol, state, repository, onCommit }: { walletId: WalletThemeId; preferredSymbol?: string; state: WalletLedgerState; repository: WalletLedgerRepository; onCommit: (state: WalletLedgerState) => void }) {
  const initialSource = selectedAccount(state, walletId);
  const firstOtherWallet = walletId === "ghost" ? "ledger" : "ghost";
  const [sourceWalletId, setSourceWalletId] = useState<WalletThemeId>(walletId);
  const [sourceAccountId, setSourceAccountId] = useState(initialSource.id);
  const [destinationWalletId, setDestinationWalletId] = useState<WalletThemeId>(firstOtherWallet);
  const [destinationAccountId, setDestinationAccountId] = useState(state.wallets[firstOtherWallet].selectedAccountId);
  const [useAddress, setUseAddress] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState("");
  const sourceAccount = state.wallets[sourceWalletId].accounts.find((account) => account.id === sourceAccountId) ?? state.wallets[sourceWalletId].accounts[0];
  const available = sortedAccountAssets(state, sourceAccount).filter((entry) => entry.balance > 0);
  const initialSymbol = preferredSymbol && available.some((entry) => entry.asset.symbol === preferredSymbol) ? preferredSymbol : available[0]?.asset.symbol ?? "SOL";
  const [symbol, setSymbol] = useState(initialSymbol);
  const [amountValue, setAmountValue] = useState("");
  const [stage, setStage] = useState<"form" | "review" | "processing" | "failed" | "success">("form");
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<SimulatedTransaction | null>(null);
  const requestId = useRef(randomClientId("transfer"));
  const numericAmount = Number(amountValue);
  const fee = Number.isFinite(numericAmount) && numericAmount > 0 ? calculateNetworkFee(symbol, numericAmount) : calculateNetworkFee(symbol, 0);
  const balance = sourceAccount.balances[symbol] ?? 0;
  const asset = state.assets[symbol];

  const changeSourceWallet = (nextWalletId: WalletThemeId) => {
    const account = selectedAccount(state, nextWalletId);
    setSourceWalletId(nextWalletId);
    setSourceAccountId(account.id);
    const entries = sortedAccountAssets(state, account).filter((entry) => entry.balance > 0);
    setSymbol(entries[0]?.asset.symbol ?? "SOL");
    setAmountValue("");
  };

  const review = () => {
    setError("");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter an amount greater than zero.");
    if (numericAmount + fee > balance + Number.EPSILON) return setError(`Insufficient ${symbol}, including the ${fee} ${symbol} network fee.`);
    if (!useAddress && sourceAccountId === destinationAccountId) return setError("Source and destination accounts must be different.");
    setStage("review");
  };

  const confirm = async () => {
    if (stage !== "review") return;
    setStage("processing");
    setError("");
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    try {
      const completed = repository.executeTransfer({
        clientRequestId: requestId.current,
        sourceWalletId,
        sourceAccountId,
        destinationWalletId: useAddress ? undefined : destinationWalletId,
        destinationAccountId: useAddress ? undefined : destinationAccountId,
        destinationAddress: useAddress ? destinationAddress : undefined,
        tokenSymbol: symbol,
        amount: numericAmount,
      });
      onCommit(repository.getState());
      setTransaction(completed);
      setStage("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transfer failed.");
      setStage("failed");
    }
  };

  if (stage === "success" && transaction) {
    return <div className="py-7 text-center" role="status"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#00e676] text-black"><Check className="h-10 w-10 stroke-[3]" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer complete</h2><p className="mt-3 text-lg text-white/55">{amount(transaction.amount)} {transaction.tokenSymbol} arrived in the receiving simulated account.</p><div className="mt-7 rounded-[1.5rem] bg-[#1d1d1f] p-5 text-left text-sm"><Detail label="Status" value="Completed" /><Detail label="Network" value={transaction.network} /><Detail label="Network fee" value={`${transaction.fee} ${transaction.feeSymbol}`} /><Detail label="Transaction ID" value={transaction.id} mono /></div><p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-[#a99bf7]">Simulation only · not broadcast on-chain</p><button type="button" onClick={() => { requestId.current = randomClientId("transfer"); setAmountValue(""); setTransaction(null); setStage("form"); }} className="mt-7 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black">Send another</button></div>;
  }

  if (stage === "processing") {
    return <div className="grid min-h-80 place-items-center py-12 text-center" role="status"><div><span className="mx-auto block h-14 w-14 animate-spin rounded-full border-4 border-white/15 border-t-[#a295f3]" /><h2 className="mt-6 text-2xl font-semibold">Transfer pending…</h2><p className="mt-2 text-white/45">Updating both simulated accounts atomically.</p></div></div>;
  }

  if (stage === "failed") {
    return <div className="py-8 text-center" role="alert"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-500/15 text-red-300"><X className="h-10 w-10" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer failed</h2><p className="mt-3 text-white/55">{error || "The simulated transfer could not be completed."}</p><p className="mt-4 text-sm text-white/35">No balance changes were saved.</p><button type="button" onClick={() => setStage("review")} className="mt-7 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black">Review and try again</button></div>;
  }

  if (stage === "review") {
    const destination = useAddress ? destinationAddress : state.wallets[destinationWalletId].accounts.find((account) => account.id === destinationAccountId)?.address ?? "";
    return <div><button type="button" onClick={() => setStage("form")} className="flex items-center gap-2 text-[#a99bf7]"><ArrowLeft className="h-4 w-4" /> Edit transfer</button><h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">Review transfer</h2><div className="mt-6 rounded-[1.7rem] bg-[#1d1d1f] p-5"><div className="text-center"><span className="text-5xl font-semibold">{amount(numericAmount)}</span><span className="ml-2 text-2xl text-white/50">{symbol}</span><p className="mt-2 text-white/45">{money(numericAmount * (asset?.price ?? 0))}</p></div><div className="mt-7 border-t border-white/[0.07] pt-4"><Detail label="From" value={`${walletLabels[sourceWalletId]} · ${sourceAccount.name}`} /><Detail label="To" value={destination} mono /><Detail label="Network" value={asset?.network ?? symbol} /><Detail label="Network fee" value={`${fee} ${symbol}`} /><Detail label="Total debit" value={`${amount(numericAmount + fee)} ${symbol}`} /></div></div>{error ? <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="button" onClick={() => void confirm()} className="mt-6 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black disabled:opacity-50">Confirm simulated transfer</button><p className="mt-4 text-center text-xs uppercase tracking-[.1em] text-white/30">No blockchain transaction will be created</p></div>;
  }

  return <div><div className="rounded-[1.4rem] border border-[#a295f3]/20 bg-[#a295f3]/10 px-4 py-3 text-sm text-[#d9d2ff]"><strong>Simulator:</strong> transfers update this app only. No private keys or real funds are used.</div><div className="mt-6 grid grid-cols-2 gap-3"><label><FieldLabel>Source wallet</FieldLabel><SelectField value={sourceWalletId} onChange={(event) => changeSourceWallet(event.target.value as WalletThemeId)}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField></label><label><FieldLabel>Source account</FieldLabel><SelectField value={sourceAccountId} onChange={(event) => { setSourceAccountId(event.target.value); setAmountValue(""); }}>{state.wallets[sourceWalletId].accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField></label></div><label className="mt-4 block"><FieldLabel>Currency</FieldLabel><SelectField value={symbol} onChange={(event) => { setSymbol(event.target.value); setAmountValue(""); }}>{available.map((entry) => <option key={entry.asset.symbol} value={entry.asset.symbol}>{entry.asset.name} ({entry.asset.symbol}) · {amount(entry.balance)}</option>)}</SelectField></label><div className="mt-5 flex items-center justify-between"><FieldLabel>Destination</FieldLabel><button type="button" onClick={() => setUseAddress((value) => !value)} className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#a99bf7]"><QrCode className="h-4 w-4" />{useAddress ? "Choose account" : "Enter address"}</button></div>{useAddress ? <input value={destinationAddress} onChange={(event) => setDestinationAddress(event.target.value)} placeholder="Paste sim_… address" aria-label="Destination simulated address" className="h-14 w-full rounded-[1.2rem] bg-[#202022] px-4 font-mono text-sm outline-none focus:ring-2 focus:ring-[#a295f3]" /> : <div className="grid grid-cols-2 gap-3"><SelectField value={destinationWalletId} onChange={(event) => { const id = event.target.value as WalletThemeId; setDestinationWalletId(id); setDestinationAccountId(state.wallets[id].selectedAccountId); }}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField><SelectField value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)}>{state.wallets[destinationWalletId].accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField></div>}<div className="mt-5"><div className="flex items-center justify-between"><FieldLabel>Amount</FieldLabel><span className="mb-2 text-xs text-white/45">Available {amount(balance)} {symbol}</span></div><div className="flex items-center rounded-[1.2rem] bg-[#202022] px-4 focus-within:ring-2 focus-within:ring-[#a295f3]"><input inputMode="decimal" value={amountValue} onChange={(event) => setAmountValue(event.target.value)} placeholder="0" aria-label="Transfer amount" className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none" /><button type="button" onClick={() => setAmountValue(String(Math.max(0, balance - calculateNetworkFee(symbol, balance))))} className="rounded-full bg-[#343438] px-3 py-2 text-xs font-bold text-[#b8adff]">MAX</button></div><div className="mt-3 flex justify-between text-sm text-white/45"><span>Network fee</span><span>{fee} {symbol}</span></div></div>{error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="button" onClick={review} disabled={available.length === 0} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black disabled:opacity-40">Review transfer <ArrowRight className="h-5 w-5" /></button></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-5 border-b border-white/[0.055] py-3 last:border-0"><span className="text-white/45">{label}</span><span className={`min-w-0 break-all text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span></div>;
}

function ReceivePanel({ walletId, state }: { walletId: WalletThemeId; state: WalletLedgerState }) {
  const account = selectedAccount(state, walletId);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(account.address); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="py-5 text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] bg-white p-3 text-black"><QrCode className="h-full w-full" /></span><h2 className="mt-6 text-2xl font-semibold">Receive in {account.name}</h2><p className="mt-2 text-white/45">Use this simulated address as the destination in any of the three wallets.</p><button type="button" onClick={() => void copy()} className="mt-6 w-full rounded-[1.4rem] bg-[#202022] p-5 text-left"><span className="block text-xs font-bold uppercase tracking-[.1em] text-white/35">{walletLabels[walletId]} address</span><span className="mt-2 flex items-center justify-between gap-3 font-mono text-sm"><span className="break-all">{account.address}</span><Copy className="h-5 w-5 shrink-0 text-[#a99bf7]" /></span></button><p className="mt-4 text-sm text-[#00e676]">{copied ? "Address copied" : "Simulation address — not valid on a blockchain"}</p></div>;
}

function AccountsPanel({ activeWalletId, state, repository, onCommit }: { activeWalletId: WalletThemeId; state: WalletLedgerState; repository: WalletLedgerRepository; onCommit: (state: WalletLedgerState) => void }) {
  const [walletId, setWalletId] = useState(activeWalletId);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const wallet = state.wallets[walletId];
  const create = () => { if (!newName.trim()) return; repository.createAccount(walletId, newName); setNewName(""); onCommit(repository.getState()); };
  return <div><label><FieldLabel>Wallet</FieldLabel><SelectField value={walletId} onChange={(event) => setWalletId(event.target.value as WalletThemeId)}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField></label><div className="mt-6 space-y-3">{wallet.accounts.map((account) => { const active = wallet.selectedAccountId === account.id; const total = sortedAccountAssets(state, account).reduce((sum, entry) => sum + entry.value, 0); return <article key={account.id} className={`rounded-[1.5rem] border p-4 ${active ? "border-[#a295f3]/60 bg-[#a295f3]/10" : "border-white/[0.06] bg-[#1d1d1f]"}`}><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-full ${active ? "bg-[#a295f3] text-black" : "bg-[#2a2a2d]"}`}><UserRound className="h-5 w-5" /></span><div className="min-w-0 flex-1">{editing === account.id ? <input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-lg bg-[#29292b] px-3 py-2 outline-none ring-[#a295f3] focus:ring-2" /> : <><strong className="block truncate text-lg">{account.name}</strong><span className="text-sm text-white/45">{money(total)} · {account.address.slice(0, 13)}…</span></>} </div>{editing === account.id ? <button type="button" onClick={() => { repository.renameAccount(walletId, account.id, editName); setEditing(null); onCommit(repository.getState()); }} className="grid h-11 w-11 place-items-center rounded-full bg-[#a295f3] text-black"><Check className="h-5 w-5" /></button> : <button type="button" onClick={() => { setEditing(account.id); setEditName(account.name); }} aria-label={`Rename ${account.name}`} className="grid h-11 w-11 place-items-center rounded-full bg-[#29292b]"><Pencil className="h-4 w-4" /></button>}</div><button type="button" onClick={() => { onCommit(repository.selectAccount(walletId, account.id)); }} disabled={active} className="mt-4 w-full rounded-full bg-[#29292b] py-3 text-sm font-semibold text-[#b9afff] disabled:text-[#00e676]">{active ? "Current account" : "Switch to account"}</button></article>; })}</div><div className="mt-7 rounded-[1.5rem] bg-[#1d1d1f] p-4"><FieldLabel>Create account</FieldLabel><div className="flex gap-2"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={`Account ${wallet.accounts.length + 1}`} aria-label="New account name" className="h-13 min-w-0 flex-1 rounded-full bg-[#29292b] px-4 outline-none focus:ring-2 focus:ring-[#a295f3]" /><button type="button" onClick={create} disabled={!newName.trim()} className="grid h-13 w-13 place-items-center rounded-full bg-[#a295f3] text-black disabled:opacity-40"><Plus className="h-6 w-6" /></button></div></div></div>;
}

function HistoryPanel({ walletId, state }: { walletId: WalletThemeId; state: WalletLedgerState }) {
  const [query, setQuery] = useState("");
  const account = selectedAccount(state, walletId);
  const transactions = transactionsForAccount(state, account.id).filter((transaction) => `${transaction.id} ${transaction.tokenSymbol} ${transaction.senderAddress} ${transaction.recipientAddress}`.toLowerCase().includes(query.toLowerCase()));
  return <div><label className="flex h-14 items-center gap-3 rounded-full bg-[#202022] px-4"><Search className="h-5 w-5 text-white/35" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" aria-label="Search transaction history" className="min-w-0 flex-1 bg-transparent outline-none" /></label><p className="mt-5 text-sm text-white/45">{walletLabels[walletId]} · {account.name}</p><div className="mt-3 space-y-2">{transactions.map((transaction) => { const outgoing = transaction.sourceAccountId === account.id; return <article key={transaction.id} className="rounded-[1.35rem] bg-[#1d1d1f] p-4"><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-full ${outgoing ? "bg-[#30293a] text-[#b9afff]" : "bg-[#113426] text-[#00e676]"}`}>{outgoing ? <Send className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><strong className="block">{outgoing ? "Sent" : "Received"} {transaction.tokenSymbol}</strong><span className="block truncate text-sm text-white/40">{new Date(transaction.timestamp).toLocaleString("en-US")}</span></div><span className={`text-right font-semibold ${outgoing ? "text-white" : "text-[#00e676]"}`}>{outgoing ? "−" : "+"}{amount(transaction.amount)}<small className="ml-1 text-white/45">{transaction.tokenSymbol}</small></span></div><details className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-white/45"><summary className="cursor-pointer text-[#a99bf7]">Transaction details</summary><p className="mt-2 break-all font-mono">{transaction.id}</p><p className="mt-2">Status: {transaction.status} · Fee: {transaction.fee} {transaction.feeSymbol}</p><p className="mt-1 uppercase tracking-[.08em]">Not broadcast on-chain</p></details></article>; })}{transactions.length === 0 ? <p className="rounded-[1.4rem] bg-[#1d1d1f] px-4 py-10 text-center text-white/45">No matching simulated transactions.</p> : null}</div></div>;
}

function SecurityPanel({ security }: { security: ReturnType<typeof useWalletSecurity> }) {
  const [pin, setPinValue] = useState("");
  const [notice, setNotice] = useState("");
  const biometricLabel = /iPhone|iPad|iPod/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "Face ID" : "device biometrics";
  const run = async (operation: () => Promise<void>, success: string) => { setNotice(""); try { await operation(); setNotice(success); } catch (error) { setNotice(error instanceof Error ? error.message : "Security action failed."); } };
  return <div><div className="flex items-start gap-4 rounded-[1.5rem] bg-[#1d1d1f] p-5"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#29243a] text-[#b8adff]"><ShieldCheck className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold">Wallet lock</h2><p className="mt-1 text-sm leading-relaxed text-white/45">WebAuthn verifies your device on the server. The app never receives or stores biometric data.</p></div></div>{security.supported === false ? <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">This browser/device does not expose a user-verifying platform authenticator. Set a recovery PIN below.</p> : null}<div className="mt-5 space-y-3">{!security.status.enrolled ? <button type="button" disabled={!security.supported || security.busy} onClick={() => void run(security.register, `${biometricLabel} enabled.`)} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] px-4 font-semibold text-black disabled:opacity-40"><Fingerprint className="h-5 w-5" />Enable {biometricLabel}</button> : <><button type="button" disabled={security.busy} onClick={() => void run(security.unlock, "Identity verified.")} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] px-4 font-semibold text-black disabled:opacity-40"><Fingerprint className="h-5 w-5" />Verify with {biometricLabel}</button><button type="button" disabled={security.busy} onClick={() => void run(security.disable, `${biometricLabel} disabled.`)} className="min-h-14 w-full rounded-full bg-[#29292b] px-4 font-semibold text-red-300 disabled:opacity-40">Disable {biometricLabel}</button></>}<label className="block rounded-[1.4rem] bg-[#1d1d1f] p-4"><FieldLabel>Auto-lock timeout</FieldLabel><SelectField value={security.settings.timeoutMinutes} onChange={(event) => security.updateTimeout(Number(event.target.value))}><option value={1}>After 1 minute</option><option value={5}>After 5 minutes</option><option value={15}>After 15 minutes</option><option value={30}>After 30 minutes</option></SelectField></label><div className="rounded-[1.4rem] bg-[#1d1d1f] p-4"><FieldLabel>{security.status.pinEnabled ? "Change recovery PIN" : "Create recovery PIN"}</FieldLabel><div className="flex gap-2"><input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6–12 digits" aria-label="Recovery PIN" className="h-13 min-w-0 flex-1 rounded-full bg-[#29292b] px-4 outline-none focus:ring-2 focus:ring-[#a295f3]" /><button type="button" disabled={security.busy || pin.length < 6} onClick={() => void run(() => security.setPin(pin), "Recovery PIN saved.")} className="rounded-full bg-[#a295f3] px-5 font-semibold text-black disabled:opacity-40">Save</button></div></div><button type="button" onClick={() => void security.lock()} disabled={!security.status.enrolled && !security.status.pinEnabled} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/15 font-semibold disabled:opacity-35"><Lock className="h-5 w-5" />Lock Wallet</button></div>{notice || security.error ? <p role="status" className="mt-4 rounded-xl bg-[#252527] px-4 py-3 text-sm text-white/70">{notice || security.error}</p> : null}</div>;
}

function WalletLockScreen({ security }: { security: ReturnType<typeof useWalletSecurity> }) {
  const [pin, setPin] = useState("");
  const biometricLabel = /iPhone|iPad|iPod/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "Face ID" : "biometrics";
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black px-5 text-white"><main className="w-full max-w-[440px] text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] bg-[#a295f3] text-black shadow-[0_0_80px_rgba(162,149,243,.25)]"><Lock className="h-11 w-11" /></span><h1 className="mt-7 text-4xl font-semibold tracking-[-.05em]">Phantom is locked</h1><p className="mx-auto mt-3 max-w-sm text-white/50">Verify on this device to open your simulated wallets. No biometric data leaves your authenticator.</p><button type="button" disabled={!security.supported || security.busy} onClick={() => void security.unlock().catch(() => undefined)} className="mt-8 flex min-h-15 w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] text-lg font-semibold text-black disabled:opacity-40"><Fingerprint className="h-6 w-6" />Unlock with {biometricLabel}</button>{security.status.pinEnabled ? <div className="mt-5 rounded-[1.5rem] bg-[#19191b] p-4"><p className="mb-3 flex items-center justify-center gap-2 text-sm text-white/50"><KeyRound className="h-4 w-4" />Recovery PIN</p><div className="flex gap-2"><input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Enter PIN" aria-label="Recovery PIN" className="h-14 min-w-0 flex-1 rounded-full bg-[#29292b] px-5 text-center text-lg tracking-[.2em] outline-none focus:ring-2 focus:ring-[#a295f3]" /><button type="button" onClick={() => void security.verifyPin(pin).catch(() => undefined)} disabled={security.busy || pin.length < 6} className="grid h-14 w-14 place-items-center rounded-full bg-[#a295f3] text-black disabled:opacity-40"><ArrowRight className="h-6 w-6" /></button></div></div> : null}{security.error ? <p role="alert" className="mt-4 text-sm text-red-300">{security.error}</p> : null}<p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-white/25">Wallet simulator · no real funds</p></main></div>;
}
