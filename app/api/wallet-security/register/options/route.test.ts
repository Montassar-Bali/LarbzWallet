import { beforeEach, describe, expect, it, vi } from "vitest";

const routeHarness = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  hasRecoveryPin: vi.fn(),
  issueChallenge: vi.fn(),
  listPasskeys: vi.fn(),
  readSessionCookie: vi.fn(),
  setChallengeCookie: vi.fn(),
  validateSecurityOrigin: vi.fn(),
  verifySecuritySession: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: routeHarness.generateRegistrationOptions,
}));
vi.mock("@/lib/wallet-security-http", () => ({
  errorResponse: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "failed" }, { status: 400 }),
  readSessionCookie: routeHarness.readSessionCookie,
  securityJson: (data: unknown, init?: ResponseInit) => Response.json(data, init),
  setChallengeCookie: routeHarness.setChallengeCookie,
}));
vi.mock("@/lib/wallet-security-store", () => ({
  hasRecoveryPin: routeHarness.hasRecoveryPin,
  issueChallenge: routeHarness.issueChallenge,
  listPasskeys: routeHarness.listPasskeys,
  validateSecurityOrigin: routeHarness.validateSecurityOrigin,
  verifySecuritySession: routeHarness.verifySecuritySession,
}));

import { POST } from "@/app/api/wallet-security/register/options/route";

function request() {
  return new Request("https://wallet.example/api/wallet-security/register/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "wallet-user-route-123", userName: "Wallet user" }),
  });
}

describe("passkey registration options authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeHarness.readSessionCookie.mockResolvedValue(undefined);
    routeHarness.validateSecurityOrigin.mockReturnValue({ rpID: "wallet.example" });
    routeHarness.hasRecoveryPin.mockResolvedValue(false);
    routeHarness.listPasskeys.mockResolvedValue([]);
    routeHarness.verifySecuritySession.mockResolvedValue(false);
    routeHarness.generateRegistrationOptions.mockResolvedValue({
      challenge: "registration-challenge",
      user: { id: "webauthn-user" },
    });
    routeHarness.issueChallenge.mockResolvedValue({ id: "stored-challenge" });
    routeHarness.setChallengeCookie.mockResolvedValue(undefined);
  });

  it("allows the first security enrollment without a prior session", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(routeHarness.issueChallenge).toHaveBeenCalledOnce();
  });

  it("rejects another passkey when existing security is not unlocked", async () => {
    routeHarness.listPasskeys.mockResolvedValue([{ id: "existing-credential" }]);

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unlock the wallet before adding another passkey." });
    expect(routeHarness.generateRegistrationOptions).not.toHaveBeenCalled();
    expect(routeHarness.issueChallenge).not.toHaveBeenCalled();
  });

  it("allows another passkey only with a valid unlock session", async () => {
    routeHarness.listPasskeys.mockResolvedValue([{ id: "existing-credential" }]);
    routeHarness.readSessionCookie.mockResolvedValue("session-token");
    routeHarness.verifySecuritySession.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(routeHarness.verifySecuritySession).toHaveBeenCalledWith("session-token", "wallet-user-route-123");
    expect(routeHarness.issueChallenge).toHaveBeenCalledOnce();
  });
});
