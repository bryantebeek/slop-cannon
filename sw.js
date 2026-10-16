// Offline support: network-first for everything, so online players always get the latest deploy
// and the last-seen version still loads with no connection.
const CACHE = 'slop-cannon-v2';
// One page, one key: /?utm_source=slack and / must not cache separate (and diverging) copies.
const keyOf = req => req.mode === 'navigate' ? '/' : req;
const store = (key, res) => caches.open(CACHE).then(c => c.put(key, res)).catch(() => {});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// The first visit loads everything before this worker exists, so the page posts what it loaded.
self.addEventListener('message', e => e.waitUntil(caches.open(CACHE).then(c =>
  Promise.all([].concat(e.data).map(u => c.add(u).catch(() => {}))))));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  const key = keyOf(req);
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') e.waitUntil(store(key, res.clone()));
    return res;
  }, () => caches.match(key).then(r => r || Response.error())));
});
