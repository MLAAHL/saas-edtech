// ===== Standard Web Push Event Listeners =====
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Attendance Update';
      const options = {
        body: data.body || '',
        icon: '/logo-192.png',
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

// Tapping a notification can land on a particular tab, or open a link. The
// destination travels in the payload, so the sender decides it rather than
// every alert dropping the reader on the same screen.
const ALLOWED_TABS = ['daily', 'full', 'insights', 'profile'];

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data || {};
  const tab = ALLOWED_TABS.indexOf(data.actionTab) !== -1 ? data.actionTab : '';
  const link = /^https?:\/\//i.test(data.linkUrl || '') ? data.linkUrl : '';

  // A link goes out to the browser; anything else stays in the app.
  const target = link || (tab ? '/?tab=' + tab : '/');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (link) {
        return clients.openWindow(link);
      }

      // Already open: focus it and tell it which tab to show, rather than
      // reloading and losing whatever the reader was looking at.
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          if (tab && client.postMessage) {
            client.postMessage({ type: 'open-tab', tab: tab });
          }
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    })
  );
});

// Standard fetch handler required for PWA installability
self.addEventListener('fetch', function(event) {
  // Let requests pass through normally.
  // An active fetch listener is required by browsers to trigger the PWA install prompt.
});
