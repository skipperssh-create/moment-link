import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate,bootstrapAdmin} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {initialSettings} from '../server/seed.mjs';
import {purgeExpired} from '../server/retention.mjs';
import catalog from '../catalog.confirmed.json' with {type:'json'};
import {ownershipFixture} from './ownership-fixture.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../messages.js';
const M=globalThis.MomentLinkMessages;
function sample(id='classic',packageId='light',options=[]){const p=catalog.find(p=>p.id===id),g=p.packages.find(g=>g.id===packageId)||p.packages[0];return {person:'합성 검수',phone:'01000000000',category:p.category,status:'new',preferences:[{date:'2099-11-01',time:'오후'}],place:'',snapshot:{product:p,package:g,options,price:{weekday:g.weekday,weekend:g.weekend}}};}
const booking={date:'2099-11-01',time:'13:30',amount:390000,place:'합성 검수 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''};
test('reservation messages include the customer phone and upgrade saved summaries without discarding edits',()=>{
 for(const id of ['classic','premium','signature','docked','visit','trunk','heli'])for(const stage of ['receipt','confirmed','reminder']){
  const r=sample(id),body=M.generate(r,stage,booking);
  assert.match(body,/^\[모먼트링크 · [^\n]+\n합성 검수님[^\n]*\n고객 연락처: 010-0000-0000\n\n이벤트 일정:/);
  assert.equal(body.match(/고객 연락처:/g).length,1);
  assert.match(decodeURIComponent(M.smsURI(r.phone,body,'Android').split('body=')[1]),/고객 연락처: 010-0000-0000/);
 }
 const r=sample('visit'),saved={receipt:'[모먼트링크 · 예약 접수]\n합성 검수님\n\n상품: 합성 상품\n금액: 390,000원\n별도 요청 유지',confirmed:'상품: 합성 상품\n고객 연락처: 010-0000-0001\n직접 작성한 안내'};
 const updated=M.prepareDrafts(r,saved);
 assert.equal(updated.receipt,saved.receipt.replace('합성 검수님','합성 검수님\n고객 연락처: 010-0000-0000'));
 assert.equal(updated.confirmed,saved.confirmed.replace('010-0000-0001','010-0000-0000'));
 assert.deepEqual(M.prepareDrafts(r,updated),updated);
 assert.match(M.generate({...r,phone:'011-000-0000'},'receipt',booking),/고객 연락처: 011-000-0000/);
 assert.doesNotMatch(M.generate({...r,phone:''},'receipt',booking),/고객 연락처:/);
});
test('message layout groups schedule, purchases and money while preserving saved content and SMS line breaks',()=>{
 const r=sample('visit','all'),b={...booking,baseAmount:390000,amount:450000,receivedAmount:90000,addOns:[{id:'bouquet',quantity:2,unitAmount:30000}],place:'합성 호텔\n상세 주소 101호',extra:'별도 고객 요청 보존'};
 for(const stage of ['receipt','confirmed','reminder']){
  const body=M.generate(r,stage,b);
  assert.ok(body.indexOf('이벤트 일정:')<body.indexOf('장소:'));
  assert.ok(body.indexOf('장소:')<body.indexOf('상품:'));
  assert.ok(body.indexOf('추가 구매:')<body.indexOf('총 예약금액:'));
  assert.match(body,/상세 주소 101호\n\n상품:/);
  assert.ok(body.includes('꽃다발 추가 · 2다발 · 60,000원\n\n총 예약금액: 450,000원\n'+'입금 확인액: 90,000원\n'+(stage==='receipt'?'남은 입금액: ':'남은 잔금: ')+'360,000원'));
  assert.ok(body.includes(b.extra));assert.equal(M.prepareDrafts(r,{[stage]:body})[stage],body);
  for(const ua of ['Android','iPhone'])assert.equal(decodeURIComponent(M.smsURI(r.phone,body,ua).split('body=')[1]),body);
 }
 const intro='[모먼트링크 · 예약 접수]\n합성 검수님, 직접 작성한 인사입니다.',tail='입금 안내\n직접 작성한 계좌 안내\n\n취소·환불 안내\n직접 작성한 조건\n\n별도 고객 요청 보존';
 const old=intro+'\n\n고객 연락처: 010-0000-0001\n상품: 상담 시 정한 상품\n추가 선택: USB\n추가 구매:\n꽃다발 추가 · 2다발 · 60,000원\n이벤트 일정: 2099-11-01 13:30\n금액: 450,000원\n입금 확인액: 90,000원\n남은 잔금: 360,000원\n장소: 합성 호텔\n상세 주소 101호\n\n'+tail;
 const updated=M.prepareDrafts(r,{receipt:old.replace(/\n/g,'\r\n')}).receipt;
 assert.ok(updated.startsWith(intro+'\n고객 연락처: 010-0000-0000\n\n이벤트 일정:'));
 assert.match(updated,/장소: 합성 호텔\n상세 주소 101호\n\n상품: 상담 시 정한 상품/);
 assert.ok(updated.endsWith(tail));assert.equal(M.prepareDrafts(r,{receipt:updated}).receipt,updated);
});
test('full payment uses the full total, preserves schedule approval and rejects unknown or inconsistent totals',()=>{
 const b={...booking,amount:420000,baseAmount:390000,addOns:[{id:'bouquet',quantity:1,unitAmount:30000}],receivedAmount:90000,scheduleConfirmed:false,paymentConfirmed:false};
 assert.equal(M.applyFullPayment(b),'');assert.equal(b.receivedAmount,420000);assert.equal(b.paymentConfirmed,true);assert.equal(b.scheduleConfirmed,false);assert.equal(M.paymentState(b).balance,0);
 assert.equal(M.applyFullPayment(b),'');assert.equal(b.receivedAmount,420000);
 for(const amount of [null,undefined,NaN,-1,1.5,100000001]){const bad={amount,receivedAmount:90000,paymentConfirmed:false},before={...bad};assert.ok(M.applyFullPayment(bad));assert.deepEqual(bad,before);}
 const zero={amount:0,baseAmount:0,addOns:[]};assert.equal(M.applyFullPayment(zero),'');assert.equal(zero.receivedAmount,0);
 const inconsistent={...b,amount:390000};assert.ok(M.applyFullPayment(inconsistent));assert.equal(inconsistent.receivedAmount,420000);
});
test('full-payment draft and confirmation persist the total receipt, zero balance and customer contact',async()=>{
 const f=await ownershipFixture();try{
  let row=await f.add({owner:f.staff['owner-admin'].id,status:'consulting'});const path='admin/consultations/'+row.id;
  const b={...booking,amountMode:'manual',baseAmount:booking.amount,addOns:[],receivedAmount:null,paymentConfirmed:false};
  assert.equal(M.applyFullPayment(b),'');
  const drafts={receipt:M.generate(row,'receipt',b),confirmed:M.generate(row,'confirmed',b)};
  let out=await f.request(path+'/communications','owner-admin','PUT',{version:row.version,booking:b,drafts});
  assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.status,'consulting');
  row=(await f.request(path)).data.item;assert.equal(row.communication.booking.receivedAmount,390000);
  assert.match(row.communication.drafts.receipt,/고객 연락처: 010-0000-0000/);
  out=await f.request(path+'/reservation','owner-admin','POST',{version:row.version,booking:row.communication.booking,drafts:row.communication.drafts,approved:true});
  assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.status,'confirmed');
  row=(await f.request(path)).data.item;assert.equal(M.paymentState(row.communication.booking).balance,0);
  assert.match(row.communication.drafts.confirmed,/입금 확인액: 390,000원/);assert.match(row.communication.drafts.confirmed,/남은 잔금: 0원/);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});
test('all four stages cover every category and preserve quoted facts',()=>{
 for(const id of ['classic','premium','signature','docked','visit','trunk','heli']){
  const r=sample(id);for(const stage of ['receipt','confirmed','reminder','thanks']){
   const message=M.generate(r,stage,booking);assert.ok(message.includes(r.person));assert.ok(message.includes(booking.date));assert.ok(message.length<5000);assert.doesNotMatch(message,/undefined|NaN|풍랑주의보시에도|행사/);
   if(stage==='receipt'){assert.match(message,/우리은행 1005-703-823528/);assert.match(message,/390,000원/);assert.match(message,/확인.*예약(?:이)? 확정/s);}
   if(stage==='confirmed')assert.match(message,/입금 확인이 완료/);
   if(stage==='thanks')assert.doesNotMatch(message,/입금 부탁/);
  }
 }
 assert.equal(M.defaults(sample()).time,'');assert.equal(M.defaults({...sample(),preferences:[{date:'2026-11-03',time:'오후'}]}).amount,390000);
 assert.equal(M.defaults(sample('trunk')).amount,219000);
 assert.match(M.generate(sample('trunk'),'reminder',booking),/guide\.html\?v=1&t=trunk/);
 assert.match(M.generate(sample('trunk','busan'),'reminder',booking),/&mode=visit/);
 assert.match(M.generate(sample('heli'),'reminder',booking),/guide\.html\?v=1&t=heli/);
 assert.doesNotMatch(M.generate(sample('heli'),'confirmed',booking),/사진: 25~30장|영상편지용 사진과 편지/);
});
test('video instructions depend on included content or selected video option',()=>{
 assert.match(M.generate(sample(),'confirmed',booking),/2099-10-25/);
 assert.doesNotMatch(M.generate(sample('visit'),'confirmed',booking),/사진: 25~30장/);
 assert.match(M.generate(sample('visit','all'),'confirmed',booking),/영상자료: 제출 기한/);
 assert.match(M.generate(sample('visit','light',[{id:'video-letter-usb',name:'영상편지 USB',amount:40000}]),'confirmed',booking),/&video=1/);
 assert.doesNotMatch(M.generate(sample('docked'),'confirmed',booking),/사진: 25~30장/);
});
test('linked video preparation keeps unrelated addresses, notes and previously saved text intact',()=>{
 const now=Date.parse('2026-11-12T00:00:00Z');
 for(const r of [sample(),sample('classic','all'),sample('visit','all'),sample('visit','light',[{id:'video-letter-usb',name:'영상편지 USB',amount:40000}])]){
  for(const stage of ['receipt','confirmed']){
   const body=M.generate(r,stage,booking,undefined,now);
   assert.match(body,/영상자료: 제출 기한 2099-10-25/);assert.match(body,/&video=1/);
   assert.doesNotMatch(body,/사진 순서|파일명 & 메일 제목|25~30장|boatn@naver/);
  }
 }
 const saved={confirmed:'영상편지 준비\n사진 약 30장과 편지글 약 300자를 seolvidmoa@gmail.com으로 보내 주세요.\n메일 제목: 이벤트 날짜 / 시간 / 성함\n자료 전달·제작 일정은 담당자와 확인해 주세요.\n담당 메모 유지\n\n다른 업무 주소: seolvidmoa@gmail.com\n고객: customer@example.com',thanks:'다른 주소 xboatn@naver.com / boatn@naver.com.example'};
 const prepared=M.prepareDrafts(sample(),saved,undefined,booking,now);
 assert.match(prepared.confirmed,/guide\.html\?v=1&t=yacht&video=1/);
 assert.match(prepared.confirmed,/다른 업무 주소: seolvidmoa@gmail\.com/);assert.match(prepared.confirmed,/담당 메모 유지/);assert.match(prepared.confirmed,/고객: customer@example\.com/);
 assert.equal(prepared.thanks,saved.thanks);assert.match(saved.confirmed,/사진 약 30장/);assert.deepEqual(M.prepareDrafts(sample(),prepared,undefined,booking,now),prepared);
 const near=M.prepareDrafts(sample(),prepared,undefined,{...booking,date:'2026-11-13'},now).confirmed;
 assert.match(near,/7일 이내 일정 · 발송 전 담당자와 일정·제작 가능 여부 협의/);assert.doesNotMatch(near,/제출 기한:/);assert.equal(near.match(/guide\.html/g).length,1);
});

test('unsafe or incomplete preparation cannot open a confirmation composer',()=>{
 assert.match(M.validate('confirmed',{...booking,paymentConfirmed:false},sample()),/입금/);
 assert.match(M.validate('reminder',{...booking,place:''},sample()),/장소/);
 assert.match(M.validate('receipt',{...booking,amount:null},sample()),/금액/);
 assert.match(M.validate('receipt',{...booking,date:'2099-02-31'},sample()),/날짜/);
 assert.match(M.validate('thanks',booking,{...sample(),status:'cancelled'}),/취소/);
 assert.equal(M.validate('receipt',{...booking,paymentConfirmed:false},sample()),'');
});
test('SMS URI encodes Korean, newlines and reserved characters for both mobile families',()=>{
 const body='모먼트링크\nA&B + #? 30,000원';
 for(const [ua,platform,touch,sep] of [['Android','',0,'?'],['iPhone','',0,'&'],['Safari','MacIntel',5,'&']]){
  const uri=M.smsURI('01000000000',body,ua,platform,touch);assert.ok(uri.startsWith('sms:01000000000'+sep+'body='));assert.equal(decodeURIComponent(uri.split('body=')[1]),body);
 }
 assert.throws(()=>M.smsURI('01000000000?body=evil',body));
});

test('booking intent wording is ready without payment or schedule data and uses the existing mobile SMS links',()=>{
 const body=M.reservationIntent();assert.match(body,/모먼트링크/);assert.match(body,/예약을 원하지 않으시면 답장으로 알려 주세요/);assert.match(body,/회신해 주시면 이후 예약 관련 리마인드 문자가 발송되지 않도록 처리하겠습니다/);assert.doesNotMatch(body,/입금|확정되었습니다|undefined|NaN/);
 for(const [ua,platform,touch,separator] of [['Android','',0,'?'],['iPhone','',0,'&'],['Safari','MacIntel',5,'&']]){const uri=M.smsURI('01000000000',body,ua,platform,touch);assert.ok(uri.startsWith('sms:01000000000'+separator+'body='));assert.equal(decodeURIComponent(uri.split('body=')[1]),body);}
});

test('intent is a message template with no schedule or payment prerequisite',()=>{
 for(const status of ['new','initial_unreachable','consulting','no_response','awaiting_payment','hold','confirmed','cancelled','closed']){
  const row={...sample(),status};assert.equal(M.validate('intent',{},row),'');assert.equal(M.generate(row,'intent',{}),M.reservationIntent());
 }
 assert.match(M.validate('intent',{}, {...sample(),phone:'invalid'}),/번호/);
});

test('payment reminder uses the status-change deadline and is blocked before expiry or outside awaiting payment',()=>{
 const r={...sample(),status:'awaiting_payment',awaiting_payment_at:new Date(Date.now()-3*3600000).toISOString()};
 assert.equal(M.validate('payment_reminder',{},r),'');assert.match(M.generate(r,'payment_reminder',{}),/입금 확인 기한\(2시간\)이 지났습니다/);assert.match(M.generate(r,'payment_reminder',{}),/일정 가능 여부를 다시 확인/);assert.doesNotMatch(M.generate(r,'payment_reminder',{}),/예약이 취소|undefined|NaN/);
 assert.match(M.validate('payment_reminder',{}, {...r,awaiting_payment_at:new Date().toISOString()}),/아직/);
 assert.match(M.validate('payment_reminder',{}, {...r,status:'confirmed'}),/입금대기 상태/);
 assert.match(M.validate('payment_reminder',{}, {...r,awaiting_payment_at:null}),/시작 시각/);
});

test('overdue reminder only saves its template and records manual actions without dispatching existing OPS jobs',async()=>{
 const origin='https://test.moment-link.invalid',f=await ownershipFixture(origin);
 try{
  const app=createApp({db:f.db,env:{APP_ORIGIN:origin,OPS_WRITES_ENABLED:'true'}});
  const send=async(path,method,data,who='counselor-a')=>{const response=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...f.sessions[who]},body:JSON.stringify(data)}));return {status:response.status,data:await response.json()};};
  for(const state of ['conflict','pending']){
   const start=new Date(Date.now()-3*3600000).toISOString(),row=await f.add({owner:f.staff['counselor-a'].id,status:'awaiting_payment',communication:{booking,drafts:{receipt:'기존 안내'},paymentDeadline:'2099-01-01T00:00:00Z'}}),path='admin/consultations/'+row.id+'/communications';
   await f.db.query("INSERT INTO moment_link.audit_logs(id,actor_id,action,entity_id,detail,created_at) VALUES($1,$2,'consultation.updated',$3,$4,$5)",[randomUUID(),f.staff['counselor-a'].id,row.id,JSON.stringify({from:'consulting',to:'awaiting_payment'}),start]);
   await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,$4,2,'OPS_RESOURCE_CONFLICT',$5,$6)",[randomUUID(),row.id,'moment-link:'+row.id,state,f.staff['owner-admin'].id,JSON.stringify({operation:'reschedule'})]);
   const before=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[row.id])).rows;
   const payload={version:row.version,prepareStage:'payment_reminder',drafts:{payment_reminder:'합성 입금 리마인드'}};
   assert.equal((await send(path,'PUT',payload,'counselor-b')).status,403);
   let out=await send(path,'PUT',payload);assert.equal(out.status,200,JSON.stringify(out.data));assert.deepEqual(out.data.item.communication.booking,booking);assert.equal(out.data.item.communication.paymentDeadline,'2099-01-01T00:00:00Z');assert.equal(Date.parse(out.data.item.communication.paymentReminderFor),Date.parse(start));assert.equal(out.data.item.status,'awaiting_payment');
   const event={version:out.data.item.version,stage:'payment_reminder',kind:'composer_requested',eventId:randomUUID()};
   out=await send(path,'POST',event);assert.equal(out.status,200);assert.equal(out.data.item.communication.events[0].kind,'composer_requested');
   assert.equal((await send(path,'POST',event)).data.item.communication.events.length,1);
   out=await send(path,'POST',{...event,version:out.data.item.version,kind:'manual_sent',eventId:randomUUID()});assert.equal(out.status,200);assert.ok(MomentLinkOwnership.paymentWait(out.data.item).lastSentAt);
   assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[row.id])).rows,before);
   await f.db.query("INSERT INTO moment_link.audit_logs(id,actor_id,action,entity_id,detail,created_at) VALUES($1,$2,'consultation.updated',$3,$4,now()-interval '1 hour')",[randomUUID(),f.staff['counselor-a'].id,row.id,JSON.stringify({from:'awaiting_payment',to:'hold'})]);
   await f.db.query("INSERT INTO moment_link.audit_logs(id,actor_id,action,entity_id,detail) VALUES($1,$2,'consultation.updated',$3,$4)",[randomUUID(),f.staff['counselor-a'].id,row.id,JSON.stringify({from:'hold',to:'awaiting_payment'})]);
   assert.equal((await send(path,'POST',{...event,version:out.data.item.version,eventId:randomUUID()})).data.error,'PAYMENT_WAIT_CHANGED');
  }
  const row=await f.add({owner:f.staff['counselor-a'].id,status:'awaiting_payment'}),start=new Date(Date.now()-3600000).toISOString();
  await f.db.query("INSERT INTO moment_link.audit_logs(id,actor_id,action,entity_id,detail,created_at) VALUES($1,$2,'consultation.updated',$3,$4,$5)",[randomUUID(),f.staff['counselor-a'].id,row.id,JSON.stringify({from:'consulting',to:'awaiting_payment'}),start]);
  const path='admin/consultations/'+row.id+'/communications';let out=await send(path,'PUT',{version:row.version,booking,drafts:{receipt:'합성 입금 안내'},prepareStage:'receipt'});assert.equal(out.status,200,JSON.stringify(out.data));const deadline=out.data.item.communication.paymentDeadline;
  assert.equal(Date.parse(deadline),Date.parse(start)+7200000);assert.match(out.data.item.communication.drafts.receipt,/입금 기한:/);
  out=await send(path,'PUT',{version:out.data.item.version,booking,drafts:out.data.item.communication.drafts,prepareStage:'receipt'});assert.equal(out.data.item.communication.paymentDeadline,deadline);
  assert.equal((await send(path,'PUT',{version:out.data.item.version,prepareStage:'payment_reminder',drafts:{payment_reminder:'합성 안내'}})).status,400);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});

test('intent preparation and logs preserve booking data, permissions and existing OPS conflicts',async()=>{
 const f=await ownershipFixture();
 try{
  for(const status of ['initial_unreachable','no_response','confirmed','cancelled']){
   const communication=status==='initial_unreachable'?{}:{booking,reservation:{source:'manual'},paymentDeadline:'2099-11-01T00:00:00Z',drafts:{receipt:'기존 접수 안내'},events:[]};
   const row=await f.add({owner:f.staff['counselor-a'].id,status,communication}),path='admin/consultations/'+row.id+'/communications';
   const payload={version:row.version,prepareStage:'intent',drafts:{intent:M.reservationIntent()+'\n합성 추가 안내'}};
   await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,attempts,error_code,approved_by,booking) VALUES($1,$2,'boatn',$3,'conflict',2,'OPS_RESOURCE_CONFLICT',$4,$5)",[randomUUID(),row.id,'moment-link:'+row.id,f.staff['owner-admin'].id,JSON.stringify({operation:'reschedule'})]);
   const jobsBefore=(await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[row.id])).rows;
   assert.equal((await f.request(path,null,'PUT',payload)).status,401);
   assert.equal((await f.request(path,'counselor-b','PUT',payload)).status,403);
   assert.equal((await f.request(path,'counselor-a','PUT',{...payload,booking})).status,400);
   assert.equal((await f.request(path,'counselor-a','PUT',{...payload,drafts:{intent:'  '}})).status,400);
   let out=await f.request(path,'counselor-a','PUT',payload);assert.equal(out.status,200,JSON.stringify(out.data));
   assert.equal(out.data.item.status,status);assert.deepEqual(out.data.item.communication,{...communication,drafts:{...communication.drafts,...payload.drafts}});
   assert.equal((await f.request(path,'counselor-a','PUT',payload)).status,409);
   const event={version:out.data.item.version,stage:'intent',kind:'composer_requested',eventId:randomUUID()};
   out=await f.request(path,'counselor-a','POST',event);assert.equal(out.status,200,JSON.stringify(out.data));assert.equal(out.data.item.communication.events.length,1);
   assert.equal((await f.request(path,'counselor-a','POST',event)).data.item.communication.events.length,1);
   out=await f.request(path,'counselor-a','POST',{...event,version:out.data.item.version,kind:'manual_sent',eventId:randomUUID()});assert.equal(out.status,200);assert.equal(out.data.item.communication.events.at(-1).stage,'intent');
   assert.deepEqual(out.data.item.communication.booking,communication.booking);assert.deepEqual(out.data.item.communication.reservation,communication.reservation);assert.equal(out.data.item.status,status);
   assert.deepEqual((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[row.id])).rows,jobsBefore);
  }
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
 }finally{await f.pg.close();}
});

test('existing composer saves intent alone and preserves unsaved booking edits and custom text',async()=>{
 const listeners={},elements={},calls=[];let saved,copied='';
 const element=()=>({innerHTML:'',outerHTML:'',value:'',contains:()=>true,querySelector:()=>({textContent:''}),replaceWith(){},focus(){},scrollIntoView(){}});
 const document={getElementById:id=>elements[id]??=element(),addEventListener:(name,fn)=>listeners[name]=fn};
 const ctx=vm.createContext({document,navigator:{userAgent:'Android',clipboard:{writeText:async body=>copied=body}},console,Intl,Date,URL,crypto:{randomUUID}});ctx.window=ctx;ctx.globalThis=ctx;
 ctx.MomentLinkOps={eligible:()=>false,fields:()=>'',validate:()=>''};
 for(const file of ['time-picker.js','pricing.js','booking-addons.js','messages.js','message-ui.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
 const row={...sample('visit'),id:'synthetic-intent',version:1,status:'no_response',communication:{}};
 const api=async(path,method,data)=>{if(path==='catalog')return {version:1,products:catalog};calls.push({path,method,data});saved={...row,version:2,communication:{drafts:{intent:data.drafts.intent}}};return {item:saved};};
 const composer=ctx.MomentLinkComposer;composer.init(row,api,()=>{});composer.openStage('intent');
 const click=action=>listeners.click({target:{closest:()=>({dataset:{message:action}})},preventDefault(){}});
 const custom='합성 의사 확인 문구';listeners.input({target:{id:'messageBody',value:custom}});
 listeners.input({target:{dataset:{messageField:'extra'},value:'저장하지 않은 예약 안내'}});
 assert.match(composer.html(),new RegExp(custom));await click('save');
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].data)),{version:1,prepareStage:'intent',drafts:{intent:custom}});
 assert.equal(composer.isDirty(),true);assert.match(composer.html(),/저장하지 않은 예약 안내/);assert.match(composer.html(),/data-message="sms"/);
 await click('copy');assert.equal(copied,custom);
 composer.clear();composer.init(saved,api,()=>{});composer.openStage('intent');assert.match(composer.html(),new RegExp(custom));assert.equal(composer.isDirty(),false);
});
test('payment deadline is two hours after preparation and uses Korea time across date boundaries',()=>{
 for(const [prepared,expected] of [
  ['2026-11-01T13:05:00Z','2026년 11월 2일(월) 오전 12:05'],
  ['2026-12-31T14:40:00Z','2027년 1월 1일(금) 오전 1:40'],
  ['2028-02-28T14:10:00Z','2028년 2월 29일(화) 오전 1:10'],
  ['2026-11-01T01:00:00Z','2026년 11월 1일(일) 오후 12:00']
 ]){
  const deadline=M.paymentDeadlineFrom(prepared);
  assert.equal(Date.parse(deadline)-Date.parse(prepared),7200000);
  assert.equal(M.paymentDeadlineLabel(deadline),expected);
  const message=M.generate(sample(),'receipt',booking,deadline);
  assert.match(message,/입금 기한:/);assert.ok(message.includes(expected+'까지 입금 부탁드립니다.'));
  assert.doesNotMatch(message,/2시간 이내|행사/);
  assert.equal(M.paymentDeadlineError(sample(),'receipt',deadline,prepared),'');
  assert.match(M.paymentDeadlineError(sample(),'receipt',deadline,deadline),/다시/);
 }
 assert.equal(M.paymentDeadlineLabel('bad'), '');
 assert.match(M.paymentDeadlineError(sample(),'receipt',undefined),/다시/);
 assert.equal(M.paymentDeadlineError(sample(),'confirmed',undefined),'');
 assert.equal(M.paymentDeadlineError(sample('visit'),'receipt',undefined),'');
 assert.doesNotMatch(M.generate(sample('visit'),'receipt',booking),/입금 기한:/);
});
test('refreshing receipt deadlines preserves custom text and migrates old event wording',()=>{
 const legacy={receipt:'고객별 안내\n이 안내를 받은 후 2시간 이내 입금 부탁드립니다. 입금 후 회신 부탁드립니다.\n행사 날짜 / 행사 7일 전 / 행사까지 / 행사장',thanks:'직접 작성한 행사 감사 인사'};
 const first=M.prepareDrafts(sample(),legacy,M.paymentDeadlineFrom('2026-11-01T01:00:00Z'));
 const second=M.prepareDrafts(sample(),first,M.paymentDeadlineFrom('2026-11-01T02:00:00Z'));
 assert.match(second.receipt,/오후 1:00까지/);assert.doesNotMatch(second.receipt,/오후 12:00|2시간 이내|행사/);
 assert.equal(second.receipt.match(/입금 기한:/g).length,1);assert.match(second.receipt,/고객별 안내/);assert.match(second.receipt,/입금 후 회신 부탁드립니다/);assert.match(second.receipt,/이벤트 장소/);
 assert.equal(second.thanks,'직접 작성한 이벤트 감사 인사');assert.match(legacy.receipt,/2시간 이내/);
 assert.match(M.prepareDrafts(sample(),{receipt:'직접 작성한 문구'},M.paymentDeadlineFrom())["receipt"],/^직접 작성한 문구\n\n입금 기한:/);
});
test('private guidance persists with version checks, accurate manual logs, expiry and no sends',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://test.moment-link.invalid';
 try{
  await migrate(db);await migrate(db);
  const secret=randomUUID(),adminId=randomUUID(),otherId=randomUUID();
  for(const [id,name,role]of [[adminId,'message-admin','admin'],[otherId,'message-staff','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,name,await passwordHash(secret),role]);
  await bootstrapAdmin(db,await passwordHash(randomUUID()));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM moment_link.admin_users WHERE username='admin'")).rows[0].n,0);
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...initialSettings,accepting:true,privacyController:'합성',privacyContact:'검수',privacyText:'합성 데이터 전용',retentionDays:1,consentVersion:'message-test'})]);
  const app=createApp({db,env:{APP_ORIGIN:origin}});
  const req=async(path,method='GET',data,auth={})=>{const response=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:response.status,data:await response.json(),headers:response.headers};};
  const login=async name=>{const out=await req('auth/login','POST',{username:name,password:secret});assert.equal(out.status,200);return {Cookie:out.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':out.data.csrf};};
  const auth=await login('message-admin'),staff=await login('message-staff');
  const posted=await req('consultations','POST',{catalogVersion:1,productId:'classic',packageId:'light',category:'yacht',person:'합성 검수',phone:'01000000000',preferences:[{date:'2099-11-01',time:'오후'}],place:'',notes:'SYNTHETIC ONLY',consent:true,consentVersion:'message-test'},{'Idempotency-Key':randomUUID()});assert.equal(posted.status,201);
  const r=(await db.query('SELECT * FROM moment_link.consultations')).rows[0],path='admin/consultations/'+r.id+'/communications';
  const drafts={receipt:M.generate(r,'receipt',booking),confirmed:M.generate(r,'confirmed',booking)};
  const save={version:r.version,booking,drafts};
  assert.equal((await req(path,'PUT',save)).status,401);
  assert.equal((await req(path,'PUT',save,staff)).status,403);
  assert.equal((await req(path,'PUT',save,{...auth,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await req(path,'PUT',{...save,booking:{...booking,amount:-1}},auth)).status,400);
  assert.equal((await req(path,'PUT',{...save,booking:{...booking,date:'2026-11-03',amount:440000,amountMode:'auto'}},auth)).status,400);
  assert.equal((await req(path,'PUT',{...save,booking:{...booking,amountMode:'untrusted'}},auth)).status,400);
  let out=await req(path,'PUT',save,auth);assert.equal(out.status,200,JSON.stringify(out.data));let version=out.data.item.version;
  assert.equal(out.data.item.idempotency_hash,undefined);assert.deepEqual(out.data.item.snapshot,r.snapshot);
  assert.equal((await req(path,'PUT',save,auth)).status,409);
  assert.deepEqual((await req('admin/consultations/'+r.id,'GET',undefined,auth)).data.item.communication.booking,booking);
  const before=Date.now(),customDrafts={...drafts,receipt:'고객별 추가 안내\n이 안내를 받은 후 2시간 이내 입금 부탁드립니다.\n행사 날짜를 확인해 주세요.'};
  out=await req(path,'PUT',{version,booking,drafts:customDrafts,prepareStage:'receipt'},auth);assert.equal(out.status,200);version=out.data.item.version;
  const prepared=out.data.item.communication,deadline=prepared.paymentDeadline;
  assert.ok(Date.parse(deadline)>=before+7200000&&Date.parse(deadline)<=Date.now()+7200000);
  assert.match(prepared.drafts.receipt,/고객별 추가 안내/);assert.doesNotMatch(prepared.drafts.receipt,/2시간 이내|행사/);
  assert.ok(prepared.drafts.receipt.includes(M.paymentDeadlineLabel(deadline)));
  assert.deepEqual((await req('admin/consultations/'+r.id,'GET',undefined,auth)).data.item.communication,prepared);
  // A yacht confirmation now requires the confirmed, linked OPS invitation.
  // The other private stages retain their existing no-dispatch behavior.
  assert.equal((await req(path,'PUT',{version,booking,drafts:prepared.drafts,prepareStage:'confirmed'},auth)).status,409);
  out=await req(path,'PUT',{version,booking,drafts:{...prepared.drafts,reminder:M.generate(r,'reminder',booking)},prepareStage:'reminder'},auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.equal(out.data.item.communication.paymentDeadline,deadline);
  assert.equal(out.data.item.communication.drafts.receipt,prepared.drafts.receipt);
  const event={version,stage:'reminder',kind:'composer_requested',eventId:randomUUID()};
  out=await req(path,'POST',event,auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.deepEqual(out.data.item.communication.events.map(e=>e.kind),['composer_requested']);
  assert.equal((await req(path,'POST',event,auth)).data.item.communication.events.length,1);
  out=await req(path,'POST',{version,stage:'reminder',kind:'manual_sent',eventId:randomUUID()},auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.equal(out.data.item.communication.events.at(-1).kind,'manual_sent');assert.equal(out.data.item.status,'new');
  out=await req(path,'PUT',{version,booking:{...booking,paymentConfirmed:false},drafts},auth);version=out.data.item.version;
  assert.equal((await req(path,'POST',{version,stage:'confirmed',kind:'composer_requested',eventId:randomUUID()},auth)).status,400);
  const expired=new Date(Date.now()-60000).toISOString();
  await db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{paymentDeadline}',$1::jsonb) WHERE id=$2",[JSON.stringify(expired),r.id]);
  assert.equal((await req(path,'POST',{version,stage:'receipt',kind:'composer_requested',eventId:randomUUID()},auth)).data.error,'PAYMENT_DEADLINE_EXPIRED');
  out=await req(path,'POST',{version,stage:'receipt',kind:'manual_sent',eventId:randomUUID()},auth);assert.equal(out.status,200);version=out.data.item.version;
  const events=out.data.item.communication.events;
  out=await req(path,'PUT',{version,booking,drafts:customDrafts,prepareStage:'receipt'},auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.ok(Date.parse(out.data.item.communication.paymentDeadline)>Date.now());assert.deepEqual(out.data.item.communication.events,events);
  await db.query('UPDATE moment_link.consultations SET assignee=$1 WHERE id=$2',[otherId,r.id]);
  assert.equal((await req(path,'PUT',{version,booking,drafts},staff)).status,200);
  for(const table of ['outbox','integration_jobs'])assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.'+table)).rows[0].n,0);
  assert.ok(!(await db.query("SELECT detail FROM moment_link.audit_logs WHERE action LIKE 'communication.%'")).rows.some(x=>JSON.stringify(x.detail).includes('합성 검수')));
  await db.query('UPDATE moment_link.consultations SET expires_at=now() WHERE id=$1',[r.id]);
  assert.equal((await req(path,'PUT',{version,booking,drafts},auth)).status,404);await purgeExpired(db);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.consultations WHERE id=$1',[r.id])).rows[0].n,0);
 }finally{await pg.close();}
});


test('video material deadlines use Korean dates, include seven-day reservations and preserve staff notes',()=>{
 const now=Date.parse('2026-11-12T15:00:00Z'); // November 13 in Korea.
 for(const r of [sample(),sample('visit','all'),sample('visit','light',[{id:'video-letter',name:'영상편지',amount:30000}])]){
  for(const stage of ['receipt','confirmed']){
   const far=M.generate(r,stage,{...booking,date:'2026-11-21'},undefined,now);
   assert.match(far,/영상자료: 제출 기한 2026-11-14/);assert.match(far,/&video=1/);
   for(const date of ['2026-11-20','2026-11-19','2026-11-13']){
    const near=M.generate(r,stage,{...booking,date},undefined,now);
    assert.match(near,/7일 이내 일정 · 발송 전 담당자와 일정·제작 가능 여부 협의/);assert.doesNotMatch(near,/제출 기한:/);
   }
  }
 }
 const r=sample('visit','all'),b={...booking,date:'2026-11-14'},legacy={confirmed:'영상편지 준비\n사진 약 30장과 편지글 약 300자를 seolvidmoa@gmail.com으로 보내 주세요.\n메일 제목: 이벤트 날짜 / 시간 / 성함\n자료 전달·제작 일정은 담당자와 확인해 주세요.\n담당자 협의 메모 유지'};
 const updated=M.prepareDrafts(r,legacy,undefined,b,now);
 assert.match(updated.confirmed,/&video=1/);assert.match(updated.confirmed,/담당자 협의 메모 유지/);assert.doesNotMatch(updated.confirmed,/제출 기한:/);
 assert.deepEqual(M.prepareDrafts(r,updated,undefined,b,now),updated);assert.doesNotMatch(legacy.confirmed,/수정은 오타/);
 assert.doesNotMatch(M.generate(sample('visit','light'),'confirmed',b,undefined,now),/영상편지용 사진과 편지|오타에 한해/);
});
