import {createHash} from 'node:crypto';
import {fail} from './security.mjs';

export const boardingEligible=r=>r.category==='yacht'&&['classic','premium','signature'].includes(r.product_id)&&['light','all'].includes(r.package_id);
const digest=value=>createHash('sha256').update(value).digest('hex');
function registrationProblem(job){
 const reasons={OPS_CALENDAR_SYNC_PENDING:'OPS의 최신 캘린더 일정 확인이 지연되고 있습니다.',OPS_AVAILABILITY_EXPIRED:'예약 가능 확인 시간이 지나 재확인이 필요합니다.',OPS_RESOURCE_CONFLICT:'같은 요트의 일정이 겹치거나 운항이 제한되어 있습니다.',OPS_SCHEDULE_REVIEW_REQUIRED:'OPS에서 운항 일정과 탑승 인원을 확인해야 합니다.',OPS_DUPLICATE_REVIEW_REQUIRED:'같은 고객·시간의 예약이 있어 기존 예약 확인이 필요합니다.',OPS_HTTP_429:'OPS 요청이 많아 등록 확인이 지연되고 있습니다.',OPS_HTTP_408:'OPS 응답이 지연되고 있습니다.'};
 const reason=reasons[job?.error_code]||'BOATN OPS 예약 등록이 아직 완료되지 않았습니다.';
 const next=job?.state==='conflict'?'아래 BOATN OPS에서 충돌 사유와 기존 예약을 확인해 주세요. 기존 충돌 건은 재시도하지 않습니다.':Number(job?.attempts||0)>=2?'자동 확인 2회를 마쳤습니다. 아래 BOATN OPS에서 등록 결과를 확인해 주세요.':'아래 BOATN OPS의 등록 상태를 확인하고, 등록 완료 후 문자 준비를 다시 눌러 주세요.';
 return reason+'\n승선신고·보딩패스 링크를 준비할 수 없어 문자 준비를 멈췄습니다.\n'+next;
}
export async function boardingInvitation(tx,r,lookup){
 const b=r.communication?.booking;
 if(r.status!=='confirmed'||r.deleted_at||!b)fail(409,'BOARDING_NOT_CONFIRMED','예약 확정 후 승선신고 안내를 준비해 주세요.');
 const job=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[r.id])).rows[0];
 if(!job||job.target!=='boatn'||job.state!=='succeeded'||!job.external_id)fail(409,'BOARDING_OPS_PENDING',registrationProblem(job));
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
