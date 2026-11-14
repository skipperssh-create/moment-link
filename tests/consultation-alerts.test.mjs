import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import webpush from 'web-push';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {createConsultationAlert,dispatchConsultationAlerts,acknowledgeConsultationAlert} from '../server/consultation-alerts.mjs';
const origin='https://test.moment-link.invalid';
async function setup(){
 const f=await ownershipFixture(),keys=webpush.generateVAPIDKeys(),env={APP_ORIGIN:origin,PUSH_LIVE_ENABLED:'true',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,PUSH_REPEAT_SECRET:'synthetic-clock-secret-12345678901234567890'};
 await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{push}','true') WHERE id='settings'");
 const sub=async name=>{const id=randomUUID(),s={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-'+name,keys:{p256dh:'synthetic',auth:'synthetic'}};await f.db.query('INSERT INTO moment_link.push_subscriptions(id,user_id,endpoint_hash,subscription) VALUES($1,$2,$3,$4)',[id,f.staff['owner-admin'].id,createHash('sha256').update(s.endpoint).digest('hex'),JSON.stringify(s)]);return id;};
 const due=()=>f.db.query("UPDATE moment_link.push_alert_deliveries SET next_at=now()-interval '1 second'");
 return {...f,env,sub,due};
}
test('unread push repeats on later ticks, is claimed once, and stops on explicit acknowledgment without editing bookings',async()=>{
 const f=await setup();try{
  const c=await f.add();await f.sub('a');await createConsultationAlert(f.db,c.id);const calls=[];
  const adapter={push:async(sub,body,options)=>calls.push({body:JSON.parse(body),options})};
  assert.equal((await dispatchConsultationAlerts(f.db,f.env,adapter)).sent,1);
  await dispatchConsultationAlerts(f.db,f.env,adapter);assert.equal(calls.length,1);
  await f.due();await Promise.all([dispatchConsultationAlerts(f.db,f.env,adapter),dispatchConsultationAlerts(f.db,f.env,adapter)]);assert.equal(calls.length,2);
  assert.equal(calls[1].body.repeat,true);assert.equal(calls[1].options.TTL,120);assert.equal(calls[1].options.urgency,'high');assert.equal(calls[0].options.topic,calls[1].options.topic);
  assert.ok(!JSON.stringify(calls).includes(c.person));
  await acknowledgeConsultationAlert(f.db,f.staff['owner-admin'],c.id);await f.due();await dispatchConsultationAlerts(f.db,f.env,adapter);assert.equal(calls.length,2);
  const after=(await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[c.id])).rows[0];assert.deepEqual(after,c);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.integration_jobs')).rows[0].n,0);
 }finally{await f.pg.close();}
});
test('each broken device stops after two failures, while healthy devices keep receiving; expired subscriptions stop immediately',async()=>{
 const f=await setup();try{
  const c=await f.add();await createConsultationAlert(f.db,c.id);await f.sub('bad');await f.sub('good');const expired=await f.sub('expired');let bad=0,good=0,gone=0;
  const adapter={push:async sub=>{if(sub.endpoint.endsWith('bad')){bad++;throw Error('synthetic');}if(sub.endpoint.endsWith('expired')){gone++;throw {statusCode:410};}good++;}};
  for(let i=0;i<4;i++){await f.due();await dispatchConsultationAlerts(f.db,f.env,adapter);}
  assert.equal(bad,2);assert.equal(gone,1);assert.equal(good,4);assert.equal((await f.db.query('SELECT active FROM moment_link.push_subscriptions WHERE id=$1',[expired])).rows[0].active,false);
 }finally{await f.pg.close();}
});
test('old intakes are not enrolled; read, assigned status, deleted and expired items do not repeat; disabling push stops sends',async()=>{
 const f=await setup();try{
  await f.sub('good');await f.add();let calls=0;const adapter={push:async()=>calls++};
  await dispatchConsultationAlerts(f.db,f.env,adapter);assert.equal(calls,0);
  for(const sql of ["read_at=now()","status='consulting'","deleted_at=now()","expires_at=now()-interval '1 day'"]){const c=await f.add();await createConsultationAlert(f.db,c.id);await f.db.query('UPDATE moment_link.consultations SET '+sql+' WHERE id=$1',[c.id]);}
  await dispatchConsultationAlerts(f.db,f.env,adapter);assert.equal(calls,0);
  const c=await f.add();await createConsultationAlert(f.db,c.id);await dispatchConsultationAlerts(f.db,{...f.env,PUSH_LIVE_ENABLED:'false'},adapter);assert.equal(calls,0);
 }finally{await f.pg.close();}
});
test('polling/list/detail GET never acknowledges; acknowledgment needs session, CSRF and ownership; clock cannot touch OPS',async()=>{
 const f=await setup();try{
  const c=await f.add({owner:f.staff['counselor-a'].id});await createConsultationAlert(f.db,c.id);let ops=0;
  const app=createApp({db:f.db,env:f.env,adapters:{ops:{boatn:{lookup:async()=>{ops++;throw Error('must not run');}}}}});
  const req=async(path,method='GET',headers={})=>app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers}}));
  const auth=f.sessions['owner-admin'];
  for(const path of ['admin/consultations','admin/consultations/updates','admin/consultations/'+c.id])assert.equal((await req(path,'GET',auth)).status,200);
  assert.equal((await f.db.query('SELECT acknowledged_at FROM moment_link.consultation_alerts')).rows[0].acknowledged_at,null);
  const path='admin/consultations/'+c.id+'/acknowledge-alert';
  assert.equal((await req(path,'POST')).status,401);assert.equal((await req(path,'POST',{Cookie:auth.Cookie})).status,403);assert.equal((await req(path,'POST',f.sessions['counselor-b'])).status,403);
  assert.equal((await req(path,'POST',f.sessions['counselor-a'])).status,200);assert.equal((await req(path,'POST',auth)).status,200);
  assert.equal((await req('cron/consultation-alerts','POST')).status,401);
  assert.equal((await req('cron/consultation-alerts','POST',{Authorization:'Bearer '+f.env.PUSH_REPEAT_SECRET})).status,200);assert.equal(ops,0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM moment_link.audit_logs WHERE action='notification.acknowledged'")).rows[0].n,1);
 }finally{await f.pg.close();}
});
test('public intake creates one alert and sends once, idempotent replay does not send, later clock repeats it',async()=>{
 const f=await setup();try{
  await f.sub('intake');
  const s=(await f.db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
  await f.db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...s,accepting:true,retentionDays:30,consentVersion:'synthetic',privacyText:'synthetic only'})]);
  const catalog=(await f.db.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  let calls=0;const adapter={push:async()=>calls++},app=createApp({db:f.db,env:f.env,adapters:adapter}),key=randomUUID();
  const data={catalogVersion:catalog.version,productId:'classic',packageId:'light',category:'yacht',person:'합성 검수',phone:'01000000000',preferences:[{date:'2099-11-01',time:'오후'}],place:'',notes:'synthetic',consent:true,consentVersion:'synthetic'};
  const send=()=>app(new Request(origin+'/api/consultations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(data)}));
  const first=await send();assert.equal(first.status,201,await first.text());assert.equal(calls,1);assert.equal((await send()).status,200);assert.equal(calls,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.consultation_alerts')).rows[0].n,1);
  await f.due();await dispatchConsultationAlerts(f.db,f.env,adapter);assert.equal(calls,2);
 }finally{await f.pg.close();}
});
