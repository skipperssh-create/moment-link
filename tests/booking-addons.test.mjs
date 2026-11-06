import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ownershipFixture} from './ownership-fixture.mjs';
import {processIntegration} from '../server/jobs.mjs';
import '../booking-addons.js';
const A=globalThis.MomentLinkAddOns;
const base={date:'2027-11-15',time:'20:00',amount:540000,baseAmount:540000,amountMode:'manual',addOns:[],place:'합성 장소',extra:'',scheduleConfirmed:true,paymentConfirmed:false};
test('extras add once, preserve manual prices after reopening, and respect option exclusions',()=>{
 const b=structuredClone(base);A.toggle(b,'bouquet',true);assert.equal(b.amount,570000);
 A.edit(b,'bouquet','quantity','2');assert.equal(b.amount,600000);
 const r={category:'yacht',status:'consulting',phone:'01000000000',communication:{booking:b},snapshot:{price:{weekday:390000,weekend:440000}}};
 const restored=MomentLinkMessages.defaults(r);assert.equal(restored.amount,600000);assert.equal(restored.baseAmount,540000);
 A.toggle(restored,'bouquet_custom',true);assert.equal(restored.addOns.length,1);assert.equal(restored.amount,null);
 A.edit(restored,'bouquet_custom','unitAmount','50000');assert.equal(restored.amount,590000);
 A.toggle(restored,'bouquet_custom',false);assert.equal(restored.amount,540000);
 A.toggle(restored,'fireworks',true);assert.match(A.lines(restored.addOns)[0],/다발당 10개/);
});
test('invalid amounts, duplicated items, forged fixed prices and oversized totals are rejected',()=>{
 for(const rows of [[{id:'bouquet',quantity:1,unitAmount:1}],[{id:'cake',quantity:0,unitAmount:20000}],[{id:'wine_bottle',quantity:1,unitAmount:null}],[{id:'bouquet',quantity:1,unitAmount:30000},{id:'bouquet_custom',quantity:1,unitAmount:30000}],[{id:'cake',quantity:1,unitAmount:16500,description:'<script>'}]])assert.throws(()=>A.validate(rows));
 assert.match(A.problem({...base,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}]}),/합계/);
 assert.match(A.problem({...base,baseAmount:100000000,amount:100030000,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}]}),/1억/);
});
test('saving unconfirmed booking details persists partial fields and extras without confirmation, dispatch or deadline renewal',async()=>{
 const f=await ownershipFixture();try{
  let row=await f.add({status:'consulting',owner:f.staff['counselor-a'].id});const path='admin/consultations/'+row.id+'/communications';
  const partial={...base,date:'',time:'',amount:null,baseAmount:null,place:'',scheduleConfirmed:false};
  let out=await f.request(path,'counselor-a','PUT',{version:row.version,booking:partial,drafts:{}});assert.equal(out.status,200,JSON.stringify(out.data));row=out.data.item;
  const booking={...base,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}],amount:570000};
  out=await f.request(path,'counselor-a','PUT',{version:row.version,booking,drafts:{receipt:'합성 안내'}});assert.equal(out.status,200,JSON.stringify(out.data));
  const saved=out.data.item;assert.equal(saved.status,'consulting');assert.equal(saved.communication.reservation,undefined);assert.equal(saved.communication.paymentDeadline,undefined);assert.deepEqual(saved.communication.events,undefined);assert.deepEqual(saved.communication.booking,booking);
  const reopened=await f.request('admin/consultations/'+row.id,'counselor-a');assert.deepEqual(reopened.data.item.communication.booking,booking);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM moment_link.integration_jobs')).rows[0].n,0);assert.equal((await f.db.query('SELECT count(*)::int AS n FROM moment_link.outbox')).rows[0].n,0);
  assert.equal((await f.request(path,'counselor-a','PUT',{version:row.version,booking,drafts:{}})).status,409);
  assert.equal((await f.request(path,'counselor-b','PUT',{version:saved.version,booking,drafts:{}})).status,403);
  assert.equal((await f.request(path,'counselor-a','PUT',{version:saved.version,booking:{...booking,amount:540000},drafts:{}})).status,400);
 }finally{await f.pg.close();}
});
async function composer(){
 const listeners={},requests=[],updates=[],elements={},el=()=>({value:'',checked:false,innerHTML:'',outerHTML:'',contains:()=>true,scrollIntoView(){},focus(){},querySelector:()=>({textContent:''})});
 const document={getElementById:id=>elements[id]??=el(),addEventListener:(name,fn)=>listeners[name]=fn};
 const context=vm.createContext({console,Intl,Date,URL,Object,document,navigator:{userAgent:'Android'},window:{},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'}});
 context.globalThis=context;context.window=context;context.MomentLinkOps={eligible:()=>false,fields:()=>'',validate:()=>''};
 for(const file of ['pricing.js','booking-addons.js','messages.js','message-ui.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
 const item={id:'synthetic',version:1,person:'합성 검수',phone:'01000000000',category:'visit',status:'consulting',communication:{booking:structuredClone(base)},snapshot:{product:{name:'합성 상품'},package:{name:'라이트'},price:{weekday:540000,weekend:540000}}};
 const request=(path,method,data)=>new Promise((resolve,reject)=>requests.push({path,method,data:structuredClone(data),resolve,reject}));
 const click=action=>listeners.click({target:{closest:()=>({dataset:{message:action}})},preventDefault(){}});
 context.MomentLinkComposer.init(item,request,item=>updates.push(item));return {context,item,requests,updates,elements,click,request};
}
test('booking save is independent of confirmation, blocks double clicks and keeps drafts after a failed write',async()=>{
 const h=await composer();let saving=h.click('bookingSave');await h.click('bookingSave');assert.equal(h.requests.length,1);assert.match(h.requests[0].path,/communications$/);assert.equal(h.requests[0].method,'PUT');assert.equal(h.requests[0].data.prepareStage,undefined);assert.equal(h.requests[0].data.booking.paymentConfirmed,false);
 h.requests[0].reject(Error('합성 연결 실패'));await saving;assert.equal(h.context.MomentLinkComposer.isBusy(),false);assert.match(h.elements.messageComposer.outerHTML,/저장하지 못했습니다/);assert.match(h.elements.messageComposer.outerHTML,/540000/);
 saving=h.click('bookingSave');h.requests[1].resolve({item:{...h.item,version:2,communication:{booking:h.requests[1].data.booking,drafts:h.requests[1].data.drafts}}});await saving;
 assert.equal(h.updates.length,1);assert.match(h.elements.messageComposer.outerHTML,/예약사항을 저장했습니다/);assert.doesNotMatch(h.elements.messageComposer.outerHTML,/data-message="sms"/);
});
test('a late booking save response cannot replace a newly opened consultation',async()=>{
 const h=await composer(),saving=h.click('bookingSave');h.context.MomentLinkComposer.init({...h.item,id:'second',person:'다른 합성 검수'},h.request,()=>{});h.requests[0].resolve({item:{...h.item,communication:{booking:base,drafts:{}}}});await saving;assert.equal(h.updates.length,0);assert.equal(h.context.MomentLinkComposer.isBusy(),false);
});
test('confirmed extra purchases reach OPS as item rows with the same total, at most once',async()=>{
 const f=await ownershipFixture();try{
  const r=await f.add({status:'consulting',owner:f.staff['counselor-a'].id});await f.db.query("UPDATE moment_link.consultations SET category='yacht',product_id='classic',package_id='all' WHERE id=$1",[r.id]);
  const addOns=[{id:'bouquet',quantity:1,unitAmount:30000}],booking={...base,amount:570000,addOns,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer'};
  const out=await f.request('admin/consultations/'+r.id+'/reservation','counselor-a','POST',{version:r.version,booking,drafts:{confirmed:'합성 안내'},approved:true});assert.equal(out.status,200,JSON.stringify(out.data));
  const job=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[r.id])).rows[0];let creates=0;
  const adapter={safeRetry:true,metadata:async()=>({addOnPurchases:true}),lookup:async()=>null,availability:async p=>{assert.deepEqual(p.addOns,addOns);assert.equal(p.amount,570000);return {available:true,token:'synthetic'};},create:async p=>{creates++;assert.deepEqual(p.addOns,addOns);return {id:'synthetic-linked'};}};
  const env={OPS_WRITES_ENABLED:'true'},adapters={ops:{boatn:adapter}};assert.equal((await processIntegration(f.db,job.id,env,adapters)).state,'succeeded');await processIntegration(f.db,job.id,env,adapters);assert.equal(creates,1);
  const current=(await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[r.id])).rows[0];
  const changed={...booking,addOns:[{id:'fireworks',quantity:1,unitAmount:30000}]};assert.equal((await f.request('admin/consultations/'+r.id+'/reservation','counselor-a','POST',{version:current.version,booking:changed,drafts:{},approved:true})).status,409);
 }finally{await f.pg.close();}
});
