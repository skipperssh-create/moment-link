/* Private composer: memory + authenticated API only; sending stays in the phone's SMS app. */
(() => {
'use strict';
const M=globalThis.MomentLinkMessages;
const P=globalThis.MomentLinkPricing;
const O=globalThis.MomentLinkOps;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let item=null,booking={},drafts={},paymentDeadline='',stage='receipt',prepared=false,pending=false,changed=false,notice='',api,updated;
const root=()=>document.getElementById('messageComposer');
const value=id=>document.getElementById(id)?.value||'';
const actionIcons={save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2z M7 3v6h10V3 M7 21v-8h10v8',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 11h18 m-13 5 3 3 5-5',copy:'M9 9h12v12H9z M15 5V3H3v12h2',check:'m5 12 4 4L19 6',chat:'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2z M7 9h10 M7 13h6'};
const actionIcon=name=>`<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${actionIcons[name]}"/></svg>`;
const actionCaptions={reserve:'예약 확정',autoAmount:'요금 적용',regenerate:'문구 재생성',save:'문자 준비',copy:'문구 복사',sent:'발송 기록'};
const actionButton=(action,name,label,primary=false)=>`<button type="button" class="admin-icon-button ${primary?'icon-primary':''}" data-message="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${pending?'disabled':''}>${actionIcon(name)}<span class="admin-action-text">${esc(pending?'처리 중':action==='reserve'&&item?.status==='confirmed'?'수정·확정':actionCaptions[action]||label)}</span></button>`;
function reveal(){const panel=document.getElementById('detailMessages');if(panel)panel.open=true;}
function reset(){item=null;booking={};drafts={};paymentDeadline='';prepared=false;pending=false;changed=false;notice='';}
function regenerate(){drafts=Object.fromEntries(Object.keys(M.stages).map(s=>[s,M.generate(item,s,booking,paymentDeadline)]));}
function init(r,request,onUpdate,settings={}){
 api=request;updated=onUpdate;
 if(item?.id!==r.id){reset();item=r;booking=M.defaults(r,settings);paymentDeadline=r.communication?.paymentDeadline||M.paymentDeadlineFrom();stage='receipt';regenerate();if(['date','time','amount','place'].every(k=>r.communication?.booking?.[k]===booking[k]))drafts=M.prepareDrafts(r,{...drafts,...r.communication?.drafts},paymentDeadline);}
 else item=r;
 if(O.eligible(r)){booking.opsPax??=2;O.load(api).then(()=>{if(item?.id===r.id){const el=document.getElementById("messageOpsFields");if(el)el.innerHTML=O.fields(item,booking,"msg",pending);}}); }
}
function openStage(next='receipt',message=''){reveal();if(M.stages[next])stage=next;prepared=false;notice=message;render();root()?.scrollIntoView({behavior:'smooth',block:'start'});}
function confirmation(){
 const problem=M.validate('confirmed',booking,item)||O.validate(item,booking);if(problem)throw Error(problem);
 if(!drafts.confirmed?.trim())throw Error('예약 확정 안내 내용을 입력해 주세요.');
 return {booking:{...booking},drafts:{...drafts},approved:true};
}
function acceptConfirmation(r){
 item=r;booking={...r.communication.booking};drafts={...r.communication.drafts};paymentDeadline=r.communication.paymentDeadline||paymentDeadline;
 stage='confirmed';prepared=true;changed=false;notice='예약을 확정했습니다. 문자 앱 열기 버튼으로 예약 확정 문자를 준비할 수 있습니다.';render();
}
function reservationControls(){
 if(item.integration&&item.integration.state!=='succeeded')return `<p class="micro" role="status">${item.integration.operation==='reschedule'?'OPS 일정 변경 결과를 확인 중입니다. 반영 완료 전까지 기존 확정 일정이 유지됩니다.':'BOATN OPS 등록이 완료된 후 수정·확정할 수 있습니다.'} 아래 OPS 상태를 확인해 주세요.</p>`;
 if(item.status==='cancelled'||item.status==='closed'&&item.communication?.reservation)return '';
 if(item.status==='confirmed'&&!item.communication?.reservation)return '<p class="micro">OPS에서 확정된 예약입니다. 일정 변경은 OPS에서 확인해 주세요.</p>';
 return `<div class="reservation-confirm"><p>${item.status==='confirmed'?'변경한 일정과 입금을 확인한 뒤 ‘수정·확정’을 눌러 주세요.':'일정·금액·장소와 입금을 확인한 후 예약을 확정해 주세요.'}</p>${actionButton('reserve','calendar',item.status==='confirmed'?'수정·확정':'예약 확정',true)}<p class="micro">${item.integration?'날짜·시간은 연결된 OPS 예약에도 자동 반영합니다. 금액·장소·인원·결제수단은 유지하며, 취소는 OPS에서 처리해 주세요.':'확정하면 ‘확정 예약’ 목록에서 관리합니다.'} 문자 발송은 아래에서 별도로 진행합니다.</p></div>`;
}
const field=(key,label,type='text')=>{const locked=pending||!!item.integration&&['amount','place'].includes(key);return `<div><label class="admin-label" for="msg_${key}">${label}</label>${key==='place'?`<textarea class="admin-input message-place" data-message-field="place" id="msg_place" rows="3" maxlength="500" ${locked?'disabled':''}>${esc(booking.place)}</textarea>`:`<input class="admin-input" data-message-field="${key}" id="msg_${key}" type="${type}" value="${esc(booking[key])}" ${locked?'disabled':''} ${type==='number'?'min="0" max="100000000" step="1"':''}/>`}</div>`;};
function pricingHint(){
 if(item.integration)return '<p class="micro">OPS에 등록된 기존 금액을 유지합니다. 날짜·시간 변경으로 금액을 다시 계산하지 않습니다.</p>';
 const quote=P.quote(item,booking.date),options=item.snapshot?.price?.optionAmount??(item.snapshot?.options||[]).reduce((sum,o)=>sum+(o.amount||0),0);
 return `<p class="micro" role="status">${esc(booking.amountMode==='auto'?'자동 반영 · '+quote.label:'직접 입력 · 저장된 금액 유지')}${options?' · 선택 옵션 '+options.toLocaleString('ko-KR')+'원 합산':''}</p>${item.category==='yacht'?`<p class="micro">${esc(P.policy)}</p>`:''}${actionButton('autoAmount','refresh','날짜 요금 적용')}`;
}
function refreshPrice(){
 document.getElementById('msg_amount').value=booking.amount??'';
 document.getElementById('messagePricing').innerHTML=pricingHint();
}
function html(){
 if(!item)return '';
 const error=M.validate(stage,booking,item),events=item.communication?.events||[];
 const href=prepared&&!error?M.smsURI(item.phone,drafts[stage],navigator.userAgent,navigator.platform,navigator.maxTouchPoints):'';
 return `<section class="message-composer" id="messageComposer" aria-labelledby="messageHeading"><h3 class="visually-hidden" id="messageHeading">고객 문자 안내</h3><p class="micro">${esc(item.phone)} · 단계를 선택하고 안내 내용을 확인해 주세요.</p><div class="message-stages" role="group" aria-label="문자 안내 단계">${Object.entries(M.stages).map(([id,n],i)=>`<button type="button" class="secondary" data-message="stage" data-stage="${id}" aria-pressed="${id===stage}" ${pending?'disabled':''}>${i+1}. ${n}</button>`).join('')}</div>${error&&notice?`<p class="message-notice" role="alert">${esc(notice)}</p>`:''}<details class="message-booking" ${error?'open':''}><summary>안내 일정·금액·장소 설정</summary><p class="micro">신청한 희망 일정을 불러옵니다. 고객과 협의한 내용을 확인해 주세요. 항목을 변경하면 네 단계 문구가 새로 만들어집니다.</p><div class="admin-cols">${field('date','이벤트 날짜','date')}${field('time','협의한 시간','time')}${field('amount','최종 금액 (원)','number')}${field('place','안내할 장소·주소')}</div><div id="messagePricing">${pricingHint()}</div>${field('extra','추가 안내 (선택)')}</details><div id="messageOpsFields">${O.fields(item,booking,'msg',pending)}</div><div class="message-checks"><label class="inline-check"><input type="checkbox" data-message-field="scheduleConfirmed" id="msg_scheduleConfirmed" ${pending?'disabled':''} ${booking.scheduleConfirmed?'checked':''}/> 일정·장소를 고객과 확정했습니다</label><label class="inline-check"><input type="checkbox" data-message-field="paymentConfirmed" id="msg_paymentConfirmed" ${pending?'disabled':''} ${booking.paymentConfirmed?'checked':''}/> 담당자가 입금을 확인했습니다</label></div>${reservationControls()}<label class="admin-label" for="messageBody">${M.stages[stage]} · 보낼 내용</label><textarea class="admin-input message-body" id="messageBody" rows="14" maxlength="5000" ${pending?'disabled':''}>${esc(drafts[stage]||'')}</textarea>${stage==='receipt'&&item.category==='yacht'?'<p class="micro">입금 기한은 ‘저장하고 문자 준비’를 누른 시각부터 2시간 뒤로 계산됩니다. 날짜·시간은 한국 시간 기준입니다.</p>':''}<p class="micro" id="messageLength">${(drafts[stage]||'').length.toLocaleString('ko-KR')}자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.</p><div class="message-actions">${actionButton('regenerate','refresh','기본 문구로 다시 만들기')}${actionButton('save',pending?'refresh':'save',pending?'저장 중…':'저장하고 문자 준비',true)}</div><div class="message-send" id="messageSend">${href?`<p class="micro">${esc(item.phone)} · 저장된 안내 문자</p><div class="message-actions"><a class="admin-icon-button icon-primary" data-message="sms" href="${esc(href)}" aria-label="문자 앱 열기" title="문자 앱 열기">${actionIcon('chat')}<span class="admin-action-text">문자 열기</span></a>${actionButton('copy','copy','문구 복사')}${actionButton('sent','check','휴대폰 발송 완료 기록')}</div>`:'<p class="micro">내용 확인 후 ‘저장하고 문자 준비’를 눌러 주세요.</p>'}</div><p class="micro">휴대폰 문자 앱에 번호와 내용이 채워집니다. 마지막 전송 버튼은 직접 눌러 주세요. 기기에서 본문이 채워지지 않으면 문구 복사를 이용해 주세요. PC에서도 복사할 수 있습니다.</p><p class="message-notice" id="messageNotice" role="status">${esc(notice)}</p>${events.length?`<details><summary>문자 안내 기록 (${events.length})</summary><ul class="message-history">${events.slice().reverse().map(x=>`<li>${esc(M.stages[x.stage])} · ${x.kind==='manual_sent'?'담당자 발송 확인':'문자 앱 열기 요청'}<span class="micro">${esc(new Date(x.at).toLocaleString('ko-KR'))} · ${esc(x.actor)}</span></li>`).join('')}</ul><p class="micro">문자 앱 열기 요청은 발송 완료가 아닙니다. 발송 확인은 담당자가 기록한 상태이며 수신 확인과 다릅니다.</p></details>`:''}</section>`;
}
function render(){const el=root();if(el)el.outerHTML=html();}
function feedback(message){notice=message;const el=document.getElementById('messageNotice');if(el)el.textContent=message;}
function invalidate(){prepared=false;changed=true;const el=document.getElementById('messageSend');if(el)el.innerHTML='<p class="micro">변경 내용을 저장한 뒤 문자 앱을 열어 주세요.</p>';}
function length(){const el=document.getElementById('messageLength');if(el)el.textContent=(drafts[stage]||'').length.toLocaleString('ko-KR')+'자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.';}
document.addEventListener('input',ev=>{
 if(!root()?.contains(ev.target)||pending)return;
 if(ev.target.id==='messageBody'){drafts[stage]=ev.target.value;invalidate();length();return;}
 const key=ev.target.dataset.messageField;if(!key)return;
 booking[key]=ev.target.type==='checkbox'?ev.target.checked:['amount','opsPax'].includes(key)?(ev.target.value===''?null:Number(ev.target.value)):ev.target.value;
 if(key==='amount')booking.amountMode='manual';
 if(key==='date'&&item.integration)booking.amountMode='manual';
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
  const deadlineProblem=M.paymentDeadlineError(item,stage,paymentDeadline);
  if(deadlineProblem){ev.preventDefault();prepared=false;feedback(deadlineProblem);render();return;}
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
 if(action==='regenerate'){drafts[stage]=M.generate(item,stage,booking,paymentDeadline);invalidate();notice='현재 일정·금액으로 기본 문구를 다시 만들었습니다.';render();return;}
 if(action==='copy'){
  const problem=!prepared||changed?'먼저 변경 내용을 저장해 주세요.':M.paymentDeadlineError(item,stage,paymentDeadline);
  if(problem){prepared=false;feedback(problem);render();return;}
  try{await navigator.clipboard.writeText(drafts[stage]);feedback('문구를 복사했습니다.');}catch{document.getElementById('messageBody').select();feedback('문구를 선택했습니다. 복사 메뉴를 사용해 주세요.');}return;
 }
 pending=true;render();
 try{
  if(action==='save'||action==='reserve'){
   if(action==='reserve')stage='confirmed';
   const problem=M.validate(stage,booking,item)||(action==='reserve'?O.validate(item,booking):'');if(problem)throw Error(problem);
   if(!drafts[stage]?.trim())throw Error('보낼 내용을 입력해 주세요.');
   const target=item.id,out=await api('admin/consultations/'+target+(action==='reserve'?'/reservation':'/communications'),action==='reserve'?'POST':'PUT',{version:item.version,booking,drafts,...(action==='reserve'?{approved:true}:{prepareStage:stage})});
   if(item?.id!==target)return;
   item=out.item;booking={...item.communication.booking};drafts={...item.communication.drafts};paymentDeadline=item.communication.paymentDeadline||paymentDeadline;updated(out.item);prepared=!(item.integration?.operation==='reschedule'&&item.integration.state!=='succeeded');changed=false;notice='저장했습니다. 문자 앱 열기 버튼을 누르면 문자 앱으로 연결됩니다.';
   if(action==='save'&&stage==='receipt'&&item.category==='yacht')notice='입금 기한을 '+M.paymentDeadlineLabel(paymentDeadline)+'으로 반영했습니다. 문구를 확인한 뒤 문자 앱 열기 버튼을 눌러 주세요.';
   if(action==='reserve'){notice=item.integration?.operation==='reschedule'?(item.integration.state==='succeeded'?'수정·확정했습니다. 변경한 일정이 OPS에도 반영되었습니다.':'OPS 일정 변경이 아직 완료되지 않았습니다. 기존 확정 일정은 유지되며 아래 OPS 상태에서 결과를 확인할 수 있습니다.'):'예약을 확정했습니다. 예약 확정 문자를 보낼 수 있습니다.';document.dispatchEvent(new CustomEvent('ml:reservation-confirmed',{detail:{id:target,message:notice}}));}
  }
  if(action==='sent'){
   if(!prepared||changed)throw Error('변경 내용을 먼저 저장해 주세요.');
   if(!confirm('휴대폰 문자 앱에서 실제 전송을 완료했나요? 완료한 경우에만 기록해 주세요.'))return;
   await log('manual_sent');notice='담당자의 발송 확인을 기록했습니다.';
  }
 }catch(err){prepared=false;notice=err.message;}
 finally{pending=false;render();}
});
window.MomentLinkComposer={init,html,clear:reset,isDirty:()=>changed,isBusy:()=>pending,openStage,confirmation,acceptConfirmation,focus(){reveal();root()?.scrollIntoView({behavior:'smooth',block:'start'});}};
})();
