import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {hash,passwordHash} from '../server/security.mjs';
import {processIntegration} from '../server/jobs.mjs';
const secret='synthetic-inbound-contract-token',origin='https://synthetic.invalid',base='/api/integrations/boatn/events';
function signed(event,options={}){
 const method=options.method||'POST',path=method==='GET'?base+'/'+encodeURIComponent(event.eventId):base,body=method==='POST'?JSON.stringify(event):'',at=String(options.at||Date.now());
 const signature=createHmac('sha256',hash(options.secret||secret)).update(['boatn-to-moment-v1',at,method,path,body].join('\n')).digest('hex');
 return new Request(origin+path,{method,headers:{'Content-Type':'application/json','X-BOATN-Timestamp':at,'X-BOATN-Signature':signature},...(body?{body}:{} )});
}
async function fixture(){
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)};await migrate(db);
 await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
 const env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true',OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_TOKEN:secret},calls={writes:0};
 const adapter={lookup:async()=>null,availability:async()=>({available:true,token:'synthetic'}),create:async()=>({id:'ops-'+(++calls.writes)})};
 const app=createApp({db,env,adapters:{ops:{boatn:adapter}}}),uid=randomUUID();
 await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'inbound-test',$2,'admin',false)",[uid,await passwordHash('synthetic-only-password')]);
 const req=async(path,method='GET',data,auth={})=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data?{body:JSON.stringify(data)}:{})}));return {status:r.status,data:await r.json(),headers:r.headers};};
 const login=await req('auth/login','POST',{username:'inbound-test',password:'synthetic-only-password'}),auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf},catalog=(await req('catalog')).data;
 const make=async()=>{const result=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:'classic',packageId:'all',optionIds:[],person:'합성 역방향 검수',phone:'01000000000',notes:'보존 메모',assignee:uid,mode:'confirmed',booking:{date:'2027-12-24',time:'14:00',amount:440000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}},auth);assert.equal(result.status,201,JSON.stringify(result.data));return result.data.item;};
 const get=async id=>(await db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[id])).rows[0];
 const job=async id=>(await db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[id])).rows[0];
 const event=(item,seq,before,after)=>({version:1,eventId:item.integration.external_id+':'+seq,bookingId:item.integration.external_id,externalRef:'moment-link:'+item.id,sequence:seq,at:new Date().toISOString(),before,after});
 const send=async(e,o)=>{const r=await app(signed(e,o));return {status:r.status,data:await r.json()};};
 return {pg,db,env,app,make,get,job,event,send,calls,req,auth};
}
const first={state:'ready',departure:'2027-12-24T05:00:00.000Z'},changed={state:'ready',departure:'2027-12-24T06:30:00.000Z'};

test('signed OPS schedule/cancel/restore applies once, preserves records, regenerates drafts and never echoes',async()=>{
 const f=await fixture();try{
  const item=await f.make(),old=await f.get(item.id),event=f.event(item,10,first,changed);
  const responses=await Promise.all([f.send(event),f.send(event)]);assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
  let current=await f.get(item.id);assert.equal(current.version,old.version+1);assert.equal(current.communication.booking.time,'15:30');assert.equal(current.communication.booking.amount,old.communication.booking.amount);assert.equal(current.notes,old.notes);assert.deepEqual(current.communication.events,old.communication.events);assert.deepEqual(current.communication.opsPreviousDrafts[0].drafts,old.communication.drafts);assert.match(current.communication.drafts.confirmed,/2027-12-24 15:30/);assert.equal(f.calls.writes,1);
  assert.equal((await f.send(event,{method:'GET'})).data.outcome,'applied');assert.equal((await f.send({...event,after:first})).status,409);
  const cancelled={...changed,state:'cancelled'};assert.equal((await f.send(f.event(item,11,changed,cancelled))).status,200);assert.equal((await f.get(item.id)).status,'cancelled');
  assert.equal((await f.send(f.event(item,12,cancelled,changed))).status,200);current=await f.get(item.id);assert.equal(current.status,'confirmed');assert.ok(current.communication.reservation.cancelledAt);assert.ok(current.communication.reservation.restoredAt);
  const before=await f.get(item.id);assert.equal((await f.send(f.event(item,9,changed,first))).data.outcome,'stale');assert.deepEqual(await f.get(item.id),before);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM moment_link.audit_logs WHERE action='ops.inbound.applied'")).rows[0].n,3);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
  const latest=(await f.req('admin/consultations/'+item.id,'GET',undefined,f.auth)).data.item;
  assert.equal(latest.integration.operation,'inbound');assert.equal(latest.status,'confirmed');assert.equal(f.calls.writes,1);
 }finally{await f.pg.close();}
});

test('unauthorized/stale/malformed events, foreign links, old conflicts, pending work and expired records are protected',async()=>{
 const f=await fixture();try{
  const item=await f.make(),event=f.event(item,20,first,changed),original=await f.get(item.id);
  assert.equal((await f.send(event,{secret:'wrong'})).status,401);assert.equal((await f.send(event,{at:Date.now()-600000})).status,401);
  assert.equal((await f.send({...event,sequence:0})).status,400);assert.equal((await f.send({...event,bookingId:'foreign',eventId:'foreign:20'})).status,409);assert.equal((await f.send(event,{method:'GET'})).status,404);assert.deepEqual(await f.get(item.id),original);
  await f.db.query("UPDATE moment_link.integration_jobs SET state='conflict',attempts=2,error_code='OPS_RESOURCE_CONFLICT' WHERE consultation_id=$1",[item.id]);const oldJob=await f.job(item.id);
  assert.equal((await f.send(event)).data.outcome,'skipped_conflict');assert.deepEqual(await f.job(item.id),oldJob);assert.deepEqual(await f.get(item.id),original);
  await f.db.query("UPDATE moment_link.integration_jobs SET state='checking' WHERE consultation_id=$1",[item.id]);assert.equal((await f.send(event)).status,503);assert.equal((await f.job(item.id)).state,'checking');
  await f.db.query("UPDATE moment_link.integration_jobs SET state='succeeded' WHERE consultation_id=$1",[item.id]);
  f.env.OPS_WRITES_ENABLED='false';assert.equal((await f.send(event)).status,503);f.env.OPS_WRITES_ENABLED='true';
  await f.db.query("UPDATE moment_link.consultations SET expires_at=now()-interval '1 minute' WHERE id=$1",[item.id]);assert.equal((await f.send(event)).data.outcome,'unavailable');
  const other=await f.make(),mismatch=f.event(other,30,changed,{...changed,departure:'2027-12-24T07:00:00.000Z'}),before=await f.get(other.id);
  assert.equal((await f.send(mismatch)).data.outcome,'skipped_conflict');assert.deepEqual(await f.get(other.id),before);assert.equal((await f.job(other.id)).error_code,'OPS_INBOUND_CONFLICT');
  const conflict=await f.job(other.id);assert.equal((await processIntegration(f.db,conflict.id,f.env)).state,'conflict');assert.deepEqual(await f.job(other.id),conflict);
 }finally{await f.pg.close();}
});

test('incoming storage failures roll back booking, receipt and synchronization state together',async()=>{
 const f=await fixture();try{
  const item=await f.make(),event=f.event(item,40,first,changed),before=await f.get(item.id),oldJob=await f.job(item.id);
  const failing={...f.db,transaction:fn=>f.db.transaction(tx=>fn({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO moment_link.audit_logs'))throw Error('synthetic failure');return tx.query(sql,args);}}))};
  const bad=createApp({db:failing,env:f.env});assert.equal((await bad(signed(event))).status,500);assert.deepEqual(await f.get(item.id),before);assert.deepEqual(await f.job(item.id),oldJob);assert.equal((await f.send(event,{method:'GET'})).status,404);assert.equal((await f.send(event)).status,200);
 }finally{await f.pg.close();}
});
