import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import {text,parse,validDate,validatePreferences} from './validation.mjs';
import {fail,audit} from './security.mjs';
import '../pricing.js';
import '../messages.js';
import '../ownership.js';
const stages=z.enum(['receipt','confirmed','reminder','thanks']);
export const bookingSchema=z.object({date:z.union([z.literal(''),text(10).refine(validDate)]),time:z.union([z.literal(''),z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),amount:z.number().int().min(0).max(100000000).nullable(),amountMode:z.enum(['auto','manual']).optional(),place:text(500),scheduleConfirmed:z.boolean(),paymentConfirmed:z.boolean(),extra:text(1000),opsPax:z.number().int().min(1).max(63).optional(),opsPaymentMethod:text(80).optional()}).strict();
const booking=bookingSchema;
const drafts=z.object(Object.fromEntries(['receipt','confirmed','reminder','thanks'].map(k=>[k,text(5000).optional()]))).strict();
export const reservationSchema=z.object({version:z.number().int(),booking,drafts,approved:z.literal(true)}).strict();
export async function saveCommunication(tx,r,user,method,input){
 const old=r.communication||{};
 const changing=(await tx.query("SELECT booking->>'operation' AS operation FROM moment_link.integration_jobs WHERE consultation_id=$1 AND booking->>'operation' IN ('reschedule','cancel','restore','registration_revision') AND state<>'succeeded'",[r.id])).rows[0];
 if(changing?.operation==='restore')fail(409,'OPS_RESTORATION_PENDING','OPS 복원 결과를 확인한 뒤 문자를 준비해 주세요. 복원 완료 전까지 취소 상태가 유지됩니다.');
 if(changing?.operation==='cancel')fail(409,'OPS_CANCELLATION_PENDING','OPS 취소 결과를 확인한 뒤 문자를 준비해 주세요. 취소 완료로 확인되기 전까지 기존 예약 상태가 유지됩니다.');
 if(changing)fail(409,'OPS_SCHEDULE_PENDING','OPS 일정 변경 결과를 확인한 뒤 문자를 준비해 주세요. 기존 확정 일정은 유지됩니다.');
 const d=parse(method==='PUT'?z.object({version:z.number().int(),booking,drafts,prepareStage:stages.optional()}).strict():z.object({version:z.number().int(),stage:stages,kind:z.enum(['composer_requested','manual_sent']),eventId:z.string().uuid()}).strict(),input);
 // Retried clicks cannot duplicate the log, even if the original response was lost.
 if(method==='POST'&&(old.events||[]).some(e=>e.id===d.eventId))return {item:r};
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열고 확인해 주세요.');
 let next;
 if(method==='PUT'){
  const amountProblem=MomentLinkMessages.amountError(d.booking,r);if(amountProblem)fail(400,'PRICE_CHANGED',amountProblem);
  if(old.reservation&&(['date','time','amount','place','opsPax','opsPaymentMethod'].some(k=>d.booking[k]!==old.booking?.[k])||!d.booking.paymentConfirmed||!d.booking.scheduleConfirmed))fail(409,'RESERVATION_CHANGE_REQUIRED',r.status==='confirmed'?'예약 정보 변경 후에는 입금·일정을 확인하고 ‘수정·확정’을 눌러 주세요.':'완료·취소된 예약의 확정 정보는 변경할 수 없습니다.');
  // The server clock anchors the deadline to preparation, never presumed delivery.
  const paymentDeadline=r.category==='yacht'&&d.prepareStage==='receipt'?MomentLinkMessages.paymentDeadlineFrom():old.paymentDeadline;
  next={...old,booking:d.booking,drafts:parse(drafts,MomentLinkMessages.prepareDrafts(r,d.drafts,paymentDeadline)),...(paymentDeadline?{paymentDeadline}:{})};
  await audit(tx,user.id,'communication.saved',r.id);
 }else{
  const problem=MomentLinkMessages.validate(d.stage,old.booking||{},r);
  if(problem)fail(400,'MESSAGE_NOT_READY',problem);
  if(d.kind==='composer_requested'){
   const deadlineProblem=MomentLinkMessages.paymentDeadlineError(r,d.stage,old.paymentDeadline);
   if(deadlineProblem)fail(400,'PAYMENT_DEADLINE_EXPIRED',deadlineProblem);
  }
  const message=old.drafts?.[d.stage];if(!message?.trim())fail(400,'MESSAGE_EMPTY','문구를 먼저 저장해 주세요.');
  const digest=createHash('sha256').update(message).digest('hex');
  next={...old,events:[...(old.events||[]),{id:d.eventId||randomUUID(),stage:d.stage,kind:d.kind,at:new Date().toISOString(),actor:user.displayName||user.username,actorId:user.id,bookingKey:MomentLinkOwnership.bookingKey(r),digest}].slice(-40)};
  await audit(tx,user.id,'communication.'+d.kind,r.id,{stage:d.stage});
 }
 const item=(await tx.query('UPDATE moment_link.consultations SET communication=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(next),r.id])).rows[0];
 return {item};
}

export async function confirmReservation(tx,r,user,input){
 const d=parse(reservationSchema,input);
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열고 확인해 주세요.');
 if(r.status==='cancelled'||(r.status==='closed'&&r.communication?.reservation))fail(409,'STATE','취소·완료된 예약은 다시 확정할 수 없습니다.');
 const problem=MomentLinkMessages.validate('confirmed',d.booking,r);if(problem)fail(400,'BOOKING_NOT_READY',problem);
 validatePreferences([{date:d.booking.date,time:d.booking.time}]);
 // An external booking must continue through its existing change/availability workflow.
 const external=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0];
 if(r.status==='confirmed'&&!r.communication?.reservation)fail(409,'OPS_CHANGE_REQUIRED','OPS에서 확정된 예약의 원래 정보를 확인해 주세요.');
 if(external){
  // A rejected initial registration has no linked OPS reservation to reschedule.
  // Only an explicit new date/time starts a new attempt; historical conflicts
  // are never retried merely by opening the detail or pressing a status button.
  if(external.target==='boatn'&&!external.external_id&&external.state==='conflict'&&[undefined,null,'registration_revision'].includes(external.booking.operation)&&['OPS_RESOURCE_CONFLICT','OPS_SCHEDULE_REVIEW_REQUIRED'].includes(external.error_code)){
   const before=r.communication?.booking,history=external.booking.registrationHistory||[],target=d.booking.date+'T'+d.booking.time;
   if(!before||r.status!=='confirmed'||!r.communication?.reservation)fail(409,'OPS_CHANGE_REQUIRED','기존 확정 정보를 먼저 확인해 주세요.');
   if(['amount','place','opsPax','opsPaymentMethod'].some(k=>d.booking[k]!==before[k]))fail(409,'OPS_SCHEDULE_ONLY','날짜·시간만 변경해 주세요. 금액·장소·인원·결제수단은 유지합니다.');
   if(target===external.booking.date+'T'+external.booking.time||history.some(x=>target===x.date+'T'+x.time))fail(409,'OPS_NEW_SCHEDULE_REQUIRED','이미 확인한 일정은 반복 등록하지 않습니다. 다른 날짜·시간을 선택해 주세요.');
   const previous={date:external.booking.date,time:external.booking.time,state:external.state,attempts:external.attempts,error_code:external.error_code};
   const change={...external.booking,operation:'registration_revision',changeId:randomUUID(),date:d.booking.date,time:d.booking.time,nextBooking:d.booking,nextDrafts:parse(drafts,MomentLinkMessages.prepareDrafts(r,d.drafts,r.communication.paymentDeadline)),requestedBy:user.username,registrationHistory:[...history,previous]};
   await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(change),user.id,external.id]);
   const item=(await tx.query('UPDATE moment_link.consultations SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0];
   await audit(tx,user.id,'ops.registration.revised',r.id,{jobId:external.id,changeId:change.changeId,previous,next:{date:change.date,time:change.time}});
   return {item};
  }
  if(external.target!=='boatn'||external.state!=='succeeded'||!external.external_id)fail(409,'OPS_CHANGE_REQUIRED','OPS 등록 또는 이전 일정 변경이 완료된 후 수정·확정할 수 있습니다. 기존 충돌 작업은 재시도하지 않습니다.');
  const before=r.communication?.booking;
  if(!before||['amount','place','opsPax','opsPaymentMethod'].some(k=>d.booking[k]!==before[k]))fail(409,'OPS_SCHEDULE_ONLY','연결된 OPS 예약은 여기서 날짜·시간만 변경할 수 있습니다. 금액·장소·인원·결제수단은 기존 값을 유지해 주세요.');
  if(before.date!==d.booking.date||before.time!==d.booking.time){
   const change={...external.booking,operation:'reschedule',changeId:randomUUID(),date:d.booking.date,time:d.booking.time,expected:{date:before.date,time:before.time},nextBooking:d.booking,nextDrafts:parse(drafts,MomentLinkMessages.prepareDrafts(r,d.drafts,r.communication.paymentDeadline)),requestedBy:user.username};
   await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(change),user.id,external.id]);
   const item=(await tx.query('UPDATE moment_link.consultations SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0];
   await audit(tx,user.id,'ops.schedule.queued',r.id,{jobId:external.id,changeId:change.changeId});
   return {item};
  }
 }
 const old=r.communication||{},at=new Date().toISOString();
 const automatic=r.category==='yacht'&&['classic','premium','signature'].includes(r.product_id)&&['light','all'].includes(r.package_id);
 if(automatic&&(!d.booking.opsPax||!d.booking.opsPaymentMethod))fail(400,'OPS_BOOKING_FIELDS_REQUIRED','OPS 등록을 위해 탑승 인원과 확인한 결제수단을 선택해 주세요.');
 const next={...old,booking:d.booking,drafts:parse(drafts,MomentLinkMessages.prepareDrafts(r,d.drafts,old.paymentDeadline)),reservation:{...old.reservation,source:'manual',confirmedAt:old.reservation?.confirmedAt||at,confirmedBy:old.reservation?.confirmedBy||user.username,updatedAt:at,updatedBy:user.username}};
 const item=(await tx.query("UPDATE moment_link.consultations SET status='confirmed',communication=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *",[JSON.stringify(next),r.id])).rows[0];
 if(automatic&&!external){
  const job={person:r.person,phone:r.phone,productId:r.product_id,packageId:r.package_id,date:d.booking.date,time:d.booking.time,amount:d.booking.amount,place:d.booking.place,pax:d.booking.opsPax,paymentMethod:d.booking.opsPaymentMethod};
  await tx.query('INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),r.id,'boatn','moment-link:'+r.id,user.id,JSON.stringify(job)]);
  await audit(tx,user.id,'ops.queued',r.id,{target:'boatn'});
 }
 await audit(tx,user.id,old.reservation?'reservation.updated':'reservation.confirmed',r.id,{from:r.status,to:'confirmed'});
 return {item};
}
