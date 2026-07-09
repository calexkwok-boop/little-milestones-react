const CACHE = 'patina-v6';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  const isSameOrigin = url.origin === self.location.origin;
  const isCloudinary = url.hostname.includes('cloudinary.com');
  const isSupabase = url.hostname.includes('supabase.co');
  const isFonts = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

  // Supabase — never cache
  if (isSupabase) return;

  // HTML (index.html, /) — always network so deploys are picked up immediately
  if (isSameOrigin && (url.pathname === '/' || url.pathname.endsWith('.html'))) {
    e.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const cache = caches.open(CACHE).then(c => c.put(request, response.clone()));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Hashed JS/CSS assets — cache-first (Vite filenames include content hash, safe forever)
  if (isSameOrigin && url.pathname.startsWith('/assets/')) {
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

  // Cloudinary images — cache-first
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
