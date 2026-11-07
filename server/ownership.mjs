import {fail,audit} from './security.mjs';
import '../ownership.js';

export const canEdit=(r,user)=>user.role==='admin'||r.assignee===user.id;
export const canClaim=r=>!r.assignee&&!r.deleted_at&&!['cancelled','closed'].includes(r.status);
export const staffQuery="SELECT u.id,u.username,u.role,u.active,u.must_change_password AS \"mustChangePassword\",COALESCE(p.data->>'name',u.username) AS \"displayName\" FROM moment_link.admin_users u LEFT JOIN moment_link.config p ON p.id='staff:'||u.id::text ORDER BY u.username";

export async function claim(tx,r,user,version){
 if(r.assignee===user.id)return r;
 if(r.assignee)fail(409,'ALREADY_ASSIGNED','다른 직원이 먼저 담당했습니다. 새로고침해 주세요.');
 if(!canClaim(r))fail(409,'STATE','진행 가능한 상담만 시작할 수 있습니다.');
 if(r.version!==version)fail(409,'VERSION','상담 내용이 변경되었습니다. 새로고침해 주세요.');
 const item=(await tx.query("UPDATE moment_link.consultations SET assignee=$1,status=CASE WHEN status='new' THEN 'consulting' ELSE status END,version=version+1,updated_at=now() WHERE id=$2 RETURNING *",[user.id,r.id])).rows[0];
 await audit(tx,user.id,'ownership.started',r.id,{from:null,to:user.id,statusFrom:r.status,statusTo:item.status});
 return item;
}

// Existing admin workflows also acquire responsibility on the first meaningful write.
// Reads do not claim a customer, and existing owners are never replaced implicitly.
export async function acquireForWork(tx,r,user){
 if(r.assignee)return;
 await tx.query('UPDATE moment_link.consultations SET assignee=$1 WHERE id=$2',[user.id,r.id]);
 r.assignee=user.id;
 await audit(tx,user.id,'ownership.started',r.id,{from:null,to:user.id});
}

export async function validateTransfer(tx,r,user,next,reason){
 if(next===undefined||next===r.assignee)return;
 if(user.role!=='admin')fail(403,'FORBIDDEN','관리자만 담당자를 변경할 수 있습니다.');
 if(r.assignee&&!next)fail(400,'ASSIGNEE_REQUIRED','진행 중인 상담은 인계받을 담당자를 선택해 주세요.');
 if(r.assignee&&!reason?.trim())fail(400,'HANDOVER_REASON','담당자를 바꾸는 인계 사유를 입력해 주세요.');
 if(next&&!(await tx.query('SELECT id FROM moment_link.admin_users WHERE id=$1 AND active=true',[next])).rows.length)fail(400,'ASSIGNEE','사용 중인 직원 계정을 선택해 주세요.');
 await audit(tx,user.id,r.assignee?'ownership.transferred':'ownership.assigned',r.id,{from:r.assignee,to:next,reason:reason?.trim()||''});
}

// Same rules as ownership.js, evaluated before pagination so counts and pages agree.
export const reminderDueSql=`(c.status='confirmed' AND COALESCE(c.communication->'booking'->>'date','')<>''
 AND c.communication->'booking'->>'date'<=((now() AT TIME ZONE 'Asia/Seoul')::date+1)::text
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(c.communication->'events','[]'::jsonb)) event
 WHERE event->>'stage'='reminder' AND event->>'kind'='manual_sent'
 AND (event->>'bookingKey' IS NULL OR event->>'bookingKey'=COALESCE(c.communication->'booking'->>'date','')||'T'||COALESCE(c.communication->'booking'->>'time',''))
 AND (event->>'at')::timestamptz>=GREATEST(COALESCE((c.communication->'reservation'->>'confirmedAt')::timestamptz,'epoch'::timestamptz),COALESCE((c.communication->'reservation'->>'updatedAt')::timestamptz,'epoch'::timestamptz),COALESCE((c.communication->'reservation'->>'restoredAt')::timestamptz,'epoch'::timestamptz))))`;
