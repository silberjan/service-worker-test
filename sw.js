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
		console.log(item);
		if (item === null) {
			// we do not yet have the video, so load it and store it...
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
			// request again allowing for skipping and partial responses
			return fetch(event.request);			
		}
		
		// remember which blob to output
		// this may change if we have ranges in the request
		var outputBlob = item;
		
		// check if we should return a specific range
		// TODO replace this with a regexp... bytes X-(Y)?
		var rangeString = range.split('=')[1];
		var ranges = rangeString.split('-', 2).filter((x) => { return x != ""; });
		if (ranges.length == 0) {
			ranges.push(0);
		}
		if (ranges.length == 1) {
			ranges.push(outputBlob.size);
		}
		if (ranges[0] != 0 || ranges[1] != outputBlob.size) {
			// slice a fitting blob
			outputBlob = outputBlob.slice(ranges[0], ranges[1], 'video/mp4');
		}

		// we have the video in localforage, so just return the requested part
		// (refer to https://bugs.chromium.org/p/chromium/issues/detail?id=575357#c10)
		// TODO: stream the video https://jakearchibald.com/2016/streams-ftw/#creating-your-own-readable-stream
		return new Response(
			outputBlob,
			{
				status: 206,
				statusText: 'Partial Content',
				headers: [
					['Connection', 'keep-alive'],
					['Content-Type', 'video/mp4'],
					['Content-Length', outputBlob.size],
					['Content-Range', 'bytes '+ranges[0]+'-'+(ranges[1]-1)+'/'+item.size],
				]
			}
		);
	});
}

this.addEventListener('fetch',(event) => {
	
	// handle videos differently
	if (event.request.url.indexOf('.mp4') >= 0) {
		console.log("Video (Range "+event.request.headers.get('range')+")", event.request);
		event.respondWith(handleVideo(event));
	}
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