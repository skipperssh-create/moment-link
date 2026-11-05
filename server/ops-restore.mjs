import {randomUUID} from 'node:crypto';
import {audit,fail} from './security.mjs';

export async function queueRestoration(tx,row,user){
 const job=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[row.id])).rows[0];
 if(!job)return false;
 if(job.target!=='boatn'||job.state!=='succeeded'||!job.external_id||job.booking.operation==='restore')fail(409,'OPS_RESTORATION_UNRESOLVED','기존 OPS 작업이 완료되지 않아 복원 요청을 보내지 않았습니다. 충돌 건은 재처리하지 않습니다.');
 const b=row.communication?.booking;
 if(!b?.date||!b?.time)fail(409,'OPS_RESTORATION_REVIEW_REQUIRED','복원할 예약 날짜·시간을 확인해 주세요.');
 const {nextBooking,nextDrafts,...original}=job.booking;
 const booking={...original,operation:'restore',changeId:randomUUID(),expected:{date:b.date,time:b.time},requestedBy:user.username};
 await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,state='pending',attempts=0,error_code=NULL,approved_by=$2,updated_at=now() WHERE id=$3",[JSON.stringify(booking),user.id,job.id]);
 await audit(tx,user.id,'ops.restoration.queued',row.id,{jobId:job.id,changeId:booking.changeId});
 return true;
}

export async function processRestoration(db,job,env,adapter){
 let writing=false;
 try{
  const change=job.booking,target=new Date(change.expected.date+'T'+change.expected.time+':00+09:00').toISOString();
  let receipt=await adapter.restorationResult(job.external_ref,change.changeId);
  if(!receipt){
   if(job.reconcileOnly)throw Object.assign(Error('retry limit'),{code:'OPS_RESTORATION_RETRY_LIMIT'});
   const active=(await db.query("SELECT id FROM moment_link.consultations WHERE id=$1 AND status='cancelled' AND deleted_at IS NULL AND expires_at>now()",[job.consultation_id])).rows[0];
   if(!active)throw Object.assign(Error('unavailable'),{code:'CONSULTATION_CLOSED',safe:true});
   if(env.OPS_WRITES_ENABLED!=='true')throw Object.assign(Error('disabled'),{code:'OPS_WRITES_DISABLED',safe:true});
   writing=true;
   receipt=await adapter.restore({externalRef:job.external_ref,bookingId:job.external_id,requestId:change.changeId,expected:change.expected});
  }
  if(receipt?.id!==job.external_id||receipt?.requestId!==change.changeId||receipt?.applied!==true||receipt.bookingState!=='ready'||receipt.departure!==target)throw Error('invalid restoration receipt');
  if(receipt.currentBookingState!=='ready'||receipt.currentDeparture!==target)throw Object.assign(Error('remote changed'),{code:'OPS_RESTORATION_STATE_CHANGED',safe:true});
  await db.transaction(async tx=>{
   const row=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[job.consultation_id])).rows[0];
   const current=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
   if(current?.booking.changeId!==change.changeId||current.state!=='checking')throw Error('restoration claim changed');
   if(!row||row.deleted_at||row.status!=='cancelled')throw Object.assign(Error('unavailable'),{code:'CONSULTATION_CLOSED',safe:true});
   const communication={...row.communication,reservation:{...row.communication?.reservation,restoredAt:new Date().toISOString(),restoredBy:change.requestedBy}};
   await tx.query("UPDATE moment_link.consultations SET status='confirmed',communication=$1,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify(communication),row.id]);
   await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',error_code=NULL,updated_at=now() WHERE id=$1",[job.id]);
   await audit(tx,job.approved_by,'ops.restored',row.id,{jobId:job.id,changeId:change.changeId,externalId:job.external_id});
  });
  return {state:'succeeded',externalId:job.external_id};
 }catch(error){
  const retryable=[408,429].includes(error.status);
  const state=['OPS_UNCONFIGURED','OPS_DISABLED','OPS_AUTH_REQUIRED','OPS_WRITES_DISABLED'].includes(error.code)?'blocked':error.safe&&!retryable?'conflict':writing||job.state==='uncertain'||job.reconcileOnly?'uncertain':'failed';
  await db.query("UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3 AND booking->>'changeId'=$4",[state,error.code||'OPS_RESTORATION_OUTCOME_UNKNOWN',job.id,job.booking.changeId]);
  return {state};
 }
}
