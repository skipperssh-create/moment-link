import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
import {processOutbox,processIntegration} from '../server/jobs.mjs';
import {initialSettings} from '../server/seed.mjs';
import catalog from '../catalog.confirmed.json' with {type:'json'};
import {purgeExpired,authorizedCron} from '../server/retention.mjs';
let pg,db,app,admin,counselor,adminId,counselorId,csrf,cookie,receiptId;
const env={APP_ORIGIN:'https://test.moment-link.invalid',NODE_ENV:'production'};
const payload=()=>({catalogVersion:1,productId:'classic',packageId:'light',category:'yacht',person:'합성 검수',phone:'01000000000',preferences:[{date:'2099-11-01',time:'오후'}],place:'',notes:'SYNTHETIC ONLY',consent:true,consentVersion:'test-v1'});
async function request(path,{method='GET',data,auth=false,headers={}}={}){const response=await app(new Request(env.APP_ORIGIN+'/api/'+path,{method,headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)}));return {status:response.status,headers:response.headers,data:await response.json()};}
before(async()=>{
 pg=new PGlite();db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(tx=>fn(tx))};await migrate(db);adminId=randomUUID();counselorId=randomUUID();
 for(const [id,name,role]of [[adminId,'admin','admin'],[counselorId,'counselor','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,name,await passwordHash('Synthetic-password-123!'),role]);
 await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...initialSettings,accepting:true,privacyController:'합성 검수',privacyContact:'테스트',privacyText:'합성 개인정보 처리 고지',retentionDays:1,consentVersion:'test-v1'})]);app=createApp({db,env});
});
after(async()=>pg.close());
test('public catalog contains approved prices and excludes notification settings',async()=>{const r=await request('catalog');assert.equal(r.status,200);assert.equal(r.data.products.find(p=>p.id==='heli').packages[2].weekday,1090000);assert.equal(r.data.settings.solapi,undefined);});
test('admin API rejects anonymous access',async()=>{assert.equal((await request('admin/consultations')).status,401);});
test('login issues HttpOnly secure session and opaque CSRF token',async()=>{admin=await request('auth/login',{method:'POST',data:{username:'admin',password:'Synthetic-password-123!'}});assert.equal(admin.status,200);cookie=admin.headers.get('set-cookie').split(';')[0];csrf=admin.data.csrf;assert.match(admin.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict.*Secure/);assert.equal((await request('auth/session',{auth:true})).data.user.role,'admin');});
test('CSRF and cross-origin writes are rejected',async()=>{assert.equal((await request('admin/settings',{method:'PUT',data:{},auth:true,headers:{'X-CSRF-Token':'bad'}})).status,403);assert.equal((await request('auth/login',{method:'POST',data:{},headers:{Origin:'https://evil.invalid'}})).status,403);});
test('consultation saves atomically and repeated request returns the same receipt',async()=>{const key=randomUUID(),d=payload();const a=await request('consultations',{method:'POST',data:d,headers:{'Idempotency-Key':key}});assert.equal(a.status,201,JSON.stringify(a.data));const b=await request('consultations',{method:'POST',data:d,headers:{'Idempotency-Key':key}});assert.equal(b.status,200);assert.equal(a.data.receipt,b.data.receipt);assert.equal((await db.query('SELECT * FROM moment_link.consultations')).rows.length,1);receiptId=(await db.query('SELECT id FROM moment_link.consultations')).rows[0].id;const c=await request('consultations',{method:'POST',data:{...d,person:'다른 내용'},headers:{'Idempotency-Key':key}});assert.equal(c.status,409);});
test('no client-supplied price or unknown fields are accepted',async()=>{assert.equal((await request('consultations',{method:'POST',data:{...payload(),price:1},headers:{'Idempotency-Key':randomUUID()}})).status,400);});
test('invalid dates, past dates, duplicate preferences and missing consent fail',async()=>{for(const patch of [{preferences:[{date:'2099-02-31',time:'오후'}]},{preferences:[{date:'2000-01-01',time:'오후'}]},{preferences:[{date:'2099-11-01',time:'오후'},{date:'2099-11-01',time:'오후'}]},{consent:false}])assert.equal((await request('consultations',{method:'POST',data:{...payload(),...patch},headers:{'Idempotency-Key':randomUUID()}})).status,400);});
test('same day different time is accepted',async()=>{assert.equal((await request('consultations',{method:'POST',data:{...payload(),preferences:[{date:'2099-11-01',time:'오전'},{date:'2099-11-01',time:'오후'}]},headers:{'Idempotency-Key':randomUUID()}})).status,201);});
test('stale catalog and privacy versions require reconfirmation',async()=>{for(const patch of [{catalogVersion:999},{consentVersion:'old'}])assert.equal((await request('consultations',{method:'POST',data:{...payload(),...patch},headers:{'Idempotency-Key':randomUUID()}})).status,409);});
test('disabled notifications do not enqueue backlog',async()=>{assert.equal((await db.query('SELECT * FROM moment_link.outbox')).rows.length,0);});
test('counselor cannot see unassigned clients or modify catalog',async()=>{const c=await request('auth/login',{method:'POST',data:{username:'counselor',password:'Synthetic-password-123!'}});const headers={Cookie:c.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':c.data.csrf};assert.equal((await request('admin/consultations',{headers})).data.items.length,0);assert.equal((await request('admin/catalog',{headers})).status,403);assert.equal((await request('admin/consultations/'+receiptId,{headers})).status,404);counselor=headers;});
test('optimistic version locks preserve concurrent admin edits',async()=>{const a=await request('admin/consultations/'+receiptId,{method:'PATCH',auth:true,data:{version:1,status:'consulting',assignee:counselorId}});assert.equal(a.status,200);assert.equal((await request('admin/consultations/'+receiptId,{method:'PATCH',auth:true,data:{version:1,status:'hold'}})).status,409);assert.equal((await request('admin/consultations',{headers:counselor})).data.items.length,1);});
test('draft edits are private; publish preserves request price snapshot',async()=>{const edited=structuredClone(catalog);edited[0].packages[0].weekday=400000;let r=await request('admin/catalog',{method:'PUT',auth:true,data:{version:1,products:edited,publish:false}});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await request('catalog')).data.products[0].packages[0].weekday,390000);r=await request('admin/catalog',{method:'PUT',auth:true,data:{version:2,products:edited,publish:true}});assert.equal(r.status,200);assert.equal((await request('catalog')).data.products[0].packages[0].weekday,400000);assert.equal((await db.query('SELECT snapshot FROM moment_link.consultations WHERE id=$1',[receiptId])).rows[0].snapshot.price.weekday,390000);});
test('SMS and intake activation fail without approval and finalized policy',async()=>{const s=(await request('admin/settings',{auth:true})).data.settings;assert.equal((await request('admin/settings',{method:'PUT',auth:true,data:{version:s.version,data:{...s.data,solapi:true}}})).status,403);assert.equal((await request('admin/settings',{method:'PUT',auth:true,data:{version:s.version,data:{...s.data,privacyController:''}}})).status,400);});
test('queued SMS checks OFF again immediately before sending',async()=>{const id=randomUUID();await db.query('INSERT INTO moment_link.outbox(id,event_key,consultation_id,channel) VALUES($1,$2,$3,$4)',[id,id,receiptId,'sms_customer']);let calls=0;const r=await processOutbox(db,id,{SMS_LIVE_ENABLED:'true'},{solapi:()=>{calls++;}});assert.equal(r.state,'blocked');assert.equal(calls,0);});
test('OPS submission is separate from customer intake and blocked by default',async()=>{assert.equal((await db.query('SELECT * FROM moment_link.integration_jobs')).rows.length,0);const result=await request('admin/consultations/'+receiptId+'/confirm',{method:'POST',auth:true,data:{version:2,date:'2099-11-01',time:'15:00',durationMinutes:30,amount:390000,place:'합성 장소',resourceId:'synthetic-boat',approved:true}});assert.equal(result.status,200,JSON.stringify(result.data));const r=await processIntegration(db,result.data.job.id,{});assert.equal(r.state,'blocked');assert.equal((await db.query('SELECT status FROM moment_link.consultations WHERE id=$1',[receiptId])).rows[0].status,'consulting');});
test('OPS unknown create outcome is reconciled before any retry',async()=>{const job=(await db.query('SELECT * FROM moment_link.integration_jobs')).rows[0];let creates=0,lookups=0;const adapters={ops:{boatn:{lookup:async()=>{lookups++;return null;},availability:async()=>({available:true,token:'synthetic'}),create:async()=>{creates++;throw Error('timeout');}}}};const r=await processIntegration(db,job.id,{OPS_WRITES_ENABLED:'true'},adapters);assert.equal(r.state,'uncertain');await processIntegration(db,job.id,{OPS_WRITES_ENABLED:'true'},adapters);assert.equal(creates,1);assert.equal(lookups,2);adapters.ops.boatn.lookup=async()=>({id:'synthetic-reservation'});assert.equal((await processIntegration(db,job.id,{OPS_WRITES_ENABLED:'true'},adapters)).state,'succeeded');assert.equal((await db.query('SELECT status FROM moment_link.consultations WHERE id=$1',[receiptId])).rows[0].status,'confirmed');});
test('audit records never contain customer phone or password',async()=>{const logs=JSON.stringify((await db.query('SELECT * FROM moment_link.audit_logs')).rows);assert.ok(!logs.includes('01000000000'));assert.ok(!logs.includes('Synthetic-password'));});
test('logout revokes server session',async()=>{assert.equal((await request('auth/logout',{method:'POST',auth:true,data:{}})).status,200);assert.equal((await request('admin/consultations',{auth:true})).status,401);});

test('interrupted OPS workers reconcile; OFF does not erase unknown outcome',async()=>{
 const j=(await db.query('SELECT * FROM moment_link.integration_jobs')).rows[0];
 await db.query("UPDATE moment_link.integration_jobs SET state='checking',updated_at=now()-interval '5 minutes' WHERE id=$1",[j.id]);
 assert.equal((await processIntegration(db,j.id,{})).state,'uncertain');
 let creates=0;const adapters={ops:{boatn:{lookup:async()=>{throw Error('lookup unavailable');},create:async()=>{creates++;}}}};
 assert.equal((await processIntegration(db,j.id,{OPS_WRITES_ENABLED:'true'},adapters)).state,'uncertain');
 adapters.ops.boatn.lookup=async()=>null;
 assert.equal((await processIntegration(db,j.id,{OPS_WRITES_ENABLED:'true'},adapters)).state,'uncertain');assert.equal(creates,0);
});
test('interrupted SMS queries the existing provider group without resending',async()=>{
 const id=randomUUID();await db.query("INSERT INTO moment_link.outbox(id,event_key,consultation_id,channel,state,provider_id,updated_at) VALUES($1,$3,$2,'sms_customer','sending','synthetic-group',now()-interval '5 minutes')",[id,receiptId,id]);
 const calls=[];const r=await processOutbox(db,id,{SMS_LIVE_ENABLED:'true'},{solapi:async(path,method='GET')=>{calls.push(method);return {status:'COMPLETE',count:{sentSuccess:1,sentFailed:0}};}});
 assert.equal(r.state,'sent');assert.equal(r.delivery,'SMS_DELIVERED');assert.deepEqual(calls,['GET']);
});
test('new enabled notifications dispatch after commit and replay never redispatches',async()=>{
 const prior=(await db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
 await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...prior,solapi:true,customerAuto:true})]);
 let sends=0;const work=[];
 const handler=createApp({db,env:{...env,SMS_LIVE_ENABLED:'true'},schedule:p=>work.push(p),adapters:{solapi:async(path,method)=>{if(path==='/groups')return {groupId:'synthetic-enabled-group'};if(method==='PUT')return {errorCount:0,resultList:[{statusCode:'2000'}]};if(path.endsWith('/send')){sends++;assert.ok((await db.query('SELECT * FROM moment_link.consultations WHERE phone=$1',['01000000001'])).rows.length);return {};}}}});
 const key=randomUUID(),make=()=>new Request(env.APP_ORIGIN+'/api/consultations',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({...payload(),catalogVersion:2,phone:'01000000001'})});
 assert.equal((await handler(make())).status,201);await Promise.all(work);assert.equal(sends,1);assert.equal((await handler(make())).status,200);assert.equal(sends,1);
 await db.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify(prior)]);
});
test('invalid images are rejected and disabling staff revokes active sessions',async()=>{
 const a=await request('auth/login',{method:'POST',data:{username:'admin',password:'Synthetic-password-123!'}});cookie=a.headers.get('set-cookie').split(';')[0];csrf=a.data.csrf;
 assert.equal((await request('admin/media',{auth:true,method:'POST',data:{data:Buffer.from('<svg/>').toString('base64'),alt:'합성'}})).status,400);
 assert.equal((await request('admin/users/'+adminId,{auth:true,method:'PATCH',data:{role:'counselor',active:false}})).status,409);
 assert.equal((await request('admin/users/'+counselorId,{auth:true,method:'PATCH',data:{role:'counselor',active:false}})).status,200);
 assert.equal((await request('admin/consultations',{headers:counselor})).status,401);
});

test('catalog validates photo metadata, date exceptions, and paused sales',async()=>{
 const current=(await request('admin/catalog',{auth:true})).data.draft;
 const products=structuredClone(current.data);products[0].salePaused=true;products[0].media=[{url:'https://example.invalid/synthetic.webp',alt:'합성 검수 사진'}];products[0].packages[0].datePrices=[{date:'2099-11-01',amount:450000}];
 const saved=await request('admin/catalog',{auth:true,method:'PUT',data:{version:current.version,products,publish:true}});assert.equal(saved.status,200);
 assert.equal((await request('consultations',{method:'POST',data:{...payload(),catalogVersion:saved.data.publishedVersion},headers:{'Idempotency-Key':randomUUID()}})).status,400);
 products[0].packages[0].datePrices.push({date:'2099-11-01',amount:1});
 assert.equal((await request('admin/catalog',{auth:true,method:'PUT',data:{version:saved.data.version,products,publish:false}})).status,400);
});

test('configured options are priced on the server and arbitrary options are rejected',async()=>{
 const current=(await request('admin/catalog',{auth:true})).data.draft,products=structuredClone(current.data);
 products[0].salePaused=false;products[0].packages[0].options=[{id:'usb',name:'합성 추가 선택',amount:10000}];
 const saved=await request('admin/catalog',{auth:true,method:'PUT',data:{version:current.version,products,publish:true}});assert.equal(saved.status,200);
 const d={...payload(),catalogVersion:saved.data.publishedVersion,phone:'01000000005',optionIds:['usb']};
 assert.equal((await request('consultations',{method:'POST',data:{...d,optionIds:['missing']},headers:{'Idempotency-Key':randomUUID()}})).status,400);
 assert.equal((await request('consultations',{method:'POST',data:{...d,optionIds:['usb','usb']},headers:{'Idempotency-Key':randomUUID()}})).status,400);
 const response=await request('consultations',{method:'POST',data:d,headers:{'Idempotency-Key':randomUUID()}});assert.equal(response.status,201);
 const savedRow=(await db.query('SELECT * FROM moment_link.consultations WHERE receipt=$1',[response.data.receipt])).rows[0];
 assert.equal(savedRow.snapshot.price.weekday,410000);assert.equal(savedRow.snapshot.price.dateOverrides[0].override.amount,460000);assert.equal(savedRow.snapshot.options[0].name,'합성 추가 선택');
 assert.ok(new Date(savedRow.expires_at)>new Date(savedRow.created_at));
});

test('real browser push JSON is accepted; private endpoints are rejected',async()=>{
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-test-only',expirationTime:null,keys:{p256dh:'synthetic',auth:'synthetic'}};
 assert.equal((await request('admin/push',{auth:true,method:'POST',data:subscription})).status,200);
 assert.equal((await request('admin/push',{auth:true,method:'POST',data:{...subscription,endpoint:'https://127.0.0.1/private'}})).status,400);
});

test('retention removes expired consultation and all linked personal data only',async()=>{
 const remaining=(await db.query('SELECT id FROM moment_link.consultations WHERE id<>$1',[receiptId])).rows.length;
 await db.query('INSERT INTO moment_link.consultation_notes(id,consultation_id,actor_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),receiptId,adminId,'합성 개인정보 메모']);
 await db.query("UPDATE moment_link.consultations SET expires_at=now()-interval '1 second' WHERE id=$1",[receiptId]);
 assert.equal((await request('admin/consultations/'+receiptId,{auth:true})).status,404);
 assert.ok(!(await request('admin/consultations',{auth:true})).data.items.some(r=>r.id===receiptId));
 const result=await purgeExpired(db);assert.equal(result.deleted,1);
 for(const table of ['consultation_notes','outbox','integration_jobs'])assert.equal((await db.query(`SELECT * FROM moment_link.${table} WHERE consultation_id=$1`,[receiptId])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM moment_link.audit_logs WHERE entity_id=$1',[receiptId])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM moment_link.consultations')).rows.length,remaining);assert.equal((await purgeExpired(db)).deleted,0);
});

test('cron cleanup requires a strong exact bearer and policy edits require a new consent version',async()=>{
 const secret='synthetic-cron-secret-32-characters-long';
 assert.equal(authorizedCron(new Request(env.APP_ORIGIN),secret),false);
 assert.equal(authorizedCron(new Request(env.APP_ORIGIN,{headers:{authorization:'Bearer '+secret}}),secret),true);
 assert.equal((await request('cron/retention')).status,401);
 const cron=createApp({db,env:{...env,CRON_SECRET:secret}});
 assert.equal((await cron(new Request(env.APP_ORIGIN+'/api/cron/retention',{headers:{Authorization:'Bearer '+secret}}))).status,200);
 const s=(await request('admin/settings',{auth:true})).data.settings;
 assert.equal((await request('admin/settings',{auth:true,method:'PUT',data:{version:s.version,data:{...s.data,retentionDays:30}}})).status,409);
});

test('helicopter intake only accepts daytime preferences in both slots, including recommendation',async()=>{
 const version=(await request('catalog')).data.version;
 const heli={...payload(),catalogVersion:version,productId:'heli',packageId:'basic',category:'heli',phone:'01000000008'};
 for(const time of ['저녁','19:00','15:00']){
  for(const preferences of [[{date:'2099-11-01',time}],[{date:'2099-11-01',time:'오전'},{date:'2099-11-02',time}]]){
   const result=await request('consultations',{method:'POST',data:{...heli,preferences},headers:{'Idempotency-Key':randomUUID()}});assert.equal(result.status,400);assert.equal(result.data.error,'HELI_DAYTIME_ONLY');
  }
 }
 const recommend=await request('consultations',{method:'POST',data:{...heli,productId:'recommend',packageId:'recommend',preferences:[{date:'2099-11-01',time:'저녁'}]},headers:{'Idempotency-Key':randomUUID()}});assert.equal(recommend.data.error,'HELI_DAYTIME_ONLY');
 for(const time of ['오전','오후','시간 무관'])assert.equal((await request('consultations',{method:'POST',data:{...heli,preferences:[{date:'2099-11-01',time}]},headers:{'Idempotency-Key':randomUUID()}})).status,201);
 const yacht={...payload(),catalogVersion:version,phone:'01000000009'};
 for(const time of ['저녁','19:00'])assert.equal((await request('consultations',{method:'POST',data:{...yacht,preferences:[{date:'2099-11-01',time}]},headers:{'Idempotency-Key':randomUUID()}})).status,201);
});

test('new staff can start with eight characters and complete first-login password change',async()=>{
 const data={username:'eight-char-staff',password:'Start8!x',role:'counselor'};
 assert.equal((await request('admin/users',{auth:true,method:'POST',data:{...data,password:'Short7!'}})).status,400);
 const created=await request('admin/users',{auth:true,method:'POST',data});assert.equal(created.status,201);
 const first=await request('auth/login',{method:'POST',data:{username:data.username,password:data.password}});assert.equal(first.status,200);assert.equal(first.data.user.mustChangePassword,true);
 const headers={Cookie:first.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':first.data.csrf};
 assert.equal((await request('admin/consultations',{headers})).status,403);
 assert.equal((await request('auth/password',{method:'POST',headers,data:{current:data.password,password:'Next8!xy'}})).status,200);
 assert.equal((await request('admin/consultations',{headers})).status,401);
 const second=await request('auth/login',{method:'POST',data:{username:data.username,password:'Next8!xy'}});assert.equal(second.status,200);assert.equal(second.data.user.id,created.data.id);assert.equal(second.data.user.mustChangePassword,false);
 assert.equal((await request('admin/consultations',{headers:{Cookie:second.headers.get('set-cookie').split(';')[0]}})).status,200);
});

test('account rename with eight-character password is atomic and revokes prior sessions',async()=>{
 const original='Synthetic-password-123!',next='Test8!xy';
 assert.equal((await request('auth/password',{auth:true,method:'POST',data:{current:original,password:'Short7!'}})).status,400);
 assert.equal((await request('auth/password',{auth:true,method:'POST',data:{current:'incorrect',username:'renamed-admin',password:next}})).status,403);
 assert.equal((await request('auth/password',{auth:true,method:'POST',data:{current:original,username:'counselor',password:next}})).status,409);
 const unchanged=await request('auth/login',{method:'POST',data:{username:'admin',password:original}});assert.equal(unchanged.status,200);
 const secondCookie=unchanged.headers.get('set-cookie').split(';')[0];
 const changed=await request('auth/password',{auth:true,method:'POST',data:{current:original,username:'renamed-admin',password:next}});assert.equal(changed.status,200);
 assert.equal((await request('admin/consultations',{auth:true})).status,401);
 assert.equal((await request('admin/consultations',{headers:{Cookie:secondCookie}})).status,401);
 assert.equal((await request('auth/login',{method:'POST',data:{username:'admin',password:original}})).status,401);
 const loggedIn=await request('auth/login',{method:'POST',data:{username:'renamed-admin',password:next}});assert.equal(loggedIn.status,200);assert.equal(loggedIn.data.user.id,adminId);
 assert.equal(loggedIn.data.user.role,'admin');assert.equal(loggedIn.data.user.mustChangePassword,false);
 assert.ok(!JSON.stringify((await db.query('SELECT * FROM moment_link.audit_logs')).rows).includes(next));
});
