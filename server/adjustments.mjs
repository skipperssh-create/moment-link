import {z} from 'zod';
import {parse} from './validation.mjs';
import {fail,audit} from './security.mjs';
// messages.js captures its pricing dependency at module initialization.
// Keep cold production startup independent of migration/test import order.
import '../pricing.js';
import '../booking-addons.js';
import '../booking-adjustment.js';
import '../messages.js';
const M=globalThis.MomentLinkMessages;
const schema=z.object({version:z.number().int(),requestId:z.string().uuid(),target:z.string().max(150),reduction:z.number().int().positive().max(100000000),refund:z.number().int().min(0).max(100000000),reason:z.string().trim().min(1).max(200),confirmed:z.literal(true)}).strict();
function communicationAfter(r,next,entry){return {...r.communication,booking:next,drafts:Object.fromEntries(Object.keys(M.stages).map(s=>[s,M.generate(r,s,next,r.communication.paymentDeadline)])),opsPayment:{received:next.receivedAmount,balance:next.amount-next.receivedAmount},adjustments:[...(r.communication.adjustments||[]),entry],reservation:{...r.communication.reservation,updatedAt:entry.at,updatedBy:entry.actor}};}
export async function queueAdjustment(tx,r,user,input){
 const d=parse(schema,input),facts=(({requestId,target,reduction,refund,reason})=>({requestId,target,reduction,refund,reason}))(d);
 const prior=(await tx.query("SELECT detail FROM moment_link.audit_logs WHERE entity_id=$1 AND action='reservation.adjustment.requested' AND detail->>'requestId'=$2",[r.id,d.requestId])).rows[0];
 if(prior){if(Object.keys(facts).some(k=>prior.detail[k]!==facts[k]))fail(409,'ADJUSTMENT_REQUEST_CHANGED','같은 요청의 내용이 다릅니다. 저장 결과를 먼저 확인해 주세요.');return {item:r};}
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 최신 예약을 다시 열어 주세요.');
 if(r.status!=='confirmed'||!r.communication?.reservation)fail(409,'STATE','확정된 예약에서 옵션 취소·환불을 기록해 주세요.');
 const j=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0];
 if(j&&(j.target!=='boatn'||j.state!=='succeeded'||!j.external_id))fail(409,'OPS_CHANGE_REQUIRED','기존 OPS 작업을 먼저 확인해 주세요. 충돌 건은 변경하지 않습니다.');
 for(const table of ['event_calendar_jobs','seollem_booking_jobs']){const job=(await tx.query('SELECT state FROM moment_link.'+table+' WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0];if(job&&job.state!=='synced')fail(409,'SYNC_REVIEW_REQUIRED','기존 OPS·캘린더 연동이 완료된 뒤 저장해 주세요. 충돌 건은 변경하지 않습니다.');}
 let result;try{result=globalThis.MomentLinkAdjustment.calculate(r,d);}catch(e){fail(400,'ADJUSTMENT_INVALID',e.message);}
 const before=r.communication.booking,next=result.booking,entry={...facts,label:result.label,at:new Date().toISOString(),actor:user.displayName||user.username,before:{amount:before.amount,receivedAmount:before.receivedAmount},after:{amount:next.amount,receivedAmount:next.receivedAmount}};
 await audit(tx,user.id,'reservation.adjustment.requested',r.id,facts);
 if(j){
  const change={...j.booking,operation:'adjustment',changeId:d.requestId,expected:{departure:new Date(before.date+'T'+before.time+':00+09:00').toISOString(),amount:before.amount,received:before.receivedAmount,addOns:globalThis.MomentLinkAddOns.validate(before.addOns)},nextBooking:next,adjustment:entry};
  await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(change),user.id,j.id]);
 }else{
  await tx.query('UPDATE moment_link.consultations SET communication=$1 WHERE id=$2',[JSON.stringify(communicationAfter(r,next,entry)),r.id]);
  await audit(tx,user.id,'reservation.adjustment.recorded',r.id,entry);
 }
 return {item:(await tx.query('UPDATE moment_link.consultations SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0]};
}
export async function processAdjustment(db,job,env,adapter){
 const c=job.booking,next=c.nextBooking;let writing=false;
 try{
  let receipt=await adapter.adjustmentResult(job.external_ref,c.changeId);
  if(!receipt){
   if(job.reconcileOnly)throw Object.assign(Error('retry limit'),{code:'OPS_ADJUSTMENT_RETRY_LIMIT'});
   if(!(await adapter.metadata())?.partialRefunds)throw Object.assign(Error('unsupported'),{code:'OPS_ADJUSTMENT_UNAVAILABLE',safe:true});
   const active=(await db.query("SELECT id FROM moment_link.consultations WHERE id=$1 AND status='confirmed' AND deleted_at IS NULL AND expires_at>now()",[job.consultation_id])).rows[0];
   if(!active||env.OPS_WRITES_ENABLED!=='true')throw Object.assign(Error('disabled'),{code:'OPS_WRITES_DISABLED',safe:true});
   writing=true;receipt=await adapter.adjustBooking({externalRef:job.external_ref,bookingId:job.external_id,requestId:c.changeId,expected:c.expected,reduction:c.adjustment.reduction,refund:c.adjustment.refund,reason:c.adjustment.label+' · '+c.adjustment.reason,addOns:next.addOns,excludeBouquet:c.adjustment.target==='bouquet',confirmed:true});
  }
  if(receipt?.id!==job.external_id||receipt.requestId!==c.changeId||receipt.applied!==true||receipt.amount!==next.amount||receipt.received!==next.receivedAmount||receipt.refund!==c.adjustment.refund||receipt.balance!==next.amount-next.receivedAmount)throw Error('invalid adjustment receipt');
  if(receipt.currentState!=='ready'||receipt.currentDeparture!==c.expected.departure||receipt.currentAmount!==next.amount||receipt.currentReceived!==next.receivedAmount)throw Object.assign(Error('changed'),{code:'OPS_ADJUSTMENT_CHANGED',safe:true});
  await db.transaction(async tx=>{
   const r=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[job.consultation_id])).rows[0],current=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
   if(current?.state!=='checking'||current.booking.changeId!==c.changeId||r?.status!=='confirmed'||r.deleted_at||r.communication.booking.amount!==c.expected.amount||r.communication.booking.receivedAmount!==c.expected.received)throw Object.assign(Error('changed'),{code:'OPS_ADJUSTMENT_CHANGED',safe:true});
   await tx.query('UPDATE moment_link.consultations SET communication=$1,version=version+1,updated_at=now() WHERE id=$2',[JSON.stringify(communicationAfter(r,next,c.adjustment)),r.id]);
   await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',error_code=NULL,booking=$1,updated_at=now() WHERE id=$2",[JSON.stringify({...current.booking,amount:next.amount,receivedAmount:next.receivedAmount,addOns:next.addOns}),job.id]);
   await audit(tx,job.approved_by,'reservation.adjustment.recorded',r.id,c.adjustment);
  });return {state:'succeeded',externalId:job.external_id};
 }catch(e){
  const state=['OPS_UNCONFIGURED','OPS_DISABLED','OPS_AUTH_REQUIRED','OPS_WRITES_DISABLED','OPS_ADJUSTMENT_UNAVAILABLE'].includes(e.code)?'blocked':e.safe&&![408,429].includes(e.status)?'conflict':writing||job.state==='uncertain'||job.reconcileOnly?'uncertain':'failed';
  await db.query("UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3 AND state='checking' AND booking->>'changeId'=$4",[state,e.code||'OPS_ADJUSTMENT_OUTCOME_UNKNOWN',job.id,c.changeId]);return {state};
 }
}
