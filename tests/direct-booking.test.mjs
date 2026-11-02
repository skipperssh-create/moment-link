import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {initialSettings} from '../server/seed.mjs';

test('admin direct bookings use existing reservations, snapshots, messaging and permission boundaries',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://direct.test.invalid';
 try{
  await migrate(db);const secret=randomUUID(),adminId=randomUUID(),staffId=randomUUID(),inactiveId=randomUUID();
  for(const [id,username,role,active] of [[adminId,'direct-admin','admin',true],[staffId,'direct-staff','counselor',true],[inactiveId,'direct-inactive','counselor',false]])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,active,must_change_password) VALUES($1,$2,$3,$4,$5,false)',[id,username,await passwordHash(secret),role,active]);
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...initialSettings,retentionDays:30,solapi:true,customerAuto:true,adminAuto:true,push:true})]);
  const app=createApp({db,env:{APP_ORIGIN:origin,SMS_LIVE_ENABLED:'true',PUSH_LIVE_ENABLED:'true',OPS_WRITES_ENABLED:'true'}});
  const req=async(path,method='GET',data,auth={})=>{const r=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=async username=>{const r=await req('auth/login','POST',{username,password:secret});return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf};};
  const auth=await login('direct-admin'),staff=await login('direct-staff'),catalog=(await req('catalog')).data;
  const payload=(category='visit',patch={})=>{const p=catalog.products.find(p=>p.category===category&&!p.salePaused),pk=p.packages[0],date='2027-12-24',amount=MomentLinkPricing.quote({category,snapshot:{package:pk,price:{weekday:pk.weekday,weekend:pk.weekend}}},date).amount;return {requestId:randomUUID(),catalogVersion:catalog.version,productId:p.id,packageId:pk.id,optionIds:[],person:'합성 직접 예약',phone:'010-0000-0000',notes:'SYNTHETIC ONLY',assignee:adminId,mode:'pending',booking:{date,time:'14:00',amount,amountMode:'auto',place:'합성 검수 장소',scheduleConfirmed:false,paymentConfirmed:false,extra:''},...patch};};
  const create=data=>req('admin/reservations','POST',data,auth),data=payload();
  assert.equal((await req('admin/reservations','POST',data)).status,401);
  assert.equal((await req('admin/reservations','POST',data,staff)).status,403);
  assert.equal((await req('admin/reservations','POST',data,{...auth,'X-CSRF-Token':'wrong'})).status,403);
  for(const patch of [{catalogVersion:999},{productId:'missing'},{packageId:'missing'},{optionIds:['missing']},{optionIds:['same','same']},{phone:'bad'},{person:''},{assignee:inactiveId},{category:'visit'},{booking:{...data.booking,date:'2000-01-01'}},{booking:{...data.booking,time:''}},{booking:{...data.booking,place:''}},{booking:{...data.booking,amount:data.booking.amount+1}},{mode:'confirmed'}]){
   const out=await create({...data,...patch});assert.ok([400,409].includes(out.status),JSON.stringify({patch,out:out.data}));
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.consultations')).rows[0].n,0);
  let out=await create(data);assert.equal(out.status,201,JSON.stringify(out.data));let r=out.data.item;
  assert.equal(r.status,'consulting');assert.equal(r.phone,'01000000000');assert.equal(r.communication.entry.source,'admin_direct');assert.equal(r.assignee,adminId);assert.equal(r.contacted,true);assert.ok(r.read_at);
  assert.equal(r.consent.source,'admin_direct');assert.equal(r.consent.acceptedAt,undefined);assert.equal(r.consent.retentionDays,30);assert.equal(r.idempotency_hash,undefined);assert.equal(r.payload_hash,undefined);
  assert.ok(Math.abs(new Date(r.expires_at)-new Date(r.created_at)-30*86400000)<2000);
  out=await create(data);assert.equal(out.status,200);assert.equal(out.data.item.id,r.id);assert.equal(out.data.replayed,true);
  assert.equal((await create({...data,notes:'changed'})).status,409);
  assert.equal((await req('admin/consultations/'+r.id,'GET',undefined,staff)).status,404);
  const update=(await req('admin/consultations/updates?since='+encodeURIComponent('2020-01-01T00:00:00.000Z'),'GET',undefined,auth)).data;
  assert.equal(update.arrivals,0);assert.equal(update.pending,0);
  const originalSnapshot=r.snapshot;
  out=await req('admin/consultations/'+r.id+'/reservation','POST',{version:r.version,booking:{...data.booking,scheduleConfirmed:true,paymentConfirmed:true},drafts:{},approved:true},auth);assert.equal(out.status,200,JSON.stringify(out.data));r=out.data.item;
  assert.equal(r.status,'confirmed');assert.deepEqual(r.snapshot,originalSnapshot);assert.equal(r.communication.reservation.source,'manual');assert.equal(r.communication.entry.source,'admin_direct');
  const confirmed=payload('yacht',{mode:'confirmed',assignee:staffId});confirmed.booking.scheduleConfirmed=true;confirmed.booking.paymentConfirmed=true;
  out=await create(confirmed);assert.equal(out.status,201,JSON.stringify(out.data));const yacht=out.data.item;
  assert.equal(yacht.snapshot.price.weekend,yacht.communication.booking.amount);
  assert.equal((await req('admin/consultations?view=reservations','GET',undefined,staff)).data.items[0].id,yacht.id);
  for(const stage of ['receipt','confirmed','reminder','thanks']){const msg=MomentLinkMessages.generate(yacht,stage,yacht.communication.booking);assert.ok(msg.includes('합성 직접 예약'));assert.ok(msg.includes('합성 검수 장소')||stage==='thanks');}
  // Option prerequisites and the two additions are charged once, on top of the package.
  const visit=payload(),pk=catalog.products.find(p=>p.id===visit.productId).packages.find(p=>p.id===visit.packageId),usb=pk.options.find(o=>o.requiresOptionId);
  assert.ok(usb);assert.equal((await create({...visit,optionIds:[usb.id]})).status,400);
  visit.optionIds=[usb.requiresOptionId,usb.id];visit.booking.amount+=pk.options.filter(o=>visit.optionIds.includes(o.id)).reduce((n,o)=>n+o.amount,0);
  out=await create(visit);assert.equal(out.status,201,JSON.stringify(out.data));assert.equal(out.data.item.snapshot.price.optionAmount,40000);
  for(const category of ['trunk','heli']){const d=payload(category);if(d.booking.amount===null){d.booking.amountMode='manual';d.booking.amount=990000;}out=await create(d);assert.equal(out.status,201,JSON.stringify(out.data));assert.equal(out.data.item.category,category);}
  const manual=payload();manual.booking.amountMode='manual';manual.booking.amount=123000;assert.equal((await create(manual)).status,201);
  for(const table of ['outbox','integration_jobs'])assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.'+table)).rows[0].n,0);
  assert.ok((await db.query("SELECT count(*)::int AS n FROM moment_link.audit_logs WHERE action='reservation.direct_created'")).rows[0].n>=5);
  await db.query('UPDATE moment_link.consultations SET expires_at=now() WHERE id=$1',[r.id]);assert.equal((await create(data)).status,409);
  await db.query("UPDATE moment_link.consultations SET deleted_at=now(),delete_after=now()+interval '7 days' WHERE id=$1",[yacht.id]);assert.equal((await create(confirmed)).status,409);
  // Publication changes reject a stale form and hidden/paused products cannot be registered.
  const changed=structuredClone(catalog.products);changed.find(p=>p.id===data.productId).salePaused=true;
  await db.query('INSERT INTO moment_link.catalog_versions(version,products) VALUES(2,$1)',[JSON.stringify(changed)]);
  assert.equal((await create(payload())).status,409);assert.equal((await create(payload('visit',{catalogVersion:2}))).status,400);
 }finally{await pg.close();}
});
