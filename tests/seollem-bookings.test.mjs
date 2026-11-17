import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ownershipFixture} from './ownership-fixture.mjs';
import {dispatchSeollemBookings,seollemRequest,seollemDigest} from '../server/seollem-bookings.mjs';
const booking={date:'2099-11-21',time:'18:00',amount:249000,receivedAmount:90000,paymentConfirmed:true,scheduleConfirmed:true,place:'합성 장소',extra:'',opsPaymentMethod:'bank'};
const communication={booking,reservation:{source:'manual',confirmedAt:'2099-10-01T00:00:00Z'}};
const env={SEOLLEM_BOOKING_SYNC_ENABLED:'true'};
const read=(f,id)=>f.db.query('SELECT * FROM moment_link.seollem_booking_jobs WHERE consultation_id=$1',[id]).then(r=>r.rows[0]);
const ack=d=>({contract:'moment-seollem-v1',id:d.status==='cancelled'?null:'moment_'+d.externalRef.slice(12),revision:d.revision,digest:seollemDigest(d),stale:false});

test('forward-only migration never enrolls old reservations, yacht bookings or existing BOATN conflicts',async()=>{
 const f=await ownershipFixture();try{
  await f.pg.exec('DROP TRIGGER queue_seollem_booking ON moment_link.consultations');
  const old=await f.add({status:'confirmed',communication});
  await f.pg.exec(await readFile(new URL('../db/012_seollem_booking_sync.sql',import.meta.url),'utf8'));
  await f.db.query("UPDATE moment_link.consultations SET status='consulting' WHERE id=$1",[old.id]);
  await f.db.query("UPDATE moment_link.consultations SET status='confirmed' WHERE id=$1",[old.id]);assert.equal(await read(f,old.id),undefined);
  const conflict=await f.add();await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,approved_by,booking) VALUES($1,$1,'boatn',$2,'conflict',$3,'{}')",[conflict.id,'moment-link:'+conflict.id,f.staff['owner-admin'].id]);
  const before=(await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows;
  await f.db.query("UPDATE moment_link.consultations SET status='confirmed',communication=$2 WHERE id=$1",[conflict.id,JSON.stringify(communication)]);assert.equal(await read(f,conflict.id),undefined);
  const yacht=await f.add();await f.db.query("UPDATE moment_link.consultations SET category='yacht',status='confirmed',communication=$2 WHERE id=$1",[yacht.id,JSON.stringify(communication)]);assert.equal(await read(f,yacht.id),undefined);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows,before);
 }finally{await f.pg.close();}
});
test('new first confirmation queues once; changes and cancellation keep source identity and partial payments',async()=>{
 const f=await ownershipFixture();try{
  let r=await f.add();await f.db.query("UPDATE moment_link.consultations SET status='confirmed',communication=$2 WHERE id=$1",[r.id,JSON.stringify(communication)]);
  let j=await read(f,r.id),d=seollemRequest(j);assert.equal(j.revision,1);assert.equal(d.receivedAmount,90000);assert.equal(d.paymentMethod,'bank');
  const response=await f.request('admin/consultations/'+r.id);assert.equal(response.status,200);assert.equal(response.data.item.seollem.state,'pending');
  await f.db.query('UPDATE moment_link.consultations SET read_at=now() WHERE id=$1',[r.id]);assert.equal((await read(f,r.id)).revision,1);
  await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,time}','\"19:30\"') WHERE id=$1",[r.id]);j=await read(f,r.id);assert.equal(j.revision,2);assert.equal(seollemRequest(j).time,'19:30');
  await f.db.query("UPDATE moment_link.consultations SET status='cancelled' WHERE id=$1",[r.id]);j=await read(f,r.id);assert.equal(j.revision,3);assert.equal(seollemRequest(j).status,'cancelled');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.seollem_booking_jobs')).rows[0].n,1);
 }finally{await f.pg.close();}
});
test('worker never edits consultation/BOATN/calendar rows and stops after two identical failures',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'confirmed',communication});const source=(await f.db.query('SELECT * FROM moment_link.consultations')).rows,calendar=(await f.db.query('SELECT * FROM moment_link.event_calendar_jobs')).rows;let calls=0;
  const adapters={seollemBookings:{sync:async()=>{calls++;throw Error('synthetic connection failure');}}};
  await dispatchSeollemBookings(f.db,{},adapters);assert.equal(calls,0);
  for(let i=0;i<4;i++)await dispatchSeollemBookings(f.db,env,adapters);
  assert.equal(calls,2);assert.equal((await read(f,r.id)).attempts,2);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.consultations')).rows,source);assert.deepEqual((await f.db.query('SELECT * FROM moment_link.event_calendar_jobs')).rows,calendar);
 }finally{await f.pg.close();}
});
test('concurrent edit during delivery remains pending and reuses the native booking/calendar identifiers',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'confirmed',communication});let calls=0,firstId;
  await f.db.query("UPDATE moment_link.event_calendar_jobs SET event_id='adopted123' WHERE consultation_id=$1",[r.id]);
  const adapters={seollemBookings:{sync:async d=>{calls++;assert.equal(d.eventId,'adopted123');if(calls===1){firstId=d.externalRef;await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,time}','\"20:00\"') WHERE id=$1",[r.id]);}else{assert.equal(d.externalRef,firstId);assert.equal(d.time,'20:00');}return ack(d);}}};
  await dispatchSeollemBookings(f.db,env,adapters);assert.equal((await read(f,r.id)).state,'pending');await dispatchSeollemBookings(f.db,env,adapters);assert.equal((await read(f,r.id)).state,'synced');assert.equal(calls,2);
 }finally{await f.pg.close();}
});
test('conflicts stay stopped even after later source edits; trunk maps its original package',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add();await f.db.query("UPDATE moment_link.consultations SET category='trunk',product_id='trunk',package_id='consult',status='confirmed',communication=$2 WHERE id=$1",[r.id,JSON.stringify(communication)]);let calls=0;
  const adapters={seollemBookings:{sync:async d=>{calls++;assert.equal(d.category,'trunk');assert.equal(d.packageId,'consult');throw Object.assign(Error('synthetic conflict'),{code:'SEOLLEM_LOCAL_CHANGE',conflict:true});}}};
  await dispatchSeollemBookings(f.db,env,adapters);await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,time}','\"20:00\"') WHERE id=$1",[r.id]);await dispatchSeollemBookings(f.db,env,adapters);
  assert.equal(calls,1);assert.equal((await read(f,r.id)).state,'conflict');
 }finally{await f.pg.close();}
});
