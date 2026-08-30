import { canonicalWalletTokens } from "@/config/tokens";
import type { WalletToken } from "@/lib/types";

export type LiveMarketSnapshot = {
  prices: Record<string, number>;
  changes: Record<string, number>;
  changes1h: Record<string, number>;
  changes7d: Record<string, number>;
  images: Record<string, string>;
  marketCaps: Record<string, number>;
  volumes24h: Record<string, number>;
};

export const emptyLiveMarketSnapshot: LiveMarketSnapshot = {
  prices: {},
  changes: {},
  changes1h: {},
  changes7d: {},
  images: {},
  marketCaps: {},
  volumes24h: {},
};

export function mergeCanonicalWalletCatalogue(tokens: WalletToken[]) {
  const existingBySymbol = new Map(tokens.map((token) => [token.symbol.toUpperCase(), token]));
  const canonicalSymbols = new Set(canonicalWalletTokens.map((token) => token.symbol));
  const canonical = canonicalWalletTokens.map<WalletToken>((seed) => {
    const existing = existingBySymbol.get(seed.symbol);
    return {
      id: existing?.id ?? seed.id,
      name: seed.name,
      symbol: seed.symbol,
      price: existing?.price ?? seed.price,
      balance: existing?.balance ?? 0,
      change24h: existing?.change24h ?? seed.change24h,
      change1h: existing?.change1h,
      change7d: existing?.change7d,
      image: existing?.image || seed.image,
      marketCap: existing?.marketCap,
      volume24h: existing?.volume24h,
      updatedAt: existing?.updatedAt ?? "",
    };
  });
  const custom = tokens.filter((token) => !canonicalSymbols.has(token.symbol.toUpperCase()));
  return [...canonical, ...custom];
}

export function applyLiveMarketSnapshot(tokens: WalletToken[], snapshot: LiveMarketSnapshot) {
  return tokens.map((token) => ({
    ...token,
    price: snapshot.prices[token.symbol] ?? token.price,
    change24h: snapshot.changes[token.symbol] ?? token.change24h,
    change1h: snapshot.changes1h[token.symbol] ?? token.change1h,
    change7d: snapshot.changes7d[token.symbol] ?? token.change7d,
    image: snapshot.images[token.symbol] ?? token.image,
    marketCap: snapshot.marketCaps[token.symbol] ?? token.marketCap,
    volume24h: snapshot.volumes24h[token.symbol] ?? token.volume24h,
    updatedAt: snapshot.prices[token.symbol] ? new Date().toISOString() : token.updatedAt,
  }));
}
