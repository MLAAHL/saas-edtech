// Safeguard for localStorage/sessionStorage access inside WebViews/restricted environments
(function() {
  function isStorageSupported(type) {
    try {
      const storage = window[type];
      const x = '__storage_test__';
      storage.setItem(x, x);
      storage.removeItem(x);
      return true;
    } catch (e) {
      return false;
    }
  }

  function createInMemoryStorage() {
    let store = {};
    return {
      getItem: function(key) { return store[key] || null; },
      setItem: function(key, value) { store[key] = String(value); },
      removeItem: function(key) { delete store[key]; },
      clear: function() { store = {}; },
      key: function(index) {
        const keys = Object.keys(store);
        return keys[index] || null;
      },
      get length() { return Object.keys(store).length; }
    };
  }

  if (!isStorageSupported('localStorage')) {
    console.warn('⚠️ localStorage is not supported or is disabled. Using in-memory fallback.');
    try {
      Object.defineProperty(window, 'localStorage', {
        value: createInMemoryStorage(),
        writable: true,
        configurable: true
      });
    } catch (e) {
      window.localStorage = createInMemoryStorage();
    }
  }

  if (!isStorageSupported('sessionStorage')) {
    console.warn('⚠️ sessionStorage is not supported or is disabled. Using in-memory fallback.');
    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: createInMemoryStorage(),
        writable: true,
        configurable: true
      });
    } catch (e) {
      window.sessionStorage = createInMemoryStorage();
    }
  }
})();

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

window.APP_CONFIG = {
  API_BASE_URL: isLocal ? 'https://mlaahl.online/api' : 'https://mlaahl.online/api',
  UUCMS_API_URL: 'https://mlaahl.online',
  // ⚠️ REPLACE THIS CONFIG with your Firebase Project settings!
  // This is required to make Push Notifications work on iOS / Web.
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyDmvzNuE-szbAkFjeEjCNFJK-65sC0_IfE",
    authDomain: "smart-attendance-a9ab4.firebaseapp.com",
    projectId: "smart-attendance-a9ab4",
    storageBucket: "smart-attendance-a9ab4.firebasestorage.app",
    messagingSenderId: "447867381654",
    appId: "1:447867381654:web:e27e6cceb8c63c0c799fb7",
    measurementId: "G-19HPME0K12",
    vapidKey: "BBA9xZFHHnm-9mY14lrmH17Dz0ZbvzqjhUqKmMekzf8nU-mmgiN29H9hm15p-SCvuzQPe74UVH8HFoaFuPA3lyc" // ⚠️ Needed for Web Push. Get this from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates.
  }
};
