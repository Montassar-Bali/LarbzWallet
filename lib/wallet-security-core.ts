export type SecurityCeremony = "registration" | "authentication";

export function shouldUseTemporarySecurityStorage({
  cwd,
  vercel,
  lambdaTaskRoot,
}: {
  cwd: string;
  vercel?: string;
  lambdaTaskRoot?: string;
}) {
  const normalizedCwd = cwd.replace(/\/+$/, "") || "/";
  const normalizedTaskRoot = lambdaTaskRoot?.replace(/\/+$/, "");
  return vercel === "1"
    || normalizedCwd === "/var/task"
    || normalizedCwd.startsWith("/var/task/")
    || normalizedTaskRoot === "/var/task";
}

export type SecurityChallenge = {
  id: string;
  userId: string;
  ceremony: SecurityCeremony;
  value: string;
  expiresAt: number;
  webAuthnUserId?: string;
};

export class ChallengeValidationError extends Error {
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
    this.records.delete(id);
    this.used.add(id);
    if (record.expiresAt <= now) throw new ChallengeValidationError("EXPIRED", "Security challenge expired.");
    if (record.userId !== userId || record.ceremony !== ceremony) {
      throw new ChallengeValidationError("MISMATCH", "Security challenge does not match this request.");
    }
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
  if (!result.verified || !result.credential) throw new Error("Passkey registration could not be verified.");
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
  if (!result.verified || result.newCounter === undefined) throw new Error("Biometric verification failed.");
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

export async function completeRecoveryUnlock({ verifyPin, createSession }: { verifyPin: () => Promise<boolean>; createSession: () => Promise<void> }) {
  if (!await verifyPin()) throw new Error("The recovery PIN is incorrect.");
  await createSession();
  return { verified: true as const };
}
