const CACHE="invest-play-shell-classroom-beginner-v3.4-news-context";
const STATIC=["/","/app.js","/style.css","/mobile-v32.css","/audio/notify.wav","/audio/ambient.wav",
"/art/article-rates.webp","/art/article-geopolitics.webp",
"/art/article-health.webp",
"/art/article-energy.webp",
"/art/article-trade.webp",
"/art/article-tech.webp",
"/art/article-inflation-rise.webp",
"/art/article-inflation-cool.webp",
"/art/article-banks.webp"];
self.addEventListener("install",event=>event.waitUntil(
  caches.open(CACHE).then(async cache=>{
    await Promise.all(STATIC.map(async url=>{try{await cache.add(url);}catch{/* offline cache is optional */}}));
    self.skipWaiting();
  })
));
self.addEventListener("activate",event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith("invest-play-shell-")&&x!==CACHE).map(x=>caches.delete(x))))
  .then(()=>self.clients.claim())
));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).pathname.startsWith("/api/"))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
