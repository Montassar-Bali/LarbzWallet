import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RecoveryPinRateLimitError } from "@/lib/wallet-security-core";
import {
  errorResponse,
  recoveryPinRequestFingerprint,
  securityJson,
} from "@/lib/wallet-security-http";

describe("wallet security HTTP responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns bounded PIN throttling without cacheable or identifying details", async () => {
    const response = errorResponse(new RecoveryPinRateLimitError(73));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("73");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    await expect(response.json()).resolves.toEqual({
      error: "Too many recovery PIN attempts. Try again later.",
    });
  });

  it("does not expose unexpected database or WebAuthn errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new Error("database host and credential detail"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    const body = await response.text();
    expect(body).toContain("Wallet security request could not be completed.");
    expect(body).not.toContain("database host");
    expect(body).not.toContain("credential detail");
  });

  it("marks successful wallet-security responses as no-store", () => {
    const response = securityJson({ verified: true }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });

    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("creates a stable, privacy-preserving request fingerprint", () => {
    vi.stubEnv("WALLET_SECURITY_RATE_LIMIT_SECRET", "test-only-rate-limit-secret-that-is-long-enough");
    const request = new Request("https://wallet.example/api/wallet-security/pin", {
      headers: { "x-forwarded-for": "203.0.113.42, 198.51.100.7" },
    });

    const first = recoveryPinRequestFingerprint(request);
    const second = recoveryPinRequestFingerprint(request);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toContain("203.0.113.42");
  });
});
