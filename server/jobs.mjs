import {createHmac,randomBytes} from 'node:crypto';
import webpush from 'web-push';
import {audit,fail} from './security.mjs';
async function settings(db){return (await db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;}
const enabled=(s,j,env)=>j.channel==='push'?s.push&&env.PUSH_LIVE_ENABLED==='true':env.SMS_LIVE_ENABLED==='true'&&s.solapi&&(j.channel==='sms_customer'?s.customerAuto:s.adminAuto);
const stale=j=>Date.now()-new Date(j.updated_at).getTime()>120000;
async function reconcileSms(db,job,env,adapters){
 // A lookup is never permission to resend an uncertain group.
 if(!job.provider_id||job.channel==='push'||env.SMS_LIVE_ENABLED!=='true')return {state:job.state};
 try{
  const group=await (adapters.solapi||solapi(env))('/groups/'+encodeURIComponent(job.provider_id));
  const accepted=['SENDING','PROCESSING','SCHEDULED','COMPLETE'].includes(group.status);
  const delivered=group.status==='COMPLETE'&&group.count?.sentSuccess===1&&group.count?.sentFailed===0;
  const failed=['FAILED','SYSTEM-ERROR','DELETED'].includes(group.status)||group.count?.sentFailed>0;
  const state=accepted?'sent':job.state;
  const code=delivered?'SMS_DELIVERED':failed?'SMS_DELIVERY_FAILED':accepted?'SMS_DELIVERY_PENDING':'RECONCILIATION_REQUIRED';
  await db.query('UPDATE moment_link.outbox SET state=$1,error_code=$2,updated_at=now() WHERE id=$3',[state,code,job.id]);
  return {state,delivery:code};
 }catch{return {state:job.state,delivery:'LOOKUP_FAILED'};}
}
function solapi(env){return async(path,method='GET',data)=>{if(!env.SOLAPI_API_KEY||!env.SOLAPI_API_SECRET)fail(503,'SMS_UNCONFIGURED','SOLAPI가 연결되지 않았습니다.');const date=new Date().toISOString(),salt=randomBytes(16).toString('hex'),signature=createHmac('sha256',env.SOLAPI_API_SECRET).update(date+salt).digest('hex');const r=await fetch('https://api.solapi.com/messages/v4'+path,{method,headers:{Authorization:`HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Object.assign(new Error('SMS provider rejected request'),{code:'SMS_PROVIDER_'+r.status});return r.json();};}
export async function processOutbox(db,id,env,adapters={}){
 // One durable claim. A crash after claim becomes uncertain, never a blind resend.
 const job=await db.transaction(async tx=>{const j=(await tx.query('SELECT * FROM moment_link.outbox WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!j)fail(404,'NOT_FOUND','발송 작업을 찾을 수 없습니다.');
  if(j.state==='sending'&&stale(j)){await tx.query("UPDATE moment_link.outbox SET state='uncertain',error_code='WORKER_INTERRUPTED',updated_at=now() WHERE id=$1",[id]);j.state='uncertain';}
  if(!['pending','failed'].includes(j.state)||j.provider_id)return j;
  const live=(await tx.query('SELECT id FROM moment_link.consultations WHERE id=$1 AND expires_at>now() AND deleted_at IS NULL',[j.consultation_id])).rows[0];
  const s=await settings(tx);if(!live||!enabled(s,j,env)){await tx.query("UPDATE moment_link.outbox SET state='blocked',updated_at=now() WHERE id=$1",[id]);return {...j,state:'blocked'};}await tx.query("UPDATE moment_link.outbox SET state='sending',attempts=attempts+1,updated_at=now() WHERE id=$1",[id]);return {...j,claimed:true};});
 if(!job.claimed)return ['sent','uncertain'].includes(job.state)?reconcileSms(db,job,env,adapters):{state:job.state};
 try{
  const s=await settings(db),r=(await db.query('SELECT receipt,phone FROM moment_link.consultations WHERE id=$1',[job.consultation_id])).rows[0];
  if(!enabled(s,job,env)){await db.query("UPDATE moment_link.outbox SET state='blocked' WHERE id=$1",[id]);return {state:'blocked'};}
  if(job.channel==='push'){
   if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw Object.assign(new Error('unconfigured'),{code:'PUSH_UNCONFIGURED',safe:true});
   webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:admin@teamboatn.com',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
   const subs=(await db.query(`SELECT s.* FROM moment_link.push_subscriptions s JOIN moment_link.admin_users u ON u.id=s.user_id WHERE s.active=true AND u.active=true AND u.role='admin'`)).rows;
   if(!subs.length)throw Object.assign(new Error('no subscriptions'),{code:'PUSH_NO_SUBSCRIPTIONS',safe:true});
   for(const sub of subs){if(!enabled(await settings(db),job,env)){await db.query("UPDATE moment_link.outbox SET state='blocked' WHERE id=$1",[id]);return {state:'blocked'};}try{await (adapters.push||webpush.sendNotification)(sub.subscription,JSON.stringify({title:'모먼트링크 새 상담',body:'접수함에서 신청 내용을 확인해 주세요.',url:'/#admin/request/'+job.consultation_id,tag:job.event_key}),{TTL:300,timeout:10000});}catch(e){if([404,410].includes(e.statusCode))await db.query('UPDATE moment_link.push_subscriptions SET active=false WHERE id=$1',[sub.id]);else throw e;}}
  }else{
   const to=job.channel==='sms_customer'?r.phone:s.adminSms.replace(/\D/g,'');if(!/^01[016789]\d{7,8}$/.test(to))throw Object.assign(new Error('recipient'),{code:'SMS_RECIPIENT',safe:true});
   const api=adapters.solapi||solapi(env);let group=job.provider_id;
   if(!group){const g=await api('/groups','POST',{});group=g.groupId;if(typeof group!=='string')throw Error('invalid provider response');await db.query('UPDATE moment_link.outbox SET provider_id=$1 WHERE id=$2',[group,id]);}
   const template=job.channel==='sms_customer'?s.customerTemplate:s.adminTemplate;
   const added=await api(`/groups/${encodeURIComponent(group)}/messages`,'PUT',{messages:[{to,from:s.smsNumber.replace(/\D/g,''),text:template.replaceAll('{receipt}',r.receipt)}]});
   if(added.errorCount!==0||added.resultList?.length!==1||added.resultList[0].statusCode!=='2000')throw Object.assign(new Error('message rejected'),{code:'SMS_MESSAGE_REJECTED'});
   if(!enabled(await settings(db),job,env)){await db.query("UPDATE moment_link.outbox SET state='blocked' WHERE id=$1",[id]);return {state:'blocked'};}
   await api(`/groups/${encodeURIComponent(group)}/send`,'POST',{});
  }
  await db.query("UPDATE moment_link.outbox SET state='sent',error_code=NULL,updated_at=now() WHERE id=$1",[id]);return {state:'sent',meaning:'provider_accepted'};
 }catch(e){const state=e.safe?'failed':'uncertain';await db.query('UPDATE moment_link.outbox SET state=$1,error_code=$2,updated_at=now() WHERE id=$3',[state,e.code||'PROVIDER_OUTCOME_UNKNOWN',id]);return {state};}
}
export function opsAdapter(target,env){
 const prefix='OPS_'+target.toUpperCase(),base=env[prefix+'_BASE_URL'],secret=env[prefix+'_TOKEN'];
 // No live endpoint is assumed from a matching name or an existing OPS login session.
 if(env[prefix+'_CONTRACT_VERIFIED']!=='true'||!base||!secret)fail(503,'OPS_UNCONFIGURED','대상 OPS의 독립 API 계약과 인증 연결이 필요합니다.');
 const origin=new URL(base);if(origin.protocol!=='https:')fail(503,'OPS_URL','HTTPS OPS 주소가 필요합니다.');
 async function request(path,method='GET',data){const r=await fetch(new URL(path,base.endsWith('/')?base:base+'/'),{method,redirect:'error',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json',...(data?.externalRef?{'Idempotency-Key':data.externalRef}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});if(r.status===404&&method==='GET')return null;if(r.status===409)return {available:false,conflict:true};if(!r.ok)throw Object.assign(new Error('OPS request failed'),{code:'OPS_HTTP_'+r.status});return r.json();}
 return {lookup:ref=>request('bookings/by-reference/'+encodeURIComponent(ref)),availability:booking=>request('availability','POST',booking),create:booking=>request('bookings','POST',booking)};
}
export async function processIntegration(db,id,env,adapters={}){
 const job=await db.transaction(async tx=>{const j=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!j)fail(404,'NOT_FOUND','연동 작업을 찾을 수 없습니다.');
  if(j.state==='checking'&&stale(j))j.state='uncertain';
  if(['succeeded','checking','conflict'].includes(j.state))return j;
  const active=(await tx.query('SELECT id FROM moment_link.consultations WHERE id=$1 AND expires_at>now() AND deleted_at IS NULL',[j.consultation_id])).rows[0];
  if(!active){await tx.query("UPDATE moment_link.integration_jobs SET state='blocked',error_code='CONSULTATION_UNAVAILABLE' WHERE id=$1",[id]);return {...j,state:'blocked'};}
  if(env.OPS_WRITES_ENABLED!=='true'){const state=j.state==='uncertain'?'uncertain':'blocked';await tx.query("UPDATE moment_link.integration_jobs SET state=$1,error_code='OPS_WRITES_DISABLED' WHERE id=$2",[state,id]);return {...j,state};}
  await tx.query("UPDATE moment_link.integration_jobs SET state='checking',attempts=attempts+1,updated_at=now() WHERE id=$1",[id]);return {...j,claimed:true};});
 if(!job.claimed)return {state:job.state};
 let creating=false;
 try{
  const adapter=adapters.ops?.[job.target]||opsAdapter(job.target,env);
  const prior=await adapter.lookup(job.external_ref);
  if(job.state==='uncertain'&&!prior?.id){await db.query("UPDATE moment_link.integration_jobs SET state='uncertain',error_code='RECONCILIATION_REQUIRED' WHERE id=$1",[id]);return {state:'uncertain'};}
  let booking=prior;
  if(!booking?.id){
   const consultation=(await db.query('SELECT status FROM moment_link.consultations WHERE id=$1 AND expires_at>now() AND deleted_at IS NULL',[job.consultation_id])).rows[0];
   if(!consultation||['closed','cancelled'].includes(consultation.status)){await db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='CONSULTATION_CLOSED' WHERE id=$1",[id]);return {state:'conflict'};}
   const availability=await adapter.availability(job.booking);if(availability?.available!==true||!availability.token){await db.query("UPDATE moment_link.integration_jobs SET state='conflict',error_code='AVAILABILITY_UNCONFIRMED' WHERE id=$1",[id]);return {state:'conflict'};}
   if(env.OPS_WRITES_ENABLED!=='true')fail(503,'OPS_WRITES_DISABLED','OPS 쓰기가 중지되었습니다.');
   creating=true;booking=await adapter.create({...job.booking,externalRef:job.external_ref,availabilityToken:availability.token});
  }
  if(typeof booking?.id!=='string')throw Error('OPS response missing booking ID');
  await db.transaction(async tx=>{await tx.query("UPDATE moment_link.integration_jobs SET state='succeeded',external_id=$1,error_code=NULL,updated_at=now() WHERE id=$2",[booking.id,id]);await tx.query("UPDATE moment_link.consultations SET status='confirmed',version=version+1,updated_at=now() WHERE id=$1",[job.consultation_id]);await audit(tx,job.approved_by,'ops.confirmed',job.consultation_id,{jobId:id,target:job.target,externalId:booking.id});});return {state:'succeeded',externalId:booking.id};
 }catch(e){const state=creating||job.state==='uncertain'?'uncertain':e.code==='OPS_UNCONFIGURED'?'blocked':'failed';await db.query('UPDATE moment_link.integration_jobs SET state=$1,error_code=$2,updated_at=now() WHERE id=$3',[state,e.code||'OPS_UNAVAILABLE',id]);return {state};}
}
