// ============================================================================
// CACHE VERSION — BUMP THIS ON EVERY DEPLOY TO BUST ALL CACHES
// ============================================================================
const CACHE_VERSION = 25;
const CACHE_NAME = `teaching-v${CACHE_VERSION}`;
const STATIC_CACHE = `static-v${CACHE_VERSION}`;
const API_CACHE = `api-v${CACHE_VERSION}`;

// Cache limits
const MAX_API_CACHE_ENTRIES = 50;

// Static assets to pre-cache
const STATIC_ASSETS = [
    './',
    './index.html',
    './myclass.html',
    './attendance.html',
    './view-attendance.html',
    './ai-assistant.html',
    './js/config.js',
    './js/index.js',
    './js/login.js',
    './js/myclass.js',
    './firebase-config.js',
    './logo2.png',
    './manifest.json'
];

// API endpoints to cache (stale-while-revalidate)
const CACHEABLE_API_PATTERNS = [
    '/api/streams',
    '/api/subjects',
    '/api/config/cloudinary',
    '/api/teacher/profile',
    '/api/teacher/subjects',
    '/api/teacher/queue',
    '/api/teacher/completed'
];

// ============================================================================
// INSTALL — Pre-cache static assets, skip waiting immediately
// ============================================================================
self.addEventListener('install', (event) => {
    console.log(`📦 SW v${CACHE_VERSION} installing...`);
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // Force activate immediately
    );
});

// ============================================================================
// ACTIVATE — Delete ALL old caches, claim all clients
// ============================================================================
self.addEventListener('activate', (event) => {
    console.log(`🚀 SW v${CACHE_VERSION} activating...`);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE && key !== API_CACHE)
                    .map(key => {
                        console.log('🗑️ Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
        .then(() => self.clients.claim()) // Take control of all pages immediately
        .then(() => {
            // Notify all open tabs to reload
            self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
                });
            });
        })
    );
});

// ============================================================================
// FETCH — Network-first for pages, cache-first for fonts/images
// ============================================================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // NEVER intercept Firebase/auth requests
    if (url.hostname.includes('gstatic.com') ||
        url.hostname.includes('firebase') ||
        (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts.googleapis.com'))) {
        return;
    }

    // Handle API requests — stale-while-revalidate for cacheable, network-first for others
    if (url.pathname.includes('/api/')) {
        const cacheControl = event.request.headers.get('Cache-Control');
        const bypassCache = cacheControl && cacheControl.includes('no-cache');

        const shouldCache = !bypassCache && CACHEABLE_API_PATTERNS.some(pattern =>
            url.pathname.includes(pattern)
        );

        if (shouldCache) {
            event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
        } else {
            event.respondWith(networkFirst(event.request));
        }
        return;
    }

    // Handle Google Fonts — cache first (these rarely change)
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    // Handle same-origin HTML/JS/CSS — NETWORK FIRST (critical for updates!)
    if (url.origin === location.origin) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Default: network with cache fallback
    event.respondWith(networkFirst(event.request));
});

// ============================================================================
// STRATEGIES
// ============================================================================

// Network first — always try fresh content, fall back to cache
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

// Cache first — for assets that rarely change (fonts, images)
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response('Offline', { status: 503 });
    }
}

// Stale-while-revalidate — return cached immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(async (response) => {
        if (response.ok) {
            await cache.put(request, response.clone());
            // Trim periodically
            if (Math.random() < 0.1) trimCache(cacheName, MAX_API_CACHE_ENTRIES);
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

// Trim cache to max entries
async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
        const deleteCount = keys.length - maxEntries;
        for (let i = 0; i < deleteCount; i++) {
            await cache.delete(keys[i]);
        }
    }
}
