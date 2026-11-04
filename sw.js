/* ══════════════════════════════════════════════════════════
   Tipoff Fantasy: Service Worker
   Cache-first for static assets, network-first for data
══════════════════════════════════════════════════════════ */

/*  ── BUMP THIS ON EVERY SHIPPED CHANGE ──────────────────────
    The fetch handler below is cache-first with NO revalidation:
    `if (cached) return cached;`. So once a file is in the cache under
    this name, that copy is served forever — reloading does not help,
    and neither does a hard reload on iOS standalone.

    CACHE_NAME is therefore the only thing that delivers new code. Push
    a fix without changing it and users keep running the old build with
    no error, no warning, and no way to tell. If you change any file in
    STATIC_ASSETS, change this line in the same commit.             */
const CACHE_NAME = 'tipoff-v202';
const STATIC_ASSETS = [
  './',
  './index.html',
  './src/styles.css',
  './src/app.js',
  './src/analytics.js',
  './data/bracket.js',
  './data/players.js',
  './data/conference-players.js',
  './src/season/season.js',
  './src/season/season.css',
  './logo-icon.png',
  './logo-wordmark.png',
  './favicon.ico',
  './favicon-16.png',
  './favicon-32.png',
  './favicon-48.png',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  //  MUST match the <link> in index.html exactly. It did not: this
  //  still asked for Bebas Neue after the app moved to Barlow
  //  Condensed + JetBrains Mono, so install downloaded a stylesheet
  //  nothing uses and the real one was never precached — a first load
  //  with no connection rendered without the display font.
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap'
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
