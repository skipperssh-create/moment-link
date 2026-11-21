import {purgeExpired} from '../server/retention.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
test('duplicate linking preserves originals, external jobs, lifetime fee and private notes',async t=>{
 const f=await ownershipFixture();t.after(()=>f.pg.close());const admin=f.staff['owner-admin'];
 await f.db.query("UPDATE moment_link.config SET data=jsonb_set(data,'{retentionDays}','365') WHERE id='settings'");
 const target=await f.add({owner:admin.id,status:'confirmed',communication:{booking:{date:'2026-11-26',time:'21:30',amount:440000,receivedAmount:440000},reservation:{source:'manual'}}});
 const intake={requestId:randomUUID(),source:'lovehunter',sourceLabel:'',phone:'01000000000',person:'합성 중복',memo:'PRIVATE ORIGINAL 300',kind:'general',category:'yacht',receivedDate:'2026-11-01',separate:true};
 const created=await f.request('admin/intake/consultations','owner-admin','POST',intake);assert.equal(created.status,201,JSON.stringify(created.data));const source=created.data.item;
 await f.db.query('DELETE FROM moment_link.consultation_sources WHERE consultation_id=$1',[source.id]); // legacy intake before source tracking
 const before=(await f.db.query('SELECT * FROM moment_link.consultations ORDER BY id')).rows;
 const feeBefore=(await f.db.query('SELECT * FROM moment_link.lovehunter_referrals')).rows[0];
 const jobsBefore={};for(const table of ['integration_jobs','event_calendar_jobs','seollem_booking_jobs','outbox'])jobsBefore[table]=(await f.db.query('SELECT * FROM moment_link.'+table)).rows;
 const data={sourceId:source.id,targetId:target.id,sourceVersion:source.version,targetVersion:target.version,requestId:randomUUID(),confirmed:true};
 await t.test('only authorized same-phone unreserved intake can be linked, confirmation and current versions required',async()=>{
  for(const [patch,code] of [[{confirmed:false},400],[{sourceVersion:999},409],[{targetId:source.id},400]])assert.equal((await f.request('admin/consultation-links','owner-admin','POST',{...data,...patch})).status,code);
  assert.equal((await f.request('admin/consultation-links','counselor-b','POST',data)).status,403);
 });
 await t.test('link and repeat produce one archive and preserve source and target rows exactly',async()=>{
  const linked=await f.request('admin/consultation-links','owner-admin','POST',data);assert.equal(linked.status,200,JSON.stringify(linked.data));assert.equal(linked.data.targetId,target.id);
  const replay=await f.request('admin/consultation-links','owner-admin','POST',data);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.deepEqual((await f.db.query('SELECT * FROM moment_link.consultations ORDER BY id')).rows,before);
  for(const table of Object.keys(jobsBefore))assert.deepEqual((await f.db.query('SELECT * FROM moment_link.'+table)).rows,jobsBefore[table]);
  const fee=(await f.db.query('SELECT * FROM moment_link.lovehunter_referrals')).rows[0];assert.deepEqual({...fee,consultation_id:feeBefore.consultation_id},feeBefore);assert.equal(fee.consultation_id,target.id);
 });
 await t.test('normal lists, counts and candidates show canonical only; original remains in linked archive',async()=>{
  const list=await f.request('admin/consultations?view=all');assert.equal(list.data.items.length,1);assert.equal(list.data.counts.all,1);assert.equal(list.data.items[0].id,target.id);
  const matches=await f.request('admin/intake/candidates?phone=010-0000-0000');assert.deepEqual(matches.data.items.map(r=>r.id),[target.id]);
  const archive=await f.request('admin/consultation-links');assert.equal(archive.data.items[0].id,source.id);
  const archived=await f.request('admin/consultations/'+source.id+'?observe=1');assert.equal(archived.data.mergedInto.id,target.id);assert.equal(archived.data.item.can_edit,false);
  const detail=await f.request('admin/consultations/'+target.id+'?observe=1');assert.equal(detail.data.linkedConsultations[0].id,source.id);assert(detail.data.notes.some(n=>n.body.includes('PRIVATE ORIGINAL 300')));
  const notesCount=(await f.db.query('SELECT count(*)::int n FROM moment_link.consultation_notes')).rows[0].n;assert.equal(notesCount,1,'no copied private records');
 });
 await t.test('stale mutation and duplicate replay cannot reopen or add fees; explicit separate stays available',async()=>{
  const denied=await f.request('admin/consultations/'+source.id+'/notes','owner-admin','POST',{body:'wrong'});assert.equal(denied.status,409);assert.equal(denied.data.error,'CONSULTATION_LINKED');
  const replay=await f.request('admin/intake/consultations','owner-admin','POST',intake);assert.equal(replay.data.item.id,target.id);assert.equal(replay.data.charged,false);
  const found=await f.request('admin/intake/consultations','owner-admin','POST',{...intake,requestId:randomUUID(),separate:false});assert.equal(found.data.candidates.length,1);
  const finance=(await f.request('admin/finance/report?month=2026-11')).data;assert.equal(finance.metrics.newLeads,1);assert.equal(finance.metrics.sales,440000);assert.equal(finance.metrics.fees,50000);assert.equal(finance.bySource.find(r=>r.source==='lovehunter').sales,440000);assert.equal(finance.fees[0].status,'confirmed');
 });
 await t.test('reserved source, mismatched phone, OPS record or conflict and link chains are blocked',async()=>{
  const fresh=await f.add({owner:admin.id,status:'consulting'});
  const other=await f.add({owner:admin.id,status:'confirmed'});
  const d={...data,sourceId:fresh.id,sourceVersion:fresh.version,targetId:other.id,targetVersion:other.version,requestId:randomUUID()};
  await f.db.query("UPDATE moment_link.consultations SET phone='01011111111' WHERE id=$1",[fresh.id]);
  assert.equal((await f.request('admin/consultation-links','owner-admin','POST',d)).data.error,'PHONE_MISMATCH');
  await f.db.query("UPDATE moment_link.consultations SET phone='01000000000',status='confirmed' WHERE id=$1",[fresh.id]);
  assert.equal((await f.request('admin/consultation-links','owner-admin','POST',d)).data.error,'RESERVATION_EXISTS');
  await f.db.query("UPDATE moment_link.consultations SET status='consulting' WHERE id=$1",[fresh.id]);
  assert.equal((await f.request('admin/consultation-links','owner-admin','POST',{...d,targetId:source.id,targetVersion:source.version})).data.error,'LINK_CHAIN');
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking,state) VALUES($1,$2,'boatn',$1::uuid::text,$3,'{}','conflict')",[randomUUID(),other.id,admin.id]);
  assert.equal((await f.request('admin/consultation-links','owner-admin','POST',d)).data.error,'OPS_CONFLICT');
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking,state) VALUES($1,$2,'boatn',$1::uuid::text,$3,'{}','conflict')",[randomUUID(),fresh.id,admin.id]);
  assert.equal((await f.request('admin/consultation-links','owner-admin','POST',d)).data.error,'EXTERNAL_RECORD');
 });
 await t.test('expired linked notes disappear, retained accounting does not count duplicate after purge',async()=>{
  await f.db.query("UPDATE moment_link.consultations SET expires_at=now()-interval '1 day' WHERE id=$1",[source.id]);
  const detail=await f.request('admin/consultations/'+target.id+'?observe=1');assert(!detail.data.notes.some(n=>n.body.includes('PRIVATE ORIGINAL 300')));
  await purgeExpired(f.db);
  const facts=(await f.db.query('SELECT merged_into FROM moment_link.finance_booking_facts WHERE merged_into=$1',[target.id])).rows;assert.equal(facts.length,1);
  const fee=(await f.db.query('SELECT * FROM moment_link.lovehunter_referrals')).rows[0];assert.equal(fee.amount,50000);assert.equal(fee.consultation_id,target.id);
 });
});
