import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {opsAdapter,processIntegration} from '../server/jobs.mjs';

test('authorized detail refresh recovers transient OPS jobs after cooldown without duplicating bookings',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://ops.test.invalid';
 try{
  await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");const adminId=randomUUID(),password=randomUUID();
  await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[adminId,'ops-admin',await passwordHash(password),'admin']);
  let failure={code:'OPS_CALENDAR_SYNC_PENDING',status:503},created=0,checks=0,lookups=0,createFailure=null;const remote=new Map();
  const adapter={safeRetry:true,lookup:async ref=>{lookups++;return remote.get(ref);},availability:async()=>{checks++;if(failure)throw Object.assign(Error('synthetic'),failure);return {available:true,token:'synthetic-token'};},create:async data=>{created++;if(createFailure)throw Object.assign(Error('synthetic'),createFailure);const b={id:'synthetic-ops-'+created};remote.set(data.externalRef,b);return b;}};
  const env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});
  let auth={};const req=async(path,method='GET',data,headers=auth)=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=await req('auth/login','POST',{username:'ops-admin',password});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
  const catalog=(await req('catalog')).data,p=catalog.products.find(p=>p.id==='classic'),pk=p.packages[0],date='2027-12-24';
  const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:p.id,packageId:pk.id,optionIds:[],person:'합성 OPS 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'confirmed',booking:{date,time:'14:00',amount:MomentLinkPricing.quote({category:'yacht',snapshot:{package:pk,price:{weekday:pk.weekday,weekend:pk.weekend}}},date).amount,amountMode:'auto',place:'합성 검수 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});
  assert.equal(out.status,201,JSON.stringify(out.data));const id=out.data.item.id,job=out.data.item.integration.id,path='admin/consultations/'+id;
  assert.equal(out.data.item.integration.state,'failed');assert.equal(created,0);
  assert.equal((await req(path,'GET',undefined,{})).status,401);assert.equal(checks,1);
  let detail=await req(path);assert.equal(detail.data.item.integration.state,'failed');assert.equal(checks,1);
  failure=null;await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[job]);
  detail=await req(path);assert.equal(detail.data.item.integration.state,'succeeded');assert.equal(detail.data.item.integration.external_id,'synthetic-ops-1');assert.equal(created,1);
  await req(path);assert.equal(created,1);assert.equal(checks,2);
  // A response lost after creation is reconciled by reference before any new write.
  await db.query("UPDATE moment_link.integration_jobs SET state='uncertain',updated_at=now()-interval '5 minutes' WHERE id=$1",[job]);
  detail=await req(path);assert.equal(detail.data.item.integration.state,'succeeded');assert.equal(created,1);
  remote.clear();
  for(const error of [{code:'OPS_HTTP_429',status:429,safe:true},{code:'OPS_HTTP_408',status:408,safe:true},{code:'OPS_CALENDAR_SYNC_PENDING',status:503}]){
   failure=error;await db.query("UPDATE moment_link.integration_jobs SET state='failed' WHERE id=$1",[job]);
   assert.equal((await processIntegration(db,job,env,adapters)).state,'failed');
  }
  failure=null;createFailure={code:'OPS_AVAILABILITY_EXPIRED',status:409,safe:true};
  assert.equal((await processIntegration(db,job,env,adapters)).state,'uncertain');const before=lookups;
  createFailure=null;assert.equal((await processIntegration(db,job,env,adapters)).state,'succeeded');assert.equal(lookups,before+1);
  // Actual conflicts stay terminal; a detail refresh cannot create a reservation.
  remote.clear();failure={code:'OPS_RESOURCE_CONFLICT',status:409,safe:true};await db.query("UPDATE moment_link.integration_jobs SET state='failed' WHERE id=$1",[job]);
  assert.equal((await processIntegration(db,job,env,adapters)).state,'conflict');const writes=created,attempts=checks;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[job]);
  detail=await req(path);assert.equal(detail.data.item.integration.state,'conflict');assert.equal(created,writes);assert.equal(checks,attempts);
  assert.equal((await db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await pg.close();}
});

test('OPS transport retains retryable HTTP status without exposing credentials',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({code:'OPS_HTTP_429'}),{status:429});
  const adapter=opsAdapter('boatn',{OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_BASE_URL:'https://ops.test.invalid/api/',OPS_BOATN_TOKEN:'synthetic'});
  await assert.rejects(adapter.lookup('synthetic'),e=>e.status===429&&e.code==='OPS_HTTP_429'&&!e.message.includes('synthetic'));
 }finally{globalThis.fetch=original;}
});

const source=await readFile(new URL('../ops-ui.js',import.meta.url),'utf8');
function ui(){
 const timers=new Map(),html=[];let next=0,node;
 const document={hidden:false,getElementById:()=>node},window={};
 const makeNode=()=>({dataset:{record:'synthetic'},querySelector:()=>null,set outerHTML(value){html.push(value);node=makeNode();}});
 node=makeNode();vm.runInNewContext(source,{window,document,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)});
 return {ops:window.MomentLinkOps,document,html,timers,leave:()=>{node=null;},replace:()=>{node=makeNode();},tick:async()=>{const [id,t]=[...timers][0];timers.delete(id);await t.fn();}};
}
const record=(state='failed',attempts=1)=>({id:'synthetic',integration:{state,attempts,error_code:'OPS_REVIEW_REQUIRED',external_id:state==='succeeded'?'synthetic-ops':null}});

test('failed panel refreshes to registered, stops polling, and does not render the detail form',async()=>{
 const h=ui();let calls=0;h.ops.mount(record(),async path=>{calls++;assert.equal(path,'admin/consultations/synthetic');return {item:record('succeeded')};});
 assert.equal([...h.timers.values()][0].ms,15000);await h.tick();assert.equal(calls,1);assert.equal(h.html.length,1);assert.match(h.html[0],/등록 완료/);assert.doesNotMatch(h.html[0],/textarea|상태 저장/);assert.equal(h.timers.size,0);
 assert.match(h.ops.panel(record()),/등록 재확인 중/);assert.doesNotMatch(h.ops.panel(record('failed',10)),/자동으로 재확인/);
});

test('hidden or departed views skip polling and stale replies cannot overwrite a reopened panel',async()=>{
 const h=ui();let calls=0,resolve;const api=()=>{calls++;return new Promise(r=>{resolve=r;});};
 h.ops.mount(record(),api);h.document.hidden=true;await h.tick();assert.equal(calls,0);assert.equal(h.timers.size,1);
 h.document.hidden=false;const pending=h.tick();assert.equal(calls,1);h.replace();h.ops.mount(record('checking'),api);resolve({item:record('succeeded')});await pending;assert.equal(h.html.length,0);
 h.leave();await h.tick();assert.equal(calls,1);assert.equal(h.timers.size,0);
});
