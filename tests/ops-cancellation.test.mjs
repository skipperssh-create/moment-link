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

test('OPS cancellation acknowledges before local cancellation, reconciles lost replies, preserves conflicts and stops after two attempts',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 try{
  await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
  const adminId=randomUUID();await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'cancel-test',$2,'admin',false)",[adminId,await passwordHash('synthetic-only-password')]);
  const receipts=new Map(),calls={create:0,cancel:0,lookup:0},env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'};let failure=null,lost=false;
  const adapter={safeRetry:true,lookup:async()=>null,availability:async()=>({available:true,token:'synthetic'}),create:async()=>({id:'ops-'+(++calls.create)}),cancellationResult:async(ref,id)=>{calls.lookup++;return receipts.get(id)||null;},cancel:async d=>{
   calls.cancel++;if(failure)throw failure;const departure=new Date(d.expected.date+'T'+d.expected.time+':00+09:00').toISOString();
   const receipt={id:d.bookingId,requestId:d.requestId,applied:true,bookingState:'cancelled',currentBookingState:'cancelled',departure,currentDeparture:departure};receipts.set(d.requestId,receipt);
   if(lost){lost=false;throw Error('synthetic lost response');}return receipt;
  }},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});let auth={};
  const req=async(path,method='GET',data,headers=auth)=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=await req('auth/login','POST',{username:'cancel-test',password:'synthetic-only-password'});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};const catalog=(await req('catalog')).data;
  const make=async()=>{const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:'classic',packageId:'all',optionIds:[],person:'합성 취소 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'confirmed',booking:{date:'2027-12-24',time:'14:00',amount:440000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});assert.equal(out.status,201,JSON.stringify(out.data));return out.data.item;};
  const cancel=item=>req('admin/consultations/'+item.id,'PATCH',{version:item.version,status:'cancelled'});
  const cooldown=item=>db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[item.integration.id]);
  let item=await make(),path='admin/consultations/'+item.id,body={version:item.version,status:'cancelled'},original=item.communication.booking;
  assert.equal((await req(path,'PATCH',body,{})).status,401);assert.equal((await req(path,'PATCH',body,{Cookie:auth.Cookie})).status,403);
  let out=await cancel(item);assert.equal(out.status,200,JSON.stringify(out.data));item=out.data.item;
  assert.equal(item.status,'cancelled');assert.equal(item.integration.operation,'cancel');assert.equal(item.integration.state,'succeeded');assert.deepEqual(item.communication.booking,original);assert.equal(calls.create,1);assert.equal(calls.cancel,1);
  assert.equal((await req(path,'PATCH',body)).status,409);await processIntegration(db,item.integration.id,env,adapters);assert.equal(calls.cancel,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM moment_link.audit_logs WHERE entity_id=$1 AND action='ops.cancelled'",[item.id])).rows[0].n,1);
  // Lost acknowledgment keeps the local booking confirmed until a receipt is found.
  item=await make();path='admin/consultations/'+item.id;lost=true;item=(await cancel(item)).data.item;
  assert.equal(item.status,'confirmed');assert.equal(item.integration.state,'uncertain');const writes=calls.cancel;
  assert.equal((await req(path,'DELETE',{version:item.version})).data.error,'JOB_UNRESOLVED');
  assert.equal((await req(path+'/communications','PUT',{version:item.version,booking:item.communication.booking,drafts:{}})).data.error,'OPS_CANCELLATION_PENDING');
  await cooldown(item);item=(await req(path)).data.item;assert.equal(item.status,'cancelled');assert.equal(calls.cancel,writes);
  // Neither cancellation nor incidental list reads may reset an old conflict.
  const old=await make();await db.query("UPDATE moment_link.integration_jobs SET state='conflict',attempts=2,error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[old.integration.id]);
  const before=(await db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[old.integration.id])).rows[0],beforeCounts={...calls};
  assert.equal((await cancel(old)).status,409);await req('admin/consultations?view=reservations');
  assert.deepEqual((await db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[old.integration.id])).rows[0],before);assert.deepEqual(calls,beforeCounts);
  // A new cancellation conflict is terminal and never changes local state.
  failure=Object.assign(Error('synthetic boarded'),{safe:true,status:409,code:'OPS_CANCELLATION_REVIEW_REQUIRED'});item=await make();item=(await cancel(item)).data.item;
  assert.equal(item.status,'confirmed');assert.equal(item.integration.state,'conflict');const conflictCalls={...calls};await cooldown(item);await req('admin/consultations/'+item.id);await processIntegration(db,item.integration.id,env,adapters);assert.deepEqual(calls,conflictCalls);
  // Two failed writes are the hard ceiling, including explicit retry buttons.
  failure=Object.assign(Error('synthetic network'),{status:503,code:'OPS_HTTP_503'});item=await make();item=(await cancel(item)).data.item;
  await cooldown(item);item=(await req('admin/consultations/'+item.id)).data.item;assert.equal(item.integration.attempts,2);const two=calls.cancel;
  await cooldown(item);await req('admin/consultations/'+item.id);await processIntegration(db,item.integration.id,env,adapters);assert.equal(calls.cancel,two);assert.equal((await req('admin/consultations/'+item.id)).data.item.status,'confirmed');
  // If OPS restored a cancelled booking after a lost reply, don't claim it is cancelled locally.
  failure=null;item=await make();lost=true;item=(await cancel(item)).data.item;const j=(await db.query('SELECT booking FROM moment_link.integration_jobs WHERE id=$1',[item.integration.id])).rows[0];receipts.get(j.booking.changeId).currentBookingState='ready';
  await cooldown(item);item=(await req('admin/consultations/'+item.id)).data.item;assert.equal(item.status,'confirmed');assert.equal(item.integration.error_code,'OPS_CANCELLATION_STATE_CHANGED');
  // OFF never sends a cancellation, and pending cancellation prevents rescheduling/closing.
  item=await make();env.OPS_WRITES_ENABLED='false';const offCalls=calls.cancel;item=(await cancel(item)).data.item;assert.equal(item.status,'confirmed');assert.equal(item.integration.state,'pending');assert.equal(item.integration.attempts,0);assert.equal(calls.cancel,offCalls);
  assert.equal((await req('admin/consultations/'+item.id,'PATCH',{version:item.version,status:'closed'})).data.error,'OPS_UNRESOLVED');
  assert.equal((await req('admin/consultations/'+item.id+'/reservation','POST',{version:item.version,booking:item.communication.booking,drafts:{confirmed:'합성'},approved:true})).status,409);
  assert.equal((await db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await pg.close();}
});

test('cancellation transport keeps a stable operation key and result lookup is read-only',async()=>{
 const prior=globalThis.fetch,calls=[];
 try{globalThis.fetch=async(url,options)=>{calls.push({url:String(url),...options});return Response.json({});};
  const adapter=opsAdapter('boatn',{OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_BASE_URL:'https://synthetic.invalid/api/',OPS_BOATN_TOKEN:'synthetic'}),externalRef='moment-link:'+randomUUID(),requestId=randomUUID();
  await adapter.cancellationResult(externalRef,requestId);await adapter.cancel({externalRef,requestId});
  assert.equal(calls[0].method,'GET');assert.match(calls[0].url,/\/cancellation\//);assert.equal(calls[1].method,'POST');assert.match(calls[1].url,/bookings\/cancel$/);assert.equal(calls[1].headers['Idempotency-Key'],externalRef+':'+requestId);
 }finally{globalThis.fetch=prior;}
});

test('cancellation UI separates acknowledged cancellation, conflicts, and two-attempt read-only checks',async()=>{
 const window={};vm.runInNewContext(await readFile(new URL('../ops-ui.js',import.meta.url),'utf8'),{window,console});
 const item={id:'synthetic',status:'confirmed',integration:{operation:'cancel',state:'uncertain',attempts:2}};
 let html=window.MomentLinkOps.panel(item);assert.match(html,/최대 2회/);assert.match(html,/취소 결과 조회/);assert.match(html,/기존 예약 상태/);assert.doesNotMatch(html,/취소 반영 완료/);
 html=window.MomentLinkOps.panel({...item,integration:{...item.integration,state:'conflict'}});assert.doesNotMatch(html,/data-boatn-retry/);
 html=window.MomentLinkOps.panel({...item,status:'cancelled',integration:{...item.integration,state:'succeeded'}});assert.match(html,/취소 반영 완료/);assert.match(html,/환불은 별도로/);assert.match(html,/admin-action-text/);assert.doesNotMatch(html,/등록 완료/);
});
