import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';

const option={id:'paper-frame-photos',name:'종이액자 사진 출력 4개',amount:10000};
const sql=await readFile(new URL('../db/009_visit_photo_option.sql',import.meta.url),'utf8');
const strip=products=>products.map(p=>p.id==='visit'?{...p,packages:p.packages.map(pk=>({...pk,options:pk.options.filter(o=>o.id!==option.id)}))}:p);

test('photo option migration preserves unpublished edits, historical quotes, bookings and OPS conflicts, and runs once',async()=>{
 const f=await ownershipFixture();try{
  const published=(await f.db.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const old=strip(published.products),draft=structuredClone(old);
  draft[0].short='Unpublished draft kept';draft.find(p=>p.id==='visit').packages[0].weekday=260000;
  await f.db.query('UPDATE moment_link.catalog_versions SET products=$1 WHERE version=$2',[JSON.stringify(old),published.version]);
  await f.db.query("UPDATE moment_link.config SET data=$1,version=22 WHERE id='catalog_draft'",[JSON.stringify(draft)]);
  await f.db.query('DELETE FROM moment_link.migrations WHERE version=9');
  const row=await f.add({owner:f.staff['owner-admin'].id,status:'consulting'}),jobId=randomUUID();
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',2,'OPS_RESOURCE_CONFLICT',$4,'{}')",[jobId,row.id,'moment-link:'+row.id,f.staff['owner-admin'].id]);
  const jobs=(await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows;
  await f.pg.exec(sql);
  const after=(await f.db.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const afterDraft=(await f.db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0];
  assert.equal(after.version,published.version+1);assert.equal(afterDraft.version,23);
  assert.deepEqual(strip(after.products),old);assert.deepEqual(strip(afterDraft.data),draft);
  for(const products of [after.products,afterDraft.data])for(const pk of products.find(p=>p.id==='visit').packages)assert.deepEqual(pk.options.filter(o=>o.id===option.id),[option]);
  assert.deepEqual((await f.db.query('SELECT products FROM moment_link.catalog_versions WHERE version=$1',[published.version])).rows[0].products,old);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[row.id])).rows[0],row);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows,jobs);
  // Future admin changes must not be overwritten by a repeated migration.
  afterDraft.data.find(p=>p.id==='visit').packages[0].options.find(o=>o.id===option.id).amount=12000;
  await f.db.query("UPDATE moment_link.config SET data=$1 WHERE id='catalog_draft'",[JSON.stringify(afterDraft.data)]);
  await f.pg.exec(sql);
  assert.deepEqual((await f.db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0],afterDraft);
  assert.equal((await f.db.query('SELECT max(version) v FROM moment_link.catalog_versions')).rows[0].v,after.version);
 }finally{await f.pg.close();}
});

test('visit light and all photo selections add exactly 10,000 won in direct bookings, consultation revisions and messages',async()=>{
 const f=await ownershipFixture();try{
  await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
  const c=(await f.request('catalog')).data,visit=c.products.find(p=>p.id==='visit');
  for(const p of c.products.filter(p=>p.category!=='visit'))for(const pk of p.packages)assert.ok(!pk.options?.some(o=>o.id===option.id));
  for(const pk of visit.packages){
   assert.deepEqual(pk.options.find(o=>o.id===option.id),option);
   const amount=pk.weekday+10000,booking={date:'2027-11-16',time:'17:00',amount,baseAmount:amount,amountMode:'auto',receivedAmount:null,useDeposit:false,place:'합성 검수 장소',extra:'',scheduleConfirmed:false,paymentConfirmed:false};
   const selection={catalogVersion:c.version,productId:visit.id,packageId:pk.id,optionIds:[option.id]};
   const direct=await f.request('admin/reservations','owner-admin','POST',{...selection,requestId:randomUUID(),person:'사진 옵션 합성 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:f.staff['owner-admin'].id,mode:'draft',booking});
   assert.equal(direct.status,201,JSON.stringify(direct.data));assert.equal(direct.data.item.snapshot.price.optionAmount,10000);assert.equal(direct.data.item.communication.booking.amount,pk.id==='light'?259000:358000);
   const message=MomentLinkMessages.generate(direct.data.item,'receipt',booking);assert.match(message,/추가 선택: 종이액자 사진 출력 4개/);assert.ok(message.includes('총 예약금액: '+amount.toLocaleString('ko-KR')+'원'));
   const row=await f.add({owner:f.staff['owner-admin'].id,status:'consulting'}),path='admin/consultations/'+row.id+'/product';
   let out=await f.request(path,'owner-admin','POST',{version:row.version,selection,booking});
   assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.booking.amount,amount);assert.deepEqual(out.data.item.snapshot.options,[option]);
   out=await f.request(path,'owner-admin','POST',{version:out.data.item.version,selection:{...selection,optionIds:[]},booking:{...booking,amount:pk.weekday,baseAmount:pk.weekday}});
   assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.booking.amount,pk.weekday);assert.doesNotMatch(out.data.item.communication.drafts.receipt,/종이액자/);
  }
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.integration_jobs')).rows[0].n,0);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
