import {assertUnlinked} from './consultation-links.mjs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import '../lovehunter.js';
import {parse,validDate,text,consultationSchema} from './validation.mjs';
import {hash,fail,audit} from './security.mjs';
import {canEdit} from './ownership.mjs';
const LH=globalThis.MomentLinkLoveHunter;
const schema=z.object({
 requestId:z.string().uuid(),phone:consultationSchema.shape.phone,
 person:text(80),memo:z.string().trim().max(4000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)),kind:z.enum(['general','visit']),
 category:z.enum(['undecided','yacht','visit','trunk','heli']),
 receivedDate:z.string().refine(validDate),source:z.enum(['lovehunter','seollem','other']).default('lovehunter'),sourceLabel:text(60).default(''),existingId:z.string().uuid().optional(),separate:z.boolean().default(false)
}).strict();
const names={undecided:'상담 후 상품 선택',yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
export async function createLoveHunterConsultation(db,user,input){
 const d=parse(schema,input),modern=Object.hasOwn(input,'source');
 if(d.source==='other'&&!d.sourceLabel)fail(400,'SOURCE_LABEL','기타 유입경로를 입력해 주세요.');
 if(d.receivedDate>LH.today())fail(400,'REFERRAL_DATE','상담 접수일은 오늘 또는 이전 날짜로 선택해 주세요.');
 const key=hash('lovehunter-request:'+user.id+':'+d.requestId),digest=hash(JSON.stringify(d)),phoneHash=hash('lovehunter-phone:'+d.phone);
 return db.transaction(async tx=>{
  // Global phone lock makes simultaneous staff entries and retries charge exactly once.
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[phoneHash]);
  const saved=(await tx.query('SELECT * FROM moment_link.intake_requests WHERE request_key=$1',[key])).rows[0];
  if(saved){
   if(saved.payload_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT','같은 요청의 내용이 달라졌습니다. 저장 결과를 확인해 주세요.');
   const item=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 AND deleted_at IS NULL AND expires_at>now()',[saved.consultation_id])).rows[0];
   if(!item)fail(409,'CONSULTATION_UNAVAILABLE','기존 접수 기록이 삭제·만료되었습니다. 새 상담에서 다시 입력해 주세요.');
   if(!canEdit(item,user))fail(403,'FORBIDDEN','현재 담당자에게 상담 확인을 요청해 주세요.');
   return {item,replayed:true,charged:false,amount:0};
  }
  const replay=(await tx.query('SELECT * FROM moment_link.consultations WHERE idempotency_hash=$1',[key])).rows[0];
  if(replay){
   if(replay.payload_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT','이미 저장한 요청입니다. 기존 상담을 확인해 주세요.');
   if(replay.deleted_at||new Date(replay.expires_at)<=new Date())fail(409,'CONSULTATION_UNAVAILABLE','이 요청은 이미 저장 후 삭제·만료되었습니다. 새 상담에서 다시 입력해 주세요.');
   return {item:replay,replayed:true,charged:false};
  }
  let linked=null;
  if(modern){
   const matches=(await tx.query("SELECT * FROM moment_link.consultations WHERE regexp_replace(phone,'[^0-9]','','g')=$1 AND deleted_at IS NULL AND expires_at>now() AND NOT EXISTS(SELECT 1 FROM moment_link.consultation_links cl WHERE cl.source_id=consultations.id) ORDER BY (status='confirmed') DESC,created_at DESC LIMIT 100",[d.phone])).rows;
   if(d.existingId){linked=matches.find(r=>r.id===d.existingId);if(!linked||!canEdit(linked,user))fail(403,'FORBIDDEN','연결할 상담의 전화번호와 담당 권한을 확인해 주세요.');}
   else if(matches.length&&!d.separate)return {candidates:matches.filter(r=>canEdit(r,user)).map(r=>({id:r.id,person:r.person,status:r.status,date:r.communication?.booking?.date||'',time:r.communication?.booking?.time||'',product:r.snapshot?.product?.name||''})),restrictedCount:matches.filter(r=>!canEdit(r,user)).length};
  }
  if(linked){linked=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 FOR UPDATE',[linked.id])).rows[0];await assertUnlinked(tx,linked.id);if(!canEdit(linked,user)||linked.deleted_at||new Date(linked.expires_at)<=new Date())fail(409,'CONSULTATION_CHANGED','상담이 변경되었습니다. 다시 선택해 주세요.');}
  let referral=(await tx.query('SELECT * FROM moment_link.lovehunter_referrals WHERE phone_hash=$1 FOR UPDATE',[phoneHash])).rows[0];
  if(!modern&&d.source==='lovehunter'&&referral?.consultation_id){
   const existing=(await tx.query('SELECT id,deleted_at,expires_at FROM moment_link.consultations WHERE id=$1',[referral.consultation_id])).rows[0];
   if(existing&&!existing.deleted_at&&new Date(existing.expires_at)>new Date()){
    return {duplicate:true,consultationId:existing.id,charged:false,receivedDate:referral.received_date,amount:referral.amount};
   }
  }
  const settings=(await tx.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0]?.data;
  if(!Number.isInteger(settings?.retentionDays)||settings.retentionDays<1)fail(400,'RETENTION_REQUIRED','접수·개인정보에서 보유기간을 먼저 설정해 주세요.');
  const at=new Date().toISOString(),id=linked?.id||randomUUID(),receipt='ML-'+id.replaceAll('-','').slice(0,14).toUpperCase(),referralId=referral?.id||randomUUID();
  const snapshot={product:{id:'recommend',name:names[d.category],category:d.category},package:{id:'recommend',name:'상담 후 추천',weekday:null,weekend:null,features:[]},options:[],price:{weekday:null,weekend:null,optionAmount:0},timezone:'Asia/Seoul'};
  const communication={entry:{source:d.source,sourceLabel:d.sourceLabel,...(d.source==='lovehunter'?{referralId}:{}),createdAt:at,createdBy:user.username,nameMissing:!d.person}};
  const consent={source:'staff_entry',recordedBy:user.username,recordedAt:at,retentionDays:settings.retentionDays};
  const item=linked||(await tx.query("INSERT INTO moment_link.consultations(id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,expires_at,status,assignee,contacted,read_at,communication) VALUES($1,$2,$3,$4,$5,$6,$7,'recommend','recommend',$8,$9,'','',$10,now()+make_interval(days=>$11),'consulting',$12,false,now(),$13) RETURNING *",
   [id,receipt,key,digest,d.person||'고객',d.phone,d.category,JSON.stringify(snapshot),JSON.stringify([{date:'',time:''}]),JSON.stringify(consent),settings.retentionDays,user.id,JSON.stringify(communication)])).rows[0];
  if(d.memo)await tx.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),id,user.id,'['+({lovehunter:'러브헌터',seollem:'설렘',other:d.sourceLabel}[d.source])+' 접수 · 직원 전용]\n'+d.memo]);
  const charged=d.source==='lovehunter'&&!referral;
  if(charged)await tx.query('INSERT INTO moment_link.lovehunter_referrals(id,phone_hash,consultation_id,kind,amount,received_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[referralId,phoneHash,id,d.kind,LH.fees[d.kind],d.receivedDate,user.id]);
  else if(d.source==='lovehunter'&&referral&&!referral.consultation_id)await tx.query('UPDATE moment_link.lovehunter_referrals SET consultation_id=$1 WHERE id=$2',[id,referralId]);
  await tx.query('INSERT INTO moment_link.consultation_sources(consultation_id,source,source_label,received_date,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(consultation_id) DO NOTHING',[id,d.source,d.sourceLabel,d.receivedDate,user.id]);
  await tx.query('INSERT INTO moment_link.intake_requests(request_key,payload_hash,consultation_id,charged,amount) VALUES($1,$2,$3,$4,$5)',[key,digest,id,charged,charged?LH.fees[d.kind]:0]);
  if(!linked)await audit(tx,user.id,'ownership.started',id,{source:d.source});
  await audit(tx,user.id,'intake.received',id,{source:d.source,referralId:d.source==='lovehunter'?referralId:null,charged,linked:!!linked});
  return {item,charged,amount:charged?LH.fees[d.kind]:0,replayed:false,linked:!!linked};
 });
}
export async function loveHunterReport(db,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!validDate(month+'-01'))fail(400,'MONTH','조회할 월을 선택해 주세요.');
 const result=await db.query(`SELECT r.id,r.kind,r.amount,r.received_date::text AS received_date,
 CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.id ELSE NULL END AS consultation_id,
 CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.person ELSE NULL END AS person,
 CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.phone ELSE NULL END AS phone,
 CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.status ELSE NULL END AS status
 FROM moment_link.lovehunter_referrals r LEFT JOIN moment_link.consultations c ON c.id=r.consultation_id
 WHERE r.received_date >= $1::date AND r.received_date < ($1::date+interval '1 month')
 ORDER BY r.received_date DESC,r.created_at DESC`,[month+'-01']);
 const totals={general:{count:0,amount:0},visit:{count:0,amount:0},count:0,amount:0};
 for(const row of result.rows){totals[row.kind].count++;totals[row.kind].amount+=row.amount;totals.count++;totals.amount+=row.amount;}
 return {month,totals,items:result.rows};
}
export async function updateLoveHunterCustomer(tx,r,user,input){
 const d=parse(z.object({person:text(80,1),version:z.number().int()}).strict(),input);
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열어 주세요.');
 if(!['lovehunter','seollem','other'].includes(r.communication?.entry?.source)||r.communication?.reservation||['confirmed','closed','cancelled'].includes(r.status))fail(409,'STATE','확정 전 새 상담에서만 성함을 수정할 수 있습니다.');
 const communication={...r.communication,entry:{...r.communication.entry,nameMissing:false},drafts:{}};
 const item=(await tx.query('UPDATE moment_link.consultations SET person=$1,communication=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[d.person,JSON.stringify(communication),r.id])).rows[0];
 await audit(tx,user.id,'lovehunter.customer_updated',r.id,{});
 return {item};
}
