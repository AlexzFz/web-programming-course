/// <reference lib="WebWorker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'todo-pwa-starter-v1';
const SHELL_ASSETS = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.svg', '/icons/icon-512.svg'];

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_ASSETS);
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === sw.location.origin;
  const isNavigation = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return (await caches.match('/offline.html')) ?? Response.error();
        }
      })()
    );
    return;
  }

  if (isSameOrigin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch {
          return new Response('Offline resource is unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
  }
});
