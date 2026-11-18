import {createHash,randomUUID} from 'node:crypto';
const calendarId='451b4eba1a4f1aa0e691580a3231bbd557d5d6c779038db5a05c5aea89f5f5fa@group.calendar.google.com';
const statuses={confirmed:'확정',closed:'완료',cancelled:'취소',new:'접수중',consulting:'상담중',initial_unreachable:'연락안됨',no_response:'답변없음',awaiting_payment:'입금대기',hold:'보류'};
const money=v=>Number.isSafeInteger(v)?v.toLocaleString('ko-KR')+'원':'미입력';
export function calendarRequest(job){
 const r=job.desired,b=r.booking,s=r.snapshot||{},kind=r.category==='trunk'?'트렁크':'출장';
 const selected=(s.options||[]).filter(x=>!b.excludedOptionIds?.includes(x.id)).map(x=>x.name||x.label).filter(Boolean).join(', ');
 const addOns=(b.addOns||[]).map(x=>(x.description||({bouquet:'꽃다발',bouquet_custom:'꽃다발',cake:'케이크',wine_bottle:'와인',fireworks:'폭죽'}[x.id])||x.id)+' '+x.quantity+'개 · '+money(x.unitAmount*x.quantity));
 const lines=['접수번호: '+r.receipt,'고객: '+r.person,'연락처: '+r.phone,'상태: '+(statuses[r.status]||r.status),'일정: '+b.date+' '+b.time,'장소: '+b.place,'상품: '+[s.product?.name,s.package?.name].filter(Boolean).join(' · '),...(selected?['상품 선택: '+selected]:[]),...(addOns.length?['추가 구매: '+addOns.join(', ')]:[]),'총액: '+money(b.amount),'입금액: '+money(b.receivedAmount),'잔금: '+money(Number.isSafeInteger(b.receivedAmount)&&Number.isSafeInteger(b.amount)?Math.max(0,b.amount-b.receivedAmount):null),...(r.notes?['고객 요청: '+r.notes]:[]),...(b.extra?['추가 안내: '+b.extra]:[]),...(b.adjustmentNote?['옵션 취소·환불: '+b.adjustmentNote]:[]),'','캘린더의 종료 시각은 표시용입니다. 실제 설치·진행·철거 시간은 담당자와 확인합니다.'];
 const payload={externalRef:'moment-link:'+r.id,receipt:r.receipt,category:r.category,summary:'['+kind+' '+(statuses[r.status]||r.status)+'] '+r.person+' · '+(s.package?.name||'예약'),description:lines.join('\n'),location:b.place||'',start:b.date+'T'+b.time+':00+09:00',cancelled:r.status==='cancelled'};
 return {...payload,digest:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),revision:job.revision,eventId:job.event_id||null,previous:job.remote_snapshot||null};
}
function adapter(env){
 return {sync:async data=>{
  const base=env.OPS_BOATN_BASE_URL,token=env.OPS_BOATN_TOKEN;
  if(!base||!token)throw Object.assign(Error('configuration'),{code:'CALENDAR_CONNECTION_UNAVAILABLE'});
  const url=new URL('non-yacht-calendar',base.endsWith('/')?base:base+'/');
  if(url.protocol!=='https:'||url.username||url.password)throw Object.assign(Error('configuration'),{code:'CALENDAR_CONFIGURATION'});
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(26000)});
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error('calendar request failed'),{code:/^CALENDAR_[A-Z0-9_]+$/.test(result.code||'')?result.code:'CALENDAR_HTTP_'+response.status,conflict:response.status===409});
  return result;
 }};
}
export async function dispatchEventCalendars(db,env,adapters={},id){
 if(env.EVENT_CALENDAR_ENABLED!=='true')return {enabled:false,processed:0};
 await db.query("UPDATE moment_link.event_calendar_jobs SET state='failed',error_code='CALENDAR_WORKER_INTERRUPTED',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE state='processing' AND attempts=2 AND lease_until<now()");
 const candidates=(await db.query(`SELECT consultation_id FROM moment_link.event_calendar_jobs WHERE state IN ('pending','failed','processing') AND attempts<2 AND (lease_until IS NULL OR lease_until<now()) AND ($1::uuid IS NULL OR consultation_id=$1) ORDER BY updated_at LIMIT 5`,[id||null])).rows;
 const results=await Promise.all(candidates.map(async({consultation_id})=>{
  const lease=randomUUID();
  const job=(await db.query(`UPDATE moment_link.event_calendar_jobs SET state='processing',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '2 minutes',updated_at=now() WHERE consultation_id=$1 AND state IN ('pending','failed','processing') AND attempts<2 AND (lease_until IS NULL OR lease_until<now()) RETURNING *`,[consultation_id,lease])).rows[0];
  if(!job)return 'skipped';
  try{
   const request=calendarRequest(job),result=await (adapters.eventCalendar||adapter(env)).sync(request);
   if(typeof result?.id!=='string'||!/^[a-zA-Z0-9_-]{1,1024}$/.test(result.id)||result.digest!==request.digest||typeof result.snapshot?.etag!=='string')throw Object.assign(Error('response'),{code:'CALENDAR_VERIFY_FAILED'});
   await db.query(`UPDATE moment_link.event_calendar_jobs SET event_id=$3,remote_snapshot=$4,synced_revision=$5,state=CASE WHEN revision=$5 THEN 'synced' ELSE 'pending' END,attempts=CASE WHEN revision=$5 THEN attempts ELSE 0 END,error_code=NULL,lease_token=NULL,lease_until=NULL,synced_at=now(),updated_at=now() WHERE consultation_id=$1 AND lease_token=$2`,[consultation_id,lease,result.id,JSON.stringify(result.snapshot),job.revision]);
   return 'synced';
  }catch(error){
   const code=/^CALENDAR_[A-Z0-9_]+$/.test(error.code||'')?error.code:'CALENDAR_CONNECTION_FAILED';
   await db.query(`UPDATE moment_link.event_calendar_jobs SET state=CASE WHEN revision<>$3 THEN 'pending' WHEN $5 THEN 'conflict' ELSE 'failed' END,attempts=CASE WHEN revision<>$3 THEN 0 ELSE attempts END,error_code=$4,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE consultation_id=$1 AND lease_token=$2`,[consultation_id,lease,job.revision,code,!!error.conflict]);
   return 'failed';
  }
 }));
 return {enabled:true,processed:results.filter(x=>x!=='skipped').length,synced:results.filter(x=>x==='synced').length,failed:results.filter(x=>x==='failed').length};
}
export async function calendarStatus(db,id){
 const row=(await db.query('SELECT state,revision,synced_revision,attempts,error_code,synced_at,event_id FROM moment_link.event_calendar_jobs WHERE consultation_id=$1',[id])).rows[0];
 return row?{...row,calendarId}:null;
}
