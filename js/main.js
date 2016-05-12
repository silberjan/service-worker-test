'use strict';

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').then(function(reg) { // sw.js muss in app root
		//console.log(reg);
	}).catch(function(err) {
		console.log(err);
	});
}

