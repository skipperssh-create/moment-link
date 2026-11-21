import {z} from 'zod';
import {parse,consultationSchema} from './validation.mjs';
import {fail,audit,hash} from './security.mjs';
import {canEdit} from './ownership.mjs';
const uuid=z.string().uuid();
const input=z.object({sourceId:uuid,targetId:uuid,sourceVersion:z.number().int(),targetVersion:z.number().int(),requestId:uuid,confirmed:z.literal(true)}).strict();
export const unlinked=(alias='c')=>'NOT EXISTS(SELECT 1 FROM moment_link.consultation_links cl WHERE cl.source_id='+alias+'.id)';
const card=r=>({id:r.id,receipt:r.receipt,person:r.person,status:r.status,version:r.version,date:r.communication?.booking?.date||'',time:r.communication?.booking?.time||'',amount:r.communication?.booking?.amount??null,product:r.snapshot?.product?.name||''});
export async function matchingConsultations(db,user,phone){
 const p=parse(consultationSchema.shape.phone,phone);
 const rows=(await db.query("SELECT c.* FROM moment_link.consultations c WHERE regexp_replace(c.phone,'[^0-9]','','g')=$1 AND c.deleted_at IS NULL AND c.expires_at>now() AND "+unlinked()+" ORDER BY (c.status='confirmed') DESC,c.created_at DESC LIMIT 100",[p])).rows;
 return {items:rows.filter(r=>canEdit(r,user)).map(card),restricted:rows.filter(r=>!canEdit(r,user)).length};
}
export async function linkedDetails(db,id){
 const linked=(await db.query("SELECT l.linked_at,c.* FROM moment_link.consultation_links l JOIN moment_link.consultations c ON c.id=l.source_id WHERE l.target_id=$1 AND c.deleted_at IS NULL AND c.expires_at>now() ORDER BY l.linked_at",[id])).rows;
 const into=(await db.query("SELECT l.target_id,l.linked_at,t.receipt,t.person FROM moment_link.consultation_links l LEFT JOIN moment_link.consultations t ON t.id=l.target_id AND t.deleted_at IS NULL AND t.expires_at>now() WHERE l.source_id=$1",[id])).rows[0];
 const own=(await db.query('SELECT * FROM moment_link.consultation_notes WHERE consultation_id=$1 ORDER BY created_at,id',[id])).rows;
 const notes=[...own];
 for(const source of linked){
  const prefix='[연결된 상담 '+source.receipt+' · 직원 전용]\n';
  if(source.notes)notes.push({id:source.id,body:prefix+source.notes,created_at:source.created_at,actor_id:null});
  const ns=(await db.query('SELECT * FROM moment_link.consultation_notes WHERE consultation_id=$1 ORDER BY created_at,id',[source.id])).rows;
  notes.push(...ns.map(n=>({...n,body:prefix+n.body})));
 }
 notes.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 return {notes,linkedConsultations:linked.map(r=>({...card(r),linkedAt:r.linked_at})),mergedInto:into?{id:into.receipt?into.target_id:null,receipt:into.receipt||'',person:into.person||'',linkedAt:into.linked_at}:null};
}
export async function linkedArchive(db,user){
 const rows=(await db.query("SELECT c.*,l.linked_at,t.id AS target_id,t.receipt AS target_receipt FROM moment_link.consultation_links l JOIN moment_link.consultations c ON c.id=l.source_id LEFT JOIN moment_link.consultations t ON t.id=l.target_id AND t.deleted_at IS NULL AND t.expires_at>now() WHERE c.deleted_at IS NULL AND c.expires_at>now() AND ($1='admin' OR c.assignee=$2) ORDER BY l.linked_at DESC LIMIT 100",[user.role,user.id])).rows;
 return {items:rows.map(r=>({...card(r),linkedAt:r.linked_at,targetId:r.target_id,targetReceipt:r.target_receipt}))};
}
export async function assertUnlinked(db,id){
 if((await db.query('SELECT 1 FROM moment_link.consultation_links WHERE source_id=$1',[id])).rows.length)fail(409,'CONSULTATION_LINKED','기존 예약에 연결된 상담입니다. 연결된 예약에서 이어서 진행해 주세요.');
}
export async function linkConsultations(db,user,data){
 const d=parse(input,data);if(d.sourceId===d.targetId)fail(400,'SAME_RECORD','다른 상담을 선택해 주세요.');
 return db.transaction(async tx=>{
  // Same phone lock as intake; sorted row locks prevent merge chains and concurrent edits.
  const source=(await tx.query('SELECT phone FROM moment_link.consultations WHERE id=$1',[d.sourceId])).rows[0];
  if(!source)fail(404,'NOT_FOUND','연결할 상담을 찾을 수 없습니다.');
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[hash('lovehunter-phone:'+source.phone.replace(/\D/g,''))]);
  const rows=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[d.sourceId,d.targetId]])).rows;
  const from=rows.find(r=>r.id===d.sourceId),to=rows.find(r=>r.id===d.targetId);
  if(!from||!to||rows.some(r=>r.deleted_at||new Date(r.expires_at)<=new Date()))fail(404,'NOT_FOUND','상담이 삭제·만료되었습니다.');
  if(!rows.every(r=>canEdit(r,user)))fail(403,'FORBIDDEN','두 상담의 담당자 또는 관리자가 연결할 수 있습니다.');
  const previous=(await tx.query('SELECT * FROM moment_link.consultation_links WHERE source_id=$1',[from.id])).rows[0];
  if(previous){if(previous.target_id===to.id)return {ok:true,targetId:to.id,replayed:true};fail(409,'ALREADY_LINKED','다른 예약에 이미 연결된 상담입니다.');}
  if(from.version!==d.sourceVersion||to.version!==d.targetVersion)fail(409,'VERSION','상담 내용이 변경되었습니다. 두 상담을 다시 확인해 주세요.');
  if(from.phone.replace(/\D/g,'')!==to.phone.replace(/\D/g,''))fail(400,'PHONE_MISMATCH','같은 전화번호의 상담만 연결할 수 있습니다.');
  if((await tx.query('SELECT 1 FROM moment_link.consultation_links WHERE source_id=$1 OR target_id=$2',[to.id,from.id])).rows.length)fail(409,'LINK_CHAIN','이미 연결된 상담을 다시 연결할 수 없습니다.');
  const b=from.communication?.booking||{};
  if(['confirmed','closed','cancelled'].includes(from.status)||from.communication?.reservation||Number(b.receivedAmount)>0||from.communication?.adjustments?.length||from.communication?.collections?.length)fail(409,'RESERVATION_EXISTS','예약 확정·결제·취소 기록이 있는 상담은 연결할 수 없습니다. 원본 예약을 확인해 주세요.');
  for(const table of ['integration_jobs','event_calendar_jobs','seollem_booking_jobs','naver_contracts','outbox']){
   if((await tx.query('SELECT 1 FROM moment_link.'+table+' WHERE consultation_id=$1 LIMIT 1',[from.id])).rows.length)fail(409,'EXTERNAL_RECORD','이 상담에 OPS·캘린더·계약 기록이 있습니다. 기존 연동 기록을 유지하기 위해 연결하지 않았습니다.');
  }
  for(const table of ['integration_jobs','event_calendar_jobs','seollem_booking_jobs']){
   if((await tx.query("SELECT 1 FROM moment_link."+table+" WHERE consultation_id=$1 AND state='conflict' LIMIT 1",[to.id])).rows.length)fail(409,'OPS_CONFLICT','연결 대상에 OPS 충돌이 있습니다. 충돌 건은 변경하지 않습니다.');
  }
  await tx.query('INSERT INTO moment_link.consultation_links(source_id,target_id,linked_by,source_version,target_version,request_id) VALUES($1,$2,$3,$4,$5,$6)',[from.id,to.id,user.id,from.version,to.version,d.requestId]);
  await tx.query('UPDATE moment_link.lovehunter_referrals SET consultation_id=$2 WHERE consultation_id=$1',[from.id,to.id]);
  await tx.query('UPDATE moment_link.intake_requests SET consultation_id=$2 WHERE consultation_id=$1',[from.id,to.id]);
  await tx.query('INSERT INTO moment_link.consultation_sources(consultation_id,source,source_label,received_date,created_by) SELECT $2,source,source_label,received_date,created_by FROM moment_link.consultation_sources WHERE consultation_id=$1 ON CONFLICT(consultation_id) DO NOTHING',[from.id,to.id]);
  await tx.query('UPDATE moment_link.finance_booking_facts SET merged_into=$2 WHERE consultation_id=$1',[from.id,to.id]);
  await audit(tx,user.id,'consultation.duplicate_linked',from.id,{targetId:to.id,sourceVersion:from.version,targetVersion:to.version});
  await audit(tx,user.id,'consultation.duplicate_received',to.id,{sourceId:from.id});
  return {ok:true,targetId:to.id,replayed:false};
 });
}
