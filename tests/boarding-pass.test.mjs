import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {ownershipFixture} from './ownership-fixture.mjs';
import {createApp} from '../server/app.mjs';
import {hash} from '../server/security.mjs';

test('combined confirmation uses current OPS invitation; manual acknowledgement projects to OPS without booking writes',async()=>{
 const f=await ownershipFixture();try{
  const b={date:'2099-11-21',time:'20:00',amount:440000,receivedAmount:90000,amountMode:'manual',place:'합성 장소',extra:'',scheduleConfirmed:true,paymentConfirmed:true,opsPax:2,opsPaymentMethod:'transfer'};
  let item=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id,communication:{booking:b,reservation:{source:'manual'},drafts:{confirmed:'고객에게 보낼 기존 예약 확정 문구'}}});
  await f.db.query("UPDATE moment_link.consultations SET category='yacht',product_id='classic' WHERE id=$1",[item.id]);
  await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,external_id,state,approved_by,booking) VALUES($1,$2,'boatn',$3,'synthetic-boarding','succeeded',$4,$5)",[randomUUID(),item.id,'moment-link:'+item.id,f.staff['owner-admin'].id,JSON.stringify({date:b.date,time:b.time,pax:2})]);
  let invitation={id:'synthetic-boarding',url:'https://boarding.boatn.co.kr/boarding/synthetic-only',context:'a'.repeat(64),recipient:item.phone,departure:'2099-11-21T11:00:00.000Z',pax:2},lookups=0;
  const env={APP_ORIGIN:'https://test.moment-link.invalid',OPS_WRITES_ENABLED:'true',OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_TOKEN:'synthetic-boarding-token'};
  const app=createApp({db:f.db,env,adapters:{ops:{boatn:{boardingPass:async(ref)=>{lookups++;assert.equal(ref,'moment-link:'+item.id);return invitation;}}}}});
  const path='admin/consultations/'+item.id+'/communications';
  const call=async(method,data,user='owner-admin')=>{const res=await app(new Request(env.APP_ORIGIN+'/api/'+path,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...f.sessions[user]},body:JSON.stringify(data)}));return {status:res.status,body:await res.json()};};
  const prepare=()=>call('PUT',{version:item.version,booking:b,drafts:item.communication.drafts,prepareStage:'confirmed'});
  const event=(kind)=>({version:item.version,stage:'confirmed',kind,eventId:randomUUID()});
  const jobSnapshot=async()=>JSON.stringify((await f.db.query('SELECT * FROM moment_link.integration_jobs')).rows),before=await jobSnapshot();
  let reply=await call('PUT',{version:item.version,booking:b,drafts:item.communication.drafts,prepareStage:'confirmed'},'counselor-b');assert.equal(reply.status,403);assert.equal(lookups,0);
  reply=await prepare();assert.equal(reply.status,200,JSON.stringify(reply.body));item=reply.body.item;
  assert.match(item.communication.drafts.confirmed,/기존 예약 확정 문구/);assert.match(item.communication.drafts.confirmed,/승선신고·보딩패스/);assert.ok(item.communication.drafts.confirmed.includes(invitation.url));
  reply=await prepare();assert.equal(reply.status,200);item=reply.body.item;assert.equal(item.communication.drafts.confirmed.split(invitation.url).length,2);
  reply=await call('POST',event('composer_requested'));assert.equal(reply.status,200);item=reply.body.item;assert.equal(item.communication.events.at(-1).boardingNotice,undefined);
  async function status(){const p='/api/integrations/boatn/consultation-statuses',raw=JSON.stringify({bookingIds:['synthetic-boarding']}),at=String(Date.now()),sig=createHmac('sha256',hash(env.OPS_BOATN_TOKEN)).update(['boatn-to-moment-v1',at,'POST',p,raw].join('\n')).digest('hex');return (await (await app(new Request(env.APP_ORIGIN+p,{method:'POST',headers:{'X-BOATN-Timestamp':at,'X-BOATN-Signature':sig},body:raw}))).json()).items[0];}
  assert.equal((await status()).boardingNotice,undefined);
  const sent=event('manual_sent');reply=await call('POST',sent);assert.equal(reply.status,200,JSON.stringify(reply.body));item=reply.body.item;
  let visible=await status();assert.equal(visible.boardingNotice.status,'manual_confirmed');assert.equal(visible.boardingNotice.by,'합성 관리자');assert.ok(!JSON.stringify(visible).includes('synthetic-only'));assert.ok(!JSON.stringify(visible).includes(item.phone));
  assert.equal((await call('POST',sent)).status,200);assert.equal(await jobSnapshot(),before);
  await f.db.query("UPDATE moment_link.consultations SET communication=jsonb_set(communication,'{events}','[]'::jsonb) WHERE id=$1",[item.id]);
  assert.equal((await status()).boardingNotice.status,'manual_confirmed');
  // No link or sent acknowledgement is accepted for a different recipient/time,
  // wrong booking, invalid origin, cancellation, unlinked or conflicting job.
  for(const patch of [{recipient:'01011111111'},{departure:'2099-11-22T11:00:00Z'},{pax:3},{id:'someone-else'},{url:'https://other.invalid/boarding/synthetic-only'}]){
   const original=invitation;invitation={...invitation,...patch};assert.equal((await prepare()).status,409);invitation=original;
  }
  invitation={...invitation,context:'b'.repeat(64)};assert.equal((await call('POST',event('manual_sent'))).status,409);
  reply=await prepare();assert.equal(reply.status,200);item=reply.body.item;
  const callCount=lookups;await f.db.query("UPDATE moment_link.integration_jobs SET state='conflict',attempts=2,error_code='OPS_RESOURCE_CONFLICT' WHERE consultation_id=$1",[item.id]);const conflict=await jobSnapshot();assert.equal((await prepare()).status,409);assert.equal(lookups,callCount);assert.equal((await status()).boardingNotice,undefined);assert.equal(await jobSnapshot(),conflict);
  await f.db.query("UPDATE moment_link.consultations SET status='cancelled' WHERE id=$1",[item.id]);assert.equal((await prepare()).status,409);assert.equal(lookups,callCount);
 }finally{await f.pg.close();}
});
