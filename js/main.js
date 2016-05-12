'use strict';

if ('serviceWorker' in navigator) {
	console.log('Service Worker is supported');
	navigator.serviceWorker.register('/sw.js').then(function(reg) { // sw.js muss in app root
		console.log(reg);
	}).catch(function(err) {
		console.log(err);
	});
}

