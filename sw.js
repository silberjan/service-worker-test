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
	return fetch(event.request);
	
	// do something
	fetch(event.request).then(function(response) {
		console.log("Video Response", response);
	});
}

this.addEventListener('fetch',(event) => {
	
	// handle videos differently
	if (event.request.url.indexOf('.mp4') >= 0) {
		console.log("Video (Range "+event.request.headers.get('range')+")", event.request);
		return handleVideo(event);
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
					return Response('fallback');
				})
		);
	}
});