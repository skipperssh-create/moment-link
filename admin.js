/* Authenticated administrator UI; no session tokens or customer data in browser storage. */
(() => {
'use strict';
const $=s=>document.querySelector(s),e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
const composer=window.MomentLinkComposer;
const sound=window.MomentLinkSound(paintSound);
const messageLabel=phone=>`<span class="customer-message-label">문자 안내</span><span class="customer-message-phone">${e(phone)}</span>`;
const statuses={new:'접수중',initial_unreachable:'최초연락안됨',consulting:'상담중',no_response:'답변없음',awaiting_payment:'입금대기',confirmed:'확정',hold:'보류',closed:'종결',cancelled:'취소'};
const iconPaths={
 person:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',personPlus:'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M2 21v-2a8 8 0 0 1 12-7 M19 13v8 M15 17h8',key:'M8 14a5 5 0 1 1 3-9 5 5 0 0 1 1 6l9 9-2 2-3-3-2 2-3-3 M6 7h.01',
 bellOff:'m3 3 18 18 M9 3.8A6 6 0 0 1 18 8v4 M6 6v2c0 7-3 7-3 9h14 M10 21h4',
 up:'m5 12 7-7 7 7 M12 5v14',down:'m5 12 7 7 7-7 M12 5v14',archive:'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',publish:'M12 16V3 m-5 5 5-5 5 5 M4 14v7h16v-7',
 plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',forward:'m12 5 7 7-7 7 M19 12H5',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 phone:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.57 2.79.7A2 2 0 0 1 22 16.92z',
 inbox:'M4 4h16v16H4z M4 14h5l2 3h2l2-3h5',
 chat:'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2z M7 9h10 M7 13h6',
 document:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2z M7 3v6h10V3 M7 21v-8h10v8',
 clock:'M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 check:'m5 12 4 4L19 6',pause:'M9 5v14 M15 5v14',close:'m6 6 12 12 M6 18 18 6',
 chevron:'m8 10 4 4 4-4',back:'m12 5-7 7 7 7 M5 12h14',
 refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',
 volume:'m11 4-6 4H2v8h3l6 4z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
 mute:'m11 4-6 4H2v8h3l6 4z m5 5 6 6 m-6 0 6-6',play:'m8 5 11 7-11 7z',
 calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 11h18 m-13 5 3 3 5-5'
};
const icon=name=>`<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${iconPaths[name]||iconPaths.inbox}"/></svg>`;
const iconLabel=(name,label)=>`<span class="admin-icon-label">${icon(name)}<span>${e(label)}</span></span>`;
const displayPhone=phone=>{const n=String(phone||'').replace(/\D/g,'');return /^01\d{9}$/.test(n)?n.replace(/(\d{3})(\d{4})(\d{4})/,'$1-$2-$3'):/^02\d{8}$/.test(n)?n.replace(/(\d{2})(\d{4})(\d{4})/,'$1-$2-$3'):/\d{10}/.test(n)&&n.length===10?n.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3'):String(phone||'');};
function listCardActions(r,reserved){const detailLabel=reserved?'예약 상세':'상담 상세';return `<div class="inbox-contact-actions" role="group" aria-label="${e(r.person)} 고객 작업"><button type="button" class="admin-icon-button" data-ml="detail" data-id="${e(r.id)}" aria-label="${e(r.person)} ${detailLabel}" title="${detailLabel}">${detailIconContent('document',detailLabel)}</button><a class="admin-icon-button" href="tel:${e(r.phone)}" aria-label="${e(r.person)} 고객에게 전화하기" title="전화하기">${detailIconContent('phone','전화')}</a><a class="admin-icon-button" href="sms:${e(r.phone)}" aria-label="${e(r.person)} 고객에게 문자하기" title="문자하기">${detailIconContent('chat','문자')}</a>${user.role==='admin'?`<button type="button" class="admin-icon-button icon-danger" data-ml="trashRequest" data-id="${e(r.id)}" aria-label="${e(r.person)} 상담 삭제" title="휴지통으로 이동">${detailIconContent('trash','삭제')}</button>`:''}</div>`;}
const statusIcon={new:'inbox',initial_unreachable:'phone',consulting:'chat',no_response:'clock',awaiting_payment:'clock',confirmed:'check',hold:'pause',closed:'check',cancelled:'close'};
const listStatusState={id:'',confirmationId:'',saving:false};
function listQuickStatus(r){
 const entries=requestStatusEntries(r),open=listStatusState.id===r.id;
 return `<div class="quick-status list-quick-status"><button type="button" class="quick-status-trigger" data-list-status-toggle="${e(r.id)}" aria-label="${e(r.person)} 상담 상태 변경: ${e(statusLabel(r))}" aria-haspopup="menu" aria-expanded="${open}" ${listStatusState.saving?'disabled':''}><span>${e(statusLabel(r))}</span>${icon('chevron')}</button><div class="quick-status-menu" role="menu" aria-label="상담 상태 변경" ${open?'':'hidden'}>${entries.map(([id,label])=>`<button type="button" role="menuitemradio" aria-checked="${id===r.status}" tabindex="-1" data-list-status-id="${e(r.id)}" data-list-status="${id}">${iconLabel(statusIcon[id],label)}${id===r.status?icon('check'):''}</button>`).join('')}<p class="micro">선택하면 바로 저장됩니다.</p></div></div>`;
}
function listStatusFeedback(state,text){const el=document.getElementById('listStatusFeedback');if(el){el.dataset.state=state;el.textContent=text;}}
function closeListStatus(focus=false){const previous=listStatusState.id;if(focus)document.querySelector(`[data-list-status-toggle="${previous}"]`)?.focus({preventScroll:true});listStatusState.id='';document.querySelectorAll('[data-list-status-toggle]').forEach(el=>el.setAttribute('aria-expanded','false'));document.querySelectorAll('.list-quick-status .quick-status-menu').forEach(el=>{el.hidden=true;});}
function listConfirmation(r){
 const b=MomentLinkMessages.defaults(r,settings);
 return `<form class="list-confirmation" data-list-confirmation="${e(r.id)}"><h3>예약 확정</h3><p class="micro">고객과 정한 일정·금액·장소와 입금을 확인해 주세요.</p><div class="list-confirmation-fields"><label>이벤트 날짜<input class="admin-input" name="date" type="date" value="${e(b.date)}" required></label><label>시간<input class="admin-input" name="time" type="time" value="${e(b.time)}" required></label><label>금액 (원)<input class="admin-input" name="amount" type="number" min="0" step="1" value="${e(b.amount??'')}" required></label><label>장소<input class="admin-input" name="place" maxlength="500" value="${e(b.place)}" required></label></div>${window.MomentLinkOps.fields(r,b,'listConfirm')}<label class="list-confirmation-check"><input name="scheduleConfirmed" type="checkbox" ${b.scheduleConfirmed?'checked':''} required> 일정·장소를 고객과 확정했습니다</label><label class="list-confirmation-check"><input name="paymentConfirmed" type="checkbox" ${b.paymentConfirmed?'checked':''} required> 입금을 확인했습니다</label><div class="btnrow"><button type="submit" class="primary">확정하고 저장</button><button type="button" class="secondary" data-list-confirmation-cancel>닫기</button></div></form>`;
}
function openListStatus(root,edge){
 const trigger=root.querySelector('[data-list-status-toggle]'),menu=root.querySelector('[role=menu]');
 closeListStatus();listStatusState.id=trigger.dataset.listStatusToggle;
 const rect=trigger.getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<280&&above>below;
 menu.style.left=rect.right<224?'0':'auto';menu.style.right=rect.right<224?'auto':'0';root.classList.toggle('opens-up',up);menu.style.maxHeight=Math.max(100,Math.min(390,up?above:below))+'px';
 menu.hidden=false;trigger.setAttribute('aria-expanded','true');
 const options=[...menu.querySelectorAll('[data-list-status]')];
 (edge==='last'?options.at(-1):edge==='first'?options[0]:options.find(x=>x.getAttribute('aria-checked')==='true')||options[0])?.focus({preventScroll:true});
}
async function saveListStatus(id,status,confirmation){
 if(listStatusState.saving||busy||composer.isBusy())return;
 const item=items.find(r=>r.id===id);if(!item||!requestStatusEntries(item).some(([key])=>key===status))return;
 closeListStatus(true);if(item.status===status)return;
 if(status==='cancelled'&&item.status==='confirmed'&&!approveCancellation(item))return;
 if(status==='confirmed'&&!confirmation){
  if(listStatusState.confirmationId&&listStatusState.confirmationId!==id&&!confirm('작성 중인 예약 확정 정보를 닫을까요?'))return;
  suspendLive();busy=true;
  try{if(window.MomentLinkOps.eligible(item))await window.MomentLinkOps.load(api);
   if(!user||!document.getElementById('inboxListing'))return;
   listStatusState.confirmationId=id;document.getElementById('inboxListing').innerHTML=inboxListing();
   document.querySelector('[data-list-confirmation] input')?.focus();listStatusFeedback('','');
  }finally{busy=false;scheduleLive();}return;
 }
 const root=document.getElementById('inboxListing'),path=listPath(),current=()=>!!user&&document.getElementById('inboxListing')===root&&path===listPath();
 suspendLive();listStatusState.saving=true;busy=true;paintLive();
 listStatusFeedback('saving','상태를 저장하고 있습니다…');
 document.querySelectorAll('[data-list-status-toggle],.list-confirmation button,.list-confirmation input,.list-confirmation select').forEach(el=>{el.disabled=true;});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),status==='cancelled'?60000:12000);
 try{
  const result=await api('admin/consultations/'+encodeURIComponent(id),'PATCH',{version:item.version,status,...(confirmation?{confirmation}:{})},controller.signal);
  if(!current())return;
  listStatusState.confirmationId='';const updated=result.item;
  counts[item.status]=Math.max(0,(counts[item.status]||0)-1);counts[updated.status]=(counts[updated.status]||0)+1;
  const filter=tab==='reservations'?reservationStatus:requestStatus;
  items=items.map(r=>r.id===id?{...r,...updated}:r).filter(r=>filter==='all'||r.status===filter);
  listStatusFeedback('success',item.person+' · '+(cancellationMessage(updated)||statusLabel(updated)+' 상태로 저장했습니다.'));
  try{const fresh=await api(path,'GET',undefined,controller.signal);if(current()){items=fresh.items;counts=fresh.counts;}}
  catch{if(current())listStatusFeedback('success',item.person+' · '+(cancellationMessage(updated)||statusLabel(updated)+' 상태로 저장했습니다.')+' 목록 갱신은 새로고침을 눌러 주세요.');}
  if(current()){root.innerHTML=inboxListing();(root.querySelector('[data-list-status-toggle="'+id+'"]')||document.getElementById('requestSearch'))?.focus({preventScroll:true});}
 }catch(err){
  if(!user){notice='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}
  else if(current())listStatusFeedback('error',!err.status?'저장 결과를 확인하지 못했습니다. 새로고침으로 상태를 확인해 주세요.':err.message);
 }finally{clearTimeout(timeout);listStatusState.saving=false;busy=false;if(current())document.querySelectorAll('[data-list-status-toggle],.list-confirmation button,.list-confirmation input,.list-confirmation select').forEach(el=>{el.disabled=false;});paintLive();scheduleLive();}
}
document.addEventListener('click',ev=>{
 if(!location.hash.startsWith('#admin')||busy||composer.isBusy())return;
 const root=ev.target.closest('.list-quick-status');
 if(!root)closeListStatus();
 else if(ev.target.closest('[data-list-status-toggle]')){if(root.querySelector('[data-list-status-toggle]').getAttribute('aria-expanded')==='true')closeListStatus(true);else openListStatus(root);}
 else{const option=ev.target.closest('[data-list-status]');if(option)void saveListStatus(option.dataset.listStatusId,option.dataset.listStatus);}
 if(ev.target.closest('[data-list-confirmation-cancel]')){const id=listStatusState.confirmationId;listStatusState.confirmationId='';document.getElementById('inboxListing').innerHTML=inboxListing();document.querySelector('[data-list-status-toggle="'+id+'"]')?.focus({preventScroll:true});}
});
document.addEventListener('focusout',ev=>{const root=ev.target.closest('.list-quick-status');if(root&&!root.contains(ev.relatedTarget))closeListStatus();});
document.addEventListener('keydown',ev=>{
 const root=ev.target.closest('.list-quick-status');if(!root||busy)return;
 const open=root.querySelector('[data-list-status-toggle]').getAttribute('aria-expanded')==='true';
 if(ev.key==='Escape'&&open){ev.preventDefault();closeListStatus(true);return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(ev.key))return;
 ev.preventDefault();if(!open){openListStatus(root,ev.key==='End'?'last':'first');return;}
 const options=[...root.querySelectorAll('[data-list-status]')],i=options.indexOf(document.activeElement);
 options[ev.key==='Home'?0:ev.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(ev.key==='ArrowDown'?1:-1)))]?.focus();
});
document.addEventListener('input',ev=>{const form=ev.target.closest('.list-confirmation');if(form&&['date','time','amount','place'].includes(ev.target.name)){form.elements.scheduleConfirmed.checked=false;form.elements.paymentConfirmed.checked=false;}});
document.addEventListener('submit',ev=>{
 const form=ev.target;if(!form.matches('[data-list-confirmation]'))return;ev.preventDefault();if(busy)return;
 const r=items.find(x=>x.id===form.dataset.listConfirmation);if(!r)return;
 const data=new FormData(form),booking={...MomentLinkMessages.defaults(r,settings),date:data.get('date'),time:data.get('time'),amount:Number(data.get('amount')),amountMode:'manual',place:String(data.get('place')).trim(),scheduleConfirmed:data.has('scheduleConfirmed'),paymentConfirmed:data.has('paymentConfirmed')};
 if(window.MomentLinkOps.eligible(r)){booking.opsPax=Number(val('listConfirm_opsPax'));booking.opsPaymentMethod=val('listConfirm_opsPaymentMethod');}
 const problem=MomentLinkMessages.validate('confirmed',booking,r)||window.MomentLinkOps.validate(r,booking);
 if(problem){listStatusFeedback('error',problem);return;}
 const drafts={...r.communication?.drafts,confirmed:MomentLinkMessages.generate(r,'confirmed',booking)};
 void saveListStatus(r.id,'confirmed',{booking,drafts,approved:true});
});
const cancellationPending=r=>r.integration?.operation==='cancel'&&r.integration.state!=='succeeded';
const cancellationMessage=r=>r.integration?.operation==='cancel'?(r.status==='cancelled'?'예약을 취소했습니다. 연결된 OPS에도 반영되었습니다. 환불은 별도로 확인해 주세요.':r.integration.state==='conflict'?'OPS 취소를 완료하지 못했습니다. 기존 예약은 유지됩니다. 상세 화면의 OPS 상태를 확인해 주세요.':'OPS 취소 결과를 확인 중입니다. 완료 전까지 기존 예약 상태가 유지됩니다.') : '';
const approveCancellation=r=>confirm(r.person+' · '+(r.communication?.booking?.date||'')+' '+(r.communication?.booking?.time||'')+' 예약을 취소할까요?'+(r.integration?'\n연결된 OPS 예약도 함께 취소합니다. 환불은 별도로 확인해 주세요.':''));
function syncCancellationPanel(r){if(r.integration?.operation!=='cancel')return;const node=$('#boatnOpsStatus');if(node){node.outerHTML=window.MomentLinkOps.panel(r);window.MomentLinkOps.mount(r,api);}composer.clear();composer.init(r,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);const message=$('#messageComposer');if(message)message.outerHTML=composer.html();}
const restorationPending=r=>r.integration?.operation==='restore'&&r.integration.state!=='succeeded';
const canRestoreReservation=r=>r.status==='cancelled'&&!!r.communication?.reservation&&(!r.integration||r.integration.state==='succeeded');
const restorationMessage=r=>r.status==='confirmed'?'예약을 복원했습니다.'+(r.integration?' 연결된 OPS에도 반영되었습니다.':''):r.integration?.state==='conflict'?'OPS 복원을 완료하지 못했습니다. 취소 상태를 유지합니다. 상세 화면의 OPS 상태를 확인해 주세요.':'OPS 복원 결과를 확인 중입니다. 완료 전까지 취소 상태를 유지합니다.';
function restorationButton(r){return canRestoreReservation(r)?`<button type="button" class="admin-icon-button" data-ml="restoreReservation" data-id="${e(r.id)}" aria-label="${e(r.person)} 예약 복원" title="예약 복원">${detailIconContent('refresh','예약 복원')}</button>`:'';}
const statusLabel=r=>restorationPending(r)?'복원 확인 중':cancellationPending(r)?'취소 확인 중':r.communication?.reservation&&r.status==='closed'?'이벤트 완료':statuses[r.status];
const tabs={inbox:'상담 접수함',reservations:'확정 예약',trash:'휴지통',products:'상품 관리',settings:'문자·알림',places:'장소 관리',privacy:'접수·개인정보',ops:'OPS 연동',users:'직원 계정'};
let user=null,anti='',tab='inbox',notice='',busy=false,dirty=false,items=[],users=[],products=[],draftVersion=0,settings={},settingsVersion=0,gates={},jobs={notifications:[],integrations:[]},editId='',productCategory='all',productState='active',detail=null,search='',offset=0,reservationStatus='confirmed',requestStatus='all',counts={},trashBefore='',deletionPrompt=null;
const val=id=>document.getElementById(id)?.value||'';
const input=(id,label,value,type='text')=>`<label class="admin-label" for="${id}">${e(label)}</label><input class="admin-input" id="${id}" type="${type}" value="${e(value)}"/>`;
const area=(id,label,value)=>`<label class="admin-label" for="${id}">${e(label)}</label><textarea class="admin-input" id="${id}" rows="4">${e(value)}</textarea>`;
const button=(action,label,kind='secondary')=>`<button type="button" class="${kind}" data-ml="${action}" ${busy?'disabled':''}>${label}</button>`;
async function api(path,method='GET',data,signal){const r=await fetch('/api/'+path,{method,signal,cache:'no-store',headers:{'Content-Type':'application/json',...(anti?{'X-CSRF-Token':anti}:{})},body:data===undefined?undefined:JSON.stringify(data)});let out;try{out=await r.json();}catch{throw Error('서버 응답을 확인하지 못했습니다.');}if(!r.ok){if(r.status===401)clear();const error=Error(out.message||'요청을 처리하지 못했습니다.');error.status=r.status;throw error;}return out;}
const direct=window.MomentLinkDirectBooking({api,onDirty:()=>{dirty=true;},onBusy:value=>{busy=value;if(!user)render();else{paintLive();scheduleLive();}},onCancel:()=>{if(dirty&&!confirm('입력 중인 예약을 버리고 목록으로 돌아갈까요?'))return;direct.close();dirty=false;render();},onSaved:item=>{busy=false;dirty=false;composer.clear();detail={item,notes:[],history:[]};tab=item.status==='confirmed'?'reservations':'inbox';reservationStatus='confirmed';requestStatus='all';offset=0;search='';notice=item.status==='confirmed'?'직접 입력한 예약을 확정했습니다. 아래에서 고객 문자를 준비할 수 있습니다.':'직접 입력한 내용을 상담중으로 등록했습니다. 입금 확인 후 예약을 확정해 주세요.';render();composer.openStage(item.status==='confirmed'?'confirmed':'receipt');window.scrollTo(0,0);}});
const LIVE_INTERVAL=30000;
const live={since:'',checkedAt:'',pending:0,arrivals:0,soundLatest:'',error:'',timer:null,controller:null,generation:0,lastAttempt:0,originalTitle:document.title};
function liveEligible(){return !!user&&!user.mustChangePassword&&location.hash.startsWith('#admin')&&!document.hidden&&navigator.onLine!==false&&!document.querySelector('#restorationConfirmation');}
function suspendLive(){clearTimeout(live.timer);live.timer=null;live.generation++;live.controller?.abort();live.controller=null;}
function resetLive(){suspendLive();sound.reset();Object.assign(live,{since:'',checkedAt:'',pending:0,arrivals:0,soundLatest:'',error:'',lastAttempt:0});document.title=live.originalTitle;}
function scheduleLive(){if(!liveEligible()||live.timer||live.controller)return;live.timer=setTimeout(()=>{live.timer=null;void refreshLive();},live.lastAttempt?LIVE_INTERVAL:500);}
function liveBar(){if(['settings','places','privacy','users','ops'].includes(tab))return `<div class="inbox-live notification-live" id="inboxLive"><div class="inbox-live-copy"><strong id="inboxLiveSummary" role="status" aria-live="polite" aria-atomic="true">새 상담 확인 중…</strong><span class="micro" id="inboxLiveTime"></span></div><div class="inbox-live-actions"><button type="button" class="admin-icon-button icon-primary" data-ml="newInquiries" aria-label="새 접수 보기" title="새 접수 보기" hidden>${detailIconContent('document','새 접수 보기')}</button>${detailIconButton('refreshLive','refresh','새로고침')}</div><div class="inbox-sound"><div class="inbox-sound-actions"><button type="button" class="admin-icon-button" data-ml="toggleSound" aria-label="음성 알림 켜기" title="음성 알림 켜기" aria-pressed="false">${detailIconContent('mute','음성 알림 켜기')}</button>${detailIconButton('previewSound','play','미리 듣기')}</div><div class="notification-sound-copy"><span class="micro" id="inboxSoundStatus" role="status"></span><p class="micro">화면을 열어둔 동안 새 상담을 음성으로 알려드립니다. 새로 연 화면에서는 다시 켜 주세요. 앱을 닫으면 휴대폰 기본 푸시 알림음이 적용됩니다.</p></div></div></div>`;return `<div class="inbox-live" id="inboxLive"><div class="inbox-live-copy"><strong id="inboxLiveSummary" role="status" aria-live="polite" aria-atomic="true">새 상담 확인 중…</strong><span class="micro" id="inboxLiveTime"></span></div><div class="inbox-live-actions"><button type="button" class="primary" data-ml="newInquiries" hidden>새 접수 보기</button><button type="button" class="secondary" data-ml="refreshLive">${iconLabel('refresh','새로고침')}</button></div><div class="inbox-sound"><div class="inbox-sound-actions"><button type="button" class="secondary" data-ml="toggleSound" aria-pressed="false">${iconLabel('mute','음성 알림 켜기')}</button><button type="button" class="secondary" data-ml="previewSound">${iconLabel('play','미리 듣기')}</button><span class="micro" id="inboxSoundStatus" role="status"></span></div><p class="micro">화면을 열어둔 동안 “모먼트링크, 새 상담이 왔어요”로 알려드립니다. 새로 연 화면에서는 다시 켜 주세요. 앱을 닫으면 휴대폰 기본 푸시 알림음이 적용됩니다.</p></div></div>`;}
function paintSound(){
 const bar=$('#inboxLive');if(!bar)return;
 const state=sound.state(),toggle=bar.querySelector('[data-ml=toggleSound]'),preview=bar.querySelector('[data-ml=previewSound]'),status=$('#inboxSoundStatus');
 if(!toggle||!preview||!status)return;
 if(['settings','places','privacy','users','ops'].includes(tab))paintDetailAction(toggle,state.enabled?'volume':'mute',state.enabled?'음성 알림 끄기':'음성 알림 켜기');else toggle.innerHTML=iconLabel(state.enabled?'volume':'mute',state.enabled?'음성 알림 끄기':'음성 알림 켜기');toggle.setAttribute('aria-pressed',String(state.enabled));toggle.disabled=!state.supported;
 preview.disabled=!state.supported||state.playing;
 status.textContent=!state.supported?'이 브라우저는 음성 알림을 지원하지 않습니다.':state.error||(state.playing?'재생 중…':state.enabled?'음성 알림 켜짐':'음성 알림 꺼짐');
}
function paintLive(){
 const bar=$('#inboxLive');if(!bar)return;
 paintSound();
 const summary=live.arrivals?`새 상담 ${live.arrivals}건이 접수되었습니다`:`접수중 ${live.pending}건`;
 const label=live.checkedAt?summary:'새 상담 확인 중…';
 if($('#inboxLiveSummary').textContent!==label)$('#inboxLiveSummary').textContent=label;
 const stamp=live.checkedAt?new Date(live.checkedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
 $('#inboxLiveTime').textContent=navigator.onLine===false?'인터넷 연결이 끊겼습니다. 연결되면 다시 확인합니다.':live.error||((live.controller?'확인 중…':'30초마다 자동 확인')+(stamp?' · 마지막 확인 '+stamp:''));
 bar.classList.toggle('has-new',live.arrivals>0);bar.classList.toggle('has-error',!!live.error||navigator.onLine===false);
 const view=bar.querySelector('[data-ml=newInquiries]'),refresh=bar.querySelector('[data-ml=refreshLive]');
 view.hidden=!live.arrivals;view.disabled=busy;refresh.disabled=busy||!!live.controller||navigator.onLine===false;
 if(['settings','places','privacy','users','ops'].includes(tab))paintDetailAction(refresh,'refresh',live.controller?'확인 중…':'새로고침');else refresh.innerHTML=iconLabel('refresh',live.controller?'확인 중…':'새로고침');
 document.title=live.arrivals?`새 상담 ${live.arrivals}건 | MOMENT LINK`:live.originalTitle;
}
function listPath(){return 'admin/consultations?q='+encodeURIComponent(search)+'&offset='+offset+'&view='+(tab==='inbox'?'all':tab)+'&status='+(tab==='reservations'?reservationStatus:requestStatus);}
function refreshListView(result){
 const list=$('#inboxListing');if(!list)return;
 if(JSON.stringify([items,counts])===JSON.stringify([result.items,result.counts]))return;
 const focused=list.contains(document.activeElement)?document.activeElement:null;
 const focusKey=focused?{action:focused.dataset.ml,id:focused.dataset.id,status:focused.dataset.status,tab:focused.dataset.tab}:null;
 const anchor=[...list.querySelectorAll('[data-request-id]')].find(el=>el.getBoundingClientRect().bottom>0);
 const anchorId=anchor?.dataset.requestId,top=anchor?.getBoundingClientRect().top,scroll=window.scrollY;
 items=result.items;counts=result.counts;list.innerHTML=inboxListing();
 if(focusKey){const replacement=[...list.querySelectorAll('[data-ml]')].find(el=>Object.entries(focusKey).every(([k,v])=>el.dataset[k==='action'?'ml':k]===v));(replacement||$('#requestSearch'))?.focus({preventScroll:true});}
 // Keep the card being read in place when new cards are inserted above it.
 if(scroll>0&&anchorId){const replacement=[...list.querySelectorAll('[data-request-id]')].find(el=>el.dataset.requestId===anchorId);if(replacement)window.scrollBy(0,replacement.getBoundingClientRect().top-top);}
}
async function refreshLive(){
 if(!liveEligible()||busy||composer.isBusy()||deletionPrompt||live.controller){scheduleLive();return;}
 clearTimeout(live.timer);live.timer=null;
 const controller=new AbortController(),generation=live.generation,path=listPath(),listVisible=!detail&&['inbox','reservations'].includes(tab)&&!!$('#inboxListing');
 live.controller=controller;live.lastAttempt=Date.now();paintLive();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const update=await api('admin/consultations/updates'+(live.since?'?since='+encodeURIComponent(live.since):''),'GET',undefined,controller.signal);
  if(generation!==live.generation||!liveEligible())return;
  if(live.checkedAt&&update.latestAt&&update.latestAt>live.soundLatest)sound.notify();
  live.soundLatest=live.soundLatest||update.latestAt||update.checkedAt;
  if(update.latestAt>live.soundLatest)live.soundLatest=update.latestAt;
  live.since ||= update.checkedAt;live.checkedAt=update.checkedAt;live.pending=update.pending;live.arrivals=update.arrivals;live.error='';
  if(listVisible&&!listStatusState.id&&!listStatusState.confirmationId&&!listNoteEditing()){const result=await api(path,'GET',undefined,controller.signal);if(generation===live.generation&&liveEligible()&&!busy&&!detail&&path===listPath()&&!listStatusState.id&&!listStatusState.confirmationId&&!listNoteEditing())refreshListView(result);}
  const open=detail?.item;
  if(open?.integration&&!busy&&!dirty&&!composer.isDirty()&&!noteDrafts.get(open.id)){
   const result=await api('admin/consultations/'+open.id,'GET',undefined,controller.signal);
   if(generation===live.generation&&liveEligible()&&detail?.item===open&&!busy&&!dirty&&!composer.isBusy()&&!composer.isDirty()&&!noteDrafts.get(open.id)&&(result.item.version!==open.version||JSON.stringify(result.item.integration)!==JSON.stringify(open.integration))){detail=result;composer.clear();notice='OPS 예약의 최신 변경을 반영했습니다.';render();}
  }
 }catch(err){
  if(err.status===401&&!user){notice='로그인을 다시 확인해 주세요.';render();return;}
  if(generation!==live.generation)return;
  live.error='새 상담 확인에 실패했습니다. 새로고침을 누르거나 잠시 기다려 주세요.';
  if(!user){resetLive();notice='로그인을 다시 확인해 주세요.';render();}
 }finally{clearTimeout(timeout);if(generation===live.generation){live.controller=null;paintLive();scheduleLive();}}
}
async function showNewInquiries(home=false){
 if(listStatusState.confirmationId&&!confirm('작성 중인 예약 확정 정보를 닫고 새로고침할까요?'))return;listStatusState.confirmationId='';
 if((dirty||composer.isDirty())&&!confirm('저장하지 않은 변경을 버리고 새 접수를 볼까요?'))return;
 suspendLive();const acknowledged=live.checkedAt;busy=true;paintLive();
 try{const result=await api('admin/consultations?view=all&status=all');composer.clear();direct.close();dirty=false;detail=null;tab='inbox';search='';offset=0;requestStatus='all';items=result.items;counts=result.counts;live.since=acknowledged;live.arrivals=0;live.error='';if(home){deletionPrompt=null;window.history.replaceState(null,'','#admin');}notice=home?'상담 접수함을 새로고침했습니다.':'새로 들어온 상담부터 표시합니다.';}
 catch(err){notice=err.message;}
 finally{busy=false;render();window.scrollTo(0,0);}
}
function resumeLive(){if(liveEligible()&&Date.now()-live.lastAttempt>5000)void refreshLive();else scheduleLive();}
document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendLive();sound.stop();}else resumeLive();});
window.addEventListener('offline',()=>{suspendLive();paintLive();});
window.addEventListener('online',resumeLive);
window.addEventListener('focus',resumeLive);
function header(){return `<header><div class="brand">${user&&!user.mustChangePassword?'<button type="button" data-ml="homeInbox" aria-label="상담 접수함 새로고침" title="상담 접수함 새로고침" style="font:inherit;letter-spacing:inherit;background:none;border:0;border-radius:0;padding:0;color:inherit;text-align:left;cursor:pointer">MOMENT LINK</button>':'MOMENT LINK'}</div><nav class="nav"><a class="tab" href="#">고객 화면</a><button type="button" class="tab" data-pwa-install>앱 설치</button>${user?button('logout','로그아웃'):''}</nav></header>`;}
function login(){return `<main class="layout"><section class="page"><div class="hero-card"><h1 class="page-title">관리자 로그인</h1><p class="muted">허가된 직원만 상담 내역을 확인할 수 있습니다.</p><p class="micro">이 기기에서 로그인이 자동으로 유지됩니다.</p><form id="mlLogin">${input('loginUser','아이디','','text')}${input('loginPassword','비밀번호','','password')}<button class="primary" style="width:100%;margin-top:20px" ${busy?'disabled':''}>${busy?'확인 중…':'로그인'}</button></form></div></section></main>`;}
function accountInput(id,label,{type='text',value='',autocomplete='off'}={}){return '<label class="admin-label" for="'+id+'">'+e(label)+'</label><input class="admin-input" id="'+id+'" name="'+id+'" type="'+type+'" value="'+e(value)+'" autocomplete="'+autocomplete+'" autocapitalize="none" spellcheck="false" '+(['staffPassword','newPassword'].includes(id)?'minlength="8"':'')+'/>';}
function passwordPanel(){return '<section class="admin-card account-card" aria-labelledby="accountHeading"><div class="staff-section-heading"><div><h2 id="accountHeading">아이디·비밀번호 변경</h2><p class="micro">'+(user.mustChangePassword?'처음 로그인한 계정은 비밀번호를 변경해 주세요.':'변경한 로그인 정보로 다시 로그인합니다.')+'</p></div><span class="staff-tag">'+(user.mustChangePassword?'첫 로그인':'내 계정')+'</span></div><div class="staff-field-grid"><div class="staff-wide">'+accountInput('accountUsername','로그인 아이디',{value:user.username,autocomplete:'username'})+'</div><div>'+accountInput('currentPassword','현재 비밀번호',{type:'password',autocomplete:'current-password'})+'</div><div>'+accountInput('newPassword','새 비밀번호 · 8자 이상',{type:'password',autocomplete:'new-password'})+'</div></div><footer class="staff-form-footer"><p class="micro">아이디·비밀번호를 변경하면 다시 로그인해야 합니다.</p>'+detailIconButton('password','key','변경 후 다시 로그인','icon-primary')+'</footer></section>';}
function staffRow(account){
 const self=account.id===user.id,actionLabel=account.username+' '+(account.active?'사용 중지':'사용 재개');
 return '<li class="staff-account"><div class="staff-account-identity"><span class="staff-avatar">'+icon('person')+'</span><div class="staff-account-copy"><strong>'+e(account.username)+'</strong><div class="staff-account-meta"><span>'+e(account.role==='admin'?'관리자':'상담자')+'</span>'+(self?'<span class="staff-tag">내 계정</span>':'')+'<span class="staff-state" data-active="'+!!account.active+'">'+(account.active?'사용 중':'중지')+'</span>'+(account.mustChangePassword?'<span class="staff-tag">첫 로그인 변경</span>':'')+'</div></div></div>'+(self?'':'<div class="staff-account-actions"><button type="button" class="admin-icon-button '+(account.active?'icon-danger':'')+'" data-ml="toggleUser" data-id="'+e(account.id)+'" aria-label="'+e(actionLabel)+'" title="'+e(actionLabel)+'" '+(busy?'disabled':'')+'>'+detailIconContent(account.active?'pause':'play',account.active?'사용 중지':'사용 재개')+'</button></div>')+'</li>';
}
function staff(){
 if(user.role!=='admin')return '<section class="staff-manager" aria-label="내 계정 관리">'+passwordPanel()+'</section>';
 const active=users.filter(account=>account.active).length;
 return '<section class="staff-manager" aria-label="직원 계정 관리"><p class="micro staff-intro">직원 계정의 사용 상태와 로그인 정보를 관리하세요.</p><section class="admin-card staff-card" aria-labelledby="staffListHeading"><div class="staff-section-heading"><div><h2 id="staffListHeading">직원 목록 <span class="micro">'+users.length+'</span></h2><p class="micro">사용 중 '+active+' · 중지 '+(users.length-active)+'</p></div></div><ul class="staff-account-list">'+users.map(staffRow).join('')+'</ul></section><section class="admin-card staff-card" aria-labelledby="staffCreateHeading"><div class="staff-section-heading"><div><h2 id="staffCreateHeading">직원 계정 생성</h2><p class="micro">상담자는 배정된 상담만 확인할 수 있습니다.</p></div></div><div class="staff-create-grid"><div>'+accountInput('staffName','신규 직원 아이디')+'</div><div>'+accountInput('staffPassword','임시 비밀번호 · 8자 이상',{type:'password',autocomplete:'new-password'})+'</div><div><label class="admin-label" for="staffRole">권한</label><select class="admin-select" id="staffRole"><option value="counselor">상담자 · 배정된 상담만</option><option value="admin">관리자</option></select></div></div><footer class="staff-form-footer"><p class="micro">첫 로그인 시 비밀번호를 변경해야 합니다.</p>'+detailIconButton('createStaff','personPlus','직원 계정 생성','icon-primary')+'</footer></section>'+passwordPanel()+'</section>';
}
function assigneePicker(value){
 const options=[{id:'',username:'미배정'},...users.filter(x=>x.active)],selected=options.find(x=>x.id===value)||options[0];
 return `<label class="admin-label" id="requestAssigneeLabel" for="requestAssignee">담당자</label><div class="assignee-control"><button type="button" class="admin-select assignee-trigger" id="requestAssignee" value="${e(selected.id)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="requestAssigneeOptions" aria-labelledby="requestAssigneeLabel requestAssigneeValue"><span id="requestAssigneeValue">${e(selected.username)}</span><span class="assignee-chevron" aria-hidden="true"></span></button><div class="assignee-options" id="requestAssigneeOptions" role="listbox" aria-labelledby="requestAssigneeLabel" hidden>${options.map(x=>`<button type="button" role="option" tabindex="-1" aria-selected="${x.id===selected.id}" data-assignee="${e(x.id)}">${e(x.username)}</button>`).join('')}</div></div>`;
}
function closeAssignee(returnFocus=false){
 const trigger=$('#requestAssignee'),list=$('#requestAssigneeOptions');if(!trigger||!list)return;
 trigger.setAttribute('aria-expanded','false');list.hidden=true;if(returnFocus)trigger.focus();
}
function openAssignee(edge){
 const trigger=$('#requestAssignee'),list=$('#requestAssigneeOptions');if(!trigger||!list)return;
 const rect=trigger.getBoundingClientRect(),below=innerHeight-rect.bottom-8,above=rect.top-8,upward=below<180&&above>below;
 trigger.closest('.assignee-control').classList.toggle('opens-up',upward);
 list.style.maxHeight=Math.max(88,Math.min(240,upward?above:below))+'px';
 trigger.setAttribute('aria-expanded','true');list.hidden=false;
 const options=[...list.querySelectorAll('[role=option]')];
 (edge==='first'?options[0]:edge==='last'?options.at(-1):options.find(x=>x.getAttribute('aria-selected')==='true')||options[0])?.focus();
}
document.addEventListener('click',ev=>{
 const root=ev.target.closest('.assignee-control');if(!root){closeAssignee();return;}if(busy||composer.isBusy())return;
 const trigger=root.querySelector('#requestAssignee');
 if(ev.target.closest('#requestAssignee')){if(trigger.getAttribute('aria-expanded')==='true')closeAssignee(true);else openAssignee();return;}
 const option=ev.target.closest('[data-assignee]');if(!option)return;
 if(trigger.value!==option.dataset.assignee)statusEdited();
 trigger.value=option.dataset.assignee;root.querySelector('#requestAssigneeValue').textContent=option.textContent;
 root.querySelectorAll('[role=option]').forEach(x=>x.setAttribute('aria-selected',String(x===option)));closeAssignee(true);
});
document.addEventListener('focusout',ev=>{const root=ev.target.closest('.assignee-control');if(root&&!root.contains(ev.relatedTarget))closeAssignee();});
document.addEventListener('keydown',ev=>{
 const root=ev.target.closest('.assignee-control');if(!root)return;
 const trigger=root.querySelector('#requestAssignee'),open=trigger.getAttribute('aria-expanded')==='true';
 if(ev.key==='Escape'&&open){ev.preventDefault();closeAssignee(true);return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(ev.key)||busy||composer.isBusy())return;
 ev.preventDefault();if(!open){openAssignee(ev.key==='Home'?'first':ev.key==='End'?'last':undefined);return;}
 const options=[...root.querySelectorAll('[role=option]')],index=options.indexOf(document.activeElement);
 const next=ev.key==='Home'?0:ev.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+(ev.key==='ArrowDown'?1:-1)));
 options[next]?.focus();
});
function openReservationRestoration(id,button){
 const r=detail?.item.id===id?detail.item:items.find(x=>x.id===id);if(!r||!canRestoreReservation(r))return;
 if(detail&&(dirty||composer.isDirty()||noteDrafts.get(id))){quickStatusFeedback('error','작성 중인 메모·예약 정보를 먼저 저장해 주세요.');return;}
 document.getElementById('restorationConfirmation')?.remove();
 suspendLive();
 const panel=document.createElement('div');panel.id='restorationConfirmation';panel.className='info';panel.setAttribute('role','group');panel.setAttribute('aria-label','예약 복원 확인');
 const booking=r.communication.booking;
 panel.innerHTML=`<p><strong>${e(r.person)} · 예약 복원</strong></p><p class="micro">${e(booking.date)} ${e(booking.time)} 일정으로 복원합니다.${r.integration?' 연결된 OPS 예약도 함께 복원합니다.':''} 금액·입금 기록은 그대로 유지됩니다.</p><div class="btnrow"><button type="button" class="admin-icon-button" data-ml="cancelReservationRestore" data-id="${e(id)}" aria-label="복원 닫기">${detailIconContent('close','닫기')}</button><button type="button" class="admin-icon-button icon-primary" data-ml="approveReservationRestore" data-id="${e(id)}" aria-label="예약 복원 확인">${detailIconContent('refresh','복원 확인')}</button></div><p class="micro" role="status" data-restoration-feedback></p>`;
 (button.closest('.inbox-item')||document.querySelector('.request-detail')).append(panel);panel.querySelector('button').focus();
}
async function restoreReservation(id){
 const r=detail?.item.id===id?detail.item:items.find(x=>x.id===id),panel=document.getElementById('restorationConfirmation');if(!r||!panel||!canRestoreReservation(r)||busy)return;
 const feedback=panel.querySelector('[data-restoration-feedback]');
 if(detail&&(dirty||composer.isDirty()||noteDrafts.get(id))){feedback.textContent='작성 중인 메모·예약 정보를 먼저 저장해 주세요.';return;}
 suspendLive();busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);feedback.textContent='예약 복원을 확인하고 있습니다…';
 const app=document.getElementById('app');app.inert=true;let saved=false;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{
  const result=await api('admin/consultations/'+id+'/restore-reservation','POST',{version:r.version},controller.signal);
  notice=restorationMessage(result.item);
  if(detail?.item.id===id){detail.item=result.item;composer.clear();}
  else{items=items.map(x=>x.id===id?{...x,...result.item}:x);try{await load();}catch{notice+=' 목록 갱신은 새로고침을 눌러 주세요.';}}
  panel.remove();saved=true;
 }catch(error){feedback.textContent=error.status?error.message:'복원 결과를 확인하지 못했습니다. 새로고침으로 상태를 확인해 주세요.';}
 finally{clearTimeout(timeout);app.inert=false;busy=false;if(saved)render();else panel.querySelectorAll('button').forEach(b=>b.disabled=false);paintLive();scheduleLive();}
}
function reservationOverview(r){const b=r.communication?.booking;return `<div class="reservation-overview"><div class="reservation-schedule"><span class="micro">확정 일정</span><div class="reservation-date-line">${b?.date?'<time datetime="'+e(b.date)+'">'+e(b.date)+'</time><span>'+e(b.time||'시간 확인 필요')+'</span>':'<span>일정 확인 필요</span>'}</div></div><div class="reservation-amount"><span class="micro">최종 금액</span><strong>${Number.isInteger(b?.amount)?b.amount.toLocaleString('ko-KR')+'원':'금액 확인 필요'}</strong></div><p class="reservation-place">${icon('pin')}<span>${e(b?.place||'확정 장소 확인 필요')}</span></p></div>`;}
function reservationMessageActions(r){
 if(r.status==='cancelled')return '';
 const icons={receipt:'document',confirmed:'calendar',reminder:'bell',thanks:'chat'},captions={receipt:'접수안내',confirmed:'확정안내',reminder:'전날안내',thanks:'안부문자'};
 return `<div class="reservation-messages" role="group" aria-label="고객 안내 문자"><span class="micro">문자 안내</span><div class="reservation-message-actions">${Object.entries(MomentLinkMessages.stages).filter(([id])=>r.status!=='closed'||id==='thanks').map(([id,name])=>{const sent=r.communication?.events?.some(x=>x.stage===id&&x.kind==='manual_sent'),label=name+' · '+(sent?'발송 기록 있음':'문구 준비');return `<button type="button" class="admin-icon-button reservation-message-action ${sent?'has-sent-record':''}" data-ml="messageCustomer" data-id="${e(r.id)}" data-stage="${id}" aria-label="${e(r.person)} ${e(label)}" title="${e(label)}">${detailIconContent(icons[id],captions[id])}${sent?'<span class="reservation-sent-mark" aria-hidden="true">'+icon('check')+'</span>':''}</button>`;}).join('')}</div></div>`;
}
function reservationToolbar(){return `<div class="reservation-toolbar"><form id="requestSearchForm" class="inbox-search" role="search" aria-label="예약 고객 검색"><label class="visually-hidden" for="requestSearch">예약 고객 검색</label><div class="inbox-search-row"><input class="admin-input" id="requestSearch" type="search" value="${e(search)}" placeholder="이름 · 전화번호 · 접수번호"/><button class="admin-icon-button icon-primary" type="submit" aria-label="예약 검색" title="예약 검색" ${busy?'disabled':''}>${detailIconContent('search','검색')}</button></div></form>${user.role==='admin'?detailIconButton('newReservation','plus','직접 예약 등록','icon-primary'):''}</div>${search?'<div class="reservation-search-result"><span class="micro">검색 결과: '+e(search)+'</span>'+detailIconButton('clearSearch','close','검색 초기화')+'</div>':''}`;}
function inbox(){
 if(direct.isOpen())return direct.render();
 if(detail)return requestDetail();
 if(tab==='reservations')return reservationToolbar()+'<p id="listStatusFeedback" class="quick-status-feedback micro" role="status" aria-live="polite" aria-atomic="true"></p><div id="inboxListing">'+inboxListing()+'</div>';
 return `${user.role==='admin'?'<div class="direct-booking-launch">'+detailIconButton('newReservation','plus','직접 예약 등록','icon-primary')+'</div>':''}<form id="requestSearchForm" class="inbox-search" role="search" aria-label="고객 검색"><label class="admin-label" for="requestSearch">고객 검색</label><div class="inbox-search-row"><input class="admin-input" id="requestSearch" type="search" value="${e(search)}" placeholder="이름, 전화번호 또는 접수번호 입력"/><button class="primary" type="submit" ${busy?'disabled':''}>검색</button></div><div class="inbox-tools">${search?button('clearSearch','검색 초기화'):''}<span class="micro">${search?'검색 결과: '+e(search):'검색어 없이 전체 목록을 볼 수 있습니다.'}</span></div></form><p id="listStatusFeedback" class="quick-status-feedback micro" role="status" aria-live="polite" aria-atomic="true"></p><div id="inboxListing">${inboxListing()}</div>`;
}
function inboxListing(){
 const reserved=tab==='reservations',filterStatus=reserved?reservationStatus:requestStatus;
 return `<div class="reservation-filters" role="group" aria-label="진행 상황별 보기">${(reserved?[['confirmed','확정'],['closed','이벤트 완료'],['cancelled','취소'],['all','전체 예약']]:[['all','전체'],...Object.entries(statuses).filter(([id])=>id!=='closed')]).map(([id,n])=>`<button class="secondary" data-ml="${reserved?'reservationFilter':'requestFilter'}" data-status="${id}" aria-pressed="${filterStatus===id}">${n} <span>${counts[id]??0}</span></button>`).join('')}${!reserved&&user.role==='admin'?'<button type="button" class="admin-icon-button inbox-trash-button" data-ml="tab" data-tab="trash" aria-label="휴지통" title="휴지통">'+detailIconContent('trash','휴지통')+'</button>':''}</div><p class="micro inbox-count">${reserved?'이벤트 일정순':'최근 접수순'} · ${items.length?'현재 '+(offset+1)+'–'+(offset+items.length)+'건 표시':'표시할 내역 없음'}${user.role==='admin'?'':' · 내 담당 고객'}</p>${offset||items.length===50?`<div class="btnrow inbox-pagination">${offset?(reserved?detailIconButton('previousPage','back','이전 50건'):button('previousPage','이전 50건')):''}${items.length===50?(reserved?detailIconButton('nextPage','forward','다음 50건'):button('nextPage','다음 50건')):''}</div>`:''}<div class="inbox-results">${items.map(r=>{
 const hasReservation=reserved||r.status==='confirmed'||!!r.communication?.reservation;
 return `<div class="admin-card inbox-item ${hasReservation?'reservation-item':''}" data-request-id="${e(r.id)}"><div class="admin-row inbox-card-heading"><div class="inbox-customer"><strong>${e(r.person)}</strong><a class="inbox-phone" href="tel:${e(r.phone)}" aria-label="${e(r.person)} 전화번호 ${e(displayPhone(r.phone))}">${e(displayPhone(r.phone))}</a></div>${listQuickStatus(r)}</div>${listStatusState.confirmationId===r.id?listConfirmation(r):''}<p class="inbox-product">${e(r.snapshot.product.name)} · ${e(r.snapshot.package.name)}</p>${hasReservation?reservationOverview(r):`<p class="muted inbox-date">희망 일정 · ${e(r.preferences[0].date)} ${e(r.preferences[0].time)}</p>`}${listNoteEditor(r)}<div class="inbox-card-footer"><span class="micro inbox-receipt">${e(r.receipt)}${r.communication?.entry?.source==='admin_direct'?' · 직접 등록':''}</span>${listCardActions(r,hasReservation)}${restorationButton(r)}</div>${hasReservation?reservationMessageActions(r):''}</div>`;
 }).join('')||'<div class="empty">해당하는 내역이 없습니다.</div>'}</div>`;
}
function trash(){return `<div class="btnrow"><button type="button" class="secondary" data-ml="tab" data-tab="inbox">← 상담 접수함</button></div><p class="muted">삭제한 상담은 7일 동안 복원할 수 있습니다. 기존 개인정보 보유기한이 먼저 끝나면 그날 만료됩니다. 만료된 내역은 숨겨지고 매일 자동으로 영구 삭제됩니다.</p><div class="inbox-tools">${button('refreshInbox','목록 새로고침')}${button('emptyTrash','휴지통 비우기')}<span class="micro">전체 ${counts.all??0}건</span></div>${offset||items.length===50?'<div class="btnrow inbox-pagination">'+(offset?button('previousPage','이전 50건'):'')+(items.length===50?button('nextPage','다음 50건'):'')+'</div>':''}<div class="inbox-results">${items.map(r=>`<div class="admin-card inbox-item"><div class="admin-row"><strong>${e(r.person)}</strong><span class="badge">${e(statuses[r.status])}</span></div><p class="micro">${e(r.receipt)} · ${e(r.phone)}</p><p>${e(r.snapshot.product.name)} · ${e(r.snapshot.package.name)}</p><p class="muted">복원 가능 기한 · ${e(new Date(r.delete_after).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><div class="btnrow"><button class="secondary" data-ml="restoreRequest" data-id="${e(r.id)}">복원</button><button class="secondary" data-ml="permanentRequest" data-id="${e(r.id)}">영구 삭제</button></div></div>`).join('')||'<div class="empty">휴지통이 비어 있습니다.</div>'}</div>`;}

function requestStatusEntries(r){if(restorationPending(r)||cancellationPending(r))return [[r.status,statusLabel(r)]];return Object.entries(statuses).filter(([id])=>r.communication?.reservation?(r.status==='confirmed'?['confirmed','closed','cancelled'].includes(id):id===r.status):id!=='closed').map(([id,n])=>[id,id==='closed'&&r.communication?.reservation?'이벤트 완료':n]);}
function requestStatusOptions(r){const entries=requestStatusEntries(r);if(r.status==='closed'&&!r.communication?.reservation)entries.push(['closed','종결']);return entries.map(([id,n])=>`<option value="${id}" ${id===r.status?'selected':''} ${id==='closed'&&!r.communication?.reservation?'disabled hidden':''}>${n}</option>`).join('');}
const actionCaptions={'목록 새로고침':'새로고침','상태 확인 / 안전 재시도':'확인·재시도','상태 확인 / 재시도':'확인·재시도','직원 계정 생성':'계정 생성','변경 후 다시 로그인':'정보 변경','접수 설정 저장':'설정 저장','만료 개인정보 정리':'만료 정리','장소 안내 저장':'안내 저장','음성 알림 켜기':'음성 켜기','음성 알림 끄기':'음성 끄기','새 접수 보기':'새 접수','이 기기 푸시 구독':'알림 구독','푸시 구독 해제':'구독 해제','상담 목록으로 돌아가기':'목록','예약·문자 안내 열기':'문자 안내','확정됨 · 정보 수정':'예약 수정','휴지통으로 이동':'삭제','직접 예약 등록':'예약 등록','검색 초기화':'초기화','이전 50건':'이전','다음 50건':'다음','메모 저장 중':'저장 중','메모 저장 완료':'저장 완료','메모 다시 저장':'다시 저장','메모 저장 다시 시도':'다시 저장','상태 저장 중':'저장 중','상태 저장 완료':'저장 완료','상태 저장 다시 시도':'다시 저장'};
function detailIconContent(name,label){return icon(name)+'<span class="admin-action-text">'+e(actionCaptions[label]||label)+'</span>';}
function detailIconButton(action,name,label,kind=''){return `<button type="button" class="admin-icon-button ${kind}" data-ml="${action}" aria-label="${e(label)}" title="${e(label)}" ${busy?'disabled':''}>${detailIconContent(name,label)}</button>`;}
function paintDetailAction(button,name,label){button.innerHTML=detailIconContent(name,label);button.setAttribute('aria-label',label);button.setAttribute('title',label);}
function paintDetailSave(button,state,label){paintDetailAction(button,state==='success'?'check':state==='saving'||state==='error'?'refresh':'save',state==='saving'?label+' 중':state==='success'?label+' 완료':state==='error'?label+' 다시 시도':label);}
function quickStatus(r){return `<div class="quick-status" id="quickStatus"><button type="button" class="quick-status-trigger" id="quickStatusTrigger" aria-label="상담 상태 변경: ${e(statusLabel(r))}" aria-haspopup="menu" aria-expanded="false" aria-controls="quickStatusMenu"><span>${e(statusLabel(r))}</span>${icon('chevron')}</button><div class="quick-status-menu" id="quickStatusMenu" role="menu" aria-label="상담 상태 변경" hidden>${requestStatusEntries(r).map(([id,label])=>`<button type="button" role="menuitemradio" aria-checked="${id===r.status}" tabindex="-1" data-quick-status="${id}">${iconLabel(statusIcon[id],label)}${id===r.status?icon('check'):''}</button>`).join('')}<p class="micro">선택하면 바로 저장됩니다.</p></div></div>`;}
function closeQuickStatus(focus=false){const trigger=$('#quickStatusTrigger'),menu=$('#quickStatusMenu');if(!trigger||!menu)return;trigger.setAttribute('aria-expanded','false');menu.hidden=true;if(focus)trigger.focus({preventScroll:true});}
function openQuickStatus(edge){
 const trigger=$('#quickStatusTrigger'),menu=$('#quickStatusMenu');if(!trigger||!menu||busy||composer.isBusy())return;
 closeAssignee();const rect=trigger.getBoundingClientRect(),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<280&&above>below;
 $('#quickStatus').classList.toggle('opens-up',up);menu.style.maxHeight=Math.max(100,Math.min(390,up?above:below))+'px';
 trigger.setAttribute('aria-expanded','true');menu.hidden=false;
 const options=[...menu.querySelectorAll('[data-quick-status]')];
 (edge==='first'?options[0]:edge==='last'?options.at(-1):options.find(x=>x.getAttribute('aria-checked')==='true')||options[0])?.focus({preventScroll:true});
}
function quickStatusFeedback(state,text){const feedback=$('#quickStatusFeedback');if(feedback){feedback.dataset.state=state;feedback.textContent=text;}const trigger=$('#quickStatusTrigger');if(trigger){trigger.disabled=state==='saving';trigger.setAttribute('aria-busy',String(state==='saving'));}}
function syncQuickStatus(r){const root=$('#quickStatus');if(!root)return;root.outerHTML=quickStatus(r);}
async function saveQuickStatus(selected){
 const r=detail?.item,root=$('#requestStatusEditor');if(!r||!root||busy||composer.isBusy()||!requestStatusEntries(r).some(([id])=>id===selected))return;
 closeQuickStatus(true);
 if(selected===r.status)return;
 let confirmation;
 if(selected==='confirmed'){
  try{confirmation=composer.confirmation();}
  catch(err){const message='확정하지 못했습니다. '+err.message;quickStatusFeedback('error',message);composer.openStage('confirmed',message);return;}
 }
 if(['cancelled','closed'].includes(selected)&&composer.isDirty()){quickStatusFeedback('error','작성 중인 문자·예약 정보를 먼저 저장해 주세요.');return;}
 if(selected==='cancelled'&&r.status==='confirmed'&&!approveCancellation(r))return;
 let messageRoot=$('#messageComposer');
 const fieldset=root.querySelector('fieldset'),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),selected==='cancelled'?60000:20000);
 const current=()=>detail?.item.id===r.id&&$('#requestStatusEditor')===root;
 suspendLive();busy=true;closeAssignee();fieldset.disabled=true;if(messageRoot)messageRoot.inert=true;
 quickStatusFeedback('saving','상태를 저장하고 있습니다…');paintLive();
 try{
  // Confirmation uses the same atomic booking validation as the reservation button.
  // Assignment, contact flags and unsaved notes are not part of this quick change.
  const data={version:r.version,status:selected};if(confirmation)data.confirmation=confirmation;
  const out=await api('admin/consultations/'+r.id,'PATCH',data,controller.signal);
  if(!current())return;
  detail.item=out.item;composer.init(out.item,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);
  if(confirmation){composer.acceptConfirmation(out.item);messageRoot=$('#messageComposer');if(messageRoot)messageRoot.inert=true;const focusButton=$('.reservation-heading [data-ml=reservationFocus]');if(focusButton)paintDetailAction(focusButton,'calendar','확정됨 · 정보 수정');}
  $('#requestStatus').innerHTML=requestStatusOptions(out.item);syncQuickStatus(out.item);syncCancellationPanel(out.item);messageRoot=$('#messageComposer');
  if(out.item.status==='cancelled'||out.item.status==='closed'&&out.item.communication?.reservation){$('.reservation-heading [data-ml=reservationFocus]')?.remove();messageRoot?.querySelector('.reservation-confirm')?.remove();}
  quickStatusFeedback('success',(cancellationMessage(out.item)||statusLabel(out.item)+' 상태로 저장했습니다.')+(confirmation?' 확정 예약 목록에서 확인할 수 있습니다.':''));$('#quickStatusTrigger')?.focus({preventScroll:true});
  const otherEdits=(user.role==='admin'&&(val('requestAssignee')||null)!==(out.item.assignee||null))||$('#requestContacted').checked!==out.item.contacted;
  statusFeedback(otherEdits?'changed':'success',otherEdits?'상태는 저장했습니다. 담당자·연락 완료 변경은 아직 저장하지 않았습니다.':(cancellationMessage(out.item)||statusLabel(out.item)+' 상태로 저장했습니다.'));
  void api('admin/consultations/'+r.id).then(fresh=>{if(current()&&detail.item.version===out.item.version){detail.notes=fresh.notes;detail.history=fresh.history;$('#requestHistory').innerHTML=requestHistory();}}).catch(()=>{});
 }catch(err){
  if(!user){notice='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}
  else if(current())quickStatusFeedback('error',err.status?'저장하지 못했습니다. '+err.message:'저장 결과를 확인하지 못했습니다. 인터넷 연결을 확인하고 목록에서 상태를 확인해 주세요.');
 }finally{clearTimeout(timeout);busy=false;if(messageRoot)messageRoot.inert=false;if(current()){fieldset.disabled=false;const trigger=$('#quickStatusTrigger');if(trigger){trigger.disabled=false;trigger.setAttribute('aria-busy','false');}}paintLive();scheduleLive();}
}
document.addEventListener('click',ev=>{
 const root=ev.target.closest('#quickStatus');if(!root){closeQuickStatus();return;}if(busy||composer.isBusy())return;
 if(ev.target.closest('#quickStatusTrigger')){if($('#quickStatusTrigger').getAttribute('aria-expanded')==='true')closeQuickStatus(true);else openQuickStatus();return;}
 const option=ev.target.closest('[data-quick-status]');if(option)void saveQuickStatus(option.dataset.quickStatus);
});
document.addEventListener('focusout',ev=>{const root=ev.target.closest('#quickStatus');if(root&&!root.contains(ev.relatedTarget))closeQuickStatus();});
document.addEventListener('keydown',ev=>{
 const root=ev.target.closest('#quickStatus');if(!root||busy||composer.isBusy())return;
 const open=$('#quickStatusTrigger').getAttribute('aria-expanded')==='true';
 if(ev.key==='Escape'&&open){ev.preventDefault();closeQuickStatus(true);return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(ev.key))return;
 ev.preventDefault();if(!open){openQuickStatus(ev.key==='End'?'last':'first');return;}
 const options=[...root.querySelectorAll('[data-quick-status]')],index=options.indexOf(document.activeElement);
 const next=ev.key==='Home'?0:ev.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,index+(ev.key==='ArrowDown'?1:-1)));
 options[next]?.focus({preventScroll:true});
});
function statusFeedback(state,text){
 const root=$('#requestStatusEditor');if(!root)return;
 root.dataset.state=state;
 const button=root.querySelector('[data-ml=saveRequest]'),message=$('#requestSaveFeedback');
 paintDetailSave(button,state,'상태 저장');
 root.querySelector('fieldset').disabled=state==='saving';
 button.setAttribute('aria-busy',String(state==='saving'));
 message.textContent=text;
}
function statusEdited(){if(!busy){dirty=true;statusFeedback('changed','변경 사항이 있습니다. 상태 저장을 눌러 주세요.');}}
async function saveRequestState(){
 const root=$('#requestStatusEditor'),r=detail?.item;if(!root||!r||busy)return;
 const selected=val('requestStatus'),confirming=selected==='confirmed'&&r.status!=='confirmed';
 let confirmation;
 if(confirming){try{confirmation=composer.confirmation();}catch(err){composer.openStage('confirmed');statusFeedback('error','확정하지 못했습니다. '+err.message);return;}}
 else if(composer.isDirty()){statusFeedback('error','문자·예약 정보 변경을 먼저 저장하거나 예약 확정해 주세요.');return;}
 if(selected==='cancelled'&&r.status==='confirmed'&&!approveCancellation(r))return;
 const data={version:r.version,contacted:$('#requestContacted').checked,read:true};
 if(selected!=='confirmed'||confirming)data.status=selected;
 if(confirmation)data.confirmation=confirmation;
 if(user.role==='admin')data.assignee=val('requestAssignee')||null;
 let messageRoot=$('#messageComposer');const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),selected==='cancelled'?60000:20000);
 suspendLive();busy=true;closeAssignee();statusFeedback('saving','상태를 저장하고 있습니다…');paintLive();
 if(messageRoot)messageRoot.inert=true;
 const current=()=>detail?.item.id===r.id&&$('#requestStatusEditor')===root;
 try{
  const out=await api('admin/consultations/'+r.id,'PATCH',data,controller.signal);
  if(!current())return;
  detail.item=out.item;
  composer.init(out.item,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);
  if(confirming){composer.acceptConfirmation(out.item);messageRoot=$('#messageComposer');if(messageRoot)messageRoot.inert=true;const focusButton=$('.reservation-heading [data-ml=reservationFocus]');if(focusButton)paintDetailAction(focusButton,'calendar','확정됨 · 정보 수정');}
  $('#requestStatus').innerHTML=requestStatusOptions(out.item);
  const label=out.item.communication?.reservation&&out.item.status==='closed'?'이벤트 완료':statuses[out.item.status];
  syncQuickStatus(out.item);syncCancellationPanel(out.item);messageRoot=$('#messageComposer');quickStatusFeedback('success',cancellationMessage(out.item)||label+' 상태로 저장했습니다.');
  if(out.item.status==='cancelled'||out.item.status==='closed'&&out.item.communication?.reservation){
   $('.reservation-heading [data-ml=reservationFocus]')?.remove();
   messageRoot?.querySelector('.reservation-confirm')?.remove();
  }
  // Keep the editor and its unsaved memo/OPS fields in place after saving status.
  dirty=[...root.closest('.admin-card').querySelectorAll('input,textarea')].some(el=>!root.contains(el)&&!messageRoot?.contains(el)&&(el.type==='checkbox'?el.checked!==el.defaultChecked:el.value!==el.defaultValue));
  const assigned=users.find(x=>x.id===out.item.assignee)?.username||(out.item.assignee===user.id?user.username:out.item.assignee?'담당자 배정됨':'미배정');
  statusFeedback('success',cancellationMessage(out.item)||(confirming?'예약을 확정했습니다. 확정 예약 목록에서 관리할 수 있습니다. ':'상태가 저장되었습니다. ')+label+' · '+assigned+' · '+(out.item.contacted?'연락 완료':'연락 전'));
  // Refresh audit history separately; a failed read must not turn a successful write into a failed save.
  void api('admin/consultations/'+r.id).then(fresh=>{if(current()&&detail.item.version===out.item.version){detail.notes=fresh.notes;detail.history=fresh.history;$('#requestHistory').innerHTML=requestHistory();}}).catch(()=>{});
 }catch(err){
  if(!user){notice='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}
  else if(current())statusFeedback('error',err.status?'저장하지 못했습니다. '+err.message:'저장 결과를 확인하지 못했습니다. 인터넷 연결을 확인하고 목록에서 저장 여부를 확인해 주세요.');
 }finally{
  clearTimeout(timeout);busy=false;if(messageRoot)messageRoot.inert=false;
  if(current())root.querySelector('fieldset').disabled=false;
  paintLive();scheduleLive();
 }
}

const listNoteDrafts=new Map(),listNoteAttempts=new Map(),listNoteFeedbacks=new Map();
function listNoteEditing(){return listNoteDrafts.size>0||!!document.activeElement?.closest?.('.list-note-editor');}
function listNoteSummary(r){return (r.notes?'<div class="list-note-row"><span class="micro">고객 요청</span><p>'+e(r.notes)+'</p></div>':'')+(r.latest_note?'<div class="list-note-row"><span class="micro">최근 메모</span><div><p>'+e(r.latest_note.body)+'</p><span class="micro list-note-time">'+e(new Date(r.latest_note.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · '+e(r.note_count||1)+'건</span></div></div>':'');}
const listNoteButtonStates={saving:['refresh','메모 저장 중'],success:['check','메모 저장 완료'],error:['refresh','메모 다시 저장']};
function paintListNoteButton(button,state=''){const [name,label]=listNoteButtonStates[state]||['save','메모 저장'];button.innerHTML=detailIconContent(name,label);button.dataset.state=state;button.setAttribute('aria-label',label);button.setAttribute('title',label);}
function listNoteEditor(r){const draft=listNoteDrafts.get(r.id)||'',feedback=listNoteFeedbacks.get(r.id)||{state:'',text:draft?'작성 중 · 메모 저장을 눌러 주세요.':''},[name,label]=listNoteButtonStates[feedback.state]||['save','메모 저장'];return `<section class="list-note-editor" data-list-note-editor="${e(r.id)}" aria-label="${e(r.person)} 고객 요청 메모"><div data-list-note-summary>${listNoteSummary(r)}</div><label class="visually-hidden" for="listNote-${e(r.id)}">${e(r.person)} 고객 요청 · 상담 메모</label><div class="list-note-compose"><textarea class="admin-input" id="listNote-${e(r.id)}" data-list-note="${e(r.id)}" maxlength="4000" rows="1" placeholder="메모 추가…">${e(draft)}</textarea><button type="button" class="admin-icon-button list-note-save" data-ml="saveListNote" data-id="${e(r.id)}" data-state="${e(feedback.state)}" aria-label="${e(label)}" title="${e(label)}">${detailIconContent(name,label)}</button></div><p class="quick-status-feedback micro" data-list-note-feedback data-state="${e(feedback.state)}" role="status" aria-live="polite">${e(feedback.text)}</p></section>`;}
function listNoteFeedback(id,state,text){listNoteFeedbacks.set(id,{state,text});const el=document.querySelector('[data-list-note-editor="'+id+'"] [data-list-note-feedback]');if(el){el.dataset.state=state;el.textContent=text;}}
async function saveListNote(id){
 const r=items.find(item=>item.id===id),root=document.querySelector('[data-list-note-editor="'+id+'"]'),field=root?.querySelector('[data-list-note]');if(!r||!field||busy||composer.isBusy())return;
 const body=field.value.trim();if(!body||body.length>4000){listNoteFeedback(id,'error','메모를 1~4,000자로 입력해 주세요.');field.focus();return;}
 listNoteDrafts.set(id,field.value);let attempt=listNoteAttempts.get(id);if(!attempt||attempt.body!==body){attempt={body,noteId:crypto.randomUUID()};listNoteAttempts.set(id,attempt);}
 const actor=user,current=()=>!!user&&user===actor&&document.querySelector('[data-list-note-editor="'+id+'"]')===root;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000),save=root.querySelector('[data-ml=saveListNote]');
 suspendLive();busy=true;field.disabled=true;save.disabled=true;paintListNoteButton(save,'saving');listNoteFeedback(id,'saving','메모를 저장하고 있습니다…');paintLive();
 try{
  const out=await api('admin/consultations/'+encodeURIComponent(id)+'/notes','POST',attempt,controller.signal);if(!current())return;
  if(!out.note?.id)throw Error('저장 결과를 확인하지 못했습니다.');
  const updated={...r,latest_note:out.note,note_count:(r.note_count||0)+(r.latest_note?.id===out.note.id?0:1)};items=items.map(item=>item.id===id?updated:item);
  field.value='';listNoteDrafts.delete(id);listNoteAttempts.delete(id);root.querySelector('[data-list-note-summary]').innerHTML=listNoteSummary(updated);
  listNoteFeedback(id,'success','메모가 저장되었습니다.');paintListNoteButton(save,'success');
 }catch(err){if(!user){notice='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}else if(current()){listNoteFeedback(id,'error',err.status?'저장하지 못했습니다. '+err.message:'저장 결과를 확인하지 못했습니다. 입력 내용은 유지했습니다. 다시 저장하면 중복 없이 확인합니다.');paintListNoteButton(save,'error');}}
 finally{clearTimeout(timeout);busy=false;if(current()){field.disabled=false;save.disabled=false;}paintLive();scheduleLive();}
}
document.addEventListener('input',ev=>{const id=ev.target.dataset?.listNote;if(!id)return;if(ev.target.value)listNoteDrafts.set(id,ev.target.value);else{listNoteDrafts.delete(id);listNoteAttempts.delete(id);}listNoteFeedback(id,'',ev.target.value?'작성 중 · 메모 저장을 눌러 주세요.':'');const save=ev.target.closest('.list-note-editor')?.querySelector('[data-ml=saveListNote]');if(save)paintListNoteButton(save);});
const noteAttempts=new Map(),noteDrafts=new Map();
function noteList(){
 const notes=[...detail.notes].reverse(),card=n=>'<article class="request-note"><p>'+e(n.body)+'</p><time class="micro">'+e(new Date(n.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</time></article>';
 if(!notes.length)return '<p class="micro">저장된 상담 메모가 없습니다.</p>';
 return card(notes[0])+(notes.length>1?'<details class="detail-note-history"><summary>이전 메모 '+(notes.length-1)+'건</summary>'+notes.slice(1).map(card).join('')+'</details>':'');
}
function noteEditor(){return '<section class="request-note-editor" id="requestNoteEditor" aria-labelledby="requestNoteLabel"><h3 id="requestNoteLabel">고객 요청 · 상담 메모</h3>'+(detail.item.notes?'<div class="detail-customer-request"><span class="micro">접수 시 요청</span><p>'+e(detail.item.notes)+'</p></div>':'')+'<label class="visually-hidden" for="requestNote">새 상담 메모</label><div class="detail-note-compose"><textarea class="admin-input" id="requestNote" maxlength="4000" rows="2" placeholder="메모 추가…">'+e(noteDrafts.get(detail.item.id)||'')+'</textarea>'+detailIconButton('saveNote','save','메모 저장','icon-primary')+'</div><p id="requestNoteFeedback" class="quick-status-feedback micro" role="status" aria-live="polite"></p><div id="requestNotes">'+noteList()+'</div></section>';}
function noteFeedback(state,text){const el=$('#requestNoteFeedback');if(el){el.dataset.state=state;el.textContent=text;}}
async function saveNote(){
 const r=detail?.item,root=$('#requestNoteEditor'),field=$('#requestNote');if(!r||!root||!field||busy||composer.isBusy())return;
 const body=field.value.trim();if(!body||body.length>4000){noteFeedback('error','메모를 1~4,000자로 입력해 주세요.');field.focus();return;}
 let attempt=noteAttempts.get(r.id);if(!attempt||attempt.body!==body){attempt={body,noteId:crypto.randomUUID()};noteAttempts.set(r.id,attempt);}
 const current=()=>!!user&&detail?.item.id===r.id&&$('#requestNoteEditor')===root;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000),save=root.querySelector('[data-ml=saveNote]');
 suspendLive();busy=true;field.disabled=true;save.disabled=true;paintDetailSave(save,'saving','메모 저장');noteFeedback('saving','메모를 저장하고 있습니다…');paintLive();
 try{
  const out=await api('admin/consultations/'+r.id+'/notes','POST',attempt,controller.signal);if(!current())return;
  if(!out.note?.id)throw Error('저장 결과를 확인하지 못했습니다.');
  if(!detail.notes.some(n=>n.id===out.note.id))detail.notes.push(out.note);
  field.value='';noteAttempts.delete(r.id);noteDrafts.delete(r.id);$('#requestNotes').innerHTML=noteList();
  // Saving a memo never submits or resets assignment, status, or message edits.
  dirty=val('requestStatus')!==detail.item.status||(user.role==='admin'&&(val('requestAssignee')||null)!==(detail.item.assignee||null))||$('#requestContacted').checked!==detail.item.contacted||[...document.querySelectorAll('[id^=confirm]')].some(el=>el.type==='checkbox'?el.checked!==el.defaultChecked:el.value!==el.defaultValue);
  noteFeedback('success','메모가 저장되었습니다.');paintDetailSave(save,'success','메모 저장');
 }catch(err){if(!user){notice='로그인이 만료되었습니다. 다시 로그인해 주세요.';render();}else if(current()){noteFeedback('error',err.status?'저장하지 못했습니다. '+err.message:'저장 결과를 확인하지 못했습니다. 입력 내용은 유지했습니다. 다시 저장하면 중복 없이 확인합니다.');paintDetailSave(save,'error','메모 저장');}}
 finally{clearTimeout(timeout);busy=false;if(current()){field.disabled=false;save.disabled=false;}paintLive();scheduleLive();}
}
document.addEventListener('input',ev=>{if(ev.target.id==='requestNote'){if(detail)noteDrafts.set(detail.item.id,ev.target.value);noteFeedback('','작성 중 · 메모 저장을 눌러 주세요.');const b=$('#requestNoteEditor [data-ml=saveNote]');if(b)paintDetailSave(b,'','메모 저장');}});

function requestHistory(){return detail.history.map(n=>`<p class="micro">${e(n.action)} · ${e(n.created_at)}</p>`).join('');}

function requestDetail(){
 const r=detail.item;composer.init(r,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);
 const facts=[['희망 일정',r.preferences.map(x=>x.date+' '+x.time).join(' / ')],['장소',r.place||(r.category==='yacht'?MomentLinkPricing.location(settings):'상담 후 안내')],...(r.communication?.reservation?[['확정 일정',r.communication.booking.date+' '+r.communication.booking.time],['확정 장소',r.communication.booking.place]]:[]),['추가 선택',(r.snapshot.options||[]).map(o=>o.name+' '+o.amount.toLocaleString('ko-KR')+'원').join(', ')||'없음'],['보유기한',new Date(r.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})]];
 const price=v=>v===null?'상담 후 안내':v.toLocaleString('ko-KR')+'원';
 const messagesPanel=$('#detailMessages'),messagesOpen=messagesPanel?.dataset.requestId===r.id&&messagesPanel.open;
 return `<div class="admin-card request-detail"><div class="detail-header"><div class="detail-identity">${detailIconButton('closeDetail','back','상담 목록으로 돌아가기')}<div><h2>${e(r.person)}</h2><a class="inbox-phone" href="tel:${e(r.phone)}" aria-label="전화번호 ${e(displayPhone(r.phone))}">${e(displayPhone(r.phone))}</a><p class="micro detail-receipt">${e(r.receipt)}</p></div></div><div class="reservation-heading detail-actions" role="group" aria-label="고객 작업">${quickStatus(r)}${restorationButton(r)}<a class="admin-icon-button" href="tel:${e(r.phone)}" aria-label="전화하기" title="전화하기">${detailIconContent('phone','전화')}</a><a class="admin-icon-button" href="sms:${e(r.phone)}" aria-label="문자 앱 열기" title="문자 앱 열기">${detailIconContent('chat','문자')}</a>${detailIconButton('messageFocus','document','예약·문자 안내 열기')}${r.status!=='cancelled'&&!(r.status==='closed'&&r.communication?.reservation)?detailIconButton('reservationFocus','calendar',r.status==='confirmed'?'확정됨 · 정보 수정':'예약 확정','icon-primary'):''}${user.role==='admin'?detailIconButton('deleteRequest','trash','휴지통으로 이동','icon-danger'):''}</div></div><p id="quickStatusFeedback" class="quick-status-feedback micro" role="status" aria-live="polite" aria-atomic="true"></p><section class="detail-overview" aria-label="상담 정보"><h3>${e(r.snapshot.product.name)}</h3><p class="muted detail-package">${e(r.snapshot.package.name)}</p><dl class="detail-facts">${facts.map(([k,v])=>`<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl><div class="detail-prices" aria-label="접수 시 가격">${[['주중',r.snapshot.price.weekday],['주말',r.snapshot.price.weekend],...(r.communication?.reservation?[['최종 금액',r.communication.booking.amount]]:[])].map(([label,amount])=>`<div><span class="micro">${label}</span><strong>${e(price(amount))}</strong></div>`).join('')}</div></section><section id="requestStatusEditor" class="request-status-editor" aria-label="상담 관리"><fieldset><legend>상담 상태 저장</legend><div class="detail-status-fields"><div><label class="admin-label" for="requestStatus">상담 상태</label><select class="admin-select" id="requestStatus">${requestStatusOptions(r)}</select></div>${user.role==='admin'?'<div>'+assigneePicker(r.assignee)+'</div>':''}<div class="detail-status-actions"><label class="inline-check"><input id="requestContacted" type="checkbox" ${r.contacted?'checked':''}/> 연락 완료</label>${detailIconButton('saveRequest','save','상태 저장','icon-primary')}</div></div></fieldset><p id="requestSaveFeedback" class="request-save-feedback" role="status" aria-live="polite" aria-atomic="true"></p></section>${noteEditor()}<details class="detail-disclosure" id="detailMessages" data-request-id="${e(r.id)}" ${messagesOpen?'open':''}><summary>예약·문자 안내</summary>${composer.html()}</details>${window.MomentLinkOps.panel(r)}<details class="detail-disclosure"><summary>변경 이력</summary><div id="requestHistory">${requestHistory()}</div></details>${user.role==='admin'&&r.category!=='yacht'?`<details><summary>최종 일정 승인 · OPS 등록</summary><p class="micro">외부 OPS 등록을 위한 별도 기능입니다. 모먼트링크 예약 확정은 위의 ‘예약 확정’ 버튼을 사용합니다.</p>${input('confirmDate','최종 날짜',r.preferences[0].date,'date')}${input('confirmTime','최종 시간','','time')}${input('confirmDuration','진행 시간(분)','','number')}${input('confirmAmount','최종 금액(원)','','number')}${input('confirmPlace','확정 장소',r.place)}${input('confirmResource','대상 OPS 자원 ID','')}<label class="inline-check"><input type="checkbox" id="confirmApproved"/> 최종 일정·상품·장소·금액을 확인하고 승인합니다.</label>${button('confirm','승인 및 연동 작업 생성')}</details>`:''}</div>`;
}
function listedProducts(){return products.filter(p=>(productCategory==='all'||p.category===productCategory)&&(productState==='all'||(productState==='archived'?p.archived:!p.archived)));}
function selectListedProduct(){const list=listedProducts();editId=list.find(p=>p.id===editId)?.id||list[0]?.id||'';}
const productPanels=new Map();
function rememberProductPanels(){document.querySelectorAll('[data-catalog-panel]').forEach(el=>productPanels.set(el.dataset.catalogPanel,el.open));}
const catalogPanelOpen=(key,fallback=false)=>(productPanels.has(key)?productPanels.get(key):fallback)?'open':'';
function catalogAction(action,name,label,caption=label,{index,disabled=false,primary=false,danger=false}={}){return '<button type="button" class="admin-icon-button '+(primary?'icon-primary':'')+' '+(danger?'icon-danger':'')+'" data-ml="'+action+'" '+(index===undefined?'':'data-index="'+index+'"')+' aria-label="'+e(label)+'" title="'+e(label)+'" '+(busy||disabled?'disabled':'')+'>'+icon(name)+'<span class="admin-action-text">'+e(caption)+'</span></button>';}
function catalogSaveActions(){return catalogAction('saveDraft','save','초안 저장')+catalogAction('publish','publish','저장 및 게시','저장·게시',{primary:true});}
function catalogPackagePrice(p,g){const money=n=>Number.isInteger(n)?n.toLocaleString('ko-KR')+'원':'상담 후 안내';return p.category==='yacht'&&p.sub==='sail'?'<span>주중 <strong>'+money(g.weekday)+'</strong></span><span>주말 <strong>'+money(g.weekend)+'</strong></span>':'<span><strong>'+money(g.weekday)+'</strong></span>'+(g.weekend!==null&&g.weekend!==g.weekday?'<span>대체 <strong>'+money(g.weekend)+'</strong></span>':'');}
function productPackageEditor(p,g,i){
 const key='pack:'+g.id;
 return '<details class="catalog-package" data-catalog-panel="'+e(key)+'" '+catalogPanelOpen(key,i===0)+'><summary><span class="catalog-package-name"><span class="micro">패키지 '+(i+1)+'</span><strong>'+e(g.name||'패키지명 입력')+'</strong></span><span class="catalog-package-prices">'+catalogPackagePrice(p,g)+'</span></summary><div class="catalog-package-body"><div class="catalog-package-actions">'+catalogAction('removePack','archive','패키지 '+(i+1)+' 보관','보관',{index:i,disabled:p.packages.length<=1,danger:true})+'</div><div class="catalog-field-grid"><div>'+input('packName_'+i,'패키지명',g.name)+'</div><div>'+input('packSummary_'+i,'짧은 안내',g.summary)+'</div><div>'+input('packWeek_'+i,p.category==='yacht'&&p.sub==='sail'?'주중 가격 (원)':'판매가격 (원)',g.weekday??'','number')+'</div><div>'+input('packWeekend_'+i,p.category==='yacht'&&p.sub==='sail'?'주말 가격 (원)':'대체 가격 (빈칸이면 동일)',g.weekend??'','number')+'</div><div>'+area('packFeatures_'+i,'포함 항목 · 한 줄에 하나',g.features.join('\n'))+'</div><div>'+area('packExcluded_'+i,'미포함 항목 · 확인된 항목만',(g.excludedFeatures||[]).join('\n'))+'</div><div>'+input('packNote_'+i,'추가 안내',g.note)+'</div><div>'+input('packDuration_'+i,'이용 시간 (분)',g.durationMinutes??'','number')+'<p class="micro catalog-field-help">미확정이면 빈칸으로 두세요.</p></div></div><details class="catalog-advanced" data-catalog-panel="'+e(key+':options')+'" '+catalogPanelOpen(key+':options')+'><summary>추가 옵션 · 날짜별 가격</summary><div class="catalog-field-grid"><div>'+area('packOptions_'+i,'추가 선택사항',(g.options||[]).map(o=>o.id+'|'+o.name+'|'+o.amount+'|'+(o.group||'')+'|'+(o.requiresOptionId||'')).join('\n'))+'<p class="micro catalog-field-help">한 줄에 옵션ID|옵션명|추가금액|택1 그룹|선행 옵션ID<br/>그룹과 선행 옵션은 필요한 경우에만 입력하세요.</p></div><div>'+area('packDates_'+i,'특정일 확정 가격',(g.datePrices||[]).map(x=>x.date+'='+(x.amount??'')).join('\n'))+'<p class="micro catalog-field-help">한 줄에 YYYY-MM-DD=금액<br/>미정 금액은 등호 뒤를 비워 두세요.</p></div></div></details></div></details>';
}
function productEditor(){
 rememberProductPanels();const p=products.find(x=>x.id===editId),list=listedProducts(),position=products.indexOf(p);
 return '<section class="catalog-manager" aria-label="상품 관리"><div class="catalog-toolbar"><p class="micro">초안으로 저장한 뒤 게시하면 고객 화면에 적용됩니다.<br/>과거 접수의 상품·가격은 그대로 보존됩니다.</p><div class="catalog-actions" role="group" aria-label="상단 상품 저장">'+catalogSaveActions()+'</div></div><div class="catalog-browser"><div class="catalog-field-grid catalog-filters"><div><label class="admin-label" for="productCategory">상품 분야</label><select class="admin-select" id="productCategory"><option value="all" '+(productCategory==='all'?'selected':'')+'>전체 분야</option>'+Object.entries(categories).map(([id,n])=>'<option value="'+id+'" '+(productCategory===id?'selected':'')+'>'+n+'</option>').join('')+'</select></div><div><label class="admin-label" for="productState">상품 상태</label><select class="admin-select" id="productState">'+[['active','운영 상품'],['archived','보관된 상품'],['all','전체 상품']].map(([id,n])=>'<option value="'+id+'" '+(productState===id?'selected':'')+'>'+n+' ('+products.filter(p=>(productCategory==='all'||p.category===productCategory)&&(id==='all'||(id==='archived'?p.archived:!p.archived))).length+')</option>').join('')+'</select></div></div><div class="catalog-product-list" role="group" aria-label="편집할 상품 선택">'+(list.map(p=>'<button type="button" class="catalog-product-choice" data-ml="edit" data-id="'+e(p.id)+'" aria-label="상품 선택: '+e(p.name)+'" aria-pressed="'+(p.id===editId)+'"><span class="catalog-choice-copy"><span class="micro">'+e(categories[p.category])+'</span><strong>'+e(p.name)+'</strong></span><span class="catalog-product-state">'+(p.archived?'보관':p.salePaused?'판매 중지':p.visible?'노출':'숨김')+'</span></button>').join('')||'<p class="empty">해당하는 상품이 없습니다. 분야나 상태를 바꿔 확인해 주세요.</p>')+'</div><details class="catalog-new" data-catalog-panel="newProduct" '+catalogPanelOpen('newProduct')+'><summary>새 상품 추가</summary><div class="catalog-new-fields"><div><label class="admin-label" for="newCategory">추가할 상품 분야</label><select class="admin-select" id="newCategory">'+Object.entries(categories).map(([id,n])=>'<option value="'+id+'" '+(productCategory===id?'selected':'')+'>'+n+'</option>').join('')+'</select></div>'+catalogAction('addProduct','plus','새 상품 만들기','상품 추가')+'</div></details></div>'+
 (p?'<section class="admin-card catalog-editor" id="mlProductEditor" aria-label="선택한 상품 편집"><header class="catalog-editor-heading"><div><span class="micro">'+e(categories[p.category])+'</span><h2>'+e(p.name||'새 상품')+'</h2></div><div class="catalog-actions" role="group" aria-label="상품 순서와 보관">'+(p.archived?catalogAction('restore','refresh','상품 복원','복원'):catalogAction('moveUp','up','상품 위로 이동','위로',{disabled:position<=0})+catalogAction('moveDown','down','상품 아래로 이동','아래로',{disabled:position===products.length-1})+catalogAction('archive','archive','상품 보관','보관',{danger:true}))+'</div></header>'+(p.archived?'<p class="catalog-info">보관된 상품입니다. 복원 후 저장·게시하면 고객 화면에 다시 표시됩니다.</p>':'')+'<div class="catalog-visibility"><label class="inline-check"><input type="checkbox" id="editVisible" '+(p.visible?'checked':'')+' '+(p.archived?'disabled':'')+'/> 고객에게 노출</label><label class="inline-check"><input type="checkbox" id="editPaused" '+(p.salePaused?'checked':'')+'/> 판매 중지 · 설명만 표시</label><label class="inline-check"><input type="checkbox" id="editBouquet" '+(p.bouquet?'checked':'')+'/> 올인원 꽃다발 포함</label></div><section class="catalog-section" aria-labelledby="catalogBasicHeading"><h3 id="catalogBasicHeading">기본 정보</h3><div class="catalog-field-grid"><div>'+input('editName','상품명',p.name)+'</div><div><label class="admin-label" for="editSub">하위 상품</label><select class="admin-select" id="editSub">'+(p.category==='yacht'?[['sail','출항형'],['dock','정박형']]:[['main','기본']]).map(([id,n])=>'<option value="'+id+'" '+(p.sub===id?'selected':'')+'>'+n+'</option>').join('')+'</select></div><div class="catalog-wide">'+input('editShort','카드 요약 설명',p.short)+'</div><div class="catalog-wide">'+area('editDescription','상세 상품 설명',p.description)+'</div></div></section><details class="catalog-section catalog-photos" data-catalog-panel="'+e(p.id+':photos')+'" '+catalogPanelOpen(p.id+':photos')+'><summary>사진 관리 <span class="micro">'+(p.media||[]).length+' / 12</span></summary><div class="catalog-field-grid"><div class="catalog-wide">'+input('editPhoto','대표사진 URL',p.photo)+'</div><div><span class="admin-label">사진 업로드</span>'+catalogAction('chooseProductPhoto','publish','상품 사진 업로드','사진 추가')+'<input class="visually-hidden" type="file" id="photoFile" aria-label="상품 사진 파일" tabindex="-1" accept="image/png,image/jpeg,image/webp"/><p class="micro catalog-field-help">1MB 이하 · 업로드 시 WebP로 변환</p></div><div>'+input('photoAlt','업로드할 사진 설명',p.name+' 대표사진')+'</div></div><p class="micro catalog-field-help">사진 목록 첫 항목이 대표사진입니다. 최대 12장까지 등록할 수 있습니다.</p><div class="catalog-media-list">'+(p.media||[]).map((m,i)=>'<div class="catalog-media-item"><div class="catalog-media-fields"><span class="micro">사진 '+(i+1)+(i===0?' · 대표사진':'')+'</span>'+input('mediaAlt_'+i,'사진 '+(i+1)+' 설명',m.alt)+'<p class="micro catalog-media-url">'+e(m.url)+'</p></div><div class="catalog-actions">'+catalogAction('mediaUp','up','사진 '+(i+1)+' 위로 이동·대표 지정','위로',{index:i,disabled:i===0})+catalogAction('mediaRemove','close','사진 '+(i+1)+' 목록에서 제거','제거',{index:i,danger:true})+'</div></div>').join('')+'</div></details><section class="catalog-section" aria-labelledby="catalogPackagesHeading"><div class="catalog-section-heading"><div><h3 id="catalogPackagesHeading">패키지 <span class="micro">'+p.packages.length+'</span></h3><p class="micro">가격과 구성을 선택해 편집하세요.</p></div>'+catalogAction('addPack','plus','패키지 추가','추가')+'</div><div class="catalog-packages">'+p.packages.map((g,i)=>productPackageEditor(p,g,i)).join('')+'</div></section></section>':'')+'<footer class="catalog-toolbar catalog-footer"><p class="micro">변경 내용을 저장해 주세요.<br/>보관한 상품은 ‘보관된 상품’에서 복원할 수 있습니다.</p><div class="catalog-actions" role="group" aria-label="하단 상품 저장">'+catalogSaveActions()+'</div></footer></section>';
}

const notificationPanels=new Map();
const notificationFields=['smsNumber','mainNumber','adminSms','customerTemplate','adminTemplate','completionText','manualSmsTemplate'];
function captureNotificationSettings(){const root=document.getElementById('notificationSettings');if(!root)return;root.querySelectorAll('[data-setting]').forEach(n=>settings[n.dataset.setting]=n.checked);for(const key of notificationFields)settings[key]=val(key);}
function notificationTemplate(key,title,help,text,{open=false,hint=''}={}){const expanded=notificationPanels.has(key)?notificationPanels.get(key):open;return '<details class="notification-template" data-notification-panel="'+key+'" '+(expanded?'open':'')+'><summary><span><strong>'+e(title)+'</strong><span class="micro">'+e(help)+'</span></span></summary><div class="notification-template-body"><label class="visually-hidden" for="'+key+'">'+e(title+' 문구')+'</label><textarea class="admin-input" id="'+key+'" rows="4">'+e(text)+'</textarea>'+(hint?'<p class="micro notification-hint">'+e(hint)+'</p>':'')+'</div></details>';}
function settingsPanel(){
 document.querySelectorAll('[data-notification-panel]').forEach(el=>notificationPanels.set(el.dataset.notificationPanel,el.open));
 const switches=[['solapi','SOLAPI 전체 사용','문자 발송 기능 전체 사용'],['customerAuto','고객 접수 문자','상담 접수 후 고객에게 안내'],['adminAuto','관리자 접수 문자','새 상담을 관리자 번호로 안내'],['push','관리자 PWA 푸시','구독한 기기로 새 상담 알림']];
 const save=()=>detailIconButton('saveSettings','save','설정 저장','icon-primary');
 return '<section class="notification-manager" aria-label="문자·알림 설정"><div class="notification-toolbar"><p class="micro">알림 사용 여부와 연락처·안내 문구를 관리하세요.</p>'+save()+'</div><div id="notificationSettings" class="notification-settings"><section class="admin-card notification-card" aria-labelledby="notificationDeliveryHeading"><div class="notification-section-heading"><h2 id="notificationDeliveryHeading">발송 설정</h2><div class="notification-gates" aria-label="서버 발송 허용"><span class="micro">서버 허용</span>'+[['sms','문자'],['push','푸시']].map(([key,name])=>'<span class="notification-gate" data-enabled="'+!!gates[key]+'">'+icon(gates[key]?'check':'pause')+name+' '+(gates[key]?'ON':'OFF')+'</span>').join('')+'</div></div><fieldset class="notification-switches"><legend class="visually-hidden">사용할 알림</legend>'+switches.map(([key,title,help])=>'<label class="notification-toggle"><input data-setting="'+key+'" type="checkbox" '+(settings[key]?'checked':'')+'/><span><strong>'+title+'</strong><span class="micro">'+help+'</span></span></label>').join('')+'</fieldset><p class="micro notification-hint">서버 허용과 각 항목의 설정에 따라 발송됩니다. 꺼져 있던 기간의 접수는 나중에 소급 발송하지 않습니다.</p></section><section class="admin-card notification-card" aria-labelledby="notificationContactHeading"><h2 id="notificationContactHeading">연락처</h2><div class="notification-contact-grid"><div>'+input('smsNumber','문자 발신·수신 번호',settings.smsNumber,'tel')+'</div><div>'+input('mainNumber','대표번호',settings.mainNumber,'tel')+'</div><div>'+input('adminSms','관리자 알림 수신번호',settings.adminSms,'tel')+'</div></div></section><section class="admin-card notification-card" aria-labelledby="notificationTemplatesHeading"><div class="notification-section-heading"><h2 id="notificationTemplatesHeading">안내 문구</h2><span class="micro">펼쳐서 편집</span></div><div class="notification-templates">'+notificationTemplate('customerTemplate','고객 접수 문자','접수 후 고객에게 보내는 자동 문자',settings.customerTemplate,{open:true,hint:'{receipt} 자리에 접수번호가 들어갑니다.'})+notificationTemplate('adminTemplate','관리자 접수 문자','새 상담을 알리는 관리자용 자동 문자',settings.adminTemplate)+notificationTemplate('completionText','접수 완료 안내문','고객의 신청 완료 화면에 표시',settings.completionText||'신청 내용이 저장되었습니다. 고객 문자 발송은 선택사항입니다.')+notificationTemplate('manualSmsTemplate','고객 수동 문자','고객이 직접 문자 앱에서 보내는 문구',settings.manualSmsTemplate||'',{hint:'빈칸이면 기본 문구를 사용합니다. 고객 관점의 문장으로 작성하세요. 사용 가능: {receipt}, {name}, {phone}, {selection}, {price}, {first}, {second}, {place}, {notes}'})+'</div></section><div class="notification-toolbar notification-save-row"><p class="micro">사용 설정·연락처·안내 문구를 함께 저장합니다.</p>'+save()+'</div></div><section class="admin-card notification-card notification-device" aria-labelledby="notificationDeviceHeading"><div><h2 id="notificationDeviceHeading">이 기기 알림</h2><p class="micro">푸시 구독과 알림 권한은 기기마다 설정합니다. 아이폰·아이패드는 홈 화면에 설치한 앱에서 로그인한 뒤 구독해 주세요.</p></div><div class="notification-device-actions" role="group" aria-label="이 기기 푸시 관리">'+detailIconButton('subscribe','bell','이 기기 푸시 구독')+detailIconButton('unsubscribe','bellOff','푸시 구독 해제')+'</div></section></section>';
}

const placePanels=new Map();
function placePanelKey(place,index){return place.id||'location-'+index;}
function placeEditor(place,index){
 const key=placePanelKey(place,index),open=placePanels.has(key)?placePanels.get(key):index===0;
 const removeLabel=(place.name||'장소 '+(index+1))+' 안내 목록에서 제거';
 return '<details class="place-item" data-place-panel="'+e(key)+'" '+(open?'open':'')+'><summary><span class="place-item-copy"><span class="micro">'+e(categories[place.category]||'장소')+'</span><strong>'+e(place.name||'이름 없는 장소')+'</strong></span><span class="place-state" data-confirmed="'+(place.status==='confirmed')+'">'+(place.status==='confirmed'?'확정 안내':'후보 · 미확정')+'</span></summary><div class="place-item-body"><div class="place-field-grid"><div>'+input('locationName_'+index,'장소명',place.name)+'</div><div><label class="admin-label" for="locationCategory_'+index+'">분야</label><select class="admin-select" id="locationCategory_'+index+'">'+Object.entries(categories).map(([id,name])=>'<option value="'+id+'" '+(place.category===id?'selected':'')+'>'+e(name)+'</option>').join('')+'</select></div><div><label class="admin-label" for="locationStatus_'+index+'">장소 상태</label><select class="admin-select" id="locationStatus_'+index+'"><option value="candidate" '+(place.status==='candidate'?'selected':'')+'>후보 · 미확정</option><option value="confirmed" '+(place.status==='confirmed'?'selected':'')+'>확정 안내 장소</option></select></div><div>'+input('locationContact_'+index,'현장 연락처',place.contact,'tel')+'</div><div class="place-wide">'+input('locationAddress_'+index,'상세 주소',place.address)+'</div><div class="place-wide">'+input('locationMap_'+index,'지도 URL · https',place.mapUrl,'url')+'</div><div class="place-wide">'+input('locationParking_'+index,'주차 안내',place.parking)+'</div></div><footer class="place-item-footer"><p class="micro">제거한 장소는 안내 저장 후 목록에 반영됩니다.</p><button type="button" class="admin-icon-button icon-danger" data-ml="removeLocation" data-index="'+index+'" aria-label="'+e(removeLabel)+'" title="'+e(removeLabel)+'" '+(busy?'disabled':'')+'>'+detailIconContent('close','제거')+'</button></footer></div></details>';
}
function places(){
 document.querySelectorAll('[data-place-panel]').forEach(el=>placePanels.set(el.dataset.placePanel,el.open));
 const locations=settings.locations||[],save=()=>detailIconButton('savePlaces','save','장소 안내 저장','icon-primary');
 return '<section class="place-manager" aria-label="장소 안내 설정"><div class="place-toolbar"><p class="micro">기본 안내와 장소별 정보를 관리하세요.</p>'+save()+'</div><section class="admin-card place-card" aria-labelledby="placeDefaultsHeading"><h2 id="placeDefaultsHeading">기본 안내</h2><div class="place-default-section"><h3>요트 승선 안내</h3><div class="place-field-grid"><div>'+input('yachtPlace','요트 승선 지점',settings.yachtPlace)+'</div><div>'+input('yachtAddress','요트 주소·주차 안내',settings.yachtAddress)+'</div></div></div><div class="place-default-section"><h3>헬기 후보지</h3><div class="place-field-grid"><div>'+input('heliGunsan','군산 후보 장소',settings.heliGunsan)+'</div><div>'+input('heliByeonsan','변산 후보 장소',settings.heliByeonsan)+'</div></div><p class="micro place-hint">헬기 후보지는 최종 확정 장소와 구분해 안내합니다.</p></div></section><section class="admin-card place-card" aria-labelledby="placeListHeading"><div class="place-section-heading"><div><h2 id="placeListHeading">장소 목록 <span class="micro">'+locations.length+'</span></h2><p class="micro">장소를 펼쳐 상세 정보를 편집하세요.</p></div>'+detailIconButton('addLocation','plus','장소 추가')+'</div><div class="place-items">'+(locations.length?locations.map(placeEditor).join(''):'<p class="place-empty">등록된 장소가 없습니다.<br/>장소 추가로 안내할 장소를 등록하세요.</p>')+'</div></section><footer class="place-toolbar place-save-row"><p class="micro">추가·수정·제거한 내용은 안내 저장을 누르면 반영됩니다.</p>'+save()+'</footer></section>';
}
const privacyFields=['privacyController','privacyContact','retentionDays','privacyText','consentVersion','accepting'];
function capturePrivacySettings(){if(!document.getElementById('privacySettings'))return;for(const key of privacyFields)settings[key]=key==='retentionDays'?(val(key)===''?null:Number(val(key))):key==='accepting'?document.getElementById(key).checked:val(key);}
function privacy(){
 const save=()=>detailIconButton('savePrivacy','save','접수 설정 저장','icon-primary');
 return '<section class="privacy-manager" aria-label="접수·개인정보 설정"><div class="privacy-toolbar"><p class="micro">접수 사용 여부와 개인정보 안내를 관리하세요.</p>'+save()+'</div><div id="privacySettings"><section class="admin-card privacy-card" aria-labelledby="privacyIntakeHeading"><h2 id="privacyIntakeHeading">상담 접수</h2><label class="privacy-intake-toggle"><input type="checkbox" id="accepting" '+(settings.accepting?'checked':'')+'/><span><strong>상담 접수 사용</strong><span class="micro">안내문을 확정하고 실제 상담 접수를 시작합니다.</span></span></label><p class="micro privacy-hint">변경 내용은 설정 저장 후 적용됩니다.</p></section><section class="admin-card privacy-card" aria-labelledby="privacyContactHeading"><h2 id="privacyContactHeading">처리 주체·문의</h2><div class="privacy-field-grid"><div>'+input('privacyController','개인정보 처리 주체',settings.privacyController)+'</div><div>'+input('privacyContact','문의 연락처',settings.privacyContact)+'</div></div></section><section class="admin-card privacy-card" aria-labelledby="privacyPolicyHeading"><h2 id="privacyPolicyHeading">보유기간·안내문</h2><p class="micro privacy-policy-note">안내문 수정은 새 접수부터 적용됩니다. 기존 접수는 동의 당시 보유기한을 유지합니다.</p><div class="privacy-field-grid"><div>'+input('retentionDays','개인정보 보유기간(일)',settings.retentionDays??'','number')+'</div><div>'+input('consentVersion','안내문 버전',settings.consentVersion)+'</div><div class="privacy-wide">'+area('privacyText','개인정보 수집·이용 안내문',settings.privacyText)+'</div></div></section><div class="privacy-toolbar privacy-save-row"><p class="micro">접수 설정과 개인정보 안내를 함께 저장합니다.</p>'+save()+'</div></div><section class="admin-card privacy-card privacy-retention" aria-labelledby="privacyRetentionHeading"><div><h2 id="privacyRetentionHeading">만료 정보 관리</h2><p class="micro">보유기간 만료 시 조회를 차단하고 매일 자동 정리합니다.</p><p class="micro">만료 개인정보 정리 버튼으로 만료 상담과 관련 개인정보를 정리할 수 있습니다.</p></div>'+detailIconButton('retention','trash','만료 개인정보 정리','icon-danger')+'</section></section>';
}
const opsStateLabels={pending:'대기',blocked:'보류',checking:'확인 중',failed:'실패',uncertain:'확인 필요',conflict:'충돌',succeeded:'등록 완료',sending:'발송 중',sent:'발송 접수'};
function opsJobRow(job,kind){
 const integration=kind==='integration',name=integration?(job.target==='boatn'?'BOATN OPS':job.target||'OPS'):({sms_customer:'고객 문자',sms_admin:'관리자 문자',push:'푸시 알림'}[job.channel]||job.channel||'알림');
 const restoring=integration&&job.operation==='restore',cancelling=integration&&['cancel','restore'].includes(job.operation),verb=restoring?'복원':'취소',label=cancelling?(Number(job.attempts||0)>=2?verb+' 결과 조회':verb+' 상태 확인'):integration?'상태 확인 / 안전 재시도':'상태 확인 / 재시도',tone=['succeeded','sent'].includes(job.state)?'success':['failed','conflict','uncertain'].includes(job.state)?'attention':'neutral';
 return '<li class="ops-job"><div class="ops-job-copy"><div class="ops-job-heading"><strong>'+e(name+(cancelling?' · 예약 '+verb:''))+'</strong><span class="ops-job-state" data-tone="'+tone+'" title="'+e(job.state)+'">'+e(cancelling&&job.state==='succeeded'?verb+' 반영 완료':opsStateLabels[job.state]||job.state||'상태 미확인')+'</span></div>'+(integration?'<p class="ops-job-meta"><span>예약 ID</span><span>'+e(job.external_id||'미등록')+'</span></p>':'')+(job.error_code?'<p class="ops-job-code"><span>상세 코드</span><code>'+e(job.error_code)+'</code></p>':'')+'</div><div class="ops-job-actions"><button type="button" class="admin-icon-button" data-ml="runJob" data-kind="'+kind+'" data-id="'+e(job.id)+'" aria-label="'+e(name+' '+label)+'" title="'+e(label)+'" '+(busy||job.operation==='inbound'||cancelling&&['succeeded','conflict'].includes(job.state)?'disabled':'')+'>'+detailIconContent('refresh',label)+'</button></div></li>';
}
function ops(){
 const integrations=jobs.integrations||[],notifications=jobs.notifications||[];
 return '<section class="ops-manager" aria-label="OPS 연동 관리"><div class="ops-toolbar"><div class="ops-gate-copy"><span class="ops-gate" data-enabled="'+!!gates.ops+'">'+icon(gates.ops?'check':'pause')+'OPS 쓰기 '+(gates.ops?'ON':'OFF')+'</span><p class="micro">'+(gates.ops?'OPS 연동 쓰기가 허용되어 있습니다.':'OPS 연동은 보류 중입니다.')+'</p></div>'+detailIconButton('refreshJobs','refresh','목록 새로고침')+'</div><details class="ops-guide"><summary>연동 안내</summary><p class="micro">연동 활성화 시 클래식·프리미엄·시그니처 요트는 예약 확정 시 BOATN OPS에 자동 등록합니다. 정박 상품은 실제 요트를 정한 뒤 OPS에서 직접 등록해 주세요. 헬기·출장·트렁크는 아직 자동 연동하지 않습니다.</p></details><section class="admin-card ops-card" aria-labelledby="opsIntegrationHeading"><div class="ops-section-heading"><h2 id="opsIntegrationHeading">연동 작업 <span class="micro">'+integrations.length+'</span></h2></div>'+(integrations.length?'<ul class="ops-job-list">'+integrations.map(job=>opsJobRow(job,'integration')).join('')+'</ul>':'<p class="ops-empty">연동 작업 없음</p>')+'</section><section class="admin-card ops-card" aria-labelledby="opsNotificationHeading"><div class="ops-section-heading"><h2 id="opsNotificationHeading">알림 작업 <span class="micro">'+notifications.length+'</span></h2></div>'+(notifications.length?'<ul class="ops-job-list">'+notifications.map(job=>opsJobRow(job,'notification')).join('')+'</ul>':'<p class="ops-empty">발송 작업 없음</p>')+'</section></section>';
}

function deletionConfirmation(){const p=deletionPrompt;if(!p)return '';return `<div class="info deletion-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="deletionTitle" aria-describedby="deletionMessage"><h2 id="deletionTitle">${p.permanent?'영구 삭제 확인':'휴지통 이동 확인'}</h2><p id="deletionMessage">${e(p.message)}</p><div class="btnrow">${button('cancelDeletion','취소')}<button class="primary" data-ml="approveDeletion" data-kind="${p.kind}" data-id="${e(p.id||'')}" ${busy?'disabled':''}>${p.permanent?'영구 삭제':'휴지통으로 이동'}</button></div></div>`;}
function render(){if(!location.hash.startsWith('#admin'))return;let content=login();if(user){content=user.mustChangePassword?`<main class="layout"><section class="page">${passwordPanel()}</section></main>`:`<main class="admin"><div class="admin-layout"><aside class="admin-menu" aria-label="관리자 메뉴">${Object.entries(tabs).filter(([id])=>id!=='trash'&&(user.role==='admin'||id==='inbox'||id==='reservations'||id==='users')).map(([id,n])=>`<button class="tab" data-ml="tab" data-tab="${id}" ${(tab===id||tab==='trash'&&id==='inbox')?'aria-current="page"':''}>${id==='users'&&user.role!=='admin'?'내 계정':n}</button>`).join('')}</aside><section class="admin-section"><div class="status-top"><div><div class="title">${tab==='users'&&user.role!=='admin'?'내 계정':tabs[tab]}</div><div class="micro">${e(user.username)} · ${user.role==='admin'?'관리자':'상담자'}</div></div><span class="badge">${user.role==='admin'?'관리자':'상담자'}</span></div>${liveBar()}${({inbox,reservations:inbox,trash,products:productEditor,settings:settingsPanel,places,privacy,ops,users:staff}[tab])()}</section></div></main>`;}$('#app').innerHTML=`<div class="shell">${header()}${notice?`<p class="info" role="status">${e(notice)}</p>`:''}${content}${deletionPrompt?'<div class="deletion-backdrop">'+deletionConfirmation()+'</div>':''}</div>`;paintLive();scheduleLive();window.MomentLinkOps.mount(detail?.item,api);if(deletionPrompt)$('#deletionTitle')?.closest('[role=alertdialog]')?.querySelector('button')?.focus();}
async function load(){if(!user||user.mustChangePassword)return;if(['inbox','reservations','trash'].includes(tab)){const publicCatalog=await api('catalog');settings={...settings,yachtPlace:publicCatalog.settings.yachtPlace,yachtAddress:publicCatalog.settings.yachtAddress};const result=await api('admin/consultations?q='+encodeURIComponent(search)+'&offset='+offset+'&view='+(tab==='inbox'?'all':tab)+'&status='+(tab==='trash'?'all':tab==='reservations'?reservationStatus:requestStatus));items=result.items;counts=result.counts;trashBefore=result.trashBefore;if(user.role==='admin')users=(await api('admin/users')).items;}if(tab==='products'){const d=await api('admin/catalog');products=d.draft.data;draftVersion=d.draft.version;selectListedProduct();}if(['settings','places','privacy','ops'].includes(tab)){const d=await api('admin/settings');settings=d.settings.data;settingsVersion=d.settings.version;gates=d.gates;gates.vapid=d.vapidPublicKey;}if(tab==='ops')jobs=await api('admin/jobs');if(tab==='users'&&user.role==='admin')users=(await api('admin/users')).items;}
function captureProduct(){const p=products.find(x=>x.id===editId);if(!p||!$('#editName'))return;p.name=val('editName').trim();p.short=val('editShort');p.description=val('editDescription');p.photo=val('editPhoto');p.salePaused=$('#editPaused').checked;(p.media||[]).forEach((m,i)=>m.alt=val('mediaAlt_'+i));if(p.media?.length&&p.photo)p.media[0].url=p.photo;p.sub=val('editSub');p.visible=$('#editVisible').checked;p.bouquet=$('#editBouquet').checked;p.packages.forEach((g,i)=>{g.name=val('packName_'+i).trim();g.summary=val('packSummary_'+i);const a=val('packWeek_'+i),b=val('packWeekend_'+i);g.weekday=a===''?null:Number(a);g.weekend=b===''?g.weekday:Number(b);g.features=val('packFeatures_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);g.excludedFeatures=val('packExcluded_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);g.note=val('packNote_'+i);g.durationMinutes=val('packDuration_'+i)===''?null:Number(val('packDuration_'+i));g.options=val('packOptions_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const [id,name,amount,group,requiresOptionId]=line.split('|').map(x=>x.trim());return {id,name,amount:Number(amount),...(group?{group}:{}),...(requiresOptionId?{requiresOptionId}:{})};});g.datePrices=val('packDates_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>{const [date,amount]=x.split('=');return {date,amount:amount===''?null:Number(amount)};});});}
function capturePlaces(){for(const k of ['yachtPlace','yachtAddress','heliGunsan','heliByeonsan'])settings[k]=val(k);(settings.locations||[]).forEach((l,i)=>{l.name=val('locationName_'+i);l.category=val('locationCategory_'+i);l.status=val('locationStatus_'+i);l.address=val('locationAddress_'+i);l.mapUrl=val('locationMap_'+i);l.parking=val('locationParking_'+i);l.contact=val('locationContact_'+i);});}
async function saveSettings(fields){for(const k of fields)settings[k]=k==='retentionDays'?(val(k)===''?null:Number(val(k))):k==='accepting'?$('#accepting').checked:val(k);const out=await api('admin/settings','PUT',{version:settingsVersion,data:settings});settingsVersion=out.version;dirty=false;notice='서버에 저장했습니다.';}
async function followRequest(){const id=location.hash.match(/^#admin\/request\/([a-f0-9-]{36})$/)?.[1];if(user&&!user.mustChangePassword&&id){tab='inbox';await load();detail=await api('admin/consultations/'+id);}}
async function mount(){suspendLive();notice='';try{const s=await api('auth/session');if(user?.id!==s.user?.id)resetLive();user=s.user;anti=s.csrf||'';await load();await followRequest();}catch(err){notice=err.message;}render();}
function clear(){listNoteDrafts.clear();listNoteAttempts.clear();listNoteFeedbacks.clear();noteAttempts.clear();noteDrafts.clear();Object.assign(listStatusState,{id:'',confirmationId:'',saving:false});resetLive();composer.clear();direct.close();user=null;anti='';items=[];detail=null;dirty=false;}
document.addEventListener('ml:reservation-confirmed',ev=>{tab='reservations';reservationStatus='confirmed';offset=0;search='';notice=ev.detail?.message||'예약을 확정했습니다. 확정 예약 목록에서 일정과 문자를 관리할 수 있습니다.';render();});
document.addEventListener('ml:ops-cancellation-synced',ev=>{if(detail?.item.id!==ev.detail?.item?.id||busy||dirty||composer.isBusy()||composer.isDirty())return;detail.item=ev.detail.item;composer.clear();notice=cancellationMessage(ev.detail.item);render();});
document.addEventListener('ml:ops-restoration-synced',ev=>{if(detail?.item.id!==ev.detail?.item?.id||busy||dirty||composer.isBusy()||composer.isDirty())return;detail.item=ev.detail.item;composer.clear();notice=restorationMessage(ev.detail.item);render();});
document.addEventListener('ml:ops-schedule-synced',ev=>{if(detail?.item.id!==ev.detail?.item?.id||busy||dirty||composer.isBusy()||composer.isDirty())return;detail.item=ev.detail.item;composer.clear();notice='수정·확정했습니다. 변경한 일정이 OPS에도 반영되었습니다.';render();composer.openStage('confirmed');});
document.addEventListener('submit',async ev=>{if(ev.target.id==='requestSearchForm'){ev.preventDefault();if(busy)return;if(listStatusState.confirmationId&&!confirm('작성 중인 예약 확정 정보를 닫고 검색할까요?'))return;listStatusState.confirmationId='';suspendLive();busy=true;search=val('requestSearch').trim();offset=0;notice='';try{await load();}catch(err){notice=err.message;}finally{busy=false;render();}return;}if(ev.target.id!=='mlLogin')return;ev.preventDefault();if(busy)return;suspendLive();const credentials={username:val('loginUser'),password:val('loginPassword')};busy=true;notice='';try{const s=await api('auth/login','POST',credentials);resetLive();user=s.user;anti=s.csrf;tab='inbox';await load();await followRequest();}catch(err){notice=err.message;}finally{busy=false;render();}});
document.addEventListener('change',ev=>{if(location.hash.startsWith('#admin')&&['requestStatus','requestContacted'].includes(ev.target.id))statusEdited();});
document.addEventListener('input',ev=>{if(location.hash.startsWith('#admin')&&ev.target.closest('.admin-card')&&!ev.target.closest('#messageComposer')&&!ev.target.closest('.list-confirmation')&&!ev.target.closest('.list-note-editor'))dirty=true;});
document.addEventListener('click',async ev=>{if(!location.hash.startsWith('#admin'))return;const b=ev.target.closest('[data-ml]');if(!b||busy||composer.isBusy())return;let action=b.dataset.ml;if(action==='chooseProductPhoto'){document.getElementById('photoFile')?.click();return;}if(action==='messageFocus'){composer.focus();return;}if(action==='saveRequest'){await saveRequestState();return;}if(action==='restoreReservation'){openReservationRestoration(b.dataset.id,b);return;}if(action==='cancelReservationRestore'){document.getElementById('restorationConfirmation')?.remove();scheduleLive();document.querySelector('[data-ml=restoreReservation][data-id="'+b.dataset.id+'"]')?.focus();return;}if(action==='approveReservationRestore'){await restoreReservation(b.dataset.id);return;}if(action==='saveNote'){await saveNote();return;}if(action==='saveListNote'){await saveListNote(b.dataset.id);return;}if(action==='logout'&&listNoteDrafts.size&&!confirm('목록에 저장하지 않은 메모가 있습니다. 로그아웃할까요?'))return;if(action==='toggleSound'){sound.toggle();return;}if(action==='previewSound'){sound.preview();return;}if(action==='refreshLive'){await refreshLive();return;}if(action==='newInquiries'){await showNewInquiries();return;}if(action==='homeInbox'){await showNewInquiries(true);return;}if(listStatusState.confirmationId&&['homeInbox','tab','detail','messageCustomer','newReservation','refreshInbox','clearSearch','reservationFilter','requestFilter','previousPage','nextPage'].includes(action)){if(!confirm('작성 중인 예약 확정 정보를 닫고 이동할까요?'))return;listStatusState.confirmationId='';}suspendLive();const approved=action==='approveDeletion';if(approved){action=b.dataset.kind;deletionPrompt=null;}if(action==='cancelDeletion'){deletionPrompt=null;render();return;}
if(!approved&&['deleteRequest','trashRequest','permanentRequest','emptyTrash'].includes(action)){
 const r=action==='deleteRequest'?detail?.item:items.find(r=>r.id===b.dataset.id),permanent=['permanentRequest','emptyTrash'].includes(action);
 deletionPrompt={kind:action,id:r?.id,permanent,message:action==='emptyTrash'?'휴지통의 모든 페이지에 있는 상담·문자·메모를 영구 삭제합니다. 복원할 수 없습니다.':permanent?r.person+'님의 상담·문자·메모를 영구 삭제합니다. 복원할 수 없습니다.':r.person+'님의 상담을 휴지통으로 이동합니다. 7일 이내에 복원할 수 있으며, 기존 개인정보 보유기한이 먼저 적용됩니다. 외부 OPS 예약은 취소되지 않습니다.'};render();return;
}if(action==='reservationFocus'){if(detail?.item.status==='confirmed')composer.openStage('confirmed');else await saveQuickStatus('confirmed');scheduleLive();return;}notice='';busy=true;
try{
 if(action==='newReservation'){if(user.role!=='admin')throw Error('관리자만 직접 예약을 등록할 수 있습니다.');await direct.open(user,users);composer.clear();detail=null;dirty=false;}
 if(action==='logout'){await api('auth/logout','POST',{});clear();}
 if(action==='tab'){if((dirty||composer.isDirty())&&!confirm('저장하지 않은 변경을 버리고 이동할까요?'))return;noteDrafts.delete(detail?.item.id);dirty=false;composer.clear();direct.close();detail=null;tab=b.dataset.tab;search='';offset=0;await load();}
 if(['search','refreshInbox','clearSearch','reservationFilter','requestFilter'].includes(action)){offset=0;if(action==='search')search=val('requestSearch').trim();if(action==='clearSearch')search='';if(action==='reservationFilter')reservationStatus=b.dataset.status;if(action==='requestFilter')requestStatus=b.dataset.status;detail=null;await load();}
 if(action==='previousPage'||action==='nextPage'){offset=Math.max(0,offset+(action==='nextPage'?50:-50));detail=null;await load();}
 if(action==='detail'||action==='messageCustomer'){composer.clear();detail=await api('admin/consultations/'+b.dataset.id);}
 if(action==='closeDetail'){if((dirty||composer.isDirty())&&!confirm('저장하지 않은 메모·변경 사항을 버리고 이동할까요?'))return;noteDrafts.delete(detail?.item.id);dirty=false;composer.clear();detail=null;await load();}
 if(action==='deleteRequest'||action==='trashRequest'){
  const r=action==='deleteRequest'?detail.item:items.find(r=>r.id===b.dataset.id);
  await api('admin/consultations/'+r.id,'DELETE',{version:r.version});composer.clear();detail=null;dirty=false;notice='휴지통으로 이동했습니다. 휴지통 메뉴에서 복원하거나 영구 삭제할 수 있습니다.';await load();
 }
 if(action==='restoreRequest'||action==='permanentRequest'){
  const r=items.find(r=>r.id===b.dataset.id),restore=action==='restoreRequest';
  await api('admin/consultations/'+r.id+(restore?'/restore':'/permanent'),restore?'POST':'DELETE',{version:r.version,...(restore?{}:{approved:true})});notice=restore?'원래 상태로 복원했습니다. 상담 접수함에서 확인할 수 있습니다.':'영구 삭제했습니다.';await load();
 }
 if(action==='emptyTrash'){
  const result=await api('admin/trash/empty','POST',{before:trashBefore,approved:true});offset=0;notice=result.deleted+'건을 영구 삭제했습니다.';await load();
 }
 if(action==='confirm'){await api('admin/consultations/'+detail.item.id+'/confirm','POST',{version:detail.item.version,date:val('confirmDate'),time:val('confirmTime'),durationMinutes:Number(val('confirmDuration')),amount:Number(val('confirmAmount')),place:val('confirmPlace'),resourceId:val('confirmResource'),approved:$('#confirmApproved').checked});notice='승인 작업을 만들었습니다. OPS 연동 메뉴에서 연결 상태를 확인하세요.';}
 if(action==='mediaUp'||action==='mediaRemove'){captureProduct();const p=products.find(x=>x.id===editId),i=Number(b.dataset.index);if(action==='mediaRemove')p.media.splice(i,1);else if(i>0)[p.media[i-1],p.media[i]]=[p.media[i],p.media[i-1]];p.photo=p.media[0]?.url||'';dirty=true;}
 if(action==='edit'){captureProduct();editId=b.dataset.id;}
 if(action==='addProduct'){captureProduct();const id=crypto.randomUUID(),category=val('newCategory');products.push({id,category,sub:category==='yacht'?'sail':'main',name:'새 상품',short:'',description:'',visible:false,photo:'',bouquet:false,packages:[{id:crypto.randomUUID(),name:'기본 패키지',weekday:null,weekend:null,summary:'',features:[],note:''}]});editId=id;productCategory=category;productState='active';dirty=true;}
 if(['addPack','removePack','moveUp','moveDown','archive','restore','saveDraft','publish'].includes(action)){
  captureProduct();const p=products.find(x=>x.id===editId);
  if(action==='addPack'){const pack={id:crypto.randomUUID(),name:'새 패키지',weekday:null,weekend:null,summary:'',features:[],note:''};p.packages.push(pack);productPanels.set('pack:'+pack.id,true);}
  if(action==='removePack'){if(p.packages.length<=1)throw Error('최소 1개 패키지를 유지해 주세요.');p.packages.splice(Number(b.dataset.index),1);}
  if(action==='archive'){p.archived=true;p.visible=false;selectListedProduct();notice='상품을 보관했습니다. ‘보관된 상품’에서 다시 복원할 수 있습니다. 저장 및 게시를 눌러 적용하세요.';}
  if(action==='restore'){p.archived=false;p.visible=true;productState='active';notice='상품을 복원했습니다. 저장 및 게시를 누르면 고객 화면에 다시 표시됩니다.';}
  if(action==='moveUp'||action==='moveDown'){const i=products.indexOf(p),j=i+(action==='moveUp'?-1:1);if(j>=0&&j<products.length)[products[i],products[j]]=[products[j],products[i]];}
  dirty=true;
  if(action==='saveDraft'||action==='publish'){const r=await api('admin/catalog','PUT',{version:draftVersion,products,publish:action==='publish'});draftVersion=r.version;dirty=false;notice=action==='publish'?'고객 화면에 게시했습니다.':'초안을 서버에 저장했습니다.';}
 }
 if(action==='saveSettings'){captureNotificationSettings();await saveSettings(notificationFields);}
 if(action==='subscribe'||action==='unsubscribe')captureNotificationSettings();
 if(['savePlaces','addLocation','removeLocation'].includes(action)){capturePlaces();settings.locations??=[];if(action==='addLocation'){const id=crypto.randomUUID();settings.locations.push({id,category:'yacht',name:'새 장소',status:'candidate',address:'',mapUrl:'',parking:'',contact:''});placePanels.set(id,true);dirty=true;}else if(action==='removeLocation'){settings.locations.splice(Number(b.dataset.index),1);dirty=true;}else await saveSettings([]);}
 if(action==='retention'){capturePrivacySettings();const out=await api('admin/retention','POST',{});notice='만료 상담 '+out.deleted+'건을 정리했습니다.';}
 if(action==='savePrivacy')await saveSettings(privacyFields);
 if(action==='refreshJobs')await load();
 if(action==='runJob'){const r=await api('admin/jobs/run','POST',{kind:b.dataset.kind,id:b.dataset.id});notice='처리 상태: '+r.state;await load();}
 if(action==='toggleUser'){const u=users.find(x=>x.id===b.dataset.id);await api('admin/users/'+u.id,'PATCH',{role:u.role,active:!u.active});notice='사용 상태를 변경하고 기존 로그인 세션을 회수했습니다.';await load();}
 if(action==='createStaff'){await api('admin/users','POST',{username:val('staffName'),password:val('staffPassword'),role:val('staffRole')});notice='직원 계정을 생성했습니다. 첫 로그인 시 비밀번호를 변경해야 합니다.';dirty=false;await load();}
 if(action==='password'){await api('auth/password','POST',{username:val('accountUsername'),current:val('currentPassword'),password:val('newPassword')});clear();notice='로그인 정보가 변경되었습니다. 다시 로그인해 주세요.';}
 if(action==='subscribe'){if(!gates.vapid)throw Error('서버 푸시 키가 아직 연결되지 않았습니다.');if(!('PushManager'in window))throw Error('홈 화면 앱과 푸시 지원 브라우저에서 시도해 주세요.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('알림 권한이 허용되지 않았습니다. 접수함은 계속 사용할 수 있습니다.');const reg=await navigator.serviceWorker.ready;const str=gates.vapid.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(str),c=>c.charCodeAt(0));const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await api('admin/push','POST',sub.toJSON());notice='이 기기 푸시 구독을 저장했습니다.';}
 if(action==='unsubscribe'){const reg=await navigator.serviceWorker.ready;await (await reg.pushManager.getSubscription())?.unsubscribe();await api('admin/push','DELETE',{});notice='푸시 구독을 해제했습니다.';}
}catch(err){notice=err.message;}finally{busy=false;render();if(action==='messageCustomer')composer.openStage(b.dataset.stage||(detail?.item.status==='closed'&&detail.item.communication?.reservation?'thanks':'receipt'));else if(['closeDetail','tab','detail','newReservation'].includes(action))window.scrollTo(0,0);}});
document.addEventListener('change',async ev=>{if(location.hash.startsWith('#admin')&&['productCategory','productState'].includes(ev.target.id)){if(busy)return;captureProduct();productCategory=val('productCategory');productState=val('productState');selectListedProduct();notice='';render();return;}if(ev.target.id!=='photoFile'||!ev.target.files?.length)return;const file=ev.target.files[0];if((products.find(p=>p.id===editId)?.media||[]).length>=12){notice='사진은 최대 12장입니다.';render();return;}if(file.size>1000000){notice='1MB 이하 이미지를 선택해 주세요.';render();return;}captureProduct();busy=true;try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const r=await api('admin/media','POST',{data,alt:val('photoAlt')||'상품 대표사진'});const p=products.find(p=>p.id===editId);p.media??=p.photo?[{url:p.photo,alt:p.name+' 대표사진'}]:[];if(p.media.length>=12)throw Error('사진은 최대 12장입니다.');p.media.push({url:r.url,alt:r.alt});p.photo=p.media[0].url;dirty=true;notice='사진 업로드 완료. 초안 저장 또는 게시를 눌러 적용하세요.';}catch(err){notice=err.message;}finally{busy=false;render();}});
window.addEventListener('beforeunload',ev=>{if(dirty||composer.isDirty()||listStatusState.confirmationId||listNoteDrafts.size){ev.preventDefault();ev.returnValue='';}});
document.addEventListener('keydown',ev=>{if(!deletionPrompt)return;if(ev.key==='Escape'){ev.preventDefault();deletionPrompt=null;render();}else if(ev.key==='Tab'){const buttons=[...document.querySelectorAll('.deletion-confirmation button')];const first=buttons[0],last=buttons[buttons.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}}});
window.MomentLinkAdmin={mount,clear};
})();

