import { coingeckoMap, defaultTokens } from "@/config/tokens";

type Quote = {
  price?: number;
  change?: number;
  change1h?: number;
  change7d?: number;
  image?: string;
  marketCap?: number;
  volume24h?: number;
};

type ParsedQuote = Quote & {
  symbol?: string;
};

export type PriceSnapshot = {
  prices: Record<string, number>;
  changes: Record<string, number>;
  changes1h: Record<string, number>;
  changes7d: Record<string, number>;
  images: Record<string, string>;
  marketCaps: Record<string, number>;
  volumes24h: Record<string, number>;
  updatedAt: string;
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

function imageFrom(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
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
    record.price_change_percentage_24h,
    record.change,
    record.usd_24h_change,
  ]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const change1h = [
    record.change_1h,
    record.change1h,
    record.percent_change_1h,
    record.price_change_percentage_1h_in_currency,
  ]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const change7d = [
    record.change_7d,
    record.change7d,
    record.percent_change_7d,
    record.price_change_percentage_7d_in_currency,
  ]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const marketCap = [record.market_cap, record.marketCap, record.usd_market_cap]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const volume24h = [record.total_volume, record.volume_24h, record.volume24h, record.usd_24h_vol]
    .map(numberFrom)
    .find((value): value is number => value !== undefined);

  const image = imageFrom(record.image) ?? imageFrom(record.logo);

  return { symbol, price, change, change1h, change7d, image, marketCap, volume24h };
}

function mergeQuote(quotes: Map<string, Quote>, symbol: string, quote: Quote) {
  const current = quotes.get(symbol) ?? {};
  quotes.set(symbol, {
    ...current,
    ...(quote.price !== undefined ? { price: quote.price } : {}),
    ...(quote.change !== undefined ? { change: quote.change } : {}),
    ...(quote.change1h !== undefined ? { change1h: quote.change1h } : {}),
    ...(quote.change7d !== undefined ? { change7d: quote.change7d } : {}),
    ...(quote.image !== undefined ? { image: quote.image } : {}),
    ...(quote.marketCap !== undefined ? { marketCap: quote.marketCap } : {}),
    ...(quote.volume24h !== undefined ? { volume24h: quote.volume24h } : {}),
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
    (parsed.price !== undefined || parsed.change !== undefined || parsed.change1h !== undefined || parsed.change7d !== undefined || parsed.image !== undefined || parsed.marketCap !== undefined || parsed.volume24h !== undefined)
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
    const endpoint = new URL("https://api.coingecko.com/api/v3/coins/markets");
    endpoint.searchParams.set("vs_currency", "usd");
    endpoint.searchParams.set("ids", ids);
    endpoint.searchParams.set("order", "market_cap_desc");
    endpoint.searchParams.set("per_page", "100");
    endpoint.searchParams.set("page", "1");
    endpoint.searchParams.set("sparkline", "false");
    endpoint.searchParams.set("price_change_percentage", "1h,24h,7d");

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

    if (!Array.isArray(payload)) {
      return quotes;
    }

    const symbolById = new Map(Object.entries(coingeckoMap).map(([symbol, id]) => [id, symbol]));
    payload.forEach((item) => {
      if (!isRecord(item) || typeof item.id !== "string") return;
      const symbol = symbolById.get(item.id);
      if (!symbol) return;
      const price = numberFrom(item.current_price);
      const change = numberFrom(item.price_change_percentage_24h_in_currency) ?? numberFrom(item.price_change_percentage_24h);
      const change1h = numberFrom(item.price_change_percentage_1h_in_currency);
      const change7d = numberFrom(item.price_change_percentage_7d_in_currency);
      const reportedMarketCap = numberFrom(item.market_cap);
      const marketCap = reportedMarketCap && reportedMarketCap > 0
        ? reportedMarketCap
        : numberFrom(item.fully_diluted_valuation);
      const image = imageFrom(item.image);
      const volume24h = numberFrom(item.total_volume);
      mergeQuote(quotes, symbol, { price, change, change1h, change7d, marketCap, volume24h, image });
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
    changes1h: {},
    changes7d: {},
    images: {},
    marketCaps: {},
    volumes24h: {},
    updatedAt: new Date(now).toISOString(),
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
    const change24h =
      coinGeckoQuote?.change ??
      providerQuote?.change ??
      FALLBACK_CHANGES[symbol] ??
      0;
    snapshot.changes[symbol] = change24h;
    snapshot.changes1h[symbol] = coinGeckoQuote?.change1h ?? providerQuote?.change1h ?? change24h;
    snapshot.changes7d[symbol] = coinGeckoQuote?.change7d ?? providerQuote?.change7d ?? change24h;
    const image = coinGeckoQuote?.image ?? providerQuote?.image;
    const marketCap = coinGeckoQuote?.marketCap ?? providerQuote?.marketCap;
    const volume24h = coinGeckoQuote?.volume24h ?? providerQuote?.volume24h;
    if (image) snapshot.images[symbol] = image;
    if (marketCap !== undefined) snapshot.marketCaps[symbol] = marketCap;
    if (volume24h !== undefined) snapshot.volumes24h[symbol] = volume24h;
  });

  cache = {
    key,
    snapshot,
    expiresAt: now + CACHE_TTL_MS,
  };

  return snapshot;
}
