import {activeReservation} from './reservation-workflow.mjs';
import {audit} from './security.mjs';

const departure=(date,time)=>new Date(date+'T'+time+':00+09:00').toISOString();
export async function processScheduleChange(db,job,env,adapter){
 let writing=false;
 try{
  const change=job.booking,target=departure(change.date,change.time);
  let receipt=await adapter.scheduleResult(job.external_ref,change.changeId);
  if(!receipt){
   if(job.reconcileOnly)throw Object.assign(Error('retry limit'),{code:'OPS_SCHEDULE_RETRY_LIMIT'});
   const active=(await db.query("SELECT * FROM moment_link.consultations WHERE id=$1 AND status NOT IN ('closed','cancelled') AND deleted_at IS NULL AND expires_at>now()",[job.consultation_id])).rows[0];
   if(!activeReservation(active))throw Object.assign(Error('unavailable'),{code:'CONSULTATION_CLOSED',safe:true});
   if(env.OPS_WRITES_ENABLED!=='true')throw Object.assign(Error('disabled'),{code:'OPS_WRITES_DISABLED',safe:true});
   writing=true;
   receipt=await adapter.reschedule({externalRef:job.external_ref,bookingId:job.external_id,requestId:change.changeId,expected:change.expected,date:change.date,time:change.time});
  }
  if(receipt?.id!==job.external_id||receipt?.requestId!==change.changeId||receipt?.applied!==true||receipt.departure!==target)throw Error('invalid schedule receipt');
  if(receipt.currentDeparture!==target)throw Object.assign(Error('remote changed'),{code:'OPS_SCHEDULE_CHANGED',safe:true});
  await db.transaction(async tx=>{
   const row=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[job.consultation_id])).rows[0];
   const current=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];
   if(current?.booking.changeId!==change.changeId||current.state!=='checking')throw Error('schedule claim changed');
   if(!activeReservation(row)||row.deleted_at)throw Object.assign(Error('unavailable'),{code:'CONSULTATION_CLOSED',safe:true});
   const communication={...row.communication,booking:change.nextBooking,drafts:change.nextDrafts,reservation:{...row.communication.reservation,updatedAt:new Date().toISOString(),updatedBy:change.requestedBy}};
   await tx.query("UPDATE moment_link.consultations SET status='confirmed',communication=$1,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify(communication),row.id]);
   await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',error_code=NULL,updated_at=now() WHERE id=$1",[job.id]);
   if(row.status!=='confirmed')await audit(tx,job.approved_by,'reservation.confirmed',row.id,{from:row.status,to:'confirmed'});
   await audit(tx,job.approved_by,'ops.schedule.updated',row.id,{jobId:job.id,changeId:change.changeId,externalId:job.external_id});
  });
  return {state:'succeeded',externalId:job.external_id};
 }catch(error){
  const retryable=[408,429].includes(error.status)||['OPS_CALENDAR_SYNC_PENDING','OPS_AVAILABILITY_EXPIRED'].includes(error.code);
  const state=['OPS_UNCONFIGURED','OPS_DISABLED','OPS_AUTH_REQUIRED','OPS_WRITES_DISABLED'].includes(error.code)?'blocked':error.safe&&!retryable?'conflict':writing||job.state==='uncertain'||job.reconcileOnly?'uncertain':'failed';
  await db.query('UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3 AND booking->>\'changeId\'=$4',[state,error.code||'OPS_SCHEDULE_OUTCOME_UNKNOWN',job.id,job.booking.changeId]);
  return {state};
 }
}
