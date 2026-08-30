import { describe, expect, it } from "vitest";

import { licenseIdentityId } from "@/lib/auth";

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
});
