import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import '../contract-payment.js';
import {parse,text,validDate} from './validation.mjs';
import {fail,hash,audit} from './security.mjs';
const C=globalThis.MomentLinkContract,won=z.number().int().min(0).max(10000000000);
const schema=z.object({version:z.number().int().min(0),raw:text(4000),phone:z.string(),gross:won.refine(n=>n>0),paidDate:z.string().refine(validDate),remitted:won.nullable(),remittedDate:z.string().refine(v=>v===''||validDate(v)),reviewText:text(600),fireworksUnits:z.number().int().min(0).max(1000),status:z.enum(['active','cancelled']),confirmed:z.literal(true)}).strict();
const snapshot=r=>({amount:r.communication?.booking?.amount??null,refundedAmount:r.communication?.booking?.refundedAmount??null});
export function contractView(r,c){
 if(!c)return null;
 return {id:c.id,version:c.version,gross:Number(c.gross),fee:Number(c.fee),expectedNet:Number(c.expected_net),remitted:c.remitted===null?null:Number(c.remitted),paidDate:String(c.paid_date).slice(0,10),remittedDate:c.remitted_date?String(c.remitted_date).slice(0,10):'',status:c.status,reviewText:c.review_text,fireworksUnits:c.fireworks_units,syncState:c.sync_state,syncError:c.sync_error,bookingChanged:snapshot(r).amount!==c.booking_snapshot.amount||snapshot(r).refundedAmount!==c.booking_snapshot.refundedAmount,bookingAmount:r.communication?.booking?.amount??null};
}
export async function readNaverContract(tx,r){
 const c=(await tx.query('SELECT *,paid_date::text AS paid_date,remitted_date::text AS remitted_date FROM moment_link.naver_contracts WHERE consultation_id=$1',[r.id])).rows[0];
 const history=c?(await tx.query("SELECT revision,action,data,h.created_at,COALESCE(u.username,'삭제된 계정') AS actor FROM moment_link.naver_contract_history h LEFT JOIN moment_link.admin_users u ON u.id=h.actor_id WHERE contract_id=$1 ORDER BY revision DESC LIMIT 30",[c.id])).rows:[];
 return {contract:contractView(r,c),history};
}
export async function saveNaverContract(tx,r,user,input){
 const d=parse(schema,input),before=(await tx.query('SELECT * FROM moment_link.naver_contracts WHERE consultation_id=$1 FOR UPDATE',[r.id])).rows[0],parsed=C.parse(d.raw),phone=C.cleanPhone(d.phone);
 if(phone!==C.cleanPhone(r.phone))fail(409,'CONTRACT_PHONE','계약 전화번호가 현재 고객과 다릅니다. 해당 고객의 네임카드를 열어 주세요.');
 if((!before&&!d.raw)||d.raw&&(parsed.phones.length!==1||parsed.phone!==phone))fail(400,'CONTRACT_PHONE','계약 원문에 이 고객의 전화번호 한 개가 있어야 합니다.');
 const today=new Date(Date.now()+32400000).toISOString().slice(0,10);
 if(d.paidDate>today||d.remittedDate>today)fail(400,'CONTRACT_DATE','결제일·정산 입금일은 오늘까지 선택할 수 있습니다.');
 const {fee,expectedNet}=C.calculate(d.gross);
 if(d.remitted!==null&&(d.remitted>expectedNet||!d.remittedDate))fail(400,'REMITTANCE','실제 정산 입금액은 입금 예정액 이하로, 입금일과 함께 입력해 주세요.');
 if(d.remitted===null&&d.remittedDate)fail(400,'REMITTANCE','입금액을 확인하지 않았다면 입금일도 비워 주세요.');
 const shots=d.reviewText.match(/폭죽\s*(\d[\d,]*)\s*발/);if(shots&&Number(shots[1].replaceAll(',',''))!==d.fireworksUnits*30)fail(400,'REVIEW_QUANTITY','폭죽 발수와 수량을 확인해 주세요. 300발은 10개입니다.');
 if(d.fireworksUnits&&!d.reviewText)fail(400,'REVIEW','리뷰 이벤트 내용을 입력해 주세요.');
 const digest=hash(JSON.stringify({...d,version:0,raw:'',bookingSnapshot:snapshot(r)}));
 if(before?.digest===digest)return {...await readNaverContract(tx,r),replayed:true};
 if((before?.version||0)!==d.version)fail(409,'VERSION','계약 기록이 변경되었습니다. 다시 열어 확인해 주세요.');
 const id=before?.id||randomUUID(),requestId=randomUUID(),revision=(before?.version||0)+1;
 const reviewChanged=!before||before.review_text!==d.reviewText||before.fireworks_units!==d.fireworksUnits||before.status!==d.status;
 const syncState='waiting';
 await tx.query(`INSERT INTO moment_link.naver_contracts(id,consultation_id,fact_id,gross,fee,expected_net,remitted,paid_date,remitted_date,status,booking_snapshot,review_text,fireworks_units,version,digest,sync_state,sync_attempts,sync_error,sync_request,created_by,updated_by)
 VALUES($1,$2,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
 ON CONFLICT(consultation_id) DO UPDATE SET gross=$3,fee=$4,expected_net=$5,remitted=$6,paid_date=$7,remitted_date=NULLIF($8,'')::date,status=$9,booking_snapshot=$10,review_text=$11,fireworks_units=$12,version=$13,digest=$14,sync_state=$15,sync_attempts=$16,sync_error=$17,sync_request=$18,updated_by=$19,updated_at=now()`,
 [id,r.id,d.gross,fee,expectedNet,d.remitted,d.paidDate,d.remittedDate,d.status,JSON.stringify(snapshot(r)),d.reviewText,d.fireworksUnits,revision,digest,syncState,0,null,requestId,user.id]);
 const data={gross:d.gross,fee,expectedNet,remitted:d.remitted,paidDate:d.paidDate,remittedDate:d.remittedDate,status:d.status,fireworksUnits:d.fireworksUnits};
 await tx.query('INSERT INTO moment_link.naver_contract_history(id,contract_id,revision,action,data,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,revision,d.status==='cancelled'?'계약 정산 제외':'계약 결제 저장',JSON.stringify(data),user.id]);
 if(d.raw)await tx.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),r.id,user.id,'[러브헌터 계약 · 네이버 결제 · 직원 전용]\n'+d.raw]);
 if(reviewChanged)await tx.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),r.id,user.id,'[리뷰 이벤트 · 최신 계약 '+revision+'차]\n'+(d.status==='cancelled'?'계약 취소 · 제공 제외':d.reviewText||'리뷰 이벤트 없음')+(d.status==='active'&&d.fireworksUnits?'\n폭죽 '+d.fireworksUnits*30+'발 = '+d.fireworksUnits+'개 (30발/개, '+d.fireworksUnits/10+'묶음) · 무료 제공':'')]);
 await audit(tx,user.id,'contract.saved',r.id,{contractId:id,revision,gross:d.gross,fee,status:d.status});
 return {...await readNaverContract(tx,r),replayed:false};
}
export async function dispatchContractReviews(db,env,adapter,consultationId){
 if(env.OPS_WRITES_ENABLED!=='true')return;
 const rows=(await db.query(`SELECT n.*,j.external_ref,j.external_id,c.category FROM moment_link.naver_contracts n JOIN moment_link.consultations c ON c.id=n.consultation_id JOIN moment_link.integration_jobs j ON j.consultation_id=c.id WHERE ($1::uuid IS NULL OR c.id=$1) AND c.deleted_at IS NULL AND c.expires_at>now() AND c.status IN ('confirmed','closed') AND j.target='boatn' AND j.state='succeeded' AND j.external_id IS NOT NULL AND n.sync_attempts<2 AND (n.sync_state='waiting' OR (n.sync_state IN ('failed','sending') AND n.updated_at<now()-interval '4 minutes')) LIMIT 2`,[consultationId||null])).rows;
 for(const row of rows){
  const claim=await db.query("UPDATE moment_link.naver_contracts SET sync_state='sending',sync_attempts=sync_attempts+1,updated_at=now() WHERE id=$1 AND version=$2 AND sync_state=$3 AND sync_attempts=$4 RETURNING id",[row.id,row.version,row.sync_state,row.sync_attempts]);if(!claim.rows.length)continue;
  try{
   if(!adapter.reviewEvent)throw Error('지원되지 않는 OPS');
   const result=await adapter.reviewEvent({externalRef:row.external_ref,bookingId:row.external_id,requestId:row.sync_request,revision:row.version,reviewText:row.status==='active'?row.review_text:'',fireworksUnits:row.status==='active'?row.fireworks_units:0});
   if(result?.requestId!==row.sync_request||result?.revision!==row.version)throw Error('응답 확인 필요');
   await db.query("UPDATE moment_link.naver_contracts SET sync_state='succeeded',sync_error=NULL,updated_at=now() WHERE id=$1 AND version=$2",[row.id,row.version]);
  }catch{await db.query("UPDATE moment_link.naver_contracts SET sync_state='failed',sync_error='리뷰 이벤트 OPS 반영을 확인하지 못했습니다. 최대 2회까지 확인합니다.',updated_at=now() WHERE id=$1 AND version=$2",[row.id,row.version]);}
 }
}
