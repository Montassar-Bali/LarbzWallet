import { scryptSync } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  consumeChallenge,
  createSecuritySession,
  issueChallenge,
  listPasskeys,
  savePasskey,
  setRecoveryPin,
  verifyRecoveryPin,
} from "@/lib/wallet-security-store";

const testFile = path.join(tmpdir(), `larpz-wallet-security-${process.pid}.json`);

describe("wallet security storage selection", () => {
  beforeEach(async () => {
    await rm(testFile, { force: true });
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("WALLET_SECURITY_DATA_FILE", testFile);
    vi.stubEnv("WALLET_SECURITY_PIN_PEPPER", "test-only-wallet-pin-pepper-that-is-long-enough");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(testFile, { force: true });
  });

  it("consumes a local development challenge only once under concurrent requests", async () => {
    const challenge = await issueChallenge("wallet-user-123", "authentication", "challenge-value");
    const results = await Promise.allSettled([
      consumeChallenge(challenge.id, "wallet-user-123", "authentication"),
      consumeChallenge(challenge.id, "wallet-user-123", "authentication"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected"))
      .toMatchObject({ reason: { code: "INVALID" } });
  });

  it("does not consume another user's challenge on a mismatch", async () => {
    const challenge = await issueChallenge("wallet-user-123", "registration", "challenge-value");

    await expect(consumeChallenge(challenge.id, "other-wallet-123", "registration"))
      .rejects.toMatchObject({ code: "MISMATCH" });
    await expect(consumeChallenge(challenge.id, "wallet-user-123", "registration"))
      .resolves.toMatchObject({ id: challenge.id });
  });

  it("atomically limits recovery PIN attempts and clears failures on success", async () => {
    const fingerprint = "a".repeat(64);
    await setRecoveryPin("wallet-user-123", "246810");

    await expect(verifyRecoveryPin("wallet-user-123", "111111", fingerprint)).resolves.toBe(false);
    await expect(verifyRecoveryPin("wallet-user-123", "246810", fingerprint)).resolves.toBe(true);
    const concurrent = await Promise.allSettled(
      Array.from({ length: 6 }, () => verifyRecoveryPin("wallet-user-123", "111111", fingerprint)),
    );
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(concurrent.find((result) => result.status === "rejected"))
      .toMatchObject({ reason: { status: 429, retryAfterSeconds: expect.any(Number) } });
    await expect(verifyRecoveryPin("wallet-user-123", "246810", fingerprint))
      .rejects.toMatchObject({ status: 429, retryAfterSeconds: expect.any(Number) });
  });

  it("enforces a per-user PIN ceiling across changing request fingerprints", async () => {
    await setRecoveryPin("wallet-user-global-123", "246810");
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, index) => (
        verifyRecoveryPin("wallet-user-global-123", "111111", index.toString(16).padStart(64, "0"))
      )),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected"))
      .toMatchObject({ reason: { status: 429, retryAfterSeconds: expect.any(Number) } });
  });

  it("allows only the first passkey without an existing unlock session", async () => {
    const first = {
      id: "credential_first",
      userId: "wallet-user-passkey-123",
      webAuthnUserId: "webauthn_user_first",
      publicKey: "public-key-first",
      counter: 0,
      deviceType: "singleDevice" as const,
      backedUp: false,
      transports: ["internal" as const],
      createdAt: new Date().toISOString(),
    };
    const second = {
      ...first,
      id: "credential_second",
      webAuthnUserId: "webauthn_user_second",
      publicKey: "public-key-second",
    };

    await expect(savePasskey(first)).resolves.toMatchObject({ id: first.id });
    await expect(savePasskey(second)).rejects.toMatchObject({ status: 401 });
    const session = await createSecuritySession(first.userId);
    await expect(savePasskey(second, session.token)).resolves.toMatchObject({ id: second.id });
    await expect(listPasskeys(first.userId)).resolves.toHaveLength(2);
  });

  it("migrates a successfully verified legacy PIN to a peppered hash", async () => {
    const userId = "wallet-user-legacy-123";
    const pin = "246810";
    const salt = "legacy-test-salt";
    const legacyHash = scryptSync(pin, salt, 32).toString("base64url");
    await writeFile(testFile, JSON.stringify({
      version: 1,
      credentials: [],
      challenges: [],
      pins: [{ userId, salt, hash: legacyHash, updatedAt: new Date().toISOString() }],
      sessions: [],
      recoveryPinRateLimits: [],
    }));

    await expect(verifyRecoveryPin(userId, pin, "b".repeat(64))).resolves.toBe(true);
    const migrated = JSON.parse(await readFile(testFile, "utf8")) as {
      pins: Array<{ hash: string; hashVersion?: number }>;
    };
    expect(migrated.pins[0]?.hashVersion).toBe(2);
    expect(migrated.pins[0]?.hash).not.toBe(legacyHash);
  });

  it("fails closed instead of using a file when production DATABASE_URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(listPasskeys("wallet-user-123")).rejects.toThrow(/not configured/i);
  });
});
