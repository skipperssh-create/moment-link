/* Shared deterministic parser. Never creates a customer or sends a message. */
(() => {
'use strict';
const cleanPhone=v=>String(v||'').replace(/\D/g,'');
function amounts(text){return [...String(text||'').matchAll(/(?:\d{1,3}(?:,\d{3})+|\d{4,10})\s*원/g)].map(m=>Number(m[0].replace(/\D/g,'')));}
function parse(raw){
 const text=String(raw||'').trim(),phones=[...new Set([...text.matchAll(/01[016789][ -]?\d{3,4}[ -]?\d{4}/g)].map(m=>cleanPhone(m[0])))];
 const paymentLines=text.split(/\r?\n/).filter(l=>/결제|구매금액/.test(l)&&!/수수료|제외|공제/.test(l));
 const values=[...new Set(paymentLines.flatMap(amounts))],review=text.split(/\r?\n/).filter(l=>/리뷰|폭죽/.test(l)).join('\n').slice(0,600);
 const shots=[...review.matchAll(/폭죽\s*(\d[\d,]*)\s*발/g)].map(m=>Number(m[1].replaceAll(',','')));
 const units=shots.length===1&&shots[0]>0&&shots[0]%30===0?shots[0]/30:0;
 return {phones,phone:phones.length===1?phones[0]:'',gross:values.length===1?values[0]:null,reviewText:review,fireworksUnits:units,amountAmbiguous:values.length!==1,quantityAmbiguous:/폭죽/.test(review)&&(!shots.length||shots.length>1||!units),person:(text.match(/계약\s*[:：]\s*([^\n(（]+)/)?.[1]||'').trim()};
}
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000000;
function calculate(gross){if(!money(gross))throw Error('네이버 고객 결제금액을 원 단위로 입력해 주세요.');const fee=Math.round(gross*65/1000);return {gross,fee,expectedNet:gross-fee};}
globalThis.MomentLinkContract={parse,calculate,cleanPhone,money};
})();
