'use strict';

self.importScripts("./js/localforage.js");

var CACHE_VERSION = 'v1';
// array and enum to store the states of all currently stored videos so we can synchronously
// decide whether to use a fallback response
var videoStates = [];
var VideoState = Object.freeze({
  UNKNOWN: "UNKNOWN",     // video is not known, i.e., not available
  LOADING: "LOADING",     // video is currently loading
  AVAILABLE: "AVAILABLE", // video is fully available in IndexedDB
});

var videoStore;
var requestStore;

// Service worker install event
self.addEventListener('install', installServiceWorker);

// TODO: perform cleanup of caches
// https://github.com/GoogleChrome/samples/blob/gh-pages/service-worker/offline-analytics/service-worker.js#L121

// Service worker fetch event
self.addEventListener('fetch', handleFetch);

// Service worker sync event
self.addEventListener('sync', handleSync);


///////////
// SETUP //
///////////

function installServiceWorker(event) {
  event.waitUntil(
    Promise.all([
      setupStaticsCache()
    ])
  );
  console.log('Installed', event);
}

// open and populate cache
function setupStaticsCache() {
  caches.open(CACHE_VERSION).then(function(cache) {
    return cache.addAll([
      './',
      './index.html',
      './js/main.js',
      './js/localforage.js',
      './js/quotaManagement.js',
    ]);
  })
}

setupVideoCache();
setupRequestStore();

// gather all URLs of currently stored videos
function setupVideoCache() {
  videoStore = localforage.createInstance({
    name: 'videoStore',
    description: 'Stores cached videos.'
  });

  videoStore.keys().then(function(keys) {
    for (var i = 0; i < keys.length; i++) {
      updateVideoState(keys[i], VideoState.AVAILABLE);
    }
  });
}

function setupRequestStore() {
  requestStore = localforage.createInstance({
    name: 'requestStore',
    description: 'Stores POST requests that could not be saved to the server.'
  });

  replayPOSTRequests();
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
      return handleUncachedRequest(event);
    }).catch(function() {
      console.log("Fallback", event.request);
      return new Response('fallback');
    })
  );
}


function handleVideoFetch(event) {
  console.log("Video Request (Range " + event.request.headers.get('range') + ")", event.request);

  var url = event.request.url;

  // check if we already have the video in the localforage
  switch (getVideoState(url)) {
    case VideoState.AVAILABLE:
      // we seem to have the video already!
      returnVideoFromIndexedDB(event);
      break;
      
    case VideoState.UNKNOWN:
      // we do not have the video yet, add it
      addVideoToIndexedDB(url);
      break;
    
    case VideoState.LOADING:
      // do nothing and let the request fall through
      // TODO: can we somehow output a partial response here from the already loaded parts of the video?
      //       c.f. Ajax example here: http://mozilla.github.io/localForage/#data-api-setitem
    default:
      break;
  }
  
  /*
    Note: We let the request fall through if the video is not available
    and do not process the event further so the browser takes control again
    and correctly handles Partial Content responses.
    Otherwise, a response to the event with, i.e.,
         fetch(event.request);
    would trigger a complete second download of the video.
  */
}


//////////
// SYNC //
//////////

function handleSync(event) {
  console.log('handle some sync', event);

  if (event.tag === 'myFirstSync') {
    console.log('do myFirstSync');
    event.waitUntil(function() {
    });
  } else if (event.tag === 'ReplaySync') {
    console.log('do ReplaySync');
    // TODO: pass promise to tell sync if it has to try again
    event.waitUntil(replayPOSTRequests());
  }
}


/////////////
// HELPERS //
/////////////

function handleUncachedRequest(event) {
  return fetch(event.request.clone()).then(function(response) {
    console.log('  Response for %s from network is: %O', event.request.url, response);

    // Optional: add in extra conditions here, e.g. response.type == 'basic' to only cache
    // responses from the same domain. See https://fetch.spec.whatwg.org/#concept-response-type
    if (response.status < 400) {
      // This avoids caching responses that we know are errors (i.e. HTTP status code of 4xx or 5xx).
      // One limitation is that, for non-CORS requests, we get back a filtered opaque response
      // (https://fetch.spec.whatwg.org/#concept-filtered-response-opaque) which will always have a
      // .status of 0, regardless of whether the underlying HTTP call was successful. Since we're
      // blindly caching those opaque responses, we run the risk of caching a transient error response.
      //
      // We need to call .clone() on the response object to save a copy of it to the cache.
      // (https://fetch.spec.whatwg.org/#dom-request-clone)
      // TODO: decide what we want to cache
      // cache.put(event.request, response.clone());

      // seams to work, so lets check to send our queued requests.
      replayPOSTRequests();
    } else if (response.status >= 500) {
      // If this is a POST request we want to retry it if a HTTP 5xx response
      // was returned, just like we'd retry it if the network was down.
      checkForPOSTRequest(event);
    }

    // Return the original response object, which will be used to fulfill the resource request.
    return response;
  }).catch(function(error) {
    // The catch() will be triggered for network failures. Let's see if it was a request we
    // are looking for, and save it to be retried if it was.
    checkForPOSTRequest(event);

    // TODO: decide if we want to return a custom response
    throw error;
  });
}

function checkForPOSTRequest(event) {
  if (event.request.method === 'POST') {
    savePOSTRequest(event);
  }
  // TODO have to handle OPTIONS requests?
}

function savePOSTRequest(event) {
  event.request.json().then(function(body) {
    // TODO: may have to store auth headers
    var timestamp = Date.now();
    var save = {
      timestamp: timestamp,
      url: event.request.url,
      body: body
    };

    requestStore.setItem(timestamp.toString(), save).then(function(data) {
      console.log('Saved POST request', data);

      // request to sync pending requests when connection is back up
      self.registration.sync.register('ReplaySync');
    }).catch(function(error) {
      console.log('Failed to store request', error);
    });
  });
}

function replayPOSTRequests() {
  return requestStore.iterate(function(storedRequest, key) {

    var request = {
      method: 'POST',
      body: JSON.stringify(storedRequest.body),
      headers: {}
    };
    console.log('Replaying', storedRequest.url, request);

    fetch(storedRequest.url, request).then(function(response) {
      if (response.status < 400) {
        // If sending the request was successful, then remove it from the IndexedDB.
        requestStore.removeItem(key);
        console.log(' Replaying succeeded.');
      } else {
        // This will be triggered if, e.g., the server returns a HTTP 50x response.
        // The request will be replayed the next time the service worker starts up.
        throw new Error('Replaying failed with status >= 400');
      }
    }).catch(function(error) {
      // This will be triggered if the network is still down. The request will be replayed again
      // the next time the service worker starts up.
      console.error(' Replaying failed:', error);

      // request to sync pending requests when connection is back up
      self.registration.sync.register('ReplaySync');
    });

  });
}

function returnVideoFromIndexedDB(event) {
  var url = event.request.url;
  var range = event.request.headers.get('range');

  event.respondWith(videoStore.getItem(url).then(function(item) {
    if (item === null) {
      // for some reason we could not retrieve the video from the database despite the video status
      // being AVAILABLE (most likely because the user or browser deleted the video from the IndexedDB),
      // so just add it again and delegate the work of getting the video to the external URL
      updateVideoState(url, VideoState.UNKNOWN);
      addVideoToIndexedDB(url);
      
      // TODO: somehow achieve a stream here so that video skipping is possible
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
    // TODO: replace this with a regexp... bytes X-(Y)?
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
  }).catch(function(err) {
    // some exception occured while retrieving and serving the video, e.g. a failure
    // of IndexedDB or localforage.
    console.log("Could not retrieve and serve the video! ", err)
    
    // TODO: somehow achieve a stream here so that video skipping is possible
    return fetch(event.request);
  }));
}

// initiate the download of the video with the given url if not already underway
function addVideoToIndexedDB(url) {
  switch (getVideoState(url)) {
    case VideoState.UNKNOWN:
      // we do not yet have the video, so load it and store it as a blob...
      updateVideoState(url, VideoState.LOADING);
      
      var request = new Request(url);
      fetch(request).then(function(response) {
        // we got the video, now convert it to a blob
        return response.blob();
      }).then(function(blob) {
        // we now have the video as a blob, try to save it to IndexedDB
        return videoStore.setItem(url, blob);
      }).then(function(item) {
        // it worked, we are done!
        updateVideoState(url, VideoState.AVAILABLE);
        console.log("Finished downloading and storing video: " + url);
      }).catch(function(err) {
        // something went wrong, log that and reset the video status
        updateVideoState(url, VideoState.UNKNOWN);
        console.log("Could not download video: " + url, err);
      });
  
    default:
      // cancel if we already have the video or are currently downloading it
      break;
  }
}

// update the state of the video with the given url
function updateVideoState(url, state)
{
  console.log("Update Video State: "+state+" => "+url);
  var videoStateObject = getVideoStateObject(url);
  if (videoStateObject === null) {
    videoStates.push({
      url: url,
      state: state
    });
  } else {
    videoStateObject.state = state;
  }
}

// get the state of the video with the given url
function getVideoState(url) {
  var videoStateObject = getVideoStateObject(url);
  if (videoStateObject === null) {
    return VideoState.UNKNOWN;
  }
  return videoStateObject.state;
}

// get the internal state object of the video with the given url
// this naively iterates over all videos until it finds the right ones, but this
// is probably not a huge problem due to the usually small number of videos cached
function getVideoStateObject(url) {
  for (var i = 0; i < videoStates.length; i++) {
    if (videoStates[i].url == url) {
      return videoStates[i];
    }
  }
  return null;
}