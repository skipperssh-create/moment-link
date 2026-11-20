import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import webpush from 'web-push';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {processOutbox} from '../server/jobs.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const subscription=n=>({endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-device-'+n,keys:{p256dh:'synthetic',auth:'synthetic'},expirationTime:null});
test('device status and test are authenticated, scoped to current owner and never touch bookings',async()=>{
 const f=await ownershipFixture(),keys=webpush.generateVAPIDKeys(),sends=[],env={APP_ORIGIN:'https://test.moment-link.invalid',PUSH_LIVE_ENABLED:'true',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey};
 try{
  await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{push}','true') WHERE id='settings'");
  const app=createApp({db:f.db,env,adapters:{push:async(...args)=>sends.push(args)}});
  async function req(path,method='GET',body,user='owner-admin',csrf=true){const h={Origin:env.APP_ORIGIN,'Content-Type':'application/json',...f.sessions[user]};if(!csrf)delete h['X-CSRF-Token'];const r=await app(new Request(env.APP_ORIGIN+'/api/'+path,{method,headers:h,...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json()};}
  const a=subscription(1),b=subscription(2),foreign=subscription(3);
  assert.equal((await req('admin/push','POST',a)).status,200);assert.equal((await req('admin/push','POST',b)).status,200);
  await f.db.query('INSERT INTO moment_link.push_subscriptions(id,user_id,endpoint_hash,subscription) VALUES($1,$2,$3,$4)',[randomUUID(),f.staff['counselor-a'].id,hash(foreign.endpoint),JSON.stringify(foreign)]);
  const status=await req('admin/push?endpointHash='+hash(a.endpoint));assert.equal(status.data.registered,true);assert.equal(status.data.enabled,true);assert.equal(status.data.configured,true);assert.ok(!JSON.stringify(status.data).includes(a.endpoint));assert.ok(!JSON.stringify(status.data).includes(keys.privateKey));
  assert.equal((await req('admin/push?endpointHash='+hash(foreign.endpoint))).data.registered,false);
  assert.equal((await req('admin/push/test','POST',{endpointHash:hash(foreign.endpoint)})).status,409);
  assert.equal((await req('admin/push/test','POST',{endpointHash:hash(a.endpoint)},'counselor-a')).status,403);
  assert.equal((await req('admin/push/test','POST',{endpointHash:hash(a.endpoint)},'owner-admin',false)).status,403);
  for(let i=0;i<2;i++)assert.equal((await req('admin/push/test','POST',{endpointHash:hash(a.endpoint)})).data.state,'provider_accepted');
  assert.equal(sends.length,2);assert.equal(sends[0][0].endpoint,a.endpoint);assert.equal(JSON.parse(sends[0][1]).type,'device-test');assert.equal(sends[0][2].urgency,'high');
  assert.equal((await req('admin/push/test','POST',{endpointHash:hash(a.endpoint)})).status,429);
  assert.equal((await req('admin/push','DELETE',{endpointHash:hash(a.endpoint)})).status,200);
  assert.equal((await req('admin/push?endpointHash='+hash(a.endpoint))).data.registered,false);assert.equal((await req('admin/push?endpointHash='+hash(b.endpoint))).data.registered,true);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.consultations')).rows[0].n,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
test('new consultation push has high priority and longer offline TTL; manual tests never retry failures',async()=>{
 const f=await ownershipFixture(),keys=webpush.generateVAPIDKeys(),env={APP_ORIGIN:'https://test.moment-link.invalid',PUSH_LIVE_ENABLED:'true',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey};
 try{
  await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{push}','true') WHERE id='settings'");
  const sub=subscription('expiry');await f.request('admin/push','owner-admin','POST',sub);const row=await f.add(),id=randomUUID();await f.db.query('INSERT INTO moment_link.outbox(id,event_key,consultation_id,channel) VALUES($1,$1::uuid::text,$2,$3)',[id,row.id,'push']);let calls=0;
  const result=await processOutbox(f.db,id,env,{push:async(s,p,options)=>{calls++;assert.equal(options.TTL,3600);assert.equal(options.urgency,'high');assert.equal(JSON.parse(p).url,'/#admin/request/'+row.id);}});assert.equal(result.state,'sent');assert.equal(calls,1);
  const app=createApp({db:f.db,env,adapters:{push:async()=>{calls++;throw {statusCode:410};}}});
  const request=()=>app(new Request(env.APP_ORIGIN+'/api/admin/push/test',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...f.sessions['owner-admin']},body:JSON.stringify({endpointHash:hash(sub.endpoint)})}));
  assert.equal((await request()).status,409);assert.equal((await request()).status,409);assert.equal(calls,2);assert.equal((await f.db.query('SELECT active FROM moment_link.push_subscriptions WHERE endpoint_hash=$1',[hash(sub.endpoint)])).rows[0].active,false);
 }finally{await f.pg.close();}
});
test('client detects absent device registration without prompting; reconnection and disable only act on click',async()=>{
 const source=await readFile(new URL('../push-device.js',import.meta.url),'utf8');let prompted=0,registered=false,sub=subscription('client'),unsubscribed=0;
 sub.toJSON=()=>subscription('client');sub.unsubscribe=async()=>{unsubscribed++;};const calls=[];
 const Notification={permission:'default',requestPermission:async()=>{prompted++;Notification.permission='granted';return 'granted';}};
 const window={isSecureContext:true,Notification,PushManager:class{}},navigator={serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>sub,subscribe:async()=>sub}})}};
 vm.runInNewContext(source,{window,navigator,Notification,crypto:webcrypto,TextEncoder,Uint8Array,atob,AbortController,setTimeout,clearTimeout});
 const device=window.MomentLinkPush(async(path,method,body)=>{calls.push({path,method,body});if(method==='POST'&&path==='admin/push')registered=true;if(method==='DELETE')registered=false;return {enabled:true,configured:true,registered,vapidPublicKey:'AQID'};});
 await device.refresh(true);assert.equal(prompted,0);assert.equal(device.state().ready,false);assert.match(device.state().message,/다시 연결/);
 await device.enable();assert.equal(prompted,1);assert.equal(registered,true);await device.refresh(true);assert.equal(device.state().ready,true);
 await device.disable();assert.equal(unsubscribed,1);assert.equal(calls.find(x=>x.method==='DELETE').body.endpointHash,hash(sub.endpoint));
});

function clientFixture({api=async()=>({enabled:true,configured:true,registered:false,vapidPublicKey:'AQID'}),permission='default',ready,getSubscription,subscribe,permissionRequest,permissionQuery,pushPermissionState,fastTimeout=false}={}){
 const Notification={permission,requests:0,requestPermission(){this.requests++;this.permission='granted';return Promise.resolve('granted');}};
 let sub=null;const item={...subscription('reinstall'),toJSON:()=>subscription('reinstall'),unsubscribe:async()=>true};
 if(permissionRequest)Notification.requestPermission=function(){this.requests++;return permissionRequest(this);};
 const reg={pushManager:{permissionState:pushPermissionState,getSubscription:getSubscription||(()=>Promise.resolve(sub)),subscribe:subscribe||(async()=>{sub=item;return item;})}};
 const window={isSecureContext:true,Notification,PushManager:class{}},navigator={permissions:permissionQuery?{query:permissionQuery}:undefined,serviceWorker:{ready:ready||Promise.resolve(reg)}};
 return readFile(new URL('../push-device.js',import.meta.url),'utf8').then(source=>{
  vm.runInNewContext(source,{window,navigator,Notification,crypto:webcrypto,TextEncoder,Uint8Array,atob,AbortController,setTimeout:fastTimeout?(fn,ms)=>setTimeout(fn,ms===250?2:ms===1000?5:15):setTimeout,clearTimeout});
  return {device:window.MomentLinkPush(api),Notification};
 });
}
test('slow status lookup does not block reconnect; stale lookup cannot overwrite successful connection',async()=>{
 let release,gets=0,posts=0;
 const f=await clientFixture({api:async(path,method)=>{
  if(method==='POST'){posts++;return {};}
  if(++gets===1)return new Promise(resolve=>{release=resolve;});
  return {enabled:true,configured:true,registered:false,vapidPublicKey:'AQID'};
 }});
 const check=f.device.refresh(true);while(!release)await new Promise(r=>setImmediate(r));
 assert.equal(f.device.state().checking,true);assert.equal(f.device.state().busy,false);
 const connecting=f.device.enable();assert.equal(f.Notification.requests,1,'permission requested in the click stack');
 await connecting;assert.equal(posts,1);assert.equal(f.device.state().ready,true);
 release({enabled:true,configured:true,registered:false});await check;
 assert.equal(f.device.state().ready,true);assert.equal(f.device.state().busy,false);assert.equal(f.device.state().checking,false);
 assert.match(f.device.state().message,/연결했습니다/);
});
test('stalled server status has a deadline and connection remains available',async()=>{
 let signal;const f=await clientFixture({fastTimeout:true,api:(_p,_m,_b,s)=>{signal=s;return new Promise(()=>{});}});
 await f.device.refresh(true);assert.equal(f.device.state().busy,false);assert.equal(f.device.state().checking,false);
 assert.match(f.device.state().message,/서버 응답이 늦어/);assert.equal(signal.aborted,true);
});
test('stalled connect request releases buttons and keeps the error beside them',async()=>{
 const f=await clientFixture({fastTimeout:true,api:()=>new Promise(()=>{})});
 await assert.rejects(f.device.enable(),/서버 응답이 늦어/);
 assert.equal(f.device.state().busy,false);assert.equal(f.device.state().ready,false);
 await f.device.refresh();assert.match(f.device.state().message,/서버 응답이 늦어/);
});
test('missing worker and stalled browser subscription reads cannot lock connection forever',async()=>{
 for(const options of [{ready:new Promise(()=>{})},{getSubscription:()=>new Promise(()=>{})}]){
  const f=await clientFixture({...options,fastTimeout:true});
  await assert.rejects(f.device.enable(),/아직 시작하지|정보를 읽지/);
  assert.equal(f.device.state().busy,false);
 }
});
test('blocked permission is reported on the device card without sending a request',async()=>{
 let calls=0;const f=await clientFixture({permission:'denied',api:()=>{calls++;}});
 await assert.rejects(f.device.enable(),/알림이 차단/);
 assert.equal(calls,0);assert.equal(f.device.state().busy,false);assert.match(f.device.state().message,/설정에서 허용/);
});
test('failed subscription save never reports connected and reports the server reason inline',async()=>{
 const f=await clientFixture({api:async(_p,m)=>{if(m==='POST')throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 await assert.rejects(f.device.enable(),/로그인이 만료/);assert.equal(f.device.state().ready,false);
 assert.match(f.device.state().message,/로그인이 만료/);assert.equal(f.device.state().busy,false);
});
test('logout/reset during connection cannot save a subscription for the next session',async()=>{
 let release,posts=0;const f=await clientFixture({api:async(_p,m)=>{if(m==='POST'){posts++;return {};}return new Promise(r=>{release=r;});}});
 const pending=f.device.enable();while(!release)await new Promise(r=>setImmediate(r));f.device.reset();
 release({enabled:true,configured:true,vapidPublicKey:'AQID'});await pending;
 assert.equal(posts,0);assert.equal(f.device.state().ready,false);assert.equal(f.device.state().busy,false);
});

test('permission grant is observed even when the original permission prompt never resolves',async()=>{
 let posts=0;const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),api:async(_p,m)=>{if(m==='POST')posts++;return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 const pending=f.device.enable();setTimeout(()=>{f.Notification.permission='granted';},4);await pending;
 assert.equal(f.Notification.requests,1);assert.equal(posts,1);assert.equal(f.device.state().ready,true);
});
test('Permissions API grant recovers a stale default notification getter without prompting twice',async()=>{
 const f=await clientFixture({permissionRequest:()=>new Promise(()=>{}),permissionQuery:async()=>({state:'granted'})});
 await f.device.enable();assert.equal(f.Notification.permission,'default');assert.equal(f.Notification.requests,1);assert.equal(f.device.state().ready,true);
});
test('push permission grant recovers even when the general permission query is unsupported',async()=>{
 const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),permissionQuery:async()=>{throw Error('unsupported');},pushPermissionState:async()=>'granted'});
 await f.device.enable();assert.equal(f.device.state().ready,true);
});
test('missing permission response exposes a native reconnect action and never reports success early',async()=>{
 let subscribed=0,posts=0,inClick=false;
 const sub={...subscription('repair'),toJSON:()=>subscription('repair')};
 const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),subscribe:()=>{assert.equal(inClick,true);subscribed++;return Promise.resolve(sub);},api:async(_p,m)=>{if(m==='POST')posts++;return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 await assert.rejects(f.device.enable(),/P01/);
 assert.equal(f.device.state().busy,false);assert.equal(f.device.state().ready,false);assert.equal(f.device.state().canRepair,true);assert.equal(posts,0);
 inClick=true;const pending=f.device.repair();inClick=false;await pending;
 assert.equal(subscribed,1);assert.equal(posts,1);assert.equal(f.Notification.requests,1);assert.equal(f.device.state().ready,true);assert.equal(f.device.state().canRepair,false);
});
test('native reconnect respects browser denial and never saves a blocked subscription',async()=>{
 let posts=0;const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),subscribe:async()=>{const e=Error('denied');e.name='NotAllowedError';throw e;},api:async(_p,m)=>{if(m==='POST')posts++;return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 await assert.rejects(f.device.enable(),/P01/);await assert.rejects(f.device.repair(),/denied/);
 assert.equal(posts,0);assert.equal(f.device.state().ready,false);assert.equal(f.device.state().busy,false);assert.match(f.device.state().message,/알림이 차단/);
});
test('native reconnect timeout is bounded and does not retry or send a notification',async()=>{
 let calls=0,posts=0;const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),subscribe:()=>{calls++;return new Promise(()=>{});},api:async(_p,m)=>{if(m==='POST')posts++;return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 await assert.rejects(f.device.enable(),/P01/);await assert.rejects(f.device.repair(),/P02/);
 assert.equal(calls,1);assert.equal(posts,0);assert.equal(f.device.state().busy,false);assert.equal(f.device.state().ready,false);
});
test('reset stops permission observation and a late grant cannot connect the next session',async()=>{
 let posts=0;const f=await clientFixture({fastTimeout:true,permissionRequest:()=>new Promise(()=>{}),api:async(_p,m)=>{if(m==='POST')posts++;return {enabled:true,configured:true,vapidPublicKey:'AQID'};}});
 const pending=f.device.enable();f.device.reset();f.Notification.permission='granted';await pending;
 assert.equal(posts,0);assert.equal(f.device.state().ready,false);assert.equal(f.device.state().canRepair,false);
});
test('status refresh keeps a recovered subscription ready when native push permission is granted',async()=>{
 let sub=null;const f=await clientFixture({permissionRequest:()=>new Promise(()=>{}),permissionQuery:async()=>({state:'granted'}),pushPermissionState:async()=>'granted',getSubscription:async()=>sub,subscribe:async()=>{sub={...subscription('recovered'),toJSON:()=>subscription('recovered')};return sub;},api:async()=>({enabled:true,configured:true,registered:true,vapidPublicKey:'AQID'})});
 await f.device.enable();await f.device.refresh(true);assert.equal(f.device.state().ready,true);
});
