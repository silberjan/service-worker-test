'use strict';

this.importScripts("/js/localforage.js");

// Service worker install event
this.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open('v1').then((cache) => {
			return cache.addAll([
				'/',
				'/index.html',
				'/js/main.js'
			]);
		})
	);
	console.log('Installed', event);
});

function handleUncachedRequest(request) {
	return fetch(request);
};

function handleVideo(event) {
	var url = event.request.url;
	var range = event.request.headers.get('range');
	
	// check if we already have the video in the localforage
	return localforage.getItem(url).then((item) => {
		if (item === null) {
			// we do not yet have the video, so load it and store it as a blob...
			// TODO: avoid loading the same video multiple times by for example storing currently
			// loading videos in the database
			var request = new Request(url);
			fetch(request)
				.then((response) => {
					return response.blob();
				})
				.then((blob) => {
					localforage.setItem(url, blob, function (item, err) {
					console.log("Finished downloading and storing video."+url, blob);
				});
			});
			
			// ... and at the same time supply the video from the external server
			// TODO: let the request fall through completely so the browser takes control of the
			// request again allowing for skipping and partial responses from the external server
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
		var ranges = rangeString.split('-', 2).filter((x) => { return x != ""; });
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
					['Content-Range', 'bytes '+ranges[0]+'-'+(ranges[1]-1)+'/'+item.size],
				]
			}
		);
	});
}

this.addEventListener('fetch', (event) => {
	// handle videos separately
	if (event.request.url.indexOf('.mp4') >= 0) {
		console.log("Video (Range "+event.request.headers.get('range')+")", event.request);
		event.respondWith(handleVideo(event));
	}
	// for all other content: look in the cache and otherwise perform an external request
	else {
		event.respondWith(
				caches.match(event.request).then((response) => {
					if (response) {
						console.log("Cache Hit", event.request);
						return response;
					}
					console.log("Cache Miss", event.request);
					return handleUncachedRequest(event.request);
				}).catch(() => {
					console.log("Fallback", event.request);
					return new Response('fallback');
				})
		);
	}
});