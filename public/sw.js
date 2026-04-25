/* global self, clients */
// Lock Street service worker — Web Push handling.

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { title: 'Lock Street', body: event.data?.text() || '' }; }

  const title = payload.title || 'New pick dropped';
  const opts = {
    body: payload.body || 'A new Lock Street pick is live.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/picks' },
    tag: payload.tag || 'lockstreet-pick',
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/picks';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && 'focus' in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
