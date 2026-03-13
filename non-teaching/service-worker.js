const CACHE_NAME = "non-teaching-v2";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./js/main.js",
  "./js/login.js",
  "./logo2.png"
];

// Install Event - Cache static assets
self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📦 Caching static assets");
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🧹 Clearing old cache", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First, Fallback to Cache
self.addEventListener("fetch", (evt) => {
  // Skip non-GET requests (POST, PUT, DELETE can't be cached)
  if (evt.request.method !== 'GET') return;

  // Use Network First strategy for HTML requests to ensure freshness
  if (evt.request.mode === "navigate") {
    evt.respondWith(
      fetch(evt.request)
        .catch(() => {
          return caches.match(evt.request) || caches.match("./index.html");
        })
    );
    return;
  }

  // Use Stale-While-Revalidate for other assets (try cache, but update in background)
  evt.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(evt.request).then((response) => {
        const fetchPromise = fetch(evt.request).then((networkResponse) => {
          cache.put(evt.request, networkResponse.clone());
          return networkResponse;
        });
        return response || fetchPromise;
      });
    })
  );
});
