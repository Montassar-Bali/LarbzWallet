import { describe, expect, it, vi } from "vitest";

import {
  ChallengeValidationError,
  completeAuthentication,
  completeRecoveryUnlock,
  completeRegistration,
  InMemoryChallengeStore,
  shouldLockWallet,
  shouldUseTemporarySecurityStorage,
  supportsPlatformBiometrics,
} from "@/lib/wallet-security-core";

describe("wallet WebAuthn ceremony coordination", () => {
  it("persists a successfully server-verified passkey registration", async () => {
    const store = new InMemoryChallengeStore();
    const challenge = store.issue("wallet-user-123", "registration", "server-challenge", 1_000);
    const persist = vi.fn(async () => undefined);
    const result = await completeRegistration({
      consume: async () => store.consume(challenge.id, "wallet-user-123", "registration", 1_001),
      verify: async (record) => ({ verified: record.value === "server-challenge", credential: { id: "credential-1", publicKey: "public-only" } }),
      persist,
    });
    expect(result.verified).toBe(true);
    expect(persist).toHaveBeenCalledWith({ id: "credential-1", publicKey: "public-only" });
  });

  it("unlocks after a successful signed assertion and updates its counter", async () => {
    const store = new InMemoryChallengeStore();
    const challenge = store.issue("wallet-user-123", "authentication", "auth-challenge", 2_000);
    const updateCounter = vi.fn(async () => undefined);
    await expect(completeAuthentication({
      consume: async () => store.consume(challenge.id, "wallet-user-123", "authentication", 2_001),
      verify: async (record) => ({ verified: record.value === "auth-challenge", newCounter: 7 }),
      updateCounter,
    })).resolves.toEqual({ verified: true });
    expect(updateCounter).toHaveBeenCalledWith(7);
  });

  it("rejects invalid, expired, reused, and mismatched challenges", () => {
    const invalid = new InMemoryChallengeStore();
    expect(() => invalid.consume("missing", "wallet-user-123", "registration", 1)).toThrowError(ChallengeValidationError);

    const expired = new InMemoryChallengeStore();
    const expiredChallenge = expired.issue("wallet-user-123", "registration", "value", 1_000, 10);
    expect(() => expired.consume(expiredChallenge.id, "wallet-user-123", "registration", 1_011)).toThrowError(expect.objectContaining({ code: "EXPIRED" }));

    const reused = new InMemoryChallengeStore();
    const usedChallenge = reused.issue("wallet-user-123", "authentication", "value", 1_000);
    reused.consume(usedChallenge.id, "wallet-user-123", "authentication", 1_001);
    expect(() => reused.consume(usedChallenge.id, "wallet-user-123", "authentication", 1_002)).toThrowError(expect.objectContaining({ code: "REUSED" }));

    const mismatched = new InMemoryChallengeStore();
    const mismatchedChallenge = mismatched.issue("wallet-user-123", "registration", "value", 1_000);
    expect(() => mismatched.consume(mismatchedChallenge.id, "other-wallet-123", "registration", 1_001)).toThrowError(expect.objectContaining({ code: "MISMATCH" }));
  });

  it("locks after inactivity and after the configured background interval", () => {
    expect(shouldLockWallet({ enabled: true, enrolled: true, lastActivityAt: 1_000, timeoutMs: 5_000, now: 6_000 })).toBe(true);
    expect(shouldLockWallet({ enabled: true, enrolled: true, lastActivityAt: 5_500, timeoutMs: 5_000, now: 6_000 })).toBe(false);
    expect(shouldLockWallet({ enabled: true, enrolled: true, lastActivityAt: 5_900, backgroundedAt: 1_000, timeoutMs: 5_000, now: 6_000 })).toBe(true);
  });

  it("unlocks through the recovery fallback only when the PIN verifier succeeds", async () => {
    const createSession = vi.fn(async () => undefined);
    await expect(completeRecoveryUnlock({ verifyPin: async () => true, createSession })).resolves.toEqual({ verified: true });
    expect(createSession).toHaveBeenCalledOnce();
    await expect(completeRecoveryUnlock({ verifyPin: async () => false, createSession })).rejects.toThrow(/incorrect/i);
  });

  it("reports unsupported WebAuthn/platform combinations without bypassing security", () => {
    expect(supportsPlatformBiometrics(false, true)).toBe(false);
    expect(supportsPlatformBiometrics(true, false)).toBe(false);
    expect(supportsPlatformBiometrics(true, true)).toBe(true);
  });

  it("uses writable temporary storage in Vercel and /var/task runtimes", () => {
    expect(shouldUseTemporarySecurityStorage({ cwd: "/var/task", vercel: "1" })).toBe(true);
    expect(shouldUseTemporarySecurityStorage({ cwd: "/var/task/app" })).toBe(true);
    expect(shouldUseTemporarySecurityStorage({ cwd: "/workspace", lambdaTaskRoot: "/var/task/" })).toBe(true);
    expect(shouldUseTemporarySecurityStorage({ cwd: "/Users/test/wallet" })).toBe(false);
  });
});
