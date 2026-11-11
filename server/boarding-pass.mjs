import {createHash} from 'node:crypto';
import {fail} from './security.mjs';

export const boardingEligible=r=>r.category==='yacht'&&['classic','premium','signature'].includes(r.product_id)&&['light','all'].includes(r.package_id);
const digest=value=>createHash('sha256').update(value).digest('hex');
export async function boardingInvitation(tx,r,lookup){
 const b=r.communication?.booking;
 if(r.status!=='confirmed'||r.deleted_at||!b)fail(409,'BOARDING_NOT_CONFIRMED','예약 확정 후 승선신고 안내를 준비해 주세요.');
 const job=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[r.id])).rows[0];
 if(!job||job.target!=='boatn'||job.state!=='succeeded'||!job.external_id)fail(409,'BOARDING_OPS_PENDING','OPS 등록 완료 후 문자 준비를 눌러 주세요. 기존 충돌 건은 재시도하지 않습니다.');
 let info;try{info=await lookup(job.external_ref);}catch{fail(503,'BOARDING_LOOKUP_FAILED','OPS 승선신고 링크를 확인하지 못했습니다. 잠시 후 문자 준비를 다시 눌러 주세요.');}
 const expectedDate=Date.parse(b.date+'T'+b.time+':00+09:00');
 if(!info||info.id!==job.external_id||info.recipient!==r.phone.replace(/\D/g,'')||Date.parse(info.departure)!==expectedDate||info.pax!==(b.opsPax||job.booking.pax)||!/^[a-f0-9]{64}$/.test(info.context||'')||!/^https:\/\/boarding\.boatn\.co\.kr\/boarding\/[a-zA-Z0-9_-]+$/.test(info.url||''))fail(409,'BOARDING_MISMATCH','OPS 예약의 연락처·일정·인원 또는 승선신고 링크가 다릅니다. 예약 정보를 먼저 확인해 주세요.');
 return info;
}
export function attachBoardingMessage(message,info,previous){
 let body=message;
 if(previous?.block)body=body.split(previous.block).join('').trim();
 // Never silently keep an independently pasted or obsolete invitation.
 if(/https:\/\/boarding\.boatn\.co\.kr\/boarding\//.test(body))fail(409,'BOARDING_OLD_LINK','본문의 기존 승선신고 링크를 지운 뒤 문자 준비를 눌러 주세요. 최신 링크를 넣어 드립니다.');
 const block='[승선신고·보딩패스]\n승선 전 아래 링크에서 탑승자 정보를 작성해 주세요.\n'+info.url+'\n필수 안내 확인과 승선신고 작성 후 보딩패스를 확인할 수 있습니다.';
 body=body.trim()+'\n\n'+block;
 if(body.length>5000)fail(400,'BOARDING_MESSAGE_TOO_LONG','보딩패스 안내를 포함할 수 있도록 문자 내용을 줄여 주세요.');
 return {body,invitation:{bookingId:info.id,context:info.context,url:info.url,block,digest:digest(body)}};
}
export async function verifyBoardingMessage(tx,r,lookup){
 const saved=r.communication?.boardingInvitation,message=r.communication?.drafts?.confirmed||'';
 if(!saved||saved.digest!==digest(message)||!message.includes(saved.block))fail(409,'BOARDING_PREPARE_REQUIRED','문자 준비를 눌러 최신 승선신고·보딩패스 링크를 포함해 주세요.');
 const current=await boardingInvitation(tx,r,lookup);
 if(current.id!==saved.bookingId||current.context!==saved.context||current.url!==saved.url)fail(409,'BOARDING_CHANGED','OPS 예약이 변경되었습니다. 문자 준비를 다시 눌러 최신 링크를 확인해 주세요.');
 return {bookingId:current.id,context:current.context};
}
