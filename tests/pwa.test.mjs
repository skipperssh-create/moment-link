import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const origin='https://link.teamboatn.com';
const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
function worker(){
  const listeners={},entries=new Map(),notifications=[];
  let offline=false,claimed=false,skipped=false;
  const windows=[],opened=[];
  const cache={addAll:async urls=>{for(const url of urls)entries.set(url,new Response('cached '+new URL(url).pathname));},put:async(url,response)=>entries.set(url,response)};
  vm.runInNewContext(source,{
    URL,Response,
    self:{location:{origin},registration:{scope:origin+'/',showNotification:async(title,options)=>notifications.push({title,options})},addEventListener:(type,fn)=>{listeners[type]=fn;},skipWaiting:async()=>{skipped=true;}},
    caches:{open:async()=>cache,match:async key=>entries.get(key)?.clone(),keys:async()=>[],delete:async()=>true},
    clients:{claim:async()=>{claimed=true;},matchAll:async()=>windows,openWindow:async url=>{opened.push(url);}},
    fetch:async request=>{if(offline)throw new TypeError('Network unavailable');return new Response('fresh '+new URL(request.url).pathname);}
  });
  return {entries,notifications,windows,opened,get claimed(){return claimed;},get skipped(){return skipped;},set offline(value){offline=value;},
    async dispatch(type,data={}){
      const waits=[];let response;
      listeners[type]({...data,waitUntil:p=>waits.push(p),respondWith:p=>{response=p;}});
      const result=await response;await Promise.all(waits);return result;
    }
  };
}

test('PWA keeps its root identity and provides standalone and maskable icons',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(i=>i.sizes==='192x192'&&i.type==='image/png'));
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
});

test('public shell works offline while requests, admin data and photos bypass the cache',async()=>{
  const w=worker();await w.dispatch('install');await w.dispatch('activate');
  assert.ok(w.skipped&&w.claimed);
  const live=await w.dispatch('fetch',{request:{url:origin+'/',method:'GET'}});
  assert.equal(await live.text(),'fresh /');
  w.offline=true;
  assert.equal(await (await w.dispatch('fetch',{request:{url:origin+'/',method:'GET'}})).text(),'fresh /');
  for(const path of ['/app.js','/admin.js','/pricing.js','/pwa.js','/styles.css','/assets/icon-192.png','/assets/moment-new-consultation.mp3']){
    const response=await w.dispatch('fetch',{request:{url:origin+path,method:'GET'}});assert.equal(response.status,200,path);
  }
  for(const [url,method] of [[origin+'/api/catalog','GET'],[origin+'/api/admin/consultations','GET'],[origin+'/api/media/private-photo','GET'],[origin+'/api/consultations','POST'],[origin+'/?private=example','GET'],['https://external.invalid/photo.jpg','GET'],[origin+'/app.js','POST']]){
    const before=w.entries.get(url);
    assert.equal(await w.dispatch('fetch',{request:{url,method}}),undefined,url);
    assert.equal(w.entries.get(url),before,url);
  }
});

test('notifications use brand assets and generic content; clicks reopen the correct consultation',async()=>{
  const w=worker(),target='/#admin/request/11111111-1111-4111-a111-111111111111';
  await w.dispatch('push',{data:{json:()=>({url:target,body:'PRIVATE',icon:'https://external.invalid/logo.png'})}});
  const notice=w.notifications[0];
  assert.equal(notice.options.icon,'/assets/icon-192.png');assert.equal(notice.options.badge,'/assets/notification-badge.png');
  assert.ok(!JSON.stringify(notice).includes('PRIVATE'));assert.ok(!JSON.stringify(notice).includes('external.invalid'));
  let closed=false;await w.dispatch('notificationclick',{notification:{data:notice.options.data,close:()=>{closed=true;}}});
  assert.ok(closed);assert.deepEqual(w.opened,[target]);
  let navigated,focused=false;w.windows.push({url:origin+'/',navigate:async url=>{navigated=url;},focus:async()=>{focused=true;}});
  await w.dispatch('notificationclick',{notification:{data:notice.options.data,close:()=>{}}});
  assert.equal(navigated,target);assert.ok(focused);assert.equal(w.opened.length,1);
  await w.dispatch('push',{data:{json:()=>({url:'https://external.invalid/'})}});
  assert.equal(w.notifications[1].options.data.url,'/#admin');
  await w.dispatch('push',{data:{json:()=>{throw Error('Malformed payload');}}});
  assert.equal(w.notifications[2].options.data.url,'/#admin');
});


test('background notification requests sound and vibration and identifies device-only tests',async()=>{
 const w=worker();await w.dispatch('push',{data:{json:()=>({type:'device-test',url:'/#admin'})}});
 assert.equal(w.notifications[0].title,'모먼트링크 테스트 알림');assert.equal(w.notifications[0].options.silent,false);
 assert.deepEqual(Array.from(w.notifications[0].options.vibrate),[200,100,200]);assert.equal(w.notifications[0].options.data.url,'/#admin');
});
