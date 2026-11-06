import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parse,consultationSchema,validatePreferences} from './validation.mjs';
import {hash,fail,audit} from './security.mjs';
import {bookingSchema,confirmReservation} from './communications.mjs';

const schema=consultationSchema.pick({catalogVersion:true,productId:true,packageId:true,optionIds:true,person:true,phone:true,notes:true}).extend({
 requestId:z.string().uuid(),mode:z.enum(['draft','pending','confirmed']),booking:bookingSchema,
 assignee:z.string().uuid()
}).strict();

// Authenticated admin entry only. Customer web-consent and external reservations are never fabricated.
export async function createDirectBooking(db,user,input){
 const d=parse(schema,input),digest=hash(JSON.stringify(d)),key=hash('admin-booking:'+user.id+':'+d.requestId);
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
  const prior=(await tx.query('SELECT * FROM moment_link.consultations WHERE idempotency_hash=$1',[key])).rows[0];
  if(prior){
   if(prior.payload_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT','이미 등록한 요청입니다. 목록에서 예약을 확인해 주세요.');
   if(prior.deleted_at||new Date(prior.expires_at)<=new Date())fail(409,'BOOKING_UNAVAILABLE','기존 등록 건이 삭제되었거나 만료되었습니다. 목록을 확인해 주세요.');
   return {item:prior,replayed:true};
  }
  const c=(await tx.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  if(c.version!==d.catalogVersion)fail(409,'CATALOG_CHANGED','상품 정보가 변경되었습니다. 상품 목록 새로고침 후 다시 확인해 주세요.');
  const p=c.products.find(x=>x.id===d.productId&&x.visible&&!x.archived&&!x.salePaused),pk=p?.packages.find(x=>x.id===d.packageId);
  if(!p||!pk)fail(400,'PRODUCT','현재 등록 가능한 상품·패키지를 선택해 주세요.');
  const options=d.optionIds.map(id=>(pk.options||[]).find(o=>o.id===id));
  if(options.some(o=>!o))fail(400,'OPTION','선택 가능한 옵션을 확인해 주세요.');
  const groups=options.map(o=>o.group).filter(Boolean);
  if(new Set(groups).size!==groups.length)fail(400,'OPTION_GROUP','같은 종류의 옵션은 하나만 선택해 주세요.');
  if(options.some(o=>o.requiresOptionId&&!d.optionIds.includes(o.requiresOptionId)))fail(400,'OPTION_REQUIRES','소장용 USB를 구매하려면 영상편지 제작을 먼저 선택해 주세요.');
  if(!(await tx.query('SELECT id FROM moment_link.admin_users WHERE id=$1 AND active=true',[d.assignee])).rows.length)fail(400,'ASSIGNEE','사용 중인 담당자를 선택해 주세요.');
  const settings=(await tx.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
  if(!Number.isInteger(settings.retentionDays)||settings.retentionDays<1)fail(400,'RETENTION_REQUIRED','접수·개인정보 메뉴에서 보유기간을 먼저 설정해 주세요.');
  const optionAmount=options.reduce((sum,o)=>sum+o.amount,0);
  const snapshot={catalogVersion:c.version,product:{...p,packages:undefined},package:pk,options,price:{weekday:pk.weekday===null?null:pk.weekday+optionAmount,weekend:pk.weekend===null?null:pk.weekend+optionAmount,optionAmount},timezone:'Asia/Seoul'};
  const record={category:p.category,phone:d.phone,snapshot};
  const problem=d.mode==='draft'?MomentLinkMessages.amountError(d.booking,record):MomentLinkMessages.validate(d.mode==='confirmed'?'confirmed':'receipt',d.booking,record);
  if(problem)fail(400,'BOOKING_NOT_READY',problem);
  if(d.booking.date)validatePreferences([{date:d.booking.date,time:d.booking.time}]);
  if(d.mode!=='draft'&&!d.booking.place.trim())fail(400,'PLACE','이벤트 장소·주소를 입력해 주세요.');
  const at=new Date().toISOString(),id=randomUUID(),receipt='ML-'+id.replaceAll('-','').slice(0,14).toUpperCase();
  const communication={booking:d.booking,entry:{source:'admin_direct',createdBy:user.username,createdAt:at}};
  const consent={source:'admin_direct',recordedBy:user.username,recordedAt:at,retentionDays:settings.retentionDays};
  let item=(await tx.query(`INSERT INTO moment_link.consultations
   (id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,expires_at,status,assignee,contacted,read_at,communication)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()+make_interval(days=>$15),'consulting',$16,true,now(),$17) RETURNING *`,
   [id,receipt,key,digest,d.person,d.phone,p.category,p.id,pk.id,JSON.stringify(snapshot),JSON.stringify([{date:d.booking.date,time:d.booking.time}]),d.booking.place,d.notes,JSON.stringify(consent),settings.retentionDays,d.assignee,JSON.stringify(communication)])).rows[0];
  await audit(tx,user.id,'reservation.direct_created',id,{mode:d.mode,catalogVersion:c.version});
  if(d.mode==='confirmed')item=(await confirmReservation(tx,item,user,{version:item.version,booking:d.booking,drafts:{},approved:true})).item;
  return {item,replayed:false};
 });
}
