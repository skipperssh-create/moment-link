import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {initialSettings} from '../server/seed.mjs';
const booking={date:'2099-11-21',time:'14:00',amount:249000,place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''};
test('manual reservation lifecycle, filtered search, permissions and messages remain independent of OPS',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://test.moment-link.invalid';
 try{
  await migrate(db);const secret=randomUUID(),adminId=randomUUID(),staffId=randomUUID();
  for(const [id,name,role] of [[adminId,'reservation-admin','admin'],[staffId,'reservation-staff','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,name,await passwordHash(secret),role]);
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...initialSettings,accepting:true,privacyController:'합성',privacyContact:'합성',privacyText:'합성 검수',retentionDays:1,consentVersion:'test'})]);
  const app=createApp({db,env:{APP_ORIGIN:origin}});
  const req=async(path,method='GET',data,auth={})=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=async username=>{const r=await req('auth/login','POST',{username,password:secret});return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf};};
  const auth=await login('reservation-admin'),staff=await login('reservation-staff');
  for(let i=0;i<3;i++){const r=await req('consultations','POST',{catalogVersion:1,productId:'visit',packageId:'light',category:'visit',person:'합성 예약 '+i,phone:'0100000000'+i,preferences:[{date:'2099-11-21',time:'오후'}],place:'합성 장소',notes:'SYNTHETIC ONLY',consent:true,consentVersion:'test'},{'Idempotency-Key':randomUUID()});assert.equal(r.status,201);}
  const [r,other,external]=(await db.query('SELECT * FROM moment_link.consultations ORDER BY person')).rows;
  const base='admin/consultations/'+r.id,path=base+'/reservation';
  const data={version:r.version,booking,drafts:{confirmed:'합성 확정 안내',thanks:'합성 감사 안내'},approved:true};
  assert.equal((await req(path,'POST',data)).status,401);
  assert.equal((await req(path,'POST',data,staff)).status,404);
  assert.equal((await req(path,'POST',data,{...auth,'X-CSRF-Token':'wrong'})).status,403);
  for(const b of [{...booking,paymentConfirmed:false},{...booking,place:''},{...booking,date:'2000-01-01'}])assert.equal((await req(path,'POST',{...data,booking:b},auth)).status,400);
  // A consultation previously closed without a reservation can still be booked explicitly.
  await db.query("UPDATE moment_link.consultations SET status='closed',assignee=$1 WHERE id=$2",[staffId,r.id]);
  let out=await req(path,'POST',data,staff);assert.equal(out.status,200,JSON.stringify(out.data));let current=out.data.item;
  assert.equal(current.status,'confirmed');assert.deepEqual(current.snapshot,r.snapshot);assert.deepEqual(current.preferences,r.preferences);assert.equal(current.expires_at,r.expires_at.toISOString());
  assert.equal(current.communication.reservation.source,'manual');assert.equal(current.communication.reservation.confirmedBy,'reservation-staff');
  assert.equal((await req(path,'POST',data,auth)).status,409);
  let list=await req('admin/consultations?view=reservations&status=confirmed','GET',undefined,auth);assert.deepEqual(list.data.items.map(x=>x.id),[r.id]);
  assert.equal((await req('admin/consultations?view=inbox','GET',undefined,auth)).data.items.length,2);
  assert.equal((await req('admin/consultations?view=reservations&q=01000000000','GET',undefined,staff)).data.items.length,1);
  assert.equal((await req('admin/consultations?view=reservations&q=missing','GET',undefined,auth)).data.items.length,0);
  assert.equal((await req('admin/consultations?view=invalid','GET',undefined,auth)).status,400);
  assert.equal((await req('admin/consultations?view=reservations&offset=50','GET',undefined,auth)).data.items.length,0);
  // Quote changes require explicit re-confirmation, preserving prior manual-send records.
  assert.equal((await req(base+'/communications','PUT',{version:current.version,booking:{...booking,amount:300000},drafts:data.drafts},auth)).status,409);
  out=await req(base+'/communications','POST',{version:current.version,stage:'confirmed',kind:'manual_sent',eventId:randomUUID()},auth);assert.equal(out.status,200);current=out.data.item;
  out=await req(path,'POST',{...data,version:current.version,booking:{...booking,date:'2099-11-22'}},auth);assert.equal(out.status,200);current=out.data.item;assert.equal(current.communication.events.length,1);
  assert.equal((await req(base,'PATCH',{version:current.version,status:'new'},auth)).status,409);
  out=await req(base,'PATCH',{version:current.version,status:'closed'},staff);assert.equal(out.status,200);current=out.data.item;
  assert.equal((await req('admin/consultations?view=reservations&status=confirmed','GET',undefined,auth)).data.items.length,0);
  assert.equal((await req('admin/consultations?view=reservations&status=closed','GET',undefined,auth)).data.items[0].id,r.id);
  assert.equal((await req(base+'/communications','POST',{version:current.version,stage:'reminder',kind:'composer_requested',eventId:randomUUID()},auth)).status,400);
  assert.equal((await req(base+'/communications','PUT',{version:current.version,booking:{...booking,amount:300000},drafts:data.drafts},auth)).status,409);
  out=await req(base+'/communications','POST',{version:current.version,stage:'thanks',kind:'composer_requested',eventId:randomUUID()},auth);assert.equal(out.status,200);current=out.data.item;
  assert.equal((await req(path,'POST',{...data,version:current.version},auth)).status,409);
  assert.equal((await req(base,'PATCH',{version:current.version,status:'new'},auth)).status,409);
  out=await req('admin/consultations/'+other.id+'/reservation','POST',{...data,version:other.version,booking:{...booking,date:'2099-11-20'}},auth);assert.equal(out.status,200);current=out.data.item;
  list=await req('admin/consultations?view=reservations&status=all','GET',undefined,auth);assert.deepEqual(list.data.items.map(x=>x.id),[other.id,r.id]);
  assert.equal((await req('admin/consultations?view=reservations&status=all','GET',undefined,staff)).data.items.length,1);
  out=await req('admin/consultations/'+other.id,'PATCH',{version:current.version,status:'cancelled'},auth);assert.equal(out.status,200);current=out.data.item;
  assert.equal((await req('admin/consultations?view=reservations&status=cancelled','GET',undefined,auth)).data.items[0].id,other.id);
  assert.equal((await req('admin/consultations/'+other.id+'/communications','POST',{version:current.version,stage:'confirmed',kind:'composer_requested',eventId:randomUUID()},auth)).status,400);
  for(const table of ['outbox','integration_jobs'])assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.'+table)).rows[0].n,0);
  await db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking,state) VALUES($1,$2,'seollem',$3,$4,$5,'pending')",[randomUUID(),external.id,'test:'+external.id,adminId,JSON.stringify(booking)]);
  assert.equal((await req('admin/consultations/'+external.id+'/reservation','POST',{...data,version:external.version},auth)).status,409);
  await db.query('UPDATE moment_link.consultations SET expires_at=now() WHERE id=$1',[r.id]);
  assert.equal((await req('admin/consultations?view=reservations&status=closed','GET',undefined,auth)).data.items.length,0);
  assert.equal((await req(path,'POST',{...data,version:current.version},auth)).status,404);
 }finally{await pg.close();}
});
