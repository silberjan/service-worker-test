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
	
	// check if we already have the video in the localforage
	return localforage.getItem(url).then((item) => {
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
			return fetch(event.request);			
		}

		// we have the video in localforage, so just return the requested part
		return new Response(item);
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