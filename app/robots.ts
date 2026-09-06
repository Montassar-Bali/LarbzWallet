import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/activate",
        "/admin",
        "/api",
        "/dashboard",
        "/download-wallet",
        "/ledger-wallet",
        "/trust-wallet",
        "/wallet-launch",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
