import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {processIntegration,opsAdapter} from '../server/jobs.mjs';

test('linked schedule changes apply once, preserve the old schedule until acknowledged, and never retry conflicts',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 try{
  await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");const adminId=randomUUID();
  await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'schedule-test',$2,'admin',false)",[adminId,await passwordHash('synthetic-only-password')]);
  const receipts=new Map(),calls={create:0,change:0,lookup:0},env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'};
  let failure=null,lost=false;
  const adapter={safeRetry:true,lookup:async()=>null,availability:async()=>({available:true,token:'synthetic'}),create:async()=>({id:'ops-'+(++calls.create)}),scheduleResult:async(ref,id)=>{calls.lookup++;return receipts.get(id)||null;},reschedule:async d=>{
   calls.change++;if(failure)throw failure;
   const receipt={id:d.bookingId,requestId:d.requestId,applied:true,departure:new Date(d.date+'T'+d.time+':00+09:00').toISOString()};receipt.currentDeparture=receipt.departure;receipts.set(d.requestId,receipt);
   if(lost){lost=false;throw Error('synthetic lost response');}return receipt;
  }},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});
  let auth={};const req=async(path,method='GET',data,headers=auth)=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=await req('auth/login','POST',{username:'schedule-test',password:'synthetic-only-password'});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
  const catalog=(await req('catalog')).data;
  const make=async()=>{const p=catalog.products.find(p=>p.id==='classic'),pk=p.packages.find(p=>p.id==='all'),date='2027-12-24';const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:p.id,packageId:pk.id,optionIds:[],person:'합성 일정 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'confirmed',booking:{date,time:'14:00',amount:440000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});assert.equal(out.status,201,JSON.stringify(out.data));return out.data.item;};
  const change=(item,time)=>({version:item.version,booking:{...item.communication.booking,time,scheduleConfirmed:true,paymentConfirmed:true},drafts:{confirmed:'합성 변경 안내'},approved:true});
  let item=await make(),path='admin/consultations/'+item.id;
  const original={...item.communication.booking},body=change(item,'16:00');
  assert.equal((await req(path+'/reservation','POST',body,{})).status,401);
  assert.equal((await req(path+'/reservation','POST',body,{Cookie:auth.Cookie})).status,403);
  let out=await req(path+'/reservation','POST',body);assert.equal(out.status,200,JSON.stringify(out.data));item=out.data.item;
  assert.equal(item.integration.state,'succeeded');assert.equal(item.integration.operation,'reschedule');assert.equal(item.communication.booking.time,'16:00');assert.equal(calls.create,1);assert.equal(calls.change,1);
  for(const key of ['amount','place','opsPax','opsPaymentMethod'])assert.equal(item.communication.booking[key],original[key]);
  assert.equal((await req(path+'/reservation','POST',body)).status,409);assert.equal(calls.change,1);
  const bad=change(item,'17:00');bad.booking.amount++;
  assert.equal((await req(path+'/reservation','POST',bad)).data.error,'OPS_SCHEDULE_ONLY');assert.equal(calls.change,1);
  // A lost update response is recovered from its durable receipt without a second write.
  lost=true;out=await req(path+'/reservation','POST',change(item,'17:00'));item=out.data.item;
  assert.equal(item.integration.state,'uncertain');assert.equal(item.communication.booking.time,'16:00');assert.equal(calls.change,2);
  const jobId=item.integration.id;
  assert.equal((await req(path+'/communications','PUT',{version:item.version,booking:item.communication.booking,drafts:{}})).data.error,'OPS_SCHEDULE_PENDING');
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[jobId]);
  item=(await req(path)).data.item;assert.equal(item.communication.booking.time,'17:00');assert.equal(item.integration.state,'succeeded');assert.equal(calls.change,2);
  // New collisions preserve the prior schedule and become terminal; the old job is not retried.
  failure=Object.assign(Error('synthetic conflict'),{status:409,code:'OPS_RESOURCE_CONFLICT',safe:true});
  item=(await req(path+'/reservation','POST',change(item,'18:00'))).data.item;
  assert.equal(item.integration.state,'conflict');assert.equal(item.communication.booking.time,'17:00');const writes=calls.change,lookups=calls.lookup;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[jobId]);
  await req(path);await processIntegration(db,jobId,env,adapters);
  assert.equal((await req(path+'/reservation','POST',change(item,'19:00'))).status,409);assert.equal(calls.change,writes);assert.equal(calls.lookup,lookups);
  // A pre-existing creation conflict is not requeued by this feature.
  const other=await make(),otherPath='admin/consultations/'+other.id;
  await db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[other.integration.id]);
  assert.equal((await req(otherPath+'/reservation','POST',change(other,'20:00'))).status,409);
  assert.equal(calls.change,writes);
  // Only two automatic write attempts. A later explicit check may read a receipt, never write again.
  failure=Object.assign(Error('synthetic timeout'),{status:503,code:'OPS_HTTP_503'});let third=await make(),thirdPath='admin/consultations/'+third.id;
  third=(await req(thirdPath+'/reservation','POST',change(third,'18:00'))).data.item;const thirdJob=third.integration.id;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[thirdJob]);await req(thirdPath);const twoWrites=calls.change;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[thirdJob]);await req(thirdPath);await processIntegration(db,thirdJob,env,adapters);assert.equal(calls.change,twoWrites);
  assert.equal((await db.query('SELECT attempts FROM moment_link.integration_jobs WHERE id=$1',[thirdJob])).rows[0].attempts,2);
  assert.equal((await req(thirdPath)).data.item.communication.booking.time,'14:00');
  assert.equal((await db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await pg.close();}
});

test('schedule transport uses scoped stable request IDs and read-only reconciliation',async()=>{
 const fetchBefore=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),...options});return Response.json({ok:true});};
  const adapter=opsAdapter('boatn',{OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_BASE_URL:'https://synthetic.invalid/api/',OPS_BOATN_TOKEN:'synthetic'}),ref='moment-link:'+randomUUID(),requestId=randomUUID();
  await adapter.scheduleResult(ref,requestId);await adapter.reschedule({externalRef:ref,requestId,date:'2027-12-24',time:'16:00'});
  assert.equal(calls[0].method,'GET');assert.match(calls[0].url,/\/schedule\//);assert.equal(calls[1].method,'POST');assert.equal(calls[1].headers['Idempotency-Key'],ref+':'+requestId);
 }finally{globalThis.fetch=fetchBefore;}
});

test('registered reservations visibly offer 수정·확정 and preserve synced price fields',async()=>{
 const window={},document={addEventListener(){},getElementById(){return null;}};
 const context={window,document,navigator:{},console,globalThis:null};context.globalThis=context;
 for(const path of ['time-picker.js','pricing.js','booking-addons.js','messages.js'])vm.runInNewContext(await readFile(new URL('../'+path,import.meta.url),'utf8'),context);
 context.MomentLinkOps={eligible:()=>false,fields:()=>'',validate:()=>''};vm.runInNewContext(await readFile(new URL('../message-ui.js',import.meta.url),'utf8'),context);
 const r={id:'synthetic',status:'confirmed',category:'yacht',phone:'01000000000',person:'합성',snapshot:{product:{name:'합성 요트'},package:{name:'합성',weekday:440000,weekend:440000},price:{weekday:440000,weekend:440000}},preferences:[{date:'2027-12-24',time:'14:00'}],integration:{state:'succeeded'},communication:{reservation:{source:'manual'},booking:{date:'2027-12-24',time:'14:00',amount:440000,place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''}}};
 window.MomentLinkComposer.init(r,async()=>({}),()=>{});const html=window.MomentLinkComposer.html();assert.match(html,/data-message="reserve" aria-label="수정·확정"/);assert.match(html,/>수정·확정<\/span>/);assert.match(html,/OPS 예약에도 자동 반영/);assert.match(html,/id="msg_amount"[^>]*disabled/);
 r.integration={state:'uncertain',operation:'reschedule'};window.MomentLinkComposer.init(r,async()=>({}),()=>{});assert.doesNotMatch(window.MomentLinkComposer.html(),/data-message="reserve"/);assert.match(window.MomentLinkComposer.html(),/기존 확정 일정이 유지/);
});
