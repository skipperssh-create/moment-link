import {z} from 'zod';
import {parse} from './validation.mjs';
import {fail,audit} from './security.mjs';
import '../pricing.js';
import '../booking-addons.js';
import '../messages.js';
const M=globalThis.MomentLinkMessages;
// CASE avoids casting malformed legacy text; unknown amounts are never treated as zero.
export const balanceDueSql=`(c.status IN ('confirmed','closed') AND c.communication ? 'reservation' AND CASE WHEN jsonb_typeof(c.communication->'booking'->'amount')='number' AND jsonb_typeof(c.communication->'booking'->'receivedAmount')='number' THEN (c.communication->'booking'->>'amount')::numeric BETWEEN 1 AND 100000000 AND (c.communication->'booking'->>'receivedAmount')::numeric BETWEEN 0 AND 100000000 AND trunc((c.communication->'booking'->>'amount')::numeric)=(c.communication->'booking'->>'amount')::numeric AND trunc((c.communication->'booking'->>'receivedAmount')::numeric)=(c.communication->'booking'->>'receivedAmount')::numeric AND (c.communication->'booking'->>'amount')::numeric>(c.communication->'booking'->>'receivedAmount')::numeric ELSE false END)`;
const schema=z.object({version:z.number().int(),requestId:z.string().uuid(),amount:z.number().int().min(1).max(100000000),method:z.enum(['transfer','cash','card','naver','other']),methodNote:z.string().trim().max(80).regex(/^[^\r\n<>\[\]\x00-\x1f]*$/).default(''),confirmed:z.literal(true)}).strict();
const paymentDetails=d=>({requestId:d.requestId,amount:d.amount,method:d.method,methodNote:d.method==='other'?d.methodNote:''});
function communicationAfter(r,payment,actor){
 const booking={...r.communication.booking,receivedAmount:payment.received,paymentConfirmed:true};
 return {...r.communication,booking,drafts:Object.fromEntries(Object.keys(M.stages).map(stage=>[stage,M.generate(r,stage,booking,r.communication.paymentDeadline)])),opsPayment:{received:payment.received,balance:payment.balance},lastPayment:{...payment,actor,at:new Date().toISOString()},reservation:{...r.communication.reservation,updatedAt:new Date().toISOString(),updatedBy:actor}};
}
export async function queueCollection(tx,r,user,input){
 const d=parse(schema,input),payment=paymentDetails(d);
 if(d.method==='other'&&!d.methodNote)fail(400,'VALIDATION','기타 결제 방법을 입력해 주세요.');
 const prior=(await tx.query("SELECT detail FROM moment_link.audit_logs WHERE entity_id=$1 AND action='reservation.payment.requested' AND detail->>'requestId'=$2 LIMIT 1",[r.id,d.requestId])).rows[0];
 if(prior){if(JSON.stringify(prior.detail.payment)!==JSON.stringify(payment)){
   // jsonb key order is not stable.
   if(Object.keys(payment).some(k=>prior.detail.payment?.[k]!==payment[k]))fail(409,'PAYMENT_REQUEST_CHANGED','같은 입금 요청의 내용이 다릅니다. 저장 결과를 확인해 주세요.');
  }return {item:r};}
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 최신 입금액을 확인해 주세요.');
 const b=r.communication?.booking,p=M.paymentState(b);
 if(!['confirmed','closed'].includes(r.status)||!r.communication?.reservation)fail(409,'STATE','확정 예약의 입금만 기록할 수 있습니다.');
 if(!Number.isSafeInteger(b?.amount)||b.amount<1||!Number.isSafeInteger(p.received)||p.received<0||p.balance<=0||d.amount>p.balance)fail(400,'PAYMENT_AMOUNT','실제 받은 금액을 남은 잔금 이하로 입력해 주세요.');
 const j=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0];
 if(j&&(j.target!=='boatn'||j.state!=='succeeded'||!j.external_id))fail(409,'OPS_CHANGE_REQUIRED','기존 OPS 작업의 확인이 필요합니다. 충돌 건은 변경하지 않습니다.');
 const next={...payment,received:p.received+d.amount,balance:p.balance-d.amount};
 await audit(tx,user.id,'reservation.payment.requested',r.id,{requestId:d.requestId,payment});
 if(j){
  const change={...j.booking,operation:'payment',changeId:d.requestId,expected:{departure:new Date(b.date+'T'+b.time+':00+09:00').toISOString(),amount:b.amount,received:p.received},payment:next,requestedBy:user.username};
  await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(change),user.id,j.id]);
 }else{
  await tx.query('UPDATE moment_link.consultations SET communication=$1 WHERE id=$2',[JSON.stringify(communicationAfter(r,next,user.username)),r.id]);
  await audit(tx,user.id,'reservation.payment.collected',r.id,next);
 }
 return {item:(await tx.query('UPDATE moment_link.consultations SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0]};
}
export async function processCollection(db,job,env,adapter){
 let writing=false;const c=job.booking,p=c.payment;
 try{
  let receipt=await adapter.paymentResult(job.external_ref,c.changeId);
  if(!receipt){
   if(job.reconcileOnly)throw Object.assign(Error('two attempts'),{code:'OPS_PAYMENT_RETRY_LIMIT'});
   if(!(await adapter.metadata())?.paymentUpdates)throw Object.assign(Error('unsupported'),{code:'OPS_PAYMENT_UNAVAILABLE',safe:true});
   const active=(await db.query("SELECT id FROM moment_link.consultations WHERE id=$1 AND status IN ('confirmed','closed') AND deleted_at IS NULL AND expires_at>now()",[job.consultation_id])).rows[0];
   if(!active||env.OPS_WRITES_ENABLED!=='true')throw Object.assign(Error('disabled'),{code:'OPS_WRITES_DISABLED',safe:true});
   writing=true;receipt=await adapter.collectPayment({externalRef:job.external_ref,bookingId:job.external_id,requestId:c.changeId,expected:c.expected,amount:p.amount,method:p.method,methodNote:p.methodNote});
  }
  if(receipt?.id!==job.external_id||receipt.requestId!==c.changeId||receipt.applied!==true||receipt.amount!==c.expected.amount||receipt.collected!==p.amount||receipt.received!==p.received||receipt.balance!==p.balance||receipt.method!==p.method)throw Error('invalid payment receipt');
  if(receipt.currentState!=='ready'||receipt.currentDeparture!==c.expected.departure||receipt.currentAmount!==c.expected.amount||receipt.currentReceived!==p.received||receipt.currentBalance!==p.balance)throw Object.assign(Error('remote changed'),{code:'OPS_PAYMENT_CHANGED',safe:true});
  await db.transaction(async tx=>{
   const r=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[job.consultation_id])).rows[0],current=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
   if(current?.booking.changeId!==c.changeId||current.state!=='checking')throw Error('claim changed');
   if(!r||r.deleted_at||!['confirmed','closed'].includes(r.status)||r.communication?.booking?.amount!==c.expected.amount||r.communication.booking.receivedAmount!==c.expected.received)throw Object.assign(Error('local changed'),{code:'OPS_PAYMENT_CHANGED',safe:true});
   await tx.query('UPDATE moment_link.consultations SET communication=$1,version=version+1,updated_at=now() WHERE id=$2',[JSON.stringify(communicationAfter(r,p,c.requestedBy)),r.id]);
   await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',error_code=NULL,booking=$1,updated_at=now() WHERE id=$2",[JSON.stringify({...current.booking,receivedAmount:p.received}),job.id]);
   await audit(tx,job.approved_by,'reservation.payment.collected',r.id,{...p,ops:true,jobId:job.id});
  });return {state:'succeeded',externalId:job.external_id};
 }catch(error){
  const state=['OPS_UNCONFIGURED','OPS_DISABLED','OPS_AUTH_REQUIRED','OPS_WRITES_DISABLED','OPS_PAYMENT_UNAVAILABLE'].includes(error.code)?'blocked':error.safe&&![408,429].includes(error.status)?'conflict':writing||job.state==='uncertain'||job.reconcileOnly?'uncertain':'failed';
  await db.query("UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3 AND state='checking' AND booking->>'changeId'=$4",[state,error.code||'OPS_PAYMENT_OUTCOME_UNKNOWN',job.id,c.changeId]);return {state};
 }
}
