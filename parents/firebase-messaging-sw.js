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

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Support both data-only and notification payloads
    const notificationTitle = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "Attendance Update";
    const notificationBody = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
    const notificationOptions = {
      body: notificationBody,
      icon: 'icon-192.png',
      requireInteraction: true,
      vibrate: [200, 100, 200]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch(e) {
  console.log("Firebase SW init failed. Remember to add your config!");
}
