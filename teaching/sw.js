const CACHE_NAME = 'teaching-v7';
const STATIC_CACHE = 'static-v7';
const API_CACHE = 'api-v7';

// Cache limits to prevent memory bloat
const MAX_API_CACHE_ENTRIES = 50;
const API_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Static assets to cache PERMANENTLY (never expire)
const STATIC_ASSETS = [
    './',
    './index.html',
    './login.html',
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

// External resources to cache permanently
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// API endpoints to cache (with background refresh)
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
// CACHE CLEANUP UTILITIES
// ============================================================================

// Trim cache to max entries (removes oldest first)
async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > maxEntries) {
        console.log(`🧹 Trimming ${cacheName}: ${keys.length} -> ${maxEntries} entries`);
        const deleteCount = keys.length - maxEntries;
        for (let i = 0; i < deleteCount; i++) {
            await cache.delete(keys[i]);
        }
    }
}

// Clean old cache entries on startup
async function cleanupOldCaches() {
    console.log('🧹 Running cache cleanup...');

    try {
        // Trim API cache
        await trimCache(API_CACHE, MAX_API_CACHE_ENTRIES);

        // Clean up any orphaned/old caches
        const cacheKeys = await caches.keys();
        const oldCaches = cacheKeys.filter(key =>
            !key.includes('v6') &&
            (key.includes('teaching') || key.includes('static') || key.includes('api'))
        );

        for (const oldCache of oldCaches) {
            console.log('🗑️ Deleting old cache:', oldCache);
            await caches.delete(oldCache);
        }

        console.log('✅ Cache cleanup complete');
    } catch (error) {
        console.error('⚠️ Cache cleanup error:', error);
    }
}

self.addEventListener('install', (event) => {
    console.log('📦 Service Worker installing...');
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then(cache => {
                console.log('📦 Caching static assets...');
                return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('undefined')));
            }),
            caches.open(STATIC_CACHE).then(cache => {
                // Cache external assets separately (may fail)
                return Promise.allSettled(
                    EXTERNAL_ASSETS.map(url =>
                        fetch(url, { mode: 'cors' })
                            .then(response => cache.put(url, response))
                            .catch(() => console.log('⚠️ Could not cache:', url))
                    )
                );
            })
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => !key.includes('v7'))  // Delete ALL caches that are NOT v6
                    .map(key => {
                        console.log('🗑️ Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
            .then(() => cleanupOldCaches())  // Run cleanup after cache migration
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Handle API requests with stale-while-revalidate (NO EXPIRY - always show cached first)
    if (url.pathname.includes('/api/')) {
        const shouldCache = CACHEABLE_API_PATTERNS.some(pattern =>
            url.pathname.includes(pattern)
        );

        if (shouldCache) {
            event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
            return;
        }

        // For other API calls, network first with timeout
        event.respondWith(networkFirstWithTimeout(event.request, 5000));
        return;
    }

    // Handle Google Fonts - cache first (permanent)
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(cacheFirstPermanent(event.request, STATIC_CACHE));
        return;
    }

    // Handle static assets - cache first (permanent)
    if (url.origin === location.origin) {
        event.respondWith(cacheFirstPermanent(event.request, STATIC_CACHE));
        return;
    }

    // Default: try cache, then network
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});

// Cache-first strategy - PERMANENT (no expiry)
async function cacheFirstPermanent(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) {
        // Return cached immediately, but update in background
        updateCacheInBackground(request, cacheName);
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Return offline page or empty response
        return new Response('Offline', { status: 503 });
    }
}

// Update cache in background (don't wait)
function updateCacheInBackground(request, cacheName) {
    fetch(request).then(response => {
        if (response.ok) {
            caches.open(cacheName).then(cache => {
                cache.put(request, response);
            });
        }
    }).catch(() => { });
}

// Stale-while-revalidate strategy - ALWAYS returns cached first
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    // Always fetch in background to update cache
    const fetchPromise = fetch(request).then(async (response) => {
        if (response.ok) {
            await cache.put(request, response.clone());
            // Periodically trim cache after updates (every ~10th call)
            if (Math.random() < 0.1) {
                trimCache(cacheName, MAX_API_CACHE_ENTRIES);
            }
        }
        return response;
    }).catch(() => cached);

    // Return cached IMMEDIATELY if available (even if weeks old)
    // Otherwise wait for network
    if (cached) {
        return cached;
    }
    return fetchPromise;
}

// Network first with timeout (fallback to cache)
async function networkFirstWithTimeout(request, timeout) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        // Cache the response for offline use
        if (response.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
    }
}
