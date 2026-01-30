const CACHE_NAME = 'smart-attendance-teaching-v2';
const ASSETS = [
    './',
    './index.html',
    './login.html',
    './myclass.html',
    './attendance.html',
    './view-attendance.html',
    './ai-assistant.html',
    './js/config.js',
    './firebase-config.js',
    './logo2.png'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
