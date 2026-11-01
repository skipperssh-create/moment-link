/* Private composer: memory + authenticated API only; sending stays in the phone's SMS app. */
(() => {
'use strict';
const M=globalThis.MomentLinkMessages;
const P=globalThis.MomentLinkPricing;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let item=null,booking={},drafts={},stage='receipt',prepared=false,pending=false,changed=false,notice='',api,updated;
const root=()=>document.getElementById('messageComposer');
const value=id=>document.getElementById(id)?.value||'';
function reset(){item=null;booking={};drafts={};prepared=false;pending=false;changed=false;notice='';}
function regenerate(){drafts=Object.fromEntries(Object.keys(M.stages).map(s=>[s,M.generate(item,s,booking)]));}
function init(r,request,onUpdate,settings={}){
 api=request;updated=onUpdate;
 if(item?.id!==r.id){reset();item=r;booking=M.defaults(r,settings);stage='receipt';regenerate();if(['date','time','amount','place'].every(k=>r.communication?.booking?.[k]===booking[k]))drafts={...drafts,...r.communication?.drafts};}
 else item=r;
}
function openStage(next='receipt'){if(M.stages[next])stage=next;prepared=false;notice='';render();root()?.scrollIntoView({behavior:'smooth',block:'start'});}
function reservationControls(){
 if(item.status==='cancelled'||item.status==='closed'&&item.communication?.reservation)return '';
 if(item.status==='confirmed'&&!item.communication?.reservation)return '<p class="micro">OPS에서 확정된 예약입니다. 일정 변경은 OPS에서 확인해 주세요.</p>';
 return `<div class="reservation-confirm"><p>${item.status==='confirmed'?'예약 확정됨 · 정보 변경 시 다시 확정해 주세요.':'일정·금액·장소와 입금을 확인한 후 예약을 확정해 주세요.'}</p><button class="primary" type="button" data-message="reserve" ${pending?'disabled':''}>${item.status==='confirmed'?'예약 정보 수정·확정':'예약 확정'}</button><p class="micro">확정하면 ‘확정 예약’ 목록에서 관리합니다. 문자 발송은 아래에서 별도로 진행합니다.</p></div>`;
}
const field=(key,label,type='text')=>`<div><label class="admin-label" for="msg_${key}">${label}</label>${key==='place'?`<textarea class="admin-input message-place" data-message-field="place" id="msg_place" rows="3" maxlength="500" ${pending?'disabled':''}>${esc(booking.place)}</textarea>`:`<input class="admin-input" data-message-field="${key}" id="msg_${key}" type="${type}" value="${esc(booking[key])}" ${pending?'disabled':''} ${type==='number'?'min="0" max="100000000" step="1"':''}/>`}</div>`;
function pricingHint(){
 const quote=P.quote(item,booking.date),options=item.snapshot?.price?.optionAmount??(item.snapshot?.options||[]).reduce((sum,o)=>sum+(o.amount||0),0);
 return `<p class="micro" role="status">${esc(booking.amountMode==='auto'?'자동 반영 · '+quote.label:'직접 입력 · 저장된 금액 유지')}${options?' · 선택 옵션 '+options.toLocaleString('ko-KR')+'원 합산':''}</p>${item.category==='yacht'?`<p class="micro">${esc(P.policy)}</p>`:''}<button class="secondary" type="button" data-message="autoAmount" ${pending?'disabled':''}>날짜 요금 적용</button>`;
}
function refreshPrice(){
 document.getElementById('msg_amount').value=booking.amount??'';
 document.getElementById('messagePricing').innerHTML=pricingHint();
}
function html(){
 if(!item)return '';
 const error=M.validate(stage,booking,item),events=item.communication?.events||[];
 const href=prepared&&!error?M.smsURI(item.phone,drafts[stage],navigator.userAgent,navigator.platform,navigator.maxTouchPoints):'';
 return `<section class="message-composer" id="messageComposer" aria-labelledby="messageHeading"><h3 id="messageHeading">고객 문자 안내</h3><p class="micro">${esc(item.phone)} · 단계를 선택하고 안내 내용을 확인해 주세요.</p><div class="message-stages" role="group" aria-label="문자 안내 단계">${Object.entries(M.stages).map(([id,n],i)=>`<button type="button" class="secondary" data-message="stage" data-stage="${id}" aria-pressed="${id===stage}" ${pending?'disabled':''}>${i+1}. ${n}</button>`).join('')}</div><details class="message-booking" ${error?'open':''}><summary>안내 일정·금액·장소 설정</summary><p class="micro">신청한 희망 일정을 불러옵니다. 고객과 협의한 내용을 확인해 주세요. 항목을 변경하면 네 단계 문구가 새로 만들어집니다.</p><div class="admin-cols">${field('date','행사 날짜','date')}${field('time','협의한 시간','time')}${field('amount','최종 금액 (원)','number')}${field('place','안내할 장소·주소')}</div><div id="messagePricing">${pricingHint()}</div>${field('extra','추가 안내 (선택)')}</details><div class="message-checks"><label class="inline-check"><input type="checkbox" data-message-field="scheduleConfirmed" id="msg_scheduleConfirmed" ${pending?'disabled':''} ${booking.scheduleConfirmed?'checked':''}/> 일정·장소를 고객과 확정했습니다</label><label class="inline-check"><input type="checkbox" data-message-field="paymentConfirmed" id="msg_paymentConfirmed" ${pending?'disabled':''} ${booking.paymentConfirmed?'checked':''}/> 담당자가 입금을 확인했습니다</label></div>${reservationControls()}<label class="admin-label" for="messageBody">${M.stages[stage]} · 보낼 내용</label><textarea class="admin-input message-body" id="messageBody" rows="14" maxlength="5000" ${pending?'disabled':''}>${esc(drafts[stage]||'')}</textarea><p class="micro" id="messageLength">${(drafts[stage]||'').length.toLocaleString('ko-KR')}자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.</p><div class="btnrow"><button class="secondary" data-message="regenerate" ${pending?'disabled':''}>기본 문구로 다시 만들기</button><button class="primary" data-message="save" ${pending?'disabled':''}>${pending?'저장 중…':'저장하고 문자 준비'}</button></div><div class="message-send" id="messageSend">${href?`<div class="btnrow"><a class="primary" data-message="sms" href="${esc(href)}">${esc(item.phone)} · 문자 앱 열기</a><button class="secondary" data-message="copy">문구 복사</button></div><div class="btnrow"><button class="secondary" data-message="sent">휴대폰에서 발송 완료했어요</button></div>`:'<p class="micro">내용 확인 후 ‘저장하고 문자 준비’를 눌러 주세요.</p>'}</div><p class="micro">휴대폰 문자 앱에 번호와 내용이 채워집니다. 마지막 전송 버튼은 직접 눌러 주세요. 기기에서 본문이 채워지지 않으면 문구 복사를 이용해 주세요. PC에서도 복사할 수 있습니다.</p><p class="message-notice" id="messageNotice" role="status">${esc(notice)}</p>${events.length?`<details><summary>문자 안내 기록 (${events.length})</summary><ul class="message-history">${events.slice().reverse().map(x=>`<li>${esc(M.stages[x.stage])} · ${x.kind==='manual_sent'?'담당자 발송 확인':'문자 앱 열기 요청'}<span class="micro">${esc(new Date(x.at).toLocaleString('ko-KR'))} · ${esc(x.actor)}</span></li>`).join('')}</ul><p class="micro">문자 앱 열기 요청은 발송 완료가 아닙니다. 발송 확인은 담당자가 기록한 상태이며 수신 확인과 다릅니다.</p></details>`:''}</section>`;
}
function render(){const el=root();if(el)el.outerHTML=html();}
function feedback(message){notice=message;const el=document.getElementById('messageNotice');if(el)el.textContent=message;}
function invalidate(){prepared=false;changed=true;const el=document.getElementById('messageSend');if(el)el.innerHTML='<p class="micro">변경 내용을 저장한 뒤 문자 앱을 열어 주세요.</p>';}
function length(){const el=document.getElementById('messageLength');if(el)el.textContent=(drafts[stage]||'').length.toLocaleString('ko-KR')+'자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.';}
document.addEventListener('input',ev=>{
 if(!root()?.contains(ev.target)||pending)return;
 if(ev.target.id==='messageBody'){drafts[stage]=ev.target.value;invalidate();length();return;}
 const key=ev.target.dataset.messageField;if(!key)return;
 booking[key]=ev.target.type==='checkbox'?ev.target.checked:key==='amount'?(ev.target.value===''?null:Number(ev.target.value)):ev.target.value;
 if(key==='amount')booking.amountMode='manual';
 if(key==='date'&&booking.amountMode==='auto'){
  const amount=P.quote(item,booking.date).amount;
  if(booking.amount!==amount){booking.paymentConfirmed=false;document.getElementById('msg_paymentConfirmed').checked=false;}
  booking.amount=amount;
 }
 if(key==='date')refreshPrice();
 if(key==='amount')document.getElementById('messagePricing').innerHTML=pricingHint();
 if(['date','time','place'].includes(key)){booking.scheduleConfirmed=false;document.getElementById('msg_scheduleConfirmed').checked=false;}
 if(key==='amount'){booking.paymentConfirmed=false;document.getElementById('msg_paymentConfirmed').checked=false;}
 if(!['scheduleConfirmed','paymentConfirmed'].includes(key)){regenerate();document.getElementById('messageBody').value=drafts[stage];length();}
 invalidate();
});
async function log(kind){
 const target=item.id;
 const out=await api('admin/consultations/'+target+'/communications','POST',{version:item.version,stage,kind,eventId:crypto.randomUUID()});
 if(item?.id===target){item=out.item;updated(out.item);}
}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-message]');if(!b||!root()?.contains(b))return;
 const action=b.dataset.message;
 if(pending){ev.preventDefault();return;}
 if(action==='sms'){
  if(!prepared||changed){ev.preventDefault();feedback('먼저 변경 내용을 저장해 주세요.');return;}
  // Keep the href navigation synchronous to preserve mobile external-app user activation.
  pending=true;
  try{await log('composer_requested');feedback('문자 앱 열기를 요청했습니다. 발송 후 완료 버튼으로 기록해 주세요.');}
  catch(err){prepared=false;feedback('열기 기록 저장 실패: '+err.message);}
  finally{pending=false;render();}
  return;
 }
 ev.preventDefault();
 if(action==='stage'){stage=b.dataset.stage;prepared=false;notice='';render();return;}
 if(action==='autoAmount'){booking.amountMode='auto';booking.amount=P.quote(item,booking.date).amount;booking.paymentConfirmed=false;regenerate();invalidate();notice='선택 날짜와 추가 옵션 금액을 반영했습니다. 내용을 확인해 주세요.';render();return;}
 if(action==='regenerate'){drafts[stage]=M.generate(item,stage,booking);invalidate();notice='현재 일정·금액으로 기본 문구를 다시 만들었습니다.';render();return;}
 if(action==='copy'){try{await navigator.clipboard.writeText(drafts[stage]);feedback('문구를 복사했습니다.');}catch{document.getElementById('messageBody').select();feedback('문구를 선택했습니다. 복사 메뉴를 사용해 주세요.');}return;}
 pending=true;render();
 try{
  if(action==='save'||action==='reserve'){
   if(action==='reserve')stage='confirmed';
   const problem=M.validate(stage,booking,item);if(problem)throw Error(problem);
   if(!drafts[stage]?.trim())throw Error('보낼 내용을 입력해 주세요.');
   const target=item.id,out=await api('admin/consultations/'+target+(action==='reserve'?'/reservation':'/communications'),action==='reserve'?'POST':'PUT',{version:item.version,booking,drafts,...(action==='reserve'?{approved:true}:{})});
   if(item?.id!==target)return;
   item=out.item;updated(out.item);prepared=true;changed=false;notice='저장했습니다. 아래 번호를 누르면 문자 앱으로 연결됩니다.';
   if(action==='reserve'){notice='예약을 확정했습니다. 예약 확정 문자를 보낼 수 있습니다.';document.dispatchEvent(new CustomEvent('ml:reservation-confirmed',{detail:{id:target}}));}
  }
  if(action==='sent'){
   if(!prepared||changed)throw Error('변경 내용을 먼저 저장해 주세요.');
   if(!confirm('휴대폰 문자 앱에서 실제 전송을 완료했나요? 완료한 경우에만 기록해 주세요.'))return;
   await log('manual_sent');notice='담당자의 발송 확인을 기록했습니다.';
  }
 }catch(err){prepared=false;notice=err.message;}
 finally{pending=false;render();}
});
window.MomentLinkComposer={init,html,clear:reset,isDirty:()=>changed,isBusy:()=>pending,openStage,focus(){root()?.scrollIntoView({behavior:'smooth',block:'start'});}};
})();
