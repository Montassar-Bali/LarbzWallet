import { describe, expect, it } from "vitest";

import {
  isLegacyPwaCacheName,
  isPwaSensitivePath,
  isPwaStaticAssetPath,
} from "./pwa-cache-policy";

describe("PWA cache policy", () => {
  it.each([
    "/admin",
    "/admin/licenses",
    "/api/prices",
    "/api/admin/session",
    "/api/licenses/activate",
    "/api/wallet-security/session",
    "/activate",
    "/login",
    "/register",
  ])("keeps sensitive route %s network-only", (pathname) => {
    expect(isPwaSensitivePath(pathname)).toBe(true);
    expect(isPwaStaticAssetPath(pathname)).toBe(false);
  });

  it("matches route boundaries instead of similar public names", () => {
    expect(isPwaSensitivePath("/administrator-guide")).toBe(false);
    expect(isPwaSensitivePath("/apiary")).toBe(false);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/icons/icon-192.png",
    "/assets/logo.png",
    "/manifests/trust.webmanifest",
    "/styles.css",
  ])("allows static asset %s to use the runtime cache", (pathname) => {
    expect(isPwaStaticAssetPath(pathname)).toBe(true);
  });

  it("never runtime-caches the service worker itself", () => {
    expect(isPwaStaticAssetPath("/sw.js")).toBe(false);
  });

  it.each(["workbox-precache-v2-origin", "apis", "pages", "others"])(
    "removes legacy next-pwa cache %s during migration",
    (cacheName) => {
      expect(isLegacyPwaCacheName(cacheName)).toBe(true);
    },
  );

  it.each(["larpz-next-static-v1", "larpz-static-assets-v1", "serwist-precache-v2-origin"])(
    "preserves current Serwist cache %s",
    (cacheName) => {
      expect(isLegacyPwaCacheName(cacheName)).toBe(false);
    },
  );
});
