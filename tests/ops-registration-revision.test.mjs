import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {processIntegration} from '../server/jobs.mjs';

async function fixture(){
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
 const uid=randomUUID();await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'revision-test',$2,'admin',false)",[uid,await passwordHash('synthetic-only-password')]);
 const remote=new Map(),calls={lookup:0,availability:0,create:0},state={lost:false,fail:false,mismatch:false,rollback:false};
 const adapter={safeRetry:true,lookup:async ref=>{calls.lookup++;return remote.get(ref)||null;},availability:async payload=>{
  calls.availability++;const prior=remote.get(payload.externalRef);
  if(prior){if(state.mismatch||prior.date!==payload.date||prior.time!==payload.time)throw Object.assign(Error('payload differs'),{safe:true,code:'OPS_PAYLOAD_CHANGED'});return prior;}
  if(payload.date==='2027-12-24')throw Object.assign(Error('old conflict'),{safe:true,code:'OPS_RESOURCE_CONFLICT'});
  return {available:true,token:'synthetic'};
 },create:async payload=>{calls.create++;if(state.fail)throw Error('synthetic offline');const row={id:'synthetic-'+payload.externalRef,bookingState:'ready',date:payload.date,time:payload.time};remote.set(payload.externalRef,row);if(state.lost){state.lost=false;throw Error('synthetic reply lost');}return row;}};
 const env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});let auth={};
 const req=async(path,method='GET',data,headers=auth)=>{const reply=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:reply.status,data:await reply.json(),headers:reply.headers};};
 const login=await req('auth/login','POST',{username:'revision-test',password:'synthetic-only-password'});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
 const catalog=(await req('catalog')).data;
 const make=async()=>{const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:'classic',packageId:'all',optionIds:[],person:'합성 일정 변경',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:uid,mode:'confirmed',booking:{date:'2027-12-24',time:'20:00',amount:540000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});assert.equal(out.status,201,JSON.stringify(out.data));assert.equal(out.data.item.integration.state,'conflict');return out.data.item;};
 const input=(item,date='2027-12-25')=>({version:item.version,booking:{...item.communication.booking,date},drafts:{confirmed:'합성 새 일정 '+date},approved:true});
 const job=id=>db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[id]).then(x=>x.rows[0]);
 return {pg,db,env,adapters,req,make,input,job,calls,state,remote,auth};
}

test('an explicit new schedule replaces a rejected registration without retrying or overwriting old conflicts',async()=>{
 const h=await fixture();try{
  const original=await h.make(),other=await h.make(),path='admin/consultations/'+original.id;
  await h.db.query('UPDATE moment_link.integration_jobs SET attempts=8 WHERE id=$1',[original.integration.id]);
  const before=await h.job(original.integration.id),otherBefore=await h.job(other.integration.id),calls={...h.calls};
  await h.req(path);await processIntegration(h.db,before.id,h.env,h.adapters);
  assert.deepEqual(await h.job(before.id),before);assert.deepEqual(h.calls,calls);
  assert.equal((await h.req(path+'/reservation','POST',h.input(original),{})).status,401);
  assert.equal((await h.req(path+'/reservation','POST',h.input(original),{Cookie:h.auth.Cookie})).status,403);
  assert.equal((await h.req(path+'/reservation','POST',h.input(original,'2027-12-24'))).data.error,'OPS_NEW_SCHEDULE_REQUIRED');
  const changedMoney=h.input(original);changedMoney.booking.amount++;
  assert.equal((await h.req(path+'/reservation','POST',changedMoney)).data.error,'OPS_SCHEDULE_ONLY');
  const result=await Promise.all([h.req(path+'/reservation','POST',h.input(original)),h.req(path+'/reservation','POST',h.input(original))]);
  assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);const item=result.find(x=>x.status===200).data.item;
  assert.equal(item.communication.booking.date,'2027-12-25');assert.equal(item.integration.state,'succeeded');assert.equal(item.integration.operation,'registration_revision');assert.equal(h.calls.create,1);
  for(const key of ['amount','place','opsPax','opsPaymentMethod'])assert.equal(item.communication.booking[key],original.communication.booking[key]);
  const job=await h.job(before.id);assert.equal(job.attempts,1);assert.equal(job.booking.registrationHistory[0].attempts,8);assert.equal(job.booking.registrationHistory[0].date,'2027-12-24');
  assert.deepEqual(await h.job(other.integration.id),otherBefore);
  assert.equal((await h.db.query("SELECT count(*)::int n FROM moment_link.audit_logs WHERE action='ops.registration.revised' AND entity_id=$1",[item.id])).rows[0].n,1);
  assert.equal((await h.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await h.pg.close();}
});

test('lost replies reconcile the fixed new payload, preserve drafts until success and cap attempts at two',async()=>{
 const h=await fixture();try{
  let item=await h.make(),path='admin/consultations/'+item.id;h.state.lost=true;
  item=(await h.req(path+'/reservation','POST',h.input(item))).data.item;
  assert.equal(item.integration.state,'uncertain');assert.equal(item.communication.booking.date,'2027-12-24');assert.equal(h.calls.create,1);
  assert.equal((await h.req(path+'/communications','PUT',{version:item.version,booking:item.communication.booking,drafts:{}})).data.error,'OPS_SCHEDULE_PENDING');
  await processIntegration(h.db,item.integration.id,h.env,h.adapters);item=(await h.req(path)).data.item;
  assert.equal(item.communication.booking.date,'2027-12-25');assert.equal(item.integration.state,'succeeded');assert.equal(h.calls.create,1);
  const other=await h.make(),otherPath='admin/consultations/'+other.id;h.state.fail=true;
  const pending=(await h.req(otherPath+'/reservation','POST',h.input(other))).data.item;
  await processIntegration(h.db,pending.integration.id,h.env,h.adapters);const writes=h.calls.create,checks=h.calls.availability;
  await processIntegration(h.db,pending.integration.id,h.env,h.adapters);await h.req(otherPath);
  assert.equal(h.calls.create,writes);assert.equal(h.calls.availability,checks);assert.equal((await h.job(pending.integration.id)).attempts,2);
  assert.equal((await h.req(otherPath)).data.item.communication.booking.date,'2027-12-24');
 }finally{await h.pg.close();}
});

test('existing OPS payload mismatch and transactional failure do not falsely confirm a new date',async()=>{
 const h=await fixture();try{
  let item=await h.make(),path='admin/consultations/'+item.id;
  h.remote.set('moment-link:'+item.id,{id:'existing',date:'2027-12-24',time:'20:00',bookingState:'ready'});
  item=(await h.req(path+'/reservation','POST',h.input(item))).data.item;
  assert.equal(item.integration.state,'conflict');assert.equal(item.integration.error_code,'OPS_PAYLOAD_CHANGED');assert.equal(item.communication.booking.date,'2027-12-24');assert.equal(h.calls.create,0);
  const other=await h.make(),otherPath='admin/consultations/'+other.id,transaction=h.db.transaction;
  h.db.transaction=fn=>transaction(tx=>fn({query:(sql,args)=>{if(sql.startsWith('UPDATE moment_link.consultations SET communication='))throw Error('synthetic commit failure');return tx.query(sql,args);}}));
  const failed=(await h.req(otherPath+'/reservation','POST',h.input(other))).data.item;h.db.transaction=transaction;
  assert.equal(failed.communication.booking.date,'2027-12-24');assert.notEqual(failed.integration.state,'succeeded');assert.equal(h.calls.create,1);
  await processIntegration(h.db,failed.integration.id,h.env,h.adapters);
  const done=(await h.req(otherPath)).data.item;assert.equal(done.communication.booking.date,'2027-12-25');assert.equal(done.integration.state,'succeeded');assert.equal(h.calls.create,1);
 }finally{await h.pg.close();}
});

test('registration error panel identifies its saved date and exposes 수정·확정 only for an eligible new schedule',async()=>{
 const window={},document={addEventListener(){},getElementById(){return null;}},context={window,document,navigator:{},console};context.globalThis=context;
 for(const path of ['time-picker.js','pricing.js','booking-addons.js','messages.js','ops-ui.js'])vm.runInNewContext(await readFile(new URL('../'+path,import.meta.url),'utf8'),context);
 context.MomentLinkOps=window.MomentLinkOps;vm.runInNewContext(await readFile(new URL('../message-ui.js',import.meta.url),'utf8'),context);
 const r={id:'synthetic',status:'confirmed',category:'other',phone:'01000000000',person:'합성',snapshot:{product:{name:'합성 요트'},package:{name:'합성'},price:{weekday:540000,weekend:540000}},preferences:[],integration:{state:'conflict',attempts:8,error_code:'OPS_RESOURCE_CONFLICT',external_id:null,schedule:{date:'2026-11-06',time:'20:00'}},communication:{reservation:{source:'manual'},booking:{date:'2026-11-06',time:'20:00',amount:540000,place:'합성',scheduleConfirmed:true,paymentConfirmed:true,extra:''}}};
 const panel=window.MomentLinkOps.panel(r);assert.match(panel,/OPS 등록 요청 일정 · 2026-11-06 20:00/);assert.match(panel,/이전 등록 요청의 오류/);assert.doesNotMatch(panel,/data-boatn-retry/);
 window.MomentLinkComposer.init(r,async()=>({}),()=>{});assert.match(window.MomentLinkComposer.html(),/data-message="reserve" aria-label="수정·확정"/);
 r.integration.operation='registration_revision';r.integration.state='uncertain';r.integration.attempts=2;r.integration.error_code='OPS_REGISTRATION_RETRY_LIMIT';
 window.MomentLinkComposer.init(r,async()=>({}),()=>{});assert.doesNotMatch(window.MomentLinkComposer.html(),/data-message="reserve"/);assert.match(window.MomentLinkOps.panel(r),/자동 시도 2회/);
 r.integration.state='conflict';r.integration.external_id='existing';window.MomentLinkComposer.init(r,async()=>({}),()=>{});assert.doesNotMatch(window.MomentLinkComposer.html(),/data-message="reserve"/);
});
