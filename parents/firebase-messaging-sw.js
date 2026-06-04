// ===== Standard Web Push Event Listeners =====
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Attendance Update';
      const options = {
        body: data.body || '',
        icon: '/badge.png',
        badge: '/badge.png',
        vibrate: [100, 50, 100],
        data: data.data || {}
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.error('[Service Worker] Error parsing push payload:', e);
      event.waitUntil(self.registration.showNotification('Attendance Update', {
        body: event.data.text(),
        icon: '/badge.png',
        badge: '/badge.png',
      }));
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Standard fetch handler required for PWA installability
self.addEventListener('fetch', function(event) {
  // Let requests pass through normally.
  // An active fetch listener is required by browsers to trigger the PWA install prompt.
});
