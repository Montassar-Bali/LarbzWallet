import type { NextConfig } from "next";
import withPWAInit from "next-pwa";
import defaultRuntimeCaching from "next-pwa/cache";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: /\/api\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "GET",
    },
    {
      urlPattern: /\/api\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "POST",
    },
    {
      urlPattern: /\/api\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "PUT",
    },
    {
      urlPattern: /\/api\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "PATCH",
    },
    {
      urlPattern: /\/api\/admin(?:\/.*)?(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "DELETE",
    },
    {
      urlPattern: /\/api\/ondo-markets(?:\?.*)?$/i,
      handler: "NetworkOnly",
      method: "GET",
    },
    ...defaultRuntimeCaching,
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const adminHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    return [
      { source: "/admin/:path*", headers: adminHeaders },
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

export default withPWA(nextConfig);
