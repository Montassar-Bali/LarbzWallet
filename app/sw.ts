/// <reference lib="webworker" />

import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkOnly,
  type PrecacheEntry,
  type RuntimeCaching,
  Serwist,
  type SerwistGlobalConfig,
  StaleWhileRevalidate,
} from "serwist";

import {
  isLegacyPwaCacheName,
  isPwaSensitivePath,
  isPwaStaticAssetPath,
} from "../lib/pwa-cache-policy";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const cacheableResponse = new CacheableResponsePlugin({ statuses: [200] });

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && isPwaSensitivePath(url.pathname),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "larpz-next-static-v1",
      plugins: [
        cacheableResponse,
        new ExpirationPlugin({ maxEntries: 96, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  {
    matcher: ({ sameOrigin, url }) => sameOrigin && isPwaStaticAssetPath(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "larpz-static-assets-v1",
      plugins: [
        cacheableResponse,
        new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter(isLegacyPwaCacheName)
          .map((cacheName) => self.caches.delete(cacheName)),
      ),
    ),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching,
});

serwist.addEventListeners();
