import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseHarness = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const loginRows: unknown[][] = [];
  const activationRows: unknown[][] = [];

  const sql = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("INSERT INTO larpz_admin_login_rate_limits")) {
        return Promise.resolve(loginRows.shift() ?? [{ failed_attempts: 1, blocked_until: null }]);
      }
      if (text.includes("INSERT INTO larpz_license_activation_rate_limits")) {
        return Promise.resolve(activationRows.shift() ?? [{ failed_attempts: 1, blocked_until: null }]);
      }
      return Promise.resolve([]);
    }),
    {
      transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    },
  );

  return {
    activationRows,
    calls,
    loginRows,
    neon: vi.fn(() => sql),
    sql,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: databaseHarness.neon }));

import {
  consumeAdminLoginAttempt,
  consumeLicenseActivationAttempt,
} from "@/lib/admin-database";

const originalDatabaseUrl = process.env.DATABASE_URL;
let databaseNumber = 0;

function rateLimitQuery(table: string) {
  return databaseHarness.calls.find((call) => call.text.includes(`INSERT INTO ${table}`));
}

beforeEach(() => {
  databaseNumber += 1;
  process.env.DATABASE_URL = `postgresql://rate-limit-test-${databaseNumber}`;
  databaseHarness.calls.length = 0;
  databaseHarness.loginRows.length = 0;
  databaseHarness.activationRows.length = 0;
  databaseHarness.neon.mockClear();
  databaseHarness.sql.mockClear();
  databaseHarness.sql.transaction.mockClear();
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("database-backed request rate limits", () => {
  it("atomically reserves an admin attempt and blocks only after five eligible attempts", async () => {
    await consumeAdminLoginAttempt("a".repeat(64));

    const query = rateLimitQuery("larpz_admin_login_rate_limits");
    expect(query).toBeDefined();
    const normalizedSql = query!.text.replace(/\s+/g, " ");
    expect(normalizedSql).toContain("ON CONFLICT (identifier_digest) DO UPDATE SET");
    expect(normalizedSql).toContain("END) > ? THEN NOW()");
    expect(query!.values).toContain(5);
  });

  it("atomically reserves an activation attempt and blocks only after ten eligible attempts", async () => {
    await consumeLicenseActivationAttempt("b".repeat(64));

    const query = rateLimitQuery("larpz_license_activation_rate_limits");
    expect(query).toBeDefined();
    const normalizedSql = query!.text.replace(/\s+/g, " ");
    expect(normalizedSql).toContain("ON CONFLICT (identifier_digest) DO UPDATE SET");
    expect(normalizedSql).toContain("END) > ? THEN NOW()");
    expect(query!.values).toContain(10);
  });

  it("returns a retryable typed error for an active database block", async () => {
    databaseHarness.loginRows.push([{
      failed_attempts: 6,
      blocked_until: new Date(Date.now() + 30_000).toISOString(),
    }]);

    await expect(consumeAdminLoginAttempt("c".repeat(64))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many sign-in attempts. Try again later.",
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("fails closed when an atomic reservation unexpectedly returns no row", async () => {
    databaseHarness.activationRows.push([]);

    await expect(consumeLicenseActivationAttempt("d".repeat(64))).rejects.toMatchObject({
      code: "DATABASE_ERROR",
      status: 500,
      message: "The request could not be completed.",
    });
  });
});
