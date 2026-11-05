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
import '../messages.js';
const M=globalThis.MomentLinkMessages;
function sample(id='classic',packageId='light',options=[]){const p=catalog.find(p=>p.id===id),g=p.packages.find(g=>g.id===packageId)||p.packages[0];return {person:'합성 검수',phone:'01000000000',category:p.category,status:'new',preferences:[{date:'2099-11-01',time:'오후'}],place:'',snapshot:{product:p,package:g,options,price:{weekday:g.weekday,weekend:g.weekend}}};}
const booking={date:'2099-11-01',time:'13:30',amount:390000,place:'합성 검수 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''};
test('all four stages cover every category and preserve quoted facts',()=>{
 for(const id of ['classic','premium','signature','docked','visit','trunk','heli']){
  const r=sample(id);for(const stage of Object.keys(M.stages)){
   const message=M.generate(r,stage,booking);assert.ok(message.includes(r.person));assert.ok(message.includes(booking.date));assert.ok(message.length<5000);assert.doesNotMatch(message,/undefined|NaN|풍랑주의보시에도|행사/);
   if(stage==='receipt'){assert.match(message,/우리은행 1005-703-823528/);assert.match(message,/390,000원/);assert.match(message,/확인.*예약 확정/s);}
   if(stage==='confirmed')assert.match(message,/입금 확인이 완료/);
   if(stage==='thanks')assert.doesNotMatch(message,/입금 부탁/);
  }
 }
 assert.equal(M.defaults(sample()).time,'');assert.equal(M.defaults({...sample(),preferences:[{date:'2026-11-03',time:'오후'}]}).amount,390000);
 assert.equal(M.defaults(sample('trunk')).amount,219000);
 assert.match(M.generate(sample('trunk'),'reminder',booking),/해운대 사무실 방문/);
 assert.match(M.generate(sample('trunk','busan'),'reminder',booking),/부산 출장/);
 assert.match(M.generate(sample('heli'),'reminder',booking),/주간에만 운항/);
 assert.doesNotMatch(M.generate(sample('heli'),'confirmed',booking),/사진 약 30장|영상편지 준비/);
});
test('video instructions depend on included content or selected video option',()=>{
 assert.match(M.generate(sample(),'confirmed',booking),/2099-10-25/);
 assert.doesNotMatch(M.generate(sample('visit'),'confirmed',booking),/사진 약 30장/);
 assert.match(M.generate(sample('visit','all'),'confirmed',booking),/자료 전달·제작 일정/);
 assert.match(M.generate(sample('visit','light',[{id:'video-letter-usb',name:'영상편지 USB',amount:40000}]),'confirmed',booking),/영상편지 준비/);
 assert.doesNotMatch(M.generate(sample('docked'),'confirmed',booking),/사진 약 30장/);
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
  out=await req(path,'PUT',{version,booking,drafts:prepared.drafts,prepareStage:'confirmed'},auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.equal(out.data.item.communication.paymentDeadline,deadline);
  assert.equal(out.data.item.communication.drafts.receipt,prepared.drafts.receipt);
  const event={version,stage:'confirmed',kind:'composer_requested',eventId:randomUUID()};
  out=await req(path,'POST',event,auth);assert.equal(out.status,200);version=out.data.item.version;
  assert.deepEqual(out.data.item.communication.events.map(e=>e.kind),['composer_requested']);
  assert.equal((await req(path,'POST',event,auth)).data.item.communication.events.length,1);
  out=await req(path,'POST',{version,stage:'confirmed',kind:'manual_sent',eventId:randomUUID()},auth);assert.equal(out.status,200);version=out.data.item.version;
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
