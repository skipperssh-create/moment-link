import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
const input=(source,phone,extra={})=>({requestId:randomUUID(),source,sourceLabel:source==='other'?'직접 전화':'',phone,person:'합성검수',memo:'STAFF ONLY 검수',kind:'general',category:'visit',receivedDate:'2026-11-01',...extra});
test('source intake, finance accounting, permissions and anonymous retention',async t=>{
 const f=await ownershipFixture();t.after(()=>f.pg.close());
 await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','365') WHERE id='settings'");
 const post=d=>f.request('admin/intake/consultations','owner-admin','POST',d);
 const existing=await f.add({status:'confirmed',communication:{booking:{date:'2026-11-28',time:'18:00',amount:100000,receivedAmount:100000},reservation:{confirmedAt:'2026-11-01T00:00:00Z'}}});
 await f.db.query("UPDATE moment_link.consultations SET phone='01000001105' WHERE id=$1",[existing.id]);
 const before=JSON.stringify((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[existing.id])).rows[0]);
 const jobCounts={};for(const table of ['integration_jobs','event_calendar_jobs','seollem_booking_jobs'])jobCounts[table]=(await f.db.query('SELECT count(*)::int n FROM moment_link.'+table)).rows[0].n;
 let seollem,other,general,visit;
 await t.test('explicit source, zero-fee owned and manual inquiries; only Love Hunter is charged',async()=>{
  for(const source of ['seollem','other','lovehunter']){
   const out=await post(input(source,source==='seollem'?'01000001101':source==='other'?'01000001102':'01000001103'));
   assert.equal(out.status,201,JSON.stringify(out.data));
   assert.equal(out.data.amount,source==='lovehunter'?50000:0);
   assert.equal(out.data.charged,source==='lovehunter');
   if(source==='seollem')seollem=out.data.item.id;else if(source==='other')other=out.data.item.id;else general=out.data.item.id;
  }
  const out=await post(input('lovehunter','01000001104',{kind:'visit'}));assert.equal(out.data.amount,40000);visit=out.data.item.id;
  const missing=input('seollem','01000001109');delete missing.source;assert.equal((await post(missing)).status,400);
  assert.equal((await post(input('other','01000001109',{sourceLabel:''}))).status,400);
 });
 await t.test('existing confirmed booking is offered before creating; selected link preserves all booking data and jobs',async()=>{
  const d=input('lovehunter','01000001105');
  const found=await post(d);assert.equal(found.status,200);assert.equal(found.data.candidates[0].id,existing.id);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.lovehunter_referrals')).rows[0].n,2);
  const linked=await post({...d,existingId:existing.id});assert.equal(linked.status,201,JSON.stringify(linked.data));assert.equal(linked.data.item.id,existing.id);assert.equal(linked.data.amount,50000);assert.equal(linked.data.linked,true);
  const replay=await post({...d,existingId:existing.id});assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.equal(JSON.stringify((await f.db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[existing.id])).rows[0]),before);
  for(const table of ['integration_jobs','event_calendar_jobs','seollem_booking_jobs'])assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.'+table)).rows[0].n,jobCounts[table]);
 });
 await t.test('same phone across months or sources has a single lifetime referral fee',async()=>{
  const same=await post(input('lovehunter','010-0000-1103',{receivedDate:'2026-10-01',kind:'visit'}));assert(same.data.candidates.some(r=>r.id===general));
  const linked=await post(input('lovehunter','01000001103',{existingId:general,receivedDate:'2026-10-01',kind:'visit'}));assert.equal(linked.data.amount,0);
  assert.equal((await f.db.query('SELECT sum(amount)::int n FROM moment_link.lovehunter_referrals')).rows[0].n,140000);
  const other=await post(input('seollem','01000001103',{separate:true}));assert.equal(other.data.charged,false);
 });
 await t.test('report reconciles partial refunds, unknown amounts, cancelled reservations and cohort sources',async()=>{
  const rows=[[seollem,'confirmed',368000,368000,[{reduction:30000,refund:30000,at:'2026-11-18T16:00:00Z'}]],[general,'confirmed',540000,50000,[]],[other,'cancelled',200000,10000,[]]];
  for(const [id,status,amount,receivedAmount,adjustments]of rows)await f.db.query('UPDATE moment_link.consultations SET status=$1,communication=$2 WHERE id=$3',[status,JSON.stringify({booking:{date:'2026-11-28',time:'18:00',amount,receivedAmount},reservation:{confirmedAt:'2026-11-01T00:00:00Z'},adjustments}),id]);
  const out=await f.request('admin/finance/report?month=2026-11');assert.equal(out.status,200,JSON.stringify(out.data));
  const m=out.data.metrics;assert.equal(m.sales,1008000);assert.equal(m.received,518000);assert.equal(m.due,490000);assert.equal(m.fees,140000);assert.equal(m.refundForBookings,30000);assert.equal(m.gross,1038000);assert.equal(m.cancelled,1);assert.equal(m.cancelledReceived,10000);assert.equal(m.margin,null);
  assert.equal(out.data.bySource.find(r=>r.source==='seollem').sales,368000);assert.equal(out.data.bySource.find(r=>r.source==='lovehunter').sales,640000);
  assert.equal(out.data.metrics.refundsThisMonth,30000);
  assert(!JSON.stringify(out.data).includes('STAFF ONLY'));
 });
 await t.test('monthly advertising totals, payable expense, optimistic locking and audit trail',async()=>{
  const d={month:'2026-11',version:0,advertisingAmount:100000,advertisingPaid:60000,referralPaid:140000,note:'합성 광고비'};
  assert.equal((await f.request('admin/finance/month','owner-admin','POST',d)).status,200);
  assert.equal((await f.request('admin/finance/month','owner-admin','POST',d)).status,409);
  assert.equal((await f.request('admin/finance/month','owner-admin','POST',{...d,version:1,referralPaid:140001})).status,400);
  const cost={id:randomUUID(),month:'2026-11',version:0,category:'materials',source:'seollem',vendor:'합성 거래처',amount:20000,paid:0,vat:1818,evidence:'합성 영수증',note:'검수',voided:false};
  assert.equal((await f.request('admin/finance/cost','owner-admin','POST',cost)).status,200);
  let out=(await f.request('admin/finance/report?month=2026-11')).data;
  assert.equal(out.metrics.margin,748000);assert.equal(out.metrics.payables,60000);assert.equal(out.settings.advertisingAmount,100000);assert.equal(out.history.length,2);assert.equal(out.bySource.find(r=>r.source==='seollem').roas,368);
  assert.equal((await f.request('admin/finance/cost','owner-admin','POST',{...cost,version:1,voided:true})).status,200);
  out=(await f.request('admin/finance/report?month=2026-11')).data;assert.equal(out.metrics.margin,768000);assert.equal(out.costs.length,1);assert.equal(out.costs[0].voided,true);assert.equal(out.history.length,3);
 });
 await t.test('event month moves exactly once; anonymous finance facts survive consultation deletion',async()=>{
  await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{booking,date}','\"2026-12-01\"') WHERE id=$1",[seollem]);
  assert.equal((await f.request('admin/finance/report?month=2026-11')).data.metrics.sales,640000);
  assert.equal((await f.request('admin/finance/report?month=2026-12')).data.metrics.sales,368000);
  await f.db.query('DELETE FROM moment_link.consultation_notes WHERE consultation_id=$1',[seollem]);
  await f.db.query('DELETE FROM moment_link.consultations WHERE id=$1',[seollem]);
  const out=(await f.request('admin/finance/report?month=2026-12')).data;
  assert.equal(out.metrics.sales,368000);assert.equal(out.bookings[0].person,null);assert.equal(out.bookings[0].source,'seollem');
  const facts=(await f.db.query('SELECT * FROM moment_link.finance_booking_facts WHERE id=$1',[seollem])).rows[0];
  assert.equal(facts.consultation_id,null);assert(!JSON.stringify(facts).includes('01000001101'));assert(!JSON.stringify(facts).includes('STAFF ONLY'));
 });
 await t.test('administrator-only financial routes, CSRF and other staff candidate privacy',async()=>{
  for(const route of ['admin/finance/report?month=2026-11']){assert.equal((await f.request(route,'counselor-a')).status,403);assert.equal((await f.request(route,null)).status,401);}
  const denied=await f.request('admin/finance/month','counselor-a','POST',{month:'2026-11',version:1,advertisingAmount:0,advertisingPaid:0,referralPaid:0,note:''});assert.equal(denied.status,403);
  const candidates=await f.request('admin/intake/consultations','counselor-a','POST',input('seollem','01000001105'));assert.equal(candidates.data.candidates.length,0);assert.equal(candidates.data.restrictedCount,1);assert(!JSON.stringify(candidates.data).includes(existing.id));
  const deniedLink=await f.request('admin/intake/consultations','counselor-a','POST',input('seollem','01000001105',{existingId:existing.id}));assert.equal(deniedLink.status,403);
  const res=await f.app(new Request('https://test.moment-link.invalid/api/admin/finance/month',{method:'POST',headers:{Origin:'https://test.moment-link.invalid',Cookie:f.sessions['owner-admin'].Cookie,'Content-Type':'application/json'},body:'{}'}));assert.equal(res.status,403);
 });
 await t.test('missing legacy money remains unknown and refund month follows Korea time',async()=>{
  await f.add({status:'confirmed',communication:{reservation:{confirmedAt:'2026-10-01T00:00:00Z'},booking:{date:'2026-10-30',amount:null,receivedAmount:null},adjustments:[{reduction:1000,refund:1000,at:'2026-09-30T16:00:00Z'}]}});
  const out=(await f.request('admin/finance/report?month=2026-10')).data;
  assert.equal(out.metrics.missingAmount,1);assert.equal(out.metrics.missingReceived,1);assert.equal(out.metrics.margin,null);assert.equal(out.metrics.refundsThisMonth,1000);assert.equal(out.bookings[0].due,null);assert.equal(out.metrics.unclassified,1);
 });
});
