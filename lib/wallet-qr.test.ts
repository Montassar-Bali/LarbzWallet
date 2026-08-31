import { describe, expect, it } from "vitest";

import { isWalletAddress, walletAddressFromQrPayload } from "@/lib/wallet-qr";

describe("wallet QR payloads", () => {
  it("accepts a raw registered wallet address", () => {
    expect(walletAddressFromQrPayload("  sim_ledger_account123  ")).toBe("sim_ledger_account123");
    expect(walletAddressFromQrPayload("SIM_TRUST_ACCOUNT789")).toBe("sim_trust_account789");
  });

  it("extracts an address from a wallet URI", () => {
    expect(walletAddressFromQrPayload("solana:sim_ghost_camera123?amount=1")).toBe("sim_ghost_camera123");
  });

  it("extracts an encoded address from a link", () => {
    expect(walletAddressFromQrPayload("https://wallet.test/send?address=sim%5Ftrust%5Faccount789")).toBe("sim_trust_account789");
  });

  it("rejects unrelated QR and barcode content", () => {
    expect(walletAddressFromQrPayload("0123456789012")).toBeNull();
    expect(walletAddressFromQrPayload("https://example.com/product/42")).toBeNull();
    expect(walletAddressFromQrPayload("notes about sim_ghost_account123 for later")).toBeNull();
    expect(isWalletAddress("not-a-wallet")).toBe(false);
  });
});
