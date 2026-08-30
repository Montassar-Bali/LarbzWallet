import { defaultTokens } from "@/config/tokens";
import type { WalletThemeId } from "@/config/wallets";
import type { ActivityStatus, WalletActivity, WalletToken } from "@/lib/types";

export const walletLedgerStorageKey = "larpz_wallet_ledger_v1";
export const walletLedgerStoragePrefix = "larpz_wallet_ledger_v2";
export const walletLedgerEvent = "wallet-ledger-change";
export const walletLedgerVersion = 1;

const legacyTokenKeys: Record<WalletThemeId, string> = {
  ghost: "larpz_tokens",
  ledger: "larpz_ledger_tokens",
  trust: "larpz_trust_wallet_tokens",
};

const legacyTransactionKeys: Record<WalletThemeId, string> = {
  ghost: "larpz_transactions",
  ledger: "larpz_ledger_transactions",
  trust: "larpz_trust_wallet_transactions",
};

const walletNames: Record<WalletThemeId, string> = {
  ghost: "Phantom",
  ledger: "Ledger",
  trust: "Trust Wallet",
};

export type WalletAsset = {
  symbol: string;
  name: string;
  network: string;
  decimals: number;
  price: number;
  image: string;
};

export type WalletAccount = {
  id: string;
  walletId: WalletThemeId;
  name: string;
  address: string;
  balances: Record<string, number>;
  createdAt: string;
};

export type SimulatedTransaction = {
  id: string;
  clientRequestId: string;
  sourceWalletId: WalletThemeId;
  sourceAccountId: string;
  destinationWalletId: WalletThemeId;
  destinationAccountId: string;
  senderAddress: string;
  recipientAddress: string;
  tokenSymbol: string;
  amount: number;
  fee: number;
  feeSymbol: string;
  network: string;
  timestamp: string;
  status: ActivityStatus;
  note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN";
  legacyIds?: Partial<Record<WalletThemeId, string>>;
};

export type WalletRecord = {
  id: WalletThemeId;
  name: string;
  selectedAccountId: string;
  accounts: WalletAccount[];
};

export type WalletLedgerState = {
  version: typeof walletLedgerVersion;
  updatedAt: string;
  assets: Record<string, WalletAsset>;
  wallets: Record<WalletThemeId, WalletRecord>;
  transactions: SimulatedTransaction[];
};

export type RemoteWalletAccount = WalletAccount & { ownerId: string };

export type RemoteWalletSnapshot = {
  accounts: RemoteWalletAccount[];
  transactions: SimulatedTransaction[];
};

export type TransferInput = {
  clientRequestId: string;
  sourceWalletId: WalletThemeId;
  sourceAccountId: string;
  destinationWalletId?: WalletThemeId;
  destinationAccountId?: string;
  destinationAddress?: string;
  tokenSymbol: string;
  amount: number;
};

export type LegacyWalletSnapshot = {
  tokens?: WalletToken[];
  transactions?: WalletActivity[];
  cash?: number;
  accountName?: string;
};

export type LegacyWalletSnapshots = Partial<Record<WalletThemeId, LegacyWalletSnapshot>>;

export type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export class WalletTransferError extends Error {
  constructor(
    public readonly code:
      | "DUPLICATE"
      | "INVALID_AMOUNT"
      | "INVALID_ADDRESS"
      | "SAME_ACCOUNT"
      | "UNSUPPORTED_ASSET"
      | "INSUFFICIENT_FUNDS"
      | "ACCOUNT_NOT_FOUND"
      | "NETWORK_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "WalletTransferError";
  }
}

const networkBySymbol: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Ethereum",
  USDC: "Ethereum",
  SOL: "Solana",
  BFS: "Solana",
  SUI: "Sui",
  MATIC: "Polygon",
  HYPE: "HyperEVM",
  BNB: "BNB Smart Chain",
  TRX: "Tron",
  XRP: "XRP Ledger",
  DOGE: "Dogecoin",
  USD: "Cash",
};

const decimalsBySymbol: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  SOL: 9,
  BFS: 8,
  USDT: 6,
  USDC: 6,
  USD: 2,
  XRP: 6,
  DOGE: 8,
};

const feesBySymbol: Record<string, number> = {
  BTC: 0.000005,
  ETH: 0.0002,
  SOL: 0.000005,
  BFS: 0.01,
  USDT: 0.01,
  USDC: 0.01,
  USD: 0,
  XRP: 0.00001,
  DOGE: 0.01,
};

function makeId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function roundAssetAmount(value: number, decimals: number) {
  if (!Number.isFinite(value)) return value;
  const safeDecimals = Math.min(Math.max(decimals, 0), 12);
  return Number(value.toFixed(safeDecimals));
}

function cloneState(state: WalletLedgerState): WalletLedgerState {
  return JSON.parse(JSON.stringify(state)) as WalletLedgerState;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function assetFromToken(token: WalletToken): WalletAsset {
  const symbol = token.symbol.toUpperCase();
  return {
    symbol,
    name: token.name,
    network: networkBySymbol[symbol] ?? symbol,
    decimals: decimalsBySymbol[symbol] ?? 8,
    price: Number.isFinite(token.price) ? token.price : 0,
    image: token.image,
  };
}

function baseAssets(snapshots: LegacyWalletSnapshots) {
  const assets: Record<string, WalletAsset> = {};
  for (const token of defaultTokens) {
    assets[token.symbol] = assetFromToken({ ...token, updatedAt: "" });
  }
  assets.USD = {
    symbol: "USD",
    name: "Cash",
    network: "Cash",
    decimals: 2,
    price: 1,
    image: "",
  };
  for (const snapshot of Object.values(snapshots)) {
    for (const token of snapshot?.tokens ?? []) assets[token.symbol.toUpperCase()] = assetFromToken(token);
  }
  return assets;
}

function accountAddress(walletId: WalletThemeId) {
  return `sim_${walletId}_${makeId("account").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
}

function snapshotBalances(snapshot: LegacyWalletSnapshot | undefined) {
  const balances: Record<string, number> = {};
  for (const token of snapshot?.tokens ?? []) {
    if (Number.isFinite(token.balance) && token.balance >= 0) balances[token.symbol.toUpperCase()] = token.balance;
  }
  if (Number.isFinite(snapshot?.cash) && (snapshot?.cash ?? 0) >= 0) balances.USD = snapshot?.cash ?? 0;
  return balances;
}

function createAccount(walletId: WalletThemeId, name: string, balances: Record<string, number>, now: string): WalletAccount {
  return {
    id: makeId(`${walletId}-account`),
    walletId,
    name,
    address: accountAddress(walletId),
    balances,
    createdAt: now,
  };
}

function migrateLegacyTransactions(state: WalletLedgerState, snapshots: LegacyWalletSnapshots) {
  for (const walletId of ["ghost", "ledger", "trust"] as const) {
    const account = state.wallets[walletId].accounts[0];
    for (const record of snapshots[walletId]?.transactions ?? []) {
      const isReceive = record.type === "receive";
      const externalWallet = walletId === "ghost" ? "ledger" : "ghost";
      const externalAccount = state.wallets[externalWallet].accounts[0];
      state.transactions.push({
        id: makeId("legacy-transfer"),
        clientRequestId: `legacy:${walletId}:${record.id}`,
        sourceWalletId: isReceive ? externalWallet : walletId,
        sourceAccountId: isReceive ? externalAccount.id : account.id,
        destinationWalletId: isReceive ? walletId : externalWallet,
        destinationAccountId: isReceive ? account.id : externalAccount.id,
        senderAddress: isReceive ? externalAccount.address : account.address,
        recipientAddress: isReceive ? account.address : externalAccount.address,
        tokenSymbol: record.tokenSymbol.toUpperCase(),
        amount: Math.max(0, record.amount),
        fee: 0,
        feeSymbol: record.tokenSymbol.toUpperCase(),
        network: state.assets[record.tokenSymbol.toUpperCase()]?.network ?? record.tokenSymbol,
        timestamp: record.date,
        status: record.status,
        note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN",
        legacyIds: { [walletId]: record.id },
      });
    }
  }
  state.transactions.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function createInitialWalletLedger(
  snapshots: LegacyWalletSnapshots = {},
  now = new Date().toISOString(),
): WalletLedgerState {
  const wallets = {} as Record<WalletThemeId, WalletRecord>;
  for (const walletId of ["ghost", "ledger", "trust"] as const) {
    const primary = createAccount(walletId, snapshots[walletId]?.accountName?.trim() || "Account 1", snapshotBalances(snapshots[walletId]), now);
    const secondary = createAccount(walletId, "Account 2", {}, now);
    wallets[walletId] = {
      id: walletId,
      name: walletNames[walletId],
      selectedAccountId: primary.id,
      accounts: [primary, secondary],
    };
  }
  const state: WalletLedgerState = {
    version: walletLedgerVersion,
    updatedAt: now,
    assets: baseAssets(snapshots),
    wallets,
    transactions: [],
  };
  migrateLegacyTransactions(state, snapshots);
  return state;
}

function isValidState(value: unknown): value is WalletLedgerState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WalletLedgerState>;
  return candidate.version === walletLedgerVersion && Boolean(candidate.assets) && Boolean(candidate.wallets) && Array.isArray(candidate.transactions);
}

export class WalletLedgerRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly snapshots: LegacyWalletSnapshots = {},
    private readonly now: () => Date = () => new Date(),
    private readonly storageKey = walletLedgerStorageKey,
  ) {}

  getState() {
    const stored = parseJson<unknown>(this.storage.getItem(this.storageKey), null);
    if (isValidState(stored)) return stored;
    const initial = createInitialWalletLedger(this.snapshots, this.now().toISOString());
    this.storage.setItem(this.storageKey, JSON.stringify(initial));
    return initial;
  }

  private commit(next: WalletLedgerState) {
    next.updatedAt = this.now().toISOString();
    this.storage.setItem(this.storageKey, JSON.stringify(next));
    return next;
  }

  applyRemoteSnapshot(snapshot: RemoteWalletSnapshot) {
    const next = mergeRemoteWalletSnapshot(this.getState(), snapshot);
    return this.commit(next);
  }

  createAccount(walletId: WalletThemeId, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter an account name.");
    const next = cloneState(this.getState());
    const account = createAccount(walletId, trimmed.slice(0, 40), {}, this.now().toISOString());
    next.wallets[walletId].accounts.push(account);
    next.wallets[walletId].selectedAccountId = account.id;
    this.commit(next);
    return account;
  }

  renameAccount(walletId: WalletThemeId, accountId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter an account name.");
    const next = cloneState(this.getState());
    const account = next.wallets[walletId].accounts.find((item) => item.id === accountId);
    if (!account) throw new WalletTransferError("ACCOUNT_NOT_FOUND", "Account not found.");
    account.name = trimmed.slice(0, 40);
    return this.commit(next);
  }

  selectAccount(walletId: WalletThemeId, accountId: string) {
    const next = cloneState(this.getState());
    if (!next.wallets[walletId].accounts.some((account) => account.id === accountId)) {
      throw new WalletTransferError("ACCOUNT_NOT_FOUND", "Account not found.");
    }
    next.wallets[walletId].selectedAccountId = accountId;
    return this.commit(next);
  }

  replaceBalances(walletId: WalletThemeId, accountId: string, balances: Record<string, number>) {
    const next = cloneState(this.getState());
    const account = next.wallets[walletId].accounts.find((item) => item.id === accountId);
    if (!account) throw new WalletTransferError("ACCOUNT_NOT_FOUND", "Account not found.");
    for (const [rawSymbol, rawBalance] of Object.entries(balances)) {
      const symbol = rawSymbol.toUpperCase();
      if (!next.assets[symbol] || !Number.isFinite(rawBalance) || rawBalance < 0) continue;
      account.balances[symbol] = roundAssetAmount(rawBalance, next.assets[symbol].decimals);
    }
    return this.commit(next);
  }

  updateAssets(tokens: WalletToken[]) {
    const next = cloneState(this.getState());
    for (const token of tokens) {
      const current = next.assets[token.symbol.toUpperCase()];
      next.assets[token.symbol.toUpperCase()] = { ...current, ...assetFromToken(token) };
    }
    return this.commit(next);
  }

  executeTransfer(input: TransferInput) {
    const current = this.getState();
    if (!input.clientRequestId.trim() || current.transactions.some((item) => item.clientRequestId === input.clientRequestId)) {
      throw new WalletTransferError("DUPLICATE", "This transfer was already submitted.");
    }
    const next = cloneState(current);
    const source = next.wallets[input.sourceWalletId]?.accounts.find((account) => account.id === input.sourceAccountId);
    if (!source) throw new WalletTransferError("ACCOUNT_NOT_FOUND", "Source account not found.");
    const destination = resolveDestination(next, input);
    if (!destination) throw new WalletTransferError("INVALID_ADDRESS", "Choose an internal account or enter a valid simulated address.");
    if (source.id === destination.id) throw new WalletTransferError("SAME_ACCOUNT", "Source and destination accounts must be different.");

    const symbol = input.tokenSymbol.toUpperCase();
    const asset = next.assets[symbol];
    if (!asset) throw new WalletTransferError("UNSUPPORTED_ASSET", `${symbol} is not supported by this simulator.`);
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new WalletTransferError("INVALID_AMOUNT", "Enter an amount greater than zero.");
    const amount = roundAssetAmount(input.amount, asset.decimals);
    if (amount <= 0 || amount !== input.amount) throw new WalletTransferError("INVALID_AMOUNT", `${symbol} supports up to ${asset.decimals} decimal places.`);
    const fee = calculateNetworkFee(symbol, amount);
    const sourceBalance = source.balances[symbol] ?? 0;
    const debit = roundAssetAmount(amount + fee, asset.decimals);
    if (sourceBalance + Number.EPSILON < debit) {
      throw new WalletTransferError("INSUFFICIENT_FUNDS", `Insufficient ${symbol}. You need ${debit} ${symbol}, including the ${fee} ${symbol} fee.`);
    }

    source.balances[symbol] = roundAssetAmount(sourceBalance - debit, asset.decimals);
    destination.balances[symbol] = roundAssetAmount((destination.balances[symbol] ?? 0) + amount, asset.decimals);
    const transaction: SimulatedTransaction = {
      id: makeId("simtx"),
      clientRequestId: input.clientRequestId,
      sourceWalletId: source.walletId,
      sourceAccountId: source.id,
      destinationWalletId: destination.walletId,
      destinationAccountId: destination.id,
      senderAddress: source.address,
      recipientAddress: destination.address,
      tokenSymbol: symbol,
      amount,
      fee,
      feeSymbol: symbol,
      network: asset.network,
      timestamp: this.now().toISOString(),
      status: "completed",
      note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN",
    };
    next.transactions.unshift(transaction);
    this.commit(next);
    return transaction;
  }
}

function resolveDestination(state: WalletLedgerState, input: TransferInput) {
  if (input.destinationWalletId && input.destinationAccountId) {
    return state.wallets[input.destinationWalletId]?.accounts.find((account) => account.id === input.destinationAccountId);
  }
  const address = input.destinationAddress?.trim();
  if (!address || !/^sim_(ghost|ledger|trust)_[a-z0-9]+$/i.test(address)) return undefined;
  for (const wallet of Object.values(state.wallets)) {
    const account = wallet.accounts.find((item) => item.address === address);
    if (account) return account;
  }
  return undefined;
}

export function calculateNetworkFee(symbol: string, amount: number) {
  const normalized = symbol.toUpperCase();
  if (normalized === "USD") return 0;
  const base = feesBySymbol[normalized] ?? 0.0001;
  const proportional = amount * 0.00001;
  return roundAssetAmount(Math.max(base, proportional), decimalsBySymbol[normalized] ?? 8);
}

export function selectedAccount(state: WalletLedgerState, walletId: WalletThemeId) {
  const wallet = state.wallets[walletId];
  return wallet.accounts.find((account) => account.id === wallet.selectedAccountId) ?? wallet.accounts[0];
}

export function transactionsForAccount(state: WalletLedgerState, accountId: string) {
  return state.transactions.filter((transaction) => transaction.sourceAccountId === accountId || transaction.destinationAccountId === accountId);
}

export function sortedAccountAssets(state: WalletLedgerState, account: WalletAccount) {
  return Object.entries(account.balances)
    .map(([symbol, balance]) => ({ asset: state.assets[symbol], balance, value: balance * (state.assets[symbol]?.price ?? 0) }))
    .filter((entry) => entry.asset)
    .sort((a, b) => b.value - a.value || b.balance - a.balance || a.asset.symbol.localeCompare(b.asset.symbol));
}

export function mergeRemoteWalletSnapshot(state: WalletLedgerState, snapshot: RemoteWalletSnapshot) {
  const next = cloneState(state);
  for (const remote of snapshot.accounts) {
    const wallet = next.wallets[remote.walletId];
    if (!wallet) continue;
    const existing = wallet.accounts.find((account) => account.id === remote.id || account.address === remote.address);
    if (existing) {
      existing.name = remote.name;
      existing.address = remote.address;
      existing.balances = { ...remote.balances };
      existing.createdAt = remote.createdAt;
    } else {
      wallet.accounts.push({
        id: remote.id,
        walletId: remote.walletId,
        name: remote.name,
        address: remote.address,
        balances: { ...remote.balances },
        createdAt: remote.createdAt,
      });
    }
    if (!wallet.accounts.some((account) => account.id === wallet.selectedAccountId)) wallet.selectedAccountId = remote.id;
  }

  const transactionMap = new Map(next.transactions.map((transaction) => [transaction.id, transaction]));
  for (const transaction of snapshot.transactions) transactionMap.set(transaction.id, transaction);
  next.transactions = [...transactionMap.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return next;
}

export function walletActivityFromTransfer(transaction: SimulatedTransaction, accountId: string): WalletActivity {
  const outgoing = transaction.sourceAccountId === accountId;
  return {
    id: transaction.legacyIds?.[outgoing ? transaction.sourceWalletId : transaction.destinationWalletId] ?? transaction.id,
    type: outgoing ? "send" : "receive",
    tokenSymbol: transaction.tokenSymbol,
    amount: transaction.amount,
    counterpartyLabel: outgoing ? `${walletNames[transaction.destinationWalletId]} account` : `${walletNames[transaction.sourceWalletId]} account`,
    date: transaction.timestamp,
    status: transaction.status,
    note: `${transaction.note} · Fee ${transaction.fee} ${transaction.feeSymbol}`,
    recipientId: transaction.destinationAccountId,
    senderId: transaction.sourceAccountId,
  };
}

export function readLegacySnapshots(storage: StorageAdapter): LegacyWalletSnapshots {
  const result: LegacyWalletSnapshots = {};
  for (const walletId of ["ghost", "ledger", "trust"] as const) {
    const snapshot: LegacyWalletSnapshot = {
      tokens: parseJson<WalletToken[]>(storage.getItem(legacyTokenKeys[walletId]), []),
      transactions: parseJson<WalletActivity[]>(storage.getItem(legacyTransactionKeys[walletId]), []),
    };
    if (snapshot.tokens?.length === 0 && walletId === "ghost") {
      snapshot.tokens = defaultTokens.map((token) => ({ ...token, updatedAt: new Date().toISOString() }));
    }
    if (snapshot.tokens?.length === 0 && walletId === "trust") {
      const trustBalances: Record<string, number> = { BTC: 0.01, ETH: 0.05, BNB: 0.3, MATIC: 200, USDC: 45, USDT: 59.7, SOL: 0.01 };
      snapshot.tokens = defaultTokens
        .filter((token) => token.symbol in trustBalances)
        .map((token) => ({ ...token, id: `trust-${token.id}`, balance: trustBalances[token.symbol], updatedAt: new Date().toISOString() }));
    }
    if (walletId === "ghost") {
      const profile = parseJson<{ cash?: number; accountName?: string }>(storage.getItem("larpz_download_profile"), {});
      snapshot.cash = profile.cash;
      snapshot.accountName = profile.accountName;
    }
    result[walletId] = snapshot;
  }
  return result;
}

export function syncLegacyWalletViews(storage: StorageAdapter, state: WalletLedgerState) {
  for (const walletId of ["ghost", "ledger", "trust"] as const) {
    const account = selectedAccount(state, walletId);
    const currentTokens = parseJson<WalletToken[]>(storage.getItem(legacyTokenKeys[walletId]), []);
    const tokenMap = new Map(currentTokens.map((token) => [token.symbol.toUpperCase(), token]));
    for (const [symbol, asset] of Object.entries(state.assets)) {
      if (symbol === "USD") continue;
      const existing = tokenMap.get(symbol);
      tokenMap.set(symbol, {
        id: existing?.id ?? `shared-${symbol.toLowerCase()}`,
        name: existing?.name ?? asset.name,
        symbol,
        balance: account.balances[symbol] ?? 0,
        price: existing?.price ?? asset.price,
        change24h: existing?.change24h ?? 0,
        change1h: existing?.change1h,
        change7d: existing?.change7d,
        image: existing?.image || asset.image,
        marketCap: existing?.marketCap,
        volume24h: existing?.volume24h,
        updatedAt: new Date().toISOString(),
      });
    }
    storage.setItem(legacyTokenKeys[walletId], JSON.stringify([...tokenMap.values()]));

    const existingActivities = parseJson<WalletActivity[]>(storage.getItem(legacyTransactionKeys[walletId]), []);
    const activityMap = new Map(existingActivities.map((activity) => [activity.id, activity]));
    for (const transaction of transactionsForAccount(state, account.id)) {
      const activity = walletActivityFromTransfer(transaction, account.id);
      activityMap.set(activity.id, activity);
    }
    storage.setItem(
      legacyTransactionKeys[walletId],
      JSON.stringify([...activityMap.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))),
    );
    if (walletId === "ghost") {
      const profile = parseJson<Record<string, unknown>>(storage.getItem("larpz_download_profile"), {});
      storage.setItem("larpz_download_profile", JSON.stringify({ ...profile, accountName: account.name, cash: account.balances.USD ?? 0 }));
    }
  }
}

export function walletLedgerStorageKeyFor(ownerId: string) {
  const safeOwnerId = ownerId.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120) || "anonymous";
  return `${walletLedgerStoragePrefix}:${safeOwnerId}`;
}

export function createBrowserWalletRepository(ownerId?: string) {
  if (typeof window === "undefined") return null;
  return new WalletLedgerRepository(
    window.localStorage,
    readLegacySnapshots(window.localStorage),
    () => new Date(),
    ownerId ? walletLedgerStorageKeyFor(ownerId) : walletLedgerStorageKey,
  );
}

export function notifyWalletLedgerChanged(state: WalletLedgerState) {
  if (typeof window === "undefined") return;
  syncLegacyWalletViews(window.localStorage, state);
  window.dispatchEvent(new CustomEvent(walletLedgerEvent, { detail: { updatedAt: state.updatedAt } }));
}
