import { afterEach, describe, expect, it, vi } from "vitest";

import { activateLicense, getLicense, validateLicense } from "@/lib/license";

const newKeys = [
  "DEMO-STAR-6FB3-2028",
  "DEMO-STAR-A703-2028",
  "DEMO-STAR-6F5A-2028",
  "DEMO-STAR-1356-2028",
  "DEMO-STAR-2013-2028",
];

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seeded activation keys", () => {
  it.each(newKeys)("accepts %s as a reusable starter license", (key) => {
    expect(getLicense(key)).toMatchObject({
      key,
      plan: "starter",
      status: "unused",
      expiration: "2028-12-31",
    });
    expect(validateLicense(key)).toMatchObject({ valid: true, status: "unused" });
  });

  it("remains valid when the same key is activated again", () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const key = newKeys[0];

    expect(activateLicense(key).status).toBe("active");
    expect(validateLicense(key)).toMatchObject({ valid: true, status: "active" });
    expect(activateLicense(key).status).toBe("active");
  });
});
