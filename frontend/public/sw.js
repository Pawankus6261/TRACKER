/**
 * Background Location Service Worker for PWA
 * 
 * When installed as a PWA on Android:
 * - Keeps location tracking alive even with screen off
 * - Reconnects WebSocket automatically on wake
 * - Shows persistent notification so Android doesn't kill the process
 * 
 * NOTE: Background Geolocation via SW is supported on:
 *   ✅ Android Chrome (with notification shown)
 *   ✅ Android Samsung Internet
 *   ⚠️  iOS Safari - limited (needs app open in background)
 */

const CACHE_NAME = 'livetracker-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
];

// ── Install: cache shell ────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: claim all clients ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: serve shell from cache, pass API/WS through ──────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept API, WebSocket, or external requests
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ws')
  ) {
    return;
  }

  // Network-first for navigation, cache fallback
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/index.html')
    )
  );
});

// ── Background Sync: reconnect tracking on wake ─────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync') {
    // Notify open tabs to restart tracking
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_SYNC_LOCATION' });
        });
      })
    );
  }
});

// ── Push Notifications: keep alive on Android ───────────────────────────────
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Live Tracker', {
      body: 'Location tracking is active in the background.',
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      tag: 'tracking-active',
      renotify: false,
      silent: true,
    })
  );
});

// ── Message from app: show persistent tracking notification ─────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_TRACKING_NOTIFICATION') {
    self.registration.showNotification('📍 Live Tracker Active', {
      body: 'Sharing your location in the background. Tap to open.',
      icon: '/icon-512.png',
      tag: 'tracking-active',
      renotify: false,
      silent: true,
      requireInteraction: false,
    });
  }

  if (event.data?.type === 'HIDE_TRACKING_NOTIFICATION') {
    self.registration.getNotifications({ tag: 'tracking-active' }).then((notifs) => {
      notifs.forEach((n) => n.close());
    });
  }
});
