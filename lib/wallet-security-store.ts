import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AuthenticatorTransportFuture, Base64URLString, CredentialDeviceType } from "@simplewebauthn/server";
import { ChallengeValidationError, shouldUseTemporarySecurityStorage, type SecurityCeremony, type SecurityChallenge } from "@/lib/wallet-security-core";

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
  updatedAt: string;
};

type StoredSession = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
};

type SecurityData = {
  version: 1;
  credentials: StoredPasskey[];
  challenges: StoredChallenge[];
  pins: StoredPin[];
  sessions: StoredSession[];
};

const challengeLifetimeMs = 5 * 60 * 1000;
const defaultSessionLifetimeMs = 30 * 60 * 1000;
const emptyData: SecurityData = { version: 1, credentials: [], challenges: [], pins: [], sessions: [] };

function securityDataPath() {
  const configuredPath = process.env.WALLET_SECURITY_DATA_FILE?.trim();
  if (configuredPath) return configuredPath;

  const cwd = process.cwd();
  if (shouldUseTemporarySecurityStorage({
    cwd,
    vercel: process.env.VERCEL,
    lambdaTaskRoot: process.env.AWS_LAMBDA_TASK_ROOT,
  })) {
    return path.join(tmpdir(), "phantom-wallet-security", "wallet-security.json");
  }

  return path.join(cwd, ".data", "wallet-security.json");
}

function identifier(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function normalizeUserId(userId: unknown) {
  if (typeof userId !== "string" || !/^[a-zA-Z0-9_-]{12,120}$/.test(userId)) {
    throw new Error("A valid wallet security identifier is required.");
  }
  return userId;
}

export function validateSecurityOrigin(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!local && url.protocol !== "https:") throw new Error("Wallet biometrics require HTTPS outside localhost.");
  return { origin: url.origin, rpID: url.hostname };
}

let writeQueue = Promise.resolve();

async function readData() {
  try {
    const parsed = JSON.parse(await readFile(securityDataPath(), "utf8")) as SecurityData;
    if (parsed.version !== 1 || !Array.isArray(parsed.credentials)) return structuredClone(emptyData);
    const now = Date.now();
    return {
      ...parsed,
      challenges: (parsed.challenges ?? []).filter((item) => item.expiresAt > now),
      sessions: (parsed.sessions ?? []).filter((item) => item.expiresAt > now),
      pins: parsed.pins ?? [],
    };
  } catch {
    return structuredClone(emptyData);
  }
}

async function writeData(data: SecurityData) {
  const file = securityDataPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

async function mutate<T>(operation: (data: SecurityData) => T | Promise<T>) {
  let result!: T;
  const task = writeQueue.then(async () => {
    const data = await readData();
    result = await operation(data);
    await writeData(data);
  });
  writeQueue = task.catch(() => undefined);
  await task;
  return result;
}

export async function listPasskeys(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  return (await readData()).credentials.filter((credential) => credential.userId === userId);
}

export async function findPasskey(rawUserId: unknown, credentialId: string) {
  const userId = normalizeUserId(rawUserId);
  return (await readData()).credentials.find((credential) => credential.userId === userId && credential.id === credentialId);
}

export async function savePasskey(passkey: StoredPasskey) {
  normalizeUserId(passkey.userId);
  return mutate((data) => {
    const duplicate = data.credentials.findIndex((credential) => credential.id === passkey.id);
    if (duplicate >= 0) data.credentials[duplicate] = passkey;
    else data.credentials.push(passkey);
    return passkey;
  });
}

export async function updatePasskeyCounter(userId: string, credentialId: string, counter: number) {
  return mutate((data) => {
    const credential = data.credentials.find((item) => item.userId === normalizeUserId(userId) && item.id === credentialId);
    if (!credential) throw new Error("Passkey not found.");
    credential.counter = counter;
  });
}

export async function deletePasskeys(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  return mutate((data) => {
    data.credentials = data.credentials.filter((credential) => credential.userId !== userId);
  });
}

export async function issueChallenge(rawUserId: unknown, ceremony: SecurityCeremony, value: string, webAuthnUserId?: string) {
  const userId = normalizeUserId(rawUserId);
  return mutate((data) => {
    data.challenges = data.challenges.filter((challenge) => challenge.userId !== userId || challenge.ceremony !== ceremony);
    const challenge: StoredChallenge = {
      id: identifier("challenge"),
      userId,
      ceremony,
      value,
      expiresAt: Date.now() + challengeLifetimeMs,
      webAuthnUserId,
    };
    data.challenges.push(challenge);
    return challenge;
  });
}

export async function consumeChallenge(id: string | undefined, rawUserId: unknown, ceremony: SecurityCeremony) {
  const userId = normalizeUserId(rawUserId);
  if (!id) throw new ChallengeValidationError("INVALID", "Security challenge not found.");
  const result = await mutate((data) => {
    const index = data.challenges.findIndex((challenge) => challenge.id === id);
    if (index < 0) throw new ChallengeValidationError("INVALID", "Security challenge is invalid, expired, or already used.");
    const [challenge] = data.challenges.splice(index, 1);
    const error = challenge.expiresAt <= Date.now()
      ? new ChallengeValidationError("EXPIRED", "Security challenge expired.")
      : challenge.userId !== userId || challenge.ceremony !== ceremony
        ? new ChallengeValidationError("MISMATCH", "Security challenge does not match this request.")
        : null;
    return { challenge, error };
  });
  if (result.error) throw result.error;
  return result.challenge;
}

export async function createSecuritySession(rawUserId: unknown, lifetimeMs = defaultSessionLifetimeMs) {
  const userId = normalizeUserId(rawUserId);
  const token = identifier("session");
  await mutate((data) => {
    data.sessions.push({ tokenHash: tokenHash(token), userId, expiresAt: Date.now() + lifetimeMs });
  });
  return { token, expiresAt: Date.now() + lifetimeMs };
}

export async function verifySecuritySession(token: string | undefined, rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  if (!token) return false;
  const hash = tokenHash(token);
  const data = await readData();
  return data.sessions.some((session) => session.tokenHash === hash && session.userId === userId && session.expiresAt > Date.now());
}

export async function revokeSecuritySession(token: string | undefined) {
  if (!token) return;
  const hash = tokenHash(token);
  await mutate((data) => {
    data.sessions = data.sessions.filter((session) => session.tokenHash !== hash);
  });
}

export async function hasRecoveryPin(rawUserId: unknown) {
  const userId = normalizeUserId(rawUserId);
  return (await readData()).pins.some((pin) => pin.userId === userId);
}

export async function setRecoveryPin(rawUserId: unknown, pin: string) {
  const userId = normalizeUserId(rawUserId);
  if (!/^\d{6,12}$/.test(pin)) throw new Error("Use a 6–12 digit recovery PIN.");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(pin, salt, 32).toString("base64url");
  await mutate((data) => {
    data.pins = data.pins.filter((item) => item.userId !== userId);
    data.pins.push({ userId, salt, hash, updatedAt: new Date().toISOString() });
  });
}

export async function verifyRecoveryPin(rawUserId: unknown, pin: string) {
  const userId = normalizeUserId(rawUserId);
  const record = (await readData()).pins.find((item) => item.userId === userId);
  if (!record || !/^\d{6,12}$/.test(pin)) return false;
  const actual = scryptSync(pin, record.salt, 32);
  const expected = Buffer.from(record.hash, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function publicKeyFromStored(passkey: StoredPasskey) {
  return new Uint8Array(Buffer.from(passkey.publicKey, "base64url"));
}

export function publicKeyToStored(publicKey: Uint8Array) {
  return Buffer.from(publicKey).toString("base64url");
}
