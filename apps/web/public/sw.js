// FieldMate AI — Service Worker Offline Application Shell
// Version: fieldmate-shell-v1.0.0

const CACHE_NAME = 'fieldmate-shell-v2';

// Static application shell assets required for offline rendering
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

// Install Event: Pre-cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(() => {
        // Activate worker immediately without waiting for reload
        return self.skipWaiting();
      })
      .catch((err) => {
        console.warn('[SW] Pre-caching shell failed:', err);
      }),
  );
});

// Activate Event: Purge old cache versions to ensure fresh assets
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter(
              (key) => key.startsWith('fieldmate-shell-') && key !== CACHE_NAME,
            )
            .map((oldKey) => {
              return caches.delete(oldKey);
            }),
        );
      })
      .then(() => {
        return self.clients.claim();
      }),
  );
});

// Fetch Event: Resilience strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. NEVER intercept or cache mutations (POST, PUT, PATCH, DELETE)
  // Security Constraint: Maintenance mutations & safety confirmations must NEVER auto-replay.
  if (req.method !== 'GET') {
    return;
  }

  // Only public, same-origin shell assets may persist across sessions.
  // API and authentication data always use the network, including /api/v1/auth/me.
  if (
    url.origin !== self.location.origin ||
    (!APP_SHELL_ASSETS.includes(url.pathname) &&
      !url.pathname.startsWith('/assets/'))
  ) {
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    }
    return;
  }

  // 4. Static assets & Shell Navigation: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, clone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and navigating to a page, return cached index.html shell
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return cached;
        });

      return cached || fetchPromise;
    }),
  );
});
