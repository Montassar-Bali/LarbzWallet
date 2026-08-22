import { defaultTokens } from "@/config/tokens";
import { defaultWalletTheme, walletThemes, type WalletThemeId } from "@/config/wallets";
import {
  createId,
  readStorage,
  storageKeys,
  writeStorage,
} from "@/lib/storage";
import type {
  PortfolioSummary,
  WalletActivity,
  WalletToken,
} from "@/lib/types";

const seedTransactions: WalletActivity[] = [
  {
    id: "act_001",
    type: "receive",
    tokenSymbol: "USDT",
    amount: 4000,
    counterpartyLabel: "Demo Sponsor",
    date: new Date("2026-06-18T08:50:00.000Z").toISOString(),
    status: "completed",
    note: "SIMULATED TRANSACTION",
  },
  {
    id: "act_002",
    type: "send",
    tokenSymbol: "SOL",
    amount: 14.2,
    counterpartyLabel: "Creator Wallet",
    date: new Date("2026-06-20T16:10:00.000Z").toISOString(),
    status: "completed",
    note: "SIMULATED TRANSACTION",
  },
  {
    id: "act_003",
    type: "receive",
    tokenSymbol: "ETH",
    amount: 0.42,
    counterpartyLabel: "Training Sandbox",
    date: new Date("2026-06-21T10:22:00.000Z").toISOString(),
    status: "pending",
    note: "SIMULATED TRANSACTION",
  },
];

function seedWalletTokens() {
  const existing = readStorage<WalletToken[]>(storageKeys.tokens, []);
  if (existing.length > 0) {
    return existing;
  }

  const tokens: WalletToken[] = defaultTokens.map((token) => ({
    ...token,
    updatedAt: new Date().toISOString(),
  }));

  writeStorage(storageKeys.tokens, tokens);
  return tokens;
}

function seedWalletActivity() {
  const existing = readStorage<WalletActivity[]>(storageKeys.transactions, []);
  if (existing.length > 0) {
    return existing;
  }

  writeStorage(storageKeys.transactions, seedTransactions);
  return seedTransactions;
}

export function getTokens() {
  return seedWalletTokens();
}

export function saveToken(input: Omit<WalletToken, "updatedAt" | "id"> & { id?: string }) {
  const tokens = seedWalletTokens();
  const token: WalletToken = {
    ...input,
    id: input.id ?? createId("tok"),
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = tokens.findIndex((item) => item.id === token.id);
  if (existingIndex >= 0) {
    tokens[existingIndex] = token;
  } else {
    tokens.push(token);
  }

  writeStorage(storageKeys.tokens, tokens);
  return token;
}

export function deleteToken(id: string) {
  const tokens = seedWalletTokens().filter((token) => token.id !== id);
  writeStorage(storageKeys.tokens, tokens);
  return tokens;
}

export function getTransactions() {
  return seedWalletActivity();
}

export function createTransaction(input: {
  type: "send" | "receive";
  tokenSymbol: string;
  amount: number;
  counterpartyLabel: string;
  date: string;
  status: "completed" | "pending" | "failed";
  recipientId?: string;
  senderId?: string;
}) {
  const transactions = seedWalletActivity();
  const record: WalletActivity = {
    id: createId("act"),
    note: "SIMULATED TRANSACTION",
    ...input,
  };

  transactions.unshift(record);
  writeStorage(storageKeys.transactions, transactions);
  return record;
}

export function getPortfolio(): PortfolioSummary {
  const tokens = seedWalletTokens();
  const totalValue = tokens.reduce(
    (sum, token) => sum + token.price * token.balance,
    0,
  );

  const weightedChange =
    totalValue === 0
      ? 0
      : tokens.reduce((sum, token) => {
          const tokenValue = token.price * token.balance;
          return sum + (tokenValue / totalValue) * token.change24h;
        }, 0);

  const topAssets = [...tokens]
    .sort((a, b) => b.price * b.balance - a.price * a.balance)
    .slice(0, 4);

  return {
    totalValue,
    change24h: weightedChange,
    topAssets,
  };
}

export function applyPriceMapToTokens(priceMap: Record<string, number>) {
  const tokens = seedWalletTokens();
  const updated = tokens.map((token) => {
    const nextPrice = priceMap[token.symbol];
    if (!nextPrice || !Number.isFinite(nextPrice)) {
      return token;
    }

    return {
      ...token,
      price: nextPrice,
      updatedAt: new Date().toISOString(),
    };
  });

  writeStorage(storageKeys.tokens, updated);
  return updated;
}

export function resetWalletSimulation() {
  const tokens: WalletToken[] = defaultTokens.map((token) => ({
    ...token,
    updatedAt: new Date().toISOString(),
  }));

  writeStorage(storageKeys.tokens, tokens);
  writeStorage(storageKeys.transactions, seedTransactions);
}

export function getWalletTheme(): WalletThemeId {
  const value = readStorage<string>(storageKeys.walletTheme, defaultWalletTheme);
  const exists = walletThemes.some((theme) => theme.id === value);
  return exists ? (value as WalletThemeId) : defaultWalletTheme;
}

export function isWalletThemeId(value: string | null | undefined): value is WalletThemeId {
  return walletThemes.some((theme) => theme.id === value);
}

export function setWalletTheme(themeId: WalletThemeId) {
  const exists = walletThemes.some((theme) => theme.id === themeId);
  if (!exists) {
    return defaultWalletTheme;
  }

  writeStorage(storageKeys.walletTheme, themeId);
  return themeId;
}
