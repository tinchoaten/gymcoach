// ═══════════════════════════════════════
// SERVICE WORKER — network-first
//
// IMPORTANTE: subir el número de CACHE en cada deploy que toque
// app.js, index.html o styles.css. El navegador solo reinstala el
// service worker cuando este archivo cambia byte a byte, y ese
// cambio es lo que dispara el borrado del caché viejo.
// ═══════════════════════════════════════
const CACHE = 'gymcoach-v3';

const ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // No interceptar nada de otro origen: ni la API de Gemini, ni el CDN,
  // ni las fuentes. Que los maneje el navegador con su propio caché.
  if (new URL(e.request.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached =>
          cached || (e.request.destination === 'document' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
