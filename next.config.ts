import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

import { isPwaSensitivePath } from "./lib/pwa-cache-policy";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Registration is handled by a guarded client component so browsers that
  // block service workers still get a clean, fully usable online experience.
  register: false,
  scope: "/",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  // Only installation-critical public files are precached. Other static files
  // are cached on demand by app/sw.ts, while pages and APIs remain network-only.
  globPublicPatterns: [
    "manifest.webmanifest",
    "manifests/*.webmanifest",
    "icons/**/*.{png,svg,webp}",
    "assets/logo*.png",
  ],
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.filter((entry) => {
        const pathname = new URL(entry.url, "https://pwa.local").pathname;
        return !isPwaSensitivePath(pathname);
      }),
      warnings: [],
    }),
  ],
});

const globalSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const noStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const serviceWorkerHeaders = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'" },
];

const adminHeaders = [
  ...noStoreHeaders,
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: globalSecurityHeaders },
      { source: "/sw.js", headers: serviceWorkerHeaders },
      { source: "/activate", headers: noStoreHeaders },
      { source: "/login", headers: noStoreHeaders },
      { source: "/register", headers: noStoreHeaders },
      { source: "/admin/:path*", headers: adminHeaders },
      { source: "/api/licenses/:path*", headers: noStoreHeaders },
      { source: "/api/wallet-security/:path*", headers: noStoreHeaders },
      { source: "/api/wallet-ledger", headers: noStoreHeaders },
      { source: "/api/admin/:path*", headers: adminHeaders },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
      },
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default withSerwist(nextConfig);
