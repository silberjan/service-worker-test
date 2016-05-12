# Video Worker Test

### Video Stuff

#### Random Notes
- The Service Worker's `fetch` does not currently seem to work with `mp4`-Video in Chrome ([see also](https://bugs.chromium.org/p/chromium/issues/detail?id=546076)). **Solution:** Use current Chrome Canary.
- In Chrome, you might need to disable the browser cache in the developer tools.

#### Strategy
An array of all currently saved videos is held persistently so asynchronous existence checks are possible (querying the IndexedDB through _localforage_ is asynchronous).

For every request of a .mp4 video the Service Worker intercepts:
1. Check whether we already stored the video in IndexedDB by looking it up in the array.
1. If it has **already been stored**:
   - Get the video from the IndexedDB as a `blob`.
   - Slice the requested part out of the video according to the request's `range` header.
   - Send a response with code `206 Partial Content` containing the video data. This allows the user to skip around in the video.
1. If the video is **not yet stored**:
   - Send a separate request to the video server and retrieve the video as a `blob`.
   - Store the video in the IndexedDB via *localforage*.
   - **The initial intercepted request is not handled any further.** This triggers the browser to handle it itself again. Using the usual method of just calling `event.respondWith(fetch(request))` like with other requests I ran into the following problems:
     - The video server would not answer with `206 Partial Content` but with `200 OK` disallowing the user to skip in the player.
     - The whole video would be fetched instead of the parts that were needed, resulting in lots of traffic on initial loads.

### Dependencies
- node/npm
- grunt (```npm install grunt-cli -g```)

### Setup

1. Install everything: ```npm install```
2. Start the server: ```grunt```
