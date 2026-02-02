const CACHE_NAME = 'teaching-v4';
const STATIC_CACHE = 'static-v4';
const API_CACHE = 'api-v4';

// Static assets to cache immediately
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

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
];

// API endpoints to cache with stale-while-revalidate
const CACHEABLE_API_PATTERNS = [
    '/api/streams',
    '/api/subjects',
    '/api/config/cloudinary',
    '/api/teacher/profile'
];

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
                    .filter(key => !key.includes('v3'))
                    .map(key => {
                        console.log('🗑️ Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // Handle API requests with stale-while-revalidate
    if (url.pathname.includes('/api/')) {
        const shouldCache = CACHEABLE_API_PATTERNS.some(pattern => 
            url.pathname.includes(pattern)
        );
        
        if (shouldCache) {
            event.respondWith(staleWhileRevalidate(event.request, API_CACHE, 5 * 60 * 1000)); // 5 min cache
            return;
        }
        
        // For other API calls, network first with timeout
        event.respondWith(networkFirstWithTimeout(event.request, 5000));
        return;
    }
    
    // Handle Google Fonts - cache first
    if (url.hostname.includes('fonts.googleapis.com') || 
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }
    
    // Handle static assets - cache first
    if (url.origin === location.origin) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }
    
    // Default: network first
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// Cache-first strategy
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

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request, cacheName, maxAge) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    // Fetch in background
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);
    
    // Return cached if available, otherwise wait for fetch
    return cached || fetchPromise;
}

// Network first with timeout
async function networkFirstWithTimeout(request, timeout) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw error;
    }
}

