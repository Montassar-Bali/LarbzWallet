import { coingeckoMap, defaultTokens } from "@/config/tokens";

type Quote = {
  price?: number;
  change?: number;
};

type ParsedQuote = Quote & {
  symbol?: string;
};

export type PriceSnapshot = {
  prices: Record<string, number>;
  changes: Record<string, number>;
};

type PriceCache = {
  expiresAt: number;
  key: string;
  snapshot: PriceSnapshot;
};

const PROVIDER_URL = "https://api.freecryptoapi.com/v1/getData";
const CACHE_TTL_MS = 60_000;

const FALLBACK_PRICES: Record<string, number> = defaultTokens.reduce(
  (acc, token) => ({
    ...acc,
    [token.symbol]: token.price,
  }),
  {},
);

const FALLBACK_CHANGES: Record<string, number> = defaultTokens.reduce(
  (acc, token) => ({
    ...acc,
    [token.symbol]: token.change24h,
  }),
  {},
);

let cache: PriceCache | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/[$,%\s,]/g, "");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function symbolFrom(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9]{2,12}$/.test(symbol) ? symbol : undefined;
}

function quoteFromRecord(
  record: Record<string, unknown>,
  fallbackSymbol?: string,
): ParsedQuote {
  const symbol =
    symbolFrom(record.symbol) ??
    symbolFrom(record.ticker) ??
    symbolFrom(record.asset) ??
    symbolFrom(record.currency) ??
    fallbackSymbol;

  const price = [
    record.price,
    record.usd,
    record.USD,
    record.value,
    record.current_price,
  ]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const change = [
    record.change_24h,
    record.change24h,
    record.percent_change_24h,
    record.percentChange24h,
    record.change,
    record.usd_24h_change,
  ]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  return { symbol, price, change };
}

function mergeQuote(quotes: Map<string, Quote>, symbol: string, quote: Quote) {
  const current = quotes.get(symbol) ?? {};
  quotes.set(symbol, {
    ...current,
    ...(quote.price !== undefined ? { price: quote.price } : {}),
    ...(quote.change !== undefined ? { change: quote.change } : {}),
  });
}

function collectQuotes(
  value: unknown,
  quotes: Map<string, Quote>,
  fallbackSymbol?: string,
) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectQuotes(item, quotes));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const parsed = quoteFromRecord(value, fallbackSymbol);
  if (
    parsed.symbol &&
    (parsed.price !== undefined || parsed.change !== undefined)
  ) {
    mergeQuote(quotes, parsed.symbol, parsed);
  }

  Object.entries(value).forEach(([key, child]) => {
    const symbol = symbolFrom(key);
    if (symbol) {
      const directPrice = numberFrom(child);
      if (directPrice !== undefined) {
        mergeQuote(quotes, symbol, { price: directPrice });
        return;
      }

      collectQuotes(child, quotes, symbol);
      return;
    }

    if (child !== value) {
      collectQuotes(child, quotes);
    }
  });
}

function normalizedSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function providerApiKey() {
  return process.env.CRYPTO_API_KEY ?? process.env.FREECRYPTOAPI_API_KEY;
}

async function fetchProviderQuotes(symbols: string[]) {
  const apiKey = providerApiKey();
  const configuredUrl = process.env.CRYPTO_API_URL;

  if (!apiKey && !configuredUrl) {
    return null;
  }

  try {
    const endpoint = new URL(configuredUrl || PROVIDER_URL);
    endpoint.searchParams.set("symbol", symbols.join("+"));

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    const quotes = new Map<string, Quote>();
    collectQuotes(payload, quotes);
    return quotes;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoQuotes(symbols: string[]) {
  const ids = Array.from(
    new Set(
      symbols
        .map((symbol) => coingeckoMap[symbol])
        .filter(Boolean),
    ),
  ).join(",");

  if (!ids) {
    return new Map<string, Quote>();
  }

  try {
    const endpoint = new URL("https://api.coingecko.com/api/v3/simple/price");
    endpoint.searchParams.set("ids", ids);
    endpoint.searchParams.set("vs_currencies", "usd");
    endpoint.searchParams.set("include_24hr_change", "true");

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    const apiKey = process.env.COINGECKO_API_KEY;
    if (apiKey) {
      headers["x-cg-demo-api-key"] = apiKey;
    }

    const response = await fetch(endpoint, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return new Map<string, Quote>();
    }

    const payload: unknown = await response.json();
    const quotes = new Map<string, Quote>();

    if (!isRecord(payload)) {
      return quotes;
    }

    symbols.forEach((symbol) => {
      const id = coingeckoMap[symbol];
      const item = id ? payload[id] : undefined;
      if (!isRecord(item)) {
        return;
      }

      const price = numberFrom(item.usd);
      const change = numberFrom(item.usd_24h_change);
      if (price !== undefined || change !== undefined) {
        mergeQuote(quotes, symbol, { price, change });
      }
    });

    return quotes;
  } catch {
    return new Map<string, Quote>();
  }
}

export async function fetchCryptoPrices(
  symbols: string[],
): Promise<PriceSnapshot> {
  const requestedSymbols = normalizedSymbols(symbols);
  const key = requestedSymbols.join("|");
  const now = Date.now();

  if (cache && cache.key === key && cache.expiresAt > now) {
    return cache.snapshot;
  }

  const snapshot: PriceSnapshot = {
    prices: {},
    changes: {},
  };

  if (!requestedSymbols.length) {
    return snapshot;
  }

  const [coinGeckoQuotes, providerQuotes] = await Promise.all([
    fetchCoinGeckoQuotes(requestedSymbols),
    fetchProviderQuotes(requestedSymbols),
  ]);

  requestedSymbols.forEach((symbol) => {
    const coinGeckoQuote = coinGeckoQuotes.get(symbol);
    const providerQuote = providerQuotes?.get(symbol);

    snapshot.prices[symbol] =
      coinGeckoQuote?.price ??
      providerQuote?.price ??
      FALLBACK_PRICES[symbol] ??
      0;
    snapshot.changes[symbol] =
      coinGeckoQuote?.change ??
      providerQuote?.change ??
      FALLBACK_CHANGES[symbol] ??
      0;
  });

  cache = {
    key,
    snapshot,
    expiresAt: now + CACHE_TTL_MS,
  };

  return snapshot;
}
