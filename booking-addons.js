/* Extra purchases share BOATN OPS item IDs; base quotes and paid extras remain separate. */
(() => {
'use strict';
const catalog=Object.freeze([
 {id:'bouquet',label:'꽃다발 추가',unit:'다발',price:30000},
 {id:'bouquet_custom',label:'꽃다발 추가 · 수기 금액',unit:'다발',price:null},
 {id:'fireworks',label:'폭죽 1다발 추가',unit:'다발',price:30000},
 {id:'cake',label:'케익 추가',unit:'개',price:null,defaultPrice:16500},
 {id:'wine_bottle',label:'와인 추가',unit:'병',price:null}
]);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number.isSafeInteger(v)?v.toLocaleString('ko-KR')+'원':'입력 필요';
function setPrices(prices){if(Number.isSafeInteger(prices?.cakeSale)&&prices.cakeSale>=0&&prices.cakeSale<=10000000)catalog.find(x=>x.id==='cake').defaultPrice=prices.cakeSale;}
function validate(rows=[]){
 if(!Array.isArray(rows)||rows.length>5)throw Error('추가 구매 옵션을 확인해 주세요.');
 const seen=new Set();
 const result=rows.map(row=>{
  const item=catalog.find(x=>x.id===row?.id);
  if(!item||seen.has(row.id)||!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>100||!Number.isSafeInteger(row.unitAmount)||row.unitAmount<0||row.unitAmount>10000000||item.price!==null&&row.unitAmount!==item.price)throw Error('추가 구매 수량과 판매가를 확인해 주세요.');
  if(row.description!==undefined&&(typeof row.description!=='string'||row.description.length>50||/[<>\p{Cc}]/u.test(row.description)))throw Error('추가 구매 품목 설명은 특수문자 없이 50자 이내로 입력해 주세요.');
  if(Object.keys(row).some(k=>!['id','quantity','unitAmount','description'].includes(k)))throw Error('지원하지 않는 추가 구매 항목입니다.');
  seen.add(row.id);return {id:row.id,quantity:row.quantity,unitAmount:row.unitAmount,...(row.description?.trim()?{description:row.description.trim()}:{} )};
 });
 if(seen.has('bouquet')&&seen.has('bouquet_custom'))throw Error('꽃다발 기본 금액과 수기 금액 중 하나를 선택해 주세요.');
 return result.sort((a,b)=>catalog.findIndex(x=>x.id===a.id)-catalog.findIndex(x=>x.id===b.id));
}
const total=rows=>validate(rows).reduce((sum,row)=>sum+row.quantity*row.unitAmount,0);
function base(b){return Object.hasOwn(b,'baseAmount')?b.baseAmount:Number.isSafeInteger(b.amount)?b.amount-total(b.addOns):null;}
function recalculate(b){try{const extra=total(b.addOns);b.amount=Number.isSafeInteger(b.baseAmount)?b.baseAmount+extra:null;}catch{b.amount=null;}return b;}
function problem(b){
 try{const extra=total(b.addOns);if(Object.hasOwn(b,'baseAmount')||b.addOns?.length){if(b.baseAmount!==null&&(!Number.isSafeInteger(b.baseAmount)||b.baseAmount<0))return '기본 예약 금액을 확인해 주세요.';if(b.amount!==(b.baseAmount===null?null:b.baseAmount+extra))return '기본 금액과 추가 구매 합계를 다시 확인해 주세요.';}if(b.amount!==null&&(!Number.isSafeInteger(b.amount)||b.amount<0||b.amount>100000000))return '최종 금액은 0원부터 1억 원까지 입력해 주세요.';return '';}catch(e){return e.message;}
}
function lines(rows){return validate(rows).map(row=>{const item=catalog.find(x=>x.id===row.id);return `${item.label}${row.description?' ('+row.description+')':''} · ${row.quantity}${item.unit}${row.id==='fireworks'?' (다발당 10개)':''} · ${money(row.unitAmount*row.quantity)}`;});}
function toggle(b,id,checked){
 const item=catalog.find(x=>x.id===id);if(!item)return;
 b.baseAmount=base(b);b.addOns=(b.addOns||[]).filter(x=>x.id!==id&&(!checked||!['bouquet','bouquet_custom'].includes(id)||!['bouquet','bouquet_custom'].includes(x.id)));
 if(checked)b.addOns.push({id,quantity:1,unitAmount:item.price??item.defaultPrice??null});
 recalculate(b);
}
function edit(b,id,key,value){if(!['quantity','unitAmount','description'].includes(key))return;const row=b.addOns?.find(x=>x.id===id);if(!row)return;row[key]=key==='description'?value:value===''?null:Number(value);recalculate(b);}
function html(b,prefix,disabled=false){
 const rows=b.addOns||[];let sum;try{sum=total(rows);}catch{sum=null;}
 return `<section class="booking-addons" aria-label="추가 구매 옵션"><div class="booking-addons-heading"><h4>추가 구매 옵션</h4><span class="micro">BOATN OPS와 동일한 항목</span></div><p class="micro">기본 상품에 포함된 구성 외에 추가로 구매하는 수량만 선택해 주세요. 판매가를 변경할 수 있는 항목은 협의한 금액을 입력하세요.</p><div class="booking-addon-grid">${catalog.map(item=>{const row=rows.find(x=>x.id===item.id),name=prefix+'_'+item.id;return `<div class="booking-addon ${row?'is-selected':''}"><label class="booking-addon-choice" for="${name}"><input type="checkbox" id="${name}" data-addon-toggle="${item.id}" ${row?'checked':''} ${disabled?'disabled':''}/><span><strong>${esc(item.label)}</strong><small>${item.price!==null?money(item.price):item.defaultPrice?money(item.defaultPrice)+' · 변경 가능':'판매가 직접 입력'}${item.id==='fireworks'?' · 10개':''}</small></span></label>${row?`<div class="booking-addon-fields"><label>수량 (${item.unit})<input class="admin-input" aria-label="${esc(item.label)} 수량" data-addon-id="${item.id}" data-addon-field="quantity" type="number" inputmode="numeric" min="1" max="100" step="1" value="${row.quantity??''}" ${disabled?'disabled':''}/></label>${item.price===null?`<label>1${item.unit} 판매가 (원)<input class="admin-input" aria-label="${esc(item.label)} 판매가" data-addon-id="${item.id}" data-addon-field="unitAmount" type="number" inputmode="numeric" min="0" max="10000000" step="1" value="${row.unitAmount??''}" ${disabled?'disabled':''}/></label><label class="booking-addon-description">품목 설명 (선택)<input class="admin-input" aria-label="${esc(item.label)} 품목 설명" data-addon-id="${item.id}" data-addon-field="description" maxlength="50" value="${esc(row.description||'')}" ${disabled?'disabled':''}/></label>`:''}</div>`:''}</div>`;}).join('')}</div><div class="booking-price-breakdown" aria-live="polite"><span>기본 예약 금액 <strong data-addon-base>${money(base(b))}</strong></span><span>추가 구매 <strong data-addon-total>${money(sum)}</strong></span><span>최종 합계 <strong data-booking-total>${money(b.amount)}</strong></span></div></section>`;
}
globalThis.MomentLinkAddOns=Object.freeze({catalog,setPrices,validate,total,base,recalculate,problem,lines,toggle,edit,html,money});
})();
