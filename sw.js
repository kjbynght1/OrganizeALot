const CACHE='organizealot-v2-1-0-build022-r2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.json','./icon.svg','https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(ASSETS.map(url=>cache.add(url)))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});return resp;}).catch(()=>hit)));});
