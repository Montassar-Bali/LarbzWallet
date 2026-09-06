import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { liveMarketSymbols } from "@/config/tokens";
import type { PriceSnapshot } from "@/lib/crypto-prices";

const priceMocks = vi.hoisted(() => ({
  fetchCryptoPrices: vi.fn(),
}));

vi.mock("@/lib/crypto-prices", () => priceMocks);

import { GET } from "@/app/api/prices/route";

function snapshot(symbols = liveMarketSymbols): PriceSnapshot {
  const numericValues = Object.fromEntries(symbols.map((symbol, index) => [symbol, index + 1]));
  return {
    prices: numericValues,
    changes: numericValues,
    changes1h: numericValues,
    changes7d: numericValues,
    images: Object.fromEntries(symbols.map((symbol) => [symbol, `https://example.com/${symbol}.png`])),
    marketCaps: numericValues,
    volumes24h: numericValues,
    updatedAt: "2026-09-06T12:00:00.000Z",
  };
}

function priceRequest(query = "", ip = "198.51.100.1", headers?: Record<string, string>) {
  return new Request(`http://localhost/api/prices${query}`, {
    headers: {
      "x-forwarded-for": ip,
      ...headers,
    },
  });
}

describe("prices API request hardening", () => {
  beforeEach(() => {
    priceMocks.fetchCryptoPrices.mockReset();
    priceMocks.fetchCryptoPrices.mockResolvedValue(snapshot());
  });

  it("normalizes, deduplicates, and projects supported symbols while using one upstream cache shape", async () => {
    const response = await GET(new NextRequest(
      priceRequest("?symbols=sol,BTC,sol", "198.51.100.11", {
        "x-larpz-market-api-key": "  client-market-key  ",
      }),
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=30, stale-while-revalidate=30");
    expect(priceMocks.fetchCryptoPrices).toHaveBeenCalledWith(
      liveMarketSymbols,
      "client-market-key",
    );
    expect(Object.keys(payload.prices)).toEqual(["BTC", "SOL"]);
    expect(Object.keys(payload.images)).toEqual(["BTC", "SOL"]);
  });

  it.each([
    ["an unknown symbol", "?symbols=BTC,NOTREAL"],
    ["an empty list", "?symbols="],
    ["too many entries", `?symbols=${Array(liveMarketSymbols.length + 1).fill("BTC").join(",")}`],
    ["an oversized query", `?symbols=${"A".repeat(257)}`],
  ])("rejects %s before reaching a price provider", async (_label, query) => {
    const response = await GET(new NextRequest(priceRequest(query, `198.51.100.${20 + query.length % 20}`)));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(priceMocks.fetchCryptoPrices).not.toHaveBeenCalled();
  });

  it("limits repeated requests from one client", async () => {
    const request = () => new NextRequest(priceRequest("?symbols=BTC", "198.51.100.99"));

    for (let index = 0; index < 60; index += 1) {
      const response = await GET(request());
      expect(response.status).toBe(200);
    }
    const limited = await GET(request());

    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(priceMocks.fetchCryptoPrices).toHaveBeenCalledTimes(60);
  });

  it("returns a non-cacheable service response when the provider fails", async () => {
    priceMocks.fetchCryptoPrices.mockRejectedValueOnce(new Error("provider credentials"));

    const response = await GET(new NextRequest(priceRequest("?symbols=BTC", "198.51.100.120")));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.error).toBe("Unable to fetch live display prices. Fallback prices remain active.");
    expect(JSON.stringify(payload)).not.toContain("credentials");
  });
});
