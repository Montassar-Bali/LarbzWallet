import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseHarness = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const credentialRows: unknown[][] = [];
  const rateLimitRows: unknown[][] = [];
  const sql = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("INSERT INTO larpz_wallet_security_pin_rate_limits")) {
        return Promise.resolve(rateLimitRows.shift() ?? [{ failed_attempts: 1, blocked_until: null }]);
      }
      if (text.includes("INSERT INTO larpz_wallet_security_credentials")) {
        return Promise.resolve(credentialRows.shift() ?? []);
      }
      if (text.includes("SELECT user_id, salt, pin_hash, hash_version")) return Promise.resolve([]);
      return Promise.resolve([]);
    }),
    {
      transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    },
  );
  return { calls, credentialRows, neon: vi.fn(() => sql), rateLimitRows, sql };
});

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: databaseHarness.neon }));

import { consumeChallenge, savePasskey, setRecoveryPin, verifyRecoveryPin } from "@/lib/wallet-security-store";

let databaseNumber = 0;

describe("database-backed wallet security storage", () => {
  beforeEach(() => {
    databaseNumber += 1;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", `postgresql://wallet-security-test-${databaseNumber}`);
    vi.stubEnv("WALLET_SECURITY_PIN_PEPPER", "test-only-wallet-pin-pepper-that-is-long-enough");
    databaseHarness.calls.length = 0;
    databaseHarness.credentialRows.length = 0;
    databaseHarness.rateLimitRows.length = 0;
    databaseHarness.neon.mockClear();
    databaseHarness.sql.mockClear();
    databaseHarness.sql.transaction.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("atomically reserves fingerprint and per-user PIN attempt scopes", async () => {
    await expect(verifyRecoveryPin("wallet-user-database-123", "111111", "a".repeat(64)))
      .resolves.toBe(false);

    const reservations = databaseHarness.calls.filter(
      (call) => call.text.includes("INSERT INTO larpz_wallet_security_pin_rate_limits"),
    );
    expect(reservations).toHaveLength(2);
    expect(reservations.every((call) => call.text.includes("ON CONFLICT (user_id, request_fingerprint) DO UPDATE SET")))
      .toBe(true);
    expect(reservations.some((call) => call.values.includes("a".repeat(64)) && call.values.includes(5))).toBe(true);
    expect(reservations.some((call) => call.values.includes("__all_request_fingerprints__") && call.values.includes(10))).toBe(true);
  });

  it("fails closed when either atomic PIN reservation returns no row", async () => {
    databaseHarness.rateLimitRows.push([], [{ failed_attempts: 1, blocked_until: null }]);

    await expect(verifyRecoveryPin("wallet-user-database-123", "111111", "b".repeat(64)))
      .rejects.toMatchObject({ status: 503 });
  });

  it("fails closed when the production PIN pepper is missing", async () => {
    vi.stubEnv("WALLET_SECURITY_PIN_PEPPER", "");
    vi.stubEnv("LICENSE_KEY_PEPPER", "");

    await expect(setRecoveryPin("wallet-user-database-123", "246810"))
      .rejects.toMatchObject({ status: 503 });
  });

  it("uses an atomic database predicate for first and additional passkey enrollment", async () => {
    const passkey = {
      id: "credential_database",
      userId: "wallet-user-database-123",
      webAuthnUserId: "webauthn-user-database",
      publicKey: "public-key-database",
      counter: 0,
      deviceType: "singleDevice" as const,
      backedUp: false,
      transports: ["internal" as const],
      createdAt: new Date().toISOString(),
    };
    databaseHarness.credentialRows.push([{ credential_id: passkey.id }]);

    await expect(savePasskey(passkey)).resolves.toMatchObject({ id: passkey.id });
    const enrollment = databaseHarness.calls.find(
      (call) => call.text.includes("INSERT INTO larpz_wallet_security_credentials"),
    );
    expect(enrollment).toBeDefined();
    const normalizedSql = enrollment!.text.replace(/\s+/g, " ");
    expect(normalizedSql).toContain("NOT EXISTS ( SELECT 1 FROM larpz_wallet_security_credentials");
    expect(normalizedSql).toContain("OR EXISTS ( SELECT 1 FROM larpz_wallet_security_sessions");

    await expect(savePasskey({ ...passkey, id: "credential_database_second" }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("matches challenge id, user, and ceremony in the atomic database delete", async () => {
    await expect(consumeChallenge("challenge_known", "wallet-user-database-123", "authentication"))
      .rejects.toMatchObject({ code: "INVALID" });

    const consume = databaseHarness.calls.find(
      (call) => call.text.includes("DELETE FROM larpz_wallet_security_challenges")
        && call.text.includes("RETURNING id, user_id, ceremony"),
    );
    expect(consume).toBeDefined();
    expect(consume!.text.replace(/\s+/g, " ")).toContain("WHERE id = ? AND user_id = ? AND ceremony = ?");
    expect(consume!.values).toEqual(["challenge_known", "wallet-user-database-123", "authentication"]);
  });
});
