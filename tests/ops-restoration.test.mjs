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

test('restoration waits for OPS acknowledgment, preserves fields/conflicts, recovers lost replies and never writes more than twice',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 try{
  await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
  const adminId=randomUUID();await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'restore-test',$2,'admin',false)",[adminId,await passwordHash('synthetic-only-password')]);
  const receipts=new Map(),calls={create:0,cancel:0,restore:0,lookup:0},env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'};let failure=null,lost=false;
  const receipt=(d,state)=>{const departure=new Date(d.expected.date+'T'+d.expected.time+':00+09:00').toISOString();return {id:d.bookingId,requestId:d.requestId,applied:true,bookingState:state,currentBookingState:state,departure,currentDeparture:departure};};
  const adapter={safeRetry:true,lookup:async()=>null,availability:async()=>({available:true,token:'synthetic'}),create:async()=>({id:'ops-'+(++calls.create)}),cancellationResult:async()=>null,cancel:async d=>{calls.cancel++;return receipt(d,'cancelled');},restorationResult:async(ref,id)=>{calls.lookup++;return receipts.get(id)||null;},restore:async d=>{calls.restore++;if(failure)throw failure;const r=receipt(d,'ready');receipts.set(d.requestId,r);if(lost){lost=false;throw Error('synthetic lost reply');}return r;}},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});let auth={};
  const req=async(path,method='GET',data,headers=auth)=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=await req('auth/login','POST',{username:'restore-test',password:'synthetic-only-password'});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};const catalog=(await req('catalog')).data;
  const make=async()=>{const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:'classic',packageId:'all',optionIds:[],person:'합성 복원 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'confirmed',booking:{date:'2027-12-24',time:'14:00',amount:440000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});assert.equal(out.status,201,JSON.stringify(out.data));const item=out.data.item;const cancelled=await req('admin/consultations/'+item.id,'PATCH',{version:item.version,status:'cancelled'});assert.equal(cancelled.data.item.status,'cancelled');return cancelled.data.item;};
  const restore=item=>req('admin/consultations/'+item.id+'/restore-reservation','POST',{version:item.version});
  const cooldown=item=>db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[item.integration.id]);
  let item=await make(),path='admin/consultations/'+item.id,original=structuredClone(item),version=item.version;
  assert.equal((await req(path+'/restore-reservation','POST',{version},{})).status,401);assert.equal((await req(path+'/restore-reservation','POST',{version},{Cookie:auth.Cookie})).status,403);
  const responses=await Promise.all([restore(item),restore(item)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);item=responses.find(r=>r.status===200).data.item;
  assert.equal(item.status,'confirmed');assert.equal(item.integration.operation,'restore');assert.equal(item.integration.state,'succeeded');assert.deepEqual(item.communication.booking,original.communication.booking);assert.deepEqual(item.communication.drafts,original.communication.drafts);assert.equal(item.phone,original.phone);assert.equal(calls.restore,1);assert.equal(calls.create,1);
  assert.equal((await restore(item)).status,409);await processIntegration(db,item.integration.id,env,adapters);assert.equal(calls.restore,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM moment_link.audit_logs WHERE entity_id=$1 AND action='ops.restored'",[item.id])).rows[0].n,1);
  // A full cancel -> restore -> cancel -> restore cycle uses fresh operation IDs without creating a booking.
  item=(await req(path,'PATCH',{version:item.version,status:'cancelled'})).data.item;item=(await restore(item)).data.item;assert.equal(item.status,'confirmed');assert.equal(calls.create,1);assert.equal(calls.restore,2);
  item=await make();path='admin/consultations/'+item.id;lost=true;item=(await restore(item)).data.item;
  assert.equal(item.status,'cancelled');assert.equal(item.integration.state,'uncertain');let writes=calls.restore;
  assert.equal((await req(path,'DELETE',{version:item.version})).data.error,'JOB_UNRESOLVED');assert.equal((await req(path+'/communications','PUT',{version:item.version,booking:item.communication.booking,drafts:{}})).data.error,'OPS_RESTORATION_PENDING');
  assert.equal((await restore(item)).status,409);await cooldown(item);item=(await req(path)).data.item;assert.equal(item.status,'confirmed');assert.equal(calls.restore,writes);
  const old=await make();await db.query("UPDATE moment_link.integration_jobs SET state='conflict',attempts=2,error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[old.integration.id]);const before=(await db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[old.integration.id])).rows[0],counts={...calls};
  assert.equal((await restore(old)).status,409);await req('admin/consultations?view=reservations');assert.deepEqual((await db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[old.integration.id])).rows[0],before);assert.deepEqual(calls,counts);
  failure=Object.assign(Error('synthetic capacity'),{safe:true,status:409,code:'OPS_RESTORATION_REVIEW_REQUIRED'});item=await make();item=(await restore(item)).data.item;assert.equal(item.status,'cancelled');assert.equal(item.integration.state,'conflict');writes=calls.restore;await cooldown(item);await processIntegration(db,item.integration.id,env,adapters);assert.equal(calls.restore,writes);
  failure=Object.assign(Error('synthetic network'),{status:503,code:'OPS_HTTP_503'});item=await make();item=(await restore(item)).data.item;await cooldown(item);item=(await req('admin/consultations/'+item.id)).data.item;assert.equal(item.integration.attempts,2);writes=calls.restore;await cooldown(item);await req('admin/consultations/'+item.id);await processIntegration(db,item.integration.id,env,adapters);assert.equal(calls.restore,writes);assert.equal((await req('admin/consultations/'+item.id)).data.item.status,'cancelled');
  failure=null;item=await make();lost=true;item=(await restore(item)).data.item;const j=(await db.query('SELECT booking FROM moment_link.integration_jobs WHERE id=$1',[item.integration.id])).rows[0];receipts.get(j.booking.changeId).currentBookingState='cancelled';await cooldown(item);item=(await req('admin/consultations/'+item.id)).data.item;assert.equal(item.status,'cancelled');assert.equal(item.integration.error_code,'OPS_RESTORATION_STATE_CHANGED');
  item=await make();env.OPS_WRITES_ENABLED='false';writes=calls.restore;item=(await restore(item)).data.item;assert.equal(item.status,'cancelled');assert.equal(item.integration.attempts,0);assert.equal(calls.restore,writes);
  // A local-only cancelled reservation can also be restored; trash restoration stays separate.
  env.OPS_WRITES_ENABLED='true';const local=await make();await db.query('DELETE FROM moment_link.integration_jobs WHERE consultation_id=$1',[local.id]);writes=calls.restore;const localOut=await restore(local);assert.equal(localOut.data.item.status,'confirmed');assert.equal(localOut.data.item.integration,null);assert.equal(calls.restore,writes);
  const expired=await make();await db.query("UPDATE moment_link.consultations SET expires_at=now()-interval '1 minute' WHERE id=$1",[expired.id]);assert.equal((await restore(expired)).status,404);
  assert.equal((await db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await pg.close();}
});

test('restoration transport uses an idempotent key and read-only result lookup',async()=>{
 const prior=globalThis.fetch,calls=[];
 try{globalThis.fetch=async(url,options)=>{calls.push({url:String(url),...options});return Response.json({});};const a=opsAdapter('boatn',{OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_BASE_URL:'https://synthetic.invalid/api/',OPS_BOATN_TOKEN:'synthetic'}),externalRef='moment-link:'+randomUUID(),requestId=randomUUID();await a.restorationResult(externalRef,requestId);await a.restore({externalRef,requestId});assert.equal(calls[0].method,'GET');assert.match(calls[0].url,/\/restoration\//);assert.match(calls[1].url,/bookings\/restore$/);assert.equal(calls[1].headers['Idempotency-Key'],externalRef+':'+requestId);}finally{globalThis.fetch=prior;}
});

test('restoration UI distinguishes pending, confirmed, conflicts and lookup-only recovery',async()=>{
 const window={};vm.runInNewContext(await readFile(new URL('../ops-ui.js',import.meta.url),'utf8'),{window,console});const item={id:'synthetic',status:'cancelled',integration:{operation:'restore',state:'uncertain',attempts:2}};
 let html=window.MomentLinkOps.panel(item);assert.match(html,/최대 2회/);assert.match(html,/복원 결과 조회/);assert.match(html,/취소 상태/);assert.doesNotMatch(html,/복원 반영 완료/);
 html=window.MomentLinkOps.panel({...item,integration:{...item.integration,state:'conflict'}});assert.doesNotMatch(html,/data-boatn-retry/);
 html=window.MomentLinkOps.panel({...item,status:'confirmed',integration:{...item.integration,state:'succeeded'}});assert.match(html,/복원 반영 완료/);assert.match(html,/금액·입금 기록은 그대로/);assert.match(html,/admin-action-text/);assert.doesNotMatch(html,/등록 완료/);
});
