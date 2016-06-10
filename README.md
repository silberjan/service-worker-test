# Service Worker Test

Sample App that integrates Service Workers to have a offline available page. The [static files](#statics-caching) like `index.html` and its dependencies are cached. This also includes precaching of the embedded [videos](#video-stuff). [POST requests](#replay-post-requests) are stored when they can't be resolved and are replayed as soon as the connection is up again.

- [Statics Caching](#statics-caching)
- [User Interaction](#user-interaction)
- [Video Stuff](#video-stuff)
- [Quota Management](#quota-management)
- [Replay POST Requests](#replay-post-requests)
- [Dependencies/Setup](#dependencies)
- [Usage](#usage)



## Statics Caching

The important static dependencies are pre-cached and will be returned in a cache-first approach.

## User Interaction

- **Question:** How transparent should the offline-feature be? Should the user enable it explicitely or not? Should the user do anything active to enable/use offline mode?
  - *If not:*
    1. How does a user react if a page downloads >1GB of data without asking?
	1. Persistent storage would not be usable as the user has to accept the requested quota (see [Quota Management](#quota-management)).
- **Idea for displaying offline status infos** without making the service worker intransparent to the client:
  - Introduce API endpoints into the Xikolo API to query for the offline availability or sync status of specific items/sections.
  - Query these endpoints from Ember to display offline status (f.e. by displaying a green bar above the navigation item).
  - The online server statically returns a negative response to any of these requests (i.e. "No, nothing is available offline").
  - The service worker intercepts these requests and instead responds with a positive reply according to its current status (e.g. "The section is available offline" or "The quiz result was not yet synced to the server").
  - Thus, the absence of the service worker does not break the system and no specific code is needed for the frontend to communicate with the service worker.

## Video Stuff

#### Random Notes
- The Service Worker's `fetch` does not currently seem to work with `mp4`-Video in Chrome ([see also](https://bugs.chromium.org/p/chromium/issues/detail?id=546076)). **Solution:** Use current Chrome Canary.
- In Chrome, you might need to disable the browser cache in the developer tools.

#### Strategy
An array of all currently saved videos is held persistently so asynchronous existence checks are possible (querying the IndexedDB through _localforage_ is asynchronous).

For every request of a .mp4 video the Service Worker intercepts:

1. Check whether we already stored the video in IndexedDB by looking it up in the array.

2. If it has **already been stored**:
   - Get the video from the IndexedDB as a `blob`.
   - Slice the requested part out of the video according to the request's `range` header.
   - Send a response with code `206 Partial Content` containing the video data. This allows the user to skip around in the video.
   
3. If the video is **not yet stored**:
   - Send a separate request to the video server and retrieve the video as a `blob`.
   - Store the video in the IndexedDB via *localforage*.
   - **The initial intercepted request is not handled any further.** This triggers the browser to handle it itself again. Using the usual method of just calling `event.respondWith(fetch(request))` like with other requests I ran into the following problems:
     - The video server would not answer with `206 Partial Content` but with `200 OK` disallowing the user to skip in the player.
     - The whole video would be fetched instead of the parts that were needed, resulting in lots of traffic on initial loads.

## Quota Management
- As of right now, IndexedDB is considered a **temporary** storage:
  
  https://developer.chrome.com/apps/offline_storage#table
  
  This means that it is not possible to manually request a specific quota, it is fixed (to roughly 1278MB on both my computers).
  Besides, the browser may delete any data at its own discretion, most likely using a LRU policy.
  This also means that other data stored in IndexedDB (namely POST requests) might get purged when too many videos get cached.
- In the next version of IndexedDB, this is expected to change. IndexedDB would then be able to store both temporary and persistent storage according to the developer's wishes.
  - Note in the Quota Management API draft: https://www.w3.org/TR/quota-api/#quota-handling-in-storage-apis
  - Chrome future development: https://developer.chrome.com/apps/offline_storage#future
  - Current IndexedDB API draft: http://w3c.github.io/IndexedDB/
  
  Unfortunately, Chrome does not implement that behavior yet as testified by the output of the Quota Management API in our test application.

- **Possible solutions**:
  - *Stay with IndexedDB* and try to manually handle the quota before the browser steps in.
    Once IndexedDB gets support for persistent storage it can easily be migrated.
  - *Move to the persistent File System API* (nice secondary effect: strict separation of video data and POST requests).

  In both cases, eventually using persistent storage would make it necessary for the user to manually allow offline storage, essentially making the offline feature modal.
  
## Replay POST Requests

#### Strategy

1. Whenever a POST request made by the application fails (because the server is not reachable or the server returns a status code >= 500) it gets stored in an indexDB instance.

2. When the the Service Worker starts the next time or when an another network requests gets resolved we try to replay the queued requests.

3. Also Background Sync tries to replay the request as soon as possible. We request the browser to notify us when the connection is up again and then replay the requests. (does only work right if the hardware connection is really offline, chrome network throttle is ignored)



## Dependencies

- node/npm
- grunt (```npm install grunt-cli -g```)
- build dependencies: ```npm install```


## Usage

Start the server: ```grunt```
The page will be served on [http://localhost:1337/](http://localhost:1337/)
