'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function(reg) { // sw.js muss in app root
    //console.log(reg);
  }).catch(function(err) {
    console.log(err);
  });

}

function requestOfflineSync() {
  navigator.serviceWorker.ready.then(function(swRegistration) {
    return swRegistration.sync.register('myFirstSync');
  });
}

function sendPOST() {
  var xhttp = new XMLHttpRequest();
  // xhttp.onreadystatechange = function() {
  //   if (xhttp.readyState == 4 && xhttp.status == 200) {
  //     document.getElementById("demo").innerHTML = xhttp.responseText;
  //   }
  // };
  xhttp.open("POST", "https://jsonplaceholder.herokuapp.com/posts", true);
  xhttp.setRequestHeader("Content-Type", "application/json");
  xhttp.setRequestHeader("Custom-Header", "lkajsdl123ds1sd");
  xhttp.send(JSON.stringify({
    some: 'data'
  }));
}

function sendGET(bypass) {
  var xhttp = new XMLHttpRequest();
  xhttp.open("GET", "https://jsonplaceholder.herokuapp.com/posts", true);

  if (bypass) {
    xhttp.setRequestHeader("bypass-cache", "true");
  }

  xhttp.send();
}

// Message based communication with service worker

function askServiceWorker() {
  sendMessage({
    command: 'keys'
  }).then(function(data) {
    console.log('Service Worker Response:', data);
  })
}

function sendMessage(message) {
  // This wraps the message posting/response in a promise, which will resolve if the response doesn't
  // contain an error, and reject with the error if it does. If you'd prefer, it's possible to call
  // controller.postMessage() and set up the onmessage handler independently of a promise, but this is
  // a convenient wrapper.
  return new Promise(function(resolve, reject) {
    var messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = function(event) {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };

    // This sends the message data as well as transferring messageChannel.port2 to the service worker.
    // The service worker can then use the transferred port to reply via postMessage(), which
    // will in turn trigger the onmessage handler on messageChannel.port1.
    // See https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage
    navigator.serviceWorker.controller.postMessage(message,
      [messageChannel.port2]);
  });
}
