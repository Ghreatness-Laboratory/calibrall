// Calibrall Service Worker
// Version: 1.0.0
// Brand: Every call, on record.

const CACHE_VERSION = 'calibrall-v1.0.1';
const PRECACHE_NAME = `calibrall-precache-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `calibrall-static-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `calibrall-data-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-512x512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon.ico',
  '/assets/aistudio/calibrall-profile-light_3415fbe5.png',
  '/assets/aistudio/calibrall-logo-dark_efdad7d9.png'
];

const MAX_IMAGE_ENTRIES = 100;

// Helper to limit cache size
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      trimCache(cacheName, maxItems);
    }
  } catch (err) {
    // Non-fatal cache trim error
  }
}

// 1. Install lifecycle: precache the core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache asset fetch failure:', err);
      });
    })
  );
});

// 2. Activate lifecycle: clean up stale cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (
            key !== PRECACHE_NAME &&
            key !== STATIC_CACHE_NAME &&
            key !== DATA_CACHE_NAME
          ) {
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. User-controlled update: message listener for skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch routing
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignore browser extensions and non-http(s) schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Never cache auth endpoints, supabase/auth requests, payment flows, or mutations
  if (
    url.pathname.includes('/auth') ||
    url.pathname.includes('/api/auth') ||
    url.pathname.includes('/payment') ||
    url.pathname.includes('/stripe') ||
    url.hostname.includes('supabase.co')
  ) {
    return; // Pass through to network-only
  }

  // API and data requests (fixtures, odds, probabilities, EV, track record)
  // Policy: Network-first with short timeout (2.5s).
  // If offline/network fails, fallback to cached data with header indicating cache.
  // NEVER serve stale data as current.
  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(
      (async () => {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), 2500)
          );
          const networkResponse = await Promise.race([
            fetch(request),
            timeoutPromise,
          ]);

          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DATA_CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          return networkResponse;
        } catch (err) {
          // Network failed or timed out: check if cache has entry
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            // Inject header to notify client that this response is from cache
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-Calibrall-Cached', 'true');
            headers.set('X-Calibrall-Cached-Time', new Date().toISOString());

            return new Response(await cachedResponse.blob(), {
              status: cachedResponse.status,
              statusText: cachedResponse.statusText,
              headers,
            });
          }

          // Return JSON response indicating offline status
          return new Response(
            JSON.stringify({
              error: 'Offline',
              message: 'Live network unavailable and no cached data exists.',
              isOffline: true,
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      })()
    );
    return;
  }

  // Navigation requests (HTML pages)
  // Policy: Network-first with fallback to cached page, then /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
          return networkResponse;
        } catch (err) {
          // If network failed, check cache for the navigated page
          const cachedPage = await caches.match(request);
          if (cachedPage) {
            return cachedPage;
          }
          // Otherwise fall back to the offline app shell
          const offlinePage = await caches.match('/offline');
          return offlinePage || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets (Next.js chunks, fonts, images, club crests, icons)
  // Policy: Stale-While-Revalidate with caching
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.hostname.includes('crests.football-data.org') ||
    url.hostname.includes('api-sports.io');

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const fetchPromise = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(STATIC_CACHE_NAME);
              cache.put(request, networkResponse.clone());
              trimCache(STATIC_CACHE_NAME, MAX_IMAGE_ENTRIES);
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })()
    );
    return;
  }
});
