import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Fixtures seed pricing as a side effect. Start from the production entry in a
// fresh process so that seed/test import order cannot hide a cold-start failure.
test('cold production entry reconciles an already-applied yacht refund without replay',()=>{
 const code=`
  import assert from 'node:assert/strict';
  import {randomUUID} from 'node:crypto';
  await import('./api/index.mjs');
  const {ownershipFixture}=await import('./tests/ownership-fixture.mjs');
  const {processIntegration}=await import('./server/jobs.mjs');
  const f=await ownershipFixture();
  try{
   const before={date:'2099-10-18',time:'11:00',amount:398000,receivedAmount:398000,baseAmount:368000,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}],amountMode:'manual',scheduleConfirmed:true,paymentConfirmed:true,place:'한국해양대학교 합성 검수 장소',extra:''};
   const r=await f.add({status:'confirmed',communication:{booking:before,reservation:{confirmedAt:'2099-01-01T00:00:00Z'}}});
   const snapshot={product:{id:'classic',name:'합성 요트'},package:{id:'light',name:'라이트',weekday:368000,weekend:368000},price:{weekday:368000,weekend:368000},options:[]};
   await f.db.query("UPDATE moment_link.consultations SET category='yacht',snapshot=$1 WHERE id=$2",[JSON.stringify(snapshot),r.id]);
   const next={...before,amount:368000,receivedAmount:368000,addOns:[],refundedAmount:30000,excludedServices:['bouquet'],adjustmentNote:'합성 꽃다발 취소 · 환불 완료 30,000원'};
   const jobId=randomUUID(),changeId=randomUUID(),externalId='synthetic-boatn-'+r.id,departure='2099-10-18T02:00:00.000Z';
   const adjustment={requestId:changeId,target:'bouquet',reduction:30000,refund:30000,reason:'합성 검수',label:'꽃다발 모두 제외',at:'2099-01-01T00:00:00Z',actor:'합성 검수'};
   const booking={...before,operation:'adjustment',changeId,expected:{departure,amount:398000,received:398000,addOns:before.addOns},nextBooking:next,adjustment};
   await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,attempts,approved_by,booking) VALUES($1,$2,'boatn',$3,$4,'uncertain',2,$5,$6)",[jobId,r.id,'moment-link:'+r.id,externalId,f.staff['owner-admin'].id,JSON.stringify(booking)]);
   let reads=0,writes=0;
   const adapters={ops:{boatn:{adjustmentResult:async()=>{reads++;return {id:externalId,requestId:changeId,applied:true,amount:368000,received:368000,refund:30000,balance:0,currentState:'ready',currentDeparture:departure,currentAmount:368000,currentReceived:368000};},adjustBooking:async()=>{writes++;throw Error('must not replay refund');}}}};
   const result=await processIntegration(f.db,jobId,{OPS_WRITES_ENABLED:'true'},adapters);
   assert.equal(result.state,'succeeded');
   const saved=(await f.db.query('SELECT communication FROM moment_link.consultations WHERE id=$1',[r.id])).rows[0].communication;
   assert.equal(saved.booking.amount,368000);assert.equal(saved.booking.receivedAmount,368000);assert.equal(saved.opsPayment.balance,0);
   assert.equal(saved.adjustments.length,1);assert.match(saved.drafts.confirmed,/368,000원/);
   assert.equal((await f.db.query('SELECT attempts FROM moment_link.integration_jobs WHERE id=$1',[jobId])).rows[0].attempts,2);
   await processIntegration(f.db,jobId,{OPS_WRITES_ENABLED:'true'},adapters);
   assert.equal(reads,1);assert.equal(writes,0);
  }finally{await f.pg.close();}
 `;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:45000});
 assert.equal(child.status,0,child.stderr||child.stdout||String(child.error));
});
