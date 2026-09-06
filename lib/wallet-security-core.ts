export type SecurityCeremony = "registration" | "authentication";

export class WalletSecurityPublicError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "WalletSecurityPublicError";
  }
}

export class RecoveryPinRateLimitError extends WalletSecurityPublicError {
  constructor(retryAfterSeconds: number) {
    super("Too many recovery PIN attempts. Try again later.", 429, retryAfterSeconds);
    this.name = "RecoveryPinRateLimitError";
  }
}

export type WalletSecurityStorageBackend = "database" | "file" | "unconfigured";

export function walletSecurityStorageBackend({
  nodeEnv,
  databaseUrl,
}: {
  nodeEnv?: string;
  databaseUrl?: string;
}): WalletSecurityStorageBackend {
  if (databaseUrl?.trim()) return "database";
  return nodeEnv === "production" ? "unconfigured" : "file";
}

export type SecurityChallenge = {
  id: string;
  userId: string;
  ceremony: SecurityCeremony;
  value: string;
  expiresAt: number;
  webAuthnUserId?: string;
};

export class ChallengeValidationError extends WalletSecurityPublicError {
  constructor(public readonly code: "INVALID" | "EXPIRED" | "REUSED" | "MISMATCH", message: string) {
    super(message);
    this.name = "ChallengeValidationError";
  }
}

export class InMemoryChallengeStore {
  private readonly records = new Map<string, SecurityChallenge>();
  private readonly used = new Set<string>();
  private counter = 0;

  issue(userId: string, ceremony: SecurityCeremony, value: string, now = Date.now(), lifetimeMs = 5 * 60 * 1000) {
    const record: SecurityChallenge = { id: `challenge_${++this.counter}`, userId, ceremony, value, expiresAt: now + lifetimeMs };
    this.records.set(record.id, record);
    return record;
  }

  consume(id: string, userId: string, ceremony: SecurityCeremony, now = Date.now()) {
    if (this.used.has(id)) throw new ChallengeValidationError("REUSED", "This security challenge was already used.");
    const record = this.records.get(id);
    if (!record) throw new ChallengeValidationError("INVALID", "Security challenge not found.");
    if (record.expiresAt <= now) {
      this.records.delete(id);
      this.used.add(id);
      throw new ChallengeValidationError("EXPIRED", "Security challenge expired.");
    }
    if (record.userId !== userId || record.ceremony !== ceremony) {
      throw new ChallengeValidationError("MISMATCH", "Security challenge does not match this request.");
    }
    this.records.delete(id);
    this.used.add(id);
    return record;
  }
}

export async function completeRegistration<TCredential>({
  consume,
  verify,
  persist,
}: {
  consume: () => Promise<SecurityChallenge>;
  verify: (challenge: SecurityChallenge) => Promise<{ verified: boolean; credential?: TCredential }>;
  persist: (credential: TCredential) => Promise<void>;
}) {
  const challenge = await consume();
  const result = await verify(challenge);
  if (!result.verified || !result.credential) throw new WalletSecurityPublicError("Passkey registration could not be verified.");
  await persist(result.credential);
  return { verified: true as const, credential: result.credential };
}

export async function completeAuthentication({
  consume,
  verify,
  updateCounter,
}: {
  consume: () => Promise<SecurityChallenge>;
  verify: (challenge: SecurityChallenge) => Promise<{ verified: boolean; newCounter?: number }>;
  updateCounter: (counter: number) => Promise<void>;
}) {
  const challenge = await consume();
  const result = await verify(challenge);
  if (!result.verified || result.newCounter === undefined) throw new WalletSecurityPublicError("Biometric verification failed.");
  await updateCounter(result.newCounter);
  return { verified: true as const };
}

export function shouldLockWallet({ enabled, enrolled, lastActivityAt, backgroundedAt, timeoutMs, now }: { enabled: boolean; enrolled: boolean; lastActivityAt: number; backgroundedAt?: number | null; timeoutMs: number; now: number }) {
  if (!enabled || !enrolled) return false;
  const reference = backgroundedAt ?? lastActivityAt;
  return now - reference >= timeoutMs;
}

export function supportsPlatformBiometrics(webAuthnSupported: boolean, platformAuthenticatorAvailable: boolean) {
  return webAuthnSupported && platformAuthenticatorAvailable;
}

export function shouldKeepWalletLocked({
  enabled,
  statusAvailable,
  authenticated,
  hasRecentUnlock,
}: {
  enabled: boolean;
  statusAvailable: boolean;
  authenticated: boolean;
  hasRecentUnlock: boolean;
}) {
  if (!enabled) return false;
  return !statusAvailable || !authenticated || !hasRecentUnlock;
}

export async function completeRecoveryUnlock({ verifyPin, createSession }: { verifyPin: () => Promise<boolean>; createSession: () => Promise<void> }) {
  if (!await verifyPin()) throw new WalletSecurityPublicError("The recovery PIN is incorrect.");
  await createSession();
  return { verified: true as const };
}
