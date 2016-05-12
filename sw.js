'use strict';

// Service worker install event
this.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/', // index.html
        '/index.html',
        '/js/main.js', //js
      ]);
    })
  );
  console.log('Installed', event);
});

function handleUncachedRequest(request) {
  // if (request.url.includes('.jpg')) {
  //   caches.open('images').then((cache) => {
  //     return cache.add(request);
  //   });
  // }
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



// this.addEventListener('foreignFetch',function(event){
//   console.log('Foreign request ' + event.request.url + ' is being fetched');
// });

// self.addEventListener('activate', function(event) {
//   console.log('Activated', event);
// });
// self.addEventListener('push', function(event) {
//   console.log('Push message received', event);
//   // TODO
// });
