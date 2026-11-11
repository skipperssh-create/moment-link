import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {fail,hash} from './security.mjs';
import {parse} from './validation.mjs';

// A read-only projection for OPS. It never dispatches, retries or edits a job.
export async function readOpsConsultationStatuses(request,db,env){
 if(env.OPS_WRITES_ENABLED!=='true'||env.OPS_BOATN_CONTRACT_VERIFIED!=='true'||!env.OPS_BOATN_TOKEN)fail(503,'OPS_DISABLED','OPS 연결을 확인해 주세요.');
 if(request.method!=='POST')fail(405,'METHOD','지원하지 않는 요청입니다.');
 if(Number(request.headers.get('content-length'))>16000)fail(413,'BODY_TOO_LARGE','요청 용량을 확인해 주세요.');
 const raw=await request.text();if(Buffer.byteLength(raw)>16000)fail(413,'BODY_TOO_LARGE','요청 용량을 확인해 주세요.');
 const at=request.headers.get('x-boatn-timestamp')||'',sig=request.headers.get('x-boatn-signature')||'';
 if(!/^\d{13}$/.test(at)||Math.abs(Date.now()-Number(at))>300000||!/^[a-f0-9]{64}$/.test(sig))fail(401,'OPS_AUTH_REQUIRED','연동 인증을 확인해 주세요.');
 const expected=createHmac('sha256',hash(env.OPS_BOATN_TOKEN)).update(['boatn-to-moment-v1',at,'POST',new URL(request.url).pathname,raw].join('\n')).digest();
 if(!timingSafeEqual(expected,Buffer.from(sig,'hex')))fail(401,'OPS_AUTH_REQUIRED','연동 인증을 확인해 주세요.');
 let value;try{value=JSON.parse(raw);}catch{fail(400,'JSON','요청을 확인해 주세요.');}
 const {bookingIds}=parse(z.object({bookingIds:z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)).min(1).max(100)}).strict(),value);
 const rows=(await db.query(`SELECT j.external_id AS id,c.status,c.communication,c.updated_at AS "updatedAt",j.state AS "syncState"
  FROM moment_link.consultations c JOIN moment_link.integration_jobs j ON j.consultation_id=c.id
  WHERE j.target='boatn' AND j.external_id=ANY($1::text[]) AND c.deleted_at IS NULL AND c.expires_at>now()`,[[...new Set(bookingIds)]])).rows;
 const items=rows.map(({communication,...item})=>{
  if(item.syncState!=='succeeded'||item.status!=='confirmed')return item;
  const b=communication?.booking,key=[b?.date||'',b?.time||''].join('T');
  const notice=communication?.boardingNotice;
  return notice?.bookingKey===key&&notice.bookingId===item.id&&/^[a-f0-9]{64}$/.test(notice.context)&&Number.isFinite(Date.parse(notice.at))&&typeof notice.by==='string'?{...item,boardingNotice:{status:'manual_confirmed',at:notice.at,by:notice.by.slice(0,120),context:notice.context}}:item;
 });
 return {items,checkedAt:new Date().toISOString()};
}
