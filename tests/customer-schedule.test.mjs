import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {consultationSchema} from '../server/validation.mjs';

const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const scripts=await Promise.all(['pricing.js','booking-addons.js','messages.js','time-picker.js'].map(path=>readFile(new URL('../'+path,import.meta.url),'utf8')));
function fixture(fetcher=async()=>{throw Error('Unexpected network request');}){
 const listeners={},nodes={'#app':{innerHTML:''}},requests=[];
 const document={addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn),getElementById:id=>nodes['#'+id],querySelector:s=>nodes[s]||null};
 const context=vm.createContext({document,console,Intl,Date,structuredClone,crypto:{randomUUID},Event,
  navigator:{onLine:true},location:{hash:'',href:'https://synthetic.invalid/'},
  history:{replaceState(){},pushState(){},back(){},go(){}},
  window:{addEventListener(){},scrollTo(){}},
  fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}
 });
 for(const script of scripts)vm.runInContext(script,context);
 vm.runInContext(source.replace('initializeNavigation();\nroute();',`globalThis.scheduleTest={state,scheduleFields,scheduleError,customer,smsText,submit,render,
  ready(data){catalog=data.products;catalogVersion=data.version;settings={...settingDefaults,...data.settings};apiReady=true;},
  setTemplate(value){settings.manualSmsTemplate=value;}};`),context);
 const api=context.scheduleTest;
 Object.assign(api.state,{category:'yacht',selection:{id:'classic',packId:'light'},step:'schedule'});
 async function dispatch(type,target){target.dataset||={};for(const fn of listeners[type]||[])await fn({target});}
 return {api,nodes,requests,context,dispatch,click:dataset=>dispatch('click',{closest:()=>({dataset})})};
}

test('customer sees a required first date/time, an unchecked flexible-time choice, and optional second schedule',async()=>{
 const h=fixture(),html=h.api.customer();
 assert.match(html,/1순위 희망 일정 <span>필수/);
 assert.match(html,/id="firstDate"[^>]+required/);
 assert.match(html,/id="exactTime1_hour"[^>]+required/);
 assert.match(html,/id="exactTime1_minute"[^>]+required/);
 assert.match(html,/아무 시간대나 괜찮아요/);
 assert.doesNotMatch(html,/id="anyTime1"[^>]+ checked/);
 assert.doesNotMatch(html,/id="secondDate"|정확한 시간을 정하고 싶어요/);
 await h.click({action:'toggleSecond'});
 assert.match(h.nodes['#app'].innerHTML,/2순위 희망 일정 <span>선택/);
 assert.match(h.nodes['#app'].innerHTML,/id="secondDate"/);
 assert.match(h.nodes['#app'].innerHTML,/id="anyTime2"/);
});

test('first schedule is required; second schedule is optional but partial or duplicate choices fail',()=>{
 const {api}=fixture(),s=api.state;
 assert.match(api.scheduleError(),/1순위 희망 날짜/);
 s.firstDate='2099-11-01';assert.match(api.scheduleError(),/1순위 시간/);
 s.firstTime='19:20';assert.equal(api.scheduleError(),'');
 s.firstTime='시간 무관';assert.equal(api.scheduleError(),'');
 s.firstDate='2000-01-01';assert.match(api.scheduleError(),/올바른 날짜/);
 s.firstDate='2099-02-31';assert.match(api.scheduleError(),/올바른 날짜/);
 s.firstDate='2099-11-01';s.secondTime='시간 무관';assert.match(api.scheduleError(),/2순위 날짜/);
 s.secondDate='2099-11-02';s.secondTime='';assert.match(api.scheduleError(),/2순위 시간/);
 s.secondTime='시간 무관';assert.equal(api.scheduleError(),'');
 s.secondDate=s.firstDate;assert.match(api.scheduleError(),/다른 날짜 또는 시간/);
 s.secondTime='20:30';assert.equal(api.scheduleError(),'');
 s.firstTime='저녁';assert.match(api.scheduleError(),/1순위 시간/);
});

test('selecting hour then minute preserves the live controls; flexible time is explicit and independent per rank',async()=>{
 const h=fixture(),s=h.api.state,events=[];
 const hour={value:'19'},minute={value:'',options:['','00','10','20','30','40','50'].map(value=>({value}))},hint={hidden:true};
 const input={id:'exactTime1',value:'',dataset:{},dispatchEvent:event=>events.push(h.dispatch(event.type,input))};
 const root={querySelector:q=>q==='[data-time-value]'?input:q==='[data-time-part="hour"]'?hour:q==='[data-time-midnight]'?hint:minute};
 const target={matches:()=>true,closest:()=>root};
 const checkbox={id:'anyTime1',dataset:{anyTime:'1'},checked:false};
 Object.assign(h.nodes,{'#exactTime1':input,'#anyTime1':checkbox,'#preferenceTime1':{disabled:false}});
 s.secondDate='2099-11-02';s.secondTime='21:00';h.nodes['#app'].innerHTML='preserve current controls';
 await h.dispatch('change',target);await Promise.all(events);assert.equal(s.firstTime,'');
 assert.equal(h.nodes['#app'].innerHTML,'preserve current controls');
 minute.value='20';await h.dispatch('change',target);await Promise.all(events);assert.equal(s.firstTime,'19:20');
 assert.equal(h.nodes['#app'].innerHTML,'preserve current controls');
 checkbox.checked=true;await h.dispatch('change',checkbox);assert.equal(s.firstTime,'시간 무관');assert.equal(h.nodes['#preferenceTime1'].disabled,true);
 assert.equal(s.secondTime,'21:00');
 checkbox.checked=false;await h.dispatch('change',checkbox);assert.equal(s.firstTime,'19:20');assert.equal(h.nodes['#preferenceTime1'].disabled,false);
 s.firstTime='시간 무관';assert.match(h.api.scheduleFields(1),/id="preferenceTime1"[^>]+disabled/);
 assert.match(h.api.scheduleFields(1),/id="anyTime1"[^>]+checked/);
});

test('removing second choice clears both fields while first choice and its flexible-time setting remain',async()=>{
 const h=fixture(),s=h.api.state;
 Object.assign(s,{firstDate:'2099-11-01',firstTime:'시간 무관',secondEnabled:true,secondDate:'2099-11-02',secondTime:'20:10'});
 await h.click({action:'clearSecond'});
 assert.equal(s.secondEnabled,false);assert.equal(s.secondDate,'');assert.equal(s.secondTime,'');
 assert.equal(s.firstDate,'2099-11-01');assert.equal(s.firstTime,'시간 무관');assert.equal(h.api.scheduleError(),'');
 assert.doesNotMatch(h.api.smsText(),/2순위:/);
});

test('helicopter retains daytime-only preferences and switching products drops incompatible time choices',async()=>{
 const h=fixture(),s=h.api.state;Object.assign(s,{firstDate:'2099-11-01',firstTime:'19:20'});
 await h.click({category:'heli'});assert.equal(s.firstTime,'');
 const html=h.api.scheduleFields(1);assert.match(html,/주간에는 아무 시간대나 괜찮아요/);assert.match(html,/value="오전"/);assert.doesNotMatch(html,/value="저녁"|data-time-part/);
 s.firstTime='오후';assert.equal(h.api.scheduleError(),'');
 s.firstTime='19:20';assert.match(h.api.scheduleError(),/1순위 시간/);
 s.firstTime='오전';await h.click({category:'visit'});assert.equal(s.firstTime,'');
 s.firstTime='시간 무관';await h.click({category:'yacht'});assert.equal(s.firstTime,'시간 무관');
});

test('API schema rejects missing rank one or incomplete rank two while preserving existing period-based requests',()=>{
 const base={catalogVersion:1,productId:'classic',packageId:'light',category:'yacht',person:'합성 일정 검수',phone:'01000000000',place:'',notes:'',consent:true,consentVersion:'synthetic'};
 for(const preferences of [[],[{date:'',time:'19:20'}],[{date:'2099-11-01',time:''}],[{date:'2099-11-01',time:'19:20'},{date:'',time:'시간 무관'}]])assert.equal(consultationSchema.safeParse({...base,preferences}).success,false);
 for(const time of ['오전','오후','저녁','시간 무관','19:20'])assert.equal(consultationSchema.safeParse({...base,preferences:[{date:'2099-11-01',time}]}).success,true);
});

test('customer choices persist through the real intake API and admin response, including SMS and booking defaults',async()=>{
 const pg=new PGlite(),db={query:(q,p)=>pg.query(q,p),transaction:fn=>pg.transaction(fn)},origin='https://synthetic.invalid';
 try{
  await migrate(db);
  const config=(await db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...config,accepting:true,push:false,solapi:false,customerAuto:false,adminAuto:false,privacyController:'합성 검수',privacyContact:'합성 검수',privacyText:'합성 테스트 전용',retentionDays:1,consentVersion:'synthetic-v1'})]);
  await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[randomUUID(),'schedule-test',await passwordHash('Synthetic-password-123!'),'admin']);
  const app=createApp({db,env:{APP_ORIGIN:origin,NODE_ENV:'production'}});
  const catalog=await (await app(new Request(origin+'/api/catalog'))).json();
  const login=await app(new Request(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'schedule-test',password:'Synthetic-password-123!'})}));
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  for(const choices of [
   {firstDate:'2099-11-01',firstTime:'19:20',secondDate:'2099-11-02',secondTime:'시간 무관',secondEnabled:true},
   {firstDate:'2099-11-03',firstTime:'시간 무관',secondDate:'',secondTime:'',secondEnabled:false}
  ]){
   const h=fixture((url,options)=>app(new Request(origin+url,{...options,headers:{...options.headers,Origin:origin}})));
   h.api.ready(catalog);Object.assign(h.api.state,choices,{person:undefined,name:'합성 일정 검수',phone:'01000000000',notes:'SYNTHETIC ONLY',consent:true});
   await h.api.submit();assert.equal(h.api.state.complete,true,h.api.state.formError);
   const sent=JSON.parse(h.requests[0].options.body),stored=(await db.query('SELECT * FROM moment_link.consultations WHERE receipt=$1',[h.api.state.receipt])).rows[0];
   assert.deepEqual(stored.preferences,sent.preferences);assert.equal(stored.preferences[0].time,choices.firstTime);
   assert.equal(stored.preferences.length,choices.secondEnabled?2:1);
   const response=await app(new Request(origin+'/api/admin/consultations/'+stored.id,{headers:{Cookie:cookie}}));assert.equal(response.status,200);
   const item=(await response.json()).item;assert.deepEqual(item.preferences,sent.preferences);
   assert.equal(h.context.MomentLinkMessages.defaults(item).time,choices.firstTime==='시간 무관'?'':choices.firstTime);
   assert.match(h.api.smsText(),new RegExp('1순위: 11월 '+Number(choices.firstDate.slice(-2))+'일 '+choices.firstTime));
   if(choices.secondEnabled)assert.match(h.api.smsText(),/2순위: 11월 2일 시간 무관/);else assert.doesNotMatch(h.api.smsText(),/2순위:/);
   h.api.setTemplate('1순위: {first}\n2순위: {second}');assert.ok(h.api.smsText().includes(choices.firstTime));
  }
  assert.equal(Number((await db.query('SELECT count(*) FROM moment_link.outbox')).rows[0].count),0);
 }finally{await pg.close();}
});
