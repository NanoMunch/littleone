// Offline support: keeps the app's own files on the phone. It never stores or touches log data,
// and never caches anything from other sites (requests to GitHub always go straight to the network).
const VERSION = 'littleone-1.2.1';
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'sync.js', 'pdf.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
  'fonts/fraunces-400.woff', 'fonts/fraunces-italic.woff', 'fonts/dmsans-400.woff', 'fonts/dmsans-600.woff',
  'fonts/fraunces-400.ttf', 'fonts/fraunces-italic.ttf', 'fonts/dmsans-400.ttf', 'fonts/dmsans-600.ttf',
  'vendor/jspdf.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('littleone-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
