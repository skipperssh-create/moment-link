import {createHash,randomUUID} from 'node:crypto';
const calendarId='451b4eba1a4f1aa0e691580a3231bbd557d5d6c779038db5a05c5aea89f5f5fa@group.calendar.google.com';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const seollemDigest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export function seollemRequest(job){
 const r=job.desired,b=r.booking,s=r.snapshot||{};
 const options=(s.options||[]).map(o=>o.name||o.label).filter(Boolean);
 const extras=(b.addOns||[]).map(o=>(o.description||o.id)+' '+o.quantity+'개');
 const methods={bank:'bank',transfer:'bank',bank_transfer:'bank',cash:'bank',card:'card',naver:'naver','계좌이체':'bank'};
 const method=b.opsPaymentMethod||b.paymentMethod||'bank';
 if(!methods[method])throw Object.assign(Error('payment method'),{code:'SEOLLEM_PAYMENT_METHOD',conflict:true});
 return {externalRef:'moment-link:'+r.id,revision:job.revision,receipt:r.receipt,category:r.category,productId:r.productId,packageId:r.packageId,
  productName:[s.product?.name,s.package?.name].filter(Boolean).join(' · '),person:r.person,phone:r.phone.replace(/[^0-9+]/g,''),status:r.status,
  date:b.date,time:b.time,place:b.place,amount:b.amount,receivedAmount:b.receivedAmount,paymentMethod:methods[method],
  notes:[r.notes,b.extra,options.length?'상품 선택: '+options.join(', '):'',extras.length?'추가 구매: '+extras.join(', '):''].filter(Boolean).join('\n'),
  calendarId,eventId:job.calendar_event_id||'ml'+r.id.replaceAll('-',''),privacyConsent:r.consent?.privacy===true};
}
export function seollemAdapter(env){return {sync:async payload=>{
 const token=env.SEOLLEM_BOOKING_SYNC_TOKEN,endpoint=env.SEOLLEM_BOOKING_SYNC_URL;
 if(!token||!endpoint)throw Object.assign(Error('connection'),{code:'SEOLLEM_NOT_CONFIGURED'});
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/api/integrations/moment-link/bookings'||url.search||url.hash)throw Object.assign(Error('configuration'),{code:'SEOLLEM_CONFIGURATION'});
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(26000)});
 const result=await response.json();
 if(!response.ok)throw Object.assign(Error('sync failed'),{code:/^SEOLLEM_[A-Z0-9_]+$/.test(result.code||'')?result.code:'SEOLLEM_HTTP_'+response.status,conflict:response.status===409||response.status===400});
 return result;
}};}
export async function dispatchSeollemBookings(db,env,adapters={},id){
 if(env.SEOLLEM_BOOKING_SYNC_ENABLED!=='true')return {enabled:false,processed:0};
 await db.query("UPDATE moment_link.seollem_booking_jobs SET state='failed',error_code='SEOLLEM_WORKER_INTERRUPTED',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE state='processing' AND attempts=2 AND lease_until<now()");
 const candidates=(await db.query("SELECT consultation_id FROM moment_link.seollem_booking_jobs WHERE state IN ('pending','failed','processing') AND attempts<2 AND (lease_until IS NULL OR lease_until<now()) AND ($1::uuid IS NULL OR consultation_id=$1) ORDER BY updated_at LIMIT 5",[id||null])).rows;
 const results=await Promise.all(candidates.map(async({consultation_id})=>{
  const lease=randomUUID(),job=(await db.query("UPDATE moment_link.seollem_booking_jobs SET state='processing',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '2 minutes',updated_at=now() WHERE consultation_id=$1 AND state IN ('pending','failed','processing') AND attempts<2 AND (lease_until IS NULL OR lease_until<now()) RETURNING *",[consultation_id,lease])).rows[0];
  if(!job)return 'skipped';
  try{
   job.calendar_event_id=(await db.query('SELECT event_id FROM moment_link.event_calendar_jobs WHERE consultation_id=$1',[consultation_id])).rows[0]?.event_id;
   const request=job.delivery?.revision===job.revision?job.delivery:seollemRequest(job);
   if(job.delivery?.revision!==job.revision)await db.query('UPDATE moment_link.seollem_booking_jobs SET delivery=$3 WHERE consultation_id=$1 AND lease_token=$2',[consultation_id,lease,JSON.stringify(request)]);
   const result=await (adapters.seollemBookings||seollemAdapter(env)).sync(request);
   if(result?.contract!=='moment-seollem-v1'||result.revision!==request.revision||result.digest!==seollemDigest(request)||(result.id!==null&&!/^moment_[a-f0-9-]{36}$/.test(result.id||''))||(request.status==='confirmed'&&!result.id)||result.stale)throw Object.assign(Error('verification'),{code:'SEOLLEM_VERIFY_FAILED'});
   await db.query("UPDATE moment_link.seollem_booking_jobs SET external_id=$3,synced_revision=$4,state=CASE WHEN revision=$4 THEN 'synced' ELSE 'pending' END,attempts=CASE WHEN revision=$4 THEN attempts ELSE 0 END,error_code=NULL,lease_token=NULL,lease_until=NULL,synced_at=now(),updated_at=now() WHERE consultation_id=$1 AND lease_token=$2",[consultation_id,lease,result.id,job.revision]);
   return 'synced';
  }catch(error){
   const code=/^SEOLLEM_[A-Z0-9_]+$/.test(error.code||'')?error.code:'SEOLLEM_CONNECTION_FAILED';
   await db.query("UPDATE moment_link.seollem_booking_jobs SET state=CASE WHEN $5 THEN 'conflict' WHEN revision<>$3 THEN 'pending' ELSE 'failed' END,attempts=CASE WHEN revision<>$3 AND NOT $5 THEN 0 ELSE attempts END,error_code=$4,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE consultation_id=$1 AND lease_token=$2",[consultation_id,lease,job.revision,code,!!error.conflict]);
   return 'failed';
  }
 }));return {enabled:true,processed:results.length,synced:results.filter(x=>x==='synced').length};
}
export async function seollemStatus(db,id){return (await db.query('SELECT state,revision,synced_revision,attempts,error_code,synced_at,external_id FROM moment_link.seollem_booking_jobs WHERE consultation_id=$1',[id])).rows[0]||null;}

export async function seollemReadiness(env){
 if(env.SEOLLEM_BOOKING_SYNC_ENABLED!=='true')return {enabled:false,connected:false};
 const url=env.SEOLLEM_BOOKING_SYNC_URL;if(!url||!url.startsWith('https://ops.seollempropose.com/api/integrations/moment-link/bookings'))return {enabled:true,connected:false};
 try{const r=await fetch(url,{headers:{Authorization:'Bearer '+env.SEOLLEM_BOOKING_SYNC_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});const d=await r.json();return {enabled:true,connected:r.ok&&d.ready===true&&d.contract==='moment-seollem-v1',contract:d.contract,products:d.products,calendarWriter:d.calendarWriter,backfill:false};}catch{return {enabled:true,connected:false};}
}
