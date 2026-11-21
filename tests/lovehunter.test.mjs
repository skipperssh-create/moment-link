import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import '../lovehunter.js';
import {ownershipFixture} from './ownership-fixture.mjs';
import {purgeExpired} from '../server/retention.mjs';
const L=globalThis.MomentLinkLoveHunter;
const input=(overrides={})=>({requestId:randomUUID(),phone:'01000000001',person:'',memo:'010-0000-0001',kind:'general',category:'undecided',receivedDate:'2026-10-31',...overrides});
test('paste parser extracts one normalized mobile without guessing dates or sequence numbers',()=>{
 for(const value of ['01000000001','29. 11월 24일 010-0000-0001 상담입니다.','30. 010 0000 0001 요트파티 상담입니다.','+82 10-0000-0001']){
  assert.equal(L.parse(value).phone,'01000000001');assert.equal(L.parse(value).person,'');
 }
 const d=L.parse('출장16. 01000000001 상담입니다.');assert.equal(d.kind,'visit');assert.equal(d.amount,40000);assert.equal(d.category,'visit');
 assert.equal(L.parse('29. 01000000001').amount,50000);
});
test('paste parser keeps labeled name and staff details, handles ambiguous numbers',()=>{
 const raw='32. 신청자: 합성고객\n휴대폰: 010-0000-0001\n이메일: synthetic@example.invalid\n신청이벤트: 요트프로포즈\n내용 작성: 부산 일정 상담';
 const d=L.parse(raw);assert.equal(d.person,'합성고객');assert.equal(d.category,'yacht');assert.equal(d.memo,raw);
 assert.equal(L.parse('홍길동 010-0000-0001').person,'홍길동');
 assert.equal(L.parse('홍길동\n010-0000-0001').person,'홍길동');
 const multi=L.parse('01000000001\n01000000002');assert.equal(multi.phone,'');assert.equal(multi.phones.length,2);
 assert.equal(L.parse('01000000001\n010-0000-0001').phone,'01000000001');
 assert.equal(L.parse('2026-11-21 18:00').phones.length,0);
});
test('authenticated intake, lifetime accounting, private notes and existing booking isolation',async t=>{
 const f=await ownershipFixture();t.after(()=>f.pg.close());
 await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','365') WHERE id='settings'");
 const post=(d,user='counselor-a')=>f.request('admin/lovehunter/consultations',user,'POST',d);
 const existing=await f.add({owner:f.staff['counselor-b'].id,status:'confirmed'});
 const before=JSON.stringify(existing);
 let first,id;
 await t.test('phone-only creates assigned consulting lead, no invented booking, no external jobs',async()=>{
  const d=input({memo:'010-0000-0001\nSTAFF-SECRET-only <script>alert(1)</script>'});first=d;
  const out=await post(d);assert.equal(out.status,201,JSON.stringify(out.data));id=out.data.item.id;
  assert.equal(out.data.charged,true);assert.equal(out.data.amount,50000);assert.equal(out.data.item.person,'고객');
  assert.equal(out.data.item.status,'consulting');assert.equal(out.data.item.assignee,f.staff['counselor-a'].id);
  assert.equal(out.data.item.product_id,'recommend');assert.equal(out.data.item.notes,'');assert.equal(out.data.item.communication.booking,undefined);
  const detail=await f.request('admin/consultations/'+id,'counselor-a');
  assert.match(detail.data.notes[0].body,/STAFF-SECRET-only/);assert.doesNotMatch(JSON.stringify(detail.data.item),/STAFF-SECRET-only/);
  assert.match(MomentLinkMessages.validate('confirmed',{},{...out.data.item}),/상품/);
  for(const table of ['integration_jobs','outbox','event_calendar_jobs','seollem_booking_jobs']){
   const exists=await f.db.query("SELECT to_regclass($1) AS table_name",['moment_link.'+table]);
   if(exists.rows[0].table_name)assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.'+table)).rows[0].n,0);
  }
 });
 await t.test('same request replays; same phone across month, type and counselor creates no duplicate fee or consultation',async()=>{
  const replay=await post(first);assert.equal(replay.status,200);assert.equal(replay.data.item.id,id);
  const dup=await post(input({phone:'010-0000-0001',kind:'visit',category:'visit',receivedDate:'2026-11-01'}),'counselor-b');
  assert.equal(dup.data.duplicate,true);assert.equal(dup.data.consultationId,id);assert.equal(dup.data.amount,50000);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.lovehunter_referrals')).rows[0].n,1);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.consultations')).rows[0].n,2);
 });
 await t.test('name can be supplied later only by owning staff, before confirmation',async()=>{
  let r=await f.request('admin/consultations/'+id,'counselor-a');
  const denied=await f.request('admin/consultations/'+id+'/customer','counselor-b','POST',{person:'합성검수',version:r.data.item.version});
  assert.equal(denied.status,403);
  const ok=await f.request('admin/consultations/'+id+'/customer','counselor-a','POST',{person:'합성검수',version:r.data.item.version});
  assert.equal(ok.status,200);assert.equal(ok.data.item.person,'합성검수');assert.equal(ok.data.item.communication.entry.nameMissing,false);
  assert.equal(ok.data.item.phone,'01000000001');
 });
 await t.test('monthly report uses receipt month and fixed rates; counselors cannot see settlement',async()=>{
  const visit=await post(input({phone:'01000000002',memo:'출장1. 01000000002',kind:'visit',category:'visit',receivedDate:'2026-11-01'}));
  assert.equal(visit.data.amount,40000);
  let result=await f.request('admin/lovehunter/report?month=2026-10');
  assert.equal(result.status,200);assert.deepEqual(result.data.totals,{general:{count:1,amount:50000},visit:{count:0,amount:0},count:1,amount:50000});
  assert.equal(String(result.data.items[0].received_date).slice(0,10),'2026-10-31');
  result=await f.request('admin/lovehunter/report?month=2026-11');assert.equal(result.data.totals.amount,40000);
  assert.equal((await f.request('admin/lovehunter/report?month=2026-11','counselor-a')).status,403);
  assert.equal((await post(input({phone:'01000000003',amount:0}))).status,400);
  assert.equal((await post(input({phone:'01000000003',receivedDate:'2099-11-01'}))).status,400);
 });
 await t.test('concurrent staff entry creates one fee and one consultation; private memo never enters generated messages',async()=>{
  const entries=await Promise.all([post(input({phone:'01000000003',receivedDate:'2026-09-01'})),post(input({phone:'010-0000-0003',receivedDate:'2026-09-01'}),'counselor-b')]);
  assert.deepEqual(entries.map(x=>!!x.data.duplicate).sort(),[false,true]);
  assert.equal((await f.request('admin/lovehunter/report?month=2026-09')).data.totals.amount,50000);
  const r=(await f.request('admin/consultations/'+id)).data.item;
  const b={date:'2099-11-21',time:'18:00',amount:398000,receivedAmount:398000,place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true};
  for(const stage of ['receipt','confirmed','reminder'])assert.doesNotMatch(MomentLinkMessages.generate(r,stage,b),/STAFF-SECRET|script|러브헌터|수수료/);
 });
 await t.test('cancellation and retention do not erase a fee or charge the same number again',async()=>{
  await f.db.query("UPDATE moment_link.consultations SET status='cancelled' WHERE id=$1",[id]);
  assert.equal((await f.request('admin/lovehunter/report?month=2026-10')).data.totals.amount,50000);
  await f.db.query("UPDATE moment_link.consultations SET expires_at=now()-interval '1 day' WHERE id=$1",[id]);
  await purgeExpired(f.db);
  assert.equal((await f.db.query('SELECT consultation_id FROM moment_link.lovehunter_referrals WHERE consultation_id IS NULL')).rows[0].consultation_id,null);
  const again=await post(input({receivedDate:'2026-11-01'}));assert.equal(again.status,201,JSON.stringify(again.data));assert.equal(again.data.charged,false);assert.equal(again.data.amount,0);
  assert.equal((await f.request('admin/lovehunter/report?month=2026-10')).data.totals.amount,50000);
  assert.equal((await f.request('admin/lovehunter/report?month=2026-11')).data.totals.amount,40000);
 });
 await t.test('normal booking, customer request text and existing conflict state remain unchanged',async()=>{
  assert.equal(JSON.stringify((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[existing.id])).rows[0]),before);
  const unauth=await f.request('admin/lovehunter/consultations',null,'POST',input());assert.equal(unauth.status,401);
  const response=await f.app(new Request('https://test.moment-link.invalid/api/admin/lovehunter/consultations',{method:'POST',headers:{Origin:'https://test.moment-link.invalid',Cookie:f.sessions['owner-admin'].Cookie,'Content-Type':'application/json'},body:JSON.stringify(input())}));assert.equal(response.status,403);
 });
});
