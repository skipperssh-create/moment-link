import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {boardingInvitation} from '../server/boarding-pass.mjs';

const catalog=JSON.parse(await readFile(new URL('../catalog.confirmed.json',import.meta.url),'utf8'));
const product=(catalog.products||catalog).find(p=>p.id==='classic'),pkg=product.packages.find(p=>p.id==='all');
const booking={date:'2099-01-02',time:'17:00',amount:540000,receivedAmount:540000,place:'합성 검수 장소',extra:'',scheduleConfirmed:true,paymentConfirmed:true,amountMode:'manual',opsPax:2,opsPaymentMethod:'transfer'};
async function harness({failure,patch={},deferred,respond,controlledTimers=false}={}){
 const listeners={},elements={},alerts=[],calls=[],timers=new Map();let timerId=0;
 const element=()=>({innerHTML:'',outerHTML:'',value:'',contains:()=>true,replaceWith(){},focus(){},scrollIntoView(){},remove(){delete elements[this.id];},setAttribute(key,value){this[key]=value;},addEventListener(){},classList:{add(){}}});
 const document={getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[],querySelector:()=>element(),addEventListener:(name,fn)=>listeners[name]=fn,body:{append(node){elements[node.id]=node;}},createElement:()=>({...element(),querySelector:()=>element(),showModal(){assert.equal(ctx.MomentLinkComposer.isBusy(),false,'busy state is released before the error dialog');alerts.push(this.innerHTML.replace(/<[^>]+>/g,''));}})};
 document.dispatchEvent=()=>{};
 const ctx=vm.createContext({CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},document,navigator:{userAgent:'Android'},console,Intl,Date,URL,btoa,TextEncoder,setTimeout:controlledTimers?(fn=>{timers.set(++timerId,fn);return timerId;}):setTimeout,clearTimeout:controlledTimers?(id=>timers.delete(id)):clearTimeout});ctx.window=ctx;ctx.globalThis=ctx;
 ctx.MomentLinkOps={eligible:()=>true,load:async()=>{},fields:()=>'',validate:()=>''};
 for(const file of ['time-picker.js','pricing.js','booking-addons.js','messages.js','message-ui.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
 const item={id:'synthetic-message-error',version:1,status:'confirmed',person:'합성 검수',phone:'01000000000',category:'yacht',product_id:'classic',package_id:'all',snapshot:{product,package:pkg,price:pkg,options:[]},communication:{booking:{...booking,...patch},reservation:{source:'manual'}},integration:{state:'pending'}};
 const api=async(path,method,data)=>{calls.push({path,method,data});if(respond)return respond(path,method,data,item);if(deferred)return deferred;if(failure)throw failure;return {item:{...item,version:2,communication:{...item.communication,booking:data.booking,drafts:data.drafts}}};};
 const init=row=>ctx.MomentLinkComposer.init(row,api,()=>{});
 init(item);ctx.MomentLinkComposer.openStage('confirmed');
 const click=action=>listeners.click({target:{closest:()=>({dataset:{message:action}})},preventDefault(){}});
 return {ctx,alerts,calls,elements,click,item,init,tick:async()=>{const [id,fn]=[...timers][0];timers.delete(id);await fn();},editBody:value=>listeners.input({target:{id:'messageBody',value,dataset:{}}})};
}

test('SMS preparation displays the server reason once, retains edited copy, and never retries OPS or opens SMS',async()=>{
 const reason='OPS의 최신 캘린더 일정 확인이 지연되고 있습니다. 등록 완료 후 문자 준비를 다시 눌러 주세요.';
 const h=await harness({failure:Error(reason)});
 h.editBody('담당자가 입력한 합성 안내문');
 await h.click('save');
 assert.equal(h.alerts.length,1);assert.match(h.alerts[0],/^문자 준비를 완료하지 못했습니다\./);assert.ok(h.alerts[0].includes(reason));
 assert.equal(h.calls.length,1);assert.match(h.calls[0].path,/\/communications$/);assert.equal(h.calls[0].method,'PUT');
 assert.equal(h.elements.messageNotice.role,'alert');assert.equal(h.elements.messageNotice.textContent,reason);
 assert.equal(h.calls[0].data.drafts.confirmed,'담당자가 입력한 합성 안내문');assert.ok(h.ctx.MomentLinkComposer.html().includes('담당자가 입력한 합성 안내문'));
 assert.doesNotMatch(h.ctx.MomentLinkComposer.html(),/data-message="sms"/);
});

test('missing received amount explains the required correction without any API request',async()=>{
 const h=await harness({patch:{receivedAmount:null}});await h.click('save');
 assert.equal(h.calls.length,0);assert.equal(h.alerts.length,1);assert.match(h.alerts[0],/입금/);assert.equal(h.ctx.MomentLinkComposer.isBusy(),false);
});

test('network failure gives a Korean recovery instruction and permits another explicit attempt',async()=>{
 const h=await harness({failure:new TypeError('Failed to fetch')});await h.click('save');
 assert.match(h.alerts[0],/인터넷 연결/);assert.match(h.alerts[0],/저장 여부/);assert.doesNotMatch(h.alerts[0],/Failed to fetch/);
 await h.click('save');assert.equal(h.calls.length,2);assert.equal(h.alerts.length,2);
});

test('successful preparation still exposes the SMS and copy actions without an error dialog',async()=>{
 const h=await harness();await h.click('save');assert.equal(h.alerts.length,0);assert.equal(h.calls.length,1);
 assert.match(h.ctx.MomentLinkComposer.html(),/data-message="sms"/);assert.match(h.ctx.MomentLinkComposer.html(),/data-message="copy"/);
});

test('a late failure cannot overwrite or show an error over another consultation',async()=>{
 let reject;const deferred=new Promise((_,no)=>{reject=no;});const h=await harness({deferred});const work=h.click('save');
 h.init({...h.item,id:'another-synthetic-record'});reject(Error('old request failed'));await work;
 assert.equal(h.alerts.length,0);assert.equal(h.ctx.MomentLinkComposer.isBusy(),false);
});

test('pending, exhausted and conflicting OPS registration explain the block using reads only',async()=>{
 const cases=[
  [{state:'failed',attempts:1,error_code:'OPS_CALENDAR_SYNC_PENDING'},/최신 캘린더 일정 확인이 지연/],
  [{state:'failed',attempts:2,error_code:'OPS_HTTP_408'},/자동 확인 2회/],
  [{state:'conflict',attempts:2,error_code:'OPS_RESOURCE_CONFLICT'},/기존 충돌 건은 재시도하지 않습니다/],
  [null,/예약 등록이 아직 완료되지/],
 ];
 for(const [job,expected] of cases){
  const queries=[];let lookups=0;const tx={query:async(sql)=>{queries.push(sql);return {rows:job?[{...job,target:'boatn'}]:[]};}};
  await assert.rejects(boardingInvitation(tx,{id:'synthetic',status:'confirmed',communication:{booking}},async()=>{lookups++;}),err=>{assert.equal(err.code,'BOARDING_OPS_PENDING');assert.match(err.message,expected);assert.match(err.message,/보딩패스 링크/);return true;});
  assert.equal(queries.length,1);assert.match(queries[0],/^SELECT /);assert.equal(lookups,0);
 }
});

test('registration completion opens ready actions with one observation and no extra preparation request',async()=>{
 let confirmed;
 const h=await harness({controlledTimers:true,respond:(path,method,data,item)=>{
  if(method==='POST'){confirmed={...item,version:2,integration:{id:'job',state:'checking'},communication:{...item.communication,booking:data.booking,drafts:data.drafts}};return {item:confirmed};}
  assert.match(path,/observe=integration/);
  return {item:{id:item.id,version:3,status:'confirmed',integration:{id:'job',state:'succeeded',external_id:'ops'},preparedMessage:{baseVersion:2,jobId:'job',body:'검증된 문자와 합성 보딩패스',invitation:{bookingId:'ops',block:'합성 보딩패스'}}}};
 }});
 await h.click('reserve');await h.tick();
 assert.equal(h.calls.length,2);assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
 assert.match(h.ctx.MomentLinkComposer.html(),/data-message="sms"/);
 assert.equal(h.alerts.length,0);
});
test('automatic draft does not overwrite a concurrent staff edit',async()=>{
 const h=await harness({controlledTimers:true,respond:(path,method,data,item)=>method==='POST'?{item:{...item,version:2,communication:{...item.communication,booking:data.booking,drafts:data.drafts}}}:{item:{id:item.id,version:4,status:'confirmed',integration:{id:'job',state:'succeeded',external_id:'ops'},preparedMessage:{baseVersion:3,jobId:'job',body:'다른 직원의 문자',invitation:{bookingId:'ops',block:'문자'}}}}});
 await h.click('reserve');await h.tick();assert.doesNotMatch(h.ctx.MomentLinkComposer.html(),/data-message="sms"/);
 assert.equal(h.calls.length,2);assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
});
