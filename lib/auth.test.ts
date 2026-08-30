import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearWalletOwnerIdCookie,
  getWalletOwnerIdFromCookie,
  licenseIdentityId,
  loginWithLicenseKey,
  persistWalletOwnerIdCookie,
} from "@/lib/auth";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function installBrowserGlobals() {
  let cookie = "";
  const document = {} as Document;
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => cookie,
    set: (header: string) => {
      const [pair] = header.split(";");
      const [name, value] = pair.split("=");
      const entries = new Map(cookie.split(";").filter(Boolean).map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator).trim(), part.slice(separator + 1)];
      }));
      if (header.includes("Max-Age=0")) entries.delete(name);
      else entries.set(name, value);
      cookie = [...entries].map(([key, entry]) => `${key}=${entry}`).join("; ");
    },
  });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {
    location: { protocol: "https:" },
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("activation-key wallet identity", () => {
  it("creates the same private owner fingerprint for equivalent key formatting", async () => {
    await expect(licenseIdentityId("DEMO-STAR-0001-2026"))
      .resolves.toBe(await licenseIdentityId("demo star 0001 2026"));
  });

  it("keeps different activation keys in different wallet ledgers", async () => {
    const first = await licenseIdentityId("DEMO-STAR-0001-2026");
    const second = await licenseIdentityId("DEMO-STAR-0002-2026");
    expect(first).toMatch(/^lic_[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
  });

  it("persists only the derived user ID in the shared owner cookie", async () => {
    installBrowserGlobals();
    const rawKey = "DEMO-STAR-0001-2026";
    const user = await loginWithLicenseKey(rawKey);

    expect(getWalletOwnerIdFromCookie()).toBe(user.id);
    expect(document.cookie).not.toContain(rawKey);
  });

  it("rejects unsafe cookie values and clears the shared owner cookie", () => {
    installBrowserGlobals();
    persistWalletOwnerIdCookie("lic_safe-owner_123");
    expect(getWalletOwnerIdFromCookie()).toBe("lic_safe-owner_123");

    document.cookie = "larpz_wallet_owner_id=../../unsafe; Path=/";
    expect(getWalletOwnerIdFromCookie()).toBeNull();

    clearWalletOwnerIdCookie();
    expect(getWalletOwnerIdFromCookie()).toBeNull();
  });
});
