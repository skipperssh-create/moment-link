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
 vm.runInNewContext(source,{window,navigator,Notification,crypto:webcrypto,TextEncoder,Uint8Array,atob,setTimeout,clearTimeout});
 const device=window.MomentLinkPush(async(path,method,body)=>{calls.push({path,method,body});if(method==='POST'&&path==='admin/push')registered=true;if(method==='DELETE')registered=false;return {enabled:true,configured:true,registered,vapidPublicKey:'AQID'};});
 await device.refresh(true);assert.equal(prompted,0);assert.equal(device.state().ready,false);assert.match(device.state().message,/연결이 필요/);
 await device.enable();assert.equal(prompted,1);assert.equal(registered,true);await device.refresh(true);assert.equal(device.state().ready,true);
 await device.disable();assert.equal(unsubscribed,1);assert.equal(calls.find(x=>x.method==='DELETE').body.endpointHash,hash(sub.endpoint));
});
