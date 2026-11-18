/* A recorded refund is an accounting fact; this module never transfers money. */
(() => {
'use strict';
const A=globalThis.MomentLinkAddOns;
const labels={bouquet:'꽃다발 모두 제외'};
function choices(r){
 const b=r.communication?.booking||{},excluded=b.excludedOptionIds||[];
 return [...(!b.excludedServices?.includes('bouquet')?[{id:'bouquet',label:labels.bouquet,amount:30000}]:[]),
 ...(r.snapshot?.options||[]).filter(o=>!excluded.includes(o.id)).map(o=>({id:'option:'+o.id,label:o.name+' 취소',amount:o.amount})),
 ...(b.addOns||[]).map(o=>({id:'addon:'+o.id,label:(o.description||A.catalog.find(x=>x.id===o.id)?.label||o.id)+' 취소',amount:o.quantity*o.unitAmount})),
 {id:'adjustment',label:'기타 금액 차감',amount:null}];
}
function calculate(r,d){
 const b=r.communication?.booking||{},choice=choices(r).find(c=>c.id===d.target);
 if(!choice)throw Error('취소할 옵션을 다시 선택해 주세요.');
 if(![b.amount,b.receivedAmount].every(v=>Number.isSafeInteger(v)&&v>=0)||b.receivedAmount>b.amount)throw Error('기존 총액과 실제 입금액을 먼저 확인해 주세요.');
 if(!Number.isSafeInteger(d.reduction)||d.reduction<=0||d.reduction>=b.amount)throw Error('차감액은 총액보다 작은 1원 이상 금액으로 입력해 주세요. 전체 취소는 예약 취소를 이용해 주세요.');
 if(!Number.isSafeInteger(d.refund)||d.refund<0||d.refund>d.reduction||d.refund>b.receivedAmount)throw Error('실제 환불액은 받은 금액과 차감액 이하로 입력해 주세요.');
 const amount=b.amount-d.reduction,receivedAmount=b.receivedAmount-d.refund;
 if(receivedAmount>amount)throw Error('변경 총액을 초과한 '+(receivedAmount-amount).toLocaleString('ko-KR')+'원을 추가로 환불한 뒤 실제 환불액을 입력해 주세요.');
 if(typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>200||/[<>\[\]\p{Cc}]/u.test(d.reason))throw Error('변경 사유를 줄바꿈 없이 200자 이내로 입력해 주세요.');
 const excluded=new Set(b.excludedOptionIds||[]),services=new Set(b.excludedServices||[]);
 let addOns=A.validate(b.addOns);
 if(d.target==='bouquet'){
  services.add('bouquet');addOns=addOns.filter(o=>!['bouquet','bouquet_custom'].includes(o.id));
  for(const o of r.snapshot?.options||[])if(/꽃다발|bouquet/i.test(o.name+' '+o.id))excluded.add(o.id);
 }else if(d.target.startsWith('option:'))excluded.add(d.target.slice(7));
 else if(d.target.startsWith('addon:'))addOns=addOns.filter(o=>o.id!==d.target.slice(6));
 const baseAmount=amount-A.total(addOns);if(baseAmount<0)throw Error('남은 추가상품 합계보다 총액이 작습니다. 취소 품목과 차감액을 확인해 주세요.');
 const line=choice.label+' · '+d.reason.trim()+' · 차감 '+d.reduction.toLocaleString('ko-KR')+'원 · '+(d.refund?'환불 완료 '+d.refund.toLocaleString('ko-KR')+'원':'환불 없음');
 const adjustmentNote=[b.adjustmentNote,line].filter(Boolean).join('\n');if(adjustmentNote.length>2000)throw Error('변경 이력이 많습니다. 담당 관리자에게 확인해 주세요.');
 const next={...b,amount,baseAmount,receivedAmount,addOns,amountMode:'manual',excludedOptionIds:[...excluded],excludedServices:[...services],refundedAmount:(b.refundedAmount||0)+d.refund,adjustmentNote};
 if(next.requestedDepositAmount>amount)next.requestedDepositAmount=amount;
 return {booking:next,label:choice.label,balance:amount-receivedAmount};
}
globalThis.MomentLinkAdjustment=Object.freeze({choices,calculate});
})();
