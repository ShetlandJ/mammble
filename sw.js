// Offline support: cache the whole game on first visit. Each request is answered
// from the cache straight away (so it works offline) and refreshed from the
// network in the background.
//
// To push an update to every device: change VERSION. The browser notices the
// new sw.js on the next launch, downloads every file fresh, then reloads any
// open game window so it switches to the new version straight away.
const VERSION = 'mammble-v3';
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
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const isUpdate = keys.some((k) => k !== VERSION);
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Replacing an older version: reload open windows so they pick up the new files.
    if (isUpdate) {
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((w) => w.navigate(w.url).catch(() => {})));
    }
  })());
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
