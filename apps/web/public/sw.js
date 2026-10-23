/* HolyWord web service worker: app-shell precache plus runtime caching. */
const VERSION = "holyword-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL_ROUTES = [
  "/",
  "/read",
  "/search",
  "/study",
  "/library",
  "/settings",
  "/offline",
  "/login",
];
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

async function precacheRoute(cache, route) {
  const response = await fetch(route, { cache: "reload" });
  if (!response.ok) return;
  await cache.put(route, response.clone());
  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    assets.add(match[1]);
  }
  await Promise.all(
    [...assets].map(async (asset) => {
      try {
        const assetResponse = await fetch(asset);
        if (assetResponse.ok) await cache.put(asset, assetResponse);
      } catch {
        // Individual chunk failures should not abort installation.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all([
        ...SHELL_ROUTES.map((route) => precacheRoute(cache, route).catch(() => undefined)),
        ...STATIC_ASSETS.map((asset) =>
          fetch(asset)
            .then((response) => (response.ok ? cache.put(asset, response) : undefined))
            .catch(() => undefined),
        ),
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/offline")) ||
      (await cache.match("/")) ||
      new Response("HolyWord is offline and this page has not been cached yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request));
  }
});

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "holyword-sync" });
}

self.addEventListener("sync", (event) => {
  if (event.tag === "holyword-sync") event.waitUntil(notifyClients());
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "holyword-sync") event.waitUntil(notifyClients());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "REQUEST_SYNC" && "sync" in self.registration) {
    const tag =
      typeof event.data.tag === "string" && event.data.tag ? event.data.tag : "holyword-sync";
    event.waitUntil(self.registration.sync.register(tag).catch(() => undefined));
  }
});
