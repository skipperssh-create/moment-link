import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {initialSettings} from '../server/seed.mjs';
import '../pricing.js';
import '../messages.js';
const P=globalThis.MomentLinkPricing,M=globalThis.MomentLinkMessages;
const sample=()=>({category:'yacht',person:'합성 검수',phone:'01000000000',status:'new',place:'',preferences:[{date:'2026-11-03',time:'16:01'}],snapshot:{product:{name:'클래식(레오파드)요트'},package:{name:'라이트',datePrices:[]},options:[{id:'test',name:'합성 옵션',amount:30000}],price:{weekday:420000,weekend:470000,optionAmount:30000,dateOverrides:[]}}});

test('customer summaries and SMS price each selected date and update immediately',async()=>{
 const listeners={},priceNode={textContent:''},window={addEventListener(){}};
 const context=vm.createContext({window,document:{querySelector:()=>priceNode,addEventListener:(name,fn)=>{listeners[name]=fn;}},crypto:{randomUUID:()=> 'synthetic'},structuredClone,MomentLinkPricing:P});
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 vm.runInContext(source.replace(/initializeNavigation\(\);\s*route\(\);\s*\}\)\(\);\s*$/,`window.test={state,settings,catalog,getProduct,getPack,displayChosenPrice,smsText,customer};})();`),context);
 const h=window.test;Object.assign(h.state,{category:'yacht',selection:{id:'classic',packId:'light'},firstTime:'18:00'});
 assert.equal(h.displayChosenPrice(),'주중 390,000원 / 주말 440,000원');
 for(const [date,expected] of [['2026-11-16','주중 390,000원'],['2026-11-20','주말 440,000원'],['2026-12-24','주말 440,000원']]){
  listeners.input({target:{id:'firstDate',value:date}});
  assert.equal(priceNode.textContent,expected);assert.equal(h.displayChosenPrice(),expected);
  assert.equal(h.smsText().split('\n').find(line=>line.startsWith('가격: ')),'가격: '+expected);
  h.state.step='done';assert.ok(h.customer().includes(expected));
 }
 h.settings.manualSmsTemplate='가격: {price}';h.state.firstDate='2026-11-16';h.state.secondDate='2026-11-20';
 assert.equal(h.smsText(),'가격: 1순위 (11월 16일) 주중 390,000원 / 2순위 (11월 20일) 주말 440,000원');
 listeners.input({target:{id:'secondDate',value:'2026-11-17'}});
 assert.equal(priceNode.textContent,'1순위 (11월 16일) 주중 390,000원 / 2순위 (11월 17일) 주중 390,000원');
 h.state.secondDate='2026-12-24';assert.equal(h.smsText(),'가격: 1순위 (11월 16일) 주중 390,000원 / 2순위 (12월 24일) 주말 440,000원');
 h.state.selection.packId='all';h.state.secondDate='2026-11-20';
 assert.equal(h.smsText(),'가격: 1순위 (11월 16일) 주중 440,000원 / 2순위 (11월 20일) 주말 540,000원');
 h.state.selection.packId='light';listeners.input({target:{id:'secondDate',value:''}});assert.equal(priceNode.textContent,'주중 390,000원');
 h.state.secondDate='';const pack=h.getPack();pack.options=[{id:'extra',name:'합성 옵션',amount:30000}];h.state.optionIds=['extra'];
 assert.equal(h.smsText(),'가격: 주중 420,000원 · 합성 옵션');
 pack.datePrices=[{date:'2026-11-16',amount:500000}];assert.equal(h.smsText(),'가격: 지정 요금 530,000원 · 합성 옵션');
 h.state.secondDate='2026-11-20';pack.datePrices.push({date:'2026-11-20',amount:600000});
 assert.equal(h.smsText(),'가격: 1순위 (11월 16일) 지정 요금 530,000원 / 2순위 (11월 20일) 지정 요금 630,000원 · 합성 옵션');
 pack.datePrices[1].amount=null;assert.equal(h.smsText(),'가격: 1순위 (11월 16일) 지정 요금 530,000원 / 2순위 (11월 20일) 상담 후 안내 · 합성 옵션');
 h.state.secondDate='';
 pack.datePrices[0].amount=null;assert.equal(h.smsText(),'가격: 상담 후 안내 · 합성 옵션');
 pack.datePrices=[];h.state.firstDate='2028-01-03';assert.equal(h.smsText(),'가격: 상담 후 안내 · 합성 옵션');
 h.state.firstDate='2026-11-16';h.state.submitted={product:structuredClone(h.getProduct()),package:structuredClone(pack),options:structuredClone(pack.options)};h.state.complete=true;
 pack.weekday=999999;assert.equal(h.smsText(),'가격: 주중 420,000원 · 합성 옵션');
});

test('yacht weekday and weekend boundary uses event date in Korea',()=>{
 for(const date of ['2026-11-02','2026-11-03','2026-11-04','2026-11-05'])assert.equal(P.dayRate(date).rate,'weekday',date);
 for(const date of ['2026-11-06','2026-11-07','2026-11-08'])assert.equal(P.dayRate(date).rate,'weekend',date);
 for(const date of ['',null,'2026-02-30','11/03/2026','2026-11-03T00:00:00Z'])assert.equal(P.dayRate(date).rate,null);
 assert.equal(P.dayRate('2028-01-03').rate,null); // Unverified Monday must not silently use weekday pricing.
 assert.equal(P.dayRate('2028-01-07').rate,'weekend'); // Friday does not depend on the calendar table.
});

test('holidays, holiday eves, substitutes, new holidays and year rollover use weekend price',()=>{
 for(const date of ['2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-03-02','2026-04-30','2026-05-01','2026-05-04','2026-05-05','2026-05-25','2026-06-02','2026-06-03','2026-07-16','2026-07-17','2026-08-17','2026-09-23','2026-09-24','2026-09-25','2026-10-05','2026-12-24','2026-12-25','2026-12-31','2027-01-01','2027-02-08','2027-02-09','2027-05-03','2027-05-12','2027-05-13','2027-07-19','2027-08-16','2027-09-13','2027-09-14','2027-09-15','2027-09-16','2027-10-04','2027-10-11','2027-12-27'])assert.equal(P.dayRate(date).rate,'weekend',date);
 assert.equal(P.dayRate('2026-06-08').rate,'weekday'); // No inferred Memorial Day substitute.
 assert.equal(P.dayRate('2027-06-07').rate,'weekday');
 assert.match(P.dayRate('2026-12-24').label,/성탄절 전날/);
});

test('snapshot totals and date-specific overrides include options exactly once',()=>{
 const r=sample();assert.equal(P.quote(r,'2026-11-03').amount,420000);assert.equal(P.quote(r,'2026-11-06').amount,470000);
 r.snapshot.package.datePrices=[{date:'2026-11-03',amount:500000},{date:'2026-11-06',amount:null}];
 assert.equal(P.quote(r,'2026-11-03').amount,530000);assert.equal(P.quote(r,'2026-11-06').amount,null);
 r.snapshot.price.dateOverrides=[{date:'2026-11-03',override:{amount:540000}}];
 assert.equal(P.quote(r,'2026-11-03').amount,540000);
 assert.equal(P.quote(r,'2026-12-24').amount,470000);
 assert.equal(P.quote(r,'2028-01-03').amount,null);
 const same=sample();same.snapshot.price.weekend=420000;
 assert.equal(P.quote(same,'2028-01-03').amount,420000);
 const unknown=sample();unknown.snapshot.price.weekday=null;assert.equal(P.quote(unknown,'2026-11-03').amount,null);
});

test('defaults fill amount and yacht address while preserving manual quotes and confirmed bookings',()=>{
 const r=sample(),b=M.defaults(r);
 assert.equal(b.amount,420000);assert.equal(b.amountMode,'auto');assert.equal(b.time,'16:01');
 assert.equal(b.place,'부산광역시 영도구 태종로 727, 한국해양대학교 요트면허시험장 앞 주차장');
 assert.equal(M.defaults({...r,category:'visit'}).place,'');
 assert.equal(M.defaults(r,{yachtPlace:'운영자 지정 장소',yachtAddress:'운영자 지정 주소'}).place,'운영자 지정 주소, 운영자 지정 장소');
 const manual={...b,amount:415000,amountMode:'manual',place:'협의 장소'};
 assert.deepEqual(M.defaults({...r,communication:{booking:manual}}),manual);
 assert.equal(M.defaults({...r,communication:{booking:{...manual,amountMode:undefined}}}).amount,415000);
 const confirmed={...b,amount:415000,place:'기존 확정 주소',paymentConfirmed:true,scheduleConfirmed:true};
 const saved=M.defaults({...r,communication:{booking:confirmed,reservation:{source:'manual'}}});
 assert.equal(saved.amount,415000);assert.equal(saved.place,'기존 확정 주소');assert.equal(saved.amountMode,'manual');assert.equal(saved.paymentConfirmed,true);
 const stale=M.defaults({...r,communication:{booking:{...b,amount:999,paymentConfirmed:true}}});
 assert.equal(stale.amount,420000);assert.equal(stale.paymentConfirmed,false);
});

test('all financial messages keep the calculated amount and address, link directions, and reject stale auto quotes',()=>{
 const r=sample(),b={...M.defaults(r),date:'2026-12-24',amount:470000,receivedAmount:90000,scheduleConfirmed:true,paymentConfirmed:true};
 assert.equal(M.validate('confirmed',b,r),'');
 for(const stage of ['receipt','confirmed','reminder']){const message=M.generate(r,stage,b);assert.match(message,/470,000원/);assert.match(message,/태종로 727/);assert.match(message,/https:\/\/link\.teamboatn\.com\/guide\.html\?v=1&t=yacht/);assert.doesNotMatch(message,/정문 진입 → 해안도로/);}
 assert.match(M.validate('receipt',{...b,amount:420000},r),/자동 금액/);
 assert.equal(M.validate('receipt',{...b,amount:415000,amountMode:'manual'},r),'');
});

test('location migration changes only confirmed settings, preserves catalog/history, and runs once',async()=>{
 const pg=new PGlite(),db={query:(sql,args)=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)};
 try{
  await migrate(db);await db.query('DELETE FROM moment_link.migrations WHERE version=5');
  const original={...initialSettings,yachtPlace:'기존 지점',yachtAddress:'기존 주소',mainNumber:'합성 연락처',push:true};
  await db.query("UPDATE moment_link.config SET data=$1,version=10 WHERE id='settings'",[JSON.stringify(original)]);
  const catalogs=(await db.query('SELECT * FROM moment_link.catalog_versions')).rows;
  await migrate(db);
  const current=(await db.query("SELECT data,version FROM moment_link.config WHERE id='settings'")).rows[0];
  assert.equal(current.version,11);assert.deepEqual(current.data,{...original,yachtPlace:P.yachtPlace,yachtAddress:P.yachtAddress});
  assert.deepEqual((await db.query('SELECT * FROM moment_link.catalog_versions')).rows,catalogs);
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...current.data,yachtPlace:'후속 운영자 수정'})]);
  await migrate(db);assert.equal((await db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data.yachtPlace,'후속 운영자 수정');
 }finally{await pg.close();}
});
