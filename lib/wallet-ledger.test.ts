import { beforeEach, describe, expect, it } from "vitest";

import {
  accountForSelection,
  calculateNetworkFee,
  createInitialWalletLedger,
  mergeRemoteWalletSnapshot,
  selectedAccount,
  sortedAccountAssets,
  tokensForWalletAccount,
  transactionsForAccount,
  WalletLedgerRepository,
  WalletTransferError,
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

  it("prevents duplicate submission IDs", () => {
    transfer("ghost", "ledger", "duplicate");
    expect(() => transfer("ghost", "ledger", "duplicate")).toThrow(/already submitted/i);
    expect(repository.getState().transactions).toHaveLength(1);
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
    });
    expect(merged.wallets.ledger.accounts).toHaveLength(1);
    expect(selectedAccount(merged, "ledger").id).toBe(registered.id);
    expect(merged.wallets.ghost.accounts).toHaveLength(2);
  });
});
