/* ==================================================================
   PrivatB service worker — offline app shell.
   Bump CACHE when any precached asset changes.
   ================================================================== */
'use strict';

var CACHE = 'privatb-v5';

var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/i18n.js',
  './js/format.js',
  './js/data.js',
  './js/biometrics.js',
  './js/statement.js',
  './js/modules.js',
  './js/app.js',
  './vendor/jspdf.umd.min.js',
  './vendor/fonts-ptsans.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        /* addAll is all-or-nothing; add individually so one 404 can't
           break the whole install. */
        return Promise.all(PRECACHE.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' }))
            .catch(function (err) { console.warn('[sw] skipped', url, err); });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations: try the network, fall back to the cached shell offline. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); });
          return response;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (cached) {
            return cached || caches.match('./');
          });
        })
    );
    return;
  }

  /* Assets: serve from cache, refresh in the background. */
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });

      return cached || network;
    })
  );
});
