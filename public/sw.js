const CACHE = 'patina-v4';

// Cache the app shell on install
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Remove old caches from previous versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin and Cloudinary requests
  const isSameOrigin = url.origin === self.location.origin;
  const isCloudinary = url.hostname.includes('cloudinary.com');
  const isSupabase = url.hostname.includes('supabase.co');
  const isFonts = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  // Supabase API — always network, never cache
  if (isSupabase) return;

  // App shell (JS/CSS chunks) — cache-first, fall back to network
  if (isSameOrigin && (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname.endsWith('.html'))) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Cloudinary images — cache-first with 7-day TTL via cache storage
  if (isCloudinary && request.method === 'GET') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Fonts — cache-first
  if (isFonts && request.method === 'GET') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }
});
