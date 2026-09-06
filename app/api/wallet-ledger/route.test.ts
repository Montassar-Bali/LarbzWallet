import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  executeRemoteBalanceOperation: vi.fn(),
  executeRemoteTransfer: vi.fn(),
  linkRemoteWalletOwner: vi.fn(),
  patchRemoteWalletAccount: vi.fn(),
  syncRemoteWallet: vi.fn(),
  walletOwnerIdForLicense: vi.fn(),
}));

vi.mock("@/lib/wallet-ledger-database", () => {
  class RemoteWalletError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = "RemoteWalletError";
    }
  }

  return {
    ...databaseMocks,
    RemoteWalletError,
  };
});

import { POST } from "@/app/api/wallet-ledger/route";
import { RemoteWalletError } from "@/lib/wallet-ledger-database";

const OWNER_ID = `lic_${"a".repeat(32)}`;

function walletRequest(body: Record<string, unknown>, authorized = true) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorized) headers.set("Cookie", `larpz_wallet_owner_id=${OWNER_ID}`);
  return new Request("http://localhost/api/wallet-ledger", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("wallet ledger API errors", () => {
  beforeEach(() => {
    Object.values(databaseMocks).forEach((mock) => mock.mockReset());
  });

  it("returns a generic non-cacheable 500 for an unexpected ledger failure", async () => {
    databaseMocks.syncRemoteWallet.mockRejectedValueOnce(
      new Error("sensitive database hostname and query details"),
    );

    const response = await POST(walletRequest({ action: "sync", ownerId: OWNER_ID }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({
      error: "Shared wallet request failed.",
      code: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(payload)).not.toContain("hostname");
  });

  it("preserves typed wallet error status and message without caching it", async () => {
    databaseMocks.patchRemoteWalletAccount.mockRejectedValueOnce(
      new RemoteWalletError("ACCOUNT_NOT_FOUND", "That wallet account no longer exists."),
    );

    const response = await POST(walletRequest({
      action: "patchAccount",
      ownerId: OWNER_ID,
      accountId: "missing-account",
    }));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "That wallet account no longer exists.",
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("keeps shared-wallet cookie authorization in place", async () => {
    const response = await POST(walletRequest(
      { action: "sync", ownerId: OWNER_ID },
      false,
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(databaseMocks.syncRemoteWallet).not.toHaveBeenCalled();
  });

  it("preserves the local linkOwner fallback when the database is not configured", async () => {
    databaseMocks.linkRemoteWalletOwner.mockRejectedValueOnce(
      new RemoteWalletError(
        "DATABASE_NOT_CONFIGURED",
        "Shared transfers are waiting for the database connection.",
      ),
    );
    databaseMocks.walletOwnerIdForLicense.mockResolvedValueOnce(OWNER_ID);

    const response = await POST(walletRequest(
      { action: "linkOwner", licenseKey: "TEST-LINK-0001-2027" },
      false,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      connected: false,
      code: "DATABASE_NOT_CONFIGURED",
      ownerId: OWNER_ID,
      linkStatus: "local",
    });
  });
});
