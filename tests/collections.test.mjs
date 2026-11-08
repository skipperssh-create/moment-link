import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {processIntegration} from '../server/jobs.mjs';
const booking={date:'2099-11-21',time:'20:00',amount:440000,receivedAmount:90000,paymentConfirmed:true,scheduleConfirmed:true,place:'합성 장소'};
const communication=(patch={})=>({booking:{...booking,...patch},reservation:{confirmedAt:new Date().toISOString()}});
const payload=(r,amount=350000)=>({version:r.version,requestId:randomUUID(),amount,method:'transfer',methodNote:'',confirmed:true});

test('balance filter is accurate across staff, search, pagination and unknown legacy receipts; local collection is atomic',async()=>{
 const f=await ownershipFixture();try{
  const add=(patch={})=>f.add({status:'confirmed',owner:f.staff['counselor-a'].id,communication:communication(),...patch});
  let r=await add({person:'잔금 고객'}),path='admin/consultations/'+r.id;
  await add({communication:communication({receivedAmount:440000})});await add({communication:communication({receivedAmount:undefined})});await add({communication:communication({receivedAmount:'90000'})});await add({status:'cancelled'});await add({status:'consulting'});await add({owner:f.staff['counselor-b'].id});
  for(let i=0;i<51;i++)await add();
  let out=await f.request('admin/consultations?view=reservations&status=balance_due&owner=mine','counselor-a');assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.items.length,50);assert.equal(out.data.counts.balance_due,52);
  out=await f.request('admin/consultations?view=reservations&status=balance_due&owner=mine&offset=50','counselor-a');assert.equal(out.data.items.length,2);
  out=await f.request('admin/consultations?view=reservations&status=balance_due&q='+encodeURIComponent('잔금 고객'));assert.equal(out.data.items.length,1);assert.equal(out.data.counts.balance_due,1);
  const data=payload(r,100000);
  assert.equal((await f.request(path+'/payments','counselor-b','POST',data)).status,403);
  for(const amount of [0,-1,350001,1.5,'350000'])assert.equal((await f.request(path+'/payments','counselor-a','POST',{...data,amount})).status,400);
  assert.equal((await f.request(path+'/payments','counselor-a','POST',{...data,confirmed:false})).status,400);
  out=await f.request(path+'/payments','counselor-a','POST',data);assert.equal(out.status,200,JSON.stringify(out.data));r=out.data.item;assert.equal(r.communication.booking.receivedAmount,190000);
  out=await f.request(path+'/payments','counselor-a','POST',data);assert.equal(out.data.item.communication.booking.receivedAmount,190000);
  assert.equal((await f.request(path+'/payments','counselor-a','POST',{...data,amount:100001})).status,409);
  out=await f.request(path+'/payments','counselor-a','POST',payload(r,250000));assert.equal(out.data.item.communication.booking.receivedAmount,440000);assert.equal(out.data.item.status,'confirmed');
  assert.equal((await f.request('admin/consultations?view=reservations&status=balance_due&q='+encodeURIComponent('잔금 고객'))).data.items.length,0);
  const logs=(await f.db.query("SELECT detail FROM moment_link.audit_logs WHERE entity_id=$1 AND action='reservation.payment.collected'",[r.id])).rows;assert.equal(logs.length,2);assert.deepEqual(logs.map(x=>x.detail.amount),[100000,250000]);
 }finally{await f.pg.close();}
});

test('linked collection requires a verified OPS receipt, reconciles exactly once and leaves old conflicts unchanged',async()=>{
 const origin='https://test.moment-link.invalid',f=await ownershipFixture(origin),receipts=new Map();let writes=0,lookups=0,lost=false,fail=false,invalid=false;
 const adapter={metadata:async()=>({paymentUpdates:true}),paymentResult:async(ref,id)=>{lookups++;return receipts.get(id)||null;},collectPayment:async d=>{writes++;if(fail)throw Error('synthetic network interruption');const received=d.expected.received+d.amount,receipt={id:d.bookingId,requestId:d.requestId,applied:true,amount:d.expected.amount,collected:d.amount,received,balance:d.expected.amount-received,method:d.method,currentState:'ready',currentDeparture:d.expected.departure,currentAmount:d.expected.amount,currentReceived:received,currentBalance:d.expected.amount-received};if(invalid)receipt.currentReceived--;receipts.set(d.requestId,receipt);if(lost){lost=false;throw Error('synthetic response lost');}return receipt;}};
 const env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}},app=createApp({db:f.db,env,adapters});
 const request=async(path,method='GET',data)=>{const res=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions['owner-admin']},...(data?{body:JSON.stringify(data)}:{})}));return {status:res.status,data:await res.json()};};
 const add=async()=>{const r=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id,communication:communication()}),id=randomUUID();await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,approved_by,booking) VALUES($1,$2,'boatn',$3,$4,'succeeded',$5,$6)",[id,r.id,'moment-link:'+r.id,'synthetic-'+r.id,f.staff['owner-admin'].id,JSON.stringify(booking)]);return {...r,jobId:id};};
 try{
  let r=await add(),path='admin/consultations/'+r.id,data=payload(r,100000);lost=true;
  let out=await request(path+'/payments','POST',data);assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.integration.state,'uncertain');assert.equal(out.data.item.communication.booking.receivedAmount,90000);assert.equal(writes,1);
  out=await request(path+'/payments','POST',data);r=out.data.item;assert.equal(r.communication.booking.receivedAmount,190000);assert.equal(writes,1);
  out=await request(path+'/payments','POST',data);assert.equal(out.data.item.communication.booking.receivedAmount,190000);assert.equal(writes,1);
  out=await request(path+'/payments','POST',payload(r,250000));assert.equal(out.data.item.communication.booking.receivedAmount,440000);assert.equal(out.data.item.integration.state,'succeeded');assert.equal(writes,2);
  r=await add();await f.db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='OPS_RESOURCE_CONFLICT' WHERE id=$1",[r.jobId]);const before=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[r.jobId])).rows[0],calls=[writes,lookups];
  assert.equal((await request('admin/consultations/'+r.id+'/payments','POST',payload(r))).status,409);await processIntegration(f.db,r.jobId,env,adapters);assert.deepEqual([writes,lookups],calls);assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[r.jobId])).rows[0],before);
  r=await add();fail=true;out=await request('admin/consultations/'+r.id+'/payments','POST',payload(r));const first=writes;await processIntegration(f.db,r.jobId,env,adapters);await processIntegration(f.db,r.jobId,env,adapters);assert.equal(writes,first+1);assert.equal((await f.db.query('SELECT attempts FROM moment_link.integration_jobs WHERE id=$1',[r.jobId])).rows[0].attempts,2);
  fail=false;invalid=true;r=await add();out=await request('admin/consultations/'+r.id+'/payments','POST',payload(r));assert.equal(out.data.item.integration.state,'conflict');assert.equal(out.data.item.communication.booking.receivedAmount,90000);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
