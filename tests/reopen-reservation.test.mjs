import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {hash} from '../server/security.mjs';

const booking={date:'2099-11-21',time:'20:00',amount:440000,receivedAmount:90000,amountMode:'manual',place:'합성 장소',extra:'보존 안내',scheduleConfirmed:true,paymentConfirmed:true};
const communication={booking,reservation:{source:'manual',confirmedAt:'2026-11-01T00:00:00Z'},drafts:{confirmed:'보존 문구'},events:[{stage:'confirmed',kind:'manual_sent',at:'2026-11-01T00:00:00Z'}]};
test('reopening preserves money, notes and history, moves to inbox and restarts the payment window',async()=>{
 const f=await ownershipFixture();try{
  let item=await f.add({status:'confirmed',owner:f.staff['counselor-a'].id,communication}),path='admin/consultations/'+item.id;
  assert.equal((await f.request(path,'counselor-b','PATCH',{version:item.version,status:'consulting'})).status,403);
  for(const status of ['consulting','awaiting_payment']){
   const previous=item,reply=await f.request(path,'counselor-a','PATCH',{version:item.version,status});assert.equal(reply.status,200,JSON.stringify(reply.data));item=reply.data.item;
   assert.deepEqual(item.communication,previous.communication);assert.equal(item.notes,previous.notes);
   assert.equal((await f.request(path,'counselor-a','PATCH',{version:previous.version,status})).status,409);
  }
  assert.ok(Math.abs(Date.now()-Date.parse(item.awaiting_payment_at))<5000);
  assert.equal((await f.request('admin/consultations?view=inbox&status=awaiting_payment','counselor-a')).data.items[0].id,item.id);
  assert.equal((await f.request('admin/consultations?view=reservations','counselor-a')).data.items.length,0);
  let reply=await f.request(path+'/communications','counselor-a','PUT',{version:item.version,booking:{...booking,place:'수정 장소'},drafts:{confirmed:'수정 문구'}});assert.equal(reply.status,200,JSON.stringify(reply.data));item=reply.data.item;
  reply=await f.request(path+'/reservation','counselor-a','POST',{version:item.version,booking:item.communication.booking,drafts:item.communication.drafts,approved:true});assert.equal(reply.status,200,JSON.stringify(reply.data));item=reply.data.item;
  assert.equal(item.status,'confirmed');assert.equal(item.communication.booking.receivedAmount,90000);assert.equal(item.communication.events.length,1);
  assert.deepEqual(item.status_timeline.slice(-3).map(x=>x.to),['consulting','awaiting_payment','confirmed']);
  assert.equal((await f.request('admin/consultations?view=reservations&status=confirmed','counselor-a')).data.items[0].id,item.id);
 }finally{await f.pg.close();}
});
test('linked status changes keep the OPS job intact and existing conflicts cannot be reopened or retried',async()=>{
 const f=await ownershipFixture();try{
  let item=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id,communication});
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,approved_by,booking) VALUES($1,$2,'boatn',$3,'synthetic-ops','succeeded',$4,$5)",[randomUUID(),item.id,'moment-link:'+item.id,f.staff['owner-admin'].id,JSON.stringify({date:booking.date,time:booking.time})]);
  const job=async()=>(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[item.id])).rows[0],before=await job();
  let reply=await f.request('admin/consultations/'+item.id,'owner-admin','PATCH',{version:item.version,status:'consulting'});assert.equal(reply.status,200);item=reply.data.item;assert.deepEqual(await job(),before);
  reply=await f.request('admin/consultations/'+item.id,'owner-admin','PATCH',{version:item.version,status:'confirmed',confirmation:{booking,drafts:{confirmed:'검수'},approved:true}});assert.equal(reply.status,200);item=reply.data.item;assert.deepEqual(await job(),before);
  await f.db.query("UPDATE moment_link.integration_jobs SET state='conflict',attempts=2,error_code='OPS_RESOURCE_CONFLICT' WHERE consultation_id=$1",[item.id]);const conflict=await job();
  reply=await f.request('admin/consultations/'+item.id,'owner-admin','PATCH',{version:item.version,status:'awaiting_payment'});assert.equal(reply.status,409);assert.deepEqual(await job(),conflict);
 }finally{await f.pg.close();}
});
test('OPS status lookup is signed, scoped, read-only and omits private customer details',async()=>{
 const f=await ownershipFixture();try{
  const item=await f.add({status:'awaiting_payment',communication});
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,booking,approved_by) VALUES($1,$2,'boatn',$3,'synthetic-status','conflict','{}',$4)",[randomUUID(),item.id,'moment-link:'+item.id,f.staff['owner-admin'].id]);
  const env={OPS_WRITES_ENABLED:'true',OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_TOKEN:'synthetic-status-token'},app=createApp({db:f.db,env}),path='/api/integrations/boatn/consultation-statuses';
  const raw=JSON.stringify({bookingIds:['synthetic-status','unlinked']}),at=String(Date.now()),sig=createHmac('sha256',hash(env.OPS_BOATN_TOKEN)).update(['boatn-to-moment-v1',at,'POST',path,raw].join('\n')).digest('hex');
  const req=(signature=sig,body=raw)=>app(new Request('https://test.invalid'+path,{method:'POST',headers:{'X-BOATN-Timestamp':at,'X-BOATN-Signature':signature},body}));
  assert.equal((await req('00'.repeat(32))).status,401);assert.equal((await req(sig,raw+' ')).status,401);
  const before=await f.db.query('SELECT * FROM moment_link.integration_jobs'),res=await req(),data=await res.json();assert.equal(res.status,200);assert.equal(data.items.length,1);assert.equal(data.items[0].status,'awaiting_payment');assert.deepEqual(Object.keys(data.items[0]).sort(),['id','status','syncState','updatedAt']);assert.deepEqual(await f.db.query('SELECT * FROM moment_link.integration_jobs'),before);
  await f.db.query('UPDATE moment_link.consultations SET deleted_at=now() WHERE id=$1',[item.id]);assert.equal((await (await req()).json()).items.length,0);
 }finally{await f.pg.close();}
});
