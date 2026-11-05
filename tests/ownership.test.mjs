import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import '../ownership.js';
let f,a,b;
before(async()=>{f=await ownershipFixture();a=f.staff['counselor-a'].id;b=f.staff['counselor-b'].id;});
after(async()=>f.pg.close());
const call=(path,who,method,data)=>f.request('admin/'+path,who,method,data);
test('staff can view their own, all, unassigned and a chosen colleague without gaining edit permission',async()=>{
 const own=await f.add({owner:a}),other=await f.add({owner:b}),free=await f.add();
 assert.deepEqual((await call('consultations','counselor-a')).data.items.map(x=>x.id),[own.id]);
 const all=await call('consultations?owner=all','counselor-a');assert.equal(all.data.counts.all,3);
 assert.equal(all.data.items.find(x=>x.id===other.id).can_edit,false);assert.equal(all.data.items.find(x=>x.id===free.id).can_claim,true);
 assert.deepEqual((await call('consultations?owner='+b,'counselor-a')).data.items.map(x=>x.id),[other.id]);
 assert.deepEqual((await call('consultations?owner=unassigned','counselor-a')).data.items.map(x=>x.id),[free.id]);
 assert.equal((await call('consultations/'+other.id,'counselor-a')).data.item.can_edit,false);
 for(const [suffix,method,data] of [['','PATCH',{version:1,status:'hold'}],['/notes','POST',{body:'blocked'}],['/communications','PUT',{}],['/reservation','POST',{}],['/restore-reservation','POST',{version:1}]])assert.equal((await call('consultations/'+other.id+suffix,'counselor-a',method,data)).status,403);
 assert.equal((await call('consultations/'+other.id+'/integration','counselor-a','POST',{})).status,404);
 assert.equal((await call('users','counselor-a')).status,403);
 const directory=(await call('staff','counselor-a')).data.items;assert.equal(directory.find(x=>x.id===a).displayName,'합성 상담사 가');assert.ok(directory.every(x=>!('password_hash' in x)));
 const search=await call('consultations?owner='+b+'&q=없는이름','counselor-a');assert.equal(search.data.counts.all,0);assert.equal(search.data.items.length,0);
 assert.equal((await call('consultations?owner=invalid','counselor-a')).status,400);
});
test('concurrent consultation starts have one owner; retries are idempotent and cannot steal',async()=>{
 const row=await f.add();const results=await Promise.all(['counselor-a','counselor-b'].map(w=>call('consultations/'+row.id+'/claim',w,'POST',{version:1})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);const winner=results[0].status===200?'counselor-a':'counselor-b';
 const repeat=await call('consultations/'+row.id+'/claim',winner,'POST',{version:1});assert.equal(repeat.status,200);assert.equal(repeat.data.item.status,'consulting');assert.equal(repeat.data.item.version,2);
 assert.equal((await f.db.query("SELECT count(*)::int AS n FROM moment_link.audit_logs WHERE entity_id=$1 AND action='ownership.started'",[row.id])).rows[0].n,1);
 const cancelled=await f.add({status:'cancelled'});assert.equal((await call('consultations/'+cancelled.id+'/claim',winner,'POST',{version:1})).status,409);
});
test('handover requires an administrator, active recipient and reason; earlier owner loses write access',async()=>{
 const row=await f.add({owner:a});const path='consultations/'+row.id;
 assert.equal((await call(path,'counselor-a','PATCH',{version:1,assignee:b,handoverReason:'휴무 인계'})).status,403);
 assert.equal((await call(path,'owner-admin','PATCH',{version:1,assignee:b})).data.error,'HANDOVER_REASON');
 assert.equal((await call(path,'owner-admin','PATCH',{version:1,assignee:null,handoverReason:'해제'})).data.error,'ASSIGNEE_REQUIRED');
 await f.db.query('UPDATE moment_link.admin_users SET active=false WHERE id=$1',[b]);
 assert.equal((await call(path,'owner-admin','PATCH',{version:1,assignee:b,handoverReason:'인계'})).data.error,'ASSIGNEE');
 await f.db.query('UPDATE moment_link.admin_users SET active=true WHERE id=$1',[b]);
 const moved=await call(path,'owner-admin','PATCH',{version:1,assignee:b,handoverReason:'휴무로 예약과 리마인드 인계'});assert.equal(moved.status,200);assert.equal(moved.data.item.assignee,b);
 assert.equal((await call(path+'/notes','counselor-a','POST',{body:'이전 담당 수정'})).status,403);
 assert.equal((await call(path+'/notes','counselor-b','POST',{body:'인계 확인'})).status,200);
 const history=(await call(path,'counselor-a')).data.history.find(x=>x.action==='ownership.transferred');assert.equal(history.detail.from,a);assert.match(history.detail.reason,/리마인드/);
});
test('first meaningful admin action claims an unassigned customer, but shared reads never do',async()=>{
 const row=await f.add();await call('consultations/'+row.id,'owner-admin');
 assert.equal((await f.db.query('SELECT assignee FROM moment_link.consultations WHERE id=$1',[row.id])).rows[0].assignee,null);
 await call('consultations/'+row.id+'/notes','owner-admin','POST',{body:'상담 시작 메모'});
 assert.equal((await f.db.query('SELECT assignee FROM moment_link.consultations WHERE id=$1',[row.id])).rows[0].assignee,f.staff['owner-admin'].id);
});
test('reminder queue is scoped before pagination and only a manual send for the current booking completes it',async()=>{
 const date=new Date(Date.now()+33*3600000).toISOString().slice(0,10),at=new Date(Date.now()-10000).toISOString();
 const booking={date,time:'18:00',amount:249000,amountMode:'manual',place:'합성 검수 장소',scheduleConfirmed:true,paymentConfirmed:true,extra:''};
 const row=await f.add({owner:a,status:'confirmed',communication:{booking,drafts:{reminder:'합성 리마인드'},reservation:{confirmedAt:at,updatedAt:at,source:'manual'}}});
 const queue=async(owner='mine')=>call('consultations?owner='+owner+'&followup=reminder','counselor-a');
 assert.equal((await queue()).data.counts.all,1);assert.equal((await queue()).data.items[0].followup.due,true);
 let result=await call('consultations/'+row.id+'/communications','counselor-a','POST',{version:1,stage:'reminder',kind:'composer_requested',eventId:randomUUID()});assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal((await queue()).data.counts.all,1);
 result=await call('consultations/'+row.id+'/communications','counselor-a','POST',{version:2,stage:'reminder',kind:'manual_sent',eventId:randomUUID()});assert.equal(result.status,200);assert.equal(result.data.item.assignee,a);
 const event=result.data.item.communication.events.at(-1);assert.equal(event.actorId,a);assert.equal(event.bookingKey,date+'T18:00');assert.equal(event.actor,'합성 상담사 가');
 assert.equal((await queue()).data.counts.all,0);assert.equal(MomentLinkOwnership.reminder(result.data.item).state,'done');
 // A new time requires its own reminder, even when the date is unchanged.
 const changed={...result.data.item.communication,booking:{...booking,time:'19:00'}};
 await f.db.query('UPDATE moment_link.consultations SET communication=$1 WHERE id=$2',[JSON.stringify(changed),row.id]);assert.equal((await queue()).data.counts.all,1);
 await f.db.query("UPDATE moment_link.consultations SET status='cancelled' WHERE id=$1",[row.id]);assert.equal((await queue()).data.counts.all,0);
});
test('Korean midnight and legacy reminder history obey the same booking revision boundary',()=>{
 const row={status:'confirmed',communication:{booking:{date:'2026-11-07',time:'18:00'},reservation:{updatedAt:'2026-11-05T10:00:00Z'},events:[]}};
 assert.equal(MomentLinkOwnership.reminder(row,new Date('2026-11-05T14:59:59Z')).due,false);
 assert.equal(MomentLinkOwnership.reminder(row,new Date('2026-11-05T15:00:00Z')).due,true);
 row.communication.events=[{stage:'reminder',kind:'manual_sent',at:'2026-11-05T09:00:00Z'}];assert.equal(MomentLinkOwnership.sent(row,'reminder'),false);
 row.communication.events[0].at='2026-11-05T11:00:00Z';assert.equal(MomentLinkOwnership.sent(row,'reminder'),true);
 row.communication.reservation.restoredAt='2026-11-06T00:00:00Z';assert.equal(MomentLinkOwnership.sent(row,'reminder'),false);
});
test('staff creation persists a private display name, enforces first password change and handles duplicate IDs atomically',async()=>{
 const data={username:'synthetic-new',displayName:'합성 신규 직원',password:'Synthetic-new-password!',role:'counselor'};
 const created=await call('users','owner-admin','POST',data);assert.equal(created.status,201);
 assert.equal((await call('users','owner-admin','POST',data)).status,409);
 const login=await f.request('auth/login',null,'POST',{username:data.username,password:data.password});assert.equal(login.data.user.displayName,data.displayName);assert.equal(login.data.user.mustChangePassword,true);
 f.sessions[data.username]={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};assert.equal((await call('staff',data.username)).status,403);
 assert.equal((await f.request('catalog',null)).data.settings['staff:'+created.data.id],undefined);
});
