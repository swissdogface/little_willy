'use strict';
const CACHE='little-willy-2.9.4-release';
const ASSETS=['./','./index.html','./style-v2.css','./home-v29.css','./levels.js','./art.js','./engine-v2.js','./renderer.js','./game-v2.js','./web-shell.js','./soundtrack.js','./hero-adventure.png','./ice-caves-backdrop.png','./ruins-backdrop.png','./lava-backdrop.png','./alien-backdrop.png','./station-backdrop.png','./crystal-caves-backdrop.png','./moon-backdrop.png','./finale-backdrop.png','./intro.png','./title-original.png','./finale-original.png','./materials-hd.png','./manifest.webmanifest','./favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request).then(response=>response||caches.match('./index.html'))));
});
