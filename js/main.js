'use strict';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(function(reg) { // sw.js muss in app root
    //console.log(reg);
  }).catch(function(err) {
    console.log(err);
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
  xhttp.send(JSON.stringify({
    some: 'data'
  }));
}
