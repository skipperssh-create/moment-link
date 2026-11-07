import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../time-picker.js',import.meta.url),'utf8');
function fixture(){const listeners={};const context=vm.createContext({document:{addEventListener:(event,fn)=>listeners[event]=fn},Event});vm.runInContext(source,context);return {picker:context.MomentLinkTime,listeners};}

test('time picker offers business hours from 10 AM through midnight in order with ten-minute choices',()=>{
 const {picker}=fixture(),html=picker.html('msg_time','협의한 시간','21:30','data-message-field="time"');
 const minute=html.split('id="msg_time_minute"')[1];assert.deepEqual([...minute.matchAll(/<option value="(\d+)"/g)].map(m=>m[1]),['00','10','20','30','40','50']);
 const hour=html.split('id="msg_time_hour"')[1].split('</select>')[0];assert.deepEqual([...hour.matchAll(/<option value="(\d\d)"/g)].map(m=>m[1]),['10','11','12','13','14','15','16','17','18','19','20','21','22','23','00']);assert.match(hour,/<option value="21" selected>오후 9시/);assert.match(hour,/<option value="00" >밤 12시 \(자정\)/);assert.match(minute,/<option value="30" selected>/);assert.match(html,/aria-label="협의한 시간 · 분 \(10분 단위\)"/);assert.doesNotMatch(html,/type="time"/);
});
test('hour/minute changes emit the same HH:mm input value consumed by booking forms',()=>{
 const {listeners}=fixture(),events=[],hour={value:'21'},minute={value:'40',options:['','00','10','20','30','40','50'].map(value=>({value,disabled:false}))},hint={hidden:true},input={value:'21:30',dispatchEvent:event=>events.push(event.type)};
 const root={querySelector:s=>s==='[data-time-value]'?input:s==='[data-time-part="hour"]'?hour:s==='[data-time-midnight]'?hint:minute};
 const target={matches:()=>true,closest:()=>root};listeners.change({target});assert.equal(input.value,'21:40');assert.deepEqual(events,['input','change']);
 hour.value='00';minute.value='50';listeners.change({target});assert.equal(input.value,'00:00');assert.equal(minute.value,'00');assert.equal(hint.hidden,false);assert.deepEqual(minute.options.filter(o=>!o.disabled).map(o=>o.value),['','00']);
 hour.value='10';listeners.change({target});assert.equal(input.value,'10:00');assert.equal(hint.hidden,true);assert.ok(minute.options.every(o=>!o.disabled));
 hour.value='23';minute.value='50';listeners.change({target});assert.equal(input.value,'23:50');
 hour.value='09';listeners.change({target});assert.equal(input.value,'');
 hour.value='';listeners.change({target});assert.equal(input.value,'');
 hour.value='09';minute.value='35';listeners.change({target});assert.equal(input.value,'');assert.equal(minute.value,'');
 input.disabled=true;input.value='22:20';listeners.change({target});assert.equal(input.value,'22:20');
});
test('legacy minute values are preserved when viewing; new selections do not silently round them',()=>{
 const {picker}=fixture(),html=picker.html('saved','저장 시간','21:35','disabled');assert.match(html,/value="21:35" disabled/);assert.match(html,/<option value="35" selected disabled>35분 · 기존 시간/);assert.equal((html.match(/aria-label="저장 시간[^>]+disabled/g)||[]).length,2);
 const empty=picker.html('new','새 시간','bad','required');assert.match(empty,/type="hidden"[^>]+value="" required/);assert.doesNotMatch(empty,/기존 시간/);
});

test('out-of-hours legacy bookings remain visible without silently changing stored dates or times',()=>{
 const {picker}=fixture();
 const early=picker.html('saved','저장 시간','09:35');assert.match(early,/value="09:35"/);assert.match(early,/<option value="09" selected disabled>오전 9시 · 기존 시간/);assert.match(early,/<option value="35" selected disabled>35분 · 기존 시간/);
 const late=picker.html('saved','저장 시간','00:30');assert.match(late,/value="00:30"/);assert.match(late,/<option value="30" selected disabled>30분 · 기존 시간/);
 const midnight=picker.html('saved','저장 시간','00:00');assert.match(midnight,/<option value="00" selected>00분/);assert.equal((midnight.match(/value="(?:10|20|30|40|50)"  disabled/g)||[]).length,5);assert.match(midnight,/12일 밤 12시 → 13일 00:00/);
});

test('app updates show a user-controlled refresh and never discard an open editor automatically',async()=>{
 const listeners={},windowListeners={},docListeners={},added=[];let reloads=0,updates=0,refresh;
 const document={visibilityState:'visible',getElementById:id=>added.find(el=>el.id===id),addEventListener:(k,fn)=>docListeners[k]=fn,body:{prepend:el=>added.push(el),classList:{toggle(){}}},createElement:()=>({setAttribute(){},querySelector:()=>({addEventListener:(name,fn)=>{refresh=fn;}})})};
 const registration={update:async()=>{updates++;}},navigator={onLine:true,serviceWorker:{controller:{},addEventListener:(k,fn)=>listeners[k]=fn,register:async()=>registration}};
 const window={isSecureContext:true,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener:(k,fn)=>windowListeners[k]=fn,location:{reload:()=>{reloads++;}}};
 vm.runInNewContext(await readFile(new URL('../pwa.js',import.meta.url),'utf8'),{document,navigator,window,Date});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(updates,1);listeners.controllerchange();assert.equal(reloads,0);assert.match(added.find(el=>el.id==='pwaUpdate').innerHTML,/작성 중인 내용을 저장/);refresh();assert.equal(reloads,1);listeners.controllerchange();assert.equal(added.filter(el=>el.id==='pwaUpdate').length,1);
});
