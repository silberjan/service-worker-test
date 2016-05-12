'use strict';

this.importScripts("/js/localforage.js");

// Service worker install event
this.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/js/main.js',
      ]);
    })
  );
  console.log('Installed', event);
});

function handleUncachedRequest(request) {
  return fetch(request);
};

this.addEventListener('fetch',(event) => {

  event.respondWith(
      caches.match(event.request).then((response) => {
        return response || handleUncachedRequest(event.request);
      }).catch(() => {
        return Response('fallback');
      })
  );

});