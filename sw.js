'use strict';

self.importScripts("/js/localforage.js");

var CACHE_VERSION = 'v1';
// array to store the URLs of all the currently stored videos so we can synchronously
// decide whether to use a fallback response
var indexedVideos = [];

// Service worker install event
self.addEventListener('install', installServiceWorker);

// Service worker fetch event
self.addEventListener('fetch', handleFetch);


///////////
// SETUP //
///////////

function installServiceWorker(event) {
  event.waitUntil(
    Promise.all([
      setupStaticsCache(),
      setupVideoCache()
    ])
  );
  console.log('Installed', event);
}

// open and populate cache
function setupStaticsCache() {
  caches.open(CACHE_VERSION).then(function(cache) {
    return cache.addAll([
      '/',
      '/index.html',
      '/js/main.js'
    ]);
  })
}

// gather all URLs of currently stored videos
function setupVideoCache() {
  localforage.keys().then(function(keys) {
    indexedVideos = keys.filter(function(key) {
      return key.indexOf('.mp4') >= 0;
    });
  })
}


///////////
// FETCH //
///////////

function handleFetch(event) {
  if (event.request.url.indexOf('.mp4') >= 0) {
    return handleVideoFetch(event);
  } else {
    return handleStaticsFetch(event);

  }
}

// look in the cache and otherwise perform an external request
function handleStaticsFetch(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        console.log("Cache Hit", event.request);
        return response;
      }
      console.log("Cache Miss", event.request);
      return handleUncachedRequest(event.request);
    }).catch(function() {
      console.log("Fallback", event.request);
      return new Response('fallback');
    })
  );
}


function handleVideoFetch(event) {
  console.log("Video (Range " + event.request.headers.get('range') + ")", event.request);

  var url = event.request.url;

  // check if we already have the video in the localforage
  if (indexedVideos.indexOf(url) >= 0) {
    // we seem to have the video already!
    returnVideoFromIndexedDB(event);
  } else {
    // we do not have the video yet, add it
    addVideoToIndexedDB(url);

    // note: we let the request fall through and do not process the event further so
    // the browser takes control again and correctly handles Partial Content responses.
    // Otherwise, a response to the event with, i.e.,
    //     fetch(event.request);
    // would trigger a complete second download of the video.
  }
}

/////////////
// HELPERS //
/////////////

function handleUncachedRequest(request) {
  return fetch(request);
}

function returnVideoFromIndexedDB(event) {
  var url = event.request.url;
  var range = event.request.headers.get('range');

  event.respondWith(localforage.getItem(url).then(function(item) {
    if (item === null) {
      // for some reason we could not retrieve the video from the database, so just add it
      // and delegate the work of getting the video to the external URL.
      addVideoToIndexedDB(url);
      return fetch(event.request);
    }

    // remember which blob to output
    // this may change if we have ranges in the request
    var output = item;

    // check if we should return a specific range
    // explanation: The request includes a header "range" which specifies the byte range of
    //              the video that should be returned. It is of the format
    //                  bytes x-y
    //              to indicate that bytes x to y should be returned (y is optional and may
    //              be missing).
    // TODO replace this with a regexp... bytes X-(Y)?
    var rangeString = range.split('=')[1];
    var ranges = rangeString.split('-', 2).filter(function(x) {
      return x != "";
    });
    if (ranges.length == 0) {
      ranges.push(0);
    }
    if (ranges.length == 1) {
      ranges.push(output.size);
    }
    if (ranges[0] != 0 || ranges[1] != output.size) {
      // slice a fitting blob
      output = output.slice(ranges[0], ranges[1], 'video/mp4');
    }

    // return the requested part of the video
    // (refer to https://bugs.chromium.org/p/chromium/issues/detail?id=575357#c10)
    return new Response(
      output,
      {
        status: 206,
        statusText: 'Partial Content',
        headers: [
          ['Connection', 'keep-alive'],
          ['Content-Type', 'video/mp4'],
          ['Content-Length', output.size],
          ['Content-Range', 'bytes ' + ranges[0] + '-' + (ranges[1] - 1) + '/' + item.size]
        ]
      }
    );
  }));
}

function addVideoToIndexedDB(url) {
  indexedVideos.push(url);

  // we do not yet have the video, so load it and store it as a blob...
  var request = new Request(url);
  fetch(request).then(function(response) {
    return response.blob();
  }).then(function(blob) {
    localforage.setItem(url, blob, function(item, err) {
      console.log("Finished downloading and storing video." + url, blob);
    });
  }).catch(function(err) {
    // delete the video from the list again as the download did not succeed
    indexedVideos.splice(indexedVideos.indexOf(url), 1);
  });
}


