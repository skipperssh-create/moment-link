(() => {
'use strict';
const R=globalThis.MomentLinkAdjustment,A=globalThis.MomentLinkAddOns;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let item,api,update,isEditing,draft=null,busy=false,resultText='';
const allowed=r=>r?.status==='confirmed'&&!!r.communication?.reservation;
function preview(){try{const v=R.calculate(item,draft);return `<span>변경 총액<strong>${A.money(v.booking.amount)}</strong></span><span>환불 후 입금액<strong>${A.money(v.booking.receivedAmount)}</strong></span><span>잔금<strong>${A.money(v.balance)}</strong></span>`;}catch(e){return `<p class="micro">${esc(e.message)}</p>`;}}
function html(r){
 item=r;if(!allowed(r))return '';
 const history=(r.communication.adjustments||[]).slice().reverse();
 const unresolved=r.integration&&r.integration.state!=='succeeded'||r.seollem&&r.seollem.state!=='synced'||r.calendar&&r.calendar.state!=='synced';
 return `<section class="adjustment-panel" aria-label="옵션 취소·환불"><div class="adjustment-heading"><div><h4>옵션 취소·환불</h4><p class="micro">확정은 유지하고 총액·입금액을 정리합니다.</p></div>${!draft?`<button type="button" class="admin-icon-button" data-adjustment-open ${unresolved?'disabled':''}><svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6M8 13h8"/></svg><span class="admin-action-text">취소·환불</span></button>`:''}</div>${unresolved?'<p class="micro">OPS·캘린더 연동 상태를 먼저 확인해 주세요. 기존 충돌은 변경하지 않습니다.</p>':''}${resultText?`<p role="status">${esc(resultText)}</p>`:''}${draft?`<form data-adjustment-form><fieldset ${busy||draft.payload?'disabled':''}><label>취소 품목<select class="admin-select" name="target">${R.choices(r).map(c=>`<option value="${esc(c.id)}" ${c.id===draft.target?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label><div class="adjustment-fields"><label>총액 차감 (원)<input class="admin-input" name="reduction" type="number" inputmode="numeric" min="1" max="${r.communication.booking.amount-1}" step="1" required value="${draft.reduction??''}"></label><label>실제 환불한 금액 (원)<input class="admin-input" name="refund" type="number" inputmode="numeric" min="0" step="1" required value="${draft.refund??''}"></label></div><label>변경 사유<input class="admin-input" name="reason" maxlength="200" required placeholder="예: 고객이 꽃다발을 직접 준비" value="${esc(draft.reason)}"></label><div class="adjustment-summary" data-adjustment-preview aria-live="polite">${preview()}</div><label class="inline-check"><input name="confirmed" type="checkbox" ${draft.confirmed?'checked':''} required><span>변경 금액을 확인했고, 환불액이 있다면 실제 환불을 완료했습니다.</span></label><p class="micro">환불액이 없으면 0원을 입력하세요. 저장은 환불 기록이며 자동 송금하지 않습니다.</p></fieldset><p class="form-error" data-adjustment-error role="alert">${esc(draft.error||'')}</p><div class="btnrow"><button class="primary" type="submit" ${busy||draft.attempts>=2?'disabled':''}>${busy?'저장 중':draft.payload?'저장 결과 확인':'변경·환불 저장'}</button><button class="secondary" type="button" data-adjustment-close ${busy?'disabled':''}>닫기</button></div></form>`:''}${history.length?`<details class="adjustment-history"><summary>변경·환불 이력 ${history.length}건</summary>${history.map(h=>`<p>${esc(h.label)} · ${esc(h.reason)}<br>차감 ${A.money(h.reduction)} · 환불 ${A.money(h.refund)}<br><span class="micro">${esc(new Date(h.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))} · ${esc(h.actor)}</span></p>`).join('')}</details>`:''}</section>`;
}
function paint(){const el=document.querySelector('.adjustment-panel');if(el)el.outerHTML=html(item);}
function error(message){
 if(draft)draft.error=message;paint();
 document.getElementById('adjustmentError')?.remove();const d=document.createElement('dialog');d.id='adjustmentError';d.className='message-error-dialog';d.setAttribute('role','alertdialog');d.setAttribute('aria-labelledby','adjustmentErrorTitle');
 d.innerHTML=`<h2 id="adjustmentErrorTitle">변경·환불 저장 확인</h2><p>${esc(message)}</p><button class="primary" type="button">확인</button>`;d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
}
document.addEventListener('click',ev=>{
 if(ev.target.closest('[data-adjustment-open]')){
  if(isEditing?.()){error('먼저 다른 예약 변경을 저장하거나 상담을 다시 열어 주세요.');return;}
  const choice=R.choices(item)[0],reduction=choice.amount??0,paid=item.communication.booking.receivedAmount;
  draft={version:item.version,requestId:crypto.randomUUID(),target:choice.id,reduction,refund:Number.isSafeInteger(paid)?Math.max(0,paid-(item.communication.booking.amount-reduction)):0,reason:'',confirmed:false,attempts:0};resultText='';paint();document.querySelector('[data-adjustment-form] [name=reason]')?.focus();
 }
 if(ev.target.closest('[data-adjustment-close]')&&!busy){draft=null;paint();}
});
document.addEventListener('input',ev=>{
 if(!ev.target.closest('[data-adjustment-form]')||!draft||busy||draft.payload)return;
 const {name,value,checked}=ev.target;draft[name]=name==='confirmed'?checked:['reduction','refund'].includes(name)?value===''?null:Number(value):value;draft.confirmed=name==='confirmed'?checked:false;
 if(name==='target'){const c=R.choices(item).find(c=>c.id===value);draft.reduction=c.amount??null;draft.refund=Number.isInteger(draft.reduction)?Math.max(0,item.communication.booking.receivedAmount-(item.communication.booking.amount-draft.reduction)):0;paint();return;}
 document.querySelector('[data-adjustment-preview]').innerHTML=preview();if(name!=='confirmed')document.querySelector('[data-adjustment-form] [name=confirmed]').checked=false;
});
document.addEventListener('submit',async ev=>{
 if(!ev.target.matches('[data-adjustment-form]'))return;ev.preventDefault();if(busy||!draft||draft.attempts>=2)return;
 try{R.calculate(item,draft);if(!draft.confirmed)throw Error('변경 금액과 실제 환불 완료 여부를 확인해 주세요.');}catch(e){error(e.message);return;}
 draft.payload??=Object.fromEntries(['version','requestId','target','reduction','refund','reason','confirmed'].map(k=>[k,draft[k]]));busy=true;draft.attempts++;paint();
 try{
  const out=await api('admin/consultations/'+item.id+'/adjustments','POST',draft.payload);item=out.item;
  if(!item.communication?.adjustments?.some(a=>a.requestId===draft.requestId)){throw Error('OPS 반영을 확인하지 못했습니다. 중복 환불하지 말고 아래 OPS 상태를 확인해 주세요.');}
  const pending=item.integration&&item.integration.state!=='succeeded'||item.seollem&&item.seollem.state!=='synced'||item.calendar&&item.calendar.state!=='synced';
  draft=null;resultText=pending?'환불 기록을 저장했습니다. OPS·캘린더 반영 상태를 확인해 주세요.':'옵션 취소·환불 기록을 저장했습니다.';busy=false;update(item);
 }catch(e){busy=false;if(e.status&&e.status<500){draft.payload=null;draft.attempts=0;}error(e.message+(draft.attempts>=2?' 동일 요청 확인은 2회까지만 진행합니다. 상담을 다시 열어 저장 결과를 확인해 주세요.':''));}finally{busy=false;}
});
globalThis.MomentLinkAdjustmentUI={html,connect:(request,changed,editing)=>{api=request;update=changed;isEditing=editing;},clear:()=>{draft=null;resultText='';},isDirty:()=>!!draft||busy,isBusy:()=>busy};
})();
