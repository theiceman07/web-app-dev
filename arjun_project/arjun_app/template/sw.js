// FoleyCraft service worker (version {{ version }}).
// When the device is offline, pages show the FC-000 "no connection" page and API calls
// get a JSON 503 with site_code FC-000, instead of the browser's own error screen.
const CACHE = 'foleycraft-offline-{{ version }}';
const OFFLINE_URL = '/offline/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // The offline page answers 503, so it is stored with put(); add() only keeps 2xx responses.
      .then((cache) => fetch(OFFLINE_URL, { cache: 'reload' }).then((res) => cache.put(OFFLINE_URL, res)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('foleycraft-offline-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function offlinePage() {
  return caches.match(OFFLINE_URL).then((cached) => cached || new Response(
    '<!doctype html><meta charset="utf-8"><title>FC-000 No connection</title><h1>FC-000</h1><p>You are offline. Check your connection and try again.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  ));
}

function offlineJson() {
  const body = { error: { code: 503, type: 'offline', site_code: 'FC-000', message: 'You are offline. Check your internet connection and try again.' } };
  return new Response(JSON.stringify(body), { status: 503, headers: { 'Content-Type': 'application/json' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(offlinePage));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(offlineJson));
  }
});
