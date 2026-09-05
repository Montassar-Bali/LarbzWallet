import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchOndoMarkets,
  resetOndoMarketsCacheForTests,
} from "@/lib/ondo-markets";

const MARKET_URL = "https://api.gm.ondo.finance/v1/assets/all/market";
const METADATA_URL = "https://api.gm.ondo.finance/v1/assets/all/metadata";
const TEST_API_KEY = "ondo_test_key_not_a_secret";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulMarketPayload() {
  return [
    {
      primaryMarket: {
        symbol: "AAPLon",
        price: "361.986667",
        priceChangePct24h: "2.479993958100564361",
        totalHolders: 7,
        tradableSessions: ["premarket", "regular", "regular", "postmarket"],
        priceHistory24h: Array.from({ length: 120 }, (_, index) => ({
          timestamp: 1_755_802_800_000 + index * 60_000,
          price: String(350 + index / 10),
        })),
      },
      underlyingMarket: {
        ticker: "AAPL",
        name: "Apple Inc.",
        volume: "1851321",
        marketCap: "149925006000",
      },
      timestamp: 1_755_890_061_815,
    },
    {
      primaryMarket: { symbol: "BROKENon", price: "not-a-number" },
      underlyingMarket: { ticker: "BROKEN", name: "Invalid row" },
      timestamp: 1_755_890_061_815,
    },
  ];
}

function successfulMetadataPayload() {
  return [
    {
      symbol: "AAPLon",
      ticker: "AAPL",
      underlyingName: "Apple",
      displayName: "Apple (Ondo Tokenized)",
      coingeckoId: "apple-ondo-tokenized-stock",
      addresses: [
        { networkChainId: "bsc-56", address: "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4", decimals: 18 },
        { networkChainId: "ethereum-1", address: "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c", decimals: 18 },
        { networkChainId: "unknown-1", address: "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c", decimals: 18 },
      ],
      tags: {
        assetClass: "Equities",
        instrumentType: "Stock",
      },
    },
  ];
}

describe("Ondo Global Markets server adapter", () => {
  const originalApiKey = process.env.ONDO_API_KEY;

  beforeEach(() => {
    resetOndoMarketsCacheForTests();
    process.env.ONDO_API_KEY = TEST_API_KEY;
  });

  afterEach(() => {
    resetOndoMarketsCacheForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.ONDO_API_KEY;
    else process.env.ONDO_API_KEY = originalApiKey;
  });

  it("keeps an absent API key server-side and returns a safe unconfigured response", async () => {
    delete process.env.ONDO_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      source: "Ondo Global Markets",
      status: "unconfigured",
      configured: false,
      error: "Ondo market data is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes official market and metadata responses into client-safe assets", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(TEST_API_KEY);
      if (url === MARKET_URL) return jsonResponse(successfulMarketPayload());
      if (url === METADATA_URL) return jsonResponse(successfulMetadataPayload());
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();
    const asset = snapshot.assets[0];

    expect(snapshot).toMatchObject({
      source: "Ondo Global Markets",
      status: "live",
      configured: true,
      updatedAt: "2025-08-22T19:14:21.815Z",
    });
    expect(snapshot.assets).toHaveLength(1);
    expect(asset).toMatchObject({
      id: "ondo-aaplon",
      name: "Apple (Ondo Tokenized)",
      symbol: "AAPLon",
      price: 361.986667,
      balance: 0,
      change24h: 2.4799939581005644,
      image: "",
      marketCap: 149925006000,
      volume24h: 1851321,
      underlyingTicker: "AAPL",
      assetClass: "Equities",
      instrumentType: "Stock",
      totalHolders: 7,
      tradableSessions: ["premarket", "regular", "postmarket"],
      addresses: [
        { networkChainId: "bsc-56", address: "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4", decimals: 18 },
        { networkChainId: "ethereum-1", address: "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c", decimals: 18 },
      ],
    });
    expect(asset.priceHistory24h).toHaveLength(48);
    expect(asset.priceHistory24h[0]).toEqual({
      time: 1_755_802_800_000,
      price: 350,
    });
    expect(asset.priceHistory24h.at(-1)).toEqual({
      time: 1_755_809_940_000,
      price: 361.9,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(snapshot)).not.toContain(TEST_API_KEY);
  });

  it("coalesces repeated reads through the one-minute market cache", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input) === MARKET_URL
        ? jsonResponse(successfulMarketPayload())
        : jsonResponse(successfulMetadataPayload()),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchOndoMarkets();
    const second = await fetchOndoMarkets();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps market rows usable when optional metadata is unavailable", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input) === MARKET_URL
        ? jsonResponse(successfulMarketPayload())
        : jsonResponse({ code: "UPSTREAM_ERROR" }, 503),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot.status).toBe("partial");
    expect(snapshot.error).toBe("Ondo asset metadata is temporarily unavailable.");
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0]).toMatchObject({
      name: "Apple Inc.",
      underlyingTicker: "AAPL",
      addresses: [],
    });
  });

  it("returns the last successful snapshot as stale when a refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    let marketShouldFail = false;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === MARKET_URL && marketShouldFail) {
        return jsonResponse({ code: "UPSTREAM_ERROR" }, 503);
      }
      return url === MARKET_URL
        ? jsonResponse(successfulMarketPayload())
        : jsonResponse(successfulMetadataPayload());
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchOndoMarkets();
    marketShouldFail = true;
    vi.advanceTimersByTime(61_000);
    const stale = await fetchOndoMarkets();

    expect(first.status).toBe("live");
    expect(stale).toMatchObject({
      assets: first.assets,
      status: "stale",
      configured: true,
      error: "Live Ondo market data is temporarily unavailable.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("returns an HTTP-friendly empty snapshot for malformed market data", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input) === MARKET_URL
        ? jsonResponse({ data: { assets: [{ primaryMarket: null }] } })
        : jsonResponse(successfulMetadataPayload()),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      status: "unavailable",
      configured: true,
      error: "Ondo market data is temporarily unavailable.",
    });
  });
});
