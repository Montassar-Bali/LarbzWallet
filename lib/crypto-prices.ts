import { coingeckoMap, defaultTokens } from "@/config/tokens";

type PriceCache = {
  expiresAt: number;
  prices: Record<string, number>;
};

const FALLBACK_PRICES: Record<string, number> = defaultTokens.reduce(
  (acc, token) => ({
    ...acc,
    [token.symbol]: token.price,
  }),
  {},
);

let cache: PriceCache | null = null;

export async function fetchCryptoPrices(symbols: string[]) {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.prices;
  }

  const ids = symbols
    .map((symbol) => coingeckoMap[symbol.toUpperCase()])
    .filter(Boolean)
    .join(",");

  if (!ids) {
    return FALLBACK_PRICES;
  }

  try {
    const endpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 120,
      },
    });

    if (!response.ok) {
      throw new Error(`Price API failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, { usd: number }>;

    const prices = symbols.reduce<Record<string, number>>((acc, symbol) => {
      const id = coingeckoMap[symbol.toUpperCase()];
      const value = id ? payload[id]?.usd : undefined;
      acc[symbol.toUpperCase()] = typeof value === "number" ? value : FALLBACK_PRICES[symbol.toUpperCase()] ?? 0;
      return acc;
    }, {});

    cache = {
      prices,
      expiresAt: now + 1000 * 60,
    };

    return prices;
  } catch {
    return symbols.reduce<Record<string, number>>((acc, symbol) => {
      acc[symbol.toUpperCase()] = FALLBACK_PRICES[symbol.toUpperCase()] ?? 0;
      return acc;
    }, {});
  }
}
