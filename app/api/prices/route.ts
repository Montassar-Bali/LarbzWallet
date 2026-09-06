import { NextRequest, NextResponse } from "next/server";

import { liveMarketSymbols } from "@/config/tokens";
import { fetchCryptoPrices, type PriceSnapshot } from "@/lib/crypto-prices";

const allowedSymbols = new Set(liveMarketSymbols);
const MAX_SYMBOL_QUERY_LENGTH = 256;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 60;
const MAX_RATE_LIMIT_CLIENTS = 1_024;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

type ParsedSymbols =
  | { symbols: string[]; error?: never }
  | { symbols?: never; error: string };

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function requestClientId(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = forwarded || realIp;
  return candidate && candidate.length <= 128 ? candidate : "unknown";
}

function consumeRateLimit(request: NextRequest): RateLimitResult {
  const now = Date.now();
  let clientId = requestClientId(request);
  let bucket = rateLimitBuckets.get(clientId);

  if (!bucket || bucket.resetAt <= now) {
    for (const [key, value] of rateLimitBuckets) {
      if (value.resetAt <= now) rateLimitBuckets.delete(key);
    }

    if (!rateLimitBuckets.has(clientId) && rateLimitBuckets.size >= MAX_RATE_LIMIT_CLIENTS) {
      clientId = "overflow";
    }
    bucket = rateLimitBuckets.get(clientId);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      rateLimitBuckets.set(clientId, bucket);
    }
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
  if (bucket.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_REQUESTS - bucket.count,
    retryAfter,
  };
}

function responseHeaders(rateLimit: RateLimitResult, cacheControl: string) {
  return {
    "Cache-Control": cacheControl,
    "X-RateLimit-Limit": String(RATE_LIMIT_REQUESTS),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
  };
}

function requestedSymbols(request: NextRequest): ParsedSymbols {
  const raw = request.nextUrl.searchParams.get("symbols");
  if (raw === null) return { symbols: liveMarketSymbols };
  if (!raw || raw.length > MAX_SYMBOL_QUERY_LENGTH) {
    return { error: "Choose one or more supported market symbols." };
  }

  const entries = raw.split(",");
  if (entries.length > liveMarketSymbols.length) {
    return { error: `A maximum of ${liveMarketSymbols.length} market symbols is supported.` };
  }

  const normalized = entries.map((symbol) => symbol.trim().toUpperCase());
  if (normalized.some((symbol) => !/^[A-Z0-9]{2,12}$/.test(symbol) || !allowedSymbols.has(symbol))) {
    return { error: "One or more market symbols are not supported." };
  }

  const selected = new Set(normalized);
  return { symbols: liveMarketSymbols.filter((symbol) => selected.has(symbol)) };
}

function projectValues<T>(values: Record<string, T>, symbols: string[]) {
  const projected: Record<string, T> = {};
  symbols.forEach((symbol) => {
    const value = values[symbol];
    if (value !== undefined) projected[symbol] = value;
  });
  return projected;
}

function projectSnapshot(snapshot: PriceSnapshot, symbols: string[]): PriceSnapshot {
  return {
    prices: projectValues(snapshot.prices, symbols),
    changes: projectValues(snapshot.changes, symbols),
    changes1h: projectValues(snapshot.changes1h, symbols),
    changes7d: projectValues(snapshot.changes7d, symbols),
    images: projectValues(snapshot.images, symbols),
    marketCaps: projectValues(snapshot.marketCaps, symbols),
    volumes24h: projectValues(snapshot.volumes24h, symbols),
    updatedAt: snapshot.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = consumeRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many price requests. Try again shortly." },
      {
        status: 429,
        headers: {
          ...responseHeaders(rateLimit, "no-store"),
          "Retry-After": String(rateLimit.retryAfter),
        },
      },
    );
  }

  const parsed = requestedSymbols(request);
  if ("error" in parsed) {
    return NextResponse.json(
      { error: parsed.error },
      { status: 400, headers: responseHeaders(rateLimit, "no-store") },
    );
  }

  try {
    const clientApiKey = request.headers.get("x-larpz-market-api-key")?.trim().slice(0, 180);
    // A single canonical upstream symbol set prevents query permutations and
    // subsets from churning the provider cache or consuming extra quota.
    const snapshot = await fetchCryptoPrices(liveMarketSymbols, clientApiKey || undefined);
    return NextResponse.json(projectSnapshot(snapshot, parsed.symbols), {
      status: 200,
      headers: responseHeaders(rateLimit, "private, max-age=30, stale-while-revalidate=30"),
    });
  } catch {
    return NextResponse.json(
      {
        prices: {},
        changes: {},
        changes1h: {},
        changes7d: {},
        images: {},
        marketCaps: {},
        volumes24h: {},
        updatedAt: new Date().toISOString(),
        error: "Unable to fetch live display prices. Fallback prices remain active.",
      },
      { status: 503, headers: responseHeaders(rateLimit, "no-store") },
    );
  }
}
