import "server-only";

import { neon } from "@neondatabase/serverless";

import type { WalletThemeId } from "@/config/wallets";
import {
  calculateNetworkFee,
  type RemoteWalletAccount,
  type RemoteWalletSnapshot,
  type SimulatedTransaction,
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

export class RemoteWalletError extends Error {
  constructor(
    public readonly code:
      | "DATABASE_NOT_CONFIGURED"
      | "INVALID_REQUEST"
      | "DUPLICATE"
      | "ACCOUNT_NOT_FOUND"
      | "INVALID_ADDRESS"
      | "SAME_ACCOUNT"
      | "INSUFFICIENT_FUNDS",
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

function normalizedAccount(value: unknown) {
  if (!value || typeof value !== "object") throw new RemoteWalletError("INVALID_REQUEST", "A valid wallet account is required.");
  const account = value as RemoteWalletAccount;
  if (
    typeof account.id !== "string"
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
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_transfers_source_owner_idx ON larpz_wallet_transfers (source_owner_id, created_at DESC)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_transfers_destination_owner_idx ON larpz_wallet_transfers (destination_owner_id, created_at DESC)`,
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

async function loadSnapshot(rawOwnerId: unknown): Promise<RemoteWalletSnapshot> {
  const ownerId = normalizedOwnerId(rawOwnerId);
  const sql = neon(databaseUrl());
  const [accountRows, transactionRows] = await sql.transaction([
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
  ], { readOnly: true });
  return {
    accounts: (accountRows as DatabaseAccountRow[]).map(accountFromRow),
    transactions: (transactionRows as DatabaseTransferRow[]).map(transferFromRow),
  };
}

export async function syncRemoteWallet({
  ownerId: rawOwnerId,
  state,
  replaceBalances,
}: {
  ownerId: unknown;
  state: unknown;
  replaceBalances: boolean;
}) {
  const ownerId = normalizedOwnerId(rawOwnerId);
  const accounts = accountsFromState(state);
  await ensureSchema();
  const sql = neon(databaseUrl());
  await sql.transaction(accounts.map((account) => replaceBalances
    ? sql`
        INSERT INTO larpz_wallet_accounts
          (owner_id, account_id, wallet_id, name, address, balances, created_at, updated_at)
        VALUES
          (${ownerId}, ${account.id}, ${account.walletId}, ${account.name}, ${account.address}, ${JSON.stringify(account.balances)}::jsonb, ${account.createdAt}, NOW())
        ON CONFLICT (owner_id, account_id) DO UPDATE SET
          wallet_id = EXCLUDED.wallet_id,
          name = EXCLUDED.name,
          address = EXCLUDED.address,
          balances = EXCLUDED.balances,
          updated_at = NOW()
      `
    : sql`
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
  if (typeof clientRequestId !== "string" || !/^[a-zA-Z0-9_-]{8,180}$/.test(clientRequestId)) throw new RemoteWalletError("INVALID_REQUEST", "A valid transfer request is required.");
  if (typeof sourceAccountId !== "string" || sourceAccountId.length > 180) throw new RemoteWalletError("ACCOUNT_NOT_FOUND", "Source account not found.");
  const destinationId = typeof destinationAccountId === "string" ? destinationAccountId.slice(0, 180) : null;
  const address = typeof destinationAddress === "string" ? destinationAddress.trim() : "";
  if (!destinationId && !/^sim_(ghost|ledger|trust)_[a-z0-9]+$/i.test(address)) {
    throw new RemoteWalletError("INVALID_ADDRESS", "Enter the receiving user's complete simulated wallet address.");
  }
  const symbol = typeof tokenSymbol === "string" ? tokenSymbol.toUpperCase() : "";
  const numericAmount = Number(amount);
  if (!/^[A-Z0-9]{2,12}$/.test(symbol) || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new RemoteWalletError("INVALID_REQUEST", "Enter a valid currency and amount.");
  }
  const fee = calculateNetworkFee(symbol, numericAmount);
  const debit = numericAmount + fee;
  const transactionId = `simtx_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const network = networkBySymbol[symbol] ?? symbol;

  await ensureSchema();
  const sql = neon(databaseUrl());
  const rows = await sql.query(
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
          AND COALESCE((source_account.balances ->> $5)::double precision, 0) + 1e-12 >= $6
          AND NOT EXISTS (
            SELECT 1 FROM larpz_wallet_transfers WHERE client_request_id = $7
          )
      ),
      source_update AS (
        UPDATE larpz_wallet_accounts AS account
        SET balances = jsonb_set(
          account.balances,
          ARRAY[$5]::text[],
          to_jsonb(COALESCE((account.balances ->> $5)::double precision, 0) - $6),
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
          to_jsonb(COALESCE((account.balances ->> $5)::double precision, 0) + $8),
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

  if (rows.length === 0) {
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
