const CACHE_NAME = 'paperuss-v90';
// Files available at the same paths in both source and Vite production builds.
// Hashed JS/CSS dependencies are cached on first controlled fetch below.
const APP_ASSETS = [
  './',
  './index.html',
  './site.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.ico',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('paperuss-v') && key !== CACHE_NAME)
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

  const isNavigation = event.request.mode === 'navigate';
  event.respondWith(
    caches.match(event.request, { ignoreSearch: isNavigation }).then((cachedResponse) => {
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

    // Dynamically find all valid Blobs/Files in the form data entries
    const files = [];
    for (const [key, value] of formData.entries()) {
      if (value && value instanceof Blob && value.size > 0) {
        files.push(value);
      }
    }

    const params = new URLSearchParams();
    if (title) params.set('title', title);
    if (text) params.set('text', text);
    if (url) params.set('url', url);

    if (files.length > 0) {
      const cache = await caches.open(SHARE_CACHE);
      
      // Clear any leftover temporary files to prevent conflicts
      const existingKeys = await cache.keys();
      for (const req of existingKeys) {
        await cache.delete(req);
      }

      // Cache all incoming files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || `shared-file-${i}`;
        await cache.put(
          `shared-file-${i}`,
          new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-Paperuss-File-Name': encodeURIComponent(fileName)
            }
          })
        );
      }

      // Set backward compatible single file flag and list count for multi-file support
      params.set('sharedFile', '1');
      params.set('sharedFilesCount', files.length.toString());
      if (files[0]) {
        params.set('sharedFileType', files[0].type || 'application/octet-stream');
        params.set('sharedFileName', files[0].name || 'shared-file');
      }
    }

    const redirectUrl = new URL('./', self.location.origin);
    redirectUrl.search = params.toString();
    return Response.redirect(redirectUrl.href, 303);
  } catch (error) {
    console.error('Service Worker Share Target processing failed:', error);
    const fallbackUrl = new URL('./', self.location.origin);
    return Response.redirect(fallbackUrl.href, 303);
  }
}
