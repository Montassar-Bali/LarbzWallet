const SENSITIVE_ROUTE_PREFIXES = [
  "/admin",
  "/api",
  "/activate",
  "/login",
  "/register",
] as const;

const STATIC_ROUTE_PREFIXES = [
  "/_next/static/",
  "/assets/",
  "/avatars/",
  "/icons/",
  "/images/",
  "/manifests/",
] as const;

const STATIC_FILE_PATTERN = /\.(?:css|gif|ico|jpe?g|js|png|svg|webmanifest|webp|woff2?)$/i;

const LEGACY_PWA_CACHE_NAMES = new Set([
  "apis",
  "cross-origin",
  "google-fonts-stylesheets",
  "google-fonts-webfonts",
  "next-data",
  "next-image",
  "others",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "static-audio-assets",
  "static-data-assets",
  "static-font-assets",
  "static-image-assets",
  "static-js-assets",
  "static-style-assets",
  "static-video-assets",
]);

function normalizePathname(pathname: string) {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").toLowerCase();
}

export function isPwaSensitivePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return SENSITIVE_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function isPwaStaticAssetPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (isPwaSensitivePath(normalized) || normalized === "/sw.js") return false;

  return (
    STATIC_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    STATIC_FILE_PATTERN.test(normalized)
  );
}

export function isLegacyPwaCacheName(cacheName: string) {
  return cacheName.startsWith("workbox-") || LEGACY_PWA_CACHE_NAMES.has(cacheName);
}
