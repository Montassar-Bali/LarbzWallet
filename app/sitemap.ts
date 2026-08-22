import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/pricing",
    "/buy",
    "/blog",
    "/privacy",
    "/terms",
    "/login",
    "/register",
    "/activate",
    "/dashboard",
    "/dashboard/portfolio",
    "/dashboard/tokens",
    "/dashboard/activity",
    "/dashboard/settings",
    "/admin",
    "/admin/users",
    "/admin/licenses",
  ];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: route === "" ? 1 : 0.8,
  }));
}
