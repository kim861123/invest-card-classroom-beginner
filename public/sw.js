const CACHE="invest-play-easy-v500-softlight";
const STATIC=["/","/app.js","/style.css","/editorial.css","/mobile-v32.css","/mobile-v35.css",
 "/audio/notify.mp3","/audio/ambient.mp3"];
 // 뉴스 이미지는 기사 열람 시 필요한 크기만 요청합니다. 전 종류 사전 다운로드 금지.
self.addEventListener("install",event=>event.waitUntil(
  caches.open(CACHE).then(async cache=>{
    await Promise.all(STATIC.map(async url=>{try{await cache.add(url);}catch{/* offline cache is optional */}}));
    self.skipWaiting();
  })
));
self.addEventListener("activate",event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith("invest-play-")&&x!==CACHE).map(x=>caches.delete(x))))
  .then(()=>self.clients.claim())
));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).pathname.startsWith("/api/"))return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
