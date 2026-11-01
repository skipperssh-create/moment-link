import {z} from 'zod';
import {audit,fail} from './security.mjs';
import {parse} from './validation.mjs';

// Delete all dependent PII in the same transaction, including saved message drafts.
export async function eraseConsultations(tx,ids){
 if(!ids.length)return;
 for(const table of ['consultation_notes','outbox','integration_jobs'])await tx.query(`DELETE FROM moment_link.${table} WHERE consultation_id=ANY($1::uuid[])`,[ids]);
 await tx.query('DELETE FROM moment_link.audit_logs WHERE entity_id=ANY($1::text[])',[ids]);
 await tx.query('DELETE FROM moment_link.consultations WHERE id=ANY($1::uuid[])',[ids]);
}
export async function changeTrash(tx,r,user,action,input){
 const d=parse(z.object({version:z.number().int().positive(),...(action==='permanent'?{approved:z.literal(true)}:{})}).strict(),input);
 if(r.version!==d.version)fail(409,'VERSION','다른 관리자가 변경했습니다. 목록을 새로고침해 주세요.');
 if(action==='trash'){
  if(r.deleted_at)fail(409,'STATE','이미 휴지통에 있는 상담입니다.');
  // Serialize with job claims so deleting a pending job cannot race a send/create.
  const notifications=(await tx.query('SELECT state,provider_id FROM moment_link.outbox WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows;
  const integrations=(await tx.query('SELECT state FROM moment_link.integration_jobs WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows;
  if(notifications.some(j=>['sending','uncertain'].includes(j.state)||(j.provider_id&&j.state!=='sent'))||integrations.some(j=>['checking','uncertain'].includes(j.state)))fail(409,'JOB_UNRESOLVED','진행 중인 발송·OPS 작업의 결과를 먼저 확인해 주세요.');
  await tx.query("UPDATE moment_link.outbox SET state='blocked',error_code='CONSULTATION_TRASHED',updated_at=now() WHERE consultation_id=$1 AND state IN ('pending','failed','blocked')",[r.id]);
  await tx.query("UPDATE moment_link.integration_jobs SET state='blocked',error_code='CONSULTATION_TRASHED',updated_at=now() WHERE consultation_id=$1 AND state IN ('pending','failed','blocked')",[r.id]);
  const item=(await tx.query("UPDATE moment_link.consultations SET deleted_at=now(),delete_after=LEAST(expires_at,now()+interval '7 days'),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",[r.id])).rows[0];
  await audit(tx,user.id,'consultation.trashed',r.id);return {item};
 }
 if(!r.deleted_at)fail(409,'STATE','휴지통에 있는 상담만 복원하거나 영구 삭제할 수 있습니다.');
 if(action==='restore'){
  const item=(await tx.query('UPDATE moment_link.consultations SET deleted_at=NULL,delete_after=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id])).rows[0];
  await audit(tx,user.id,'consultation.restored',r.id);return {item};
 }
 await eraseConsultations(tx,[r.id]);
 await audit(tx,user.id,'trash.permanently_deleted','maintenance',{count:1});return {deleted:1};
}
export async function emptyTrash(db,user,input){
 const d=parse(z.object({before:z.string().datetime(),approved:z.literal(true)}).strict(),input);
 if(Date.parse(d.before)>Date.now()+5000)fail(400,'TRASH_CUTOFF','목록을 새로고침해 주세요.');
 return db.transaction(async tx=>{
  // Whole trash, not just the current search/page. Newer deletions stay recoverable.
  const ids=(await tx.query('SELECT id FROM moment_link.consultations WHERE deleted_at IS NOT NULL AND deleted_at<=$1 ORDER BY id FOR UPDATE',[d.before])).rows.map(r=>r.id);
  await eraseConsultations(tx,ids);
  if(ids.length)await audit(tx,user.id,'trash.emptied','maintenance',{count:ids.length});
  return {deleted:ids.length};
 });
}
