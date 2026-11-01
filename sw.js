/* Preview shell only. No API, private pages, or remote photos are cached. */
const CACHE='moment-link-preview-v3';
const FILES=['index.html','app.js','styles.css','manifest.webmanifest','assets/icon.svg'];
const urls=FILES.map(p=>new URL(p,self.registration.scope).href);
const rootURL=new URL('./',self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(urls))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moment-link-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||(!urls.includes(e.request.url)&&e.request.url!==rootURL))return;
 const key=e.request.url===rootURL?new URL('index.html',self.registration.scope).href:e.request.url;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,clone)))}return r}).catch(()=>caches.match(key).then(r=>r||Response.error())));
});
