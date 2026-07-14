const CACHE = 'patina-v8';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'Patina', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.tag,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
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
    e.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          // Clone before returning — cloning after the browser starts
          // consuming the returned response throws "body already used".
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return caches.match(request);
      }
    })());
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
