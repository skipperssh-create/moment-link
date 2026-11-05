import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {saveCommunication,confirmReservation,reservationSchema} from './communications.mjs';
import {queueCancellation} from './ops-cancel.mjs';
import {queueRestoration} from './ops-restore.mjs';
import {receiveOpsEvent} from './ops-inbound.mjs';
import {createDirectBooking} from './direct-booking.mjs';
import sharp from 'sharp';
import {database} from './database.mjs';
import {hash,token,fail,passwordHash,verifyPassword,audit,rateLimit,sameOrigin,cookie,session,authorize,csrf,SESSION_SECONDS} from './security.mjs';
import {text,parse,catalogSchema,consultationSchema,validatePreferences,validateConsultationTimes,validDate,passwordSchema} from './validation.mjs';
import {processOutbox,processIntegration,dispatchIntegrations,opsAdapter} from './jobs.mjs';
import {changeTrash,emptyTrash} from './trash.mjs';
import {authorizedCron,purgeExpired} from './retention.mjs';
const writeMethods=['POST','PUT','PATCH','DELETE'];
const categoryNames={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
export const settingsSchema=z.object({solapi:z.boolean(),customerAuto:z.boolean(),adminAuto:z.boolean(),push:z.boolean(),smsNumber:text(30),mainNumber:text(30),adminSms:text(30),yachtPlace:text(500),yachtAddress:text(500),heliGunsan:text(500),heliByeonsan:text(500),privacyController:text(100),privacyContact:text(100),retentionDays:z.number().int().min(1).max(3650).nullable(),privacyText:text(10000),consentVersion:text(80,1),accepting:z.boolean(),customerTemplate:text(1000),adminTemplate:text(1000),completionText:text(1000).optional(),manualSmsTemplate:text(3000).optional(),locations:z.array(z.object({id:z.string().uuid(),category:z.enum(['yacht','visit','trunk','heli']),name:text(100,1),status:z.enum(['candidate','confirmed']),address:text(500),mapUrl:z.string().max(2000).refine(v=>!v||/^https:\/\//.test(v)),parking:text(500),contact:text(100)}).strict()).max(50).optional()}).strict().refine(s=>!s.accepting||(s.privacyController&&s.privacyContact&&s.retentionDays&&s.privacyText&&s.consentVersion!=='draft'));
async function config(db,id){return (await db.query('SELECT * FROM moment_link.config WHERE id=$1',[id])).rows[0];}
async function published(db){return (await db.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];}
const jsonResponse=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function body(request,max=100000){if(Number(request.headers.get('content-length'))>max)fail(413,'BODY_TOO_LARGE','요청 용량을 줄여 주세요.');if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'CONTENT_TYPE','JSON 요청이 필요합니다.');const raw=await request.text();if(Buffer.byteLength(raw)>max)fail(413,'BODY_TOO_LARGE','요청 용량을 줄여 주세요.');try{return JSON.parse(raw);}catch{fail(400,'JSON','올바르지 않은 요청입니다.');}}
const userPublic=u=>u?{id:u.id,username:u.username,role:u.role,mustChangePassword:u.must_change_password}:null;
function visibleRequest(r){return {...r,idempotency_hash:undefined,payload_hash:undefined};}
export function createApp({db:givenDb,env=process.env,adapters={},schedule}={}){
 return async function handle(request){
 const requestId=randomUUID();
 let renewedCookie;
 const json=(data,status=200,headers={})=>jsonResponse(data,status,{...(renewedCookie?{'Set-Cookie':renewedCookie}:{}),...headers});
 try {
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  const method=request.method;
  if(path==='/api/health')return json({status:'ok',version:'4.1.0',smsLive:env.SMS_LIVE_ENABLED==='true',opsLive:env.OPS_WRITES_ENABLED==='true'});
  const db=givenDb||database();
  if(path==='/api/integrations/boatn/events'||path.startsWith('/api/integrations/boatn/events/'))return json(await receiveOpsEvent(request,db,env));
  const dispatch=async(id,wait=false)=>{if(env.OPS_WRITES_ENABLED!=='true')return;const work=dispatchIntegrations(db,env,adapters,id).catch(()=>{});if(schedule&&!wait)schedule(work);else await work;};
  if(path==='/api/cron/retention'&&method==='GET'){
   if(!authorizedCron(request,env.CRON_SECRET))fail(401,'AUTH_REQUIRED','인증이 필요합니다.');
   const result=await purgeExpired(db);await dispatch();return json(result);
  }
  if(writeMethods.includes(method))sameOrigin(request,env);
  if(path==='/api/catalog'&&method==='GET'){
   const [c,s]=await Promise.all([published(db),config(db,'settings')]);
   const keys=['smsNumber','mainNumber','yachtPlace','yachtAddress','heliGunsan','heliByeonsan','privacyController','privacyContact','retentionDays','privacyText','consentVersion','accepting','locations','completionText','manualSmsTemplate'];
   return json({version:c.version,products:c.products.filter(p=>p.visible&&!p.archived),settings:Object.fromEntries(keys.map(k=>[k,s.data[k]]))});
  }
  if(path==='/api/consultations'&&method==='POST'){
   const ip=env.VERCEL?request.headers.get('x-vercel-forwarded-for')||'unknown':'local';
   await rateLimit(db,'intake-ip:'+ip,60,600);
   const key=request.headers.get('idempotency-key');if(!key||!/^[-a-zA-Z0-9]{20,100}$/.test(key))fail(400,'IDEMPOTENCY_KEY','접수 식별자가 필요합니다.');
   const data=parse(consultationSchema,await body(request));validatePreferences(data.preferences);validateConsultationTimes(data.category,data.preferences);
   const payloadHash=hash(JSON.stringify(data)),idemHash=hash(key);
   const result=await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[idemHash]);
    const prior=(await tx.query('SELECT receipt,payload_hash FROM moment_link.consultations WHERE idempotency_hash=$1',[idemHash])).rows[0];
    if(prior){if(prior.payload_hash!==payloadHash)fail(409,'IDEMPOTENCY_CONFLICT','다른 내용에 사용된 접수 식별자입니다.');return {receipt:prior.receipt,replayed:true};}
    const s=(await config(tx,'settings')).data;if(!s.accepting)fail(503,'NOT_ACCEPTING','상담 접수 준비 중입니다. 대표번호로 문의해 주세요.');
    if(data.consentVersion!==s.consentVersion)fail(409,'CONSENT_CHANGED','개인정보 안내가 변경되었습니다. 새 안내를 확인해 주세요.');
    const c=await published(tx);if(data.catalogVersion!==c.version)fail(409,'CATALOG_CHANGED','상품 정보가 변경되었습니다. 다시 확인해 주세요.');
    let p=c.products.find(x=>x.id===data.productId&&x.visible&&!x.archived),pk=p?.packages.find(x=>x.id===data.packageId);
    if(data.productId==='recommend'&&data.packageId==='recommend'){p={id:'recommend',category:data.category,name:categoryNames[data.category],packages:[]};pk={id:'recommend',name:'상담 후 추천',weekday:null,weekend:null,features:[]};}
    if(!p||!pk||p.salePaused||p.category!==data.category)fail(400,'PRODUCT','선택 가능한 상품이 아닙니다.');
    if(['visit','trunk'].includes(p.category)&&!data.place)fail(400,'PLACE','희망 장소를 입력해 주세요.');
    const options=data.optionIds.map(id=>(pk.options||[]).find(o=>o.id===id));if(options.some(o=>!o))fail(400,'OPTION','선택 가능한 추가 옵션이 아닙니다.');
    const groups=options.map(o=>o.group).filter(Boolean);
    if(new Set(groups).size!==groups.length)fail(400,'OPTION_GROUP','같은 종류의 추가 옵션은 하나만 선택해 주세요.');
    if(options.some(o=>o.requiresOptionId&&!data.optionIds.includes(o.requiresOptionId)))fail(400,'OPTION_REQUIRES','소장용 USB를 추가하려면 영상편지 제작을 먼저 선택해 주세요.');
    const optionAmount=options.reduce((sum,o)=>sum+o.amount,0);
    await rateLimit(tx,'phone:'+data.phone,5,3600);
    const id=randomUUID(),receipt='ML-'+id.replaceAll('-','').slice(0,14).toUpperCase();
    const snapshot={catalogVersion:c.version,product:{...p,packages:undefined},package:pk,options,price:{weekday:pk.weekday===null?null:pk.weekday+optionAmount,weekend:pk.weekend===null?null:pk.weekend+optionAmount,optionAmount,dateOverrides:data.preferences.map(x=>({date:x.date,override:(()=>{const rule=(pk.datePrices||[]).find(rule=>rule.date===x.date);return rule?{...rule,amount:rule.amount===null?null:rule.amount+optionAmount}:null;})()}))},timezone:'Asia/Seoul'};
    await tx.query(`INSERT INTO moment_link.consultations(id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()+make_interval(days=>$15))`,[id,receipt,idemHash,payloadHash,data.person,data.phone,data.category,p.id,pk.id,JSON.stringify(snapshot),JSON.stringify(data.preferences),data.place,data.notes,JSON.stringify({version:s.consentVersion,text:s.privacyText,controller:s.privacyController,retentionDays:s.retentionDays,acceptedAt:new Date().toISOString()}),s.retentionDays]);
    const outbox=[];
    for(const [channel,on] of [['sms_customer',s.solapi&&s.customerAuto&&env.SMS_LIVE_ENABLED==='true'],['sms_admin',s.solapi&&s.adminAuto&&env.SMS_LIVE_ENABLED==='true'],['push',s.push&&env.PUSH_LIVE_ENABLED==='true']])if(on){const jobId=randomUUID();await tx.query('INSERT INTO moment_link.outbox(id,event_key,consultation_id,channel) VALUES($1,$2,$3,$4)',[jobId,`${id}:${channel}`,id,channel]);outbox.push(jobId);}
    await audit(tx,null,'consultation.created',id,{catalogVersion:c.version});
    return {receipt,replayed:false,outbox};
   });
   if(result.outbox?.length){const work=Promise.allSettled(result.outbox.map(id=>processOutbox(db,id,env,adapters)));if(schedule)schedule(work);else await work;}
   return json({receipt:result.receipt,replayed:result.replayed},result.replayed?200:201);
  }
  if(path.startsWith('/api/media/')&&method==='GET'){
   const id=path.split('/').pop();if(!z.string().uuid().safeParse(id).success)fail(404,'NOT_FOUND','사진을 찾을 수 없습니다.');
   const row=(await db.query('SELECT mime,bytes FROM moment_link.media WHERE id=$1',[id])).rows[0];if(!row)fail(404,'NOT_FOUND','사진을 찾을 수 없습니다.');
   return new Response(row.bytes,{headers:{'Content-Type':row.mime,'Cache-Control':'public,max-age=86400,immutable','X-Content-Type-Options':'nosniff'}});
  }
  if(path==='/api/auth/login'&&method==='POST'){
   const d=parse(z.object({username:text(40,3),password:z.string().min(1).max(128)}).strict(),await body(request));
   // Trust Vercel's overwritten proxy header only on Vercel; local fallback is fixed.
   const ip=env.VERCEL?request.headers.get('x-vercel-forwarded-for')||'unknown':'local';
   await rateLimit(db,'login:'+ip,20,900);await rateLimit(db,'login-user:'+d.username,10,900);
   const u=(await db.query('SELECT * FROM moment_link.admin_users WHERE username=$1',[d.username])).rows[0];
   if(!await verifyPassword(d.password,u?.password_hash)||!u?.active)fail(401,'LOGIN_FAILED','아이디 또는 비밀번호를 확인해 주세요.');
   const raw=token(),anti=token();await db.query(`INSERT INTO moment_link.sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')`,[hash(raw),u.id,anti,SESSION_SECONDS]);
   await audit(db,u.id,'auth.login',u.id);return json({user:userPublic(u),csrf:anti},200,{'Set-Cookie':cookie(raw,env)});
  }
  const user=await session(db,request,raw=>{renewedCookie=cookie(raw,env);});
  if(path==='/api/auth/session'&&method==='GET')return json({user:userPublic(user),csrf:user?.csrf});
  if(path==='/api/auth/logout'&&method==='POST'){csrf(request,user);await db.query('DELETE FROM moment_link.sessions WHERE token_hash=$1',[user.token_hash]);return json({ok:true},200,{'Set-Cookie':cookie('',env,0)});}
  if(path==='/api/auth/password'&&method==='POST'){
   csrf(request,user);const d=parse(z.object({current:z.string().max(128),username:text(40,3).optional(),password:passwordSchema}).strict(),await body(request));
   await rateLimit(db,'password:'+user.id,5,900);
   try{await db.transaction(async tx=>{
    const u=(await tx.query('SELECT username,password_hash FROM moment_link.admin_users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
    if(!u||!await verifyPassword(d.current,u.password_hash))fail(403,'PASSWORD','현재 비밀번호를 확인해 주세요.');
    await tx.query('UPDATE moment_link.admin_users SET username=$1,password_hash=$2,must_change_password=false WHERE id=$3',[d.username??u.username,await passwordHash(d.password),user.id]);
    await tx.query('DELETE FROM moment_link.sessions WHERE user_id=$1',[user.id]);
    await audit(tx,user.id,'auth.password.changed',user.id,{usernameChanged:d.username!==undefined&&d.username!==u.username});
   });}catch(e){if(e.code==='23505')fail(409,'USERNAME_TAKEN','이미 사용 중인 아이디입니다.');throw e;}
   return json({ok:true},200,{'Set-Cookie':cookie('',env,0)});
  }
  authorize(user);if(writeMethods.includes(method))csrf(request,user);
  if(path==='/api/admin/ops/boatn'&&method==='GET'){
   if(env.OPS_WRITES_ENABLED!=='true')return json({enabled:false,paymentMethods:[]});
   const metadata=await (adapters.ops?.boatn||opsAdapter('boatn',env)).metadata();
   return json({...metadata,enabled:!!metadata?.installed});
  }
  if(path==='/api/admin/reservations'&&method==='POST'){
   authorize(user,true);
   const result=await createDirectBooking(db,user,await body(request));
   await dispatch(result.item.id);
   const item=visibleRequest(result.item);item.integration=(await db.query('SELECT id,state,error_code,external_id,updated_at FROM moment_link.integration_jobs WHERE consultation_id=$1',[item.id])).rows[0]||null;return json({...result,item},result.replayed?200:201);
  }
  if(path==='/api/admin/trash/empty'&&method==='POST'){authorize(user,true);return json(await emptyTrash(db,user,await body(request)));}
  if(path==='/api/admin/consultations/updates'&&method==='GET'){
   await dispatch();
   const since=url.searchParams.has('since')?parse(z.string().datetime({offset:true}),url.searchParams.get('since')):null;
   // Aggregate counts only, with the same visibility scope as the inbox.
   const result=await db.query(`SELECT now() AS checked_at,
    count(*) FILTER (WHERE status='new')::int AS pending,
    count(*) FILTER (WHERE created_at>$3::timestamptz)::int AS arrivals,
    max(created_at) AS latest_at
    FROM moment_link.consultations
    WHERE deleted_at IS NULL AND expires_at>now() AND ($1='admin' OR assignee=$2)
    AND COALESCE(communication->'entry'->>'source','')<>'admin_direct'`,[user.role,user.id,since]);
   const row=result.rows[0];return json({checkedAt:new Date(row.checked_at).toISOString(),pending:row.pending,arrivals:row.arrivals,latestAt:row.latest_at?new Date(row.latest_at).toISOString():null});
  }
  if(path==='/api/admin/consultations'&&method==='GET'){
   const search=(url.searchParams.get('q')||'').slice(0,100),offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
   const view=parse(z.enum(['all','inbox','reservations','trash']),url.searchParams.get('view')||'all'),status=parse(z.enum(['all','new','initial_unreachable','consulting','no_response','awaiting_payment','confirmed','hold','closed','cancelled']),url.searchParams.get('status')||'all');
   if(view==='trash')authorize(user,true);
   const reserved="(c.status='confirmed' OR c.communication ? 'reservation' OR EXISTS(SELECT 1 FROM moment_link.integration_jobs j WHERE j.consultation_id=c.id AND j.state='succeeded'))";
   const scope="c.expires_at>now() AND ($1='admin' OR c.assignee=$2) AND ($3='' OR c.person ILIKE $4 OR c.phone ILIKE $4 OR c.receipt ILIKE $4)";
   const active=view==='trash'?'c.deleted_at IS NOT NULL AND c.delete_after>now()':'c.deleted_at IS NULL';
   const filter=view==='inbox'?' AND NOT '+reserved:view==='reservations'?' AND '+reserved:'';
   const order=view==='trash'?'c.deleted_at DESC':view==='reservations'?"COALESCE(c.communication->'booking'->>'date',c.preferences->0->>'date') ASC, COALESCE(c.communication->'booking'->>'time','') ASC,c.created_at DESC":'c.created_at DESC';
   const trashBefore=new Date().toISOString(),args=[user.role,user.id,search,'%'+search+'%'];
   const counts={all:0,new:0,initial_unreachable:0,consulting:0,no_response:0,awaiting_payment:0,confirmed:0,hold:0,closed:0,cancelled:0};
   const rows=(await db.query('SELECT c.status,count(*)::int AS n FROM moment_link.consultations c WHERE '+scope+' AND '+active+filter+' GROUP BY c.status',args)).rows;
   for(const row of rows){counts[row.status]=row.n;counts.all+=row.n;}
   const r=await db.query("SELECT c.*, (SELECT jsonb_build_object('id',j.id,'state',j.state,'attempts',j.attempts,'operation',j.booking->>'operation','error_code',j.error_code) FROM moment_link.integration_jobs j WHERE j.consultation_id=c.id) AS integration, (SELECT to_jsonb(n) FROM moment_link.consultation_notes n WHERE n.consultation_id=c.id ORDER BY n.created_at DESC,n.id DESC LIMIT 1) AS latest_note, (SELECT count(*)::int FROM moment_link.consultation_notes n WHERE n.consultation_id=c.id) AS note_count FROM moment_link.consultations c WHERE "+scope+' AND '+active+filter+" AND ($6='all' OR c.status=$6) ORDER BY "+order+' LIMIT 50 OFFSET $5',[...args,offset,status]);
   return json({items:r.rows.map(visibleRequest),counts,trashBefore});
  }
  const retryMatch=path.match(/^\/api\/admin\/consultations\/([a-f0-9-]{36})\/integration$/);
  if(retryMatch&&method==='POST'){
   const row=(await db.query("SELECT j.id FROM moment_link.integration_jobs j JOIN moment_link.consultations c ON c.id=j.consultation_id WHERE c.id=$1 AND c.deleted_at IS NULL AND c.expires_at>now() AND ($2='admin' OR c.assignee=$3)",[retryMatch[1],user.role,user.id])).rows[0];
   if(!row)fail(404,'NOT_FOUND','연동 작업을 찾을 수 없습니다.');
   await rateLimit(db,'ops-retry:'+user.id,5,60);
   return json(await processIntegration(db,row.id,env,adapters));
  }
  const match=path.match(/^\/api\/admin\/consultations\/([a-f0-9-]{36})(?:\/(confirm|notes|communications|restore-reservation|reservation|restore|permanent))?$/);
  if(match){
   const [,id,action]=match;
   const result=await db.transaction(async tx=>{
    const r=(await tx.query('SELECT * FROM moment_link.consultations WHERE id=$1 AND expires_at>now() AND (delete_after IS NULL OR delete_after>now()) FOR UPDATE',[id])).rows[0];if(!r||(user.role!=='admin'&&r.assignee!==user.id))fail(404,'NOT_FOUND','접수건을 찾을 수 없습니다.');
    if((method==='DELETE'&&!action)||(action==='restore'&&method==='POST')||(action==='permanent'&&method==='DELETE')){authorize(user,true);return changeTrash(tx,r,user,action||'trash',await body(request));}
    if(r.deleted_at)fail(404,'NOT_FOUND','휴지통에 있는 상담입니다. 복원 후 확인해 주세요.');
    if(method==='GET')return {item:visibleRequest(r),notes:(await tx.query('SELECT * FROM moment_link.consultation_notes WHERE consultation_id=$1 ORDER BY created_at',[id])).rows,history:(await tx.query('SELECT action,detail,created_at FROM moment_link.audit_logs WHERE entity_id=$1 ORDER BY created_at',[id])).rows};
    if(action==='communications'&&['PUT','POST'].includes(method)){const out=await saveCommunication(tx,r,user,method,await body(request));return {item:visibleRequest(out.item)};}
    if(action==='reservation'&&method==='POST'){const out=await confirmReservation(tx,r,user,await body(request));return {item:visibleRequest(out.item)};}
    if(action==='notes'&&method==='POST'){
     const d=parse(z.object({body:text(4000,1),noteId:z.string().uuid().optional()}).strict(),await body(request));
     const noteId=d.noteId||randomUUID(),prior=(await tx.query('SELECT * FROM moment_link.consultation_notes WHERE id=$1',[noteId])).rows[0];
     if(prior){if(prior.consultation_id!==id||prior.actor_id!==user.id||prior.body!==d.body)fail(409,'NOTE_CONFLICT','메모 저장 요청이 변경되었습니다. 저장 내역을 확인해 주세요.');return {ok:true,note:prior,replayed:true};}
     const note=(await tx.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4) RETURNING *',[noteId,id,user.id,d.body])).rows[0];
     await audit(tx,user.id,'consultation.note',id);return {ok:true,note};
    }
    if(action==='confirm'&&method==='POST'){
     if(r.category==='yacht')fail(400,'USE_RESERVATION','위쪽 예약 확정에서 탑승 인원·결제수단을 확인해 주세요. 확정 시 OPS에 자동 등록됩니다.');
     authorize(user,true);const d=parse(z.object({version:z.number().int(),date:text(10).refine(validDate),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),durationMinutes:z.number().int().min(1).max(1440),amount:z.number().int().min(0).max(100000000),place:text(500,1),resourceId:text(100,1),approved:z.literal(true)}).strict(),await body(request));
     if(r.version!==d.version)fail(409,'VERSION','다른 관리자가 변경했습니다. 새로고침해 주세요.');validatePreferences([{date:d.date,time:d.time}]);
     if(['cancelled','closed'].includes(r.status))fail(409,'STATE','종결된 상담은 확정할 수 없습니다.');
     const target=r.category==='yacht'?'boatn':r.category==='heli'?'kht':'seollem';
     const prior=(await tx.query('SELECT * FROM moment_link.integration_jobs WHERE consultation_id=$1',[id])).rows[0];
     if(prior)return {job:prior};
     const jobId=randomUUID();await tx.query('INSERT INTO moment_link.integration_jobs(id,consultation_id,target,external_ref,approved_by,booking) VALUES($1,$2,$3,$4,$5,$6)',[jobId,id,target,'moment-link:'+id,user.id,JSON.stringify({...d,person:r.person,phone:r.phone,productId:r.product_id,packageId:r.package_id,timezone:'Asia/Seoul'})]);await audit(tx,user.id,'ops.approved',id,{jobId,target});return {job:{id:jobId,state:'pending'}};
    }
    if(method==='POST'&&action==='restore-reservation'){
     const d=parse(z.object({version:z.number().int()}).strict(),await body(request));
     if(r.version!==d.version)fail(409,'VERSION','다른 곳에서 변경되었습니다. 새로고침해 주세요.');
     if(r.status!=='cancelled'||!r.communication?.reservation||!r.communication?.booking?.date||!r.communication?.booking?.time)fail(409,'STATE','취소된 확정 예약만 복원할 수 있습니다.');
     const restorationQueued=await queueRestoration(tx,r,user);
     const communication=restorationQueued?r.communication:{...r.communication,reservation:{...r.communication.reservation,restoredAt:new Date().toISOString(),restoredBy:user.username}};
     const updated=(await tx.query('UPDATE moment_link.consultations SET status=$1,communication=$2,version=version+1,updated_at=now() WHERE id=$3 RETURNING *',[restorationQueued?r.status:'confirmed',JSON.stringify(communication),id])).rows[0];
     await audit(tx,user.id,restorationQueued?'reservation.restore_requested':'reservation.restored',id,{});
     return {item:visibleRequest(updated),restorationQueued};
    }
    if(method==='PATCH'&&!action){
     let cancellationQueued=false;
     const d=parse(z.object({version:z.number().int(),status:z.enum(['new','initial_unreachable','consulting','no_response','awaiting_payment','confirmed','hold','closed','cancelled']).optional(),confirmation:reservationSchema.omit({version:true}).optional(),assignee:z.string().uuid().nullable().optional(),contacted:z.boolean().optional(),read:z.boolean().optional()}).strict(),await body(request));
     if(r.version!==d.version)fail(409,'VERSION','다른 관리자가 변경했습니다. 새로고침해 주세요.');if(d.assignee!==undefined)authorize(user,true);
     if(d.confirmation&&d.status!=='confirmed')fail(400,'STATE','예약 확정 정보를 함께 저장하려면 확정을 선택해 주세요.');
     if(d.status==='confirmed'&&r.status!=='confirmed'&&!d.confirmation)fail(400,'BOOKING_NOT_READY','일정·금액·장소와 입금 확인 후 확정해 주세요.');
     if(r.status==='confirmed'&&d.status&&d.status!=='confirmed'){
      const manual=r.communication?.reservation?.source==='manual';
      const external=(await tx.query('SELECT id FROM moment_link.integration_jobs WHERE consultation_id=$1',[id])).rows[0];
      if(d.status!=='closed'&&(d.status!=='cancelled'||!manual&&!external))fail(409,'OPS_CHANGE_REQUIRED','확정 예약은 이벤트 완료·취소로 변경할 수 있습니다. 연결 상태를 확인해 주세요.');
     }
     if(r.communication?.reservation&&r.status!=='confirmed'&&d.status&&d.status!==r.status)fail(409,'STATE','완료·취소된 예약의 상태는 다시 변경할 수 없습니다.');
     if(d.assignee){const assigned=(await tx.query('SELECT id FROM moment_link.admin_users WHERE id=$1 AND active=true',[d.assignee])).rows[0];if(!assigned)fail(400,'ASSIGNEE','사용 중인 직원 계정을 선택해 주세요.');}
     if(['closed','cancelled'].includes(d.status)){const unresolved=(await tx.query("SELECT id FROM moment_link.integration_jobs WHERE consultation_id=$1 AND (state IN ('pending','checking','uncertain','failed') OR (booking->>'operation' IN ('reschedule','cancel','restore','registration_revision') AND state<>'succeeded'))",[id])).rows[0];if(unresolved)fail(409,'OPS_UNRESOLVED','진행 중인 OPS 작업의 결과를 먼저 확인해 주세요.');}
     if(d.status==='cancelled'&&r.status==='confirmed')cancellationQueued=await queueCancellation(tx,r,user);
     // Confirm through the same validation and audit path, atomically with assignment/contact changes.
     if(d.status==='confirmed'&&d.confirmation)await confirmReservation(tx,r,user,{...d.confirmation,version:d.version});
     const updated=(await tx.query(`UPDATE moment_link.consultations SET status=$1,assignee=$2,contacted=$3,read_at=$4,version=version+1,updated_at=now() WHERE id=$5 RETURNING *`,[cancellationQueued?r.status:d.status||r.status,d.assignee===undefined?r.assignee:d.assignee,d.contacted??r.contacted,d.read?new Date():r.read_at,id])).rows[0];await audit(tx,user.id,'consultation.updated',id,{from:r.status,to:updated.status,assignee:updated.assignee});return {item:visibleRequest(updated),cancellationQueued};
    }fail(405,'METHOD','허용되지 않는 요청입니다.');
   });await dispatch(id,result.cancellationQueued||result.restorationQueued||action==='reservation'&&method==='POST');
   if(result.item){
    if(result.cancellationQueued||result.restorationQueued||action==='reservation'&&method==='POST'||method==='GET')result.item=visibleRequest((await db.query('SELECT * FROM moment_link.consultations WHERE id=$1',[id])).rows[0]);
    result.item.integration=(await db.query("SELECT id,state,attempts,error_code,external_id,updated_at,booking->>'operation' AS operation,jsonb_build_object('date',booking->>'date','time',booking->>'time') AS schedule FROM moment_link.integration_jobs WHERE consultation_id=$1",[id])).rows[0]||null;
   }return json(result);
  }
  if(path==='/api/admin/retention'&&method==='GET'){authorize(user,true);return json({maintenance:await config(db,'maintenance')});}
  if(path==='/api/admin/retention'&&method==='POST'){authorize(user,true);return json(await purgeExpired(db));}
  if(path==='/api/admin/catalog'&&method==='GET'){authorize(user,true);return json({draft:await config(db,'catalog_draft'),published:await published(db)});}
  if(path==='/api/admin/catalog'&&method==='PUT'){
   authorize(user,true);const d=parse(z.object({version:z.number().int(),products:catalogSchema,publish:z.boolean()}).strict(),await body(request,700000));
   return json(await db.transaction(async tx=>{
    const row=(await tx.query(`SELECT * FROM moment_link.config WHERE id='catalog_draft' FOR UPDATE`)).rows[0];if(row.version!==d.version)fail(409,'VERSION','다른 관리자가 변경했습니다. 새로고침해 주세요.');
    const old=await published(tx);const missing=old.products.filter(p=>!d.products.some(n=>n.id===p.id)).map(p=>({...p,visible:false,archived:true}));
    const products=[...d.products,...missing];await tx.query(`UPDATE moment_link.config SET version=version+1,data=$1,updated_at=now() WHERE id='catalog_draft'`,[JSON.stringify(products)]);
    if(d.publish)await tx.query('INSERT INTO moment_link.catalog_versions(version,products,actor_id) VALUES($1,$2,$3)',[old.version+1,JSON.stringify(products),user.id]);
    await audit(tx,user.id,d.publish?'catalog.published':'catalog.draft.saved','catalog',{version:row.version+1});return {version:row.version+1,publishedVersion:d.publish?old.version+1:old.version};
   }));
  }
  if(path==='/api/admin/settings'&&method==='GET'){authorize(user,true);return json({settings:await config(db,'settings'),gates:{sms:env.SMS_LIVE_ENABLED==='true',push:env.PUSH_LIVE_ENABLED==='true',ops:env.OPS_WRITES_ENABLED==='true'},vapidPublicKey:env.VAPID_PUBLIC_KEY||''});}
  if(path==='/api/admin/settings'&&method==='PUT'){
   authorize(user,true);const d=parse(z.object({version:z.number().int(),data:settingsSchema}).strict(),await body(request));
   const before=(await config(db,'settings')).data;
   if(['privacyController','privacyContact','retentionDays','privacyText'].some(k=>JSON.stringify(before[k])!==JSON.stringify(d.data[k]))&&before.consentVersion===d.data.consentVersion)fail(409,'CONSENT_VERSION','개인정보 안내를 바꿀 때는 안내문 버전도 변경해 주세요.');
   if(d.data.solapi&&env.SMS_LIVE_ENABLED!=='true')fail(403,'SMS_NOT_APPROVED','문자 실발송 승인이 적용되지 않았습니다.');
   if(d.data.push&&env.PUSH_LIVE_ENABLED!=='true')fail(403,'PUSH_NOT_ENABLED','푸시 발송 연결을 먼저 설정해 주세요.');
   return json(await db.transaction(async tx=>{const r=await tx.query(`UPDATE moment_link.config SET data=$1,version=version+1,updated_at=now() WHERE id='settings' AND version=$2 RETURNING version`,[JSON.stringify(d.data),d.version]);if(!r.rows.length)fail(409,'VERSION','다른 관리자가 변경했습니다. 새로고침해 주세요.');await audit(tx,user.id,'settings.updated','settings',{keys:Object.keys(d.data)});return {version:r.rows[0].version};}));
  }
  if(path==='/api/admin/media'&&method==='POST'){
   authorize(user,true);const d=parse(z.object({data:z.string().max(1400000),alt:text(200,1)}).strict(),await body(request,1450000));const bytes=Buffer.from(d.data,'base64');if(bytes.length>1000000)fail(413,'IMAGE_TOO_LARGE','1MB 이하 이미지를 선택해 주세요.');
   let image;try{const meta=await sharp(bytes,{limitInputPixels:20000000}).metadata();if(!['png','jpeg','webp'].includes(meta.format))throw Error('Unsupported format');image=await sharp(bytes,{limitInputPixels:20000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{fail(400,'IMAGE','PNG·JPEG·WebP 이미지인지 확인해 주세요.');}
   const id=randomUUID();await db.query('INSERT INTO moment_link.media(id,mime,bytes,alt,actor_id) VALUES($1,$2,$3,$4,$5)',[id,'image/webp',image,d.alt,user.id]);await audit(db,user.id,'media.created',id);return json({id,url:'/api/media/'+id,alt:d.alt},201);
  }
  if(path==='/api/admin/users'&&method==='GET'){authorize(user,true);return json({items:(await db.query('SELECT id,username,role,active FROM moment_link.admin_users ORDER BY username')).rows});}
  if(path==='/api/admin/users'&&method==='POST'){
   authorize(user,true);const d=parse(z.object({username:text(40,3),password:passwordSchema,role:z.enum(['admin','counselor'])}).strict(),await body(request));const id=randomUUID();await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)',[id,d.username,await passwordHash(d.password),d.role]);await audit(db,user.id,'user.created',id,{role:d.role});return json({id},201);
  }
  const userMatch=path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})$/);
  if(userMatch&&method==='PATCH'){
   authorize(user,true);const id=userMatch[1],d=parse(z.object({role:z.enum(['admin','counselor']),active:z.boolean()}).strict(),await body(request));
   if(id===user.id)fail(409,'SELF_CHANGE','자신의 권한·사용 상태는 다른 관리자가 변경해야 합니다.');
   return json(await db.transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(728419)');const prior=(await tx.query('SELECT * FROM moment_link.admin_users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!prior)fail(404,'NOT_FOUND','직원 계정을 찾을 수 없습니다.');
    if(prior.role==='admin'&&(!d.active||d.role!=='admin')){const n=await tx.query("SELECT count(*)::int AS n FROM moment_link.admin_users WHERE active=true AND role='admin'");if(n.rows[0].n<=1)fail(409,'LAST_ADMIN','최소 한 명의 관리자가 필요합니다.');}
    await tx.query('UPDATE moment_link.admin_users SET role=$1,active=$2 WHERE id=$3',[d.role,d.active,id]);await tx.query('DELETE FROM moment_link.sessions WHERE user_id=$1',[id]);await audit(tx,user.id,'user.updated',id,d);return {ok:true};}));
  }
  if(path==='/api/admin/push'&&method==='POST'){
   authorize(user,true);
   const d=parse(z.object({endpoint:z.string().url().max(2000),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().max(150),auth:z.string().max(100)}).strict()}).strict(),await body(request));
   const host=new URL(d.endpoint).hostname;if(!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].some(h=>host===h||host.endsWith('.'+h))||new URL(d.endpoint).protocol!=='https:')fail(400,'PUSH_ENDPOINT','지원하지 않는 푸시 주소입니다.');
   await db.query(`INSERT INTO moment_link.push_subscriptions(id,user_id,endpoint_hash,subscription) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=$2,subscription=$4,active=true`,[randomUUID(),user.id,hash(d.endpoint),JSON.stringify(d)]);return json({ok:true});
  }
  if(path==='/api/admin/push'&&method==='DELETE'){await db.query('UPDATE moment_link.push_subscriptions SET active=false WHERE user_id=$1',[user.id]);return json({ok:true});}
  if(path==='/api/admin/jobs'&&method==='GET'){authorize(user,true);return json({notifications:(await db.query('SELECT id,channel,state,attempts,error_code,created_at FROM moment_link.outbox ORDER BY created_at DESC LIMIT 50')).rows,integrations:(await db.query("SELECT id,consultation_id,target,state,attempts,external_id,error_code,created_at,booking->>'operation' AS operation FROM moment_link.integration_jobs ORDER BY created_at DESC LIMIT 50")).rows});}
  if(path==='/api/admin/jobs/run'&&method==='POST'){authorize(user,true);await rateLimit(db,'jobs:'+user.id,10,60);const d=parse(z.object({kind:z.enum(['notification','integration']),id:z.string().uuid()}).strict(),await body(request));return json(await (d.kind==='notification'?processOutbox(db,d.id,env,adapters):processIntegration(db,d.id,env,adapters)));}
  fail(404,'NOT_FOUND','요청한 기능을 찾을 수 없습니다.');
 }catch(e){
  if(!e.status)console.error(JSON.stringify({requestId,code:'INTERNAL_ERROR',type:e.name}));
  return json({error:e.code||'INTERNAL_ERROR',message:e.status?e.message:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',requestId},e.status||500);
 }
 };
}
