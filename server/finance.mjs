import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {parse,validDate,text} from './validation.mjs';
import {fail,audit} from './security.mjs';
const monthSchema=z.string().refine(v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&validDate(v+'-01'));
const won=z.number().int().min(0).max(10000000000);
const monthInput=z.object({month:monthSchema,version:z.number().int().min(0),advertisingAmount:won.nullable(),advertisingPaid:won.nullable(),referralPaid:won.nullable(),note:text(1000)}).strict().refine(d=>d.advertisingPaid===null||(d.advertisingAmount!==null&&d.advertisingPaid<=d.advertisingAmount),'광고비 지급액은 광고비 총액 이하여야 합니다.');
const costInput=z.object({id:z.string().uuid(),month:monthSchema,version:z.number().int().min(0),category:z.enum(['materials','labor','travel','venue','other']),source:z.enum(['lovehunter','seollem','other','shared']),vendor:text(100),amount:won.refine(n=>n>0),paid:won.nullable(),vat:won.nullable(),evidence:text(200),note:text(1000),voided:z.boolean()}).strict().refine(d=>(d.paid===null||d.paid<=d.amount)&&(d.vat===null||d.vat<=d.amount),'지급액·부가세는 비용 총액 이하여야 합니다.');
export const sourceNames={lovehunter:'러브헌터',seollem:'설렘',other:'기타',unknown:'미분류',shared:'공통'};
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000000?n:null;
const dbMoney=n=>n===null||n===undefined?null:Number(n);
const total=(rows,key)=>rows.reduce((s,r)=>s+(r[key]||0),0);
const kstMonth=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':new Date(d.getTime()+32400000).toISOString().slice(0,7);};
function fact(r){
 const f=r.financial||{},adjustments=Array.isArray(f.adjustments)?f.adjustments:[],reductions=adjustments.reduce((s,a)=>s+(amount(a.reduction)||0),0),recordedRefund=adjustments.reduce((s,a)=>s+(amount(a.refund)||0),0);
 const net=amount(f.amount),received=amount(f.receivedAmount),refund=amount(f.refundedAmount)??recordedRefund;
 return {...r,received_date:String(r.received_date).slice(0,10),amount:net,received,refund,reductions,gross:net===null?null:net+reductions,due:net===null||received===null?null:Math.max(0,net-received),overpaid:net!==null&&received!==null?Math.max(0,received-net):0,eligible:r.reserved&&['confirmed','closed'].includes(r.status),adjustments};
}
export function buildFinanceReport(month,raw,fees,months,costs,history=[]){
 const all=raw.map(fact),setting=months.find(r=>r.month===month),settings={version:setting?.version||0,advertisingAmount:dbMoney(setting?.advertising_amount),advertisingPaid:dbMoney(setting?.advertising_paid),referralPaid:dbMoney(setting?.referral_paid),note:setting?.note||''};
 const bookings=all.filter(r=>r.event_date?.slice(0,7)===month&&r.reserved),active=bookings.filter(r=>r.eligible),leads=all.filter(r=>r.received_date.slice(0,7)===month);
 const charges=fees.filter(r=>r.received_date.slice(0,7)===month),feeTotal=total(charges,'amount');
 const entries=costs.filter(r=>r.month===month).map(r=>({...r,amount:dbMoney(r.amount),paid:dbMoney(r.paid),vat:dbMoney(r.vat)})),validCosts=entries.filter(r=>!r.voided),otherCosts=total(validCosts,'amount');
 const sales=total(active,'amount'),received=total(active,'received');
 const refunds=all.flatMap(r=>r.adjustments.filter(a=>kstMonth(a.at)===month).map(a=>({id:r.id,person:r.person||'개인정보 미보관',at:a.at,amount:amount(a.refund)||0,reduction:amount(a.reduction)||0,source:r.source})));
 const metrics={reservations:active.length,sales,gross:total(active,'gross'),reductions:total(active,'reductions'),received,grossReceived:received+total(active,'refund'),refundForBookings:total(active,'refund'),due:total(active,'due'),overpaid:total(active,'overpaid'),missingAmount:active.filter(r=>r.amount===null).length,missingReceived:active.filter(r=>r.received===null).length,unclassified:active.filter(r=>r.source==='unknown').length,unclassifiedSales:total(active.filter(r=>r.source==='unknown'),'amount'),cancelled:bookings.filter(r=>r.status==='cancelled').length,cancelledReceived:total(bookings.filter(r=>r.status==='cancelled'),'received'),newLeads:leads.length,confirmedLeads:leads.filter(r=>r.eligible).length,fees:feeTotal,feeCount:charges.length,advertising:settings.advertisingAmount,otherCosts,costs:feeTotal+(settings.advertisingAmount||0)+otherCosts,refundsThisMonth:total(refunds,'amount'),reductionsThisMonth:total(refunds,'reduction'),missingExpensePayment:validCosts.filter(r=>r.paid===null).length+(settings.referralPaid===null?1:0)+(settings.advertisingPaid===null?1:0)};
 metrics.margin=settings.advertisingAmount===null||metrics.missingAmount?null:sales-metrics.costs;
 metrics.payables=validCosts.filter(r=>r.paid!==null).reduce((s,r)=>s+r.amount-r.paid,0)+(settings.referralPaid===null?0:Math.max(0,feeTotal-settings.referralPaid))+(settings.advertisingPaid===null?0:settings.advertisingAmount-settings.advertisingPaid);
 const bySource=['lovehunter','seollem','other','unknown'].map(source=>{
  const rows=active.filter(r=>r.source===source),cohort=leads.filter(r=>r.source===source),n=cohort.length,confirmed=cohort.filter(r=>r.eligible).length,revenue=total(rows,'amount'),marketing=source==='lovehunter'?feeTotal:source==='seollem'?settings.advertisingAmount:0;
  return {source,name:sourceNames[source],leads:n,confirmed,conversion:n?confirmed/n*100:null,reservations:rows.length,sales:revenue,received:total(rows,'received'),due:total(rows,'due'),marketing,costPerLead:marketing!==null&&n?marketing/n:null,roas:marketing>0?revenue/marketing*100:null,otherCosts:total(validCosts.filter(r=>r.source===source),'amount')};
 });
 const byProduct=[...new Set(active.map(r=>r.category))].map(category=>{const rows=active.filter(r=>r.category===category);return {category,count:rows.length,sales:total(rows,'amount'),received:total(rows,'received'),due:total(rows,'due')};});
 const trend=Array.from({length:12},(_,i)=>{
  const key=month.slice(0,4)+'-'+String(i+1).padStart(2,'0'),rows=all.filter(r=>r.eligible&&r.event_date?.slice(0,7)===key),m=months.find(r=>r.month===key),ad=dbMoney(m?.advertising_amount),referral=total(fees.filter(r=>r.received_date.slice(0,7)===key),'amount'),other=total(costs.filter(r=>r.month===key&&!r.voided).map(r=>({...r,amount:Number(r.amount)})),'amount'),sales=total(rows,'amount');
  return {month:key,reservations:rows.length,sales,fees:referral,advertising:ad,otherCosts:other,margin:ad===null||rows.some(r=>r.amount===null)?null:sales-referral-ad-other};
 });
 return {month,settings,metrics,bySource,byProduct,trend,bookings,refunds,fees:charges,costs:entries,history,generatedAt:new Date().toISOString(),basis:'예약매출·입금·미수금은 행사월의 확정·완료 예약별 현재 누계입니다. 소개 수수료는 최초 접수월, 설렘 광고비와 추가 비용은 입력한 귀속월 기준입니다. 기간이 달라 ROAS와 관리손익은 운영 참고값이며 회계상 순이익이 아닙니다. 취소 예약은 매출에서 제외합니다. 빈 금액은 0원이 아닌 미확인입니다.'};
}
export async function financeReport(db,month){
 parse(monthSchema,month);const year=month.slice(0,4);
 const facts=(await db.query("SELECT f.*,f.received_date::text AS received_date,CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.person ELSE NULL END AS person,CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.receipt ELSE NULL END AS receipt FROM moment_link.finance_booking_facts f LEFT JOIN moment_link.consultations c ON c.id=f.consultation_id WHERE left(f.event_date,4)=$1 OR extract(year FROM f.received_date)::text=$1 OR f.financial->'adjustments'<>'[]'::jsonb",[year])).rows;
 const fees=(await db.query("SELECT r.id,r.kind,r.amount,r.received_date::text AS received_date,CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.status ELSE NULL END AS status,CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.id ELSE NULL END AS consultation_id,CASE WHEN c.deleted_at IS NULL AND c.expires_at>now() THEN c.person ELSE NULL END AS person FROM moment_link.lovehunter_referrals r LEFT JOIN moment_link.consultations c ON c.id=r.consultation_id WHERE extract(year FROM r.received_date)::text=$1",[year])).rows;
 const months=(await db.query('SELECT * FROM moment_link.finance_months WHERE left(month,4)=$1',[year])).rows,costs=(await db.query('SELECT * FROM moment_link.finance_costs WHERE left(month,4)=$1 ORDER BY created_at DESC',[year])).rows;
 const history=(await db.query("SELECT h.id,h.action,h.before_value,h.after_value,h.created_at,COALESCE(u.username,'삭제된 계정') AS actor FROM moment_link.finance_history h LEFT JOIN moment_link.admin_users u ON u.id=h.actor_id WHERE h.month=$1 ORDER BY h.created_at DESC LIMIT 100",[month])).rows;
 return buildFinanceReport(month,facts,fees,months,costs,history);
}
async function record(tx,user,month,id,action,before,after){
 await tx.query('INSERT INTO moment_link.finance_history(id,month,entity_id,action,before_value,after_value,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),month,id,action,before?JSON.stringify(before):null,JSON.stringify(after),user.id]);
 await audit(tx,user.id,'finance.'+action,'finance:'+id,{month,entity:id});
}
export async function saveFinanceMonth(db,user,input){
 const d=parse(monthInput,input);
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['finance:'+d.month]);
  const before=(await tx.query('SELECT * FROM moment_link.finance_months WHERE month=$1 FOR UPDATE',[d.month])).rows[0];
  if((before?.version||0)!==d.version)fail(409,'VERSION','다른 관리자가 수정했습니다. 다시 조회한 뒤 입력해 주세요.');
  const fee=(await tx.query("SELECT COALESCE(sum(amount),0)::bigint AS amount FROM moment_link.lovehunter_referrals WHERE received_date >= $1::date AND received_date < $1::date+interval '1 month'",[d.month+'-01'])).rows[0];
  if(d.referralPaid!==null&&d.referralPaid>Number(fee.amount))fail(400,'PAYMENT','소개 수수료 지급액이 발생액보다 큽니다.');
  const row=(await tx.query('INSERT INTO moment_link.finance_months(month,advertising_amount,advertising_paid,referral_paid,note,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(month) DO UPDATE SET advertising_amount=$2,advertising_paid=$3,referral_paid=$4,note=$5,updated_by=$6,version=finance_months.version+1,updated_at=now() RETURNING *',[d.month,d.advertisingAmount,d.advertisingPaid,d.referralPaid,d.note,user.id])).rows[0];
  await record(tx,user,d.month,d.month,'month_saved',before,row);return {ok:true,version:row.version};
 });
}
export async function saveFinanceCost(db,user,input){
 const d=parse(costInput,input);
 return db.transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['cost:'+d.id]);
  const before=(await tx.query('SELECT * FROM moment_link.finance_costs WHERE id=$1 FOR UPDATE',[d.id])).rows[0];
  if((before?.version||0)!==d.version)fail(409,'VERSION','비용 내역이 변경되었습니다. 다시 조회해 주세요.');
  if(before&&before.month!==d.month)fail(400,'MONTH','비용의 귀속월을 바꾸려면 기존 내역을 제외 처리하고 새 내역을 등록해 주세요.');
  if(!before&&d.voided)fail(400,'COST','저장된 내역만 제외할 수 있습니다.');
  const row=(await tx.query('INSERT INTO moment_link.finance_costs(id,month,category,source,vendor,amount,paid,vat,evidence,note,voided,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) ON CONFLICT(id) DO UPDATE SET category=$3,source=$4,vendor=$5,amount=$6,paid=$7,vat=$8,evidence=$9,note=$10,voided=$11,updated_by=$12,version=finance_costs.version+1,updated_at=now() RETURNING *',[d.id,d.month,d.category,d.source,d.vendor,d.amount,d.paid,d.vat,d.evidence,d.note,d.voided,user.id])).rows[0];
  await record(tx,user,d.month,d.id,d.voided?'cost_voided':'cost_saved',before,row);return {ok:true,version:row.version};
 });
}
