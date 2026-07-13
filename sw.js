const CACHE='organizealot-v2-1-0-build-012';
const ASSETS=['./','./index.html?v=2.1.0-build-012','./styles.css?v=2.1.0-build-012','./app.js?v=2.1.0-build-012','./manifest.json?v=2.1.0-build-012','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(
    fetch(e.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html?v=2.1.0-build-012')))
  );
});
