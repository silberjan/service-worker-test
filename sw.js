'use strict';

self.importScripts("./js/localforage.js");

//// CONFIGURATION > START
const successHandlers = [
  {
    method: 'GET',
    pattern: /^((?!CcOLGxlWEAAwHm5).)*$/, // everything else than the image
    cache: true
  },
  {
    method: 'GET',
    pattern: /((?:posts))$/, // only post request
    bodyHandler: function(body) {
      var request = new Request('https://jsonplaceholder.herokuapp.com/comments');
      handleStaticsFetch(request);
    }
  }
];
const preCacheResources = [
  './',
  './css/master.css',
  './index.html',
  './js/main.js',
  './js/localforage.js',
  './js/quotaManagement.js'
];
const DEBUG = 'log';
const CACHE_VERSION = 'v1';
//// CONFIGURATION > END


var cache;
// array and enum to store the states of all currently stored videos so we can synchronously
// decide whether to use a fallback response
var videoStates = [];
var VideoState = Object.freeze({
  UNKNOWN: "UNKNOWN",     // video is not known, i.e., not available
  LOADING: "LOADING",     // video is currently loading
  AVAILABLE: "AVAILABLE" // video is fully available in IndexedDB
});
var VIDEO_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

var videoStore;
var requestStore;

if (DEBUG == 'info') {
  console.log = function() {};
}
if (DEBUG == 'error') {
  console.log = function() {};
  console.info = function() {};
}

// Service worker install event
self.addEventListener('install', installServiceWorker);

// Service worker activate event
self.addEventListener('activate', activateServiceWorker);

// Service worker fetch event
self.addEventListener('fetch', handleFetch);

// Service worker sync event
self.addEventListener('sync', handleSync);

// init
setupVideoCache();
setupRequestStore();


///////////
// SETUP //
///////////

function installServiceWorker(event) {

  console.log("🌕 Installing service worker version " + CACHE_VERSION + " ...");

  event.waitUntil(
    Promise.all([
      setupStaticsCache()
    ])
  );
  console.info('✅ Installed service worker version ' + CACHE_VERSION);
}

function activateServiceWorker(event) {

    console.log("🌑 Activating service worker version " + CACHE_VERSION + "...");

    event.waitUntil(
      handleNewVersion().then(function() {
        console.info("✔ Activated service worker version " + CACHE_VERSION);
      })
    );

}

// open and populate cache
function setupStaticsCache() {
  caches.open(CACHE_VERSION).then(function(theCache) {
    cache = theCache;
    return cache.addAll(preCacheResources);
  });
}

// gather all URLs of currently stored videos
function setupVideoCache() {
  videoStore = localforage.createInstance({
    name: 'videoStore',
    description: 'Stores cached videos.'
  });

  videoStore.keys().then(function(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].substring(0,4) == "http") {
        updateVideoState(keys[i], VideoState.AVAILABLE);
      }
    }
  });
}

// create store for requests
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

  switch (event.request.method) {

    case 'PUT':
    case 'DELETE':
    case 'POST':
      return handleWriteFetch(event);
      break;

    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
    default:
      return handleReadFetch(event);
      break;

  }

}

function handleWriteFetch(event) {
  event.respondWith(handleWriteFetchRequest(event));
}

function handleReadFetch(event) {
  if (event.request.url.indexOf('.mp4') >= 0) {
    return handleVideoFetch(event);
  } else {
    return event.respondWith(handleStaticsFetch(event.request));
  }
}


///////////////////
// READ REQUESTS //
///////////////////

// Try to fulfill the read request.
function handleStaticsFetch(request) {

  if (request.headers.get('bypass-cache')) {

    // bypass cache the cache
    console.info("➠ bypass Cache", request.url);
    return handleUncachedRequest(request);

  } else {

    // check the cache
    return caches.match(request).then(function(response) {
      if (response) {
        console.log("★ Cache Hit", request.url);
        return response;
      }
      console.log("❗ Cache Miss", request.url);

      return handleUncachedRequest(request);
    });

  }
}

// Try to execute a normal read request.
function handleUncachedRequest(request) {
  return fetch(request.clone()).then(function(response) {
    console.log('🖧 Response for %s from network is: %O', request.url, response);

    if (response.status < 400) {

      // What else to do with the response?
      handleNewSuccessfulResponse(request, response);

      // Seams to work, so lets check to send our queued requests.
      replayPOSTRequests();
    }

    // Return the original response object, which will be used to fulfill the resource request.
    return response;
  });
}

// Use Response to perform additional actions.
function handleNewSuccessfulResponse(request, response) {

  // apply all handlers
  for (var handler of successHandlers) {
    if (request.method === handler.method && handler.pattern.exec(request.url) != null) {
      if (handler.cache) {
        cache.put(request, response.clone());
      }
      if (handler.bodyHandler) {
        const myHandler = handler;
        response.clone().json().then(function(body) {
          myHandler.bodyHandler(body);
        });
      }
    }
  }

}


///////////////////
// WRITE REQUEST //
///////////////////

// Try to execute a normal write request.
function handleWriteFetchRequest(event) {

  // Try to perform the request:
  return fetch(event.request.clone())
    .then(function(response) {
      console.log('🖧 Response for %s from network is: %O', event.request.url, response);

      if (response.status < 400) {
        // Seams to work, so lets check to send our queued requests.
        replayPOSTRequests();
      } else if (response.status >= 500) {
        // We want to retry it if a HTTP 5xx response was returned,
        // just like we'd retry it if the network was down.
        saveWriteRequest(event);
      }

      // Return the original response object, which will be used to fulfill the resource request.
      return response;
    }).catch(function(error) {
      // The catch() will be triggered for network failures. Let's see if it was a request we
      // are looking for, and save it to be retried if it was.
      saveWriteRequest(event);

      throw error;
    });

}

// Save the failed request so it can be replayed later.
function saveWriteRequest(event) {
  return event.request.json().then(function(body) {

    var headers = {};
    for (var pair of event.request.headers.entries()) {
      headers[pair[0]] = pair[1];
    }

    var timestamp = Date.now();
    var save = {
      timestamp: timestamp,
      url: event.request.url,
      method: event.request.method,
      headers: headers,
      body: body
    };

    requestStore.setItem(timestamp.toString(), save)
      .then(function(data) {
        console.info('Saved write request', data);

        // request to sync pending requests when connection is back up
        self.registration.sync.register('ReplaySync');
      })
      .catch(function(error) {
        console.error('Failed to store write request', error);
      });
  });
}

// Replay the stored requests.
function replayPOSTRequests() {
  return requestStore.iterate(function(storedRequest, key) {

    var request = {
      method: storedRequest.method,
      body: JSON.stringify(storedRequest.body),
      headers: storedRequest.headers
    };
    console.log('↻ Replaying', storedRequest.url, request);

    fetch(storedRequest.url, request)
      .then(function(response) {
        if (response.status < 500) {
          // If sending the request and the handling by the server was successful, then remove it from the IndexedDB.
          requestStore.removeItem(key);
          console.info('↻ Replaying succeeded', response);
        } else {
          // This will be triggered if, e.g., the server returns a HTTP 50x response.
          // The request will be replayed the next time the service worker starts up.
          throw new Error('↻ Replaying failed with status', response.status);
        }
      })
      .catch(function(error) {
        // This will be triggered if the network is still down. The request will be replayed again
        // the next time the service worker starts up.
        console.error(' Replaying failed:', error);

        // request to sync pending requests when connection is back up
        // TODO: sync implementation is unstable, we don't call it here again to avoid endless cycles
        // self.registration.sync.register('ReplaySync');
      });

  });
}


///////////////////
// VIDEO REQUEST //
///////////////////

function handleVideoFetch(event) {
  console.log("📼 Video Request (Range " + event.request.headers.get('range') + ")", event.request);

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

function returnVideoFromIndexedDB(event) {
  var url = event.request.url;
  var range = event.request.headers.get('range');

  event.respondWith(videoStore.getItem(url).then(function(videoInfo) {
    if (videoInfo === null) {
      // for some reason we could not retrieve the video from the database despite the video status
      // being AVAILABLE (most likely because the user or browser deleted the video from the IndexedDB),
      // so just add it again and delegate the work of getting the video to the external URL
      updateVideoState(url, VideoState.UNKNOWN);
      addVideoToIndexedDB(url);

      throw "Could not retrieve video status from IndexedDB.";
    }

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
      ranges.push(videoInfo.videoSize);
    }

    // retrieve the chunks we need from the IndexedDB
    var chunkFrom = Math.floor(ranges[0] / videoInfo.chunkSize);
    var chunkTo = Math.floor(ranges[1] / videoInfo.chunkSize);
    var promises = [ videoInfo, ranges ];
    for (var i = chunkFrom; i <= chunkTo; i++) {
      promises.push(videoStore.getItem(i + "_" + url));
    }

    return Promise.all(promises);
  }).then(function(data) {
    var videoInfo = data[0];
    var ranges = data[1];
    var chunks = data.slice(2);

    // check if we successfully got all chunks
    for (var i = 0; i < chunks.length; i++) {
      if (chunks[i] === null) {
        throw "Could not retrieve chunk " + i + ".";
      }
    }

    // slice the edge chunks to fit the requested byte range
    chunks[chunks.length - 1] = chunks[chunks.length - 1].slice(0, 1 + (ranges[1] % videoInfo.chunkSize));
    if (ranges[0] % videoInfo.chunkSize != 0) {
      chunks[0] = chunks[0].slice(ranges[0] % videoInfo.chunkSize, chunks[0].size, 'video/mp4');
    }

    // concatenate the chunks
    var output = new Blob(chunks, { type: 'video/mp4' });

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
          ['Content-Range', 'bytes ' + ranges[0] + '-' + (ranges[1] - 1) + '/' + videoInfo.videoSize]
        ]
      }
    );
  }).catch(function(err) {
    // some exception occured while retrieving and serving the video, e.g. a failure
    // of IndexedDB or localforage.
    console.log("📼 Could not retrieve and serve the video! ", err)

    // TODO: somehow achieve a stream here so that video skipping is possible
    return fetch(new Request(event.request.url))
  }));

  /*
    Future Work: Stream Support

    Instead of returning the whole BLOB "output" above at once, a HTTP byte stream would be
    a far nicer solution. This is very experimental, however, and at the time of writing this
    (2016-06-16) is not supported by Chrome. A very nice article explaining it can be found here:
      * https://jakearchibald.com/2016/streams-ftw/
    The basic idea is to open a ReadableStream and return it instead of "output". The media
    player would then regularly poll this stream and request new video bytes. A barebone
    implementation looks like this:

    <code>
    var stream = new ReadableStream({
      type: 'bytes',
      start(controller) {
        // nothing to do here
      },
      pull(controller) {
        controller.enqueue(
          // return the next controller.desiredSize bytes of the video as a BLOB
        );
      },
      cancel(reason) {
        // free the memory, etc
      }
    }, { highWaterMark: <maximum bytes to enqueue>, size(chunk) { return chunk.size; }} );

    return new Response(
      stream,
      [...]
    );
    </code>

    The standard for streams (https://streams.spec.whatwg.org/) is unfortunately quite fluid
    at the moment and the implementation changes very frequently.
  */
}

// initiate the download of the video with the given url if not already underway
function addVideoToIndexedDB(url) {
  switch (getVideoState(url)) {
    case VideoState.UNKNOWN:
      // we do not yet have the video, so load it and store it as a blob...
      updateVideoState(url, VideoState.LOADING);

      //TODO avoid the second request and find a way to directly attach to the stream
      //     info on cloning response streams: http://www.html5rocks.com/en/tutorials/service-worker/introduction/
      //     transform streams might also be useful: https://streams.spec.whatwg.org/#ts
      var request = new Request(url);
      fetch(request).then(function(response) {
        // we got the video, now convert it to a blob
        return response.blob();
      }).then(function(blob) {
        // split up video into chunks of the size specified by VIDEO_CHUNK_SIZE and store them
        var chunkCount = Math.ceil(blob.size / VIDEO_CHUNK_SIZE);
        var videoInfo = {
          url: url,
          videoSize: blob.size,
          chunkSize: VIDEO_CHUNK_SIZE,
          chunkCount: chunkCount
        }
        var promises = [ videoStore.setItem(url, videoInfo) ];
        for (var i = 0; i < chunkCount; i++) {
          promises.push(
            videoStore.setItem(
              i + "_" + url,
              blob.slice(i * VIDEO_CHUNK_SIZE, (i+1)*VIDEO_CHUNK_SIZE, 'video/mp4')
            )
          );
        }
        return Promise.all(promises);
      }).then(function(item) {
        // it worked, we are done!
        updateVideoState(url, VideoState.AVAILABLE);
        console.info("📼 Finished downloading and storing video: " + url);
      }).catch(function(err) {
        // something went wrong, log that and reset the video status
        updateVideoState(url, VideoState.UNKNOWN);
        console.error("📼 Could not download video: " + url, err);
      });

    default:
      // cancel if we already have the video or are currently downloading it
      break;
  }
}

// update the state of the video with the given url
function updateVideoState(url, state) {
  console.log("📼 Update Video State: "+state+" => "+url);
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


//////////
// SYNC //
//////////

function handleSync(event) {

  switch (event.tag) {

    // sync event to replay POST requests
    case 'ReplaySync':
      console.log('do ReplaySync');
      // TODO: pass promise to tell sync if it has to try again
      event.waitUntil(replayPOSTRequests());
      break;

    // test sync requested by the user
    case 'myFirstSync':
      console.log('do myFirstSync');
      event.waitUntil(function() {
      });
      break;

  }
}


/////////////
/// UPDATE //
/////////////

function handleNewVersion() {

  var promise = new Promise(function(resolve, reject) {

    // TODO: perform cleanup of caches
    // https://github.com/GoogleChrome/samples/blob/gh-pages/service-worker/offline-analytics/service-worker.js#L121

    resolve();
  });

  return promise;

}
