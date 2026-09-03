import { beforeEach, describe, expect, it } from "vitest";

import {
  accountForSelection,
  calculateNetworkFee,
  createInitialWalletLedger,
  mergeRemoteWalletSnapshot,
  selectedAccount,
  sortedAccountAssets,
  syncLegacyWalletViews,
  tokensForWalletAccount,
  transactionsForAccount,
  WalletLedgerRepository,
  WalletBalanceOperationError,
  WalletTransferError,
  normalizeWalletAssetAmount,
  walletAccountDomain,
  walletAccountIdFromDomain,
  walletAssetDecimals,
  walletLedgerStorageKey,
  walletLedgerStorageKeyFor,
  type StorageAdapter,
  type WalletLedgerState,
} from "@/lib/wallet-ledger";

class MemoryStorage implements StorageAdapter {
  private values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("simulated storage failure");
    this.values.set(key, value);
  }
}

describe("shared wallet transfer repository", () => {
  let storage: MemoryStorage;
  let repository: WalletLedgerRepository;
  let state: WalletLedgerState;

  beforeEach(() => {
    storage = new MemoryStorage();
    repository = new WalletLedgerRepository(storage, {}, () => new Date("2026-08-29T12:00:00.000Z"));
    state = repository.getState();
    for (const walletId of ["ghost", "ledger", "trust"] as const) {
      const account = selectedAccount(state, walletId);
      state = repository.replaceBalances(walletId, account.id, { SOL: 20, ETH: 10, BTC: 2 });
    }
  });

  function transfer(sourceWalletId: "ghost" | "ledger" | "trust", destinationWalletId: "ghost" | "ledger" | "trust", clientRequestId: string) {
    const before = repository.getState();
    return repository.executeTransfer({
      clientRequestId,
      sourceWalletId,
      sourceAccountId: selectedAccount(before, sourceWalletId).id,
      destinationWalletId,
      destinationAccountId: selectedAccount(before, destinationWalletId).id,
      tokenSymbol: "SOL",
      amount: 1,
    });
  }

  it.each([
    ["ghost", "ledger", "phantom-ledger"],
    ["ledger", "trust", "ledger-trust"],
    ["trust", "ghost", "trust-phantom"],
  ] as const)("transfers from %s to %s", (sourceWalletId, destinationWalletId, requestId) => {
    const untouchedWalletId = (["ghost", "ledger", "trust"] as const).find((walletId) => walletId !== sourceWalletId && walletId !== destinationWalletId)!;
    const sourceBefore = selectedAccount(repository.getState(), sourceWalletId).balances.SOL;
    const destinationBefore = selectedAccount(repository.getState(), destinationWalletId).balances.SOL;
    const untouchedBefore = selectedAccount(repository.getState(), untouchedWalletId).balances.SOL;
    const transaction = transfer(sourceWalletId, destinationWalletId, requestId);
    const after = repository.getState();
    expect(selectedAccount(after, sourceWalletId).balances.SOL).toBe(sourceBefore - 1 - transaction.fee);
    expect(selectedAccount(after, destinationWalletId).balances.SOL).toBe(destinationBefore + 1);
    expect(selectedAccount(after, untouchedWalletId).balances.SOL).toBe(untouchedBefore);
    expect(transaction.status).toBe("completed");
  });

  it("transfers between Account 1 and Account 2 inside one wallet", () => {
    const before = repository.getState();
    const [first, second] = before.wallets.ghost.accounts;
    repository.executeTransfer({
      clientRequestId: "same-wallet",
      sourceWalletId: "ghost",
      sourceAccountId: first.id,
      destinationWalletId: "ghost",
      destinationAccountId: second.id,
      tokenSymbol: "SOL",
      amount: 2,
    });
    const after = repository.getState();
    expect(after.wallets.ghost.accounts[1].balances.SOL).toBe(2);
  });

  it("falls back to the registered account when a dropdown retained a stale local account ID", () => {
    const current = repository.getState();
    expect(accountForSelection(current, "ledger", "stale-before-neon-bootstrap").id)
      .toBe(selectedAccount(current, "ledger").id);
  });

  it("creates, renames, selects, and resolves uniquely addressed accounts", () => {
    const created = repository.createAccount("ledger", "Savings");
    expect(created.address).toMatch(/^sim_ledger_/);
    expect(new Set(repository.getState().wallets.ledger.accounts.map((account) => account.address)).size).toBe(3);
    repository.renameAccount("ledger", created.id, "Cold Savings");
    repository.selectAccount("ledger", created.id);
    const current = repository.getState();
    expect(selectedAccount(current, "ledger").name).toBe("Cold Savings");
    const source = selectedAccount(current, "ghost");
    repository.executeTransfer({ clientRequestId: "address-transfer", sourceWalletId: "ghost", sourceAccountId: source.id, destinationAddress: created.address, tokenSymbol: "SOL", amount: 1 });
    expect(selectedAccount(repository.getState(), "ledger").balances.SOL).toBe(1);
  });

  it("resolves an internal .larpz account domain and replays that transfer idempotently", () => {
    const created = repository.createAccount("ledger", "Domain recipient");
    const source = selectedAccount(repository.getState(), "ghost");
    const destinationDomain = walletAccountDomain(created.id);
    const input = {
      clientRequestId: "domain-transfer-replay",
      sourceWalletId: "ghost" as const,
      sourceAccountId: source.id,
      destinationAddress: destinationDomain,
      tokenSymbol: "SOL",
      amount: 1,
    };

    expect(walletAccountIdFromDomain(`  ${destinationDomain.replace(/\.larpz$/, ".LARPZ")}  `)).toBe(created.id);
    expect(walletAccountIdFromDomain(`${destinationDomain}.example`)).toBeUndefined();
    const original = repository.executeTransfer(input);
    const afterOriginal = repository.getState();
    const replayed = repository.executeTransfer(input);

    expect(original.recipientAddress).toBe(created.address);
    expect(original.destinationAccountId).toBe(created.id);
    expect(replayed).toEqual(original);
    expect(repository.getState()).toEqual(afterOriginal);
  });

  it("rejects unsupported assets in transfers and balance operations", () => {
    const current = repository.getState();
    const source = selectedAccount(current, "ghost");
    const destination = selectedAccount(current, "ledger");
    const before = storage.getItem(walletLedgerStorageKey);

    expect(() => repository.executeTransfer({
      clientRequestId: "unsupported-transfer",
      sourceWalletId: "ghost",
      sourceAccountId: source.id,
      destinationWalletId: "ledger",
      destinationAccountId: destination.id,
      tokenSymbol: "NOPE",
      amount: 1,
    })).toThrowError(WalletTransferError);
    expect(() => repository.executeBalanceOperation({
      clientRequestId: "unsupported-operation",
      walletId: "ghost",
      accountId: source.id,
      deltas: { NOPE: 1 },
      activities: [{ id: "unsupported-activity", type: "receive", tokenSymbol: "NOPE", amount: 1, counterpartyLabel: "Unsupported", date: "2026-08-29T12:00:00.000Z", status: "completed", note: "Must not persist" }],
    })).toThrowError(WalletBalanceOperationError);
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
    expect(walletAssetDecimals("NOPE")).toBeNull();
    expect(normalizeWalletAssetAmount("NOPE", 1)).toBeNull();
  });

  it("rejects amounts beyond asset precision without mutating balances", () => {
    const current = repository.getState();
    const source = selectedAccount(current, "ghost");
    const destination = selectedAccount(current, "ledger");
    const before = storage.getItem(walletLedgerStorageKey);

    expect(() => repository.executeTransfer({
      clientRequestId: "overprecision-transfer",
      sourceWalletId: "ghost",
      sourceAccountId: source.id,
      destinationWalletId: "ledger",
      destinationAccountId: destination.id,
      tokenSymbol: "SOL",
      amount: 0.0000000001,
    })).toThrow(/up to 9 decimal places/i);
    expect(() => repository.executeBalanceOperation({
      clientRequestId: "overprecision-operation",
      walletId: "ghost",
      accountId: source.id,
      deltas: { SOL: 0.0000000001 },
      activities: [{ id: "precision-activity", type: "receive", tokenSymbol: "SOL", amount: 1, counterpartyLabel: "Precision check", date: "2026-08-29T12:00:00.000Z", status: "completed", note: "Must not persist" }],
    })).toThrow(/up to 9 decimal places/i);
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
    expect(walletAssetDecimals("ETH")).toBe(12);
    expect(normalizeWalletAssetAmount("ETH", 0.000000000001)).toBe(0.000000000001);
    expect(normalizeWalletAssetAmount("ETH", 0.0000000000001)).toBe(0);
  });

  it("rejects insufficient balances without changing either account", () => {
    const before = storage.getItem(walletLedgerStorageKey);
    expect(() => {
      const current = repository.getState();
      repository.executeTransfer({
        clientRequestId: "too-much",
        sourceWalletId: "ghost",
        sourceAccountId: selectedAccount(current, "ghost").id,
        destinationWalletId: "ledger",
        destinationAccountId: selectedAccount(current, "ledger").id,
        tokenSymbol: "SOL",
        amount: 50,
      });
    }).toThrowError(WalletTransferError);
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
  });

  it("rejects invalid and identical destinations", () => {
    const current = repository.getState();
    const source = selectedAccount(current, "ghost");
    expect(() => repository.executeTransfer({ clientRequestId: "bad-address", sourceWalletId: "ghost", sourceAccountId: source.id, destinationAddress: "not-an-address", tokenSymbol: "SOL", amount: 1 })).toThrow(/valid wallet address/i);
    expect(() => repository.executeTransfer({ clientRequestId: "same-account", sourceWalletId: "ghost", sourceAccountId: source.id, destinationWalletId: "ghost", destinationAccountId: source.id, tokenSymbol: "SOL", amount: 1 })).toThrow(/must be different/i);
  });

  it("debits the displayed network fee and credits only the transfer amount", () => {
    const transaction = transfer("ghost", "ledger", "fees");
    expect(transaction.fee).toBe(calculateNetworkFee("SOL", 1));
    const after = repository.getState();
    expect(selectedAccount(after, "ghost").balances.SOL).toBe(20 - 1 - transaction.fee);
    expect(selectedAccount(after, "ledger").balances.SOL).toBe(21);
  });

  it("keeps sender and recipient atomic when persistence fails", () => {
    const before = storage.getItem(walletLedgerStorageKey);
    storage.failWrites = true;
    expect(() => transfer("ghost", "ledger", "failed-write")).toThrow(/storage failure/);
    storage.failWrites = false;
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
  });

  it("persists balances, accounts, and transaction history across repository reloads", () => {
    const transaction = transfer("ghost", "ledger", "persisted");
    const reloaded = new WalletLedgerRepository(storage).getState();
    expect(reloaded.transactions[0].id).toBe(transaction.id);
    expect(selectedAccount(reloaded, "ledger").balances.SOL).toBe(21);
    expect(reloaded.wallets.ghost.accounts).toHaveLength(2);
  });

  it("shows one shared transaction in both account histories", () => {
    const transaction = transfer("ghost", "ledger", "history-both");
    const after = repository.getState();
    const source = selectedAccount(after, "ghost");
    const destination = selectedAccount(after, "ledger");
    expect(transactionsForAccount(after, source.id).map((item) => item.id)).toContain(transaction.id);
    expect(transactionsForAccount(after, destination.id).map((item) => item.id)).toContain(transaction.id);
  });

  it("returns the original transaction when an identical request ID is replayed", () => {
    const original = transfer("ghost", "ledger", "duplicate");
    const afterOriginal = repository.getState();
    const replayed = transfer("ghost", "ledger", "duplicate");
    const afterReplay = repository.getState();

    expect(replayed).toEqual(original);
    expect(afterReplay).toEqual(afterOriginal);
    expect(afterReplay.transactions).toHaveLength(1);
  });

  it("applies every signed balance delta and activity in one atomic operation", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const activities = [
      { id: "swap-send-sol", type: "send" as const, tokenSymbol: "SOL", amount: 2, counterpartyLabel: "Internal swap", date: "2026-08-29T12:00:00.000Z", status: "completed" as const, note: "Demo swap debit" },
      { id: "swap-receive-eth", type: "receive" as const, tokenSymbol: "ETH", amount: 0.1, counterpartyLabel: "Internal swap", date: "2026-08-29T12:00:00.000Z", status: "completed" as const, note: "Demo swap credit" },
    ];
    const operation = repository.executeBalanceOperation({
      clientRequestId: "trust-swap-atomic",
      walletId: "trust",
      accountId: account.id,
      deltas: { SOL: -2, ETH: 0.1 },
      activities,
    });
    const after = selectedAccount(repository.getState(), "trust");

    expect(after.balances.SOL).toBe(18);
    expect(after.balances.ETH).toBe(10.1);
    expect(operation.deltas).toEqual({ SOL: -2, ETH: 0.1 });
    expect(operation.activities).toEqual(activities);
    expect(repository.getState().operations).toHaveLength(1);
  });

  it("replays an identical balance operation without applying its deltas twice", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const input = {
      clientRequestId: "trust-buy-replay",
      walletId: "trust" as const,
      accountId: account.id,
      deltas: { SOL: 1 },
      activities: [{ id: "buy-sol-replay", type: "receive" as const, tokenSymbol: "SOL", amount: 1, counterpartyLabel: "Demo buy", date: "2026-08-29T12:00:00.000Z", status: "completed" as const, note: "Internal demo buy" }],
    };
    const original = repository.executeBalanceOperation(input);
    const afterOriginal = repository.getState();
    const replayed = repository.executeBalanceOperation({
      ...input,
      activities: [{ ...input.activities[0], id: "regenerated-buy-activity", date: "2026-08-29T12:01:00.000Z" }],
    });

    expect(replayed).toEqual(original);
    expect(replayed.activities).toEqual(original.activities);
    expect(repository.getState()).toEqual(afterOriginal);
    expect(selectedAccount(repository.getState(), "trust").balances.SOL).toBe(21);
  });

  it("rejects a mismatched balance-operation replay without changing balances", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const activity = { id: "sell-sol-once", type: "send" as const, tokenSymbol: "SOL", amount: 1, counterpartyLabel: "Demo sell", date: "2026-08-29T12:00:00.000Z", status: "completed" as const, note: "Internal demo sell" };
    repository.executeBalanceOperation({ clientRequestId: "trust-sell-once", walletId: "trust", accountId: account.id, deltas: { SOL: -1 }, activities: [activity] });
    const beforeReplay = repository.getState();

    expect(() => repository.executeBalanceOperation({
      clientRequestId: "trust-sell-once",
      walletId: "trust",
      accountId: account.id,
      deltas: { SOL: -2 },
      activities: [{ ...activity, amount: 2 }],
    })).toThrowError(WalletBalanceOperationError);
    expect(repository.getState()).toEqual(beforeReplay);
  });

  it("keeps all operation balances unchanged when any delta would be negative", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const before = storage.getItem(walletLedgerStorageKey);
    expect(() => repository.executeBalanceOperation({
      clientRequestId: "trust-swap-insufficient",
      walletId: "trust",
      accountId: account.id,
      deltas: { SOL: -21, ETH: 4 },
      activities: [{ id: "bad-swap-sol", type: "send", tokenSymbol: "SOL", amount: 21, counterpartyLabel: "Internal swap", date: "2026-08-29T12:00:00.000Z", status: "completed", note: "Must not persist" }],
    })).toThrow(/insufficient SOL/i);
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
  });

  it("does not persist a partial operation when storage fails", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const before = storage.getItem(walletLedgerStorageKey);
    storage.failWrites = true;
    expect(() => repository.executeBalanceOperation({
      clientRequestId: "trust-buy-write-failure",
      walletId: "trust",
      accountId: account.id,
      deltas: { SOL: 1, ETH: 1 },
      activities: [{ id: "failed-buy-write", type: "receive", tokenSymbol: "SOL", amount: 1, counterpartyLabel: "Demo buy", date: "2026-08-29T12:00:00.000Z", status: "completed", note: "Must not persist" }],
    })).toThrow(/storage failure/i);
    storage.failWrites = false;
    expect(storage.getItem(walletLedgerStorageKey)).toBe(before);
  });

  it("migrates stored ledgers created before operation history was added", () => {
    const legacyState = repository.getState() as Partial<WalletLedgerState>;
    delete legacyState.operations;
    storage.setItem(walletLedgerStorageKey, JSON.stringify(legacyState));
    expect(new WalletLedgerRepository(storage).getState().operations).toEqual([]);
  });

  it("persists operation activity across reloads and remote snapshot merges", () => {
    const account = selectedAccount(repository.getState(), "trust");
    const activity = { id: "persisted-buy-sol", type: "receive" as const, tokenSymbol: "SOL", amount: 0.5, counterpartyLabel: "Demo buy", date: "2026-08-29T12:00:00.000Z", status: "completed" as const, note: "Internal demo buy" };
    const operation = repository.executeBalanceOperation({ clientRequestId: "persisted-buy-request", walletId: "trust", accountId: account.id, deltas: { SOL: 0.5 }, activities: [activity] });
    const reloaded = new WalletLedgerRepository(storage).getState();
    expect(reloaded.operations[0]).toEqual(operation);

    syncLegacyWalletViews(storage, reloaded);
    expect(JSON.parse(storage.getItem("larpz_trust_wallet_transactions") ?? "[]")).toContainEqual(activity);
    expect(JSON.parse(storage.getItem(`larpz_trust_wallet_transactions:${account.id}`) ?? "[]")).toContainEqual(activity);

    const fresh = createInitialWalletLedger({}, "2026-08-30T12:00:00.000Z");
    const merged = mergeRemoteWalletSnapshot(fresh, {
      accounts: [{ ...selectedAccount(reloaded, "trust"), ownerId: "lic_remote" }],
      transactions: [],
      operations: [operation],
    });
    expect(merged.operations).toContainEqual(operation);
  });

  it("rejects a request ID reused for a different transfer without changing balances", () => {
    transfer("ghost", "ledger", "mismatched-duplicate");
    const beforeReplay = repository.getState();
    const source = selectedAccount(beforeReplay, "ghost");
    const destination = selectedAccount(beforeReplay, "ledger");

    expect(() => repository.executeTransfer({
      clientRequestId: "mismatched-duplicate",
      sourceWalletId: "ghost",
      sourceAccountId: source.id,
      destinationWalletId: "ledger",
      destinationAccountId: destination.id,
      tokenSymbol: "SOL",
      amount: 2,
    })).toThrow(/different transfer/i);
    expect(repository.getState()).toEqual(beforeReplay);
  });

  it("sorts holdings from highest USD value to lowest", () => {
    const current = repository.getState();
    const account = selectedAccount(current, "ghost");
    const sorted = sortedAccountAssets(current, account);
    expect(sorted.map((entry) => entry.value)).toEqual([...sorted.map((entry) => entry.value)].sort((a, b) => b - a));
  });

  it("projects each wallet's own shared-ledger balance into its visible token list", () => {
    transfer("ghost", "ledger", "visible-ledger-balance");
    const current = repository.getState();
    const ledgerTokens = tokensForWalletAccount([], current, selectedAccount(current, "ledger"));
    const phantomTokens = tokensForWalletAccount([], current, selectedAccount(current, "ghost"));
    expect(ledgerTokens.find((token) => token.symbol === "SOL")?.balance).toBe(21);
    expect(phantomTokens.find((token) => token.symbol === "SOL")?.balance).toBe(20 - 1 - calculateNetworkFee("SOL", 1));
  });

  it("uses one canonical currency catalog in Phantom, Ledger, and Trust while keeping wallet balances separate", () => {
    const walletIds = ["ghost", "ledger", "trust"] as const;
    const expectedSolBalances = {
      ghost: 0.25,
      ledger: 1.5,
      trust: 8.75,
    } as const;

    for (const walletId of walletIds) {
      const account = selectedAccount(repository.getState(), walletId);
      repository.replaceBalances(walletId, account.id, { SOL: expectedSolBalances[walletId] });
    }

    const current = repository.getState();
    const canonicalSymbols = Object.keys(current.assets)
      .filter((symbol) => symbol !== "USD")
      .sort();
    const projections = walletIds.map((walletId, index) => {
      const staleWalletToken = {
        id: `${walletId}-stale-sol`,
        name: `${walletId} stale Solana`,
        symbol: "SOL",
        price: index + 1,
        balance: 999,
        change24h: index,
        image: `/stale-${walletId}-sol.png`,
        updatedAt: "2020-01-01T00:00:00.000Z",
      };

      return tokensForWalletAccount(
        [staleWalletToken],
        current,
        selectedAccount(current, walletId),
      );
    });

    for (const projection of projections) {
      expect(projection.map((token) => token.symbol).sort()).toEqual(canonicalSymbols);

      for (const symbol of canonicalSymbols) {
        const canonicalAsset = current.assets[symbol];
        expect(projection.find((token) => token.symbol === symbol)).toMatchObject({
          symbol,
          name: canonicalAsset.name,
          price: canonicalAsset.price,
          image: canonicalAsset.image,
        });
        expect(canonicalAsset.image).toBeTruthy();
      }
    }

    expect(projections.map((projection) => projection.find((token) => token.symbol === "SOL")?.balance))
      .toEqual(walletIds.map((walletId) => expectedSolBalances[walletId]));
  });

  it("adds an incoming asset and its image when the recipient UI list did not already contain it", () => {
    const before = repository.getState();
    const trustAccount = selectedAccount(before, "trust");
    const phantomAccount = selectedAccount(before, "ghost");
    repository.replaceBalances("trust", trustAccount.id, { BNB: 0.3 });

    repository.executeTransfer({
      clientRequestId: "incoming-bnb-visible-in-phantom",
      sourceWalletId: "trust",
      sourceAccountId: trustAccount.id,
      destinationWalletId: "ghost",
      destinationAccountId: phantomAccount.id,
      tokenSymbol: "BNB",
      amount: 0.2999,
    });

    const current = repository.getState();
    const phantomUiTokens = [{
      id: "phantom-sol",
      name: "Solana",
      symbol: "SOL",
      price: current.assets.SOL.price,
      balance: 20,
      change24h: 0,
      image: current.assets.SOL.image,
      updatedAt: "2026-08-29T12:00:00.000Z",
    }];
    expect(phantomUiTokens.some((token) => token.symbol === "BNB")).toBe(false);

    const visibleTokens = tokensForWalletAccount(
      phantomUiTokens,
      current,
      selectedAccount(current, "ghost"),
    );
    const receivedBnb = visibleTokens.find((token) => token.symbol === "BNB");

    expect(receivedBnb).toMatchObject({
      name: "BNB",
      symbol: "BNB",
      balance: 0.2999,
      image: current.assets.BNB.image,
    });
    expect(receivedBnb?.image).toBeTruthy();
  });

  it("keeps browser ledgers separate for different logged-in users", () => {
    expect(walletLedgerStorageKeyFor("usr_alice")).not.toBe(walletLedgerStorageKeyFor("usr_bob"));
    expect(walletLedgerStorageKeyFor("usr_alice")).toContain("usr_alice");
  });

  it("merges shared balances and incoming transfers into the recipient ledger", () => {
    const current = repository.getState();
    const recipient = selectedAccount(current, "ghost");
    const incoming = {
      id: "simtx_remote",
      clientRequestId: "transfer_remote",
      sourceWalletId: "ledger" as const,
      sourceAccountId: "ledger-account-remote",
      destinationWalletId: "ghost" as const,
      destinationAccountId: recipient.id,
      senderAddress: "sim_ledger_remote123",
      recipientAddress: recipient.address,
      tokenSymbol: "SOL",
      amount: 3,
      fee: 0.000005,
      feeSymbol: "SOL",
      network: "Solana",
      timestamp: "2026-08-30T12:00:00.000Z",
      status: "completed" as const,
      note: "SIMULATED TRANSFER — NOT BROADCAST ON-CHAIN" as const,
    };
    const merged = mergeRemoteWalletSnapshot(current, {
      accounts: [{ ...recipient, ownerId: "usr_recipient", balances: { ...recipient.balances, SOL: 23 } }],
      transactions: [incoming],
      operations: [],
    });
    expect(selectedAccount(merged, "ghost").balances.SOL).toBe(23);
    expect(transactionsForAccount(merged, recipient.id)[0].id).toBe("simtx_remote");
  });

  it("uses registered remote accounts instead of duplicating a user's wallet on another installation", () => {
    const current = repository.getState();
    const registered = selectedAccount(current, "ledger");
    const freshInstallation = createInitialWalletLedger({}, "2026-08-30T13:00:00.000Z");
    const merged = mergeRemoteWalletSnapshot(freshInstallation, {
      accounts: [{ ...registered, ownerId: "lic_same_user" }],
      transactions: [],
      operations: [],
    });
    expect(merged.wallets.ledger.accounts).toHaveLength(1);
    expect(selectedAccount(merged, "ledger").id).toBe(registered.id);
    expect(merged.wallets.ghost.accounts).toHaveLength(2);
  });
});
