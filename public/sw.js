const CACHE="invest-play-shell-classroom-beginner-v3-editorial";
const STATIC=["/","/app.js","/style.css","/editorial.css","/manifest.webmanifest","/icon-192.png","/icon-512.png","/art/market-horizon.webp","/art/exchange-handshake.webp","/art/news-signal.webp","/art/victory-market.webp"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x!==CACHE).map(x=>caches.delete(x))))));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
