// Calibrall Service Worker
// Version: 1.0.8
// Brand: Every call, on record.

const CACHE_VERSION = 'calibrall-v1.0.8';
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

// 1. Install lifecycle: precache the core app shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Precache asset fetch failure:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate lifecycle: clean up stale cache versions & auto-unregister in dev
self.addEventListener('activate', (event) => {
  const isDev =
    self.location.hostname.includes('ais-dev') ||
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname === '0.0.0.0';

  if (isDev) {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
    return;
  }

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

// 3. User-controlled update & logout cache purge
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_USER_CACHES') {
    event.waitUntil(
      Promise.all([
        caches.delete(DATA_CACHE_NAME),
        caches.delete(STATIC_CACHE_NAME),
      ])
    );
  }
});

// 4. Fetch routing
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // In development, preview (ais-dev), or local environments, never intercept requests
  if (
    self.location.hostname.includes('ais-dev') ||
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname === '0.0.0.0'
  ) {
    return;
  }

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Ignore browser extensions and non-http(s) schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Never intercept React Server Component requests, prefetch, or router transitions
  if (
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree') ||
    request.headers.get('Next-Router-Prefetch') ||
    url.searchParams.has('_rsc')
  ) {
    return;
  }

  // Never cache auth endpoints, account endpoints, revalidate endpoint, payment flows, or mutations
  if (
    url.pathname.includes('/auth') ||
    url.pathname.includes('/api/auth') ||
    url.pathname.includes('/api/account') ||
    url.pathname.includes('/api/admin') ||
    url.pathname.includes('/api/revalidate') ||
    url.pathname.includes('/login') ||
    url.pathname.includes('/signup') ||
    url.pathname.includes('/forgot-password') ||
    url.pathname.includes('/reset-password') ||
    url.pathname.includes('/payment') ||
    url.pathname.includes('/stripe') ||
    url.hostname.includes('supabase.co')
  ) {
    return; // Pass through to network-only
  }

  // API and data requests (fixtures, odds, probabilities, EV, track record)
  // Policy: Network-first with 15s timeout.
  // Only report "Offline" when self.navigator.onLine === false.
  // When server returns 5xx or times out while online, return saved copy (with X-Calibrall-Saved-Copy: true)
  // or return the real HTTP status and reason (e.g. "server timeout (504)").
  if (url.pathname.startsWith('/api/v1/')) {
    event.respondWith(
      (async () => {
        const isBrowserOffline = () =>
          typeof self.navigator !== 'undefined' && self.navigator.onLine === false;

        const buildFailureMeta = (status, err, rawBodyReason) => {
          if (isBrowserOffline()) {
            return {
              httpStatus: 503,
              isOffline: true,
              errorTitle: 'Offline',
              reason: 'Offline',
              message: 'Browser is offline and no saved copy exists.',
            };
          }

          if (status === 504 || (err && (err.name === 'AbortError' || err.message === 'Network timeout'))) {
            const detail = rawBodyReason ? `server timeout (504): ${rawBodyReason}` : 'server timeout (504)';
            return {
              httpStatus: 504,
              isOffline: false,
              errorTitle: detail,
              reason: detail,
              message: detail,
            };
          }

          if (typeof status === 'number' && status >= 500) {
            const detail = rawBodyReason ? `server error (${status}): ${rawBodyReason}` : `server error (${status})`;
            return {
              httpStatus: status,
              isOffline: false,
              errorTitle: detail,
              reason: detail,
              message: detail,
            };
          }

          const errMsg = err && err.message ? err.message : 'connection failed';
          const detail = `server unreachable (${errMsg})`;
          return {
            httpStatus: 502,
            isOffline: false,
            errorTitle: detail,
            reason: detail,
            message: detail,
          };
        };

        const serveSavedCopyOrError = async (failureMeta, originalResponse) => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            const headers = new Headers(cachedResponse.headers);
            headers.set('X-Calibrall-Cached', 'true');
            headers.set('X-Calibrall-Saved-Copy', 'true');
            headers.set('X-Calibrall-Cached-Time', new Date().toISOString());
            headers.set('X-Calibrall-Server-Status', String(failureMeta.httpStatus));
            headers.set('X-Calibrall-Server-Error', failureMeta.reason);
            headers.set('X-Calibrall-Offline', failureMeta.isOffline ? 'true' : 'false');

            return new Response(await cachedResponse.blob(), {
              status: cachedResponse.status,
              statusText: cachedResponse.statusText,
              headers,
            });
          }

          if (originalResponse) {
            const contentType = originalResponse.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              return originalResponse;
            }
          }

          return new Response(
            JSON.stringify({
              error: failureMeta.errorTitle,
              reason: failureMeta.reason,
              message: failureMeta.message,
              serverStatus: failureMeta.httpStatus,
              isOffline: failureMeta.isOffline,
            }),
            {
              status: failureMeta.httpStatus,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const networkResponse = await fetch(request, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (networkResponse && (networkResponse.status === 401 || networkResponse.status === 403)) {
            await caches.delete(DATA_CACHE_NAME).catch(() => {});
            return networkResponse;
          }

          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DATA_CACHE_NAME);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }

          if (networkResponse && networkResponse.status >= 500) {
            let bodyReason = '';
            try {
              const cloned = networkResponse.clone();
              const ct = cloned.headers.get('content-type') || '';
              if (ct.includes('application/json')) {
                const parsed = await cloned.json();
                bodyReason = parsed?.reason || parsed?.error || '';
              }
            } catch (_) {}
            const meta = buildFailureMeta(networkResponse.status, null, bodyReason);
            return await serveSavedCopyOrError(meta, networkResponse);
          }

          return networkResponse;
        } catch (err) {
          clearTimeout(timeoutId);
          const meta = buildFailureMeta(null, err, '');
          return await serveSavedCopyOrError(meta, null);
        }
      })()
    );
    return;
  }

  // Navigation requests (HTML pages)
  // Policy: Network-first; only cache public non-personalized routes so signed-in pages never bleed across users.
  if (request.mode === 'navigate') {
    const publicCacheable = ['/', '/about', '/terms', '/privacy', '/offline'].includes(url.pathname);
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (publicCacheable && networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          if (publicCacheable) {
            const cachedPage = await caches.match(request);
            if (cachedPage) {
              return cachedPage;
            }
          }
          const isBrowserOffline = typeof self.navigator !== 'undefined' && self.navigator.onLine === false;
          if (isBrowserOffline) {
            const offlinePage = await caches.match('/offline');
            return offlinePage || new Response('Offline', { status: 503 });
          }
          return new Response('Server unavailable (502)', { status: 502 });
        }
      })()
    );
    return;
  }

  // Bypass hot-reload, webpack chunks, and development-only requests
  if (
    url.pathname.includes('webpack') ||
    url.pathname.includes('hot-update') ||
    url.pathname.includes('_next/webpack-hmr')
  ) {
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
        if (cached) {
          const contentType = cached.headers.get('content-type') || '';
          // Discard corrupted cached responses (e.g. HTML served for JS)
          if (url.pathname.endsWith('.js') && contentType.includes('text/html')) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.delete(request).catch(() => {});
          } else {
            return cached;
          }
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const contentType = networkResponse.headers.get('content-type') || '';
            // Only cache valid assets that are not HTML error pages
            if (!contentType.includes('text/html') || !url.pathname.endsWith('.js')) {
              const cache = await caches.open(STATIC_CACHE_NAME);
              cache.put(request, networkResponse.clone());
              trimCache(STATIC_CACHE_NAME, MAX_IMAGE_ENTRIES);
            }
          }
          return networkResponse;
        } catch (err) {
          if (cached) return cached;
          // Do not synthesize empty 404 for scripts/chunks: let network failure bubble
          // so webpack runtime knows it was a connection issue rather than a missing module
          throw err;
        }
      })()
    );
    return;
  }
});
