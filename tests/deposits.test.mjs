import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {processIntegration} from '../server/jobs.mjs';
import '../messages.js';
const M=globalThis.MomentLinkMessages;
const booking={date:'2099-11-21',time:'20:00',amount:440000,receivedAmount:90000,baseAmount:440000,addOns:[],amountMode:'manual',place:'합성 검수 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''};

test('deposit confirmation saves 90,000 received and 350,000 outstanding without requiring full payment',async()=>{
 const f=await ownershipFixture();
 try{
  let row=await f.add({owner:f.staff['owner-admin'].id,status:'awaiting_payment'}),path='admin/consultations/'+row.id;
  for(const receivedAmount of [null,0,-1,90000.5,440001])assert.equal((await f.request(path+'/reservation','owner-admin','POST',{version:row.version,booking:{...booking,receivedAmount},drafts:{},approved:true})).status,400);
  assert.equal((await f.request(path+'/reservation','owner-admin','POST',{version:row.version,booking:{...booking,paymentConfirmed:false},drafts:{},approved:true})).status,400);
  const confirmation={booking,drafts:{confirmed:M.generate(row,'confirmed',booking)},approved:true};
  let out=await f.request(path,'owner-admin','PATCH',{version:row.version,status:'confirmed',confirmation});
  assert.equal(out.status,200,JSON.stringify(out.data));row=out.data.item;
  assert.equal(row.status,'confirmed');assert.equal(row.communication.booking.receivedAmount,90000);
  assert.deepEqual(M.paymentState(M.defaults(row)),{received:90000,balance:350000,partial:true});
  assert.match(row.communication.drafts.confirmed,/예약금 입금이 확인되어/);assert.match(row.communication.drafts.confirmed,/남은 잔금: 350,000원/);
  // Older clients must not erase an already recorded deposit when saving notes/drafts.
  const oldClient={...row.communication.booking};delete oldClient.receivedAmount;
  out=await f.request(path+'/communications','owner-admin','PUT',{version:row.version,booking:oldClient,drafts:row.communication.drafts});
  assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.booking.receivedAmount,90000);
  const history=(await f.request(path)).data.history.find(x=>x.action==='reservation.confirmed');assert.equal(history.detail.receivedAmount,90000);assert.equal(history.detail.balance,350000);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});

test('direct drafts allow blank deposits; confirmed OPS bookings send only the actual receipt and guard unsupported servers',async()=>{
 const origin='https://test.moment-link.invalid',f=await ownershipFixture(origin),sent=[];let supports=true;
 try{
  await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','30') WHERE id='settings'");
  const adapter={safeRetry:true,metadata:async()=>({partialPayments:supports}),lookup:async()=>null,availability:async p=>{assert.equal(p.receivedAmount,90000);return {available:true,token:'synthetic'};},create:async p=>{sent.push(p);return {id:'synthetic-'+sent.length};}};
  const env={APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}},app=createApp({db:f.db,env,adapters});
  const request=async(path,method='GET',data)=>{const res=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions['owner-admin']},...(data?{body:JSON.stringify(data)}:{})}));return {status:res.status,data:await res.json()};};
  const catalog=(await request('catalog')).data;
  const body={requestId:randomUUID(),catalogVersion:catalog.version,productId:'classic',packageId:'all',optionIds:[],person:'예약금 합성 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',assignee:f.staff['owner-admin'].id,mode:'draft',booking:{...booking,receivedAmount:null,opsPax:2,opsPaymentMethod:'transfer'}};
  let out=await request('admin/reservations','POST',body);assert.equal(out.status,201,JSON.stringify(out.data));assert.equal(out.data.item.status,'consulting');assert.equal(sent.length,0);
  out=await request('admin/consultations/'+out.data.item.id+'/reservation','POST',{version:out.data.item.version,booking:{...body.booking,receivedAmount:90000},drafts:{},approved:true});
  assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.integration.state,'succeeded');assert.equal(sent[0].amount,440000);assert.equal(sent[0].receivedAmount,90000);
  supports=false;
  out=await request('admin/reservations','POST',{...body,requestId:randomUUID(),mode:'confirmed',booking:{...body.booking,receivedAmount:90000}});
  assert.equal(out.status,201,JSON.stringify(out.data));assert.notEqual(out.data.item.integration.state,'succeeded');assert.equal(sent.length,1);
  const job=out.data.item.integration.id;await processIntegration(f.db,job,env,adapters);await processIntegration(f.db,job,env,adapters);
  const stored=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[job])).rows[0];assert.ok(stored.attempts<=2);assert.equal(sent.length,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
