/* Atlas service worker — offline app shell + runtime asset cache.
 * Strategy:
 *   - navigations: network-first, fall back to the cached shell when offline
 *   - same-origin static assets: stale-while-revalidate
 *   - /api, map tiles and other cross-origin requests: always network (never cached)
 * Bump CACHE to invalidate old assets on deploy.
 */
const CACHE = "atlas-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/pwa-icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache API responses (live data must stay fresh).
  if (url.pathname.startsWith("/api")) return;

  // App navigations: network-first, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put("/", res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // Cross-origin (fonts, map tiles, images): let the network handle it.
});
