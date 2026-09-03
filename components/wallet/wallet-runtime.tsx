"use client";

import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
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
  Share2,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { AddressQrCode } from "@/components/wallet/address-qr-code";
import { CameraQrScanner } from "@/components/wallet/camera-qr-scanner";
import { useSwipeDismiss } from "@/components/wallet/use-swipe-dismiss";
import type { WalletThemeId } from "@/config/wallets";
import {
  getWalletOwnerIdFromCookie,
  isLicenseWalletOwnerId,
  resolveWalletOwnerId,
} from "@/lib/auth";
import { validateLicense } from "@/lib/license";
import { normalizeLicenseKey } from "@/lib/storage";
import type { WalletToken } from "@/lib/types";
import {
  accountForSelection,
  calculateNetworkFee,
  createBrowserWalletRepository,
  notifyWalletLedgerChanged,
  selectedAccount,
  sortedAccountAssets,
  transactionsForAccount,
  walletAccountDomain,
  walletAccountIdFromDomain,
  walletLedgerEvent,
  walletLedgerStorageKeyFor,
  type BalanceOperationInput,
  type RemoteWalletSnapshot,
  type TransferInput,
  type WalletAccount,
  type WalletLedgerRepository,
  type WalletLedgerState,
  type SimulatedTransaction,
  type WalletBalanceOperation,
} from "@/lib/wallet-ledger";

type RuntimePanel = "transfer" | "receive" | "accounts" | "history" | "security" | null;
type ReceiveMode = "token" | "cash";
export type RuntimeBalanceOperationInput = Pick<BalanceOperationInput, "clientRequestId" | "deltas" | "activities">;

type WalletRuntimeValue = {
  state: WalletLedgerState | null;
  currentAccount: WalletAccount | null;
  openTransfer: (symbol?: string) => void;
  openScanner: () => void;
  openReceive: (mode?: ReceiveMode) => void;
  openAccounts: () => void;
  openHistory: () => void;
  openSecurity: () => void;
  applyBalanceOperation: (input: RuntimeBalanceOperationInput) => Promise<WalletBalanceOperation>;
  replaceCurrentBalances: (balances: Record<string, number>) => Promise<boolean>;
  saveCurrentAccountName: (name: string) => Promise<boolean>;
  renameCurrentAccount: (name: string) => void;
  updateMarketAssets: (tokens: WalletToken[]) => void;
  refresh: () => void;
};

const WalletRuntimeContext = createContext<WalletRuntimeValue | null>(null);

const walletLabels: Record<WalletThemeId, string> = { ghost: "Phantom", ledger: "Larpz Wallet", trust: "Larpz Trust-style Wallet" };
const walletDisclosures: Record<WalletThemeId, string> = {
  ghost: "",
  ledger: "LARPZ WALLET · INTERNAL DEMO · NO REAL FUNDS",
  trust: "LARPZ WALLET · TRUST-STYLE DEMO · NO REAL FUNDS",
};
const securityUserKey = "phantom_wallet_security_user";
const securitySettingsKey = "phantom_wallet_security_settings";
const unlockedSessionKey = "phantom_wallet_unlocked_at";
const anonymousWalletOwnerKey = "phantom_wallet_owner_id";
const sharedLedgerBroadcastChannel = "larpz-wallet-ledger-refresh-v1";

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

type SharedLedgerStatus = "connecting" | "connected" | "local" | "error";
type SharedLedgerResponse = {
  connected: boolean;
  snapshot?: RemoteWalletSnapshot;
  transaction?: SimulatedTransaction;
  operation?: WalletBalanceOperation;
  ownerId?: string;
  error?: string;
  code?: string;
};

class SharedLedgerRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SharedLedgerRequestError";
  }
}

async function sharedLedgerRequest(body: unknown) {
  const response = await fetch("/api/wallet-ledger", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json() as SharedLedgerResponse;
  if (!response.ok) throw new SharedLedgerRequestError(data.code ?? "REMOTE_ERROR", data.error ?? "Shared wallet request failed.");
  if (!data.connected && !(data.code === "DATABASE_NOT_CONFIGURED" && data.ownerId)) {
    throw new SharedLedgerRequestError(data.code ?? "REMOTE_ERROR", data.error ?? "Shared wallet request failed.");
  }
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
      const optionsJSON = await jsonRequest<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/wallet-security/register/options", { userId, userName: "Larpz Wallet user" });
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
  const { user, loading: authLoading, loginWithLicense } = useAuth();
  const repositoryRef = useRef<WalletLedgerRepository | null>(null);
  const sharedStatusRef = useRef<SharedLedgerStatus>("connecting");
  const activeOwnerIdRef = useRef("");
  const remoteRequestQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pullRemoteRef = useRef<(() => Promise<void>) | null>(null);
  const sharedBroadcastRef = useRef<BroadcastChannel | null>(null);
  const [repository, setRepository] = useState<WalletLedgerRepository | null>(null);
  const [state, setState] = useState<WalletLedgerState | null>(null);
  const [cookieOwnerId, setCookieOwnerId] = useState("");
  const [legacyOwnerId, setLegacyOwnerId] = useState("");
  const [identityChecked, setIdentityChecked] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [sharedStatus, setSharedStatus] = useState<SharedLedgerStatus>("connecting");
  const [sharedError, setSharedError] = useState("");
  const [panel, setPanel] = useState<RuntimePanel>(null);
  const [scannerRequested, setScannerRequested] = useState(false);
  const [preferredSymbol, setPreferredSymbol] = useState<string>();
  const [preferredReceiveMode, setPreferredReceiveMode] = useState<ReceiveMode>("token");
  const security = useWalletSecurity();
  const ownerId = resolveWalletOwnerId(cookieOwnerId, user?.id);

  useEffect(() => {
    activeOwnerIdRef.current = ownerId;
  }, [ownerId]);

  const enqueueSharedRequest = useCallback((body: unknown) => {
    const request = remoteRequestQueueRef.current.then(
      () => sharedLedgerRequest(body),
      () => sharedLedgerRequest(body),
    );
    remoteRequestQueueRef.current = request.then(() => undefined, () => undefined);
    return request;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const storedCookieOwnerId = getWalletOwnerIdFromCookie() ?? "";
      const storedLegacyOwnerId = isLicenseWalletOwnerId(storedCookieOwnerId)
        ? window.localStorage.getItem(anonymousWalletOwnerKey) ?? ""
        : storedCookieOwnerId.startsWith("walletowner_")
          ? storedCookieOwnerId
          : window.localStorage.getItem(anonymousWalletOwnerKey) ?? "";
      setCookieOwnerId(storedCookieOwnerId);
      setLegacyOwnerId(storedLegacyOwnerId.startsWith("walletowner_") ? storedLegacyOwnerId : "");

      const activatedOwnerId = resolveWalletOwnerId(storedCookieOwnerId, user?.id);
      if (activatedOwnerId && storedLegacyOwnerId.startsWith("walletowner_") && user?.licenseKey) {
        void sharedLedgerRequest({
          action: "linkOwner",
          licenseKey: user.licenseKey,
          legacyOwnerId: storedLegacyOwnerId,
        }).then((response) => {
          if (cancelled) return;
          if (response.ownerId !== activatedOwnerId) throw new Error("The activation identity did not match this wallet.");
          window.localStorage.removeItem(anonymousWalletOwnerKey);
          setLegacyOwnerId("");
          setIdentityError("");
          setIdentityChecked(true);
        }).catch((caught) => {
          if (cancelled) return;
          setIdentityError(caught instanceof Error ? caught.message : "Could not link this installed wallet.");
          setIdentityChecked(true);
        });
        return;
      }

      setIdentityChecked(true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authLoading, user]);

  const activateInstalledWallet = useCallback(async (rawLicenseKey: string) => {
    const licenseKey = normalizeLicenseKey(rawLicenseKey);
    if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(licenseKey)) {
      throw new Error("Enter your complete activation key.");
    }
    const validation = validateLicense(licenseKey);
    if (!validation.valid) {
      throw new Error(validation.reason || "This activation key is not valid.");
    }
    const response = await sharedLedgerRequest({
      action: "linkOwner",
      licenseKey,
      legacyOwnerId: legacyOwnerId || undefined,
    });
    const account = await loginWithLicense(licenseKey);
    if (!response.ownerId || response.ownerId !== account.id) {
      throw new Error("The activation identity did not match this wallet.");
    }
    window.localStorage.removeItem(anonymousWalletOwnerKey);
    setLegacyOwnerId("");
    setCookieOwnerId(account.id);
    setIdentityError("");
    setIdentityChecked(true);
  }, [legacyOwnerId, loginWithLicense]);

  const refresh = useCallback(() => {
    const repository = repositoryRef.current;
    if (!repository) return;
    setState(repository.getState());
    void pullRemoteRef.current?.();
  }, []);

  const announceSharedUpdate = useCallback(() => {
    try {
      sharedBroadcastRef.current?.postMessage({ type: "wallet-ledger-updated", timestamp: Date.now() });
    } catch {
      // BroadcastChannel can be unavailable or disabled in embedded/private contexts.
    }
  }, []);

  const commitAndNotify = useCallback(async (next: WalletLedgerState, syncMetadata = true) => {
    setState(next);
    notifyWalletLedgerChanged(next);
    if (!syncMetadata || !ownerId || sharedStatusRef.current !== "connected") return true;
    const requestOwnerId = ownerId;
    try {
      const response = await enqueueSharedRequest({ action: "sync", ownerId, state: next });
      if (activeOwnerIdRef.current !== requestOwnerId) return false;
      const activeRepository = repositoryRef.current;
      if (!activeRepository) return false;
      if (!response.snapshot) throw new Error("Shared wallet synchronization did not return a snapshot.");
      const merged = activeRepository.applyRemoteSnapshot(response.snapshot);
      setState(merged);
      notifyWalletLedgerChanged(merged);
      setSharedError("");
      announceSharedUpdate();
      return true;
    } catch (caught) {
      setSharedError(caught instanceof Error ? caught.message : "Shared wallet synchronization failed.");
      return false;
    }
  }, [announceSharedUpdate, enqueueSharedRequest, ownerId]);

  const patchRemoteAccount = useCallback(async (accountId: string, patch: { name?: string; balances?: Record<string, number> }) => {
    if (!ownerId || sharedStatusRef.current !== "connected") return true;
    const requestOwnerId = ownerId;
    try {
      const response = await enqueueSharedRequest({ action: "patchAccount", ownerId, accountId, ...patch });
      if (activeOwnerIdRef.current !== requestOwnerId) return false;
      const activeRepository = repositoryRef.current;
      if (!activeRepository) return false;
      if (!response.snapshot) throw new Error("Shared wallet account update did not return a snapshot.");
      const merged = activeRepository.applyRemoteSnapshot(response.snapshot);
      setState(merged);
      notifyWalletLedgerChanged(merged);
      setSharedError("");
      announceSharedUpdate();
      return true;
    } catch (caught) {
      setSharedError(caught instanceof Error ? caught.message : "Could not save the wallet account.");
      return false;
    }
  }, [announceSharedUpdate, enqueueSharedRequest, ownerId]);

  useEffect(() => {
    if (authLoading || !identityChecked || identityError || legacyOwnerId || !ownerId) return;
    let cancelled = false;
    let refreshInterval = 0;
    const storageKey = walletLedgerStorageKeyFor(ownerId);
    sharedStatusRef.current = "connecting";
    const applySnapshot = (nextRepository: WalletLedgerRepository, snapshot: RemoteWalletSnapshot) => {
      const merged = nextRepository.applyRemoteSnapshot(snapshot);
      setState(merged);
      notifyWalletLedgerChanged(merged);
    };
    const pullRemote = async (nextRepository: WalletLedgerRepository) => {
      const requestOwnerId = ownerId;
      try {
        const response = await enqueueSharedRequest({ action: "bootstrap", ownerId, state: nextRepository.getState() });
        if (cancelled || activeOwnerIdRef.current !== requestOwnerId) return;
        sharedStatusRef.current = "connected";
        setSharedStatus("connected");
        setSharedError("");
        if (!response.snapshot) throw new Error("Shared wallet refresh did not return a snapshot.");
        applySnapshot(nextRepository, response.snapshot);
      } catch (caught) {
        if (cancelled || activeOwnerIdRef.current !== requestOwnerId) return;
        const localOnly = caught instanceof SharedLedgerRequestError && caught.code === "DATABASE_NOT_CONFIGURED";
        sharedStatusRef.current = localOnly ? "local" : "error";
        setSharedStatus(localOnly ? "local" : "error");
        setSharedError(localOnly ? "" : caught instanceof Error ? caught.message : "Could not refresh incoming transfers.");
      }
    };
    const timeoutId = window.setTimeout(() => {
      setSharedStatus("connecting");
      setSharedError("");
      const nextRepository = createBrowserWalletRepository(ownerId);
      if (!nextRepository) return;
      repositoryRef.current = nextRepository;
      pullRemoteRef.current = () => pullRemote(nextRepository);
      setRepository(nextRepository);
      const next = nextRepository.getState();
      setState(next);
      notifyWalletLedgerChanged(next);
      void pullRemote(nextRepository);
      refreshInterval = window.setInterval(() => { void pullRemote(nextRepository); }, 8_000);
    }, 0);
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key === storageKey) refresh(); };
    const refreshIncomingTransfers = () => {
      const activeRepository = repositoryRef.current;
      if (activeRepository) void pullRemote(activeRepository);
    };
    let broadcastChannel: BroadcastChannel | null = null;
    try {
      if (typeof window.BroadcastChannel === "function") {
        broadcastChannel = new window.BroadcastChannel(sharedLedgerBroadcastChannel);
        broadcastChannel.addEventListener("message", refreshIncomingTransfers);
        sharedBroadcastRef.current = broadcastChannel;
      }
    } catch {
      sharedBroadcastRef.current = null;
    }
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refreshIncomingTransfers(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(walletLedgerEvent, refresh);
    window.addEventListener("focus", refreshIncomingTransfers);
    window.addEventListener("pageshow", refreshIncomingTransfers);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(walletLedgerEvent, refresh);
      window.removeEventListener("focus", refreshIncomingTransfers);
      window.removeEventListener("pageshow", refreshIncomingTransfers);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      broadcastChannel?.removeEventListener("message", refreshIncomingTransfers);
      broadcastChannel?.close();
      if (sharedBroadcastRef.current === broadcastChannel) sharedBroadcastRef.current = null;
      repositoryRef.current = null;
      pullRemoteRef.current = null;
    };
  }, [authLoading, enqueueSharedRequest, identityChecked, identityError, legacyOwnerId, ownerId, refresh]);

  const executeTransfer = useCallback(async (input: TransferInput) => {
    const activeRepository = repositoryRef.current;
    if (!activeRepository) throw new Error("Wallet ledger is still loading.");
    if (sharedStatusRef.current === "connecting") throw new Error("Shared wallet network is still connecting. Try again in a moment.");
    if (sharedStatusRef.current === "error") throw new Error(sharedError || "Shared wallet network is unavailable.");
    if (sharedStatusRef.current === "connected") {
      const requestOwnerId = ownerId;
      const response = await enqueueSharedRequest({
        action: "transfer",
        ownerId,
        transfer: {
          clientRequestId: input.clientRequestId,
          sourceAccountId: input.sourceAccountId,
          destinationAccountId: input.destinationAddress ? undefined : input.destinationAccountId,
          destinationAddress: input.destinationAddress,
          tokenSymbol: input.tokenSymbol,
          amount: input.amount,
        },
      });
      if (!response.transaction) throw new Error("Shared transfer did not return a transaction.");
      if (activeOwnerIdRef.current !== requestOwnerId) return response.transaction;
      if (!response.snapshot) throw new Error("Shared transfer did not return a wallet snapshot.");
      const merged = activeRepository.applyRemoteSnapshot(response.snapshot);
      setState(merged);
      notifyWalletLedgerChanged(merged);
      setSharedError("");
      announceSharedUpdate();
      return response.transaction;
    }
    if (sharedStatusRef.current === "local") {
      const transaction = activeRepository.executeTransfer(input);
      void commitAndNotify(activeRepository.getState(), false);
      return transaction;
    }
    throw new Error("Shared wallet transfers are unavailable on this deployment. Connect it to the shared Neon database and try again.");
  }, [announceSharedUpdate, commitAndNotify, enqueueSharedRequest, ownerId, sharedError]);

  const applyBalanceOperation = useCallback(async (input: RuntimeBalanceOperationInput) => {
    const activeRepository = repositoryRef.current;
    if (!activeRepository) throw new Error("Wallet ledger is still loading.");
    if (sharedStatusRef.current === "connecting") throw new Error("Shared wallet network is still connecting. Try again in a moment.");
    if (sharedStatusRef.current === "error") throw new Error(sharedError || "Shared wallet network is unavailable.");
    const activeState = activeRepository.getState();
    const account = selectedAccount(activeState, walletId);
    const deltas = Object.fromEntries(Object.entries(input.deltas).map(([rawSymbol, rawDelta]) => {
      const symbol = rawSymbol.toUpperCase();
      const asset = activeState.assets[symbol];
      if (!asset || !Number.isFinite(rawDelta)) return [symbol, rawDelta];
      const decimals = Math.min(Math.max(asset.decimals, 0), 12);
      return [symbol, Number(rawDelta.toFixed(decimals))];
    }));
    const operationInput: BalanceOperationInput = {
      ...input,
      deltas,
      walletId,
      accountId: account.id,
    };
    if (sharedStatusRef.current === "connected") {
      const requestOwnerId = ownerId;
      const response = await enqueueSharedRequest({
        action: "balanceOperation",
        ownerId,
        operation: operationInput,
      });
      if (!response.operation) throw new Error("Shared balance operation did not return a result.");
      if (activeOwnerIdRef.current === requestOwnerId) {
        if (!response.snapshot) throw new Error("Shared balance operation did not return a wallet snapshot.");
        const merged = activeRepository.applyRemoteSnapshot(response.snapshot);
        setState(merged);
        notifyWalletLedgerChanged(merged);
        setSharedError("");
        announceSharedUpdate();
      }
      return response.operation;
    }
    if (sharedStatusRef.current === "local") {
      const operation = activeRepository.executeBalanceOperation(operationInput);
      void commitAndNotify(activeRepository.getState(), false);
      return operation;
    }
    throw new Error("Shared wallet balance operations are unavailable on this deployment.");
  }, [announceSharedUpdate, commitAndNotify, enqueueSharedRequest, ownerId, sharedError, walletId]);

  const currentAccount = state ? selectedAccount(state, walletId) : null;
  const value = useMemo<WalletRuntimeValue>(() => ({
    state,
    currentAccount,
    openTransfer: (symbol) => { setScannerRequested(false); setPreferredSymbol(symbol); setPanel("transfer"); },
    openScanner: () => { setScannerRequested(true); setPreferredSymbol(undefined); setPanel("transfer"); },
    openReceive: (mode = "token") => { setPreferredReceiveMode(mode); setPanel("receive"); },
    openAccounts: () => setPanel("accounts"),
    openHistory: () => setPanel("history"),
    openSecurity: () => setPanel("security"),
    applyBalanceOperation,
    replaceCurrentBalances: async (balances) => {
      if (!repositoryRef.current || !currentAccount) return false;
      const changedBalances = Object.fromEntries(
        Object.entries(balances).filter(([rawSymbol, balance]) => {
          const symbol = rawSymbol.toUpperCase();
          return Number.isFinite(balance) && balance >= 0 && currentAccount.balances[symbol] !== balance;
        }),
      );
      await commitAndNotify(repositoryRef.current.replaceBalances(walletId, currentAccount.id, balances), false);
      if (Object.keys(changedBalances).length > 0) {
        const saved = await patchRemoteAccount(currentAccount.id, { balances: changedBalances });
        if (!saved && repositoryRef.current) {
          const rollback = Object.fromEntries(Object.keys(changedBalances).map((symbol) => [symbol, currentAccount.balances[symbol] ?? 0]));
          await commitAndNotify(repositoryRef.current.replaceBalances(walletId, currentAccount.id, rollback), false);
          return false;
        }
      }
      return true;
    },
    saveCurrentAccountName: async (name) => {
      if (!repositoryRef.current || !currentAccount || !name.trim()) return false;
      const trimmedName = name.trim();
      if (trimmedName === currentAccount.name) return true;
      const previousName = currentAccount.name;
      await commitAndNotify(repositoryRef.current.renameAccount(walletId, currentAccount.id, trimmedName), false);
      const saved = await patchRemoteAccount(currentAccount.id, { name: trimmedName });
      if (!saved && repositoryRef.current) {
        await commitAndNotify(repositoryRef.current.renameAccount(walletId, currentAccount.id, previousName), false);
        return false;
      }
      return true;
    },
    renameCurrentAccount: (name) => {
      if (!repositoryRef.current || !currentAccount || !name.trim()) return;
      const trimmedName = name.trim();
      void commitAndNotify(repositoryRef.current.renameAccount(walletId, currentAccount.id, trimmedName), false);
      if (trimmedName !== currentAccount.name) void patchRemoteAccount(currentAccount.id, { name: trimmedName });
    },
    updateMarketAssets: (tokens) => {
      if (!repositoryRef.current) return;
      setState(repositoryRef.current.updateAssets(tokens));
    },
    refresh,
  }), [applyBalanceOperation, commitAndNotify, currentAccount, patchRemoteAccount, refresh, state, walletId]);

  if (!identityChecked) {
    return <WalletIdentityLoading walletId={walletId} />;
  }

  if (!ownerId || legacyOwnerId || identityError) {
    return (
      <WalletActivationGate
        walletId={walletId}
        defaultLicenseKey={user?.licenseKey ?? ""}
        initialError={identityError}
        isRecovering={Boolean(legacyOwnerId)}
        onActivate={activateInstalledWallet}
      />
    );
  }

  return (
    <WalletRuntimeContext.Provider value={value}>
      {children}
      {state && panel && repository ? <WalletRuntimeSheet walletId={walletId} initialPanel={panel} startWithScanner={scannerRequested} preferredSymbol={preferredSymbol} receiveMode={preferredReceiveMode} state={state} repository={repository} security={security} sharedStatus={sharedStatus} sharedError={sharedError} executeTransfer={executeTransfer} onCommit={commitAndNotify} onClose={() => { setScannerRequested(false); setPanel(null); }} /> : null}
      {security.locked ? <WalletLockScreen walletId={walletId} security={security} /> : null}
    </WalletRuntimeContext.Provider>
  );
}

function WalletIdentityLoading({ walletId }: { walletId: WalletThemeId }) {
  return (
    <main className="fixed inset-0 grid place-items-center bg-[#080809] px-6 text-center text-white">
      <div role="status">
        <span className="mx-auto block h-12 w-12 animate-spin rounded-full border-4 border-white/15 border-t-[#a295f3]" />
        <p className="mt-5 text-sm text-white/55">Opening {walletLabels[walletId]}…</p>
      </div>
    </main>
  );
}

function WalletActivationGate({
  walletId,
  defaultLicenseKey,
  initialError,
  isRecovering,
  onActivate,
}: {
  walletId: WalletThemeId;
  defaultLicenseKey: string;
  initialError: string;
  isRecovering: boolean;
  onActivate: (licenseKey: string) => Promise<void>;
}) {
  const [licenseKey, setLicenseKey] = useState(() => normalizeLicenseKey(defaultLicenseKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      await onActivate(licenseKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not link this installed wallet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="fixed inset-0 overflow-y-auto bg-[#080809] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] text-white">
      <section className="mx-auto w-full max-w-[430px] rounded-[2rem] border border-white/10 bg-[#151517] p-6 shadow-[0_30px_100px_rgba(0,0,0,.55)]">
        <span className="grid h-16 w-16 place-items-center rounded-[1.4rem] bg-[#a295f3] text-black">
          <KeyRound className="h-8 w-8" />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#a99bf7]">{walletLabels[walletId]}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Link this installed wallet</h1>
        <p className="mt-3 leading-relaxed text-white/55">
          Enter the same activation key in Phantom, Larpz Wallet, and Larpz Trust-style Wallet so every app opens the same shared wallet account.
        </p>
        {isRecovering ? (
          <p className="mt-4 rounded-[1.1rem] border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            An older wallet balance was found on this installation. Linking will recover it into your activation account.
          </p>
        ) : null}
        <label className="mt-6 block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-white/40">Activation key</span>
          <input
            value={licenseKey}
            onChange={(event) => setLicenseKey(normalizeLicenseKey(event.target.value))}
            onKeyDown={(event) => { if (event.key === "Enter" && !busy) void activate(); }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-label="Activation key"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={19}
            className="h-16 w-full rounded-[1.2rem] border border-white/10 bg-[#232325] px-4 text-center font-mono text-lg tracking-[.08em] outline-none focus:ring-2 focus:ring-[#a295f3]"
          />
        </label>
        {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <button
          type="button"
          onClick={() => void activate()}
          disabled={busy || licenseKey.length !== 19}
          className="mt-5 min-h-14 w-full rounded-full bg-[#a295f3] px-5 text-lg font-semibold text-black disabled:opacity-40"
        >
          {busy ? "Linking wallets…" : "Link all three wallets"}
        </button>
        <p className="mt-5 text-center text-[10px] font-bold uppercase tracking-[.16em] text-white/25">{walletDisclosures[walletId]}</p>
      </section>
    </main>
  );
}

export function useWalletRuntime() {
  const value = useContext(WalletRuntimeContext);
  if (!value) throw new Error("useWalletRuntime must be used inside WalletRuntimeProvider.");
  return value;
}

function WalletRuntimeSheet({ walletId, initialPanel, startWithScanner, preferredSymbol, receiveMode, state, repository, security, sharedStatus, sharedError, executeTransfer, onCommit, onClose }: {
  walletId: WalletThemeId;
  initialPanel: Exclude<RuntimePanel, null>;
  startWithScanner: boolean;
  preferredSymbol?: string;
  receiveMode: ReceiveMode;
  state: WalletLedgerState;
  repository: WalletLedgerRepository;
  security: ReturnType<typeof useWalletSecurity>;
  sharedStatus: SharedLedgerStatus;
  sharedError: string;
  executeTransfer: (input: TransferInput) => Promise<SimulatedTransaction>;
  onCommit: (state: WalletLedgerState, syncMetadata?: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState(initialPanel);
  const [scannerOpen, setScannerOpen] = useState(startWithScanner);
  const [scannedAddress, setScannedAddress] = useState("");
  const sheetRef = useRef<HTMLElement>(null);
  const { containerStyle, handleProps } = useSwipeDismiss({ onDismiss: onClose });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && !sheet.contains(document.activeElement)) sheet.focus();
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  if (walletId === "ghost" && (panel === "transfer" || panel === "receive")) {
    const title = panel === "transfer" ? "Send" : "Receive";
    return (
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center" role="presentation">
        <button type="button" aria-label="Close wallet sheet" className="absolute inset-0" onClick={onClose} />
        <section
          ref={sheetRef}
          tabIndex={-1}
          aria-label={title}
          className="relative flex h-[100dvh] w-full max-w-[560px] flex-col overflow-hidden bg-black text-white shadow-[0_-20px_80px_rgba(0,0,0,.7)] outline-none sm:h-[94dvh] sm:rounded-[2.5rem] sm:border sm:border-white/10"
          style={containerStyle}
        >
          <div {...handleProps} className={`${handleProps.className} absolute left-1/2 top-[max(.6rem,env(safe-area-inset-top))] z-20 -translate-x-1/2`}>
            <span className="block h-1.5 w-12 rounded-full bg-white/40" />
          </div>
          {panel === "transfer" ? (
            <PhantomTransferPanel
              preferredSymbol={preferredSymbol}
              state={state}
              sharedStatus={sharedStatus}
              sharedError={sharedError}
              executeTransfer={executeTransfer}
              onClose={onClose}
            />
          ) : (
            <PhantomReceivePanel
              initialMode={receiveMode}
              state={state}
              onClose={onClose}
            />
          )}
        </section>
      </div>
    );
  }

  if (walletId === "trust") {
    const title = panel === "transfer" ? "Send" : panel === "receive" ? "Receive" : panel === "accounts" ? "Accounts" : panel === "history" ? "Activity" : "Security";
    return (
      <div className="fixed inset-0 z-[120] flex justify-center bg-[#070812] text-white" role="presentation">
        {scannerOpen ? <CameraQrScanner onClose={() => setScannerOpen(false)} onScan={(address) => { setScannedAddress(address); setPanel("transfer"); setScannerOpen(false); }} /> : null}
        <section
          ref={sheetRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative flex h-[100dvh] w-full max-w-[560px] flex-col overflow-hidden bg-[#090a14] text-white outline-none sm:h-[94dvh] sm:self-center sm:rounded-[2.4rem] sm:border sm:border-white/[0.08]"
          style={containerStyle}
        >
          <div {...handleProps} className={`${handleProps.className} absolute left-1/2 top-[max(.55rem,env(safe-area-inset-top))] z-20 -translate-x-1/2`}>
            <span className="block h-1.5 w-12 rounded-full bg-white/25" />
          </div>
          <header className="shrink-0 border-b border-white/[0.06] bg-[#090a14]/95 px-5 pb-4 pt-[max(2.8rem,calc(env(safe-area-inset-top)+1.7rem))] backdrop-blur-xl">
            <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-12 w-12 place-items-center rounded-full border border-white/[0.07] bg-[#131521]"><ArrowLeft className="h-6 w-6" /></button>
              <div className="min-w-0 px-3 text-center">
                <h1 className="truncate text-[23px] font-bold tracking-[-.035em]">{title}</h1>
                <p className="mt-1 truncate text-[8px] font-bold uppercase tracking-[.16em] text-[#716cff]">Larpz Wallet · Demo only</p>
              </div>
              {panel === "transfer" ? (
                <button type="button" onClick={() => setScannerOpen(true)} aria-label="Scan recipient QR code" className="grid h-12 w-12 place-items-center rounded-full border border-white/[0.07] bg-[#131521] text-white"><QrCode className="h-5 w-5" /></button>
              ) : <span className="h-12 w-12" />}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 [scrollbar-width:none]">
            {panel === "transfer" ? <TransferPanel key={scannedAddress || "manual"} walletId={walletId} preferredSymbol={preferredSymbol} initialDestinationAddress={scannedAddress} state={state} sharedStatus={sharedStatus} sharedError={sharedError} executeTransfer={executeTransfer} /> : null}
            {panel === "receive" ? <TrustReceivePanel state={state} /> : null}
            {panel === "accounts" ? <AccountsPanel activeWalletId={walletId} state={state} repository={repository} sharedError={sharedError} onCommit={onCommit} trustStyle /> : null}
            {panel === "history" ? <HistoryPanel walletId={walletId} state={state} trustStyle /> : null}
            {panel === "security" ? <SecurityPanel security={security} trustStyle /> : null}
          </div>
        </section>
      </div>
    );
  }

  const title = panel === "transfer" ? "Send" : panel === "receive" ? "Receive" : panel === "accounts" ? "Accounts" : panel === "history" ? "Activity" : "Security";
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center" role="presentation">
      {scannerOpen ? <CameraQrScanner onClose={() => setScannerOpen(false)} onScan={(address) => { setScannedAddress(address); setPanel("transfer"); setScannerOpen(false); }} /> : null}
      <button type="button" aria-label="Close wallet sheet" className="absolute inset-0" onClick={onClose} />
      <section ref={sheetRef} tabIndex={-1} aria-label={title} className={`relative flex max-h-[94dvh] min-h-[68dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[2.2rem] border border-white/10 bg-[#111112] text-white shadow-[0_-20px_80px_rgba(0,0,0,.7)] outline-none sm:max-h-[88dvh] sm:rounded-[2.2rem] ${walletId === "ledger" ? "ledger-wallet-font" : ""}`} style={containerStyle}>
        <header className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-3">
          <div {...handleProps}><span className="block h-1.5 w-16 rounded-full bg-white/35" /></div>
          <div className="mt-4 flex items-center justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a99bf7]/70">{walletDisclosures[walletId]}</p><h1 className="mt-1 text-[28px] font-semibold tracking-[-.04em]">{title}</h1></div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-[#252527]"><X className="h-5 w-5" /></button>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Wallet tools">
            {(["transfer", "receive", "accounts", "history", "security"] as const).map((item) => {
              const Icon = item === "transfer" ? Send : item === "receive" ? QrCode : item === "accounts" ? WalletCards : item === "history" ? History : Settings;
              return <button key={item} type="button" onClick={() => setPanel(item)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold capitalize ${panel === item ? "bg-[#a295f3] text-black" : "bg-[#232325] text-white/60"}`}><Icon className="h-4 w-4" />{item}</button>;
            })}
            <button type="button" onClick={() => setScannerOpen(true)} aria-label="Scan recipient QR code" className="flex shrink-0 items-center gap-2 rounded-full bg-[#232325] px-4 py-2.5 text-sm font-semibold text-white/60"><QrCode className="h-4 w-4" />Scan</button>
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5">
          {panel === "transfer" ? <TransferPanel key={scannedAddress || "manual"} walletId={walletId} preferredSymbol={preferredSymbol} initialDestinationAddress={scannedAddress} state={state} sharedStatus={sharedStatus} sharedError={sharedError} executeTransfer={executeTransfer} /> : null}
          {panel === "receive" ? <ReceivePanel walletId={walletId} state={state} /> : null}
          {panel === "accounts" ? <AccountsPanel activeWalletId={walletId} state={state} repository={repository} sharedError={sharedError} onCommit={onCommit} /> : null}
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

function RuntimeAssetIcon({ image, name, symbol, className = "h-11 w-11" }: { image?: string; name: string; symbol: string; className?: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#202022] ${className}`}>
      {image ? <Image src={image} alt="" fill unoptimized sizes="64px" className="object-cover" /> : <span className="text-sm font-bold text-white/70">{symbol.slice(0, 2)}</span>}
      <span className="sr-only">{name}</span>
    </span>
  );
}

function shortWalletAddress(address: string) {
  if (address.length <= 18) return address;
  return `${address.slice(0, 7)}...${address.slice(-7)}`;
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function PhantomSendHeader({ onClose, onAdd }: { onClose: () => void; onAdd?: () => void }) {
  return (
    <header className="shrink-0 px-5 pb-3 pt-[max(3.25rem,calc(env(safe-area-inset-top)+2rem))]">
      <div className="grid grid-cols-[3.25rem_1fr_3.25rem] items-center">
        <button type="button" onClick={onClose} aria-label="Close Send" className="grid h-12 w-12 place-items-center rounded-full bg-[#202022]"><X className="h-6 w-6" /></button>
        <h1 className="px-3 text-left text-[24px] font-semibold tracking-[-.035em]">Send</h1>
        {onAdd ? <button type="button" onClick={onAdd} aria-label="Choose one of my accounts" className="grid h-12 w-12 place-items-center rounded-full bg-[#202022]"><Plus className="h-6 w-6" /></button> : <span />}
      </div>

    </header>
  );
}

function PhantomTransferPanel({ preferredSymbol, state, sharedStatus, sharedError, executeTransfer, onClose }: {
  preferredSymbol?: string;
  state: WalletLedgerState;
  sharedStatus: SharedLedgerStatus;
  sharedError: string;
  executeTransfer: (input: TransferInput) => Promise<SimulatedTransaction>;
  onClose: () => void;
}) {
  const initialSource = selectedAccount(state, "ghost");
  const [sourceWalletId, setSourceWalletId] = useState<WalletThemeId>("ghost");
  const [sourceAccountId, setSourceAccountId] = useState(initialSource.id);
  const [destinationWalletId, setDestinationWalletId] = useState<WalletThemeId>("ledger");
  const [destinationAccountId, setDestinationAccountId] = useState(state.wallets.ledger.selectedAccountId);
  const [useAddress, setUseAddress] = useState(false);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [showAccounts, setShowAccounts] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const sourceAccount = accountForSelection(state, sourceWalletId, sourceAccountId);
  const destinationAccount = accountForSelection(state, destinationWalletId, destinationAccountId);
  const available = sortedAccountAssets(state, sourceAccount).filter((entry) => entry.balance > 0 && entry.asset.symbol !== "USD");
  const initialSymbol = preferredSymbol && available.some((entry) => entry.asset.symbol === preferredSymbol) ? preferredSymbol : available[0]?.asset.symbol ?? "SOL";
  const [symbol, setSymbol] = useState(initialSymbol);
  const [amountValue, setAmountValue] = useState("");
  const [stage, setStage] = useState<"recipient" | "form" | "review" | "processing" | "failed" | "success">("recipient");
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<SimulatedTransaction | null>(null);
  const requestId = useRef(randomClientId("transfer"));
  const numericAmount = Number(amountValue);
  const fee = Number.isFinite(numericAmount) && numericAmount > 0 ? calculateNetworkFee(symbol, numericAmount) : calculateNetworkFee(symbol, 0);
  const balance = sourceAccount.balances[symbol] ?? 0;
  const asset = state.assets[symbol];
  const walletIds = Object.keys(walletLabels) as WalletThemeId[];
  const candidateAccounts = walletIds.flatMap((candidateWalletId) => state.wallets[candidateWalletId].accounts
    .filter((account) => account.id !== sourceAccount.id)
    .map((account) => ({ walletId: candidateWalletId, account })));
  const normalizedQuery = recipientQuery.trim().toLowerCase();
  const filteredAccounts = candidateAccounts.filter(({ walletId: candidateWalletId, account }) => !normalizedQuery || `${walletLabels[candidateWalletId]} ${account.name} ${account.address}`.toLowerCase().includes(normalizedQuery));
  const changeSourceWallet = (nextWalletId: WalletThemeId) => {
    const account = selectedAccount(state, nextWalletId);
    setSourceWalletId(nextWalletId);
    setSourceAccountId(account.id);
    const entries = sortedAccountAssets(state, account).filter((entry) => entry.balance > 0 && entry.asset.symbol !== "USD");
    setSymbol(entries[0]?.asset.symbol ?? "SOL");
    setAmountValue("");
  };

  const chooseAccount = (nextWalletId: WalletThemeId, account: WalletAccount) => {
    setDestinationWalletId(nextWalletId);
    setDestinationAccountId(account.id);
    setUseAddress(false);
    setDestinationAddress("");
    setError("");
    setStage("form");
  };

  const chooseAddress = () => {
    const address = recipientQuery.trim();
    setError("");
    if (address.length < 8 || address.startsWith("@")) {
      setError("Enter or paste the recipient's complete wallet address.");
      return;
    }
    setDestinationAddress(address);
    setUseAddress(true);
    setStage("form");
  };

  const pasteRecipient = async () => {
    setError("");
    try {
      const value = await navigator.clipboard?.readText();
      if (!value?.trim()) throw new Error("Clipboard is empty.");
      setRecipientQuery(value.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the clipboard.");
    }
  };

  const openScanner = () => {
    setError("");
    setScannerOpen(true);
  };

  const review = () => {
    setError("");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter an amount greater than zero.");
    if (numericAmount + fee > balance + Number.EPSILON) return setError(`Insufficient ${symbol}, including the ${fee} ${symbol} network fee.`);
    if (!useAddress && sourceAccount.id === destinationAccount.id) return setError("Source and destination accounts must be different.");
    setStage("review");
  };

  const confirm = async () => {
    if (stage !== "review") return;
    setStage("processing");
    setError("");
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    try {
      const completed = await executeTransfer({
        clientRequestId: requestId.current,
        sourceWalletId,
        sourceAccountId: sourceAccount.id,
        destinationWalletId: useAddress ? undefined : destinationWalletId,
        destinationAccountId: useAddress ? undefined : destinationAccount.id,
        destinationAddress: useAddress ? destinationAddress : undefined,
        tokenSymbol: symbol,
        amount: numericAmount,
      });
      setTransaction(completed);
      setStage("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transfer failed.");
      setStage("failed");
    }
  };

  const reset = () => {
    requestId.current = randomClientId("transfer");
    setAmountValue("");
    setTransaction(null);
    setRecipientQuery("");
    setUseAddress(false);
    setShowAccounts(false);
    setScannerOpen(false);
    setError("");
    setStage("recipient");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {scannerOpen ? (
        <CameraQrScanner
          onClose={() => setScannerOpen(false)}
          onScan={(address) => {
            setRecipientQuery(address);
            setShowAccounts(false);
            setError("");
            setScannerOpen(false);
          }}
        />
      ) : null}
      <PhantomSendHeader onClose={onClose} onAdd={stage === "recipient" ? () => { setShowAccounts((value) => !value); setError(""); } : undefined} />
      {stage === "recipient" ? (
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="min-h-0 flex-1 overflow-y-auto pb-5">
            {sharedStatus !== "connected" ? <p role="status" className="mt-2 rounded-2xl border border-red-400/15 bg-red-400/10 px-4 py-3 text-sm text-red-200">{sharedStatus === "connecting" ? "Connecting the wallet network…" : sharedError || "Transfers are currently unavailable."}</p> : null}
            {showAccounts || normalizedQuery ? (
              <div className="mt-5 space-y-2">
                <h2 className="px-1 text-sm font-semibold text-white/50">{showAccounts ? "My wallet accounts" : "Matching accounts"}</h2>
                {filteredAccounts.map(({ walletId: candidateWalletId, account }) => (
                  <button key={account.id} type="button" onClick={() => chooseAccount(candidateWalletId, account)} aria-label={`Use ${walletLabels[candidateWalletId]} ${account.name}`} className="flex w-full items-center gap-3 rounded-[1.25rem] bg-[#19191b] p-4 text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#28282b] text-[#b5aaff]"><WalletCards className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><strong className="block truncate">{account.name}</strong><span className="mt-0.5 block truncate text-sm text-white/45">{walletLabels[candidateWalletId]} · {shortWalletAddress(account.address)}</span></span>
                    <ArrowRight className="h-5 w-5 text-white/35" />
                  </button>
                ))}
                {normalizedQuery ? <button type="button" onClick={chooseAddress} className="flex w-full items-center gap-3 rounded-[1.25rem] bg-[#19191b] p-4 text-left"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#a295f3] text-black"><Send className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block">Send to this address</strong><span className="mt-0.5 block truncate font-mono text-xs text-white/45">{recipientQuery.trim()}</span></span><ArrowRight className="h-5 w-5 text-white/35" /></button> : null}
                {!filteredAccounts.length && !normalizedQuery ? <p className="rounded-[1.25rem] bg-[#19191b] px-4 py-8 text-center text-white/45">No other accounts found.</p> : null}
              </div>
            ) : (
              <div className="grid min-h-[62dvh] place-items-center py-8 text-center">
                <div className="max-w-[330px]">
                  <span className="relative mx-auto block h-24 w-40" aria-hidden="true"><Send className="absolute right-4 top-0 h-16 w-16 -rotate-12 fill-[#a295f3] text-[#a295f3]" /><i className="absolute left-7 top-10 h-5 w-8 -rotate-12 rounded-sm bg-[#35d59c]" /><i className="absolute left-16 top-12 h-4 w-7 rotate-12 rounded-sm bg-[#35d59c]" /><i className="absolute left-24 top-8 h-4 w-7 -rotate-6 rounded-sm bg-[#35d59c]" /></span>
                  <h2 className="mt-5 text-[24px] font-semibold tracking-[-.035em]">No recent transfers</h2>
                  <p className="mt-3 text-[17px] leading-snug text-white/55">You can search for a username or wallet, or create a contact or bank account.</p>
                </div>
              </div>
            )}
          </div>
          {error ? <p role="alert" className="mb-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
          <form onSubmit={(event) => { event.preventDefault(); chooseAddress(); }} className="flex h-14 shrink-0 items-center rounded-full border border-white/[0.08] bg-[#171719] px-4 shadow-[0_10px_35px_rgba(0,0,0,.45)]">
            <Search className="h-5 w-5 shrink-0 text-white/45" />
            <input value={recipientQuery} onChange={(event) => { setRecipientQuery(event.target.value); setError(""); }} onFocus={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()} placeholder="@username or wallet address" aria-label="Recipient username or wallet address" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-white/35" />
            <button type="button" onClick={openScanner} aria-label="Scan wallet QR code" className="grid h-9 w-9 place-items-center rounded-full text-white/70"><QrCode className="h-5 w-5" /></button>
            <button type="button" onClick={() => void pasteRecipient()} className="ml-1 rounded-full bg-[#252527] px-3 py-2 text-sm font-semibold">Paste</button>
          </form>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          {stage === "form" ? <div><button type="button" onClick={() => setStage("recipient")} className="mt-2 flex items-center gap-2 text-[#a99bf7]"><ArrowLeft className="h-4 w-4" /> Change recipient</button><div className="mt-5 grid grid-cols-2 gap-3"><label><FieldLabel>Source wallet</FieldLabel><SelectField value={sourceWalletId} onChange={(event) => changeSourceWallet(event.target.value as WalletThemeId)}>{walletIds.map((id) => <option key={id} value={id}>{walletLabels[id]}</option>)}</SelectField></label><label><FieldLabel>Source account</FieldLabel><SelectField value={sourceAccount.id} onChange={(event) => { setSourceAccountId(event.target.value); setAmountValue(""); }}>{state.wallets[sourceWalletId].accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField></label></div><label className="mt-4 block"><FieldLabel>Currency</FieldLabel><SelectField value={symbol} onChange={(event) => { setSymbol(event.target.value); setAmountValue(""); }}>{available.map((entry) => <option key={entry.asset.symbol} value={entry.asset.symbol}>{entry.asset.name} ({entry.asset.symbol}) · {amount(entry.balance)}</option>)}</SelectField></label><div className="mt-4 rounded-[1.2rem] bg-[#19191b] p-4"><span className="text-xs font-bold uppercase tracking-[.12em] text-white/35">To</span><strong className="mt-2 block truncate">{useAddress ? shortWalletAddress(destinationAddress) : `${walletLabels[destinationWalletId]} · ${destinationAccount.name}`}</strong></div><div className="mt-5"><div className="flex items-center justify-between"><FieldLabel>Amount</FieldLabel><span className="mb-2 text-xs text-white/45">Available {amount(balance)} {symbol}</span></div><div className="flex items-center rounded-[1.2rem] bg-[#202022] px-4 focus-within:ring-2 focus-within:ring-[#a295f3]"><input inputMode="decimal" value={amountValue} onChange={(event) => setAmountValue(event.target.value)} placeholder="0" aria-label="Transfer amount" className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none" /><button type="button" onClick={() => setAmountValue(String(Math.max(0, balance - calculateNetworkFee(symbol, balance))))} className="rounded-full bg-[#343438] px-3 py-2 text-xs font-bold text-[#b8adff]">MAX</button></div><div className="mt-3 flex justify-between text-sm text-white/45"><span>Network fee</span><span>{fee} {symbol}</span></div></div>{error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="button" onClick={review} disabled={!available.length || sharedStatus !== "connected"} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black disabled:opacity-40">Review transfer <ArrowRight className="h-5 w-5" /></button></div> : null}
          {stage === "review" ? <div><button type="button" onClick={() => setStage("form")} className="mt-2 flex items-center gap-2 text-[#a99bf7]"><ArrowLeft className="h-4 w-4" /> Edit transfer</button><h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">Review transfer</h2><div className="mt-6 rounded-[1.7rem] bg-[#1d1d1f] p-5"><div className="text-center"><span className="text-5xl font-semibold">{amount(numericAmount)}</span><span className="ml-2 text-2xl text-white/50">{symbol}</span><p className="mt-2 text-white/45">{money(numericAmount * (asset?.price ?? 0))}</p></div><div className="mt-7 border-t border-white/[0.07] pt-4"><Detail label="From" value={`${walletLabels[sourceWalletId]} · ${sourceAccount.name}`} /><Detail label="To" value={useAddress ? destinationAddress : destinationAccount.address} mono /><Detail label="Network" value={asset?.network ?? symbol} /><Detail label="Network fee" value={`${fee} ${symbol}`} /><Detail label="Total debit" value={`${amount(numericAmount + fee)} ${symbol}`} /></div></div>{error ? <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="button" onClick={() => void confirm()} className="mt-6 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black">Confirm transfer</button></div> : null}
          {stage === "processing" ? <div className="grid min-h-[58dvh] place-items-center py-12 text-center" role="status"><div><span className="mx-auto block h-14 w-14 animate-spin rounded-full border-4 border-white/15 border-t-[#a295f3]" /><h2 className="mt-6 text-2xl font-semibold">Transfer pending…</h2><p className="mt-2 text-white/45">Updating both wallet accounts.</p></div></div> : null}
          {stage === "failed" ? <div className="py-8 text-center" role="alert"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-500/15 text-red-300"><X className="h-10 w-10" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer failed</h2><p className="mt-3 text-white/55">{error || "The transfer could not be completed."}</p><p className="mt-4 text-sm text-white/35">No balance changes were saved.</p><button type="button" onClick={() => setStage("review")} className="mt-7 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black">Review and try again</button></div> : null}
          {stage === "success" && transaction ? <div className="py-7 text-center" role="status"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#00e676] text-black"><Check className="h-10 w-10 stroke-[3]" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer complete</h2><p className="mt-3 text-lg text-white/55">{amount(transaction.amount)} {transaction.tokenSymbol} arrived in the receiving account.</p><div className="mt-7 rounded-[1.5rem] bg-[#1d1d1f] p-5 text-left text-sm"><Detail label="Status" value="Completed" /><Detail label="Network" value={transaction.network} /><Detail label="Network fee" value={`${transaction.fee} ${transaction.feeSymbol}`} /><Detail label="Transaction ID" value={transaction.id} mono /></div><button type="button" onClick={reset} className="mt-7 w-full rounded-full bg-[#a295f3] py-4 text-lg font-semibold text-black">Send another</button></div> : null}

        </div>
      )}
    </div>
  );
}

function TransferPanel({ walletId, preferredSymbol, initialDestinationAddress, state, sharedStatus, sharedError, executeTransfer }: { walletId: WalletThemeId; preferredSymbol?: string; initialDestinationAddress?: string; state: WalletLedgerState; sharedStatus: SharedLedgerStatus; sharedError: string; executeTransfer: (input: TransferInput) => Promise<SimulatedTransaction> }) {
  const initialSource = selectedAccount(state, walletId);
  const firstOtherWallet = walletId === "ghost" ? "ledger" : "ghost";
  const [sourceWalletId, setSourceWalletId] = useState<WalletThemeId>(walletId);
  const [sourceAccountId, setSourceAccountId] = useState(initialSource.id);
  const [destinationWalletId, setDestinationWalletId] = useState<WalletThemeId>(firstOtherWallet);
  const [destinationAccountId, setDestinationAccountId] = useState(state.wallets[firstOtherWallet].selectedAccountId);
  const [useAddress, setUseAddress] = useState(Boolean(initialDestinationAddress));
  const [destinationAddress, setDestinationAddress] = useState(initialDestinationAddress ?? "");
  const sourceAccount = accountForSelection(state, sourceWalletId, sourceAccountId);
  const destinationAccount = accountForSelection(state, destinationWalletId, destinationAccountId);
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
  const localTrustReady = walletId === "trust" && sharedStatus === "local";
  const transferReady = sharedStatus === "connected" || localTrustReady;

  const changeSourceWallet = (nextWalletId: WalletThemeId) => {
    const account = selectedAccount(state, nextWalletId);
    setSourceWalletId(nextWalletId);
    setSourceAccountId(account.id);
    const entries = sortedAccountAssets(state, account).filter((entry) => entry.balance > 0);
    setSymbol(entries[0]?.asset.symbol ?? "SOL");
    setAmountValue("");
  };

  const pasteDestination = async () => {
    try {
      const value = (await navigator.clipboard?.readText())?.trim() ?? "";
      if (!value) return setError("The clipboard does not contain a wallet address.");
      setDestinationAddress(value);
      setError("");
    } catch {
      setError("Clipboard access was not available. Paste the address into the field.");
    }
  };

  const inputAmountKey = (key: string) => {
    setAmountValue((current) => {
      if (key === "backspace") return current.length <= 1 ? "" : current.slice(0, -1);
      if (key === "." && current.includes(".")) return current;
      const next = current === "0" && key !== "." ? key : `${current}${key}`;
      return (next.split(".")[1]?.length ?? 0) > 8 ? current : next;
    });
    setError("");
  };

  const review = () => {
    setError("");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Enter an amount greater than zero.");
    if (numericAmount + fee > balance + Number.EPSILON) return setError(`Insufficient ${symbol}, including the ${fee} ${symbol} network fee.`);
    if (useAddress && !walletAccountIdFromDomain(destinationAddress) && !/^sim_(?:ghost|ledger|trust)_[a-z0-9]+$/i.test(destinationAddress.trim())) return setError("Enter a complete Larpz wallet address or internal .larpz domain.");
    if (!useAddress && sourceAccount.id === destinationAccount.id) return setError("Source and destination accounts must be different.");
    setStage("review");
  };

  const confirm = async () => {
    if (stage !== "review") return;
    setStage("processing");
    setError("");
    if (walletId !== "trust") await new Promise((resolve) => window.setTimeout(resolve, 500));
    try {
      const completed = await executeTransfer({
        clientRequestId: requestId.current,
        sourceWalletId,
        sourceAccountId: sourceAccount.id,
        destinationWalletId: useAddress ? undefined : destinationWalletId,
        destinationAccountId: useAddress ? undefined : destinationAccount.id,
        destinationAddress: useAddress ? destinationAddress : undefined,
        tokenSymbol: symbol,
        amount: numericAmount,
      });
      setTransaction(completed);
      setStage("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transfer failed.");
      setStage("failed");
    }
  };

  if (stage === "success" && transaction) {
    return <div className="py-7 text-center" role="status"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#00e676] text-black"><Check className="h-10 w-10 stroke-[3]" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer complete</h2><p className="mt-3 text-lg text-white/55">{amount(transaction.amount)} {transaction.tokenSymbol} arrived in the receiving account.</p><div className={`mt-7 rounded-[1.5rem] p-5 text-left text-sm ${walletId === "trust" ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><Detail label="Status" value="Completed" /><Detail label="Network" value={transaction.network} /><Detail label="Network fee" value={`${transaction.fee} ${transaction.feeSymbol}`} /><Detail label="Transaction ID" value={transaction.id} mono /></div><p className={`mt-5 text-[10px] font-bold uppercase tracking-[.16em] ${walletId === "trust" ? "text-[#8580ff]" : "text-[#a99bf7]/70"}`}>{walletDisclosures[walletId]}</p><button type="button" onClick={() => { requestId.current = randomClientId("transfer"); setAmountValue(""); setTransaction(null); setStage("form"); }} className={`mt-7 min-h-14 w-full rounded-full text-lg font-semibold ${walletId === "trust" ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}>Send another</button></div>;
  }

  if (stage === "processing") {
    return <div className="grid min-h-80 place-items-center py-12 text-center" role="status"><div><span className={`mx-auto block h-14 w-14 animate-spin rounded-full border-4 border-white/15 ${walletId === "trust" ? "border-t-[#4437ff]" : "border-t-[#a295f3]"}`} /><h2 className="mt-6 text-2xl font-semibold">Transfer pending…</h2><p className="mt-2 text-white/45">Updating both accounts securely.</p></div></div>;
  }

  if (stage === "failed") {
    return <div className="py-8 text-center" role="alert"><span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-500/15 text-red-300"><X className="h-10 w-10" /></span><h2 className="mt-6 text-3xl font-semibold">Transfer failed</h2><p className="mt-3 text-white/55">{error || "The transfer could not be completed."}</p><p className="mt-4 text-sm text-white/35">No balance changes were saved.</p><button type="button" onClick={() => setStage("review")} className={`mt-7 min-h-14 w-full rounded-full text-lg font-semibold ${walletId === "trust" ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}>Review and try again</button></div>;
  }

  if (stage === "review") {
    const destination = useAddress ? destinationAddress : destinationAccount.address;
    return <div><button type="button" onClick={() => setStage("form")} className={`flex min-h-11 items-center gap-2 ${walletId === "trust" ? "text-[#8580ff]" : "text-[#a99bf7]"}`}><ArrowLeft className="h-4 w-4" /> Edit transfer</button><h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">Review transfer</h2><div className={`mt-6 rounded-[1.7rem] p-5 ${walletId === "trust" ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><div className="text-center"><span className="text-5xl font-semibold">{amount(numericAmount)}</span><span className="ml-2 text-2xl text-white/50">{symbol}</span><p className="mt-2 text-white/45">{money(numericAmount * (asset?.price ?? 0))}</p></div><div className="mt-7 border-t border-white/[0.07] pt-4"><Detail label="From" value={`${walletLabels[sourceWalletId]} · ${sourceAccount.name}`} /><Detail label="To" value={destination} mono /><Detail label="Network" value={asset?.network ?? symbol} /><Detail label="Network fee" value={`${fee} ${symbol}`} /><Detail label="Total debit" value={`${amount(numericAmount + fee)} ${symbol}`} /></div></div>{error ? <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}<button type="button" onClick={() => void confirm()} className={`mt-6 min-h-14 w-full rounded-full text-lg font-semibold disabled:opacity-50 ${walletId === "trust" ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}>Confirm transfer</button><p className="mt-4 text-center text-[10px] font-bold uppercase tracking-[.16em] text-white/25">{walletDisclosures[walletId]}</p></div>;
  }

  return (
    <div>
      <div className={`rounded-[1.4rem] border px-4 py-3 text-sm ${transferReady ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : sharedStatus === "error" || sharedStatus === "local" ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-[#a295f3]/20 bg-[#a295f3]/10 text-[#d9d2ff]"}`}>
        <strong>{sharedStatus === "connected" ? "Shared network connected:" : localTrustReady ? "Local demo ready:" : sharedStatus === "connecting" ? "Connecting shared network…" : "Shared network unavailable:"}</strong>{" "}
        {sharedStatus === "connected" ? "send to another user with their complete wallet address." : localTrustReady ? "transfers between the accounts on this device remain atomic and persistent." : sharedStatus === "error" ? sharedError : sharedStatus === "local" ? "this deployment is not connected to the shared wallet database, so transfers are paused." : "please wait before sending."}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <label><FieldLabel>Source wallet</FieldLabel><SelectField value={sourceWalletId} onChange={(event) => changeSourceWallet(event.target.value as WalletThemeId)}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField></label>
        <label><FieldLabel>Source account</FieldLabel><SelectField value={sourceAccount.id} onChange={(event) => { setSourceAccountId(event.target.value); setAmountValue(""); }}>{state.wallets[sourceWalletId].accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField></label>
      </div>
      <label className="mt-4 block"><FieldLabel>Currency</FieldLabel><SelectField value={symbol} onChange={(event) => { setSymbol(event.target.value); setAmountValue(""); }}>{available.map((entry) => <option key={entry.asset.symbol} value={entry.asset.symbol}>{entry.asset.name} ({entry.asset.symbol}) · {amount(entry.balance)}</option>)}</SelectField></label>
      <div className="mt-5 flex items-center justify-between"><FieldLabel>Destination</FieldLabel><button type="button" onClick={() => setUseAddress((value) => !value)} className={`mb-2 flex min-h-11 items-center gap-1.5 text-xs font-bold ${walletId === "trust" ? "text-[#716cff]" : "text-[#a99bf7]"}`}><QrCode className="h-4 w-4" />{useAddress ? "Choose my account" : "Send to another user"}</button></div>
      {useAddress ? (
        <div><div className={`flex min-h-14 items-center rounded-[1.2rem] pr-2 focus-within:ring-2 ${walletId === "trust" ? "bg-[#151725] focus-within:ring-[#4437ff]" : "bg-[#202022] focus-within:ring-[#a295f3]"}`}><input value={destinationAddress} onChange={(event) => { setDestinationAddress(event.target.value.trim()); setError(""); }} placeholder="Address or account.larpz" aria-label="Destination wallet address" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-14 min-w-0 flex-1 bg-transparent px-4 font-mono text-base outline-none" /><button type="button" onClick={() => void pasteDestination()} className={`min-h-11 rounded-full px-4 text-sm font-bold ${walletId === "trust" ? "bg-[#282a43] text-[#8b86ff]" : "bg-[#343438] text-[#b8adff]"}`}>Paste</button></div><p className="mt-2 text-xs text-white/40">Use the complete address or internal account domain shown in Receive.</p></div>
      ) : (
        <div className="grid grid-cols-2 gap-3"><SelectField aria-label="Destination wallet" value={destinationWalletId} onChange={(event) => { const id = event.target.value as WalletThemeId; setDestinationWalletId(id); setDestinationAccountId(state.wallets[id].selectedAccountId); }}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField><SelectField aria-label="Destination account" value={destinationAccount.id} onChange={(event) => setDestinationAccountId(event.target.value)}>{state.wallets[destinationWalletId].accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField></div>
      )}
      <div className="mt-5">
        <div className="flex items-center justify-between"><FieldLabel>Amount</FieldLabel><span className="mb-2 text-xs text-white/45">Available {amount(balance)} {symbol}</span></div>
        <div className={`flex items-center rounded-[1.2rem] px-4 focus-within:ring-2 ${walletId === "trust" ? "bg-[#151725] focus-within:ring-[#4437ff]" : "bg-[#202022] focus-within:ring-[#a295f3]"}`}><input inputMode={walletId === "trust" ? "none" : "decimal"} value={amountValue} onChange={(event) => setAmountValue(event.target.value)} placeholder="0" aria-label="Transfer amount" className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none" /><button type="button" onClick={() => setAmountValue(String(Math.max(0, balance - calculateNetworkFee(symbol, balance))))} className={`min-h-11 rounded-full px-3 py-2 text-xs font-bold ${walletId === "trust" ? "bg-[#24263a] text-[#8580ff]" : "bg-[#343438] text-[#b8adff]"}`}>MAX</button></div>
        {walletId === "trust" ? <div className="mt-3 grid grid-cols-3" aria-label="Transfer numeric keypad">{["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"].map((key) => <button key={key} type="button" aria-label={key === "backspace" ? "Backspace" : key === "." ? "Decimal point" : key} onClick={() => inputAmountKey(key)} className="grid min-h-12 place-items-center rounded-xl text-xl font-bold active:bg-white/[.06]">{key === "backspace" ? "⌫" : key}</button>)}</div> : null}
        <div className="mt-3 flex justify-between text-sm text-white/45"><span>Network fee</span><span>{fee} {symbol}</span></div>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}
      <button type="button" onClick={review} disabled={available.length === 0 || !transferReady} className={`mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full text-lg font-semibold text-white disabled:opacity-40 ${walletId === "trust" ? "bg-[#4437ff]" : "bg-[#a295f3] !text-black"}`}>Review transfer <ArrowRight className="h-5 w-5" /></button>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-5 border-b border-white/[0.055] py-3 last:border-0"><span className="text-white/45">{label}</span><span className={`min-w-0 break-all text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span></div>;
}

function PhantomReceivePanel({ initialMode, state, onClose }: { initialMode: ReceiveMode; state: WalletLedgerState; onClose: () => void }) {
  const account = selectedAccount(state, "ghost");
  const tokenAssets = Object.values(state.assets).filter((asset) => asset.symbol !== "USD");
  const defaultSymbol = tokenAssets.some((asset) => asset.symbol === "SOL") ? "SOL" : tokenAssets[0]?.symbol ?? "SOL";
  const [mode, setMode] = useState<ReceiveMode>(initialMode);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [notice, setNotice] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const asset = state.assets[symbol] ?? tokenAssets[0];
  const stablecoinAssets = [state.assets.USDC, state.assets.USDT].filter(Boolean);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };

  const copy = async () => {
    try {
      await writeClipboard(account.address);
      showNotice("Address copied");
    } catch {
      showNotice("Could not copy the address");
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Receive in ${account.name}`, text: account.address });
        showNotice("Address shared");
        return;
      }
      await writeClipboard(account.address);
      showNotice("Address copied for sharing");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      showNotice("Could not share the address");
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <button type="button" onClick={onClose} className="sr-only">Close Receive</button>
      <header className="shrink-0 px-5 pb-2 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.3rem))]">
        <div className="flex items-center justify-between">
          <div><h1 className="text-[24px] font-semibold tracking-[-.035em]">Receive</h1></div>
          {mode === "cash" ? <button type="button" onClick={() => setHelpOpen(true)} aria-label="About receiving cash" className="grid h-10 w-10 place-items-center rounded-full bg-[#202022] text-white/70"><CircleHelp className="h-5 w-5" /></button> : <span className="h-10 w-10" />}
        </div>
        <div className="mt-5 grid h-11 grid-cols-2 rounded-full border border-white/[0.06] bg-[#1d1d1f] p-1" role="tablist" aria-label="Receive type">
          <button type="button" role="tab" aria-selected={mode === "token"} onClick={() => setMode("token")} className={`rounded-full text-[16px] font-semibold transition ${mode === "token" ? "bg-[#f0f0f0] text-black" : "text-white/45"}`}>Token</button>
          <button type="button" role="tab" aria-selected={mode === "cash"} onClick={() => setMode("cash")} className={`rounded-full text-[16px] font-semibold transition ${mode === "cash" ? "bg-[#f0f0f0] text-black" : "text-white/45"}`}>Cash</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <AddressQrCode value={account.address} className="w-full max-w-[350px] border border-white/[0.1] shadow-[0_18px_70px_rgba(0,0,0,.55)]">
            {mode === "token" && asset ? <RuntimeAssetIcon image={asset.image} name={asset.name} symbol={asset.symbol} className="h-full w-full" /> : <span className="relative block h-full w-full rounded-[28%] bg-[#19191b]">{stablecoinAssets.slice(0, 2).map((stablecoin, index) => <span key={stablecoin.symbol} className={`absolute h-[58%] w-[58%] overflow-hidden rounded-full border-2 border-[#19191b] ${index === 0 ? "left-[6%] top-[8%]" : "bottom-[8%] right-[6%]"}`}>{stablecoin.image ? <Image src={stablecoin.image} alt="" fill unoptimized sizes="48px" className="object-cover" /> : <span className="grid h-full w-full place-items-center text-[8px] font-bold">{stablecoin.symbol}</span>}</span>)}</span>}
          </AddressQrCode>
          {mode === "token" ? (
            <label className="relative mt-7 flex min-h-11 w-full max-w-[350px] cursor-pointer items-center justify-between gap-3 text-[16px] font-semibold">
              <span className="min-w-0 truncate">{asset?.name ?? symbol} <span className="text-white/45">· {shortWalletAddress(account.address)}</span></span>
              <ChevronDown className="h-5 w-5 shrink-0 text-white/55" />
              <select value={symbol} onChange={(event) => setSymbol(event.target.value)} aria-label="Receive token" className="absolute inset-0 cursor-pointer text-base opacity-0">{tokenAssets.map((entry) => <option key={entry.symbol} value={entry.symbol}>{entry.name} ({entry.symbol})</option>)}</select>
            </label>
          ) : <p className="mt-7 w-full max-w-[350px] text-[16px] font-semibold">Stablecoins <span className="text-white/45">· Arrives as cash</span></p>}
        </div>
        <div className="mt-auto space-y-3">
          {notice ? <p role="status" className="text-center text-sm font-medium text-[#00e676]">{notice}</p> : null}
          <button type="button" onClick={() => void copy()} className="min-h-14 w-full rounded-full bg-[#a99bf7] px-5 text-[17px] font-semibold text-black">Copy address</button>
          <button type="button" onClick={() => void share()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#1b1b1d] px-5 text-[17px] font-semibold"><Share2 className="h-5 w-5" /> Share</button>
        </div>
      </div>
      {helpOpen ? (
        <div className="absolute inset-0 z-30 flex items-end bg-black/55 backdrop-blur-sm" role="presentation">
          <button type="button" aria-label="Close cash information" className="absolute inset-0" onClick={() => setHelpOpen(false)} />
          <section role="dialog" aria-modal="true" aria-labelledby="cash-help-title" className="relative w-full rounded-t-[2.5rem] border border-white/[0.08] bg-[#101011] px-6 pb-[max(1.6rem,env(safe-area-inset-bottom))] pt-7 shadow-[0_-24px_70px_rgba(0,0,0,.7)]">
            <div className="flex items-center -space-x-2" aria-hidden="true">{stablecoinAssets.slice(0, 2).map((stablecoin) => <RuntimeAssetIcon key={stablecoin.symbol} image={stablecoin.image} name={stablecoin.name} symbol={stablecoin.symbol} className="h-12 w-12 border-4 border-[#101011]" />)}<ArrowRight className="mx-3 h-5 w-5 text-white/70" /><span className="grid h-12 w-12 place-items-center rounded-full border-4 border-[#101011] bg-[#a295f3] text-black"><WalletCards className="h-6 w-6" /></span></div>
            <h2 id="cash-help-title" className="mt-8 text-[24px] font-semibold tracking-[-.035em]">Add cash with stablecoins</h2>
            <p className="mt-3 text-[17px] leading-relaxed text-white/55">Fund your cash account by sending USDC or Tether to this address. Supported stablecoins are credited to your account as cash.</p>
            <button type="button" onClick={() => setHelpOpen(false)} className="mt-8 min-h-14 w-full rounded-full bg-[#a99bf7] px-5 text-[17px] font-semibold text-black">Okay</button>

          </section>
        </div>
      ) : null}
    </div>
  );
}

function TrustReceivePanel({ state }: { state: WalletLedgerState }) {
  const account = selectedAccount(state, "trust");
  const fundedSymbols = new Set(sortedAccountAssets(state, account).filter((entry) => entry.balance > 0).map((entry) => entry.asset.symbol));
  const receiveAssets = Object.values(state.assets)
    .filter((asset) => asset.symbol !== "USD")
    .sort((left, right) => Number(fundedSymbols.has(right.symbol)) - Number(fundedSymbols.has(left.symbol)) || left.name.localeCompare(right.name));
  const [symbol, setSymbol] = useState(receiveAssets[0]?.symbol ?? "SOL");
  const [notice, setNotice] = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const asset = state.assets[symbol] ?? receiveAssets[0];

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const copy = async () => {
    try {
      await writeClipboard(account.address);
      showNotice("Address copied");
    } catch {
      showNotice("Could not copy the address");
    }
  };
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Receive ${asset?.symbol ?? "tokens"} in Larpz Wallet`, text: account.address });
        showNotice("Address shared");
      } else {
        await writeClipboard(account.address);
        showNotice("Address copied for sharing");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      showNotice("Could not share the address");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] pb-4 text-center">
      <label className="relative mx-auto flex min-h-12 w-fit max-w-full cursor-pointer items-center gap-2 rounded-full border border-white/[0.08] bg-[#151725] px-4 text-[16px] font-bold">
        {asset ? <RuntimeAssetIcon image={asset.image} name={asset.name} symbol={asset.symbol} className="h-7 w-7" /> : null}
        <span className="truncate">{asset?.name ?? symbol}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-white/55" />
        <select value={symbol} onChange={(event) => setSymbol(event.target.value)} aria-label="Receive token" className="absolute inset-0 cursor-pointer text-base opacity-0">
          {receiveAssets.map((entry) => <option key={entry.symbol} value={entry.symbol}>{entry.name} ({entry.symbol})</option>)}
        </select>
      </label>

      <AddressQrCode value={account.address} variant="light" className="mx-auto mt-5 w-full max-w-[340px] rounded-[1.7rem] border-[10px] border-white shadow-[0_24px_80px_rgba(0,0,0,.45)]">
        {asset ? <RuntimeAssetIcon image={asset.image} name={asset.name} symbol={asset.symbol} className="h-full w-full" /> : null}
      </AddressQrCode>

      <p className="mx-auto mt-4 max-w-[340px] break-all font-mono text-[13px] leading-relaxed text-white/70">{account.address}</p>
      <p className="mx-auto mt-2 max-w-[340px] break-all font-mono text-xs text-[#817cff]">Internal domain: {walletAccountDomain(account.id)}</p>
      <div className="mt-5 rounded-[1.35rem] border border-amber-300/10 bg-amber-300/[0.08] p-4 text-left text-[14px] leading-relaxed text-amber-100/75">
        Only send assets on the <strong className="text-amber-100">{asset?.network ?? symbol}</strong> network to this address. Assets sent on an unsupported network may not appear.
      </div>

      {notice ? <p role="status" className="mt-4 text-sm font-semibold text-[#6f68ff]">{notice}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => void copy()} className="flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-[#181a28] px-4 font-bold"><Copy className="h-5 w-5" />Copy</button>
        <button type="button" onClick={() => void share()} className="flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] bg-[#181a28] px-4 font-bold"><Share2 className="h-5 w-5" />Share</button>
      </div>

      <button type="button" aria-expanded={exchangeOpen} onClick={() => setExchangeOpen((current) => !current)} className="mt-4 flex min-h-14 w-full items-center justify-between rounded-[1.25rem] bg-[#181a28] px-5 text-left font-bold">
        <span className="flex items-center gap-3"><WalletCards className="h-5 w-5 text-[#716cff]" />Deposit from crypto exchange</span>
        <ChevronDown className={`h-5 w-5 text-white/50 transition-transform ${exchangeOpen ? "rotate-180" : ""}`} />
      </button>
      {exchangeOpen ? (
        <div className="mt-3 rounded-[1.25rem] border border-[#4a43ff]/20 bg-[#121426] p-4 text-left text-sm leading-relaxed text-white/60">
          Choose <strong className="text-white">{asset?.symbol ?? symbol}</strong> and the <strong className="text-white">{asset?.network ?? symbol}</strong> network at the exchange, then paste this receiving address. This demo never requests exchange credentials.
        </div>
      ) : null}
      <p className="mt-6 text-[9px] font-bold uppercase tracking-[.16em] text-[#716cff]/75">{walletDisclosures.trust}</p>
    </div>
  );
}

function ReceivePanel({ walletId, state }: { walletId: WalletThemeId; state: WalletLedgerState }) {
  const account = selectedAccount(state, walletId);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(account.address); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className="py-5 text-center"><AddressQrCode value={account.address} className="mx-auto w-full max-w-[280px] border border-white/[0.1] shadow-[0_18px_70px_rgba(0,0,0,.55)]" /><h2 className="mt-6 text-2xl font-semibold">Receive in {account.name}</h2><p className="mt-2 text-white/45">Use this address as the destination in any of the three wallets.</p><button type="button" onClick={() => void copy()} className="mt-6 w-full rounded-[1.4rem] bg-[#202022] p-5 text-left"><span className="block text-xs font-bold uppercase tracking-[.1em] text-white/35">{walletLabels[walletId]} address</span><span className="mt-2 flex items-center justify-between gap-3 font-mono text-sm"><span className="break-all">{account.address}</span><Copy className="h-5 w-5 shrink-0 text-[#a99bf7]" /></span></button><p className="mt-4 text-sm text-[#00e676]">{copied ? "Address copied" : walletDisclosures[walletId]}</p></div>;
}

function AccountsPanel({
  activeWalletId,
  state,
  repository,
  sharedError,
  onCommit,
  trustStyle = false,
}: {
  activeWalletId: WalletThemeId;
  state: WalletLedgerState;
  repository: WalletLedgerRepository;
  sharedError: string;
  onCommit: (state: WalletLedgerState, syncMetadata?: boolean) => Promise<boolean>;
  trustStyle?: boolean;
}) {
  const [feedback, setFeedback] = useState<{ kind: "idle" | "saving" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  const handleCommit = (next: WalletLedgerState) => {
    setFeedback({ kind: "saving", message: "Saving account changes…" });
    void onCommit(next).then((saved) => {
      setFeedback(saved
        ? { kind: "success", message: "Account changes saved." }
        : { kind: "error", message: "Account changes remain on this device, but shared wallet sync failed. Try again." });
    }).catch((caught) => {
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "Could not save account changes." });
    });
  };

  const busy = feedback.kind === "saving";
  const visibleFeedback = feedback.kind === "idle" && sharedError
    ? { kind: "error" as const, message: sharedError }
    : feedback;

  return (
    <div aria-busy={busy}>
      <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
        <AccountsPanelControls
          activeWalletId={activeWalletId}
          state={state}
          repository={repository}
          onCommit={handleCommit}
          trustStyle={trustStyle}
        />
      </fieldset>
      {visibleFeedback.message ? (
        <p
          role={visibleFeedback.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-[1rem] px-4 py-3 text-sm ${visibleFeedback.kind === "error" ? "bg-red-500/10 text-red-200" : visibleFeedback.kind === "success" ? "bg-emerald-400/10 text-emerald-200" : "bg-white/[0.05] text-white/60"}`}
        >
          <span>{visibleFeedback.message}</span>
          {visibleFeedback.kind === "error" ? (
            <button
              type="button"
              onClick={() => handleCommit(repository.getState())}
              className={`ml-3 min-h-11 rounded-full px-4 font-semibold ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}
            >
              Retry sync
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function AccountsPanelControls({ activeWalletId, state, repository, onCommit, trustStyle = false }: { activeWalletId: WalletThemeId; state: WalletLedgerState; repository: WalletLedgerRepository; onCommit: (state: WalletLedgerState) => void; trustStyle?: boolean }) {
  const [walletId, setWalletId] = useState(activeWalletId);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const wallet = state.wallets[walletId];
  const create = () => { if (!newName.trim()) return; repository.createAccount(walletId, newName); setNewName(""); onCommit(repository.getState()); };
  return <div className={trustStyle ? "rounded-[1.6rem] bg-[#0d0f1b] p-1" : undefined}><label><FieldLabel>Wallet</FieldLabel><SelectField value={walletId} onChange={(event) => setWalletId(event.target.value as WalletThemeId)}>{Object.keys(walletLabels).map((id) => <option key={id} value={id}>{walletLabels[id as WalletThemeId]}</option>)}</SelectField></label><div className="mt-6 space-y-3">{wallet.accounts.map((account) => { const active = wallet.selectedAccountId === account.id; const total = sortedAccountAssets(state, account).reduce((sum, entry) => sum + entry.value, 0); return <article key={account.id} className={`rounded-[1.5rem] border p-4 ${active ? trustStyle ? "border-[#4a43ff]/70 bg-[#4437ff]/15" : "border-[#a295f3]/60 bg-[#a295f3]/10" : trustStyle ? "border-white/[0.06] bg-[#151725]" : "border-white/[0.06] bg-[#1d1d1f]"}`}><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-full ${active ? trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black" : trustStyle ? "bg-[#222437]" : "bg-[#2a2a2d]"}`}><UserRound className="h-5 w-5" /></span><div className="min-w-0 flex-1">{editing === account.id ? <input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} className={`w-full rounded-lg px-3 py-2 text-base outline-none focus:ring-2 ${trustStyle ? "bg-[#222437] focus:ring-[#4437ff]" : "bg-[#29292b] focus:ring-[#a295f3]"}`} /> : <><strong className="block truncate text-lg">{account.name}</strong><span className="text-sm text-white/45">{money(total)} · {account.address.slice(0, 13)}…</span></>} </div>{editing === account.id ? <button type="button" onClick={() => { repository.renameAccount(walletId, account.id, editName); setEditing(null); onCommit(repository.getState()); }} aria-label={`Save ${account.name} name`} className={`grid h-11 w-11 place-items-center rounded-full ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}><Check className="h-5 w-5" /></button> : <button type="button" onClick={() => { setEditing(account.id); setEditName(account.name); }} aria-label={`Rename ${account.name}`} className={`grid h-11 w-11 place-items-center rounded-full ${trustStyle ? "bg-[#222437]" : "bg-[#29292b]"}`}><Pencil className="h-4 w-4" /></button>}</div><button type="button" onClick={() => { onCommit(repository.selectAccount(walletId, account.id)); }} disabled={active} className={`mt-4 min-h-11 w-full rounded-full py-3 text-sm font-semibold disabled:text-[#00e676] ${trustStyle ? "bg-[#222437] text-[#8580ff]" : "bg-[#29292b] text-[#b9afff]"}`}>{active ? "Current account" : "Switch to account"}</button></article>; })}</div><div className={`mt-7 rounded-[1.5rem] p-4 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><FieldLabel>Create account</FieldLabel><div className="flex gap-2"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={`Account ${wallet.accounts.length + 1}`} aria-label="New account name" className={`h-13 min-w-0 flex-1 rounded-full px-4 text-base outline-none focus:ring-2 ${trustStyle ? "bg-[#222437] focus:ring-[#4437ff]" : "bg-[#29292b] focus:ring-[#a295f3]"}`} /><button type="button" aria-label="Add account" onClick={create} disabled={!newName.trim()} className={`grid h-13 w-13 place-items-center rounded-full disabled:opacity-40 ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}><Plus className="h-6 w-6" /></button></div></div></div>;
}

function HistoryPanel({ walletId, state, trustStyle = false }: { walletId: WalletThemeId; state: WalletLedgerState; trustStyle?: boolean }) {
  const [query, setQuery] = useState("");
  const account = selectedAccount(state, walletId);
  type HistoryEntry = { id: string; type: "send" | "receive"; symbol: string; amount: number; date: string; status: string; note: string; detailId: string; detailLabel: string; fee?: string; search: string };
  const entryMap = new Map<string, HistoryEntry>();
  for (const transaction of transactionsForAccount(state, account.id)) {
    const outgoing = transaction.sourceAccountId === account.id;
    entryMap.set(transaction.id, {
      id: transaction.id,
      type: outgoing ? "send" : "receive",
      symbol: transaction.tokenSymbol,
      amount: transaction.amount,
      date: transaction.timestamp,
      status: transaction.status,
      note: transaction.note,
      detailId: transaction.id,
      detailLabel: "Transfer",
      fee: `${transaction.fee} ${transaction.feeSymbol}`,
      search: `${transaction.id} ${transaction.tokenSymbol} ${transaction.senderAddress} ${transaction.recipientAddress}`,
    });
  }
  for (const operation of state.operations) {
    if (operation.walletId !== walletId || operation.accountId !== account.id) continue;
    for (const activity of operation.activities) {
      entryMap.set(activity.id, {
        id: activity.id,
        type: activity.type,
        symbol: activity.tokenSymbol,
        amount: activity.amount,
        date: activity.date,
        status: activity.status,
        note: activity.note,
        detailId: operation.id,
        detailLabel: "Internal demo operation",
        search: `${operation.id} ${operation.clientRequestId} ${activity.tokenSymbol} ${activity.counterpartyLabel} ${activity.note}`,
      });
    }
  }
  const normalizedQuery = query.trim().toLowerCase();
  const entries = [...entryMap.values()]
    .filter((entry) => !normalizedQuery || entry.search.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return <div><label className={`flex h-14 items-center gap-3 rounded-full px-4 ${trustStyle ? "bg-[#151725]" : "bg-[#202022]"}`}><Search className="h-5 w-5 text-white/35" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions" aria-label="Search transaction history" className="min-w-0 flex-1 bg-transparent text-base outline-none" /></label><p className={`mt-5 text-sm ${trustStyle ? "text-[#8580ff]" : "text-white/45"}`}>{walletLabels[walletId]} · {account.name}</p><div className="mt-3 space-y-2">{entries.map((entry) => { const outgoing = entry.type === "send"; return <article key={entry.id} className={`rounded-[1.35rem] p-4 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-full ${outgoing ? trustStyle ? "bg-[#28234a] text-[#8580ff]" : "bg-[#30293a] text-[#b9afff]" : "bg-[#113426] text-[#00e676]"}`}>{outgoing ? <Send className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><strong className="block">{outgoing ? "Sent" : "Received"} {entry.symbol}</strong><span className="block truncate text-sm text-white/40">{new Date(entry.date).toLocaleString("en-US")}</span></div><span className={`text-right font-semibold ${outgoing ? "text-white" : "text-[#00e676]"}`}>{outgoing ? "−" : "+"}{amount(entry.amount)}<small className="ml-1 text-white/45">{entry.symbol}</small></span></div><details className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-white/45"><summary className={`cursor-pointer ${trustStyle ? "text-[#8580ff]" : "text-[#a99bf7]"}`}>Transaction details</summary><p className="mt-2 break-all font-mono">{entry.detailId}</p><p className="mt-2">Status: {entry.status}{entry.fee ? ` · Fee: ${entry.fee}` : ""}</p><p className="mt-1">{entry.note}</p><p className="mt-1 uppercase tracking-[.08em]">{entry.detailLabel}</p></details></article>; })}{entries.length === 0 ? <p className={`rounded-[1.4rem] px-4 py-10 text-center text-white/45 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}>No matching transactions.</p> : null}</div></div>;
}

function SecurityPanel({ security, trustStyle = false }: { security: ReturnType<typeof useWalletSecurity>; trustStyle?: boolean }) {
  const [pin, setPinValue] = useState("");
  const [notice, setNotice] = useState("");
  const biometricLabel = /iPhone|iPad|iPod/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "Face ID" : "device biometrics";
  const run = async (operation: () => Promise<void>, success: string) => { setNotice(""); try { await operation(); setNotice(success); } catch (error) { setNotice(error instanceof Error ? error.message : "Security action failed."); } };
  return <div><div className={`flex items-start gap-4 rounded-[1.5rem] p-5 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><span className={`grid h-12 w-12 place-items-center rounded-full ${trustStyle ? "bg-[#28234a] text-[#8580ff]" : "bg-[#29243a] text-[#b8adff]"}`}><ShieldCheck className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold">Wallet lock</h2><p className="mt-1 text-sm leading-relaxed text-white/45">{biometricLabel} verifies you using this phone&apos;s built-in security. Larpz Wallet never receives or stores your biometric data.</p></div></div>{security.supported === false ? <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200">This phone does not make Face ID available to the installed wallet. Set a recovery PIN below.</p> : null}<div className="mt-5 space-y-3">{!security.status.enrolled ? <button type="button" disabled={!security.supported || security.busy} onClick={() => void run(security.register, `${biometricLabel} enabled.`)} className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-4 font-semibold disabled:opacity-40 ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}><Fingerprint className="h-5 w-5" />Enable {biometricLabel}</button> : <><button type="button" disabled={security.busy} onClick={() => void run(security.unlock, "Identity verified.")} className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-4 font-semibold disabled:opacity-40 ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}><Fingerprint className="h-5 w-5" />Verify with {biometricLabel}</button><button type="button" disabled={security.busy} onClick={() => void run(security.disable, `${biometricLabel} disabled.`)} className={`min-h-14 w-full rounded-full px-4 font-semibold text-red-300 disabled:opacity-40 ${trustStyle ? "bg-[#222437]" : "bg-[#29292b]"}`}>Disable {biometricLabel}</button></>}<label className={`block rounded-[1.4rem] p-4 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><FieldLabel>Auto-lock timeout</FieldLabel><SelectField value={security.settings.timeoutMinutes} onChange={(event) => security.updateTimeout(Number(event.target.value))}><option value={1}>After 1 minute</option><option value={5}>After 5 minutes</option><option value={15}>After 15 minutes</option><option value={30}>After 30 minutes</option></SelectField></label><div className={`rounded-[1.4rem] p-4 ${trustStyle ? "bg-[#151725]" : "bg-[#1d1d1f]"}`}><FieldLabel>{security.status.pinEnabled ? "Change recovery PIN" : "Create recovery PIN"}</FieldLabel><div className="flex gap-2"><input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="6–12 digits" aria-label="Recovery PIN" className={`h-13 min-w-0 flex-1 rounded-full px-4 text-base outline-none focus:ring-2 ${trustStyle ? "bg-[#222437] focus:ring-[#4437ff]" : "bg-[#29292b] focus:ring-[#a295f3]"}`} /><button type="button" disabled={security.busy || pin.length < 6} onClick={() => void run(() => security.setPin(pin), "Recovery PIN saved.")} className={`rounded-full px-5 font-semibold disabled:opacity-40 ${trustStyle ? "bg-[#4437ff] text-white" : "bg-[#a295f3] text-black"}`}>Save</button></div></div><button type="button" onClick={() => void security.lock()} disabled={!security.status.enrolled && !security.status.pinEnabled} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full border border-white/15 font-semibold disabled:opacity-35"><Lock className="h-5 w-5" />Lock Wallet</button></div>{notice || security.error ? <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm text-white/70 ${trustStyle ? "bg-[#222437]" : "bg-[#252527]"}`}>{notice || security.error}</p> : null}</div>;
}

function WalletLockScreen({ walletId, security }: { walletId: WalletThemeId; security: ReturnType<typeof useWalletSecurity> }) {
  const [pin, setPin] = useState("");
  const biometricLabel = /iPhone|iPad|iPod/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "Face ID" : "biometrics";
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black px-5 text-white"><main className="w-full max-w-[440px] text-center"><span className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] bg-[#a295f3] text-black shadow-[0_0_80px_rgba(162,149,243,.25)]"><Lock className="h-11 w-11" /></span><h1 className="mt-7 text-4xl font-semibold tracking-[-.05em]">Wallet is locked</h1><p className="mx-auto mt-3 max-w-sm text-white/50">Verify on this device to open your wallets. No biometric data leaves your authenticator.</p><button type="button" disabled={!security.supported || security.busy} onClick={() => void security.unlock().catch(() => undefined)} className="mt-8 flex min-h-15 w-full items-center justify-center gap-2 rounded-full bg-[#a295f3] text-lg font-semibold text-black disabled:opacity-40"><Fingerprint className="h-6 w-6" />Unlock with {biometricLabel}</button>{security.status.pinEnabled ? <div className="mt-5 rounded-[1.5rem] bg-[#19191b] p-4"><p className="mb-3 flex items-center justify-center gap-2 text-sm text-white/50"><KeyRound className="h-4 w-4" />Recovery PIN</p><div className="flex gap-2"><input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Enter PIN" aria-label="Recovery PIN" className="h-14 min-w-0 flex-1 rounded-full bg-[#29292b] px-5 text-center text-lg tracking-[.2em] outline-none focus:ring-2 focus:ring-[#a295f3]" /><button type="button" onClick={() => void security.verifyPin(pin).catch(() => undefined)} disabled={security.busy || pin.length < 6} className="grid h-14 w-14 place-items-center rounded-full bg-[#a295f3] text-black disabled:opacity-40"><ArrowRight className="h-6 w-6" /></button></div></div> : null}{security.error ? <p role="alert" className="mt-4 text-sm text-red-300">{security.error}</p> : null}<p className="mt-8 text-[10px] font-bold uppercase tracking-[.16em] text-white/25">{walletDisclosures[walletId]}</p></main></div>;
}
