import {z} from 'zod';
import {parse,consultationSchema} from './validation.mjs';
import {fail,audit} from './security.mjs';
import {bookingSchema} from './communications.mjs';

const schema=z.object({version:z.number().int(),selection:consultationSchema.pick({catalogVersion:true,productId:true,packageId:true,optionIds:true}),booking:bookingSchema}).strict();
const editable=new Set(['new','initial_unreachable','consulting','no_response','awaiting_payment','hold']);

// Product revisions are drafts only. Never create, retry or alter an OPS job here.
export async function changeConsultationProduct(tx,r,user,input){
 const d=parse(schema,input),s=d.selection;
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열고 확인해 주세요.');
 if(!editable.has(r.status)||r.communication?.reservation||(await tx.query('SELECT id FROM moment_link.integration_jobs WHERE consultation_id=$1',[r.id])).rows.length)fail(409,'PRODUCT_LOCKED','상품 변경은 OPS에 등록되지 않은 상담중 예약에서만 가능합니다.');
 const c=(await tx.query('SELECT * FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
 if(c?.version!==s.catalogVersion)fail(409,'CATALOG_CHANGED','상품 정보가 변경되었습니다. 상품 목록을 새로고침한 뒤 확인해 주세요.');
 const p=c.products.find(x=>x.id===s.productId&&x.visible&&!x.archived&&!x.salePaused),pk=p?.packages.find(x=>x.id===s.packageId);
 if(!p||!pk)fail(400,'PRODUCT','현재 판매 중인 상품·패키지를 선택해 주세요.');
 const options=s.optionIds.map(id=>(pk.options||[]).find(o=>o.id===id));
 if(options.some(o=>!o))fail(400,'OPTION','선택 가능한 옵션을 확인해 주세요.');
 const groups=options.map(o=>o.group).filter(Boolean);
 if(new Set(groups).size!==groups.length)fail(400,'OPTION_GROUP','같은 종류의 옵션은 하나만 선택해 주세요.');
 if(options.some(o=>o.requiresOptionId&&!s.optionIds.includes(o.requiresOptionId)))fail(400,'OPTION_REQUIRES','먼저 필요한 기본 옵션을 선택해 주세요.');
 const optionAmount=options.reduce((sum,o)=>sum+o.amount,0);
 const snapshot={catalogVersion:c.version,product:{...p,packages:undefined},package:pk,options,price:{weekday:pk.weekday===null?null:pk.weekday+optionAmount,weekend:pk.weekend===null?null:pk.weekend+optionAmount,optionAmount},timezone:'Asia/Seoul'};
 const nextRecord={...r,category:p.category,product_id:p.id,package_id:pk.id,snapshot};
 const booking={...d.booking,scheduleConfirmed:false,paymentConfirmed:false};
 const problem=MomentLinkMessages.amountError(booking,nextRecord);if(problem)fail(400,'PRICE_CHANGED',problem);
 const old=r.communication||{},drafts=Object.fromEntries(Object.keys(MomentLinkMessages.stages).map(stage=>[stage,MomentLinkMessages.generate(nextRecord,stage,booking,'')]));
 const communication={...old,originalSelection:old.originalSelection||{category:r.category,productId:r.product_id,packageId:r.package_id,snapshot:r.snapshot},booking,drafts,paymentDeadline:''};
 const item=(await tx.query('UPDATE moment_link.consultations SET category=$2,product_id=$3,package_id=$4,snapshot=$5,communication=$6,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[r.id,p.category,p.id,pk.id,JSON.stringify(snapshot),JSON.stringify(communication)])).rows[0];
 await audit(tx,user.id,'consultation.product_changed',r.id,{from:{productId:r.product_id,packageId:r.package_id},to:{productId:p.id,packageId:pk.id},catalogVersion:c.version,amount:booking.amount});
 return {item};
}
