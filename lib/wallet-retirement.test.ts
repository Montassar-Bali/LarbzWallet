import { describe, expect, it } from "vitest";

import { canonicalWalletTokens, defaultTokens, walletMarketSymbols } from "@/config/tokens";
import {
  createInitialWalletLedger,
  mergeRemoteWalletSnapshot,
  readLegacySnapshots,
  selectedAccount,
  syncLegacyWalletViews,
  tokensForWalletAccount,
  WalletLedgerRepository,
  walletAssetDecimals,
  walletLedgerStorageKey,
  type StorageAdapter,
  type WalletAsset,
  type WalletLedgerState,
} from "@/lib/wallet-ledger";
import {
  defaultLedgerWalletSettings,
  normalizeLedgerWalletSettings,
  validateLedgerSettings,
  type LedgerCustomToken,
} from "@/lib/ledger-wallet-settings";
import { mergeCanonicalWalletCatalogue } from "@/lib/wallet-market";
import type { WalletToken } from "@/lib/types";
import { getTokens, saveToken } from "@/lib/wallet";

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const walletIds = ["ghost", "ledger", "trust"] as const;

function token(symbol: string, balance: number): WalletToken {
  return {
    id: `stored-${symbol.toLowerCase()}`,
    name: symbol.toUpperCase() === "BFS" ? "BFS" : "Moon Token",
    symbol,
    price: symbol.toUpperCase() === "BFS" ? 0.0001 : 2,
    balance,
    change24h: 1,
    image: `/${symbol.toLowerCase()}.svg`,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function asset(symbol: string): WalletAsset {
  return {
    symbol,
    name: symbol === "BFS" ? "BFS" : "Moon Token",
    network: "Solana",
    decimals: 8,
    price: symbol === "BFS" ? 0.0001 : 2,
    image: `/${symbol.toLowerCase()}.svg`,
  };
}

function expectNoBfs(state: WalletLedgerState) {
  expect(state.assets.BFS).toBeUndefined();
  for (const walletId of walletIds) {
    for (const account of state.wallets[walletId].accounts) {
      expect(account.balances.BFS).toBeUndefined();
    }
  }
}

describe("retired BFS wallet asset", () => {
  it("is absent from every fresh wallet catalogue and unsupported by the ledger", () => {
    expect(defaultTokens.map((item) => item.symbol)).not.toContain("BFS");
    expect(walletMarketSymbols).not.toContain("BFS");
    expect(canonicalWalletTokens.map((item) => item.symbol)).not.toContain("BFS");
    expect(walletAssetDecimals("BFS")).toBeNull();
  });

  it("filters a stored BFS token from the canonical catalogue while preserving custom tokens", () => {
    const merged = mergeCanonicalWalletCatalogue([
      token("bfs", 176.12138),
      token("MOON", 42),
    ]);

    expect(merged.map((item) => item.symbol.toUpperCase())).not.toContain("BFS");
    expect(merged.find((item) => item.symbol === "MOON")).toMatchObject({
      name: "Moon Token",
      balance: 42,
      price: 2,
    });
  });

  it("repairs direct token storage and refuses to save BFS again", () => {
    const storage = new MemoryStorage();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    storage.setItem("larpz_tokens", JSON.stringify([
      token("BFS", 176.12138),
      token("MOON", 5),
    ]));

    try {
      expect(getTokens().map((item) => item.symbol.toUpperCase())).toEqual(["MOON"]);
      expect(JSON.parse(storage.getItem("larpz_tokens") ?? "[]")).toEqual([token("MOON", 5)]);
      expect(() => saveToken({
        name: "BFS",
        symbol: "bfs",
        price: 0.0001,
        balance: 1,
        change24h: 0,
        image: "/bfs.svg",
      })).toThrow(/no longer supported/i);
    } finally {
      if (previousWindow === undefined) delete (globalThis as { window?: Window }).window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }
  });

  it("filters BFS from legacy token storage before creating accounts and keeps custom holdings", () => {
    const storage = new MemoryStorage();
    const legacyKeys = {
      ghost: "larpz_tokens",
      ledger: "larpz_ledger_tokens",
      trust: "larpz_trust_wallet_tokens",
    } as const;

    for (const walletId of walletIds) {
      storage.setItem(legacyKeys[walletId], JSON.stringify([
        token("BFS", 100),
        token("MOON", 7),
      ]));
    }

    const snapshots = readLegacySnapshots(storage);
    for (const walletId of walletIds) {
      expect(snapshots[walletId]?.tokens?.map((item) => item.symbol.toUpperCase())).not.toContain("BFS");
      expect(snapshots[walletId]?.tokens?.find((item) => item.symbol === "MOON")?.balance).toBe(7);
    }

    const state = createInitialWalletLedger(snapshots, "2026-09-06T00:00:00.000Z");
    expectNoBfs(state);
    expect(state.assets.MOON).toMatchObject({
      symbol: "MOON",
      name: "Moon Token",
      price: 2,
      image: "/moon.svg",
    });
    for (const walletId of walletIds) {
      expect(selectedAccount(state, walletId).balances.MOON).toBe(7);
    }
  });

  it("migrates an existing persisted ledger and writes the retired asset removal back to storage", () => {
    const storage = new MemoryStorage();
    const stale = createInitialWalletLedger({}, "2026-08-01T00:00:00.000Z");
    stale.assets.BFS = asset("BFS");
    stale.assets.MOON = asset("MOON");
    for (const walletId of walletIds) {
      for (const account of stale.wallets[walletId].accounts) {
        account.balances.BFS = 176.12138;
        account.balances.MOON = 3;
      }
    }
    storage.setItem(walletLedgerStorageKey, JSON.stringify(stale));

    const migrated = new WalletLedgerRepository(storage).getState();
    expectNoBfs(migrated);
    expect(migrated.assets.MOON).toEqual(asset("MOON"));
    for (const walletId of walletIds) {
      for (const account of migrated.wallets[walletId].accounts) {
        expect(account.balances.MOON).toBe(3);
      }
    }

    const persisted = JSON.parse(storage.getItem(walletLedgerStorageKey) ?? "null") as WalletLedgerState;
    expectNoBfs(persisted);
    expect(persisted.assets.MOON).toEqual(asset("MOON"));
  });

  it("ignores BFS market updates while retaining custom asset updates", () => {
    const storage = new MemoryStorage();
    const repository = new WalletLedgerRepository(storage);
    const next = repository.updateAssets([
      token("BFS", 1),
      token("MOON", 4),
    ]);

    expect(next.assets.BFS).toBeUndefined();
    expect(next.assets.MOON).toMatchObject({
      symbol: "MOON",
      name: "Moon Token",
      price: 2,
    });
  });

  it("removes BFS from saved Ledger custom-token settings and rejects adding it again", () => {
    const retiredToken: LedgerCustomToken = {
      id: "ledger-custom-bfs",
      network: "solana",
      contractAddress: "11111111111111111111111111111111",
      name: "BFS",
      symbol: "bfs",
      price: 0.0001,
    };

    expect(normalizeLedgerWalletSettings({
      ...defaultLedgerWalletSettings,
      customTokens: [retiredToken],
    }).customTokens).toEqual([]);
    expect(validateLedgerSettings({
      ...defaultLedgerWalletSettings,
      customTokens: [retiredToken],
    })).toMatch(/no longer supported/i);
  });

  it("does not write a retired legacy token back into wallet-specific token storage", () => {
    const storage = new MemoryStorage();
    const current = createInitialWalletLedger({}, "2026-09-06T00:00:00.000Z");
    current.assets.MOON = asset("MOON");
    selectedAccount(current, "ghost").balances.MOON = 9;
    storage.setItem("larpz_tokens", JSON.stringify([
      token("BFS", 176.12138),
      token("MOON", 1),
    ]));

    syncLegacyWalletViews(storage, current);

    const projected = JSON.parse(storage.getItem("larpz_tokens") ?? "[]") as WalletToken[];
    expect(projected.map((item) => item.symbol.toUpperCase())).not.toContain("BFS");
    expect(projected.find((item) => item.symbol === "MOON")?.balance).toBe(9);
  });

  it("prevents a remote snapshot from restoring BFS while retaining custom balances", () => {
    const current = createInitialWalletLedger({}, "2026-09-06T00:00:00.000Z");
    current.assets.MOON = asset("MOON");
    const recipient = selectedAccount(current, "ghost");
    const merged = mergeRemoteWalletSnapshot(current, {
      accounts: [{
        ...recipient,
        ownerId: "lic_retirement_test",
        balances: { ...recipient.balances, BFS: 88, MOON: 12 },
      }],
      transactions: [],
      operations: [],
    });
    const mergedRecipient = selectedAccount(merged, "ghost");

    expect(mergedRecipient.balances.BFS).toBeUndefined();
    expect(mergedRecipient.balances.MOON).toBe(12);
    const projected = tokensForWalletAccount(
      [token("bfs", 88), token("MOON", 1)],
      merged,
      mergedRecipient,
    );
    expect(projected.map((item) => item.symbol.toUpperCase())).not.toContain("BFS");
    expect(projected.find((item) => item.symbol === "MOON")?.balance).toBe(12);
  });
});
