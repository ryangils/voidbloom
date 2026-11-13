// VOIDBLOOM service worker: caches the game so it plays offline once installed.
// Bump VERSION whenever you ship changes so players get the update.
const VERSION = 'voidbloom-v10';
const FILES = [
  './', 'index.html', 'css/style.css', 'favicon.svg', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/oxanium.woff2', 'js/version.js', 'js/util.js', 'js/sprites.js', 'js/audio.js', 'js/beat.js', 'js/data.js', 'js/progress.js', 'js/game.js', 'js/ui.js', 'js/main.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// network first (so updates arrive), cache as fallback (so it works offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
