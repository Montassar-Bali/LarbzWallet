import { NextRequest, NextResponse } from "next/server";

import { coingeckoMap } from "@/config/tokens";

type ChartPoint = {
  time: number;
  price: number;
};

type CachedChart = {
  expiresAt: number;
  points: ChartPoint[];
};

const periodDays: Record<string, string> = {
  LIVE: "1",
  "1D": "1",
  "1W": "7",
  "1M": "30",
  "1Y": "365",
  ALL: "max",
};

const chartCache = new Map<string, CachedChart>();

function isChartTuple(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && Number.isFinite(value[0]) && typeof value[1] === "number" && Number.isFinite(value[1]);
}

function downsample(points: ChartPoint[], maximum = 180) {
  if (points.length <= maximum) return points;
  const sampled: ChartPoint[] = [];
  const step = (points.length - 1) / (maximum - 1);
  for (let index = 0; index < maximum; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "SOL").trim().toUpperCase();
  const period = (request.nextUrl.searchParams.get("period") ?? "LIVE").trim().toUpperCase();
  const coinId = coingeckoMap[symbol];
  const days = periodDays[period];

  if (!coinId || !days) {
    return NextResponse.json({ error: "Unsupported currency or chart period." }, { status: 400 });
  }

  const cacheKey = `${symbol}:${period}`;
  const cached = chartCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ points: cached.points, updatedAt: new Date().toISOString() });
  }

  try {
    const endpoint = new URL(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`);
    endpoint.searchParams.set("vs_currency", "usd");
    endpoint.searchParams.set("days", days);
    endpoint.searchParams.set("precision", "full");

    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.COINGECKO_API_KEY;
    if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

    const response = await fetch(endpoint, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Market chart request failed with ${response.status}.`);
    const payload: unknown = await response.json();
    const rawPrices = payload && typeof payload === "object" && "prices" in payload ? (payload as { prices?: unknown }).prices : null;
    if (!Array.isArray(rawPrices)) throw new Error("Market chart response did not contain prices.");

    const points = downsample(rawPrices.filter(isChartTuple).map(([time, price]) => ({ time, price })));
    if (points.length < 2) throw new Error("Market chart response did not contain enough points.");

    chartCache.set(cacheKey, {
      points,
      expiresAt: Date.now() + (period === "LIVE" || period === "1D" ? 30_000 : 5 * 60_000),
    });
    return NextResponse.json({ points, updatedAt: new Date().toISOString() });
  } catch {
    if (cached) return NextResponse.json({ points: cached.points, updatedAt: new Date().toISOString(), stale: true });
    return NextResponse.json({ points: [], updatedAt: new Date().toISOString(), error: "Live chart data is temporarily unavailable." }, { status: 200 });
  }
}
