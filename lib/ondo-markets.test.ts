import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getOndoMarkets } from "@/app/api/ondo-markets/route";
import {
  fetchOndoMarkets,
  resetOndoMarketsCacheForTests,
} from "@/lib/ondo-markets";

const MARKET_URL = "https://api.gm.ondo.finance/v1/assets/all/market";
const METADATA_URL = "https://api.gm.ondo.finance/v1/assets/all/metadata";
const BLOCKDAEMON_TOKENS_URL = "https://svc.blockdaemon.com/pricing/v1/allowed_tokens/eip155:1";
const BLOCKDAEMON_QUOTES_URL = "https://svc.blockdaemon.com/pricing/v1/quotes/eip155:1";
const ETHEREUM_ONDO_ADDRESS = "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3";
const TEST_API_KEY = "ondo_test_key_not_a_secret";
const TEST_BLOCKDAEMON_API_KEY = "blockdaemon_test_key_not_a_secret";

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

function successfulBlockdaemonTokensPayload() {
  return {
    data: [
      {
        address: ETHEREUM_ONDO_ADDRESS.toLowerCase(),
        name: "Ondo",
        symbol: "ONDO",
        decimals: 18,
      },
    ],
  };
}

function successfulBlockdaemonQuotePayload() {
  return {
    data: [
      {
        address: ETHEREUM_ONDO_ADDRESS.toLowerCase(),
        quotes: [{ currency: "USD", value: "0.7421" }],
      },
    ],
  };
}

describe("Ondo Global Markets server adapter", () => {
  const originalApiKey = process.env.ONDO_API_KEY;
  const originalBlockdaemonApiKey = process.env.BLOCKDAEMON_API_KEY;

  beforeEach(() => {
    resetOndoMarketsCacheForTests();
    process.env.ONDO_API_KEY = TEST_API_KEY;
    delete process.env.BLOCKDAEMON_API_KEY;
  });

  afterEach(() => {
    resetOndoMarketsCacheForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.ONDO_API_KEY;
    else process.env.ONDO_API_KEY = originalApiKey;
    if (originalBlockdaemonApiKey === undefined) delete process.env.BLOCKDAEMON_API_KEY;
    else process.env.BLOCKDAEMON_API_KEY = originalBlockdaemonApiKey;
  });

  it("keeps an absent API key server-side and returns a safe unconfigured response", async () => {
    delete process.env.ONDO_API_KEY;
    delete process.env.BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      provider: null,
      source: null,
      status: "unconfigured",
      configured: false,
      error: "Ondo market data is not configured.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a non-cacheable service error when the API key is missing", async () => {
    delete process.env.ONDO_API_KEY;
    delete process.env.BLOCKDAEMON_API_KEY;

    const response = await getOndoMarkets();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(payload).toMatchObject({ status: "unconfigured", configured: false });
  });

  it("reports rejected credentials without exposing the configured key", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: "Forbidden" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getOndoMarkets();
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      assets: [],
      provider: "ondo",
      source: "Ondo Global Markets",
      status: "unauthorized",
      configured: true,
      error: "Ondo rejected the configured API key.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(payload)).not.toContain(TEST_API_KEY);
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
      provider: "ondo",
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

  it("prefers the official Ondo provider when both provider keys are configured", async () => {
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input) === MARKET_URL
        ? jsonResponse(successfulMarketPayload())
        : jsonResponse(successfulMetadataPayload()),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      provider: "ondo",
      source: "Ondo Global Markets",
      status: "live",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([input]) => String(input).startsWith("https://api.gm.ondo.finance/"))).toBe(true);
  });

  it("uses Blockdaemon to capability-check and price only the verified Ethereum ONDO token", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const [input] = args;
      const url = String(input);
      if (url.startsWith(BLOCKDAEMON_TOKENS_URL)) {
        return jsonResponse(successfulBlockdaemonTokensPayload());
      }
      if (url === BLOCKDAEMON_QUOTES_URL) {
        return jsonResponse(successfulBlockdaemonQuotePayload());
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      provider: "blockdaemon",
      source: "Blockdaemon Token Price API",
      status: "partial",
      configured: true,
      error: "Blockdaemon provides current Ethereum ONDO pricing only.",
    });
    expect(snapshot.assets).toEqual([
      {
        id: "blockdaemon-ondo-ethereum",
        name: "Ondo",
        symbol: "ONDO",
        price: 0.7421,
        balance: 0,
        change24h: 0,
        image: "",
        updatedAt: snapshot.updatedAt,
        tradableSessions: [],
        priceHistory24h: [],
        addresses: [
          {
            networkChainId: "ethereum-1",
            address: ETHEREUM_ONDO_ADDRESS,
            decimals: 18,
          },
        ],
      },
    ]);
    expect(snapshot.assets[0]).not.toHaveProperty("marketCap");
    expect(snapshot.assets[0]).not.toHaveProperty("volume24h");
    expect(snapshot.assets[0]).not.toHaveProperty("totalHolders");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [capabilityUrl, capabilityInit] = fetchMock.mock.calls[0];
    expect(String(capabilityUrl)).toContain(`addresses=${ETHEREUM_ONDO_ADDRESS}`);
    expect(capabilityInit).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-API-Key": TEST_BLOCKDAEMON_API_KEY,
      },
    });
    const [quoteUrl, quoteInit] = fetchMock.mock.calls[1];
    expect(String(quoteUrl)).toBe(BLOCKDAEMON_QUOTES_URL);
    expect(quoteInit).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": TEST_BLOCKDAEMON_API_KEY,
      },
    });
    expect(JSON.parse(String(quoteInit?.body))).toEqual({
      addresses: [ETHEREUM_ONDO_ADDRESS],
      units: ["USD"],
    });
    expect(JSON.stringify(snapshot)).not.toContain(TEST_BLOCKDAEMON_API_KEY);
  });

  it("reports an unsupported Blockdaemon token capability without requesting a quote", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      provider: "blockdaemon",
      source: "Blockdaemon Token Price API",
      status: "unavailable",
      configured: true,
      error: "Blockdaemon does not currently support pricing for the Ethereum ONDO token.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports rejected Blockdaemon credentials without exposing the configured key", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async () => jsonResponse({ title: "Invalid Token" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getOndoMarkets();
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      assets: [],
      provider: "blockdaemon",
      source: "Blockdaemon Token Price API",
      status: "unauthorized",
      configured: true,
      error: "Blockdaemon rejected the configured API key.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain(TEST_BLOCKDAEMON_API_KEY);
  });

  it("does not manufacture an ONDO asset when Blockdaemon omits a usable USD quote", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith(BLOCKDAEMON_TOKENS_URL)
        ? jsonResponse(successfulBlockdaemonTokensPayload())
        : jsonResponse({ data: [{ address: ETHEREUM_ONDO_ADDRESS, quotes: [] }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      provider: "blockdaemon",
      status: "unavailable",
      error: "Blockdaemon returned no usable USD price for the Ethereum ONDO token.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected Blockdaemon quote as an authentication failure", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).startsWith(BLOCKDAEMON_TOKENS_URL)
        ? jsonResponse(successfulBlockdaemonTokensPayload())
        : jsonResponse({ title: "Invalid Token" }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchOndoMarkets();

    expect(snapshot).toMatchObject({
      assets: [],
      provider: "blockdaemon",
      source: "Blockdaemon Token Price API",
      status: "unauthorized",
      configured: true,
      error: "Blockdaemon rejected the configured API key.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(snapshot)).not.toContain(TEST_BLOCKDAEMON_API_KEY);
  });

  it("returns the last Blockdaemon quote as stale when its capability refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_BLOCKDAEMON_API_KEY;
    let capabilityShouldFail = false;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(BLOCKDAEMON_TOKENS_URL)) {
        return capabilityShouldFail
          ? jsonResponse({ type: "unavailable" }, 503)
          : jsonResponse(successfulBlockdaemonTokensPayload());
      }
      return jsonResponse(successfulBlockdaemonQuotePayload());
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchOndoMarkets();
    capabilityShouldFail = true;
    vi.advanceTimersByTime(61_000);
    const stale = await fetchOndoMarkets();

    expect(first.status).toBe("partial");
    expect(stale).toMatchObject({
      assets: first.assets,
      provider: "blockdaemon",
      source: "Blockdaemon Token Price API",
      status: "stale",
      configured: true,
      error: "Live Blockdaemon ONDO pricing is temporarily unavailable.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("isolates provider caches even when both providers use the same key text", async () => {
    delete process.env.ONDO_API_KEY;
    process.env.BLOCKDAEMON_API_KEY = TEST_API_KEY;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(BLOCKDAEMON_TOKENS_URL)) {
        return jsonResponse(successfulBlockdaemonTokensPayload());
      }
      if (url === BLOCKDAEMON_QUOTES_URL) {
        return jsonResponse(successfulBlockdaemonQuotePayload());
      }
      if (url === MARKET_URL) return jsonResponse(successfulMarketPayload());
      if (url === METADATA_URL) return jsonResponse(successfulMetadataPayload());
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const blockdaemonSnapshot = await fetchOndoMarkets();
    process.env.ONDO_API_KEY = TEST_API_KEY;
    const officialSnapshot = await fetchOndoMarkets();

    expect(blockdaemonSnapshot.provider).toBe("blockdaemon");
    expect(officialSnapshot.provider).toBe("ondo");
    expect(officialSnapshot.assets[0]?.symbol).toBe("AAPLon");
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
