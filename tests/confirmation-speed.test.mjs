import {prepareRegisteredBoarding} from '../server/boarding-pass.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';

test('confirmation returns before slow OPS work; observation is read-only and ready boarding is prepared once',async()=>{
 const f=await ownershipFixture(),work=[];
 let release;const gate=new Promise(resolve=>{release=resolve;});
 try{
  const b={date:'2099-11-21',time:'18:00',amount:398000,baseAmount:368000,receivedAmount:90000,amountMode:'manual',place:'합성 검수 장소',extra:'',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',addOns:[{id:'bouquet',quantity:1,unitAmount:30000}]};
  const r=await f.add({status:'consulting',owner:f.staff['owner-admin'].id});
  await f.db.query("UPDATE moment_link.consultations SET category='yacht',product_id='classic' WHERE id=$1",[r.id]);
  const conflict=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id});
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',2,'OPS_RESOURCE_CONFLICT',$4,$5)",[randomUUID(),conflict.id,'moment-link:'+conflict.id,f.staff['owner-admin'].id,JSON.stringify({date:b.date,time:b.time})]);
  const snapshot=async()=>JSON.stringify((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[conflict.id])).rows);
  const before=await snapshot();let lookups=0,metadata=0,creates=0,boardings=0;
  const origin='https://test.moment-link.invalid';
  const app=createApp({db:f.db,env:{APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},schedule:promise=>work.push(promise),adapters:{ops:{boatn:{
   safeRetry:true,lookup:async()=>{lookups++;await gate;return null;},
   metadata:async()=>{metadata++;return {partialPayments:true,addOnPurchases:true};},
   availability:async()=>({available:true,token:'synthetic-availability'}),
   create:async()=>{creates++;return {id:'synthetic-fast-boarding'};},
   boardingPass:async()=>{boardings++;return {id:'synthetic-fast-boarding',url:'https://boarding.boatn.co.kr/boarding/synthetic-fast',context:'a'.repeat(64),recipient:r.phone,departure:'2099-11-21T09:00:00Z',pax:2};}
  }}}});
  const call=async(path,method='GET',data)=>{const res=await app(new Request(origin+'/api/admin/consultations/'+r.id+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions['owner-admin']},...(data?{body:JSON.stringify(data)}:{})}));return {status:res.status,data:await res.json()};};
  const start=performance.now();let timer;
  const result=await Promise.race([call('/reservation','POST',{version:r.version,approved:true,booking:b,drafts:{confirmed:'합성 예약 확정 문자'}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('confirmation blocked by OPS')),1500);})]).finally(()=>clearTimeout(timer));
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.item.status,'confirmed');assert.equal(creates,0);
  const elapsed=Math.round(performance.now()-start);
  const observed=await call('?observe=1');assert.equal(observed.status,200);assert.equal(lookups,1);assert.equal(creates,0);
  release();await Promise.all(work);
  const ready=await call('?observe=1');assert.equal(ready.data.item.integration.state,'succeeded');
  assert.equal(metadata,1,'partial payment and extras share one metadata request');assert.equal(creates,1);
  const prepared=await call('/communications','PUT',{version:ready.data.item.version,booking:b,drafts:ready.data.item.communication.drafts,prepareStage:'confirmed'});
  assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(boardings,1);
  assert.match(prepared.data.item.communication.drafts.confirmed,/boarding\/synthetic-fast/);
  assert.equal(await snapshot(),before);assert.equal(creates,1);
  console.log(JSON.stringify({isolatedConfirmationMs:elapsed,metadataRequests:metadata,createdBookings:creates,existingConflictUnchanged:true}));
 }finally{release();await Promise.allSettled(work);await f.pg.close();}
});

test('lightweight integration observation avoids locks, history, dispatch and private data',async()=>{
 const f=await ownershipFixture(),origin='https://test.moment-link.invalid',queries=[];
 try{
  const r=await f.add({owner:f.staff['counselor-a'].id,status:'confirmed'});
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',1,'OPS_RESOURCE_CONFLICT',$4,'{}')",[randomUUID(),r.id,'moment-link:'+r.id,f.staff['counselor-a'].id]);
  const spy={query:(sql,args)=>{queries.push(sql);return f.db.query(sql,args);},transaction:()=>{throw Error('observation must not lock or mutate');}};
  const app=createApp({db:spy,env:{APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},schedule:()=>{throw Error('observation must not schedule');}});
  const observe=async who=>{const response=await app(new Request(origin+'/api/admin/consultations/'+r.id+'?observe=integration',{headers:{Origin:origin,...(f.sessions[who]||{})}}));return {status:response.status,data:await response.json()};};
  const result=await observe('counselor-a');
  assert.equal(result.status,200);assert.equal(result.data.item.integration.state,'conflict');assert.equal(result.data.item.integration.attempts,1);
  assert.deepEqual(Object.keys(result.data.item).sort(),['id','integration','status','version']);
  assert.equal(queries.filter(sql=>sql.includes('FROM moment_link.consultations')).length,1);
  assert(!queries.some(sql=>/FOR UPDATE|consultation_notes|audit_logs|event_calendar_jobs|seollem_booking_jobs/.test(sql)));
  assert.equal((await observe('counselor-b')).status,404);assert.equal((await observe('')).status,401);
  await f.db.query('UPDATE moment_link.consultations SET deleted_at=now() WHERE id=$1',[r.id]);
  assert.equal((await observe('counselor-a')).status,404);
 }finally{await f.pg.close();}
});

for(const direct of [false,true])test((direct?'first direct: ':'negotiated: ')+'atomic registration prepares boarding in the completion transaction without another OPS read or SMS write',async()=>{
 const f=await ownershipFixture(),work=[];let release;const gate=new Promise(resolve=>{release=resolve;});
 try{
  const b={date:'2099-11-21',time:'18:00',amount:398000,baseAmount:368000,receivedAmount:90000,amountMode:'manual',place:'합성 검수 장소',extra:'',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer',addOns:[{id:'bouquet',quantity:1,unitAmount:30000}]};
  const r=await f.add({status:'consulting',owner:f.staff['owner-admin'].id});
  await f.db.query("UPDATE moment_link.consultations SET category='yacht',product_id='classic',package_id='all' WHERE id=$1",[r.id]);
  const info={id:'synthetic-inline',url:'https://boarding.boatn.co.kr/boarding/synthetic-inline',context:'b'.repeat(64),recipient:r.phone,departure:'2099-11-21T09:00:00Z',pax:2};
  let creates=0,lookups=0;const origin='https://test.moment-link.invalid';
  const app=createApp({db:f.db,env:{APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},schedule:p=>work.push(p),adapters:{ops:{boatn:{safeRetry:true,directRegistration:direct,supportsAtomicRegistration:()=>true,lookup:async()=>{assert.equal(direct,false);await gate;return null;},metadata:async()=>{throw Error('atomic registration must not perform a redundant metadata request');},register:async()=>{if(direct)await gate;creates++;return {id:info.id,boarding:info};},boardingPass:async()=>{lookups++;return info;}}}}});
  const call=async(path,method='GET',data)=>{const res=await app(new Request(origin+'/api/admin/consultations/'+r.id+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions['owner-admin']},...(data?{body:JSON.stringify(data)}:{})}));return {status:res.status,data:await res.json()};};
  const saved=await call('/reservation','POST',{version:r.version,approved:true,booking:b,drafts:{confirmed:'직접 작성한 합성 확정 안내'}});assert.equal(saved.status,200,JSON.stringify(saved.data));
  release();await Promise.all(work);
  const observed=await call('?observe=integration');assert.equal(observed.status,200,JSON.stringify(observed.data));
  const item=observed.data.item;assert.equal(item.integration.state,'succeeded');assert.equal(item.version,saved.data.item.version+1);
  assert.equal(item.preparedMessage.baseVersion,saved.data.item.version);assert.equal(item.preparedMessage.jobId,item.integration.id);
  assert.match(item.preparedMessage.body,/직접 작성한 합성 확정 안내/);assert.match(item.preparedMessage.body,/boarding\/synthetic-inline/);
  assert.equal(creates,1);assert.equal(lookups,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
  const current=(await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[r.id])).rows[0];assert.equal(current.communication.events?.length||0,0);
  // A later edit invalidates the one-version automatic handoff.
  await f.db.query('UPDATE moment_link.consultations SET version=version+1 WHERE id=$1',[r.id]);
  assert.equal((await call('?observe=integration')).data.item.preparedMessage,undefined);
 }finally{release();await Promise.allSettled(work);await f.pg.close();}
});

test('combined response rejects mismatched boarding data without creating send records',()=>{
 const row={status:'confirmed',version:7,category:'yacht',product_id:'classic',package_id:'all',phone:'01000000000',communication:{booking:{date:'2099-11-21',time:'18:00',opsPax:2},drafts:{confirmed:'직접 쓴 안내'},events:[]}};
 const job={id:'job',target:'boatn',external_id:'ops',booking:{pax:2}};
 const info={id:'ops',recipient:row.phone,departure:'2099-11-21T09:00:00Z',pax:2,context:'b'.repeat(64),url:'https://boarding.boatn.co.kr/boarding/synthetic'};
 for(const patch of [{id:'other'},{recipient:'01099999999'},{pax:3},{departure:'2099-11-22T09:00:00Z'},{url:'https://invalid.example/boarding/synthetic'}])assert.throws(()=>prepareRegisteredBoarding(row,job,{...info,...patch}),e=>e.code==='BOARDING_MISMATCH');
 assert.equal(prepareRegisteredBoarding({...row,status:'cancelled'},job,info),null);
 assert.equal(prepareRegisteredBoarding(row,{...job,target:'seollem'},info),null);
 const prepared=prepareRegisteredBoarding(row,job,info);assert.equal(prepared.events.length,0);assert.equal(prepared.boardingPreparation.baseVersion,7);assert.equal(row.communication.drafts.confirmed,'직접 쓴 안내');
});

test('calendar preview is owned, new-yacht-only and cannot write reservations or retry existing jobs',async()=>{
 const f=await ownershipFixture(),origin='https://test.moment-link.invalid';let reads=0;
 try{
 const r=await f.add({owner:f.staff['counselor-a'].id,status:'consulting'});
 await f.db.query("UPDATE moment_link.consultations SET category='yacht',product_id='classic',package_id='all' WHERE id=$1",[r.id]);
 const before=JSON.stringify((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[r.id])).rows);
 const app=createApp({db:f.db,env:{APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},schedule:()=>{throw Error('no jobs');},adapters:{ops:{boatn:{calendarPreview:async date=>{reads++;return {date,ready:true};}}}}});
 const call=async(who,date='2099-11-21')=>{const res=await app(new Request(origin+'/api/admin/consultations/'+r.id+'?observe=calendar-preview&date='+date,{headers:{Origin:origin,...(f.sessions[who]||{})}}));return {status:res.status,data:await res.json()};};
 assert.equal((await call('counselor-b')).status,404);assert.equal((await call('')).status,401);
 assert.equal((await call('counselor-a','invalid')).status,400);assert.equal(reads,0);
 assert.equal((await call('counselor-a')).data.ready,true);assert.equal(reads,1);
 assert.equal(JSON.stringify((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[r.id])).rows),before);
 await f.db.query("UPDATE moment_link.consultations SET category='visit' WHERE id=$1",[r.id]);assert.equal((await call('counselor-a')).data.ready,false);assert.equal(reads,1);
 await f.db.query("UPDATE moment_link.consultations SET category='yacht' WHERE id=$1",[r.id]);
 await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',2,'OPS_RESOURCE_CONFLICT',$4,'{}')",[randomUUID(),r.id,'moment-link:'+r.id,f.staff['counselor-a'].id]);
 assert.equal((await call('counselor-a')).status,404);assert.equal(reads,1);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
