import "server-only";

import { neon } from "@neondatabase/serverless";

import type { WalletThemeId } from "@/config/wallets";
import type { WalletActivity } from "@/lib/types";
import {
  calculateNetworkFee,
  isBalanceOperationReplay,
  isTransferReplay,
  normalizeWalletAssetAmount,
  walletAssetDecimals,
  walletAccountIdFromDomain,
  type BalanceOperationInput,
  type RemoteWalletAccount,
  type RemoteWalletSnapshot,
  type SimulatedTransaction,
  type WalletBalanceOperation,
  type WalletLedgerState,
} from "@/lib/wallet-ledger";

type DatabaseAccountRow = {
  owner_id: string;
  account_id: string;
  wallet_id: WalletThemeId;
  name: string;
  address: string;
  balances: Record<string, number> | string;
  created_at: string | Date;
};

type DatabaseTransferRow = {
  id: string;
  client_request_id: string;
  source_wallet_id: WalletThemeId;
  source_account_id: string;
  destination_wallet_id: WalletThemeId;
  destination_account_id: string;
  sender_address: string;
  recipient_address: string;
  token_symbol: string;
  amount: number | string;
  fee: number | string;
  network: string;
  created_at: string | Date;
};

type DatabaseBalanceOperationRow = {
  id: string;
  client_request_id: string;
  owner_id: string;
  wallet_id: WalletThemeId;
  account_id: string;
  deltas: Record<string, number> | string;
  activities: WalletActivity[] | string;
  created_at: string | Date;
};

export class RemoteWalletError extends Error {
  constructor(
    public readonly code:
      | "DATABASE_NOT_CONFIGURED"
      | "INVALID_REQUEST"
      | "ACTIVATION_REQUIRED"
      | "DUPLICATE"
      | "ACCOUNT_NOT_FOUND"
      | "INVALID_ADDRESS"
      | "SAME_ACCOUNT"
      | "INSUFFICIENT_FUNDS"
      | "UNSUPPORTED_ASSET",
    message: string,
  ) {
    super(message);
    this.name = "RemoteWalletError";
  }
}

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim()
    || process.env.STORAGE_URL?.trim()
    || process.env.POSTGRES_URL?.trim();
  if (!url) {
    throw new RemoteWalletError(
      "DATABASE_NOT_CONFIGURED",
      "Shared transfers are waiting for the Neon DATABASE_URL connection.",
    );
  }
  return url;
}

function normalizedOwnerId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{3,120}$/.test(value)) {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid wallet owner is required.");
  }
  return value;
}

function normalizedLegacyOwnerId(value: unknown) {
  const ownerId = normalizedOwnerId(value);
  if (!/^walletowner_[a-zA-Z0-9_-]{3,108}$/.test(ownerId)) {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid legacy wallet owner is required.");
  }
  return ownerId;
}

export async function walletOwnerIdForLicense(value: unknown) {
  if (typeof value !== "string" || value.length > 100) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter the complete activation key.");
  }
  const compact = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (compact.length !== 16) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter the complete activation key in XXXX-XXXX-XXXX-XXXX format.");
  }
  const normalizedKey = compact.match(/.{4}/g)?.join("-") ?? "";
  if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(normalizedKey)) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter the complete activation key in XXXX-XXXX-XXXX-XXXX format.");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`larpz-license:${normalizedKey}`),
  );
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `lic_${fingerprint.slice(0, 32)}`;
}

function normalizedAccountId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{3,180}$/.test(value)) {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid wallet account is required.");
  }
  return value;
}

function normalizedWalletId(value: unknown): WalletThemeId {
  if (value !== "ghost" && value !== "ledger" && value !== "trust") {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid wallet is required.");
  }
  return value;
}

function normalizedClientRequestId(value: unknown, noun: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,180}$/.test(value)) {
    throw new RemoteWalletError("INVALID_REQUEST", `A valid ${noun} request is required.`);
  }
  return value;
}

function normalizedBalanceDeltas(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid balance change is required.");
  }
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 100) {
    throw new RemoteWalletError("INVALID_REQUEST", "Include between 1 and 100 balance changes.");
  }
  const deltas: Record<string, number> = {};
  for (const [rawSymbol, rawDelta] of entries) {
    const symbol = rawSymbol.toUpperCase();
    const decimals = walletAssetDecimals(symbol);
    if (decimals === null) {
      throw new RemoteWalletError("UNSUPPORTED_ASSET", `${symbol || "Asset"} is not supported by this wallet.`);
    }
    if (
      !/^[A-Z0-9]{2,12}$/.test(symbol)
      || Object.hasOwn(deltas, symbol)
      || typeof rawDelta !== "number"
      || !Number.isFinite(rawDelta)
      || rawDelta === 0
    ) {
      throw new RemoteWalletError("INVALID_REQUEST", "A balance change contains invalid currency data.");
    }
    const normalized = normalizeWalletAssetAmount(symbol, rawDelta);
    if (normalized === null || normalized === 0 || normalized !== rawDelta) {
      throw new RemoteWalletError("INVALID_REQUEST", `${symbol} supports up to ${decimals} decimal places.`);
    }
    deltas[symbol] = normalized;
  }
  return deltas;
}

function normalizedOperationActivities(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new RemoteWalletError("INVALID_REQUEST", "Include between 1 and 20 activity records.");
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new RemoteWalletError("INVALID_REQUEST", "A valid activity record is required.");
    }
    const activity = candidate as WalletActivity;
    const tokenSymbol = typeof activity.tokenSymbol === "string" ? activity.tokenSymbol.toUpperCase() : "";
    const decimals = walletAssetDecimals(tokenSymbol);
    const normalizedAmount = typeof activity.amount === "number"
      ? normalizeWalletAssetAmount(tokenSymbol, activity.amount)
      : null;
    if (
      typeof activity.id !== "string"
      || !/^[a-zA-Z0-9:_-]{3,180}$/.test(activity.id)
      || (activity.type !== "send" && activity.type !== "receive")
      || !/^[A-Z0-9]{2,12}$/.test(tokenSymbol)
      || decimals === null
      || !Number.isFinite(activity.amount)
      || activity.amount <= 0
      || normalizedAmount === null
      || normalizedAmount !== activity.amount
      || typeof activity.counterpartyLabel !== "string"
      || !activity.counterpartyLabel.trim()
      || activity.counterpartyLabel.length > 120
      || typeof activity.date !== "string"
      || !Number.isFinite(Date.parse(activity.date))
      || !["completed", "pending", "failed"].includes(activity.status)
      || typeof activity.note !== "string"
      || activity.note.length > 500
    ) {
      throw new RemoteWalletError("INVALID_REQUEST", "An activity record contains invalid data.");
    }
    const optionalId = (id: unknown) => typeof id === "string" && /^[a-zA-Z0-9_-]{3,180}$/.test(id) ? id : undefined;
    return {
      id: activity.id,
      type: activity.type,
      tokenSymbol,
      amount: normalizedAmount,
      counterpartyLabel: activity.counterpartyLabel.trim(),
      date: new Date(activity.date).toISOString(),
      status: activity.status,
      note: activity.note,
      recipientId: optionalId(activity.recipientId),
      senderId: optionalId(activity.senderId),
    } satisfies WalletActivity;
  });
}

function normalizedAccountName(value: unknown) {
  if (typeof value !== "string") {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter a valid account name.");
  }
  const name = value.trim();
  if (!name || name.length > 80) {
    throw new RemoteWalletError("INVALID_REQUEST", "Account names must contain between 1 and 80 characters.");
  }
  return name;
}

function normalizedBalancesPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RemoteWalletError("INVALID_REQUEST", "A valid balance update is required.");
  }
  const entries = Object.entries(value);
  if (entries.length > 100) {
    throw new RemoteWalletError("INVALID_REQUEST", "Too many currencies were included in the balance update.");
  }
  const balances: Record<string, number> = {};
  for (const [rawSymbol, rawBalance] of entries) {
    const symbol = rawSymbol.toUpperCase();
    if (
      !/^[A-Z0-9]{2,12}$/.test(symbol)
      || Object.hasOwn(balances, symbol)
      || typeof rawBalance !== "number"
      || !Number.isFinite(rawBalance)
      || rawBalance < 0
    ) {
      throw new RemoteWalletError("INVALID_REQUEST", "A balance update contains invalid currency data.");
    }
    balances[symbol] = rawBalance;
  }
  return balances;
}

function normalizedAccount(value: unknown) {
  if (!value || typeof value !== "object") throw new RemoteWalletError("INVALID_REQUEST", "A valid wallet account is required.");
  const account = value as RemoteWalletAccount;
  if (
    typeof account.id !== "string"
    || !/^[a-zA-Z0-9_-]{3,180}$/.test(account.id)
    || !["ghost", "ledger", "trust"].includes(account.walletId)
    || typeof account.name !== "string"
    || typeof account.address !== "string"
    || !/^sim_(ghost|ledger|trust)_[a-z0-9]+$/i.test(account.address)
    || !account.balances
    || typeof account.balances !== "object"
  ) {
    throw new RemoteWalletError("INVALID_REQUEST", "A wallet account contains invalid data.");
  }
  const balances: Record<string, number> = {};
  for (const [rawSymbol, rawBalance] of Object.entries(account.balances).slice(0, 100)) {
    const symbol = rawSymbol.toUpperCase();
    if (/^[A-Z0-9]{2,12}$/.test(symbol) && Number.isFinite(rawBalance) && rawBalance >= 0) balances[symbol] = rawBalance;
  }
  return {
    id: account.id.slice(0, 180),
    walletId: account.walletId,
    name: account.name.trim().slice(0, 80) || "Account",
    address: account.address,
    balances,
    createdAt: Number.isFinite(Date.parse(account.createdAt)) ? account.createdAt : new Date().toISOString(),
  };
}

function accountsFromState(state: unknown) {
  if (!state || typeof state !== "object") throw new RemoteWalletError("INVALID_REQUEST", "Wallet state is required.");
  const candidate = state as WalletLedgerState;
  const accounts = (["ghost", "ledger", "trust"] as const).flatMap((walletId) => {
    const wallet = candidate.wallets?.[walletId];
    if (!wallet || !Array.isArray(wallet.accounts)) throw new RemoteWalletError("INVALID_REQUEST", "Wallet state is incomplete.");
    return wallet.accounts.map((account) => normalizedAccount(account));
  });
  if (accounts.length === 0 || accounts.length > 60) throw new RemoteWalletError("INVALID_REQUEST", "Wallet account count is invalid.");
  return accounts;
}

let schemaUrl = "";
let schemaPromise: Promise<void> | null = null;

async function ensureSchema() {
  const url = databaseUrl();
  if (schemaUrl !== url) {
    schemaUrl = url;
    schemaPromise = null;
  }
  if (!schemaPromise) {
    const sql = neon(url);
    schemaPromise = sql.transaction([
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_accounts (
          owner_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          wallet_id TEXT NOT NULL CHECK (wallet_id IN ('ghost', 'ledger', 'trust')),
          name TEXT NOT NULL,
          address TEXT NOT NULL UNIQUE,
          balances JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (owner_id, account_id)
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_transfers (
          id TEXT PRIMARY KEY,
          client_request_id TEXT NOT NULL UNIQUE,
          source_owner_id TEXT NOT NULL,
          source_wallet_id TEXT NOT NULL,
          source_account_id TEXT NOT NULL,
          destination_owner_id TEXT NOT NULL,
          destination_wallet_id TEXT NOT NULL,
          destination_account_id TEXT NOT NULL,
          sender_address TEXT NOT NULL,
          recipient_address TEXT NOT NULL,
          token_symbol TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
          fee DOUBLE PRECISION NOT NULL CHECK (fee >= 0),
          network TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_balance_operations (
          id TEXT PRIMARY KEY,
          client_request_id TEXT NOT NULL UNIQUE,
          owner_id TEXT NOT NULL,
          wallet_id TEXT NOT NULL CHECK (wallet_id IN ('ghost', 'ledger', 'trust')),
          account_id TEXT NOT NULL,
          deltas JSONB NOT NULL,
          activities JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_transfers_source_owner_idx ON larpz_wallet_transfers (source_owner_id, created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_transfers_destination_owner_idx ON larpz_wallet_transfers (destination_owner_id, created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_balance_operations_owner_idx ON larpz_wallet_balance_operations (owner_id, created_at DESC)`,
    ]).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function parsedBalances(value: DatabaseAccountRow["balances"]) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, number>;
    } catch {
      return {};
    }
  }
  return value ?? {};
}

function accountFromRow(row: DatabaseAccountRow): RemoteWalletAccount {
  return {
    ownerId: row.owner_id,
    id: row.account_id,
    walletId: row.wallet_id,
    name: row.name,
    address: row.address,
    balances: parsedBalances(row.balances),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function transferFromRow(row: DatabaseTransferRow): SimulatedTransaction {
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    sourceWalletId: row.source_wallet_id,
    sourceAccountId: row.source_account_id,
    destinationWalletId: row.destination_wallet_id,
    destinationAccountId: row.destination_account_id,
    senderAddress: row.sender_address,
    recipientAddress: row.recipient_address,
    tokenSymbol: row.token_symbol,
    amount: Number(row.amount),
    fee: Number(row.fee),
    feeSymbol: row.token_symbol,
    network: row.network,
    timestamp: new Date(row.created_at).toISOString(),
    status: "completed",
    note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN",
  };
}

function parsedJson<T>(value: T | string, fallback: T): T {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function balanceOperationFromRow(row: DatabaseBalanceOperationRow): WalletBalanceOperation {
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    walletId: row.wallet_id,
    accountId: row.account_id,
    deltas: parsedJson(row.deltas, {}),
    activities: parsedJson(row.activities, []),
    timestamp: new Date(row.created_at).toISOString(),
    note: "INTERNAL DEMO BALANCE OPERATION — NO REAL FUNDS",
  };
}

async function loadSnapshot(rawOwnerId: unknown): Promise<RemoteWalletSnapshot> {
  const ownerId = normalizedOwnerId(rawOwnerId);
  const sql = neon(databaseUrl());
  const [accountRows, transactionRows, operationRows] = await sql.transaction([
    sql`
      SELECT owner_id, account_id, wallet_id, name, address, balances, created_at
      FROM larpz_wallet_accounts
      WHERE owner_id = ${ownerId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT id, client_request_id, source_wallet_id, source_account_id,
        destination_wallet_id, destination_account_id, sender_address,
        recipient_address, token_symbol, amount, fee, network, created_at
      FROM larpz_wallet_transfers
      WHERE source_owner_id = ${ownerId} OR destination_owner_id = ${ownerId}
      ORDER BY created_at DESC
      LIMIT 250
    `,
    sql`
      SELECT id, client_request_id, owner_id, wallet_id, account_id, deltas, activities, created_at
      FROM larpz_wallet_balance_operations
      WHERE owner_id = ${ownerId}
      ORDER BY created_at DESC
      LIMIT 250
    `,
  ], { readOnly: true });
  return {
    accounts: (accountRows as DatabaseAccountRow[]).map(accountFromRow),
    transactions: (transactionRows as DatabaseTransferRow[]).map(transferFromRow),
    operations: (operationRows as DatabaseBalanceOperationRow[]).map(balanceOperationFromRow),
  };
}

export async function syncRemoteWallet({
  ownerId: rawOwnerId,
  state,
  mode,
}: {
  ownerId: unknown;
  state: unknown;
  mode: "initialize" | "metadata";
}) {
  const ownerId = normalizedOwnerId(rawOwnerId);
  const accounts = accountsFromState(state);
  await ensureSchema();
  const sql = neon(databaseUrl());
  if (mode === "initialize") {
    const incomingAccounts = accounts.map((account) => ({
      account_id: account.id,
      wallet_id: account.walletId,
      name: account.name,
      address: account.address,
      balances: account.balances,
      created_at: account.createdAt,
    }));
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`,
      sql.query(
        `
          WITH incoming AS MATERIALIZED (
            SELECT *
            FROM jsonb_to_recordset($2::jsonb) AS account (
              account_id TEXT,
              wallet_id TEXT,
              name TEXT,
              address TEXT,
              balances JSONB,
              created_at TIMESTAMPTZ
            )
          )
          INSERT INTO larpz_wallet_accounts
            (owner_id, account_id, wallet_id, name, address, balances, created_at, updated_at)
          SELECT
            $1, incoming.account_id, incoming.wallet_id, incoming.name,
            incoming.address, incoming.balances, incoming.created_at, NOW()
          FROM incoming
          WHERE NOT EXISTS (
            SELECT 1 FROM larpz_wallet_accounts WHERE owner_id = $1
          )
        `,
        [ownerId, JSON.stringify(incomingAccounts)],
      ),
    ], { isolationLevel: "ReadCommitted" });
    return loadSnapshot(ownerId);
  }
  await sql.transaction(accounts.map((account) => sql`
    INSERT INTO larpz_wallet_accounts
      (owner_id, account_id, wallet_id, name, address, balances, created_at, updated_at)
    VALUES
      (${ownerId}, ${account.id}, ${account.walletId}, ${account.name}, ${account.address}, ${JSON.stringify(account.balances)}::jsonb, ${account.createdAt}, NOW())
    ON CONFLICT (owner_id, account_id) DO UPDATE SET
      wallet_id = EXCLUDED.wallet_id,
      name = EXCLUDED.name,
      address = EXCLUDED.address,
      updated_at = NOW()
  `), { isolationLevel: "Serializable" });
  return loadSnapshot(ownerId);
}

export async function patchRemoteWalletAccount({
  ownerId: rawOwnerId,
  accountId: rawAccountId,
  name: rawName,
  balances: rawBalances,
}: {
  ownerId: unknown;
  accountId: unknown;
  name?: unknown;
  balances?: unknown;
}) {
  const ownerId = normalizedOwnerId(rawOwnerId);
  const accountId = normalizedAccountId(rawAccountId);
  const hasName = rawName !== undefined;
  const hasBalances = rawBalances !== undefined;
  if (!hasName && !hasBalances) {
    throw new RemoteWalletError("INVALID_REQUEST", "An account name or balance update is required.");
  }
  const name = hasName ? normalizedAccountName(rawName) : null;
  const balances = hasBalances ? normalizedBalancesPatch(rawBalances) : {};

  await ensureSchema();
  const sql = neon(databaseUrl());
  const rows = await sql`
    UPDATE larpz_wallet_accounts
    SET
      name = CASE WHEN ${hasName} THEN ${name} ELSE name END,
      balances = balances || ${JSON.stringify(balances)}::jsonb,
      updated_at = NOW()
    WHERE owner_id = ${ownerId} AND account_id = ${accountId}
    RETURNING account_id
  `;
  if (rows.length === 0) {
    throw new RemoteWalletError("ACCOUNT_NOT_FOUND", "Account not found.");
  }
  return loadSnapshot(ownerId);
}

export async function executeRemoteBalanceOperation({
  ownerId: rawOwnerId,
  clientRequestId: rawClientRequestId,
  walletId: rawWalletId,
  accountId: rawAccountId,
  deltas: rawDeltas,
  activities: rawActivities,
}: {
  ownerId: unknown;
  clientRequestId: unknown;
  walletId: unknown;
  accountId: unknown;
  deltas: unknown;
  activities: unknown;
}) {
  const ownerId = normalizedOwnerId(rawOwnerId);
  if (!/^lic_[a-f0-9]{32}$/.test(ownerId)) {
    throw new RemoteWalletError(
      "ACTIVATION_REQUIRED",
      "Activate this installed wallet before changing shared demo balances. No real funds are used.",
    );
  }
  const clientRequestId = normalizedClientRequestId(rawClientRequestId, "balance operation");
  const walletId = normalizedWalletId(rawWalletId);
  const accountId = normalizedAccountId(rawAccountId);
  const deltas = normalizedBalanceDeltas(rawDeltas);
  const activities = normalizedOperationActivities(rawActivities);
  const operationId = `simop_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const input: BalanceOperationInput = { clientRequestId, walletId, accountId, deltas, activities };

  await ensureSchema();
  const sql = neon(databaseUrl());
  const replayExistingOperation = async () => {
    const rows = await sql.query(
      `
        SELECT id, client_request_id, owner_id, wallet_id, account_id, deltas, activities, created_at
        FROM larpz_wallet_balance_operations
        WHERE client_request_id = $1
        LIMIT 1
      `,
      [clientRequestId],
    ) as DatabaseBalanceOperationRow[];
    if (!rows[0]) return null;
    if (rows[0].owner_id !== ownerId) {
      throw new RemoteWalletError("DUPLICATE", "This request ID was already used for another balance operation.");
    }
    const operation = balanceOperationFromRow(rows[0]);
    if (!isBalanceOperationReplay(operation, input)) {
      throw new RemoteWalletError("DUPLICATE", "This request ID was already used for a different balance operation.");
    }
    return { operation, snapshot: await loadSnapshot(ownerId) };
  };

  const existing = await replayExistingOperation();
  if (existing) return existing;

  let rows: DatabaseBalanceOperationRow[];
  try {
    rows = await sql.query(
      `
        WITH locked_account AS MATERIALIZED (
          SELECT owner_id, account_id, wallet_id, balances
          FROM larpz_wallet_accounts
          WHERE owner_id = $1 AND account_id = $2 AND wallet_id = $3
          FOR UPDATE
        ),
        eligible AS MATERIALIZED (
          SELECT *
          FROM locked_account
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_each_text($4::jsonb) AS delta(symbol, amount)
            WHERE COALESCE((locked_account.balances ->> delta.symbol)::numeric, 0)
              + delta.amount::numeric < 0
          )
          AND NOT EXISTS (
            SELECT 1 FROM larpz_wallet_balance_operations WHERE client_request_id = $5
          )
        ),
        account_update AS (
          UPDATE larpz_wallet_accounts AS account
          SET balances = account.balances || COALESCE((
            SELECT jsonb_object_agg(
              delta.symbol,
              to_jsonb(
                COALESCE((account.balances ->> delta.symbol)::numeric, 0)
                  + delta.amount::numeric
              )
            )
            FROM jsonb_each_text($4::jsonb) AS delta(symbol, amount)
          ), '{}'::jsonb),
          updated_at = NOW()
          FROM eligible
          WHERE account.owner_id = eligible.owner_id
            AND account.account_id = eligible.account_id
          RETURNING account.owner_id
        ),
        inserted AS (
          INSERT INTO larpz_wallet_balance_operations (
            id, client_request_id, owner_id, wallet_id, account_id,
            deltas, activities, created_at
          )
          SELECT $6, $5, eligible.owner_id, eligible.wallet_id, eligible.account_id,
            $4::jsonb, $7::jsonb, $8::timestamptz
          FROM eligible
          WHERE EXISTS (SELECT 1 FROM account_update)
          RETURNING id, client_request_id, owner_id, wallet_id, account_id, deltas, activities, created_at
        )
        SELECT id, client_request_id, owner_id, wallet_id, account_id, deltas, activities, created_at
        FROM inserted
      `,
      [ownerId, accountId, walletId, JSON.stringify(deltas), clientRequestId, operationId, JSON.stringify(activities), createdAt],
    ) as DatabaseBalanceOperationRow[];
  } catch (error) {
    const replayed = await replayExistingOperation();
    if (replayed) return replayed;
    throw error;
  }

  if (rows.length === 0) {
    const replayed = await replayExistingOperation();
    if (replayed) return replayed;
    const diagnostics = await sql.query(
      `
        SELECT
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts WHERE owner_id = $1 AND account_id = $2
          ) AS account_exists,
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts
            WHERE owner_id = $1 AND account_id = $2 AND wallet_id = $3
          ) AS wallet_matches,
          EXISTS (
            SELECT 1
            FROM larpz_wallet_accounts AS account,
              jsonb_each_text($4::jsonb) AS delta(symbol, amount)
            WHERE account.owner_id = $1 AND account.account_id = $2
              AND COALESCE((account.balances ->> delta.symbol)::numeric, 0)
                + delta.amount::numeric < 0
          ) AS insufficient
      `,
      [ownerId, accountId, walletId, JSON.stringify(deltas)],
    ) as { account_exists: boolean; wallet_matches: boolean; insufficient: boolean }[];
    const result = diagnostics[0];
    if (!result?.account_exists || !result.wallet_matches) {
      throw new RemoteWalletError("ACCOUNT_NOT_FOUND", "Wallet account not found.");
    }
    if (result.insufficient) {
      throw new RemoteWalletError("INSUFFICIENT_FUNDS", "This operation would make a demo balance negative.");
    }
    throw new RemoteWalletError("INVALID_REQUEST", "The shared balance operation could not be completed.");
  }

  return {
    operation: balanceOperationFromRow(rows[0]),
    snapshot: await loadSnapshot(ownerId),
  };
}

export async function linkRemoteWalletOwner({
  licenseKey,
  legacyOwnerId: rawLegacyOwnerId,
}: {
  licenseKey: unknown;
  legacyOwnerId: unknown;
}) {
  const ownerId = await walletOwnerIdForLicense(licenseKey);
  await ensureSchema();
  if (rawLegacyOwnerId === undefined || rawLegacyOwnerId === null || rawLegacyOwnerId === "") {
    return {
      ownerId,
      linkStatus: "linked" as const,
      snapshot: await loadSnapshot(ownerId),
    };
  }

  const legacyOwnerId = normalizedLegacyOwnerId(rawLegacyOwnerId);
  const sql = neon(databaseUrl());
  const archiveOwnerId = `archive_${crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, "")}`;
  const rows = await sql.query(
    `
      WITH owner_lock AS MATERIALIZED (
        SELECT
          pg_advisory_xact_lock(hashtextextended($1, 0)),
          pg_advisory_xact_lock(hashtextextended($2, 0))
      ),
      facts AS MATERIALIZED (
        SELECT
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts WHERE owner_id = $1
          ) AS source_has_accounts,
          EXISTS (
            SELECT 1 FROM larpz_wallet_transfers
            WHERE source_owner_id = $1 OR destination_owner_id = $1
          ) AS source_has_transfers,
          EXISTS (
            SELECT 1 FROM larpz_wallet_balance_operations WHERE owner_id = $1
          ) AS source_has_operations,
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts WHERE owner_id = $2
          ) AS target_has_accounts,
          EXISTS (
            SELECT 1 FROM larpz_wallet_transfers
            WHERE source_owner_id = $2 OR destination_owner_id = $2
          ) AS target_has_transfers,
          EXISTS (
            SELECT 1 FROM larpz_wallet_balance_operations WHERE owner_id = $2
          ) AS target_has_operations
        FROM owner_lock
      ),
      decision AS MATERIALIZED (
        SELECT CASE
          WHEN NOT source_has_accounts THEN 'retained'
          WHEN NOT target_has_accounts AND NOT target_has_transfers AND NOT target_has_operations THEN 'moved'
          WHEN target_has_accounts AND NOT target_has_transfers AND NOT target_has_operations
            AND (source_has_transfers OR source_has_operations) THEN 'replaced'
          ELSE 'retained'
        END AS action
        FROM facts
      ),
      archived_accounts AS (
        UPDATE larpz_wallet_accounts AS account
        SET owner_id = $3, updated_at = NOW()
        FROM decision
        WHERE decision.action = 'replaced'
          AND account.owner_id = $2
        RETURNING account.account_id
      ),
      archive_barrier AS MATERIALIZED (
        SELECT COUNT(*)::integer AS archived_count FROM archived_accounts
      ),
      moved_accounts AS (
        UPDATE larpz_wallet_accounts AS account
        SET owner_id = $2, updated_at = NOW()
        FROM decision, archive_barrier
        WHERE decision.action IN ('moved', 'replaced')
          AND account.owner_id = $1
        RETURNING account.account_id
      ),
      moved_transfers AS (
        UPDATE larpz_wallet_transfers AS transfer
        SET
          source_owner_id = CASE WHEN transfer.source_owner_id = $1 THEN $2 ELSE transfer.source_owner_id END,
          destination_owner_id = CASE WHEN transfer.destination_owner_id = $1 THEN $2 ELSE transfer.destination_owner_id END
        FROM decision
        WHERE decision.action IN ('moved', 'replaced')
          AND EXISTS (SELECT 1 FROM moved_accounts)
          AND (transfer.source_owner_id = $1 OR transfer.destination_owner_id = $1)
        RETURNING transfer.id
      ),
      moved_operations AS (
        UPDATE larpz_wallet_balance_operations AS operation
        SET owner_id = $2
        FROM decision
        WHERE decision.action IN ('moved', 'replaced')
          AND EXISTS (SELECT 1 FROM moved_accounts)
          AND operation.owner_id = $1
        RETURNING operation.id
      )
      SELECT
        decision.action,
        (SELECT COUNT(*)::integer FROM archived_accounts) AS archived_accounts,
        (SELECT COUNT(*)::integer FROM moved_accounts) AS moved_accounts,
        (SELECT COUNT(*)::integer FROM moved_transfers) AS moved_transfers,
        (SELECT COUNT(*)::integer FROM moved_operations) AS moved_operations
      FROM decision
    `,
    [legacyOwnerId, ownerId, archiveOwnerId],
  ) as {
    action: "moved" | "replaced" | "retained";
    archived_accounts: number;
    moved_accounts: number;
    moved_transfers: number;
    moved_operations: number;
  }[];

  return {
    ownerId,
    linkStatus: rows[0]?.action ?? "retained",
    snapshot: await loadSnapshot(ownerId),
  };
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

export async function executeRemoteTransfer({
  ownerId: rawOwnerId,
  clientRequestId,
  sourceAccountId,
  destinationAccountId,
  destinationAddress,
  tokenSymbol,
  amount,
}: {
  ownerId: unknown;
  clientRequestId: unknown;
  sourceAccountId: unknown;
  destinationAccountId?: unknown;
  destinationAddress?: unknown;
  tokenSymbol: unknown;
  amount: unknown;
}) {
  const ownerId = normalizedOwnerId(rawOwnerId);
  if (!/^lic_[a-f0-9]{32}$/.test(ownerId)) {
    throw new RemoteWalletError(
      "ACTIVATION_REQUIRED",
      "Activate the same license key in every installed wallet before transferring demo balances between wallets. No real funds are used.",
    );
  }
  if (typeof clientRequestId !== "string" || !/^[a-zA-Z0-9_-]{8,180}$/.test(clientRequestId)) throw new RemoteWalletError("INVALID_REQUEST", "A valid transfer request is required.");
  if (typeof sourceAccountId !== "string" || sourceAccountId.length > 180) throw new RemoteWalletError("ACCOUNT_NOT_FOUND", "Source account not found.");
  const destinationId = typeof destinationAccountId === "string" ? normalizedAccountId(destinationAccountId) : null;
  const requestedAddress = destinationId ? "" : typeof destinationAddress === "string" ? destinationAddress.trim() : "";
  const domainAccountId = walletAccountIdFromDomain(requestedAddress);
  if (!destinationId && !domainAccountId && !/^sim_(ghost|ledger|trust)_[a-z0-9]+$/i.test(requestedAddress)) {
    throw new RemoteWalletError("INVALID_ADDRESS", "Enter the receiving user's complete wallet address or internal .larpz domain.");
  }
  const symbol = typeof tokenSymbol === "string" ? tokenSymbol.toUpperCase() : "";
  const requestedAmount = typeof amount === "number" ? amount : Number.NaN;
  const decimals = walletAssetDecimals(symbol);
  const numericAmount = normalizeWalletAssetAmount(symbol, requestedAmount);
  if (!/^[A-Z0-9]{2,12}$/.test(symbol) || decimals === null || numericAmount === null) {
    throw new RemoteWalletError("UNSUPPORTED_ASSET", `${symbol || "Asset"} is not supported by this wallet.`);
  }
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || numericAmount <= 0 || numericAmount !== requestedAmount) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter a valid currency and amount.");
  }
  const fee = calculateNetworkFee(symbol, numericAmount);
  const debit = normalizeWalletAssetAmount(symbol, numericAmount + fee);
  if (debit === null || debit <= 0) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter a valid currency and amount.");
  }
  const transactionId = `simtx_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const network = networkBySymbol[symbol] ?? symbol;

  await ensureSchema();
  const sql = neon(databaseUrl());
  let address = requestedAddress;
  if (domainAccountId) {
    const domainRows = await sql.query(
      `SELECT address FROM larpz_wallet_accounts WHERE account_id = $1 ORDER BY owner_id LIMIT 2`,
      [domainAccountId],
    ) as { address: string }[];
    if (domainRows.length !== 1 || !domainRows[0]?.address) {
      throw new RemoteWalletError("INVALID_ADDRESS", "This internal .larpz account domain was not found or is ambiguous.");
    }
    address = domainRows[0].address;
  }
  const replayExistingTransfer = async () => {
    const replayRows = await sql.query(
      `
        SELECT id, client_request_id, source_wallet_id, source_account_id,
          destination_wallet_id, destination_account_id, sender_address,
          recipient_address, token_symbol, amount, fee, network, created_at
        FROM larpz_wallet_transfers
        WHERE client_request_id = $1 AND source_owner_id = $2
        LIMIT 1
      `,
      [clientRequestId, ownerId],
    ) as DatabaseTransferRow[];
    if (!replayRows[0]) return null;

    const transaction = transferFromRow(replayRows[0]);
    const matchesOriginalRequest = isTransferReplay(transaction, {
      clientRequestId,
      sourceWalletId: transaction.sourceWalletId,
      sourceAccountId,
      destinationWalletId: address ? undefined : transaction.destinationWalletId,
      destinationAccountId: address ? undefined : destinationId ?? undefined,
      destinationAddress: address || undefined,
      tokenSymbol: symbol,
      amount: numericAmount,
    });
    if (!matchesOriginalRequest) {
      throw new RemoteWalletError("DUPLICATE", "This request ID was already used for a different transfer.");
    }

    return {
      transaction,
      snapshot: await loadSnapshot(ownerId),
    };
  };

  const duplicateRequestExists = async () => {
    const duplicateRows = await sql.query(
      `SELECT EXISTS (
        SELECT 1 FROM larpz_wallet_transfers WHERE client_request_id = $1
      ) AS duplicate`,
      [clientRequestId],
    ) as { duplicate: boolean }[];
    return Boolean(duplicateRows[0]?.duplicate);
  };

  const existingTransfer = await replayExistingTransfer();
  if (existingTransfer) return existingTransfer;

  let rows: DatabaseTransferRow[];
  try {
    rows = await sql.query(
    `
      WITH source_account AS MATERIALIZED (
        SELECT * FROM larpz_wallet_accounts
        WHERE owner_id = $1 AND account_id = $2
        FOR UPDATE
      ),
      destination_account AS MATERIALIZED (
        SELECT * FROM larpz_wallet_accounts
        WHERE CASE
          WHEN $3::text <> '' THEN address = $3
          ELSE owner_id = $1 AND account_id = $4
        END
        LIMIT 1
        FOR UPDATE
      ),
      eligible AS MATERIALIZED (
        SELECT
          source_account.owner_id AS source_owner_id,
          source_account.wallet_id AS source_wallet_id,
          source_account.account_id AS source_account_id,
          source_account.address AS sender_address,
          destination_account.owner_id AS destination_owner_id,
          destination_account.wallet_id AS destination_wallet_id,
          destination_account.account_id AS destination_account_id,
          destination_account.address AS recipient_address
        FROM source_account, destination_account
        WHERE (source_account.owner_id, source_account.account_id) <> (destination_account.owner_id, destination_account.account_id)
          AND COALESCE((source_account.balances ->> $5)::numeric, 0) >= $6::numeric
          AND NOT EXISTS (
            SELECT 1 FROM larpz_wallet_transfers WHERE client_request_id = $7
          )
      ),
      source_update AS (
        UPDATE larpz_wallet_accounts AS account
        SET balances = jsonb_set(
          account.balances,
          ARRAY[$5]::text[],
          to_jsonb(GREATEST(0::numeric, COALESCE((account.balances ->> $5)::numeric, 0) - $6::numeric)),
          true
        ), updated_at = NOW()
        FROM eligible
        WHERE account.owner_id = eligible.source_owner_id
          AND account.account_id = eligible.source_account_id
        RETURNING account.owner_id
      ),
      destination_update AS (
        UPDATE larpz_wallet_accounts AS account
        SET balances = jsonb_set(
          account.balances,
          ARRAY[$5]::text[],
          to_jsonb(COALESCE((account.balances ->> $5)::numeric, 0) + $8::numeric),
          true
        ), updated_at = NOW()
        FROM eligible
        WHERE account.owner_id = eligible.destination_owner_id
          AND account.account_id = eligible.destination_account_id
          AND EXISTS (SELECT 1 FROM source_update)
        RETURNING account.owner_id
      ),
      inserted AS (
        INSERT INTO larpz_wallet_transfers (
          id, client_request_id, source_owner_id, source_wallet_id,
          source_account_id, destination_owner_id, destination_wallet_id,
          destination_account_id, sender_address, recipient_address,
          token_symbol, amount, fee, network, created_at
        )
        SELECT
          $9, $7, eligible.source_owner_id, eligible.source_wallet_id,
          eligible.source_account_id, eligible.destination_owner_id,
          eligible.destination_wallet_id, eligible.destination_account_id,
          eligible.sender_address, eligible.recipient_address,
          $5, $8, $10, $11, $12
        FROM eligible
        WHERE EXISTS (SELECT 1 FROM source_update)
          AND EXISTS (SELECT 1 FROM destination_update)
        RETURNING *
      )
      SELECT id, client_request_id, source_wallet_id, source_account_id,
        destination_wallet_id, destination_account_id, sender_address,
        recipient_address, token_symbol, amount, fee, network, created_at
      FROM inserted
    `,
    [ownerId, sourceAccountId, address, destinationId, symbol, debit, clientRequestId, numericAmount, transactionId, fee, network, createdAt],
    ) as DatabaseTransferRow[];
  } catch (error) {
    try {
      const replayedTransfer = await replayExistingTransfer();
      if (replayedTransfer) return replayedTransfer;
    } catch (replayError) {
      if (replayError instanceof RemoteWalletError) throw replayError;
    }
    try {
      if (await duplicateRequestExists()) {
        throw new RemoteWalletError("DUPLICATE", "This transfer was already submitted.");
      }
    } catch (duplicateError) {
      if (duplicateError instanceof RemoteWalletError) throw duplicateError;
    }
    throw error;
  }

  if (rows.length === 0) {
    const replayedTransfer = await replayExistingTransfer();
    if (replayedTransfer) return replayedTransfer;
    const diagnostic = await sql.query(
      `
        SELECT
          EXISTS (SELECT 1 FROM larpz_wallet_transfers WHERE client_request_id = $3) AS duplicate,
          EXISTS (SELECT 1 FROM larpz_wallet_accounts WHERE owner_id = $1 AND account_id = $2) AS source_exists,
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts
            WHERE CASE WHEN $4::text <> '' THEN address = $4 ELSE owner_id = $1 AND account_id = $5 END
          ) AS destination_exists,
          COALESCE((
            SELECT (balances ->> $6)::double precision FROM larpz_wallet_accounts
            WHERE owner_id = $1 AND account_id = $2
          ), 0) AS source_balance,
          EXISTS (
            SELECT 1 FROM larpz_wallet_accounts
            WHERE owner_id = $1 AND account_id = $2
              AND (($4::text <> '' AND address = $4) OR ($4::text = '' AND account_id = $5))
          ) AS same_account
      `,
      [ownerId, sourceAccountId, clientRequestId, address, destinationId, symbol],
    ) as { duplicate: boolean; source_exists: boolean; destination_exists: boolean; source_balance: number | string; same_account: boolean }[];
    const result = diagnostic[0];
    if (result?.duplicate) throw new RemoteWalletError("DUPLICATE", "This transfer was already submitted.");
    if (!result?.source_exists) throw new RemoteWalletError("ACCOUNT_NOT_FOUND", "Source account is not registered on the shared network yet.");
    if (!result?.destination_exists) throw new RemoteWalletError("INVALID_ADDRESS", "The receiving user has not registered this wallet address yet.");
    if (result?.same_account) throw new RemoteWalletError("SAME_ACCOUNT", "Source and destination accounts must be different.");
    if (Number(result?.source_balance ?? 0) < debit) throw new RemoteWalletError("INSUFFICIENT_FUNDS", `Insufficient ${symbol}, including the ${fee} ${symbol} network fee.`);
    throw new RemoteWalletError("INVALID_REQUEST", "The shared transfer could not be completed.");
  }

  return {
    transaction: transferFromRow(rows[0]),
    snapshot: await loadSnapshot(ownerId),
  };
}
