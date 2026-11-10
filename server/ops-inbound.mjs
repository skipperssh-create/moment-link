import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {audit,fail,hash} from './security.mjs';
import '../messages.js';
import {activeReservation,reopenedReservation} from './reservation-workflow.mjs';

const base='/api/integrations/boatn/events';
const state=z.object({state:z.enum(['ready','cancelled']),departure:z.string().datetime()}).strict();
const eventSchema=z.object({version:z.literal(1),eventId:z.string().min(3).max(180),bookingId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),externalRef:z.string().regex(/^moment-link:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),at:z.string().datetime(),before:state,after:state}).strict();
const localState=r=>r.status==='cancelled'?'cancelled':activeReservation(r)?'ready':null;
const localDeparture=r=>{const b=r.communication?.booking;return b?.date&&b?.time?new Date(b.date+'T'+b.time+':00+09:00').toISOString():null;};
const receipt=async(db,eventId)=>(await db.query("SELECT detail FROM moment_link.audit_logs WHERE action='ops.inbound.applied' AND detail->>'eventId'=$1 LIMIT 1",[eventId])).rows[0]?.detail;

export async function receiveOpsEvent(request,db,env){
 if(env.OPS_WRITES_ENABLED!=='true'||env.OPS_BOATN_CONTRACT_VERIFIED!=='true'||!env.OPS_BOATN_TOKEN)fail(503,'OPS_DISABLED','OPS 연결이 중지되어 있습니다.');
 const url=new URL(request.url),method=request.method;
 if(!['GET','POST'].includes(method))fail(405,'METHOD','지원하지 않는 요청입니다.');
 if(Number(request.headers.get('content-length'))>4096)fail(413,'BODY_TOO_LARGE','요청 용량을 확인해 주세요.');
 const raw=method==='POST'?await request.text():'';if(Buffer.byteLength(raw)>4096)fail(413,'BODY_TOO_LARGE','요청 용량을 확인해 주세요.');
 const timestamp=request.headers.get('x-boatn-timestamp')||'',signature=request.headers.get('x-boatn-signature')||'';
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(signature))fail(401,'OPS_AUTH_REQUIRED','연동 인증을 확인해 주세요.');
 const expected=createHmac('sha256',hash(env.OPS_BOATN_TOKEN)).update(['boatn-to-moment-v1',timestamp,method,url.pathname,raw].join('\n')).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))fail(401,'OPS_AUTH_REQUIRED','연동 인증을 확인해 주세요.');
 if(method==='GET'){
  const eventId=decodeURIComponent(url.pathname.slice(base.length+1));if(!eventId||eventId.length>180)fail(400,'OPS_EVENT_INVALID','변경 식별자를 확인해 주세요.');
  const prior=await receipt(db,eventId);if(!prior)fail(404,'NOT_FOUND','처리 결과가 없습니다.');return {eventId,outcome:'applied'};
 }
 if(url.pathname!==base)fail(404,'NOT_FOUND','경로를 확인해 주세요.');
 let parsed;try{parsed=JSON.parse(raw);}catch{fail(400,'OPS_EVENT_INVALID','변경 내용을 확인해 주세요.');}
 const checked=eventSchema.safeParse(parsed);if(!checked.success)fail(400,'OPS_EVENT_INVALID','변경 내용을 확인해 주세요.');
 const event=checked.data,digest=hash(JSON.stringify(event));
 if(event.eventId!==event.bookingId+':'+event.sequence)fail(400,'OPS_EVENT_INVALID','변경 식별자가 일치하지 않습니다.');
 const outcome=outcome=>({eventId:event.eventId,outcome});
 return db.transaction(async tx=>{
  const id=event.externalRef.slice('moment-link:'.length);
  const row=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.deleted_at||new Date(row.expires_at)<=new Date())return outcome('unavailable');
  const job=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[id])).rows[0];
  if(!job||job.target!=='boatn'||job.external_id!==event.bookingId||job.external_ref!==event.externalRef)fail(409,'OPS_LINK_MISMATCH','연결된 예약을 확인해 주세요.');
  const prior=await receipt(tx,event.eventId);
  if(prior){if(prior.digest!==digest)fail(409,'OPS_EVENT_CHANGED','이미 처리된 변경 내용이 다릅니다.');return outcome('applied');}
  // Existing conflicts and unfinished outbound operations are never overwritten.
  if(job.state==='conflict')return outcome('skipped_conflict');
  if(job.state!=='succeeded')fail(503,'OPS_CHANGE_BUSY','진행 중인 변경을 확인하고 있습니다.');
  if(event.sequence<=Number(job.booking.inboundSequence||0))return outcome('stale');
  if(!row.communication?.reservation||!['confirmed','cancelled'].includes(row.status)&&!reopenedReservation(row))return outcome('unavailable');
  const current={state:localState(row),departure:localDeparture(row)};
  const same=value=>value.state===current.state&&Date.parse(value.departure)===Date.parse(current.departure);
  if(!same(event.before)&&!same(event.after)){
   await tx.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='OPS_INBOUND_CONFLICT',booking=$1,updated_at=now() WHERE id=$2",[JSON.stringify({...job.booking,operation:'inbound'}),job.id]);
   await audit(tx,null,'ops.inbound.conflict',id,{eventId:event.eventId});return outcome('skipped_conflict');
  }
  const at=new Date().toISOString(),korean=new Date(Date.parse(event.after.departure)+9*3600000).toISOString(),date=korean.slice(0,10),time=korean.slice(11,16),old=row.communication;
  if(korean.slice(17,23)!=='00.000')fail(400,'OPS_EVENT_INVALID','분 단위 예약시간을 확인해 주세요.');
  const dateChanged=old.booking.date!==date||old.booking.time!==time;
  const booking={...old.booking,date,time},status=event.after.state==='cancelled'?'cancelled':reopenedReservation(row)?row.status:'confirmed';
  const reservation={...old.reservation,updatedAt:at,updatedBy:'BOATN OPS',...(row.status!==status?status==='cancelled'?{cancelledAt:at,cancelledBy:'BOATN OPS'}:{restoredAt:at,restoredBy:'BOATN OPS'}:{})};
  const communication={...old,booking,reservation,opsInbound:{eventId:event.eventId,sequence:event.sequence,at}};
  if(dateChanged){
   communication.opsPreviousDrafts=[...(old.opsPreviousDrafts||[]),{at,eventId:event.eventId,drafts:old.drafts||{}}].slice(-8);
   communication.drafts=Object.fromEntries(['receipt','confirmed','reminder','thanks'].map(stage=>[stage,MomentLinkMessages.generate({...row,communication},stage,booking)]));
  }
  const {nextBooking,nextDrafts,changeId,expected:previousExpected,requestedBy,...original}=job.booking;
  await tx.query('UPDATE moment_link.consultations SET status=$1,communication=$2,version=version+1,updated_at=now() WHERE id=$3',[status,JSON.stringify(communication),id]);
  await tx.query("UPDATE moment_link.integration_jobs SET booking=$1,error_code=NULL,attempts=0,updated_at=now() WHERE id=$2",[JSON.stringify({...original,operation:'inbound',date,time,inboundSequence:event.sequence}),job.id]);
  await audit(tx,null,'ops.inbound.applied',id,{eventId:event.eventId,digest,sequence:event.sequence,before:event.before,after:event.after,statusFrom:row.status,statusTo:status});
  return outcome('applied');
 });
}
