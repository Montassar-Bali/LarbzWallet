import { describe, expect, it } from "vitest";

import {
  defaultLedgerWalletSettings,
  normalizeLedgerWalletSettings,
  validateLedgerSettings,
  validateLedgerTokenAddress,
} from "@/lib/ledger-wallet-settings";

describe("Ledger wallet settings", () => {
  it("normalizes unknown and legacy values safely", () => {
    expect(normalizeLedgerWalletSettings(null)).toEqual(defaultLedgerWalletSettings);
    expect(normalizeLedgerWalletSettings({ currency: "EUR", colorScheme: "light", language: "de" })).toMatchObject({
      currency: "EUR",
      colorScheme: "light",
      language: "en",
    });
    expect(normalizeLedgerWalletSettings({ currency: "NOPE", customTokens: [{ id: "bad" }] }).currency).toBe("USD");
  });

  it("validates Ethereum and Solana token addresses", () => {
    expect(validateLedgerTokenAddress("ethereum", `0x${"a".repeat(40)}`)).toBe("");
    expect(validateLedgerTokenAddress("ethereum", "0x1234")).toContain("Ethereum");
    expect(validateLedgerTokenAddress("solana", "So11111111111111111111111111111111111111112")).toBe("");
    expect(validateLedgerTokenAddress("solana", "0OIl-not-base58")).toContain("Solana");
  });

  it("rejects short provider keys and duplicate custom tokens", () => {
    expect(validateLedgerSettings({ ...defaultLedgerWalletSettings, marketApiKey: "short" })).toContain("8 characters");
    const token = {
      id: "custom-one",
      network: "ethereum" as const,
      contractAddress: `0x${"b".repeat(40)}`,
      name: "Example",
      symbol: "EXM",
      price: 1,
    };
    expect(validateLedgerSettings({ ...defaultLedgerWalletSettings, customTokens: [token, { ...token, id: "custom-two" }] })).toContain("only be added once");
    expect(validateLedgerSettings({ ...defaultLedgerWalletSettings, customTokens: [{ ...token, symbol: "BTC" }] })).toContain("built-in asset catalogue");
  });
});
