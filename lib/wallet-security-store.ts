import "server-only";

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { neon } from "@neondatabase/serverless";
import type { AuthenticatorTransportFuture, Base64URLString, CredentialDeviceType } from "@simplewebauthn/server";

import {
  ChallengeValidationError,
  RecoveryPinRateLimitError,
  WalletSecurityPublicError,
  walletSecurityStorageBackend,
  type SecurityCeremony,
  type SecurityChallenge,
} from "@/lib/wallet-security-core";

export type StoredPasskey = {
  id: Base64URLString;
  userId: string;
  webAuthnUserId: Base64URLString;
  publicKey: string;
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  createdAt: string;
};

type StoredChallenge = SecurityChallenge;

type StoredPin = {
  userId: string;
  salt: string;
  hash: string;
  hashVersion?: 1 | 2;
  updatedAt: string;
};

type StoredSession = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
};

type StoredRecoveryPinRateLimit = {
  userId: string;
  requestFingerprint: string;
  failedAttempts: number;
  windowStartedAt: number;
  blockedUntil: number;
  updatedAt: number;
};

type SecurityData = {
  version: 1;
  credentials: StoredPasskey[];
  challenges: StoredChallenge[];
  pins: StoredPin[];
  sessions: StoredSession[];
  recoveryPinRateLimits: StoredRecoveryPinRateLimit[];
};

type DatabasePasskeyRow = {
  credential_id: string;
  user_id: string;
  webauthn_user_id: string;
  public_key: string;
  counter: number | string;
  device_type: string;
  backed_up: boolean;
  transports: unknown;
  created_at: string | Date;
};

type DatabaseChallengeRow = {
  id: string;
  user_id: string;
  ceremony: SecurityCeremony;
  challenge_value: string;
  expires_at: string | Date;
  webauthn_user_id: string | null;
};

type DatabasePinRow = {
  user_id: string;
  salt: string;
  pin_hash: string;
  hash_version: number | string;
  updated_at: string | Date;
};

type DatabaseRecoveryPinRateLimitRow = {
  failed_attempts: number | string;
  blocked_until: string | Date | null;
};

const challengeLifetimeMs = 5 * 60 * 1000;
const defaultSessionLifetimeMs = 30 * 60 * 1000;
const recoveryPinAttemptLimit = 5;
const recoveryPinUserAttemptLimit = 10;
const recoveryPinWindowMs = 15 * 60 * 1000;
const recoveryPinBlockMs = 15 * 60 * 1000;
const recoveryPinRateLimitRetentionMs = 24 * 60 * 60 * 1000;
const recoveryPinUserScope = "__all_request_fingerprints__";
const developmentPinPepper = "larpz-wallet-security-development-pin-pepper-v2-only";
const emptyData: SecurityData = {
  version: 1,
  credentials: [],
  challenges: [],
  pins: [],
  sessions: [],
  recoveryPinRateLimits: [],
};
const validTransports = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

class WalletSecurityStorageError extends WalletSecurityPublicError {
  constructor(message: string) {
    super(message, 503);
    this.name = "WalletSecurityStorageError";
  }
}

function recoveryPinPepper() {
  const configured = process.env.WALLET_SECURITY_PIN_PEPPER?.trim();
  if (configured) {
    if (configured.length < 32) {
      throw new WalletSecurityStorageError("Wallet security PIN protection is not configured.");
    }
    return configured;
  }
  const fallback = process.env.LICENSE_KEY_PEPPER?.trim();
  if (fallback && fallback.length >= 32) return fallback;
  if (process.env.NODE_ENV !== "production") return developmentPinPepper;
  throw new WalletSecurityStorageError("Wallet security PIN protection is not configured.");
}

function recoveryPinHash(pin: string, salt: string, version: 1 | 2) {
  const secret = version === 1
    ? pin
    : createHmac("sha256", recoveryPinPepper())
      .update("larpz-wallet-recovery-pin:v2\0", "utf8")
      .update(pin, "utf8")
      .digest();
  return scryptSync(secret, salt, 32);
}

function storageBackend() {
  return walletSecurityStorageBackend({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
}

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new WalletSecurityStorageError(
      "Wallet security storage is not configured.",
    );
  }
  return url;
}

function databaseStorageEnabled() {
  const backend = storageBackend();
  if (backend === "unconfigured") databaseUrl();
  return backend === "database";
}

function securityDataPath() {
  const configuredPath = process.env.WALLET_SECURITY_DATA_FILE?.trim();
  if (configuredPath) return configuredPath;
  return path.join(process.cwd(), ".data", "wallet-security.json");
}

function identifier(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function normalizeUserId(userId: unknown) {
  if (typeof userId !== "string" || !/^[a-zA-Z0-9_-]{12,120}$/.test(userId)) {
    throw new WalletSecurityPublicError("A valid wallet security identifier is required.");
  }
  return userId;
}

function normalizeRequestFingerprint(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new WalletSecurityPublicError("Wallet security verification could not be started.");
  }
  return value;
}

export function validateSecurityOrigin(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!local && url.protocol !== "https:") {
    throw new WalletSecurityPublicError("Wallet biometrics require HTTPS outside localhost.");
  }
  return { origin: url.origin, rpID: url.hostname };
}

let schemaUrl = "";
let schemaPromise: Promise<void> | null = null;

async function ensureDatabaseSchema(url: string) {
  if (schemaUrl !== url) {
    schemaUrl = url;
    schemaPromise = null;
  }
  if (!schemaPromise) {
    const sql = neon(url);
    schemaPromise = sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('larpz_wallet_security_schema_v1'))`,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_security_credentials (
          credential_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          webauthn_user_id TEXT NOT NULL,
          public_key TEXT NOT NULL,
          counter BIGINT NOT NULL DEFAULT 0 CHECK (counter >= 0),
          device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
          backed_up BOOLEAN NOT NULL DEFAULT FALSE,
          transports JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_security_challenges (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          ceremony TEXT NOT NULL CHECK (ceremony IN ('registration', 'authentication')),
          challenge_value TEXT NOT NULL,
          webauthn_user_id TEXT,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, ceremony)
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_security_pins (
          user_id TEXT PRIMARY KEY,
          salt TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          hash_version SMALLINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        ALTER TABLE larpz_wallet_security_pins
        ADD COLUMN IF NOT EXISTS hash_version SMALLINT NOT NULL DEFAULT 1
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_security_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS larpz_wallet_security_pin_rate_limits (
          user_id TEXT NOT NULL,
          request_fingerprint TEXT NOT NULL,
          failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
          window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          blocked_until TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, request_fingerprint)
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_security_credentials_user_idx ON larpz_wallet_security_credentials (user_id)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_security_challenges_expiry_idx ON larpz_wallet_security_challenges (expires_at)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_security_sessions_user_idx ON larpz_wallet_security_sessions (user_id)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_security_sessions_expiry_idx ON larpz_wallet_security_sessions (expires_at)`,
      sql`CREATE INDEX IF NOT EXISTS larpz_wallet_security_pin_rate_limits_updated_idx ON larpz_wallet_security_pin_rate_limits (updated_at)`,
    ]).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function databaseOperation<T>(operation: (sql: ReturnType<typeof neon>) => Promise<T>) {
  try {
    const url = databaseUrl();
    await ensureDatabaseSchema(url);
    return await operation(neon(url));
  } catch (error) {
    if (error instanceof WalletSecurityPublicError) throw error;
    const errorType = error instanceof Error ? error.name : typeof error;
    console.error(`Wallet security storage request failed (${errorType})`);
    throw new WalletSecurityStorageError("Wallet security storage is temporarily unavailable.");
  }
}

function parsedTransports(value: unknown) {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      candidate = [];
    }
  }
  if (!Array.isArray(candidate)) return undefined;
  const transports = candidate.filter(
    (transport): transport is AuthenticatorTransportFuture => typeof transport === "string" && validTransports.has(transport as AuthenticatorTransportFuture),
  );
  return transports.length > 0 ? transports : undefined;
}

function passkeyFromRow(row: DatabasePasskeyRow): StoredPasskey {
  return {
    id: row.credential_id,
    userId: row.user_id,
    webAuthnUserId: row.webauthn_user_id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    deviceType: row.device_type === "multiDevice" ? "multiDevice" : "singleDevice",
    backedUp: row.backed_up,
    transports: parsedTransports(row.transports),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function challengeFromRow(row: DatabaseChallengeRow): StoredChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    ceremony: row.ceremony,
    value: row.challenge_value,
    expiresAt: new Date(row.expires_at).getTime(),
    webAuthnUserId: row.webauthn_user_id ?? undefined,
  };
}

let writeQueue = Promise.resolve();

async function readFileData() {
  try {
    const parsed = JSON.parse(await readFile(securityDataPath(), "utf8")) as SecurityData;
    if (parsed.version !== 1 || !Array.isArray(parsed.credentials)) return structuredClone(emptyData);
    const now = Date.now();
    return {
      ...parsed,
      challenges: (parsed.challenges ?? []).filter((item) => item.expiresAt > now),
      sessions: (parsed.sessions ?? []).filter((item) => item.expiresAt > now),
      pins: parsed.pins ?? [],
      recoveryPinRateLimits: (parsed.recoveryPinRateLimits ?? []).filter(
        (item) => item.blockedUntil > now || item.updatedAt > now - recoveryPinRateLimitRetentionMs,
      ),
    };
  } catch {
    return structuredClone(emptyData);
  }
}

async function writeFileData(data: SecurityData) {
  const file = securityDataPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

async function mutateFile<T>(operation: (data: SecurityData) => T | Promise<T>) {
  let result!: T;
  const task = writeQueue.then(async () => {
    const data = await readFileData();
    result = await operation(data);
    await writeFileData(data);
  });
  writeQueue = task.catch(() => undefined);
  await task;
  return result;
}

export async function listPasskeys(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  if (!databaseStorageEnabled()) {
    return (await readFileData()).credentials.filter((credential) => credential.userId === userId);
  }
  return databaseOperation(async (sql) => {
    const rows = await sql`
      SELECT credential_id, user_id, webauthn_user_id, public_key, counter,
        device_type, backed_up, transports, created_at
      FROM larpz_wallet_security_credentials
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    ` as DatabasePasskeyRow[];
    return rows.map(passkeyFromRow);
  });
}

export async function findPasskey(rawUserId: unknown, credentialId: string) {
  const userId = normalizeUserId(rawUserId);
  if (!databaseStorageEnabled()) {
    return (await readFileData()).credentials.find((credential) => credential.userId === userId && credential.id === credentialId);
  }
  return databaseOperation(async (sql) => {
    const rows = await sql`
      SELECT credential_id, user_id, webauthn_user_id, public_key, counter,
        device_type, backed_up, transports, created_at
      FROM larpz_wallet_security_credentials
      WHERE user_id = ${userId} AND credential_id = ${credentialId}
      LIMIT 1
    ` as DatabasePasskeyRow[];
    return rows[0] ? passkeyFromRow(rows[0]) : undefined;
  });
}

export async function savePasskey(passkey: StoredPasskey, sessionToken?: string) {
  normalizeUserId(passkey.userId);
  if (!databaseStorageEnabled()) {
    return mutateFile((data) => {
      const securityExists = data.credentials.some((credential) => credential.userId === passkey.userId)
        || data.pins.some((pin) => pin.userId === passkey.userId);
      const sessionHash = sessionToken ? tokenHash(sessionToken) : "";
      const authenticated = Boolean(sessionHash) && data.sessions.some(
        (session) => session.tokenHash === sessionHash
          && session.userId === passkey.userId
          && session.expiresAt > Date.now(),
      );
      if (securityExists && !authenticated) {
        throw new WalletSecurityPublicError("Unlock the wallet before adding another passkey.", 401);
      }
      const duplicate = data.credentials.findIndex((credential) => credential.id === passkey.id);
      if (duplicate >= 0) data.credentials[duplicate] = passkey;
      else data.credentials.push(passkey);
      return passkey;
    });
  }
  return databaseOperation(async (sql) => {
    const sessionHash = sessionToken ? tokenHash(sessionToken) : null;
    const results = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext(${'larpz_wallet_security_enrollment:' + passkey.userId}))`,
      sql`
        INSERT INTO larpz_wallet_security_credentials
          (credential_id, user_id, webauthn_user_id, public_key, counter,
           device_type, backed_up, transports, created_at, updated_at)
        SELECT
          ${passkey.id}, ${passkey.userId}, ${passkey.webAuthnUserId}, ${passkey.publicKey}, ${passkey.counter},
          ${passkey.deviceType}, ${passkey.backedUp}, ${JSON.stringify(passkey.transports ?? [])}::jsonb,
          ${passkey.createdAt}, NOW()
        WHERE
          (
            NOT EXISTS (
              SELECT 1 FROM larpz_wallet_security_credentials
              WHERE user_id = ${passkey.userId}
            )
            AND NOT EXISTS (
              SELECT 1 FROM larpz_wallet_security_pins
              WHERE user_id = ${passkey.userId}
            )
          )
          OR EXISTS (
            SELECT 1 FROM larpz_wallet_security_sessions
            WHERE token_hash = ${sessionHash}
              AND user_id = ${passkey.userId}
              AND expires_at > NOW()
          )
        ON CONFLICT (credential_id) DO UPDATE SET
          webauthn_user_id = EXCLUDED.webauthn_user_id,
          public_key = EXCLUDED.public_key,
          counter = EXCLUDED.counter,
          device_type = EXCLUDED.device_type,
          backed_up = EXCLUDED.backed_up,
          transports = EXCLUDED.transports,
          updated_at = NOW()
        WHERE larpz_wallet_security_credentials.user_id = EXCLUDED.user_id
        RETURNING credential_id
      `,
    ]);
    if (!(results[1] as { credential_id: string }[])[0]) {
      throw new WalletSecurityPublicError("Unlock the wallet before adding another passkey.", 401);
    }
    return passkey;
  });
}

export async function updatePasskeyCounter(rawUserId: string, credentialId: string, counter: number) {
  const userId = normalizeUserId(rawUserId);
  if (!databaseStorageEnabled()) {
    return mutateFile((data) => {
      const credential = data.credentials.find((item) => item.userId === userId && item.id === credentialId);
      if (!credential) throw new WalletSecurityPublicError("Passkey not found.");
      credential.counter = counter;
    });
  }
  const updated = await databaseOperation(async (sql) => {
    return await sql`
      UPDATE larpz_wallet_security_credentials
      SET counter = ${counter}, updated_at = NOW()
      WHERE user_id = ${userId} AND credential_id = ${credentialId}
      RETURNING credential_id
    ` as { credential_id: string }[];
  });
  if (!updated[0]) throw new WalletSecurityPublicError("Passkey not found.");
}

export async function deletePasskeys(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  if (!databaseStorageEnabled()) {
    return mutateFile((data) => {
      data.credentials = data.credentials.filter((credential) => credential.userId !== userId);
    });
  }
  await databaseOperation(async (sql) => {
    await sql`DELETE FROM larpz_wallet_security_credentials WHERE user_id = ${userId}`;
  });
}

export async function issueChallenge(rawUserId: unknown, ceremony: SecurityCeremony, value: string, webAuthnUserId?: string) {
  const userId = normalizeUserId(rawUserId);
  const challenge: StoredChallenge = {
    id: identifier("challenge"),
    userId,
    ceremony,
    value,
    expiresAt: Date.now() + challengeLifetimeMs,
    webAuthnUserId,
  };
  if (!databaseStorageEnabled()) {
    return mutateFile((data) => {
      data.challenges = data.challenges.filter((item) => item.userId !== userId || item.ceremony !== ceremony);
      data.challenges.push(challenge);
      return challenge;
    });
  }
  return databaseOperation(async (sql) => {
    const results = await sql.transaction([
      sql`DELETE FROM larpz_wallet_security_challenges WHERE expires_at <= NOW()`,
      sql`DELETE FROM larpz_wallet_security_sessions WHERE expires_at <= NOW()`,
      sql`
        INSERT INTO larpz_wallet_security_challenges
          (id, user_id, ceremony, challenge_value, webauthn_user_id, expires_at)
        VALUES
          (${challenge.id}, ${challenge.userId}, ${challenge.ceremony}, ${challenge.value},
           ${challenge.webAuthnUserId ?? null}, ${new Date(challenge.expiresAt).toISOString()})
        ON CONFLICT (user_id, ceremony) DO UPDATE SET
          id = EXCLUDED.id,
          challenge_value = EXCLUDED.challenge_value,
          webauthn_user_id = EXCLUDED.webauthn_user_id,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
        RETURNING id, user_id, ceremony, challenge_value, expires_at, webauthn_user_id
      `,
    ]);
    const rows = results[2] as DatabaseChallengeRow[];
    return challengeFromRow(rows[0]);
  });
}

export async function consumeChallenge(id: string | undefined, rawUserId: unknown, ceremony: SecurityCeremony) {
  const userId = normalizeUserId(rawUserId);
  if (!id) throw new ChallengeValidationError("INVALID", "Security challenge not found.");
  let challenge: StoredChallenge | undefined;
  if (!databaseStorageEnabled()) {
    challenge = await mutateFile((data) => {
      const index = data.challenges.findIndex(
        (item) => item.id === id && item.userId === userId && item.ceremony === ceremony,
      );
      if (index < 0) {
        const mismatched = data.challenges.some((item) => item.id === id);
        throw new ChallengeValidationError(
          mismatched ? "MISMATCH" : "INVALID",
          "Security challenge is invalid, expired, or already used.",
        );
      }
      const [stored] = data.challenges.splice(index, 1);
      return stored;
    });
  } else {
    challenge = await databaseOperation(async (sql) => {
      const results = await sql.transaction([
        sql`DELETE FROM larpz_wallet_security_challenges WHERE expires_at <= NOW() AND id <> ${id}`,
        sql`DELETE FROM larpz_wallet_security_sessions WHERE expires_at <= NOW()`,
        sql`
          DELETE FROM larpz_wallet_security_challenges
          WHERE id = ${id} AND user_id = ${userId} AND ceremony = ${ceremony}
          RETURNING id, user_id, ceremony, challenge_value, expires_at, webauthn_user_id
        `,
      ]);
      const rows = results[2] as DatabaseChallengeRow[];
      return rows[0] ? challengeFromRow(rows[0]) : undefined;
    });
  }
  if (!challenge) throw new ChallengeValidationError("INVALID", "Security challenge is invalid, expired, or already used.");
  if (challenge.expiresAt <= Date.now()) throw new ChallengeValidationError("EXPIRED", "Security challenge expired.");
  return challenge;
}

export async function createSecuritySession(rawUserId: unknown, lifetimeMs = defaultSessionLifetimeMs) {
  const userId = normalizeUserId(rawUserId);
  const token = identifier("session");
  const expiresAt = Date.now() + lifetimeMs;
  if (!databaseStorageEnabled()) {
    await mutateFile((data) => {
      data.sessions.push({ tokenHash: tokenHash(token), userId, expiresAt });
    });
  } else {
    await databaseOperation(async (sql) => {
      await sql.transaction([
        sql`DELETE FROM larpz_wallet_security_sessions WHERE expires_at <= NOW()`,
        sql`DELETE FROM larpz_wallet_security_challenges WHERE expires_at <= NOW()`,
        sql`
          INSERT INTO larpz_wallet_security_sessions (token_hash, user_id, expires_at)
          VALUES (${tokenHash(token)}, ${userId}, ${new Date(expiresAt).toISOString()})
        `,
      ]);
    });
  }
  return { token, expiresAt };
}

export async function verifySecuritySession(token: string | undefined, rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  if (!token) return false;
  const hash = tokenHash(token);
  if (!databaseStorageEnabled()) {
    const data = await readFileData();
    return data.sessions.some((session) => session.tokenHash === hash && session.userId === userId && session.expiresAt > Date.now());
  }
  return databaseOperation(async (sql) => {
    const results = await sql.transaction([
      sql`DELETE FROM larpz_wallet_security_sessions WHERE expires_at <= NOW()`,
      sql`DELETE FROM larpz_wallet_security_challenges WHERE expires_at <= NOW()`,
      sql`
        SELECT EXISTS (
          SELECT 1
          FROM larpz_wallet_security_sessions
          WHERE token_hash = ${hash} AND user_id = ${userId} AND expires_at > NOW()
        ) AS authenticated
      `,
    ]);
    return Boolean((results[2] as { authenticated: boolean }[])[0]?.authenticated);
  });
}

export async function revokeSecuritySession(token: string | undefined) {
  if (!token) return;
  const hash = tokenHash(token);
  if (!databaseStorageEnabled()) {
    await mutateFile((data) => {
      data.sessions = data.sessions.filter((session) => session.tokenHash !== hash);
    });
    return;
  }
  await databaseOperation(async (sql) => {
    await sql.transaction([
      sql`DELETE FROM larpz_wallet_security_sessions WHERE token_hash = ${hash} OR expires_at <= NOW()`,
      sql`DELETE FROM larpz_wallet_security_challenges WHERE expires_at <= NOW()`,
    ]);
  });
}

export async function hasRecoveryPin(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  if (!databaseStorageEnabled()) return (await readFileData()).pins.some((pin) => pin.userId === userId);
  return databaseOperation(async (sql) => {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM larpz_wallet_security_pins WHERE user_id = ${userId}
      ) AS configured
    ` as { configured: boolean }[];
    return Boolean(rows[0]?.configured);
  });
}

export async function setRecoveryPin(rawUserId: unknown, pin: string) {
  const userId = normalizeUserId(rawUserId);
  if (!/^\d{6,12}$/.test(pin)) throw new WalletSecurityPublicError("Use a 6–12 digit recovery PIN.");
  const salt = randomBytes(16).toString("base64url");
  const hash = recoveryPinHash(pin, salt, 2).toString("base64url");
  if (!databaseStorageEnabled()) {
    await mutateFile((data) => {
      data.pins = data.pins.filter((item) => item.userId !== userId);
      data.pins.push({ userId, salt, hash, hashVersion: 2, updatedAt: new Date().toISOString() });
    });
    return;
  }
  await databaseOperation(async (sql) => {
    await sql`
      INSERT INTO larpz_wallet_security_pins (user_id, salt, pin_hash, hash_version, updated_at)
      VALUES (${userId}, ${salt}, ${hash}, 2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        salt = EXCLUDED.salt,
        pin_hash = EXCLUDED.pin_hash,
        hash_version = EXCLUDED.hash_version,
        updated_at = NOW()
    `;
  });
}

function retryAfterSeconds(blockedUntil: number, now: number) {
  return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
}

function reserveFileRecoveryPinAttempt(
  data: SecurityData,
  userId: string,
  requestFingerprint: string,
  attemptLimit: number,
  now: number,
) {
  const index = data.recoveryPinRateLimits.findIndex(
    (item) => item.userId === userId && item.requestFingerprint === requestFingerprint,
  );
  const previous = index >= 0 ? data.recoveryPinRateLimits[index] : undefined;
  if (previous?.blockedUntil && previous.blockedUntil > now) return previous.blockedUntil;

  const resetWindow = !previous || previous.windowStartedAt <= now - recoveryPinWindowMs;
  const failedAttempts = resetWindow ? 1 : previous.failedAttempts + 1;
  const blockedUntil = !resetWindow && failedAttempts > attemptLimit
    ? now + recoveryPinBlockMs
    : 0;
  const next: StoredRecoveryPinRateLimit = {
    userId,
    requestFingerprint,
    failedAttempts,
    windowStartedAt: resetWindow ? now : previous.windowStartedAt,
    blockedUntil,
    updatedAt: now,
  };
  if (index >= 0) data.recoveryPinRateLimits[index] = next;
  else data.recoveryPinRateLimits.push(next);
  return blockedUntil;
}

function reserveDatabaseRecoveryPinAttempt(
  sql: ReturnType<typeof neon>,
  userId: string,
  requestFingerprint: string,
  attemptLimit: number,
) {
  return sql`
    INSERT INTO larpz_wallet_security_pin_rate_limits
      (user_id, request_fingerprint, failed_attempts, window_started_at, blocked_until, updated_at)
    VALUES (${userId}, ${requestFingerprint}, 1, NOW(), NULL, NOW())
    ON CONFLICT (user_id, request_fingerprint) DO UPDATE SET
      failed_attempts = CASE
        WHEN larpz_wallet_security_pin_rate_limits.blocked_until > NOW()
          THEN larpz_wallet_security_pin_rate_limits.failed_attempts
        WHEN larpz_wallet_security_pin_rate_limits.window_started_at <= NOW() - (${recoveryPinWindowMs} * INTERVAL '1 millisecond')
          THEN 1
        ELSE larpz_wallet_security_pin_rate_limits.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN larpz_wallet_security_pin_rate_limits.blocked_until > NOW()
          THEN larpz_wallet_security_pin_rate_limits.window_started_at
        WHEN larpz_wallet_security_pin_rate_limits.window_started_at <= NOW() - (${recoveryPinWindowMs} * INTERVAL '1 millisecond')
          THEN NOW()
        ELSE larpz_wallet_security_pin_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN larpz_wallet_security_pin_rate_limits.blocked_until > NOW()
          THEN larpz_wallet_security_pin_rate_limits.blocked_until
        WHEN larpz_wallet_security_pin_rate_limits.window_started_at <= NOW() - (${recoveryPinWindowMs} * INTERVAL '1 millisecond')
          THEN NULL
        WHEN larpz_wallet_security_pin_rate_limits.failed_attempts >= ${attemptLimit}
          THEN NOW() + (${recoveryPinBlockMs} * INTERVAL '1 millisecond')
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING failed_attempts, blocked_until
  `;
}

async function claimRecoveryPinAttempt(userId: string, requestFingerprint: string) {
  if (!databaseStorageEnabled()) {
    const blockedUntil = await mutateFile((data) => {
      const now = Date.now();
      const activeBlock = data.recoveryPinRateLimits
        .filter((item) => item.userId === userId
          && (item.requestFingerprint === requestFingerprint || item.requestFingerprint === recoveryPinUserScope)
          && item.blockedUntil > now)
        .reduce((latest, item) => Math.max(latest, item.blockedUntil), 0);
      if (activeBlock) return activeBlock;
      return Math.max(
        reserveFileRecoveryPinAttempt(data, userId, requestFingerprint, recoveryPinAttemptLimit, now),
        reserveFileRecoveryPinAttempt(data, userId, recoveryPinUserScope, recoveryPinUserAttemptLimit, now),
      );
    });
    if (blockedUntil > Date.now()) {
      throw new RecoveryPinRateLimitError(retryAfterSeconds(blockedUntil, Date.now()));
    }
    return;
  }

  const blockedUntil = await databaseOperation(async (sql) => {
    const results = await sql.transaction([
      sql`
        DELETE FROM larpz_wallet_security_pin_rate_limits
        WHERE updated_at <= NOW() - (${recoveryPinRateLimitRetentionMs} * INTERVAL '1 millisecond')
          AND (blocked_until IS NULL OR blocked_until <= NOW())
      `,
      reserveDatabaseRecoveryPinAttempt(sql, userId, requestFingerprint, recoveryPinAttemptLimit),
      reserveDatabaseRecoveryPinAttempt(sql, userId, recoveryPinUserScope, recoveryPinUserAttemptLimit),
    ]);
    const fingerprintRow = (results[1] as DatabaseRecoveryPinRateLimitRow[])[0];
    const userRow = (results[2] as DatabaseRecoveryPinRateLimitRow[])[0];
    if (!fingerprintRow || !userRow) {
      throw new WalletSecurityStorageError("Wallet security rate limiting is temporarily unavailable.");
    }
    return Math.max(
      fingerprintRow.blocked_until ? new Date(fingerprintRow.blocked_until).getTime() : 0,
      userRow.blocked_until ? new Date(userRow.blocked_until).getTime() : 0,
    );
  });
  if (blockedUntil > Date.now()) {
    throw new RecoveryPinRateLimitError(retryAfterSeconds(blockedUntil, Date.now()));
  }
}

async function clearRecoveryPinFailures(userId: string) {
  if (!databaseStorageEnabled()) {
    await mutateFile((data) => {
      data.recoveryPinRateLimits = data.recoveryPinRateLimits.filter(
        (item) => item.userId !== userId,
      );
    });
    return;
  }
  await databaseOperation(async (sql) => {
    await sql`
      DELETE FROM larpz_wallet_security_pin_rate_limits
      WHERE user_id = ${userId}
    `;
  });
}

export async function verifyRecoveryPin(rawUserId: unknown, pin: string, rawRequestFingerprint: unknown) {
  const userId = normalizeUserId(rawUserId);
  const requestFingerprint = normalizeRequestFingerprint(rawRequestFingerprint);
  await claimRecoveryPinAttempt(userId, requestFingerprint);
  let record: StoredPin | undefined;
  if (!databaseStorageEnabled()) {
    record = (await readFileData()).pins.find((item) => item.userId === userId);
  } else {
    record = await databaseOperation(async (sql) => {
      const rows = await sql`
        SELECT user_id, salt, pin_hash, hash_version, updated_at
        FROM larpz_wallet_security_pins
        WHERE user_id = ${userId}
        LIMIT 1
      ` as DatabasePinRow[];
      const row = rows[0];
      return row ? {
        userId: row.user_id,
        salt: row.salt,
        hash: row.pin_hash,
        hashVersion: Number(row.hash_version) === 2 ? 2 : 1,
        updatedAt: new Date(row.updated_at).toISOString(),
      } : undefined;
    });
  }
  if (!record || !/^\d{6,12}$/.test(pin)) return false;
  const hashVersion = record.hashVersion === 2 ? 2 : 1;
  const actual = recoveryPinHash(pin, record.salt, hashVersion);
  const expected = Buffer.from(record.hash, "base64url");
  const verified = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (verified) {
    if (hashVersion === 1) await setRecoveryPin(userId, pin);
    await clearRecoveryPinFailures(userId);
  }
  return verified;
}

export function publicKeyFromStored(passkey: StoredPasskey) {
  return new Uint8Array(Buffer.from(passkey.publicKey, "base64url"));
}

export function publicKeyToStored(publicKey: Uint8Array) {
  return Buffer.from(publicKey).toString("base64url");
}
