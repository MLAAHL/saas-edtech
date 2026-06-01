importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// ⚠️ REPLACE THIS CONFIG with your Firebase Project settings!
// This runs in the background, so it needs its own config copy.
const firebaseConfig = {
  apiKey: "AIzaSyDmvzNuE-szbAkFjeEjCNFJK-65sC0_IfE",
  authDomain: "smart-attendance-a9ab4.firebaseapp.com",
  projectId: "smart-attendance-a9ab4",
  storageBucket: "smart-attendance-a9ab4.firebasestorage.app",
  messagingSenderId: "447867381654",
  appId: "1:447867381654:web:e27e6cceb8c63c0c799fb7",
  measurementId: "G-19HPME0K12"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Support both notification and data payloads
    const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Update';
    const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
    
    const notificationOptions = {
      body: body,
      icon: '/icon-192.png',
      data: payload.data || {}
    };

    self.registration.showNotification(title, notificationOptions);
  });

} catch(e) {
  console.log("Firebase SW init failed. Remember to add your config!");
}

// ===== Standard Web Push Event Listeners =====
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push Received.');
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Attendance Update';
      const options = {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [100, 50, 100],
        data: data.data || {}
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.error('[Service Worker] Error parsing push payload:', e);
      event.waitUntil(self.registration.showNotification('Attendance Update', {
        body: event.data.text(),
        icon: '/icon-192.png'
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
