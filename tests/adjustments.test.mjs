import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {seollemDigest,dispatchSeollemBookings} from '../server/seollem-bookings.mjs';
import {dispatchEventCalendars} from '../server/event-calendar.mjs';
import {processIntegration} from '../server/jobs.mjs';
const booking={date:'2099-11-21',time:'18:00',amount:398000,receivedAmount:398000,baseAmount:398000,addOns:[],amountMode:'manual',scheduleConfirmed:true,paymentConfirmed:true,place:'합성 장소',extra:''};
const communication={booking,reservation:{confirmedAt:'2099-10-01T00:00:00Z'}};
const data=r=>({version:r.version,requestId:randomUUID(),target:'bouquet',reduction:30000,refund:30000,reason:'고객 직접 준비',confirmed:true});
test('visit/trunk partial refund updates one OPS reservation and one calendar event, retains confirmation and real payment evidence',async()=>{
 const f=await ownershipFixture(),remote=new Map(),calendars=new Map();
 const adapters={seollemBookings:{sync:async d=>{remote.set(d.externalRef,d);return {contract:'moment-seollem-v1',id:'moment_'+d.externalRef.slice(12),revision:d.revision,digest:seollemDigest(d),stale:false};}},eventCalendar:{sync:async d=>{const id=d.eventId||'synthetic_'+d.externalRef.slice(12);calendars.set(id,d);return {id,digest:d.digest,snapshot:{etag:'synthetic-'+d.revision}};}}};
 const origin='https://test.moment-link.invalid',app=createApp({db:f.db,env:{APP_ORIGIN:origin,SEOLLEM_BOOKING_SYNC_ENABLED:'true',EVENT_CALENDAR_ENABLED:'true'},adapters});
 const request=async(id,method='GET',body)=>{const res=await app(new Request(origin+'/api/admin/consultations/'+id,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions['owner-admin']},...(body?{body:JSON.stringify(body)}:{})}));return {status:res.status,data:await res.json()};};
 try{
  for(const category of ['visit','trunk']){
   let r=await f.add({status:'confirmed',communication});await f.db.query('UPDATE moment_link.consultations SET category=$1 WHERE id=$2',[category,r.id]);
   // Dispatch initial linked snapshots without production clients.
   await dispatchEventCalendars(f.db,{EVENT_CALENDAR_ENABLED:'true'},adapters,r.id);
   await dispatchSeollemBookings(f.db,{SEOLLEM_BOOKING_SYNC_ENABLED:'true'},adapters,r.id);r=(await request(r.id)).data.item;
   const beforeEvents=calendars.size,payload=data(r),out=await request(r.id+'/adjustments','POST',payload);assert.equal(out.status,200,JSON.stringify(out.data));r=out.data.item;
   assert.equal(r.status,'confirmed');assert.equal(r.communication.booking.amount,368000);assert.equal(r.communication.booking.receivedAmount,368000);assert.equal(r.communication.booking.refundedAmount,30000);assert.equal(r.communication.adjustments.length,1);
   assert.equal(r.seollem.state,'synced');assert.equal(r.calendar.state,'synced');assert.equal(calendars.size,beforeEvents);
   assert.equal(remote.get('moment-link:'+r.id).receivedAmount,368000);assert.equal(remote.get('moment-link:'+r.id).refundedAmount,30000);
   const event=calendars.get(r.calendar.event_id);assert.match(event.description,/총액: 368,000원/);assert.match(event.description,/잔금: 0원/);assert.match(event.description,/꽃다발 모두 제외/);
   assert.match(r.communication.drafts.confirmed,/368,000원/);assert.match(r.communication.drafts.confirmed,/환불 완료 30,000원/);
   const repeat=await request(r.id+'/adjustments','POST',payload);assert.equal(repeat.data.item.communication.adjustments.length,1);
   assert.equal((await request(r.id+'/adjustments','POST',{...payload,refund:20000})).status,409);
  }
  assert.equal(remote.size,2);assert.equal(calendars.size,2);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
test('validation and existing OPS/calendar conflicts preserve all rows; included and purchased bouquet cancellation agree',async()=>{
 const f=await ownershipFixture();try{
  let r=await f.add({status:'confirmed',communication}),path='admin/consultations/'+r.id+'/adjustments';
  await f.db.query("UPDATE moment_link.event_calendar_jobs SET state='synced' WHERE consultation_id=$1",[r.id]);await f.db.query("UPDATE moment_link.seollem_booking_jobs SET state='synced' WHERE consultation_id=$1",[r.id]);
  for(const patch of [{refund:0},{refund:30001},{reduction:398000},{confirmed:false},{reason:''},{refund:-1}])assert.equal((await f.request(path,'owner-admin','POST',{...data(r),...patch})).status,400);
  for(const table of ['event_calendar_jobs','seollem_booking_jobs']){
   await f.db.query('UPDATE moment_link.'+table+" SET state='conflict' WHERE consultation_id=$1",[r.id]);const before=(await f.db.query('SELECT * FROM moment_link.'+table)).rows;
   assert.equal((await f.request(path,'owner-admin','POST',data(r))).status,409);assert.deepEqual((await f.db.query('SELECT * FROM moment_link.'+table)).rows,before);await f.db.query('UPDATE moment_link.'+table+" SET state='synced' WHERE consultation_id=$1",[r.id]);
  }
  const changed=globalThis.MomentLinkAdjustment.calculate({...r,snapshot:{options:[{id:'bouquet',name:'꽃다발 추가',amount:30000}]},communication:{...communication,booking:{...booking,baseAmount:368000,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}]}}},data(r)).booking;
  assert.equal(changed.addOns.length,0);assert.equal(changed.baseAmount,368000);assert.deepEqual(changed.excludedOptionIds,['bouquet']);
  assert.doesNotMatch(globalThis.MomentLinkMessages.generate({snapshot:{options:[{id:'bouquet',name:'꽃다발 추가'}]}},'confirmed',changed),/추가 선택: 꽃다발/);
 }finally{await f.pg.close();}
});
test('yacht refund receipt reconciles response loss once; repeated failures cap at two writes',async()=>{
 const f=await ownershipFixture(),receipts=new Map();let calls=0,lost=true,fail=false;
 const adapter={metadata:async()=>({partialRefunds:true}),adjustmentResult:async(_,id)=>receipts.get(id),adjustBooking:async d=>{calls++;if(fail)throw Error('synthetic network failure');const receipt={id:d.bookingId,requestId:d.requestId,applied:true,amount:d.expected.amount-d.reduction,received:d.expected.received-d.refund,balance:0,refund:d.refund,currentState:'ready',currentDeparture:d.expected.departure,currentAmount:d.expected.amount-d.reduction,currentReceived:d.expected.received-d.refund};receipts.set(d.requestId,receipt);if(lost){lost=false;throw Error('response lost');}return receipt;}};
 const env={APP_ORIGIN:'https://test.moment-link.invalid',OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}},app=createApp({db:f.db,env,adapters});
 const request=async(r,d)=>{const res=await app(new Request(env.APP_ORIGIN+'/api/admin/consultations/'+r.id+'/adjustments',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...f.sessions['owner-admin']},body:JSON.stringify(d)}));return {status:res.status,data:await res.json()};};
 const add=async()=>{const r=await f.add();await f.db.query("UPDATE moment_link.consultations SET category='yacht',status='confirmed',communication=$2 WHERE id=$1",[r.id,JSON.stringify(communication)]);await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,approved_by,booking) VALUES($1,$1,'boatn',$2,$3,'succeeded',$4,$5)",[r.id,'moment-link:'+r.id,'synthetic-'+r.id,f.staff['owner-admin'].id,JSON.stringify(booking)]);return r;};
 try{
  let r=await add(),d=data(r),out=await request(r,d);assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.booking.amount,398000);assert.equal(out.data.item.integration.state,'uncertain');
  out=await request(r,d);assert.equal(out.data.item.communication.booking.amount,368000);assert.equal(calls,1);await request(r,d);assert.equal(calls,1);
  r=await add();fail=true;await request(r,data(r));await processIntegration(f.db,r.id,env,adapters);await processIntegration(f.db,r.id,env,adapters);assert.equal(calls,3);
  r=await add();await f.db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[r.id]);const before=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[r.id])).rows;
  assert.equal((await request(r,data(r))).status,409);assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[r.id])).rows,before);
 }finally{await f.pg.close();}
});
