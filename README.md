# Service Worker Test

Sample App that integrates Service Workers to have a offline available page. The [static files](#statics-caching) like `index.html` and its dependencies are cached. This also includes precaching of the embedded [videos](#video-stuff). [POST requests](#replay-post-requests) are stored when they can't be resolved and are replayed as soon as the connection is up again.

- [Statics Caching](#statics-caching)
- [Video Stuff](#video-stuff)
- [Replay POST Requests](#replay-post-requests)
- [Dependencies/Setup](#dependencies)
- [Usage](#usage)



## Statics Caching

The important static dependencies are pre-cached and will be returned in a cache-first approach.



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
