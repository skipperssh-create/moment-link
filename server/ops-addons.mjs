import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {parse} from './validation.mjs';
import {fail,audit} from './security.mjs';
import {bookingSchema} from './communications.mjs';
import '../booking-addons.js';
import '../messages.js';
const A=globalThis.MomentLinkAddOns,M=globalThis.MomentLinkMessages;
export async function queueAddOnChange(tx,r,user,input){
 const d=parse(z.object({version:z.number().int(),addOns:z.array(z.unknown()).max(5)}).strict(),input);
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열고 확인해 주세요.');
 if(r.status!=='confirmed'||!r.communication?.reservation)fail(409,'STATE','확정된 예약에서 옵션을 수정해 주세요.');
 const j=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0];
 if(j&&(j.target!=='boatn'||j.state!=='succeeded'||!j.external_id))fail(409,'OPS_CHANGE_REQUIRED','기존 OPS 작업이 완료된 뒤 변경해 주세요. 충돌 건은 다시 시도하지 않습니다.');
 let rows;try{rows=A.validate(d.addOns);}catch(e){fail(400,'VALIDATION',e.message);}
 const before=r.communication.booking;
 if(JSON.stringify(rows)===JSON.stringify(A.validate(before.addOns)))fail(400,'UNCHANGED','변경된 추가 옵션이 없습니다.');
 const next={...before,baseAmount:A.base(before),addOns:rows,amountMode:'manual'};A.recalculate(next);parse(bookingSchema,next);
 const nextDrafts=Object.fromEntries(Object.keys(M.stages).map(stage=>[stage,M.generate(r,stage,next,r.communication.paymentDeadline)]));
 if(j){
  const change={...j.booking,operation:'addons',changeId:randomUUID(),expected:{departure:new Date(before.date+'T'+before.time+':00+09:00').toISOString(),amount:before.amount,addOns:A.validate(before.addOns)},nextBooking:next,nextDrafts,requestedBy:user.username};
  await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(change),user.id,j.id]);
  await audit(tx,user.id,'ops.addons.queued',r.id,{jobId:j.id,changeId:change.changeId});
 }else{
  next.paymentConfirmed=Number.isInteger(before.receivedAmount)?before.paymentConfirmed&&(before.receivedAmount>0||next.amount===0):next.amount<=before.amount&&before.paymentConfirmed;
  await tx.query('UPDATE moment_link.consultations SET communication=$1 WHERE id=$2',[JSON.stringify({...r.communication,booking:next,drafts:nextDrafts,reservation:{...r.communication.reservation,updatedAt:new Date().toISOString(),updatedBy:user.username}}),r.id]);
  await audit(tx,user.id,'reservation.addons.updated',r.id,{});
 }
 return {item:(await tx.query('UPDATE moment_link.consultations SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0]};
}
export async function processAddOnChange(db,job,env,adapter){
 let writing=false;
 try{
  const change=job.booking,next=change.nextBooking;
  let receipt=await adapter.addOnsResult(job.external_ref,change.changeId);
  if(!receipt){
   if(job.reconcileOnly)throw Object.assign(Error('retry limit'),{code:'OPS_ADDONS_RETRY_LIMIT'});
   if(!(await adapter.metadata())?.addOnUpdates)throw Object.assign(Error('unsupported'),{code:'OPS_ADDONS_UNAVAILABLE',safe:true});
   const active=(await db.query("SELECT id FROM moment_link.consultations WHERE id=$1 AND status='confirmed' AND deleted_at IS NULL AND expires_at>now()",[job.consultation_id])).rows[0];
   if(!active||env.OPS_WRITES_ENABLED!=='true')throw Object.assign(Error('disabled'),{code:'OPS_WRITES_DISABLED',safe:true});
   writing=true;receipt=await adapter.updateAddOns({externalRef:job.external_ref,bookingId:job.external_id,requestId:change.changeId,expected:change.expected,addOns:next.addOns});
  }
  if(receipt?.id!==job.external_id||receipt.requestId!==change.changeId||receipt.applied!==true||receipt.amount!==next.amount||JSON.stringify(A.validate(receipt.addOns))!==JSON.stringify(next.addOns)||!Number.isSafeInteger(receipt.received)||receipt.received<0||receipt.balance!==receipt.amount-receipt.received||receipt.balance<0)throw Error('invalid addon receipt');
  if(receipt.currentState!=='ready'||receipt.currentDeparture!==change.expected.departure||receipt.currentAmount!==next.amount||JSON.stringify(A.validate(receipt.currentAddOns))!==JSON.stringify(next.addOns))throw Object.assign(Error('remote changed'),{code:'OPS_ADDONS_CHANGED',safe:true});
  await db.transaction(async tx=>{
   const row=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[job.consultation_id])).rows[0],current=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
   if(current?.booking.changeId!==change.changeId||current.state!=='checking')throw Error('addon claim changed');
   if(!row||row.deleted_at||row.status!=='confirmed')throw Object.assign(Error('closed'),{code:'CONSULTATION_CLOSED',safe:true});
   const booking={...next,receivedAmount:receipt.received,paymentConfirmed:receipt.received>0||receipt.amount===0},communication={...row.communication,booking,drafts:Object.fromEntries(Object.keys(M.stages).map(stage=>[stage,M.generate(row,stage,booking,row.communication.paymentDeadline)])),opsPayment:{received:receipt.received,balance:receipt.balance},reservation:{...row.communication.reservation,updatedAt:new Date().toISOString(),updatedBy:change.requestedBy}};
   await tx.query('UPDATE moment_link.consultations SET communication=$1,version=version+1,updated_at=now() WHERE id=$2',[JSON.stringify(communication),row.id]);
   await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',error_code=NULL,booking=$1,updated_at=now() WHERE id=$2",[JSON.stringify({...current.booking,amount:next.amount,addOns:next.addOns}),job.id]);
   await audit(tx,job.approved_by,'ops.addons.updated',row.id,{jobId:job.id,changeId:change.changeId});
  });
  return {state:'succeeded',externalId:job.external_id};
 }catch(error){
  const state=['OPS_UNCONFIGURED','OPS_DISABLED','OPS_AUTH_REQUIRED','OPS_WRITES_DISABLED','OPS_ADDONS_UNAVAILABLE'].includes(error.code)?'blocked':error.safe&&![408,429].includes(error.status)?'conflict':writing||job.state==='uncertain'||job.reconcileOnly?'uncertain':'failed';
  await db.query('UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3 AND booking->>\'changeId\'=$4',[state,error.code||'OPS_ADDONS_OUTCOME_UNKNOWN',job.id,job.booking.changeId]);
  return {state};
 }
}
