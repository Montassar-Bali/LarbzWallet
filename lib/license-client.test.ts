import { afterEach, describe, expect, it, vi } from "vitest";

import { saveLicense } from "@/lib/license";
import { activateLicenseWithServer } from "@/lib/license-client";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function useBrowser(hostname: string) {
  vi.stubGlobal("window", {
    localStorage: new MemoryStorage(),
    location: { hostname },
  });
}

function cacheProductionLicense() {
  return saveLicense({
    key: "LIVE-CACH-ED01-2099",
    plan: "pro",
    status: "active",
    expiration: "2099-12-31",
    activatedAt: "2026-09-06T08:00:00.000Z",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-authoritative license activation", () => {
  it("never accepts a cached non-demo key when the server request fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    useBrowser("wallet.example.com");
    cacheProductionLicense();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(activateLicenseWithServer("LIVE-CACH-ED01-2099"))
      .rejects.toThrow("The license activation service is unavailable. Please try again.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([404, 503])(
    "never accepts a cached non-demo key after an HTTP %s response",
    async (status) => {
      vi.stubEnv("NODE_ENV", "production");
      useBrowser("wallet.example.com");
      cacheProductionLicense();
      const fetchMock = vi.fn().mockResolvedValue(new Response(
        JSON.stringify({ error: `Server rejected cached key (${status}).` }),
        {
          status,
          statusText: status === 404 ? "Not Found" : "Service Unavailable",
          headers: { "Content-Type": "application/json" },
        },
      ));
      vi.stubGlobal("fetch", fetchMock);

      await expect(activateLicenseWithServer("LIVE-CACH-ED01-2099"))
        .rejects.toThrow(`Server rejected cached key (${status}).`);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

describe("local demo license boundary", () => {
  it("allows a seeded DEMO key in a non-production build", async () => {
    vi.stubEnv("NODE_ENV", "test");
    useBrowser("wallet.example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(activateLicenseWithServer("DEMO-STAR-6FB3-2028"))
      .resolves.toMatchObject({ key: "DEMO-STAR-6FB3-2028", plan: "starter" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a seeded DEMO key on localhost in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    useBrowser("localhost");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(activateLicenseWithServer("DEMO-STAR-6FB3-2028"))
      .resolves.toMatchObject({ key: "DEMO-STAR-6FB3-2028", plan: "starter" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not bypass the server for a DEMO key on a deployed production host", async () => {
    vi.stubEnv("NODE_ENV", "production");
    useBrowser("wallet.example.com");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(activateLicenseWithServer("DEMO-STAR-6FB3-2028"))
      .rejects.toThrow("The license activation service is unavailable. Please try again.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
