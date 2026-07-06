// AI Usage Monitor service worker
// Handles: offline fallback, dashboard-data caching, Web Push, and update notifications.

const CACHE_VERSION = 'ai-usage-monitor-v1';
const OFFLINE_URL = '/offline.html';
const DASHBOARD_API = '/api/dashboard';
const PRECACHE_URLS = [OFFLINE_URL, '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll().then((clients) => {
          for (const client of clients) client.postMessage({ type: 'sw-updated' });
        }),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Dashboard data: network-first, cache the last good response for offline viewing.
  if (url.pathname === DASHBOARD_API) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Navigations: network-first, falling back to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
});

self.addEventListener('push', (event) => {
  let payload = { title: 'AI Usage Monitor', body: '' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'AI Usage Monitor', body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'AI Usage Monitor', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
