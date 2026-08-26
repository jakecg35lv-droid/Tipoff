/* ══════════════════════════════════════════════════════════
   Tipoff Fantasy: Service Worker
   Cache-first for static assets, network-first for data
══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'tipoff-v112';
const STATIC_ASSETS = [
  './',
  './index.html',
  './src/styles.css',
  './src/app.js',
  './data/bracket.js',
  './data/players.js',
  './logo-icon.png',
  './logo-wordmark.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Bebas+Neue&display=swap'
];

// ── INSTALL: cache all static assets ─────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── NOTIFICATION CLICK: focus or open the app ────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus an existing open tab
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'OTC_FOCUS_DRAFT' });
          return client.focus();
        }
      }
      // No open tab, opening a new one
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

// ── FETCH: cache-first for same-origin, network for rest ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET, chrome-extension, and analytics
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // ESPN logos - no longer used, but keep passthrough for safety
  if (url.hostname.includes('espncdn.com')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname.includes('fonts.g')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }))
    );
    return;
  }

  // Same-origin assets: cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        });
      })
    );
  }
});
