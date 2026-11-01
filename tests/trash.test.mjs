import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {purgeExpired} from '../server/retention.mjs';
import {processIntegration,processOutbox} from '../server/jobs.mjs';
import {normalizeVisitVideo} from '../scripts/migrate-visit-video.mjs';
import catalog from '../catalog.confirmed.json' with {type:'json'};

test('status menus and trash enforce permissions, versions, recovery, deadlines and complete erasure',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://test.moment-link.invalid';
 try{
  await migrate(db);const adminId=randomUUID(),staffId=randomUUID(),password=randomUUID();
  for(const [id,name,role] of [[adminId,'trash-admin','admin'],[staffId,'trash-staff','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,name,await passwordHash(password),role]);
  const app=createApp({db,env:{APP_ORIGIN:origin}});
  const req=async(path,method='GET',data,auth={})=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=async username=>{const r=await req('auth/login','POST',{username,password});return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf};};
  const auth=await login('trash-admin'),staff=await login('trash-staff');
  const add=async(status='new',days=30)=>{const id=randomUUID();await db.query(`INSERT INTO moment_link.consultations(id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,status,assignee,expires_at) VALUES($1::uuid,$2,$1::text,$1::text,'합성 검수','01000000000','visit','visit','light',$3,$4,'합성 장소','SYNTHETIC ONLY','{}',$5,$6,now()+make_interval(days=>$7))`,[id,'ML-'+id,JSON.stringify({product:catalog.find(p=>p.id==='visit'),package:catalog.find(p=>p.id==='visit').packages[0],price:{weekday:249000,weekend:249000}}),JSON.stringify([{date:'2099-11-21',time:'오후'}]),status,staffId,days]);return (await db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[id])).rows[0];};
  const records=[];for(const status of ['new','consulting','hold','confirmed','closed','cancelled'])records.push(await add(status));
  for(const r of records){const list=await req('admin/consultations?status='+r.status,'GET',undefined,auth);assert.equal(list.status,200);assert.deepEqual(list.data.items.map(x=>x.id),[r.id]);assert.equal(list.data.counts.all,6);assert.equal(list.data.counts[r.status],1);}
  assert.equal((await req('admin/consultations?q=not-found','GET',undefined,auth)).data.counts.all,0);
  const r=records[0],base='admin/consultations/'+r.id;
  assert.equal((await req(base,'DELETE',{version:1})).status,401);
  assert.equal((await req(base,'DELETE',{version:1},staff)).status,403);
  assert.equal((await req(base,'DELETE',{version:1},{...auth,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await req(base,'DELETE',{version:0},auth)).status,400);
  assert.equal((await req(base,'DELETE',{version:99},auth)).status,409);
  assert.equal((await req(base+'/permanent','DELETE',{version:1,approved:true},auth)).status,409);
  const notification=randomUUID(),integration=randomUUID();
  await db.query("INSERT INTO moment_link.outbox(id,consultation_id,event_key,channel) VALUES($1::uuid,$2,$1::text,'sms_customer')",[notification,r.id]);
  await db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking) VALUES($1::uuid,$2,'seollem',$1::text,$3,'{}')",[integration,r.id,adminId]);
  let out=await req(base,'DELETE',{version:1},auth);assert.equal(out.status,200,JSON.stringify(out.data));let item=out.data.item;
  assert.ok(Math.abs(Date.parse(item.delete_after)-Date.parse(item.deleted_at)-7*86400000)<1000);
  assert.equal(item.expires_at,r.expires_at.toISOString());assert.equal(item.status,'new');assert.deepEqual(item.snapshot,r.snapshot);
  for(const table of ['outbox','integration_jobs'])assert.equal((await db.query('SELECT state FROM moment_link.'+table+' WHERE consultation_id=$1',[r.id])).rows[0].state,'blocked');
  const calls=[];const adapters={ops:{seollem:{lookup:()=>{calls.push('lookup');}}},solapi:()=>{calls.push('sms');}};
  assert.equal((await processIntegration(db,integration,{OPS_WRITES_ENABLED:'true'},adapters)).state,'blocked');
  assert.equal((await processOutbox(db,notification,{SMS_LIVE_ENABLED:'true'},adapters)).state,'blocked');assert.deepEqual(calls,[]);
  assert.equal((await req('admin/consultations?status=new','GET',undefined,auth)).data.items.length,0);
  for(const [suffix,method,data] of [['','GET'],['','PATCH',{version:2,status:'hold'}],['/notes','POST',{body:'hidden'}],['/communications','PUT',{}],['/reservation','POST',{}]])assert.equal((await req(base+suffix,method,data,auth)).status,404);
  assert.equal((await req('admin/consultations?view=trash','GET',undefined,staff)).status,403);
  assert.equal((await req('admin/consultations?view=trash','GET',undefined,auth)).data.items[0].id,r.id);
  assert.equal((await req(base+'/restore','POST',{version:1},auth)).status,409);
  out=await req(base+'/restore','POST',{version:2},auth);assert.equal(out.status,200);item=out.data.item;assert.equal(item.deleted_at,null);assert.equal(item.status,r.status);assert.deepEqual(item.snapshot,r.snapshot);assert.equal(item.expires_at,r.expires_at.toISOString());
  assert.equal((await db.query('SELECT state FROM moment_link.integration_jobs WHERE id=$1',[integration])).rows[0].state,'blocked');
  await db.query("UPDATE moment_link.integration_jobs SET state='uncertain' WHERE id=$1",[integration]);
  assert.equal((await req(base,'DELETE',{version:3},auth)).status,409);
  await db.query("UPDATE moment_link.integration_jobs SET state='blocked' WHERE id=$1",[integration]);
  await db.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),r.id,adminId,'합성 메모']);
  out=await req(base,'DELETE',{version:3},auth);assert.equal(out.status,200);
  assert.equal((await req(base+'/permanent','DELETE',{version:4,approved:false},auth)).status,400);
  assert.equal((await req(base+'/permanent','DELETE',{version:4,approved:true},auth)).status,200);
  for(const table of ['consultation_notes','outbox','integration_jobs'])assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.'+table+' WHERE consultation_id=$1',[r.id])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.audit_logs WHERE entity_id=$1',[r.id])).rows[0].n,0);
  // An earlier privacy deadline always wins; restore never extends either deadline.
  const short=await add('hold',1);out=await req('admin/consultations/'+short.id,'DELETE',{version:1},auth);assert.equal(out.data.item.delete_after,short.expires_at.toISOString());
  await db.query("UPDATE moment_link.consultations SET delete_after=now()-interval '1 minute' WHERE id=$1",[short.id]);
  assert.equal((await req('admin/consultations/'+short.id+'/restore','POST',{version:2},auth)).status,404);
  assert.equal((await purgeExpired(db)).deleted,1);assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.consultations WHERE id=$1',[short.id])).rows[0].n,0);
  // Empty all pages, but keep a deletion that happened after the reviewed list.
  for(let i=0;i<52;i++){const x=await add();await db.query("UPDATE moment_link.consultations SET deleted_at=now()-interval '1 hour',delete_after=now()+interval '7 days' WHERE id=$1",[x.id]);}
  const list=(await req('admin/consultations?view=trash','GET',undefined,auth)).data;assert.equal(list.items.length,50);assert.equal(list.counts.all,52);
  const newer=await add();await db.query("UPDATE moment_link.consultations SET deleted_at=$2::timestamptz+interval '1 second',delete_after=now()+interval '7 days' WHERE id=$1",[newer.id,list.trashBefore]);
  const empty={before:list.trashBefore,approved:true};assert.equal((await req('admin/trash/empty','POST',empty,staff)).status,403);
  out=await req('admin/trash/empty','POST',empty,auth);assert.equal(out.status,200);assert.equal(out.data.deleted,52);
  assert.equal((await req('admin/consultations?view=trash','GET',undefined,auth)).data.items[0].id,newer.id);
  assert.equal((await req('admin/consultations','GET',undefined,auth)).data.items.length,5);
 }finally{await pg.close();}
});

test('visit option migration isolates published and draft changes and preserves previous catalog versions',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)};
 try{
  await migrate(db);const previous=structuredClone(catalog),visit=previous.find(p=>p.id==='visit');visit.photo='https://example.com/saved.jpg';
  visit.packages[0].options=[{id:'bouquet',name:'기본 꽃다발 추가',amount:30000},{id:'video-letter',name:'영상편지',amount:30000,group:'영상편지'},{id:'video-letter-usb',name:'영상편지 USB 제작',amount:40000,group:'영상편지'}];
  visit.packages[1].note='영상편지 USB 희망 시 10,000원 추가. 기존 운영 안내';
  visit.packages[1].options=[{id:'video-usb',name:'영상편지 USB 제작',amount:10000},{id:'bouquet',name:'기본 꽃다발 추가',amount:30000}];
  const normalized=normalizeVisitVideo(previous).find(p=>p.id==='visit');
  assert.deepEqual(normalized.packages[1].options,[{id:'bouquet',name:'기본 꽃다발 추가',amount:30000},{id:'usb',name:'소장용 USB',amount:10000}]);
  assert.deepEqual(normalized.packages[0].options.map(o=>[o.id,o.amount]),[['bouquet',30000],['video-letter',30000],['usb',10000]]);
  const draft=structuredClone(previous);draft[0].short='미게시 수정';draft.find(p=>p.id==='visit').packages[0].weekday=260000;
  await db.query('DELETE FROM moment_link.migrations WHERE version=7');await db.query('UPDATE moment_link.catalog_versions SET products=$1 WHERE version=1',[JSON.stringify(previous)]);
  await db.query("UPDATE moment_link.config SET data=$1,version=9 WHERE id='catalog_draft'",[JSON.stringify(draft)]);
  await migrate(db);const versions=(await db.query('SELECT products FROM moment_link.catalog_versions ORDER BY version')).rows;
  assert.equal(versions.length,2);assert.deepEqual(versions[0].products,previous);assert.deepEqual(versions[1].products,normalizeVisitVideo(previous));
  const current=(await db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0];assert.deepEqual(current,{version:10,data:normalizeVisitVideo(draft)});
  current.data.find(p=>p.id==='visit').short='향후 관리자 수정';await db.query("UPDATE moment_link.config SET data=$1 WHERE id='catalog_draft'",[JSON.stringify(current.data)]);
  await migrate(db);assert.deepEqual((await db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0],current);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.catalog_versions')).rows[0].n,2);
 }finally{await pg.close();}
});
