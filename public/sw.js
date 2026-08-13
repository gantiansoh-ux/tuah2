/* TUAH Service Worker v2 - cache-busted via BUILD_ID (auto-updates on every deploy) */
const CACHE_NAME = "tuah-" + "oXPsMvYTvjDbuRvtKWE82";
const APP_SHELL = [
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];

// Install: pre-cache icons/manifest only (NEVER pre-cache HTML pages - stale HTML causes stale UI)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: delete ALL old caches (any cache not matching current BUILD_ID)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for pages/navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // don't intercept cross-origin

  // API calls: network only (never cache stale scores)
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests: ALWAYS network-first (fresh HTML every time).
  // Fall back to cache only when offline. We no longer cache HTML in APP_SHELL,
  // so the only cached fallback is whatever the user last navigated to.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets: cache-first with network refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
