/**
 * Sakura PWA Service Worker
 *
 * Strategy:
 *  - install: precache the app shell
 *  - activate: delete any caches not named CACHE_NAME (old versions)
 *  - fetch: skip /api/ routes (always network); for everything else use
 *           cache-first with a network fallback and cache the fresh response
 */

// Cache name. The placeholder string assigned to CACHE_NAME below is
// replaced at dev-serve and production-build time by the
// `inject-sw-build-id` Vite plugin (vite.config.ts) with
// `sakura-<package.json version>-<timestamp>`. If the plugin does not run,
// the literal survives — the SW still works, just with a fixed cache name
// (i.e. the original stale-cache regression).
const CACHE_NAME = "sakura-0.1.0-1777508057062";

/** Files to precache on install (app shell). */
const PRECACHE_URLS = ['/', '/index.html'];

// ---------------------------------------------------------------------------
// Install — precache app shell
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  console.info('[SW] installing cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old SW to be released
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — purge stale caches from previous versions
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  console.info('[SW] activated cache:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const stale = cacheNames.filter((name) => name !== CACHE_NAME);
      if (stale.length > 0) {
        console.info('[SW] purging stale caches:', stale);
      }
      return Promise.all(stale.map((name) => caches.delete(name)));
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — cache-first for static assets, network-only for API calls
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go to network for API routes — never serve stale data
  if (url.pathname.startsWith('/api/')) {
    return; // let browser handle it normally
  }

  // Cache-first strategy for everything else
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        return cached;
      }

      // Not in cache — fetch from network and cache the response
      try {
        const networkResponse = await fetch(request);
        // Only cache valid, non-opaque GET responses
        if (
          networkResponse.ok &&
          request.method === 'GET' &&
          networkResponse.type !== 'opaque'
        ) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        // Network unavailable and nothing cached — nothing we can do
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })
  );
});
