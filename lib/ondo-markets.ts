import type { WalletToken } from "@/lib/types";

const ONDO_MARKET_URL = "https://api.gm.ondo.finance/v1/assets/all/market";
const ONDO_METADATA_URL = "https://api.gm.ondo.finance/v1/assets/all/metadata";
const MARKET_CACHE_TTL_MS = 60_000;
const METADATA_CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_HISTORY_POINTS = 48;

export const ONDO_MARKETS_SOURCE = "Ondo Global Markets" as const;

export type OndoMarketStatus =
  | "live"
  | "partial"
  | "stale"
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
  source: typeof ONDO_MARKETS_SOURCE;
  status: OndoMarketStatus;
  configured: boolean;
  error?: string;
};

type TimedCache<T> = {
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

let snapshotCache: TimedCache<OndoMarketsSnapshot> | null = null;
let metadataCache: TimedCache<Map<string, MetadataRecord>> | null = null;
let inFlight: { apiKey: string; promise: Promise<OndoMarketsSnapshot> } | null = null;

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

function apiKeyFromEnvironment() {
  const value = process.env.ONDO_API_KEY?.trim();
  return value || undefined;
}

async function fetchJson(endpoint: string, apiKey: string) {
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
    throw new Error("Ondo market data request failed.");
  }
  return (await response.json()) as unknown;
}

async function metadataForRequest(apiKey: string, now: number): Promise<MetadataState> {
  const cached = metadataCache?.apiKey === apiKey ? metadataCache : null;
  if (cached && cached.expiresAt > now) {
    return { records: cached.value, freshness: "fresh" };
  }

  try {
    const payload = await fetchJson(ONDO_METADATA_URL, apiKey);
    const records = parseMetadata(payload);
    if (!records.size) throw new Error("Ondo metadata response was empty.");
    metadataCache = {
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
  status: "unavailable" | "unconfigured",
  configured: boolean,
  error: string,
): OndoMarketsSnapshot {
  return {
    assets: [],
    updatedAt: new Date().toISOString(),
    source: ONDO_MARKETS_SOURCE,
    status,
    configured,
    error,
  };
}

async function loadOndoMarkets(apiKey: string, now: number): Promise<OndoMarketsSnapshot> {
  const marketPromise = fetchJson(ONDO_MARKET_URL, apiKey);
  const metadataPromise = metadataForRequest(apiKey, now);
  const [marketResult, metadataResult] = await Promise.allSettled([
    marketPromise,
    metadataPromise,
  ]);

  if (marketResult.status === "rejected") {
    const stale = snapshotCache?.apiKey === apiKey ? snapshotCache.value : null;
    if (stale?.assets.length) {
      return {
        ...stale,
        status: "stale",
        error: "Live Ondo market data is temporarily unavailable.",
      };
    }
    return emptySnapshot(
      "unavailable",
      true,
      "Ondo market data is temporarily unavailable.",
    );
  }

  const metadataState =
    metadataResult.status === "fulfilled"
      ? metadataResult.value
      : { records: new Map<string, MetadataRecord>(), freshness: "unavailable" as const };
  const fetchedAt = new Date(now).toISOString();
  const assets = parseMarketAssets(marketResult.value, metadataState.records, fetchedAt);
  if (!assets.length) {
    const stale = snapshotCache?.apiKey === apiKey ? snapshotCache.value : null;
    if (stale?.assets.length) {
      return {
        ...stale,
        status: "stale",
        error: "Live Ondo market data is temporarily unavailable.",
      };
    }
    return emptySnapshot(
      "unavailable",
      true,
      "Ondo market data is temporarily unavailable.",
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
    source: ONDO_MARKETS_SOURCE,
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
    apiKey,
    expiresAt: now + MARKET_CACHE_TTL_MS,
    value: snapshot,
  };
  return snapshot;
}

export async function fetchOndoMarkets(): Promise<OndoMarketsSnapshot> {
  const apiKey = apiKeyFromEnvironment();
  if (!apiKey) {
    return emptySnapshot(
      "unconfigured",
      false,
      "Ondo market data is not configured.",
    );
  }

  const now = Date.now();
  if (
    snapshotCache?.apiKey === apiKey &&
    snapshotCache.expiresAt > now
  ) {
    return snapshotCache.value;
  }
  if (inFlight?.apiKey === apiKey) return inFlight.promise;

  const promise = loadOndoMarkets(apiKey, now)
    .then((snapshot) => {
      snapshotCache = {
        apiKey,
        expiresAt: now + MARKET_CACHE_TTL_MS,
        value: snapshot,
      };
      return snapshot;
    })
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { apiKey, promise };
  return promise;
}

export function resetOndoMarketsCacheForTests() {
  snapshotCache = null;
  metadataCache = null;
  inFlight = null;
}
