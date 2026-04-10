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
    const notificationTitle = payload.notification.title || "Attendance Update";
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/icon-192x192.png' // Replace with your actual icon
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch(e) {
  console.log("Firebase SW init failed. Remember to add your config!");
}
