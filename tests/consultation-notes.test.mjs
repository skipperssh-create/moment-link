import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {initialSettings} from '../server/seed.mjs';

test('memo persistence, replay, validation and authorization use the private consultation store',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://test.moment-link.invalid';
 try{
  await migrate(db);const password=randomUUID();
  for(const [name,role] of [['admin','admin'],['staff','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[randomUUID(),name,await passwordHash(password),role]);
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...initialSettings,accepting:true,privacyController:'합성',privacyContact:'합성',privacyText:'합성',retentionDays:1,consentVersion:'test'})]);
  const app=createApp({db,env:{APP_ORIGIN:origin}});
  const req=async(path,method='GET',data,auth={})=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=async username=>{const r=await req('auth/login','POST',{username,password});return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf};};
  const auth=await login('admin'),staff=await login('staff');
  const submitted=await req('consultations','POST',{catalogVersion:1,productId:'visit',packageId:'light',category:'visit',person:'합성 메모 검수',phone:'01000000000',preferences:[{date:'2099-11-21',time:'오후'}],place:'합성 장소',notes:'고객 원문',consent:true,consentVersion:'test'},{'Idempotency-Key':randomUUID()});assert.equal(submitted.status,201);
  const r=(await req('admin/consultations','GET',undefined,auth)).data.items[0],path='admin/consultations/'+r.id,body={noteId:randomUUID(),body:'창문에서 보이지 않게 준비\n합성 테스트'};
  assert.equal(r.latest_note,null);assert.equal(r.note_count,0);
  assert.equal((await req(path+'/notes','POST',body)).status,401);
  assert.equal((await req(path+'/notes','POST',body,staff)).status,404);
  assert.equal((await req(path+'/notes','POST',{body:'   '},auth)).status,400);
  assert.equal((await req(path+'/notes','POST',{body:'x'.repeat(4001)},auth)).status,400);
  assert.equal((await req(path+'/notes','POST',{body:'<script>'},auth)).status,400);
  const first=await req(path+'/notes','POST',body,auth);assert.equal(first.status,200);assert.equal(first.data.note.id,body.noteId);
  const replay=await req(path+'/notes','POST',body,auth);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.equal((await req(path+'/notes','POST',{...body,body:'다른 내용'},auth)).status,409);
  const saved=(await req(path,'GET',undefined,auth)).data;
  assert.equal(saved.notes.length,1);assert.equal(saved.notes[0].body,body.body);assert.equal(saved.item.notes,'고객 원문');assert.equal(saved.item.version,r.version);assert.equal(saved.item.status,r.status);assert.deepEqual(saved.item.communication,r.communication);
  assert.equal(saved.history.filter(x=>x.action==='consultation.note').length,1);
  const list=(await req('admin/consultations?view=inbox','GET',undefined,auth)).data;
  assert.equal(list.items[0].latest_note.id,body.noteId);assert.equal(list.items[0].latest_note.body,body.body);assert.equal(list.items[0].note_count,1);assert.equal(list.items[0].notes,'고객 원문');
  assert.equal((await req('admin/consultations','GET',undefined,staff)).data.items.length,0);
  const second=await req(path+'/notes','POST',{noteId:randomUUID(),body:'다음 요청 메모'},auth);assert.equal(second.status,200);
  const refreshed=(await req('admin/consultations','GET',undefined,auth)).data.items[0];assert.equal(refreshed.note_count,2);assert.equal(refreshed.latest_note.body,'다음 요청 메모');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.integration_jobs')).rows[0].n,0);
 }finally{await pg.close();}
});
