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

test('confirmed option changes preserve drafts until OPS acknowledgement and stop after two attempts',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 try{
  await migrate(db);await db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");const adminId=randomUUID();
  await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'schedule-test',$2,'admin',false)",[adminId,await passwordHash('synthetic-only-password')]);
  const receipts=new Map(),calls={create:0,change:0,lookup:0},env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'};
  let failure=null,lost=false;
  const adapter={safeRetry:true,lookup:async()=>null,availability:async()=>({available:true,token:'synthetic'}),create:async()=>({id:'ops-'+(++calls.create)}),metadata:async()=>({addOnUpdates:true}),addOnsResult:async(ref,id)=>{calls.lookup++;return receipts.get(id)||null;},updateAddOns:async d=>{
   calls.change++;if(failure)throw failure;
   const amount=440000+d.addOns.reduce((n,x)=>n+x.quantity*x.unitAmount,0);const receipt={id:d.bookingId,requestId:d.requestId,applied:true,amount,received:440000,balance:amount-440000,addOns:d.addOns,currentAddOns:d.addOns,currentAmount:amount,currentState:'ready',currentDeparture:d.expected.departure};receipts.set(d.requestId,receipt);
   if(lost){lost=false;throw Error('synthetic lost response');}return receipt;
  }},adapters={ops:{boatn:adapter}},app=createApp({db,env,adapters});
  let auth={};const req=async(path,method='GET',data,headers=auth)=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=await req('auth/login','POST',{username:'schedule-test',password:'synthetic-only-password'});auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
  const catalog=(await req('catalog')).data;
  const make=async()=>{const p=catalog.products.find(p=>p.id==='classic'),pk=p.packages.find(p=>p.id==='all'),date='2027-12-24';const out=await req('admin/reservations','POST',{requestId:randomUUID(),catalogVersion:catalog.version,productId:p.id,packageId:pk.id,optionIds:[],person:'합성 일정 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'confirmed',booking:{date,time:'14:00',amount:440000,amountMode:'manual',place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',extra:''}});assert.equal(out.status,201,JSON.stringify(out.data));return out.data.item;};
  const change=(item,quantity)=>({version:item.version,addOns:[{id:'bouquet',quantity,unitAmount:30000}]});
  let item=await make(),path='admin/consultations/'+item.id;
  const original={...item.communication.booking},body=change(item,1);
  assert.equal((await req(path+'/addons','POST',body,{})).status,401);
  assert.equal((await req(path+'/addons','POST',body,{Cookie:auth.Cookie})).status,403);
  let out=await req(path+'/addons','POST',body);assert.equal(out.status,200,JSON.stringify(out.data));item=out.data.item;
  assert.equal(item.communication.booking.paymentConfirmed,true);assert.equal(item.communication.booking.receivedAmount,440000);assert.equal(item.communication.opsPayment.balance,30000);assert.equal(item.integration.state,'succeeded');assert.equal(item.integration.operation,'addons');assert.equal(item.communication.booking.amount,470000);assert.equal(calls.create,1);assert.equal(calls.change,1);
  for(const key of ['date','time','place','opsPax','opsPaymentMethod'])assert.equal(item.communication.booking[key],original[key]);
  assert.equal((await req(path+'/addons','POST',body)).status,409);assert.equal(calls.change,1);
  const bad=change(item,2);bad.amount=1;
  assert.equal((await req(path+'/addons','POST',bad)).status,400);assert.equal(calls.change,1);
  // A lost update response is recovered from its durable receipt without a second write.
  lost=true;out=await req(path+'/addons','POST',change(item,2));item=out.data.item;
  assert.equal(item.integration.state,'uncertain');assert.equal(item.communication.booking.amount,470000);assert.equal(calls.change,2);
  const jobId=item.integration.id;
  assert.equal((await req(path+'/communications','PUT',{version:item.version,booking:item.communication.booking,drafts:{}})).data.error,'OPS_SCHEDULE_PENDING');
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[jobId]);
  item=(await req(path)).data.item;assert.equal(item.communication.booking.amount,500000);assert.equal(item.integration.state,'succeeded');assert.equal(calls.change,2);
  // New collisions preserve the prior schedule and become terminal; the old job is not retried.
  failure=Object.assign(Error('synthetic conflict'),{status:409,code:'OPS_RESOURCE_CONFLICT',safe:true});
  item=(await req(path+'/addons','POST',change(item,3))).data.item;
  assert.equal(item.integration.state,'conflict');assert.equal(item.communication.booking.amount,500000);const writes=calls.change,lookups=calls.lookup;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[jobId]);
  await req(path);await processIntegration(db,jobId,env,adapters);
  assert.equal((await req(path+'/addons','POST',change(item,4))).status,409);assert.equal(calls.change,writes);assert.equal(calls.lookup,lookups);
  // A pre-existing creation conflict is not requeued by this feature.
  const other=await make(),otherPath='admin/consultations/'+other.id;
  await db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[other.integration.id]);
  assert.equal((await req(otherPath+'/addons','POST',change(other,4))).status,409);
  assert.equal(calls.change,writes);
  // Only two automatic write attempts. A later explicit check may read a receipt, never write again.
  failure=Object.assign(Error('synthetic timeout'),{status:503,code:'OPS_HTTP_503'});let third=await make(),thirdPath='admin/consultations/'+third.id;
  third=(await req(thirdPath+'/addons','POST',change(third,3))).data.item;const thirdJob=third.integration.id;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[thirdJob]);await req(thirdPath);const twoWrites=calls.change;
  await db.query("UPDATE moment_link.integration_jobs SET updated_at=now()-interval '5 minutes' WHERE id=$1",[thirdJob]);await req(thirdPath);await processIntegration(db,thirdJob,env,adapters);assert.equal(calls.change,twoWrites);
  assert.equal((await db.query('SELECT attempts FROM moment_link.integration_jobs WHERE id=$1',[thirdJob])).rows[0].attempts,2);
  assert.equal((await req(thirdPath)).data.item.communication.booking.time,'14:00');
  assert.equal((await db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await pg.close();}
});

