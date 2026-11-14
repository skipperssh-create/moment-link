/* Public shell only. No API, private pages, or remote photos are cached. */
const CACHE='moment-link-shell-v124';
const FILES=['index.html','app.js','admin.js','ownership.js','notification-sound.js','push-device.js','pricing.js','booking-addons.js','messages.js','ops-ui.js','time-picker.js','message-ui.js','booking-ui.js','pwa.js','styles.css','guide.html','guide.css','guide.js','manifest.webmanifest','assets/moment-new-consultation.mp3','assets/icon.svg','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png','assets/apple-touch-icon.png','assets/notification-badge.png','assets/favicon-32.png'];
const urls=FILES.map(p=>new URL(p,self.registration.scope).href);
const rootURL=new URL('./',self.registration.scope).href;
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(urls)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('moment-link-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||(!urls.includes(e.request.url)&&e.request.url!==rootURL))return;
 const key=e.request.url===rootURL?new URL('index.html',self.registration.scope).href:e.request.url;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(key,clone)))}return r}).catch(()=>caches.match(key).then(r=>r||Response.error())));
});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}event.waitUntil(self.registration.showNotification(data.type==='device-test'?'모먼트링크 테스트 알림':'모먼트링크 새 상담',{body:data.type==='device-test'?'이 기기의 알림이 표시되었습니다. 소리·진동은 휴대폰 알림 설정을 따릅니다.':'접수함에서 신청 내용을 확인해 주세요.',silent:false,vibrate:[200,100,200],requireInteraction:true,tag:typeof data.tag==='string'?data.tag:'new-consultation',icon:'/assets/icon-192.png',badge:'/assets/notification-badge.png',data:{url:/^\/#admin\/request\/[a-f0-9-]{36}$/.test(data.url)?data.url:'/#admin'}}));});
self.addEventListener('notificationclick',event=>{const target=event.notification.data?.url||'/#admin';event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const win=windows.find(w=>new URL(w.url).origin===self.location.origin);if(win){await win.navigate(target);return win.focus();}return clients.openWindow(target);}));});
