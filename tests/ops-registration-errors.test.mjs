import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {opsAdapter,processIntegration} from '../server/jobs.mjs';
import {boardingInvitation} from '../server/boarding-pass.mjs';
import {ownershipFixture} from './ownership-fixture.mjs';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const changed='다른 직원이 예약 정보를 변경했습니다. 현재 일정을 확인한 뒤 다시 등록해 주세요.';
const env={OPS_WRITES_ENABLED:'true',OPS_BOATN_CONTRACT_VERIFIED:'true',OPS_BOATN_BASE_URL:'https://ops.test.invalid/api/',OPS_BOATN_TOKEN:'synthetic-only'};

test('legacy BOATN errors distinguish a stale atomic guard from setup and real conflicts',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [status,body,code] of [
   [409,{code:'OPS_REVIEW_REQUIRED',message:changed},'OPS_REGISTRATION_CHANGED'],
   [409,{code:'OPS_REVIEW_REQUIRED',message:'상담 일정 등록용 연결 코드 업데이트가 필요합니다. 캘린더 연결 설정을 먼저 확인해 주세요.'},'OPS_CALENDAR_SETUP_REQUIRED'],
   [409,{code:'OPS_RESOURCE_CONFLICT',message:changed},'OPS_RESOURCE_CONFLICT'],
   [409,{code:'OPS_REVIEW_REQUIRED',message:'private payload: synthetic-only'},'OPS_REVIEW_REQUIRED'],
   [400,{code:'OPS_REVIEW_REQUIRED',message:changed},'OPS_REVIEW_REQUIRED']
  ]){
   globalThis.fetch=async()=>Response.json(body,{status});
   await assert.rejects(opsAdapter('boatn',env).register({externalRef:'synthetic'}),e=>e.code===code&&e.status===status&&!e.message.includes(body.message));
  }
 }finally{globalThis.fetch=original;}
});

test('stale registration reconciles before retry, stops after two writes and preserves existing conflicts',async()=>{
 const f=await ownershipFixture(),original=globalThis.fetch;
 try{
  const item=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id});
  const other=await f.add({status:'confirmed',owner:f.staff['owner-admin'].id});
  const id=randomUUID(),oldId=randomUUID(),payload={person:'합성 복구',phone:'01000000000',productId:'classic',packageId:'all',date:'2099-01-01',time:'20:00',amount:540000,receivedAmount:50000,pax:2,paymentMethod:'transfer',place:'합성 장소'};
  for(const [jobId,row,state] of [[id,item,'pending'],[oldId,other,'conflict']])await f.db.query("INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,state,approved_by,booking,error_code) VALUES($1,$2,'boatn',$3,$4,$5,$6,$7)",[jobId,row.id,'moment-link:'+row.id,state,f.staff['owner-admin'].id,JSON.stringify(payload),state==='conflict'?'OPS_RESOURCE_CONFLICT':null]);
  const snapshot=async()=>JSON.stringify((await f.db.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1',[oldId])).rows);
  const before=await snapshot(),calls=[];let registered=false,fail=true;
  globalThis.fetch=async(url,options)=>{
   const path=new URL(url).pathname;calls.push(options.method+' '+path);
   if(options.method==='GET')return registered?Response.json({id:'synthetic-recovered'}):new Response('{}',{status:404,headers:{'X-Moment-Registration-Mode':'atomic-v1'}});
   assert.match(path,/bookings\/register$/);assert.equal(options.headers['Idempotency-Key'],'moment-link:'+item.id);
   if(fail)return Response.json({code:'OPS_REVIEW_REQUIRED',message:changed},{status:409});
   registered=true;return Response.json({id:'synthetic-recovered'},{status:201});
  };
  assert.equal((await processIntegration(f.db,id,env)).state,'uncertain');
  fail=false;assert.equal((await processIntegration(f.db,id,env)).state,'succeeded');
  assert.match(calls[1],/^GET /);assert.equal(calls.filter(x=>x.startsWith('POST')).length,2);
  assert.equal((await f.db.query('SELECT attempts FROM moment_link.integration_jobs WHERE id=$1',[id])).rows[0].attempts,2);
  assert.equal(await snapshot(),before);assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.outbox')).rows[0].n,0);
  registered=false;fail=true;calls.length=0;
  await f.db.query("UPDATE moment_link.integration_jobs SET state='pending',attempts=0,external_id=NULL WHERE id=$1",[id]);
  await processIntegration(f.db,id,env);await processIntegration(f.db,id,env);await processIntegration(f.db,id,env);
  assert.equal(calls.filter(x=>x.startsWith('POST')).length,2);
  assert.equal(await snapshot(),before);
 }finally{globalThis.fetch=original;await f.pg.close();}
});

test('registration causes are visible near message preparation without suggesting an unrelated date edit',async()=>{
 const r={id:'synthetic',status:'confirmed',communication:{booking:{}}};
 const setup={state:'conflict',attempts:1,error_code:'OPS_CALENDAR_SETUP_REQUIRED'};
 await assert.rejects(boardingInvitation({query:async()=>({rows:[setup]})},r,()=>assert.fail('must not request boarding for rejected job')),e=>e.code==='BOARDING_OPS_PENDING'&&e.message.includes('캘린더 등록 연결 코드'));
 const window={};vm.runInNewContext(await readFile(new URL('../ops-ui.js',import.meta.url),'utf8'),{window});
 const html=window.MomentLinkOps.panel({...r,integration:setup});
 assert.match(html,/캘린더 등록 연결 코드/);assert.doesNotMatch(html,/새 날짜·시간/);
 const stale=window.MomentLinkOps.panel({...r,integration:{state:'uncertain',attempts:1,error_code:'OPS_REGISTRATION_CHANGED'}});
 assert.match(stale,/중복 방지 검사/);assert.match(stale,/자동으로 재확인/);
});
