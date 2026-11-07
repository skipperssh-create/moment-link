import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {ownershipFixture} from './ownership-fixture.mjs';

test('consultation product revisions validate catalog, retain purchases and history, and never dispatch OPS',async t=>{
 const f=await ownershipFixture();try{
  const owner=f.staff['counselor-a'].id,c=(await f.db.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const p=c.products.find(p=>p.id==='premium'),pk=p.packages.find(p=>p.id==='all');
  const quote=MomentLinkPricing.quote({category:p.category,snapshot:{product:p,package:pk,price:pk}},'2027-11-16').amount;
  const event={id:randomUUID(),stage:'receipt',kind:'manual_sent',actor:'synthetic',at:new Date().toISOString()};
  const row=await f.add({status:'consulting',owner,communication:{events:[event],paymentDeadline:'2027-11-16T01:00:00Z'}});
  await f.db.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),row.id,owner,'합성 메모 보존']);
  const selection={catalogVersion:c.version,productId:p.id,packageId:pk.id,optionIds:[]};
  const booking={date:'2027-11-16',time:'20:00',amount:quote+46500,baseAmount:quote,amountMode:'auto',addOns:[{id:'bouquet',quantity:1,unitAmount:30000},{id:'cake',quantity:1,unitAmount:16500}],place:'합성 장소',extra:'합성 추가 안내',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer'};
  const path='admin/consultations/'+row.id+'/product';
  let saved;
  await t.test('changes yacht/package and resets approval, retaining ownership, notes, preferences and paid extras',async()=>{
   const out=await f.request(path,'counselor-a','POST',{version:row.version,selection,booking});assert.equal(out.status,200,JSON.stringify(out.data));saved=out.data.item;
   assert.equal(saved.product_id,'premium');assert.equal(saved.package_id,'all');assert.equal(saved.status,'consulting');assert.equal(saved.assignee,owner);assert.equal(saved.communication.booking.amount,quote+46500);assert.deepEqual(saved.communication.booking.addOns,booking.addOns);assert.equal(saved.communication.booking.paymentConfirmed,false);assert.equal(saved.communication.booking.scheduleConfirmed,false);assert.equal(saved.communication.reservation,undefined);assert.equal(saved.communication.originalSelection.productId,'visit');assert.deepEqual(saved.communication.events,[event]);assert.equal(saved.communication.paymentDeadline,'');assert.deepEqual(saved.preferences,row.preferences);
   const fresh=await f.request('admin/consultations/'+row.id,'counselor-a');assert.equal(fresh.data.notes[0].body,'합성 메모 보존');assert.ok(fresh.data.history.some(x=>x.action==='consultation.product_changed'));assert.match(saved.communication.drafts.receipt,new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.match(saved.communication.drafts.receipt,/케익 추가/);
   assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.integration_jobs')).rows[0].n,0);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
  });
  await t.test('other staff and stale submissions cannot overwrite the booking',async()=>{
   assert.equal((await f.request(path,'counselor-b','POST',{version:saved.version,selection,booking})).status,403);
   assert.equal((await f.request(path,'counselor-a','POST',{version:row.version,selection,booking})).status,409);
  });
  await t.test('catalog drift, unknown package/options and forged automatic totals are rejected atomically',async()=>{
   for(const change of [{selection:{...selection,catalogVersion:c.version+1}},{selection:{...selection,packageId:'missing'}},{selection:{...selection,optionIds:['missing']}},{booking:{...booking,baseAmount:100,amount:46600}}]){
    const out=await f.request(path,'counselor-a','POST',{version:saved.version,selection,booking,...change});assert.ok([400,409].includes(out.status),JSON.stringify(out.data));
   }
   assert.equal((await f.request('admin/consultations/'+row.id,'counselor-a')).data.item.version,saved.version);
  });
  await t.test('partial draft allows a new product without confirming or requiring a time',async()=>{
   const out=await f.request(path,'counselor-a','POST',{version:saved.version,selection:{...selection,productId:'classic',packageId:'light'},booking:{...booking,date:'',time:'',place:'',baseAmount:null,amount:null}});assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.originalSelection.productId,'visit');saved=out.data.item;
  });
  await t.test('confirmed records and existing conflicts remain unchanged with no retry',async()=>{
   const confirmed=await f.add({owner,status:'confirmed',communication:{reservation:{source:'manual'}}});assert.equal((await f.request('admin/consultations/'+confirmed.id+'/product','counselor-a','POST',{version:confirmed.version,selection,booking})).status,409);
   const jobId=randomUUID();await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',2,'OPS_RESOURCE_CONFLICT',$4,'{}')",[jobId,row.id,'moment-link:'+row.id,owner]);
   assert.equal((await f.request(path,'counselor-a','POST',{version:saved.version,selection,booking})).status,409);const job=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[jobId])).rows[0];assert.equal(job.state,'conflict');assert.equal(job.attempts,2);assert.equal(job.error_code,'OPS_RESOURCE_CONFLICT');
  });
 }finally{await f.pg.close();}
});

test('composer exposes purchases, switches yacht/package, blocks premature confirmation and preserves the note node',async()=>{
 const listeners={},elements={},calls=[];let replacedWith;
 const element=()=>({innerHTML:'',outerHTML:'',value:'',contains:()=>true,querySelector:()=>({textContent:''}),replaceWith(node){replacedWith=node;},focus(){},scrollIntoView(){}});
 const document={getElementById:id=>elements[id]??=element(),addEventListener:(name,fn)=>listeners[name]=fn};
 const ctx=vm.createContext({document,navigator:{userAgent:'Android'},window:{},console,Intl,Date,URL});ctx.window=ctx;ctx.globalThis=ctx;
 ctx.MomentLinkOps={eligible:()=>false,fields:()=>'',validate:()=>''};
 for(const file of ['pricing.js','booking-addons.js','messages.js','message-ui.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
 const catalog=JSON.parse(await readFile(new URL('../catalog.confirmed.json',import.meta.url),'utf8')),products=catalog.products||catalog;
 const p=products.find(x=>x.id==='classic'),pk=p.packages.find(x=>x.id==='light');
 const item={id:'synthetic-product',version:1,person:'합성 검수',phone:'01000000000',category:'yacht',product_id:p.id,package_id:pk.id,status:'consulting',preferences:[{date:'2027-11-16',time:'20:00'}],snapshot:{product:p,package:pk,price:pk,options:[]},communication:{}};
 ctx.MomentLinkComposer.init(item,async(path,method,data)=>{calls.push({path,method,data});if(path==='catalog')return {version:1,products};return {item:{...item,product_id:data.selection.productId,package_id:data.selection.packageId,version:2,communication:{booking:data.booking,drafts:{receipt:'합성 상품 변경'}}}};},()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 let markup=ctx.MomentLinkComposer.html('<textarea id="requestNote">미저장 메모</textarea>');
 for(const id of ['bouquet','cake','fireworks','wine_bottle'])assert.match(markup,new RegExp('data-addon-toggle="'+id+'"'));
 assert.ok(markup.indexOf('id="workflowBooking"')<markup.indexOf('id="workflowNotes"'));assert.ok(markup.indexOf('id="workflowNotes"')<markup.indexOf('id="workflowConfirm"'));assert.ok(markup.indexOf('id="workflowConfirm"')<markup.indexOf('id="workflowMessages"'));assert.doesNotMatch(markup,/<details class="message-booking"/);
 const noteNode=document.getElementById('workflowNotesContent');noteNode.draft='미저장 메모';
 const change=(key,value)=>listeners.change({target:{dataset:{productField:key},value}});
 change('productId','premium');change('packageId','all');assert.equal(replacedWith,noteNode);assert.equal(replacedWith.draft,'미저장 메모');
 assert.throws(()=>ctx.MomentLinkComposer.confirmation(),/먼저 예약사항 저장/);
 listeners.input({target:{dataset:{addonToggle:'bouquet'},checked:true,id:'msg_addon_bouquet'}});
 listeners.input({target:{dataset:{addonToggle:'cake'},checked:true,id:'msg_addon_cake'}});
 const click=action=>listeners.click({target:{closest:()=>({dataset:{message:action}})},preventDefault(){}});
 await click('reserve');assert.equal(calls.filter(x=>x.method).length,0);
 await click('bookingSave');const save=calls.find(x=>x.method);assert.match(save.path,/\/product$/);assert.equal(save.data.selection.productId,'premium');assert.equal(save.data.selection.packageId,'all');assert.equal(save.data.booking.addOns.length,2);assert.equal(save.data.booking.amount-save.data.booking.baseAmount,46500);assert.equal(save.data.booking.paymentConfirmed,false);
});
