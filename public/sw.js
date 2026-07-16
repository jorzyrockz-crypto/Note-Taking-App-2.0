const CACHE_NAME = 'paperuss-v47';
// Static assets that never get hashed — safe to precache by path
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase.js',
  './glass-editor.js',
  './sync.js',
  './settings.js',
  './productivity.js',
  './recipe.js',
  './note-types/index.js',
  './note-types/checklist-note.js',
  './note-types/text-note.js',
  './note-types/shared.js',
  './site.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

const SHARE_CACHE = 'paperuss-share-temp';

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method === 'POST' && requestUrl.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (event.request.method !== 'GET') return;

  // Stale-while-revalidate for Google Fonts (CSS + font files)
  const url = new URL(event.request.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open('paperuss-fonts').then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(res => {
            if (res && res.status === 200) cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Cache-first for Vite hashed assets (/assets/*) — immutable content-hashed files
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return caches.match(event.request).then(response => response || Response.error());
        });
    })
  );
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const file = formData.get('sharedFile');

    const params = new URLSearchParams();
    if (title) params.set('title', title);
    if (text) params.set('text', text);
    if (url) params.set('url', url);

    if (file && typeof file.size === 'number' && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        'shared-file',
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Paperuss-File-Name': encodeURIComponent(file.name || 'shared-file')
          }
        })
      );
      params.set('sharedFile', '1');
      params.set('sharedFileType', file.type || 'application/octet-stream');
      params.set('sharedFileName', file.name || 'shared-file');
    }

    return Response.redirect('./?' + params.toString(), 303);
  } catch (error) {
    return Response.redirect('./', 303);
  }
}
