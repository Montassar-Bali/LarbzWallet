import type { WalletToken } from "@/lib/types";

const ONDO_MARKET_URL = "https://api.gm.ondo.finance/v1/assets/all/market";
const ONDO_METADATA_URL = "https://api.gm.ondo.finance/v1/assets/all/metadata";
const BLOCKDAEMON_CHAIN_ID = "eip155:1";
const BLOCKDAEMON_ONDO_ADDRESS = "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3";
const BLOCKDAEMON_TOKENS_URL = `https://svc.blockdaemon.com/pricing/v1/allowed_tokens/${BLOCKDAEMON_CHAIN_ID}`;
const BLOCKDAEMON_QUOTES_URL = `https://svc.blockdaemon.com/pricing/v1/quotes/${BLOCKDAEMON_CHAIN_ID}`;
const MARKET_CACHE_TTL_MS = 60_000;
const METADATA_CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_HISTORY_POINTS = 48;

export const ONDO_MARKETS_SOURCE = "Ondo Global Markets" as const;
export const BLOCKDAEMON_MARKETS_SOURCE = "Blockdaemon Token Price API" as const;

export type OndoMarketProvider = "ondo" | "blockdaemon";
export type OndoMarketSource =
  | typeof ONDO_MARKETS_SOURCE
  | typeof BLOCKDAEMON_MARKETS_SOURCE;

export type OndoMarketStatus =
  | "live"
  | "partial"
  | "stale"
  | "unauthorized"
  | "unavailable"
  | "unconfigured";

export type OndoMarketHistoryPoint = {
  time: number;
  price: number;
};

export type OndoNetworkChainId = "ethereum-1" | "bsc-56" | "solana-900";

export type OndoAssetAddress = {
  networkChainId: OndoNetworkChainId;
  address: string;
  decimals: number;
};

export type OndoMarketAsset = WalletToken & {
  underlyingTicker?: string;
  assetClass?: string;
  instrumentType?: string;
  totalHolders?: number;
  tradableSessions: string[];
  priceHistory24h: OndoMarketHistoryPoint[];
  addresses: OndoAssetAddress[];
};

export type OndoMarketsSnapshot = {
  assets: OndoMarketAsset[];
  updatedAt: string;
  provider: OndoMarketProvider | null;
  source: OndoMarketSource | null;
  status: OndoMarketStatus;
  configured: boolean;
  error?: string;
};

type TimedCache<T> = {
  provider: OndoMarketProvider;
  apiKey: string;
  expiresAt: number;
  value: T;
};

type MetadataRecord = {
  symbol: string;
  ticker?: string;
  name?: string;
  assetClass?: string;
  instrumentType?: string;
  image?: string;
  addresses: OndoAssetAddress[];
};

type MetadataState = {
  records: Map<string, MetadataRecord>;
  freshness: "fresh" | "stale" | "unavailable";
};

type ProviderCredentials = {
  provider: OndoMarketProvider;
  source: OndoMarketSource;
  apiKey: string;
};

let snapshotCache: TimedCache<OndoMarketsSnapshot> | null = null;
let metadataCache: TimedCache<Map<string, MetadataRecord>> | null = null;
let inFlight: {
  provider: OndoMarketProvider;
  apiKey: string;
  promise: Promise<OndoMarketsSnapshot>;
} | null = null;

class MarketRequestError extends Error {
  constructor(
    readonly provider: OndoMarketProvider,
    readonly status: number,
  ) {
    super("Market data request failed.");
    this.name = "MarketRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[$,%\s,]/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nonNegativeNumber(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function cleanText(value: unknown, maximumLength = 120) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximumLength) : undefined;
}

function cleanSymbol(value: unknown) {
  const symbol = cleanText(value, 24);
  return symbol && /^[A-Za-z0-9._-]+$/.test(symbol) ? symbol : undefined;
}

function cleanTicker(value: unknown) {
  const ticker = cleanText(value, 16);
  return ticker && /^[A-Za-z0-9._-]+$/.test(ticker) ? ticker : undefined;
}

function safeImage(value: unknown) {
  const candidate = cleanText(value, 500);
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function timestampMilliseconds(value: unknown) {
  const parsed = finiteNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;

  const milliseconds = parsed < 100_000_000_000 ? parsed * 1_000 : parsed;
  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  return Number.isFinite(date.getTime()) && year >= 2000 && year <= 3000
    ? milliseconds
    : undefined;
}

function arrayPayload(payload: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload) || depth >= 3) return null;

  for (const key of ["assets", "data", "items", "results"]) {
    if (!(key in payload)) continue;
    const nested = arrayPayload(payload[key], depth + 1);
    if (nested) return nested;
  }

  return null;
}

function downsampleHistory(points: OndoMarketHistoryPoint[]) {
  if (points.length <= MAX_HISTORY_POINTS) return points;

  const sampled: OndoMarketHistoryPoint[] = [];
  const step = (points.length - 1) / (MAX_HISTORY_POINTS - 1);
  for (let index = 0; index < MAX_HISTORY_POINTS; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

function normalizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];

  const byTime = new Map<number, OndoMarketHistoryPoint>();
  value.forEach((entry) => {
    if (!isRecord(entry)) return;
    const time = timestampMilliseconds(entry.timestamp ?? entry.time);
    const price = nonNegativeNumber(entry.price);
    if (time === undefined || price === undefined) return;
    byTime.set(time, { time, price });
  });

  return downsampleHistory(
    Array.from(byTime.values()).sort((left, right) => left.time - right.time),
  );
}

function normalizeSessions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((session) => cleanText(session, 32))
        .filter((session): session is string => Boolean(session)),
    ),
  ).slice(0, 8);
}

function normalizeAddresses(value: unknown) {
  if (!Array.isArray(value)) return [];

  const addresses = new Map<string, OndoAssetAddress>();
  value.slice(0, 24).forEach((entry) => {
    if (!isRecord(entry)) return;
    const networkChainId = cleanText(entry.networkChainId, 32);
    if (
      networkChainId !== "ethereum-1" &&
      networkChainId !== "bsc-56" &&
      networkChainId !== "solana-900"
    ) return;

    const address = cleanText(entry.address, 128);
    const decimals = finiteNumber(entry.decimals);
    const isValidAddress = networkChainId === "solana-900"
      ? Boolean(address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
      : Boolean(address && /^0x[0-9a-fA-F]{40}$/.test(address));
    if (!address || !isValidAddress || decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return;

    const keyAddress = networkChainId === "solana-900" ? address : address.toLowerCase();
    addresses.set(`${networkChainId}:${keyAddress}`, { networkChainId, address, decimals });
  });
  return Array.from(addresses.values()).slice(0, 8);
}

function safeAssetId(symbol: string) {
  const slug = symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `ondo-${slug || "asset"}`;
}

function parseMetadata(payload: unknown) {
  const rows = arrayPayload(payload);
  if (!rows) return new Map<string, MetadataRecord>();

  const records = new Map<string, MetadataRecord>();
  rows.forEach((row) => {
    if (!isRecord(row)) return;
    const symbol = cleanSymbol(row.symbol);
    if (!symbol) return;
    const tags = isRecord(row.tags) ? row.tags : {};
    const image =
      safeImage(row.image) ??
      safeImage(row.logo) ??
      safeImage(row.logoUrl) ??
      safeImage(row.logoURI);

    records.set(symbol.toUpperCase(), {
      symbol,
      ticker: cleanTicker(row.ticker),
      name:
        cleanText(row.displayName) ??
        cleanText(row.underlyingName) ??
        cleanText(row.name),
      assetClass: cleanText(tags.assetClass, 48),
      instrumentType: cleanText(tags.instrumentType, 48),
      image,
      addresses: normalizeAddresses(row.addresses),
    });
  });
  return records;
}

function normalizeMarketAsset(
  value: unknown,
  metadata: Map<string, MetadataRecord>,
  fallbackUpdatedAt: string,
): OndoMarketAsset | null {
  if (!isRecord(value)) return null;
  const primary = isRecord(value.primaryMarket) ? value.primaryMarket : null;
  const underlying = isRecord(value.underlyingMarket) ? value.underlyingMarket : null;
  if (!primary) return null;

  const symbol = cleanSymbol(primary.symbol);
  const price = nonNegativeNumber(primary.price);
  if (!symbol || price === undefined || price <= 0) return null;

  const assetMetadata = metadata.get(symbol.toUpperCase());
  const underlyingTicker =
    cleanTicker(underlying?.ticker) ?? assetMetadata?.ticker;
  const symbolName = symbol.replace(/on$/i, "") || symbol;
  const name =
    assetMetadata?.name ??
    cleanText(underlying?.name) ??
    underlyingTicker ??
    symbolName;
  const timestamp = timestampMilliseconds(value.timestamp);
  const updatedAt = timestamp
    ? new Date(timestamp).toISOString()
    : fallbackUpdatedAt;
  const totalHolders = nonNegativeNumber(primary.totalHolders);
  const marketCap = nonNegativeNumber(underlying?.marketCap);
  const volume24h = nonNegativeNumber(underlying?.volume);

  return {
    id: safeAssetId(symbol),
    name,
    symbol,
    price,
    balance: 0,
    change24h: finiteNumber(primary.priceChangePct24h) ?? 0,
    image: assetMetadata?.image ?? "",
    ...(marketCap !== undefined ? { marketCap } : {}),
    ...(volume24h !== undefined ? { volume24h } : {}),
    updatedAt,
    ...(underlyingTicker ? { underlyingTicker } : {}),
    ...(assetMetadata?.assetClass ? { assetClass: assetMetadata.assetClass } : {}),
    ...(assetMetadata?.instrumentType
      ? { instrumentType: assetMetadata.instrumentType }
      : {}),
    ...(totalHolders !== undefined ? { totalHolders: Math.floor(totalHolders) } : {}),
    tradableSessions: normalizeSessions(primary.tradableSessions),
    priceHistory24h: normalizeHistory(primary.priceHistory24h),
    addresses: assetMetadata?.addresses ?? [],
  };
}

function parseMarketAssets(
  payload: unknown,
  metadata: Map<string, MetadataRecord>,
  fallbackUpdatedAt: string,
) {
  const rows = arrayPayload(payload);
  if (!rows) return [];

  const assets = new Map<string, OndoMarketAsset>();
  rows.forEach((row) => {
    const asset = normalizeMarketAsset(row, metadata, fallbackUpdatedAt);
    if (asset && !assets.has(asset.symbol.toUpperCase())) {
      assets.set(asset.symbol.toUpperCase(), asset);
    }
  });
  return Array.from(assets.values());
}

function providerFromEnvironment(): ProviderCredentials | null {
  const ondoApiKey = process.env.ONDO_API_KEY?.trim();
  if (ondoApiKey) {
    return {
      provider: "ondo",
      source: ONDO_MARKETS_SOURCE,
      apiKey: ondoApiKey,
    };
  }

  const blockdaemonApiKey = process.env.BLOCKDAEMON_API_KEY?.trim();
  if (blockdaemonApiKey) {
    return {
      provider: "blockdaemon",
      source: BLOCKDAEMON_MARKETS_SOURCE,
      apiKey: blockdaemonApiKey,
    };
  }

  return null;
}

function sameCredentials(
  cached: Pick<TimedCache<unknown>, "provider" | "apiKey"> | null,
  credentials: ProviderCredentials,
) {
  return cached?.provider === credentials.provider && cached.apiKey === credentials.apiKey;
}

async function fetchOndoJson(endpoint: string, apiKey: string) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new MarketRequestError("ondo", response.status);
  }
  return (await response.json()) as unknown;
}

async function fetchBlockdaemonJson(
  endpoint: string,
  apiKey: string,
  init: { method: "GET" | "POST"; body?: string },
) {
  const response = await fetch(endpoint, {
    method: init.method,
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: init.body } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new MarketRequestError("blockdaemon", response.status);
  }
  return (await response.json()) as unknown;
}

function isAuthenticationFailure(
  error: unknown,
  provider: OndoMarketProvider,
) {
  return error instanceof MarketRequestError &&
    error.provider === provider &&
    (error.status === 401 || error.status === 403);
}

function payloadContainsAddress(
  value: unknown,
  expectedAddress: string,
  depth = 0,
): boolean {
  if (depth > 8) return false;
  if (typeof value === "string") {
    return value.trim().toLowerCase() === expectedAddress.toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.some((entry) => payloadContainsAddress(entry, expectedAddress, depth + 1));
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, entry]) =>
    key.toLowerCase() === expectedAddress.toLowerCase() ||
    payloadContainsAddress(entry, expectedAddress, depth + 1)
  );
}

function positivePrice(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function blockdaemonUsdPrice(value: unknown, depth = 0): number | undefined {
  if (depth > 8 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const price = blockdaemonUsdPrice(entry, depth + 1);
      if (price !== undefined) return price;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const key of ["USD", "usd"]) {
    if (!(key in value)) continue;
    const direct = positivePrice(value[key]);
    if (direct !== undefined) return direct;
    const nested = blockdaemonUsdPrice(value[key], depth + 1);
    if (nested !== undefined) return nested;
  }

  if ("price" in value) {
    const direct = positivePrice(value.price);
    if (direct !== undefined) return direct;
    const nested = blockdaemonUsdPrice(value.price, depth + 1);
    if (nested !== undefined) return nested;
  }

  const quoteCurrency = cleanText(
    value.currency ?? value.unit ?? value.quoteCurrency ?? value.quote_currency,
    12,
  )?.toUpperCase();
  if (quoteCurrency === "USD") {
    for (const key of ["value", "amount", "quote", "rate"]) {
      const direct = positivePrice(value[key]);
      if (direct !== undefined) return direct;
    }
  }

  for (const [key, entry] of Object.entries(value)) {
    if (["timestamp", "time", "status", "decimals", "chainId", "chain_id"].includes(key)) {
      continue;
    }
    const nested = blockdaemonUsdPrice(entry, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

async function metadataForRequest(apiKey: string, now: number): Promise<MetadataState> {
  const cached = metadataCache?.provider === "ondo" && metadataCache.apiKey === apiKey
    ? metadataCache
    : null;
  if (cached && cached.expiresAt > now) {
    return { records: cached.value, freshness: "fresh" };
  }

  try {
    const payload = await fetchOndoJson(ONDO_METADATA_URL, apiKey);
    const records = parseMetadata(payload);
    if (!records.size) throw new Error("Ondo metadata response was empty.");
    metadataCache = {
      provider: "ondo",
      apiKey,
      expiresAt: now + METADATA_CACHE_TTL_MS,
      value: records,
    };
    return { records, freshness: "fresh" };
  } catch {
    if (cached) return { records: cached.value, freshness: "stale" };
    return { records: new Map(), freshness: "unavailable" };
  }
}

function emptySnapshot(
  status: "unauthorized" | "unavailable" | "unconfigured",
  configured: boolean,
  error: string,
  credentials: ProviderCredentials | null,
): OndoMarketsSnapshot {
  return {
    assets: [],
    updatedAt: new Date().toISOString(),
    provider: credentials?.provider ?? null,
    source: credentials?.source ?? null,
    status,
    configured,
    error,
  };
}

function staleSnapshot(
  credentials: ProviderCredentials,
  error: string,
) {
  const stale = sameCredentials(snapshotCache, credentials)
    ? snapshotCache?.value
    : null;
  return stale?.assets.length
    ? { ...stale, status: "stale" as const, error }
    : null;
}

async function loadOfficialOndoMarkets(
  credentials: ProviderCredentials,
  now: number,
): Promise<OndoMarketsSnapshot> {
  const marketPromise = fetchOndoJson(ONDO_MARKET_URL, credentials.apiKey);
  const metadataPromise = metadataForRequest(credentials.apiKey, now);
  const [marketResult, metadataResult] = await Promise.allSettled([
    marketPromise,
    metadataPromise,
  ]);

  if (marketResult.status === "rejected") {
    if (isAuthenticationFailure(marketResult.reason, "ondo")) {
      return emptySnapshot(
        "unauthorized",
        true,
        "Ondo rejected the configured API key.",
        credentials,
      );
    }
    const stale = staleSnapshot(
      credentials,
      "Live Ondo market data is temporarily unavailable.",
    );
    if (stale) return stale;
    return emptySnapshot(
      "unavailable",
      true,
      "Ondo market data is temporarily unavailable.",
      credentials,
    );
  }

  const metadataState =
    metadataResult.status === "fulfilled"
      ? metadataResult.value
      : { records: new Map<string, MetadataRecord>(), freshness: "unavailable" as const };
  const fetchedAt = new Date(now).toISOString();
  const assets = parseMarketAssets(marketResult.value, metadataState.records, fetchedAt);
  if (!assets.length) {
    const stale = staleSnapshot(
      credentials,
      "Live Ondo market data is temporarily unavailable.",
    );
    if (stale) return stale;
    return emptySnapshot(
      "unavailable",
      true,
      "Ondo market data is temporarily unavailable.",
      credentials,
    );
  }

  const latestTimestamp = assets.reduce((latest, asset) => {
    const timestamp = Date.parse(asset.updatedAt);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const metadataIsFresh = metadataState.freshness === "fresh";
  const snapshot: OndoMarketsSnapshot = {
    assets,
    updatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : fetchedAt,
    provider: credentials.provider,
    source: credentials.source,
    status: metadataIsFresh ? "live" : "partial",
    configured: true,
    ...(!metadataIsFresh
      ? {
          error:
            metadataState.freshness === "stale"
              ? "Ondo asset metadata is temporarily stale."
              : "Ondo asset metadata is temporarily unavailable.",
        }
      : {}),
  };

  snapshotCache = {
    provider: credentials.provider,
    apiKey: credentials.apiKey,
    expiresAt: now + MARKET_CACHE_TTL_MS,
    value: snapshot,
  };
  return snapshot;
}

async function loadBlockdaemonOndoPrice(
  credentials: ProviderCredentials,
  now: number,
): Promise<OndoMarketsSnapshot> {
  const capabilityUrl = new URL(BLOCKDAEMON_TOKENS_URL);
  capabilityUrl.searchParams.append("addresses", BLOCKDAEMON_ONDO_ADDRESS);

  try {
    const supportedTokens = await fetchBlockdaemonJson(
      capabilityUrl.href,
      credentials.apiKey,
      { method: "GET" },
    );
    if (!payloadContainsAddress(supportedTokens, BLOCKDAEMON_ONDO_ADDRESS)) {
      return emptySnapshot(
        "unavailable",
        true,
        "Blockdaemon does not currently support pricing for the Ethereum ONDO token.",
        credentials,
      );
    }

    const quotePayload = await fetchBlockdaemonJson(
      BLOCKDAEMON_QUOTES_URL,
      credentials.apiKey,
      {
        method: "POST",
        body: JSON.stringify({
          addresses: [BLOCKDAEMON_ONDO_ADDRESS],
          units: ["USD"],
        }),
      },
    );
    const price = blockdaemonUsdPrice(quotePayload);
    if (price === undefined) {
      return emptySnapshot(
        "unavailable",
        true,
        "Blockdaemon returned no usable USD price for the Ethereum ONDO token.",
        credentials,
      );
    }

    const updatedAt = new Date(now).toISOString();
    return {
      assets: [
        {
          id: "blockdaemon-ondo-ethereum",
          name: "Ondo",
          symbol: "ONDO",
          price,
          balance: 0,
          change24h: 0,
          image: "",
          updatedAt,
          tradableSessions: [],
          priceHistory24h: [],
          addresses: [
            {
              networkChainId: "ethereum-1",
              address: BLOCKDAEMON_ONDO_ADDRESS,
              decimals: 18,
            },
          ],
        },
      ],
      updatedAt,
      provider: credentials.provider,
      source: credentials.source,
      status: "partial",
      configured: true,
      error: "Blockdaemon provides current Ethereum ONDO pricing only.",
    };
  } catch (error) {
    if (isAuthenticationFailure(error, "blockdaemon")) {
      return emptySnapshot(
        "unauthorized",
        true,
        "Blockdaemon rejected the configured API key.",
        credentials,
      );
    }
    const stale = staleSnapshot(
      credentials,
      "Live Blockdaemon ONDO pricing is temporarily unavailable.",
    );
    if (stale) return stale;
    return emptySnapshot(
      "unavailable",
      true,
      "Blockdaemon ONDO pricing is temporarily unavailable.",
      credentials,
    );
  }
}

export async function fetchOndoMarkets(): Promise<OndoMarketsSnapshot> {
  const credentials = providerFromEnvironment();
  if (!credentials) {
    return emptySnapshot(
      "unconfigured",
      false,
      "Ondo market data is not configured.",
      null,
    );
  }

  const now = Date.now();
  const cachedSnapshot = sameCredentials(snapshotCache, credentials)
    ? snapshotCache
    : null;
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) return cachedSnapshot.value;
  if (
    inFlight?.provider === credentials.provider &&
    inFlight.apiKey === credentials.apiKey
  ) return inFlight.promise;

  const promise = (
    credentials.provider === "ondo"
      ? loadOfficialOndoMarkets(credentials, now)
      : loadBlockdaemonOndoPrice(credentials, now)
  )
    .then((snapshot) => {
      snapshotCache = {
        provider: credentials.provider,
        apiKey: credentials.apiKey,
        expiresAt: now + MARKET_CACHE_TTL_MS,
        value: snapshot,
      };
      return snapshot;
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = {
    provider: credentials.provider,
    apiKey: credentials.apiKey,
    promise,
  };
  return promise;
}

export function resetOndoMarketsCacheForTests() {
  snapshotCache = null;
  metadataCache = null;
  inFlight = null;
}
