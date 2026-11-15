import test from 'node:test';
import assert from 'node:assert/strict';
import {ownershipFixture} from './ownership-fixture.mjs';
import {dispatchEventCalendars,calendarRequest} from '../server/event-calendar.mjs';
const booking={date:'2099-11-21',time:'20:00',amount:249000,receivedAmount:90000,paymentConfirmed:true,scheduleConfirmed:true,place:'합성 장소',extra:''};
const communication={booking,reservation:{source:'manual',confirmedAt:'2026-11-15T00:00:00Z'}};
const enabled={EVENT_CALENDAR_ENABLED:'true'};
const read=(f,id)=>f.db.query('SELECT * FROM moment_link.event_calendar_jobs WHERE consultation_id=$1',[id]).then(r=>r.rows[0]);
test('confirm and edit queue calendar atomically; draft/read do not; cancel and restore retain one link',async()=>{
 const f=await ownershipFixture();try{
  let r=await f.add({owner:f.staff['owner-admin'].id});assert.equal(await read(f,r.id),undefined);
  let out=await f.request('admin/consultations/'+r.id+'/reservation','owner-admin','POST',{version:r.version,booking,drafts:{},approved:true});assert.equal(out.status,200,JSON.stringify(out.data));r=out.data.item;
  let j=await read(f,r.id);assert.equal(j.revision,1);
  await f.request('admin/consultations/'+r.id);assert.equal((await read(f,r.id)).revision,1);
  await f.db.query("UPDATE moment_link.consultations SET status='consulting' WHERE id=$1",[r.id]);
  await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,time}','\"22:00\"') WHERE id=$1",[r.id]);
  j=await read(f,r.id);assert.equal(j.desired.booking.time,'20:00');assert.equal(j.desired.status,'consulting');
  await f.db.query("UPDATE moment_link.consultations SET status='confirmed' WHERE id=$1",[r.id]);j=await read(f,r.id);assert.equal(j.desired.booking.time,'22:00');
  await f.db.query("UPDATE moment_link.consultations SET status='cancelled' WHERE id=$1",[r.id]);assert.equal((await read(f,r.id)).desired.status,'cancelled');
  await f.db.query("UPDATE moment_link.consultations SET status='confirmed' WHERE id=$1",[r.id]);assert.equal((await read(f,r.id)).desired.status,'confirmed');
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.event_calendar_jobs')).rows[0].n,1);
 }finally{await f.pg.close()}
});
test('worker retries at most twice, records links only and leaves OPS conflicts/source data unchanged',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'confirmed',communication});
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,approved_by,booking) VALUES($1,$1,'boatn',$2,'conflict',$3,'{}')",[r.id,'moment-link:'+r.id,f.staff['owner-admin'].id]);
  const before=(await f.db.query('SELECT row_to_json(c) AS row FROM moment_link.consultations c WHERE id=$1',[r.id])).rows[0];
  const conflict=(await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows;let calls=0;
  const adapters={eventCalendar:{sync:async()=>{calls++;throw Error('synthetic failed connection')}}};
  await dispatchEventCalendars(f.db,{},adapters);assert.equal(calls,0);
  for(let i=0;i<4;i++)await dispatchEventCalendars(f.db,enabled,adapters);
  assert.equal(calls,2);assert.equal((await read(f,r.id)).attempts,2);
  assert.deepEqual((await f.db.query('SELECT row_to_json(c) AS row FROM moment_link.consultations c WHERE id=$1',[r.id])).rows[0],before);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows,conflict);
 }finally{await f.pg.close()}
});
test('concurrent saved change during delivery remains pending and next update uses same event',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'confirmed',communication});let calls=0;
  const adapters={eventCalendar:{sync:async d=>{calls++;if(calls===1)await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,time}','\"21:00\"') WHERE id=$1",[r.id]);else assert.equal(d.eventId,'synthetic1');return {id:'synthetic1',digest:d.digest,snapshot:{etag:'"1"'}}}}};
  await dispatchEventCalendars(f.db,enabled,adapters);let j=await read(f,r.id);assert.equal(j.state,'pending');assert.equal(j.revision,2);assert.equal(j.synced_revision,1);
  await dispatchEventCalendars(f.db,enabled,adapters);j=await read(f,r.id);assert.equal(j.state,'synced');assert.equal(j.synced_revision,2);assert.equal(j.event_id,'synthetic1');assert.equal(calls,2);
 }finally{await f.pg.close()}
});
test('trunk payload uses confirmed details and calendar queue is separate from future Seollem OPS',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'new'});await f.db.query("UPDATE moment_link.consultations SET category='trunk',status='confirmed',communication=$2 WHERE id=$1",[r.id,JSON.stringify(communication)]);
  const d=calendarRequest(await read(f,r.id));assert.equal(d.category,'trunk');assert.ok(d.summary.startsWith('[트렁크 확정]'));assert.ok(d.description.includes('159,000원'));assert.ok(d.description.includes('01000000000'));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.integration_jobs')).rows[0].n,0);
  for(const category of ['yacht','heli']){const other=await f.add();await f.db.query('UPDATE moment_link.consultations SET category=$2,status=\'confirmed\',communication=$3 WHERE id=$1',[other.id,category,JSON.stringify(communication)]);assert.equal(await read(f,other.id),undefined);}
 }finally{await f.pg.close()}
});
