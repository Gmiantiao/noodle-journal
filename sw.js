// App-shell cache. Bump CACHE on every deploy that touches shell files,
// so the new version installs atomically instead of mixing old/new files.
const CACHE = 'mianji-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// Query-string the precache URLs so the install cannot be served stale
// files from the browser HTTP cache (GitHub Pages sets max-age).
const PRECACHE = ASSETS.map(url => `${url}${url.includes('?') ? '&' : '?'}v=${CACHE}`);

self.addEventListener('install', event => {
  // Cache files one by one so a single flaky request cannot block the update.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map(url =>
      fetch(new Request(url, { cache: 'reload' })).then(res => {
        if (res && res.ok) return cache.put(url, res);
      })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // tiles / CDN stay online-only

  // Stale-while-revalidate: answer from cache immediately, refresh in background.
  // no-cache forces HTTP revalidation so a deploy can't stick behind max-age.
  const network = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy));
    }
    return res;
  }).catch(() => null);

  event.waitUntil(network);

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return network.then(fresh => {
        if (fresh) return fresh;
        if (req.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
        return Response.error();
      });
    })
  );
});
