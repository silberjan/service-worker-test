'use strict';

if ('serviceWorker' in navigator) {
 console.log('Service Worker is supported');
 navigator.serviceWorker.register('/sw.js').then(function(reg) { // sw.js muss in app root
   console.log(reg);
   // TODO
 }).catch(function(err) {
   console.log(err);
 });
}


// function httpGetAsync(url, callback)
// {
//     var xmlHttp = new XMLHttpRequest();
//     xmlHttp.onreadystatechange = function() {
//         if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
//             callback(xmlHttp.responseText);
//     }
//     xmlHttp.open("GET", url, true); // true for asynchronous
//     xmlHttp.send(null);
// }


// (function getCatImages() {

//   let url = "https://api.flickr.com/services/feeds/photos_public.gne?format=json&tags=cat#";

//   httpGetAsync(url,function(result){

//     console.log(result);

//   });

// })();

