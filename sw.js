// Offline support: cache the whole game on first visit. Each request is answered
// from the cache straight away (so it works offline) and refreshed from the
// network in the background, so updates arrive the next time the game opens.
const VERSION = 'mammble-v2';
const FILES = [
  './',
  'index.html',
  'style.css',
  'engine.js',
  'app.js',
  'words.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    return fresh;
  }));
});
