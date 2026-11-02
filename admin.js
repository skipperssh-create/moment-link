/* Authenticated administrator UI; no session tokens or customer data in browser storage. */
(() => {
'use strict';
const $=s=>document.querySelector(s),e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
const composer=window.MomentLinkComposer;
const sound=window.MomentLinkSound(paintSound);
const messageLabel=phone=>`<span class="customer-message-label">문자 안내</span><span class="customer-message-phone">${e(phone)}</span>`;
const statuses={new:'접수중',consulting:'상담중',awaiting_payment:'입금대기',confirmed:'확정',hold:'보류',closed:'종결',cancelled:'취소'};
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
function liveEligible(){return !!user&&!user.mustChangePassword&&location.hash.startsWith('#admin')&&!document.hidden&&navigator.onLine!==false;}
function suspendLive(){clearTimeout(live.timer);live.timer=null;live.generation++;live.controller?.abort();live.controller=null;}
function resetLive(){suspendLive();sound.reset();Object.assign(live,{since:'',checkedAt:'',pending:0,arrivals:0,soundLatest:'',error:'',lastAttempt:0});document.title=live.originalTitle;}
function scheduleLive(){if(!liveEligible()||live.timer||live.controller)return;live.timer=setTimeout(()=>{live.timer=null;void refreshLive();},live.lastAttempt?LIVE_INTERVAL:500);}
function liveBar(){return `<div class="inbox-live" id="inboxLive"><div class="inbox-live-copy"><strong id="inboxLiveSummary" role="status" aria-live="polite" aria-atomic="true">새 상담 확인 중…</strong><span class="micro" id="inboxLiveTime"></span></div><div class="inbox-live-actions"><button type="button" class="primary" data-ml="newInquiries" hidden>새 접수 보기</button><button type="button" class="secondary" data-ml="refreshLive">새로고침</button></div><div class="inbox-sound"><div class="inbox-sound-actions"><button type="button" class="secondary" data-ml="toggleSound" aria-pressed="false">음성 알림 켜기</button><button type="button" class="secondary" data-ml="previewSound">미리 듣기</button><span class="micro" id="inboxSoundStatus" role="status"></span></div><p class="micro">화면을 열어둔 동안 “모먼트링크, 새 상담이 왔어요”로 알려드립니다. 새로 연 화면에서는 다시 켜 주세요. 앱을 닫으면 휴대폰 기본 푸시 알림음이 적용됩니다.</p></div></div>`;}
function paintSound(){
 const bar=$('#inboxLive');if(!bar)return;
 const state=sound.state(),toggle=bar.querySelector('[data-ml=toggleSound]'),preview=bar.querySelector('[data-ml=previewSound]'),status=$('#inboxSoundStatus');
 if(!toggle||!preview||!status)return;
 toggle.textContent=state.enabled?'음성 알림 끄기':'음성 알림 켜기';toggle.setAttribute('aria-pressed',String(state.enabled));toggle.disabled=!state.supported;
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
 refresh.textContent=live.controller?'확인 중…':'새로고침';
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
  if(listVisible){const result=await api(path,'GET',undefined,controller.signal);if(generation===live.generation&&liveEligible()&&!busy&&!detail&&path===listPath())refreshListView(result);}
 }catch(err){
  if(err.status===401&&!user){notice='로그인을 다시 확인해 주세요.';render();return;}
  if(generation!==live.generation)return;
  live.error='새 상담 확인에 실패했습니다. 새로고침을 누르거나 잠시 기다려 주세요.';
  if(!user){resetLive();notice='로그인을 다시 확인해 주세요.';render();}
 }finally{clearTimeout(timeout);if(generation===live.generation){live.controller=null;paintLive();scheduleLive();}}
}
async function showNewInquiries(){
 if((dirty||composer.isDirty())&&!confirm('저장하지 않은 변경을 버리고 새 접수를 볼까요?'))return;
 suspendLive();const acknowledged=live.checkedAt;busy=true;paintLive();
 try{const result=await api('admin/consultations?view=all&status=all');composer.clear();direct.close();dirty=false;detail=null;tab='inbox';search='';offset=0;requestStatus='all';items=result.items;counts=result.counts;live.since=acknowledged;live.arrivals=0;notice='새로 들어온 상담부터 표시합니다.';}
 catch(err){notice=err.message;}
 finally{busy=false;render();window.scrollTo(0,0);}
}
function resumeLive(){if(liveEligible()&&Date.now()-live.lastAttempt>5000)void refreshLive();else scheduleLive();}
document.addEventListener('visibilitychange',()=>{if(document.hidden){suspendLive();sound.stop();}else resumeLive();});
window.addEventListener('offline',()=>{suspendLive();paintLive();});
window.addEventListener('online',resumeLive);
window.addEventListener('focus',resumeLive);
function header(){return `<header><div class="brand">MOMENT LINK</div><nav class="nav"><a class="tab" href="#">고객 화면</a><button type="button" class="tab" data-pwa-install>앱 설치</button>${user?button('logout','로그아웃'):''}</nav></header>`;}
function login(){return `<main class="layout"><section class="page"><div class="hero-card"><h1 class="page-title">관리자 로그인</h1><p class="muted">허가된 직원만 상담 내역을 확인할 수 있습니다.</p><p class="micro">이 기기에서 로그인이 자동으로 유지됩니다.</p><form id="mlLogin">${input('loginUser','아이디','','text')}${input('loginPassword','비밀번호','','password')}<button class="primary" style="width:100%;margin-top:20px" ${busy?'disabled':''}>${busy?'확인 중…':'로그인'}</button></form></div></section></main>`;}
function passwordPanel(){return `<div class="admin-card"><h2>아이디·비밀번호 변경</h2>${input('accountUsername','로그인 아이디',user.username)}${input('currentPassword','현재 비밀번호','','password')}${input('newPassword','새 비밀번호 · 8자 이상','','password')}${button('password','변경 후 다시 로그인')}</div>`;}
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
function inbox(){
 if(direct.isOpen())return direct.render();
 if(detail)return requestDetail();
 return `${user.role==='admin'?'<div class="direct-booking-launch">'+button('newReservation','+ 직접 예약 등록','primary')+'</div>':''}<form id="requestSearchForm" class="inbox-search" role="search" aria-label="고객 검색"><label class="admin-label" for="requestSearch">고객 검색</label><div class="inbox-search-row"><input class="admin-input" id="requestSearch" type="search" value="${e(search)}" placeholder="이름, 전화번호 또는 접수번호 입력"/><button class="primary" type="submit" ${busy?'disabled':''}>검색</button></div><div class="inbox-tools">${search?button('clearSearch','검색 초기화'):''}<span class="micro">${search?'검색 결과: '+e(search):'검색어 없이 전체 목록을 볼 수 있습니다.'}</span></div></form><div id="inboxListing">${inboxListing()}</div>`;
}
function inboxListing(){
 const reserved=tab==='reservations',filterStatus=reserved?reservationStatus:requestStatus;
 return `<div class="reservation-filters" role="group" aria-label="진행 상황별 보기">${(reserved?[['confirmed','확정'],['closed','이벤트 완료'],['cancelled','취소'],['all','전체 예약']]:[['all','전체'],...Object.entries(statuses).filter(([id])=>id!=='closed')]).map(([id,n])=>`<button class="secondary" data-ml="${reserved?'reservationFilter':'requestFilter'}" data-status="${id}" aria-pressed="${filterStatus===id}">${n} <span>${counts[id]??0}</span></button>`).join('')}${!reserved&&user.role==='admin'?'<button type="button" class="secondary" data-ml="tab" data-tab="trash">휴지통</button>':''}</div><p class="micro inbox-count">${reserved?'이벤트 일정순':'최근 접수순'} · ${items.length?'현재 '+(offset+1)+'–'+(offset+items.length)+'건 표시':'표시할 내역 없음'}${user.role==='admin'?'':' · 내 담당 고객'}</p>${offset||items.length===50?`<div class="btnrow inbox-pagination">${offset?button('previousPage','이전 50건'):''}${items.length===50?button('nextPage','다음 50건'):''}</div>`:''}<div class="inbox-results">${items.map(r=>{
 const b=r.communication?.booking,hasReservation=reserved||r.status==='confirmed';
 return `<div class="admin-card inbox-item" data-request-id="${e(r.id)}"><div class="admin-row"><div><strong>${e(r.person)}</strong><div class="micro">${e(r.receipt)} · ${e(categories[r.category])}${r.communication?.entry?.source==='admin_direct'?' · 관리자 직접 등록':''}</div></div><span class="badge">${e(hasReservation&&r.status==='closed'?'이벤트 완료':statuses[r.status])}</span></div><p class="inbox-product">${e(r.snapshot.product.name)} · ${e(r.snapshot.package.name)}</p><p class="muted inbox-date">${hasReservation?'확정 일정':'희망 일정'} · ${e(hasReservation&&b?b.date:r.preferences[0].date)} ${e(hasReservation&&b?b.time:r.preferences[0].time)}</p>${hasReservation&&b?`<p class="muted">${e(b.place)} · ${Number.isInteger(b.amount)?b.amount.toLocaleString('ko-KR')+'원':'금액 확인 필요'}</p>`:''}<div class="btnrow"><button class="secondary" data-ml="detail" data-id="${e(r.id)}">${hasReservation?'예약 상세':'상담 상세'}</button><button class="secondary customer-message-button" data-ml="messageCustomer" data-id="${e(r.id)}">${messageLabel(r.phone)}</button>${user.role==='admin'?`<button class="secondary" data-ml="trashRequest" data-id="${e(r.id)}">삭제</button>`:''}</div>${hasReservation&&r.status!=='cancelled'?`<div class="reservation-messages" aria-label="고객 안내 문자">${Object.entries(MomentLinkMessages.stages).filter(([id])=>r.status!=='closed'||id==='thanks').map(([id,n])=>{const sent=r.communication?.events?.some(x=>x.stage===id&&x.kind==='manual_sent');return `<button class="secondary" data-ml="messageCustomer" data-id="${e(r.id)}" data-stage="${id}">${n}<span class="micro">${sent?'발송 기록 있음':'문구 준비'}</span></button>`;}).join('')}</div>`:''}</div>`;
 }).join('')||'<div class="empty">해당하는 내역이 없습니다.</div>'}</div>`;
}
function trash(){return `<div class="btnrow"><button type="button" class="secondary" data-ml="tab" data-tab="inbox">← 상담 접수함</button></div><p class="muted">삭제한 상담은 7일 동안 복원할 수 있습니다. 기존 개인정보 보유기한이 먼저 끝나면 그날 만료됩니다. 만료된 내역은 숨겨지고 매일 자동으로 영구 삭제됩니다.</p><div class="inbox-tools">${button('refreshInbox','목록 새로고침')}${button('emptyTrash','휴지통 비우기')}<span class="micro">전체 ${counts.all??0}건</span></div>${offset||items.length===50?'<div class="btnrow inbox-pagination">'+(offset?button('previousPage','이전 50건'):'')+(items.length===50?button('nextPage','다음 50건'):'')+'</div>':''}<div class="inbox-results">${items.map(r=>`<div class="admin-card inbox-item"><div class="admin-row"><strong>${e(r.person)}</strong><span class="badge">${e(statuses[r.status])}</span></div><p class="micro">${e(r.receipt)} · ${e(r.phone)}</p><p>${e(r.snapshot.product.name)} · ${e(r.snapshot.package.name)}</p><p class="muted">복원 가능 기한 · ${e(new Date(r.delete_after).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><div class="btnrow"><button class="secondary" data-ml="restoreRequest" data-id="${e(r.id)}">복원</button><button class="secondary" data-ml="permanentRequest" data-id="${e(r.id)}">영구 삭제</button></div></div>`).join('')||'<div class="empty">휴지통이 비어 있습니다.</div>'}</div>`;}

function requestStatusOptions(r){return Object.entries(statuses).filter(([id])=>r.communication?.reservation?(r.status==='confirmed'?['confirmed','closed','cancelled'].includes(id):id===r.status):id!=='closed'||r.status==='closed').map(([id,n])=>`<option value="${id}" ${id===r.status?'selected':''} ${id==='closed'&&!r.communication?.reservation?'disabled hidden':''}>${id==='closed'&&r.communication?.reservation?'이벤트 완료':n}</option>`).join('');}
function statusFeedback(state,text){
 const root=$('#requestStatusEditor');if(!root)return;
 root.dataset.state=state;
 const button=root.querySelector('[data-ml=saveRequest]'),message=$('#requestSaveFeedback');
 button.textContent=state==='saving'?'저장 중…':state==='success'?'✓ 저장 완료':state==='error'?'다시 저장':'상태 저장';
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
 const data={version:r.version,contacted:$('#requestContacted').checked,read:true};
 if(selected!=='confirmed'||confirming)data.status=selected;
 if(confirmation)data.confirmation=confirmation;
 if(user.role==='admin')data.assignee=val('requestAssignee')||null;
 let messageRoot=$('#messageComposer');const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),20000);
 suspendLive();busy=true;closeAssignee();statusFeedback('saving','상태를 저장하고 있습니다…');paintLive();
 if(messageRoot)messageRoot.inert=true;
 const current=()=>detail?.item.id===r.id&&$('#requestStatusEditor')===root;
 try{
  const out=await api('admin/consultations/'+r.id,'PATCH',data,controller.signal);
  if(!current())return;
  detail.item=out.item;
  composer.init(out.item,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);
  if(confirming){composer.acceptConfirmation(out.item);messageRoot=$('#messageComposer');if(messageRoot)messageRoot.inert=true;const focusButton=$('.reservation-heading [data-ml=reservationFocus]');if(focusButton)focusButton.textContent='예약 정보 확인·수정';}
  $('#requestStatus').innerHTML=requestStatusOptions(out.item);
  const label=out.item.communication?.reservation&&out.item.status==='closed'?'이벤트 완료':statuses[out.item.status];
  $('.reservation-heading .badge').textContent=label;
  if(out.item.status==='cancelled'||out.item.status==='closed'&&out.item.communication?.reservation){
   $('.reservation-heading [data-ml=reservationFocus]')?.remove();
   messageRoot?.querySelector('.reservation-confirm')?.remove();
  }
  // Keep the editor and its unsaved memo/OPS fields in place after saving status.
  dirty=[...root.closest('.admin-card').querySelectorAll('input,textarea')].some(el=>!root.contains(el)&&!messageRoot?.contains(el)&&(el.type==='checkbox'?el.checked!==el.defaultChecked:el.value!==el.defaultValue));
  const assigned=users.find(x=>x.id===out.item.assignee)?.username||(out.item.assignee===user.id?user.username:out.item.assignee?'담당자 배정됨':'미배정');
  statusFeedback('success',(confirming?'예약을 확정했습니다. 확정 예약 목록에서 관리할 수 있습니다. ':'상태가 저장되었습니다. ')+label+' · '+assigned+' · '+(out.item.contacted?'연락 완료':'연락 전'));
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
function requestHistory(){return detail.notes.map(n=>`<p>${e(n.body)} <span class="micro">${e(n.created_at)}</span></p>`).join('')+detail.history.map(n=>`<p class="micro">${e(n.action)} · ${e(n.created_at)}</p>`).join('');}

function requestDetail(){const r=detail.item;composer.init(r,api,item=>{if(detail?.item.id===item.id)detail.item=item;},settings);return `<div class="admin-card">${button('closeDetail','← 목록')}<div class="reservation-heading"><h2>${e(r.person)} · ${e(r.receipt)}</h2><span class="badge">${e(r.communication?.reservation&&r.status==='closed'?'이벤트 완료':statuses[r.status])}</span>${r.status!=='cancelled'&&!(r.status==='closed'&&r.communication?.reservation)?button('reservationFocus',r.status==='confirmed'?'예약 정보 확인·수정':'예약 확정','primary'):''}</div><dl>${[['상품',r.snapshot.product.name+' · '+r.snapshot.package.name],['추가 선택',(r.snapshot.options||[]).map(o=>o.name+' '+o.amount.toLocaleString('ko-KR')+'원').join(', ')||'없음'],['보유기한',new Date(r.expires_at).toLocaleString('ko-KR')],['연락처',r.phone],...(r.communication?.reservation?[['확정 일정',r.communication.booking.date+' '+r.communication.booking.time],['확정 장소',r.communication.booking.place],['최종 금액',r.communication.booking.amount.toLocaleString('ko-KR')+'원']]:[]),['희망 일정',r.preferences.map(x=>x.date+' '+x.time).join(' / ')],['장소',r.place||(r.category==='yacht'?MomentLinkPricing.location(settings):'상담 후 안내')],['요청',r.notes||'없음'],['가격 스냅샷','주중 '+(r.snapshot.price.weekday===null?'상담 후 안내':r.snapshot.price.weekday.toLocaleString('ko-KR')+'원')+' / 주말 '+(r.snapshot.price.weekend===null?'상담 후 안내':r.snapshot.price.weekend.toLocaleString('ko-KR')+'원')]].map(([k,v])=>`<div class="summary"><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl><div class="btnrow"><a class="secondary" href="tel:${e(r.phone)}">전화</a><button class="secondary customer-message-button" data-ml="messageFocus">${messageLabel(r.phone)}</button></div>${composer.html()}<div id="requestStatusEditor" class="request-status-editor"><fieldset><legend class="sr-only">상담 상태 저장</legend><label class="admin-label" for="requestStatus">상담 상태</label><select class="admin-select" id="requestStatus">${requestStatusOptions(r)}</select>${user.role==='admin'?assigneePicker(r.assignee):''}<label class="inline-check"><input id="requestContacted" type="checkbox" ${r.contacted?'checked':''}/> 연락 완료</label>${button('saveRequest','상태 저장','primary')}</fieldset><p id="requestSaveFeedback" class="request-save-feedback" role="status" aria-live="polite" aria-atomic="true"></p></div>${area('requestNote','상담 메모','')}${button('saveNote','메모 추가')}${user.role==='admin'?button('deleteRequest','휴지통으로 이동'):''}<details><summary>메모·변경 이력</summary><div id="requestHistory">${requestHistory()}</div></details>${user.role==='admin'?`<details><summary>최종 일정 승인 · OPS 등록</summary><p class="micro">외부 OPS 등록을 위한 별도 기능입니다. 모먼트링크 예약 확정은 위의 ‘예약 확정’ 버튼을 사용합니다.</p>${input('confirmDate','최종 날짜',r.preferences[0].date,'date')}${input('confirmTime','최종 시간','','time')}${input('confirmDuration','진행 시간(분)','','number')}${input('confirmAmount','최종 금액(원)','','number')}${input('confirmPlace','확정 장소',r.place)}${input('confirmResource','대상 OPS 자원 ID','')}<label class="inline-check"><input type="checkbox" id="confirmApproved"/> 최종 일정·상품·장소·금액을 확인하고 승인합니다.</label>${button('confirm','승인 및 연동 작업 생성')}</details>`:''}</div>`;}
function listedProducts(){return products.filter(p=>(productCategory==='all'||p.category===productCategory)&&(productState==='all'||(productState==='archived'?p.archived:!p.archived)));}
function selectListedProduct(){const list=listedProducts();editId=list.find(p=>p.id===editId)?.id||list[0]?.id||'';}
function productEditor(){const p=products.find(x=>x.id===editId),list=listedProducts();return `<p class="muted">초안 저장 후 게시하면 고객 화면에 적용됩니다. 과거 접수의 상품·가격은 보존됩니다.</p><div class="admin-controls"><div><label class="admin-label" for="productCategory">상품 분야</label><select class="admin-select" id="productCategory"><option value="all" ${productCategory==='all'?'selected':''}>전체 분야</option>${Object.entries(categories).map(([id,n])=>`<option value="${id}" ${productCategory===id?'selected':''}>${n}</option>`).join('')}</select></div><div><label class="admin-label" for="productState">상품 상태</label><select class="admin-select" id="productState">${[['active','운영 상품'],['archived','보관된 상품'],['all','전체 상품']].map(([id,n])=>`<option value="${id}" ${productState===id?'selected':''}>${n} (${products.filter(p=>(productCategory==='all'||p.category===productCategory)&&(id==='all'||(id==='archived'?p.archived:!p.archived))).length})</option>`).join('')}</select></div></div><p class="micro">보관한 상품은 ‘상품 상태 → 보관된 상품’에서 선택한 뒤 복원할 수 있습니다.</p><details><summary>새 상품 추가</summary><label class="admin-label" for="newCategory">추가할 상품 분야</label><select class="admin-select" id="newCategory">${Object.entries(categories).map(([id,n])=>`<option value="${id}" ${productCategory===id?'selected':''}>${n}</option>`).join('')}</select><div class="btnrow">${button('addProduct','+ 상품 추가')}</div></details><div class="admin-card"><div class="card-stack">${list.map(p=>`<button class="secondary" data-ml="edit" data-id="${e(p.id)}" aria-pressed="${p.id===editId}" style="text-align:left">${e(categories[p.category])} · ${e(p.name)} <span class="micro">${p.archived?'보관됨':p.visible?'노출':'숨김'}</span></button>`).join('')||'<p class="empty">이 조건에 해당하는 상품이 없습니다. 상품 분야나 상태를 바꿔 확인해 주세요.</p>'}</div></div>${p?`<div class="admin-card" id="mlProductEditor"><div class="admin-row"><strong>상품 편집</strong><div class="admin-actions">${p.archived?button('restore','복원'):button('moveUp','위로')+button('moveDown','아래로')+button('archive','보관')}</div></div>${p.archived?'<p class="info">보관된 상품입니다. 복원 후 저장 및 게시하면 고객 화면에 다시 표시됩니다.</p>':''}${input('editName','상품명',p.name)}${input('editShort','카드 요약 설명',p.short)}${area('editDescription','상세 상품 설명',p.description)}<label class="admin-label" for="editSub">하위 상품</label><select class="admin-select" id="editSub">${(p.category==='yacht'?[['sail','출항형'],['dock','정박형']]:[['main','기본']]).map(([id,n])=>`<option value="${id}" ${p.sub===id?'selected':''}>${n}</option>`).join('')}</select>${input('editPhoto','대표사진 URL',p.photo)}<label class="admin-label" for="photoFile">사진 업로드 · 1MB 이하, 서버에서 WebP로 변환</label><input class="admin-input" type="file" id="photoFile" accept="image/png,image/jpeg,image/webp"/>${input('photoAlt','업로드할 사진 설명',p.name+' 대표사진')}<p class="micro">사진 목록 첫 항목이 대표사진입니다. 최대 12장.</p>${(p.media||[]).map((m,i)=>`<div class="admin-card">${input('mediaAlt_'+i,'사진 '+(i+1)+' 대체텍스트',m.alt)}<p class="micro">${e(m.url)}</p><button class="secondary" data-ml="mediaUp" data-index="${i}">위로 / 대표 지정</button><button class="secondary" data-ml="mediaRemove" data-index="${i}">목록에서 제거</button></div>`).join('')}<label class="inline-check"><input type="checkbox" id="editVisible" ${p.visible?'checked':''} ${p.archived?'disabled':''}/> 고객에게 노출</label><label class="inline-check"><input type="checkbox" id="editBouquet" ${p.bouquet?'checked':''}/> 올인원 꽃다발 포함</label><label class="inline-check"><input type="checkbox" id="editPaused" ${p.salePaused?'checked':''}/> 판매 중지 · 상품 설명만 표시</label>${p.packages.map((g,i)=>`<div class="divider"></div><div class="admin-row"><strong>패키지 ${i+1}</strong><button class="secondary" data-ml="removePack" data-index="${i}">패키지 보관</button></div>${input('packName_'+i,'패키지명',g.name)}${input('packSummary_'+i,'짧은 안내',g.summary)}<div class="admin-cols">${input('packWeek_'+i,p.category==='yacht'&&p.sub==='sail'?'주중 가격 (원)':'판매가격 (원)',g.weekday??'','number')}${input('packWeekend_'+i,p.category==='yacht'&&p.sub==='sail'?'주말 가격 (원)':'대체 가격 (빈칸이면 동일)',g.weekend??'','number')}</div>${area('packFeatures_'+i,'포함 항목 · 한 줄에 하나',g.features.join('\n'))}${area('packExcluded_'+i,'미포함 항목 · 확인된 항목만 한 줄에 하나',(g.excludedFeatures||[]).join('\n'))}${input('packNote_'+i,'추가 안내',g.note)}${input('packDuration_'+i,'이용 시간(분) · 미확정이면 빈칸',g.durationMinutes??'','number')}${area('packOptions_'+i,'추가 선택사항 · 한 줄에 옵션ID|옵션명|추가금액|택1 그룹(선택)|필수 선행 옵션ID(선택)',(g.options||[]).map(o=>o.id+'|'+o.name+'|'+o.amount+'|'+(o.group||'')+'|'+(o.requiresOptionId||'')).join('\n'))}${area('packDates_'+i,'특정일 확정 가격 · 한 줄에 YYYY-MM-DD=금액 (미정은 빈 금액)',(g.datePrices||[]).map(x=>x.date+'='+(x.amount??'')).join('\n'))}`).join('')}<div class="btnrow" style="margin-top:18px">${button('addPack','+ 패키지 추가')}</div></div>`:''}<div class="btnrow">${button('saveDraft','초안 저장')}${button('publish','저장 및 게시','primary')}</div>`;}
function settingsPanel(){return `<p class="muted">문자 실발송은 승인 전 중지됩니다. OFF 기간의 접수는 나중에 소급 발송하지 않습니다.</p><div class="admin-card">${[['solapi','SOLAPI 전체 사용'],['customerAuto','고객 접수 문자'],['adminAuto','관리자 접수 문자'],['push','관리자 PWA 푸시']].map(([k,n])=>`<label class="inline-check"><input data-setting="${k}" type="checkbox" ${settings[k]?'checked':''}/> ${n}</label>`).join('')}<p class="micro">서버 발송 허용: SMS ${gates.sms?'ON':'OFF'} / 푸시 ${gates.push?'ON':'OFF'}</p>${input('smsNumber','문자 발신·수신 번호',settings.smsNumber)}${input('mainNumber','대표번호',settings.mainNumber)}${input('adminSms','관리자 알림 수신번호',settings.adminSms)}${area('customerTemplate','고객 문자 템플릿 · {receipt} 접수번호',settings.customerTemplate)}${area('adminTemplate','관리자 문자 템플릿',settings.adminTemplate)}${area('completionText','접수 완료 안내문',settings.completionText||'신청 내용이 저장되었습니다. 고객 문자 발송은 선택사항입니다.')}${area('manualSmsTemplate','고객 수동 문자 템플릿 · 고객 관점 문장',settings.manualSmsTemplate||'')}<p class="micro">수동 문자 빈칸은 기본 문구를 사용합니다. 사용 가능: {receipt}, {name}, {phone}, {selection}, {price}, {first}, {second}, {place}, {notes}</p>${button('saveSettings','설정 저장','primary')}<p class="micro" style="margin-top:16px">아이폰·아이패드는 홈 화면에 설치한 모먼트링크 앱에서 로그인한 뒤 푸시를 구독해 주세요. 설치와 알림 권한은 기기마다 설정합니다.</p><div class="btnrow" style="margin-top:16px">${button('subscribe','이 기기 푸시 구독')}${button('unsubscribe','푸시 구독 해제')}</div></div>`;}
function places(){return `<div class="admin-card">${input('yachtPlace','요트 승선 지점',settings.yachtPlace)}${input('yachtAddress','요트 주소·주차 안내',settings.yachtAddress)}${input('heliGunsan','군산 후보 장소',settings.heliGunsan)}${input('heliByeonsan','변산 후보 장소',settings.heliByeonsan)}<p class="micro">헬기 후보지는 최종 확정 장소와 구분해 안내합니다.</p>${(settings.locations||[]).map((l,i)=>`<div class="divider"></div><h3>장소 ${i+1}</h3>${input('locationName_'+i,'장소명',l.name)}<label class="admin-label" for="locationCategory_${i}">분야</label><select class="admin-select" id="locationCategory_${i}">${Object.entries(categories).map(([k,n])=>`<option value="${k}" ${l.category===k?'selected':''}>${n}</option>`).join('')}</select><label class="admin-label" for="locationStatus_${i}">장소 상태</label><select class="admin-select" id="locationStatus_${i}"><option value="candidate" ${l.status==='candidate'?'selected':''}>후보 · 미확정</option><option value="confirmed" ${l.status==='confirmed'?'selected':''}>확정 안내 장소</option></select>${input('locationAddress_'+i,'상세 주소',l.address)}${input('locationMap_'+i,'지도 URL · https',l.mapUrl)}${input('locationParking_'+i,'주차 안내',l.parking)}${input('locationContact_'+i,'현장 연락처',l.contact)}<button class="secondary" data-ml="removeLocation" data-index="${i}">안내 목록에서 제거</button>`).join('')}<div class="btnrow">${button('addLocation','+ 장소 추가')}${button('savePlaces','장소 안내 저장','primary')}</div></div>`;}
function privacy(){return `<div class="admin-card"><p class="muted">안내문 수정은 새 접수부터 적용됩니다. 기존 접수는 동의 당시 보유기한을 유지합니다. 보유기간 만료 시 조회를 차단하고 매일 자동 정리합니다.</p>${input('privacyController','개인정보 처리 주체',settings.privacyController)}${input('privacyContact','문의 연락처',settings.privacyContact)}${input('retentionDays','개인정보 보유기간(일)',settings.retentionDays??'','number')}${input('consentVersion','안내문 버전',settings.consentVersion)}${area('privacyText','개인정보 수집·이용 안내문',settings.privacyText)}<label class="inline-check"><input type="checkbox" id="accepting" ${settings.accepting?'checked':''}/> 안내문을 확정하고 실제 상담 접수를 시작합니다.</label>${button('savePrivacy','접수 설정 저장','primary')}${button('retention','만료 개인정보 정리')}</div>`;}
function ops(){return `<p class="muted">요트 → BOATN · 헬기 → KHT · 출장·트렁크 → 설렘. 대상 OPS의 API 계약·인증이 검증되기 전까지 등록을 차단합니다.</p><div class="admin-card"><span class="badge">OPS 쓰기 ${gates.ops?'ON':'OFF'}</span>${button('refreshJobs','목록 새로고침')}</div>${jobs.integrations.map(j=>`<div class="admin-card"><strong>${e(j.target)}</strong><p>${e(j.state)} · ${e(j.error_code||'')}</p><p class="micro">예약 ID ${e(j.external_id||'미등록')}</p><button class="secondary" data-ml="runJob" data-kind="integration" data-id="${j.id}">상태 확인 / 안전 재시도</button></div>`).join('')}<h3>알림 작업</h3>${jobs.notifications.map(j=>`<div class="admin-card">${e(j.channel)} · ${e(j.state)} · ${e(j.error_code||'')}<button class="secondary" data-ml="runJob" data-kind="notification" data-id="${j.id}">상태 확인 / 재시도</button></div>`).join('')||'<p class="muted">발송 작업 없음</p>'}`;}
function staff(){if(user.role!=='admin')return passwordPanel();return `<div class="admin-card">${users.map(u=>`<div class="admin-row"><p>${e(u.username)} · ${e(u.role)} · ${u.active?'사용 중':'중지'}</p>${u.id!==user.id?`<button class="secondary" data-ml="toggleUser" data-id="${u.id}">${u.active?'사용 중지':'사용 재개'}</button>`:''}</div>`).join('')}${input('staffName','신규 직원 아이디','')}${input('staffPassword','임시 비밀번호 · 8자 이상','','password')}<label class="admin-label" for="staffRole">권한</label><select class="admin-select" id="staffRole"><option value="counselor">상담자 · 배정된 상담만</option><option value="admin">관리자</option></select>${button('createStaff','직원 계정 생성')}</div>${passwordPanel()}`;}
function deletionConfirmation(){const p=deletionPrompt;if(!p)return '';return `<div class="info deletion-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="deletionTitle" aria-describedby="deletionMessage"><h2 id="deletionTitle">${p.permanent?'영구 삭제 확인':'휴지통 이동 확인'}</h2><p id="deletionMessage">${e(p.message)}</p><div class="btnrow">${button('cancelDeletion','취소')}<button class="primary" data-ml="approveDeletion" data-kind="${p.kind}" data-id="${e(p.id||'')}" ${busy?'disabled':''}>${p.permanent?'영구 삭제':'휴지통으로 이동'}</button></div></div>`;}
function render(){if(!location.hash.startsWith('#admin'))return;let content=login();if(user){content=user.mustChangePassword?`<main class="layout"><section class="page">${passwordPanel()}</section></main>`:`<main class="admin"><div class="admin-layout"><aside class="admin-menu" aria-label="관리자 메뉴">${Object.entries(tabs).filter(([id])=>id!=='trash'&&(user.role==='admin'||id==='inbox'||id==='reservations'||id==='users')).map(([id,n])=>`<button class="tab" data-ml="tab" data-tab="${id}" ${(tab===id||tab==='trash'&&id==='inbox')?'aria-current="page"':''}>${id==='users'&&user.role!=='admin'?'내 계정':n}</button>`).join('')}</aside><section class="admin-section"><div class="status-top"><div><div class="title">${tabs[tab]}</div><div class="micro">${e(user.username)} · ${user.role==='admin'?'관리자':'상담자'}</div></div><span class="badge">관리자</span></div>${liveBar()}${({inbox,reservations:inbox,trash,products:productEditor,settings:settingsPanel,places,privacy,ops,users:staff}[tab])()}</section></div></main>`;}$('#app').innerHTML=`<div class="shell">${header()}${notice?`<p class="info" role="status">${e(notice)}</p>`:''}${content}${deletionPrompt?'<div class="deletion-backdrop">'+deletionConfirmation()+'</div>':''}</div>`;paintLive();scheduleLive();if(deletionPrompt)$('#deletionTitle')?.closest('[role=alertdialog]')?.querySelector('button')?.focus();}
async function load(){if(!user||user.mustChangePassword)return;if(['inbox','reservations','trash'].includes(tab)){const publicCatalog=await api('catalog');settings={...settings,yachtPlace:publicCatalog.settings.yachtPlace,yachtAddress:publicCatalog.settings.yachtAddress};const result=await api('admin/consultations?q='+encodeURIComponent(search)+'&offset='+offset+'&view='+(tab==='inbox'?'all':tab)+'&status='+(tab==='trash'?'all':tab==='reservations'?reservationStatus:requestStatus));items=result.items;counts=result.counts;trashBefore=result.trashBefore;if(user.role==='admin')users=(await api('admin/users')).items;}if(tab==='products'){const d=await api('admin/catalog');products=d.draft.data;draftVersion=d.draft.version;selectListedProduct();}if(['settings','places','privacy','ops'].includes(tab)){const d=await api('admin/settings');settings=d.settings.data;settingsVersion=d.settings.version;gates=d.gates;gates.vapid=d.vapidPublicKey;}if(tab==='ops')jobs=await api('admin/jobs');if(tab==='users'&&user.role==='admin')users=(await api('admin/users')).items;}
function captureProduct(){const p=products.find(x=>x.id===editId);if(!p||!$('#editName'))return;p.name=val('editName').trim();p.short=val('editShort');p.description=val('editDescription');p.photo=val('editPhoto');p.salePaused=$('#editPaused').checked;(p.media||[]).forEach((m,i)=>m.alt=val('mediaAlt_'+i));if(p.media?.length&&p.photo)p.media[0].url=p.photo;p.sub=val('editSub');p.visible=$('#editVisible').checked;p.bouquet=$('#editBouquet').checked;p.packages.forEach((g,i)=>{g.name=val('packName_'+i).trim();g.summary=val('packSummary_'+i);const a=val('packWeek_'+i),b=val('packWeekend_'+i);g.weekday=a===''?null:Number(a);g.weekend=b===''?g.weekday:Number(b);g.features=val('packFeatures_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);g.excludedFeatures=val('packExcluded_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);g.note=val('packNote_'+i);g.durationMinutes=val('packDuration_'+i)===''?null:Number(val('packDuration_'+i));g.options=val('packOptions_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const [id,name,amount,group,requiresOptionId]=line.split('|').map(x=>x.trim());return {id,name,amount:Number(amount),...(group?{group}:{}),...(requiresOptionId?{requiresOptionId}:{})};});g.datePrices=val('packDates_'+i).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>{const [date,amount]=x.split('=');return {date,amount:amount===''?null:Number(amount)};});});}
function capturePlaces(){for(const k of ['yachtPlace','yachtAddress','heliGunsan','heliByeonsan'])settings[k]=val(k);(settings.locations||[]).forEach((l,i)=>{l.name=val('locationName_'+i);l.category=val('locationCategory_'+i);l.status=val('locationStatus_'+i);l.address=val('locationAddress_'+i);l.mapUrl=val('locationMap_'+i);l.parking=val('locationParking_'+i);l.contact=val('locationContact_'+i);});}
async function saveSettings(fields){for(const k of fields)settings[k]=k==='retentionDays'?(val(k)===''?null:Number(val(k))):k==='accepting'?$('#accepting').checked:val(k);const out=await api('admin/settings','PUT',{version:settingsVersion,data:settings});settingsVersion=out.version;dirty=false;notice='서버에 저장했습니다.';}
async function followRequest(){const id=location.hash.match(/^#admin\/request\/([a-f0-9-]{36})$/)?.[1];if(user&&!user.mustChangePassword&&id){tab='inbox';await load();detail=await api('admin/consultations/'+id);}}
async function mount(){suspendLive();notice='';try{const s=await api('auth/session');if(user?.id!==s.user?.id)resetLive();user=s.user;anti=s.csrf||'';await load();await followRequest();}catch(err){notice=err.message;}render();}
function clear(){resetLive();composer.clear();direct.close();user=null;anti='';items=[];detail=null;dirty=false;}
document.addEventListener('ml:reservation-confirmed',()=>{tab='reservations';reservationStatus='confirmed';offset=0;search='';notice='예약을 확정했습니다. 확정 예약 목록에서 일정과 문자를 관리할 수 있습니다.';render();});
document.addEventListener('submit',async ev=>{if(ev.target.id==='requestSearchForm'){ev.preventDefault();if(busy)return;suspendLive();busy=true;search=val('requestSearch').trim();offset=0;notice='';try{await load();}catch(err){notice=err.message;}finally{busy=false;render();}return;}if(ev.target.id!=='mlLogin')return;ev.preventDefault();if(busy)return;suspendLive();const credentials={username:val('loginUser'),password:val('loginPassword')};busy=true;notice='';try{const s=await api('auth/login','POST',credentials);resetLive();user=s.user;anti=s.csrf;tab='inbox';await load();await followRequest();}catch(err){notice=err.message;}finally{busy=false;render();}});
document.addEventListener('change',ev=>{if(location.hash.startsWith('#admin')&&['requestStatus','requestContacted'].includes(ev.target.id))statusEdited();});
document.addEventListener('input',ev=>{if(location.hash.startsWith('#admin')&&ev.target.closest('.admin-card')&&!ev.target.closest('#messageComposer'))dirty=true;});
document.addEventListener('click',async ev=>{if(!location.hash.startsWith('#admin'))return;const b=ev.target.closest('[data-ml]');if(!b||busy||composer.isBusy())return;let action=b.dataset.ml;if(action==='saveRequest'){await saveRequestState();return;}if(action==='toggleSound'){sound.toggle();return;}if(action==='previewSound'){sound.preview();return;}if(action==='refreshLive'){await refreshLive();return;}if(action==='newInquiries'){await showNewInquiries();return;}suspendLive();const approved=action==='approveDeletion';if(approved){action=b.dataset.kind;deletionPrompt=null;}if(action==='cancelDeletion'){deletionPrompt=null;render();return;}
if(!approved&&['deleteRequest','trashRequest','permanentRequest','emptyTrash'].includes(action)){
 const r=action==='deleteRequest'?detail?.item:items.find(r=>r.id===b.dataset.id),permanent=['permanentRequest','emptyTrash'].includes(action);
 deletionPrompt={kind:action,id:r?.id,permanent,message:action==='emptyTrash'?'휴지통의 모든 페이지에 있는 상담·문자·메모를 영구 삭제합니다. 복원할 수 없습니다.':permanent?r.person+'님의 상담·문자·메모를 영구 삭제합니다. 복원할 수 없습니다.':r.person+'님의 상담을 휴지통으로 이동합니다. 7일 이내에 복원할 수 있으며, 기존 개인정보 보유기한이 먼저 적용됩니다. 외부 OPS 예약은 취소되지 않습니다.'};render();return;
}if(action==='messageFocus'){composer.focus();scheduleLive();return;}if(action==='reservationFocus'){composer.openStage('confirmed');scheduleLive();return;}notice='';busy=true;
try{
 if(action==='newReservation'){if(user.role!=='admin')throw Error('관리자만 직접 예약을 등록할 수 있습니다.');await direct.open(user,users);composer.clear();detail=null;dirty=false;}
 if(action==='logout'){await api('auth/logout','POST',{});clear();}
 if(action==='tab'){if((dirty||composer.isDirty())&&!confirm('저장하지 않은 변경을 버리고 이동할까요?'))return;dirty=false;composer.clear();direct.close();detail=null;tab=b.dataset.tab;search='';offset=0;await load();}
 if(['search','refreshInbox','clearSearch','reservationFilter','requestFilter'].includes(action)){offset=0;if(action==='search')search=val('requestSearch').trim();if(action==='clearSearch')search='';if(action==='reservationFilter')reservationStatus=b.dataset.status;if(action==='requestFilter')requestStatus=b.dataset.status;detail=null;await load();}
 if(action==='previousPage'||action==='nextPage'){offset=Math.max(0,offset+(action==='nextPage'?50:-50));detail=null;await load();}
 if(action==='detail'||action==='messageCustomer'){composer.clear();detail=await api('admin/consultations/'+b.dataset.id);}
 if(action==='closeDetail'){if(composer.isDirty()&&!confirm('저장하지 않은 문자 변경을 버리고 이동할까요?'))return;composer.clear();detail=null;await load();}
 if(action==='saveNote'){await api('admin/consultations/'+detail.item.id+'/notes','POST',{body:val('requestNote')});detail=await api('admin/consultations/'+detail.item.id);dirty=false;}
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
  if(action==='addPack')p.packages.push({id:crypto.randomUUID(),name:'새 패키지',weekday:null,weekend:null,summary:'',features:[],note:''});
  if(action==='removePack'){if(p.packages.length<=1)throw Error('최소 1개 패키지를 유지해 주세요.');p.packages.splice(Number(b.dataset.index),1);}
  if(action==='archive'){p.archived=true;p.visible=false;selectListedProduct();notice='상품을 보관했습니다. ‘보관된 상품’에서 다시 복원할 수 있습니다. 저장 및 게시를 눌러 적용하세요.';}
  if(action==='restore'){p.archived=false;p.visible=true;productState='active';notice='상품을 복원했습니다. 저장 및 게시를 누르면 고객 화면에 다시 표시됩니다.';}
  if(action==='moveUp'||action==='moveDown'){const i=products.indexOf(p),j=i+(action==='moveUp'?-1:1);if(j>=0&&j<products.length)[products[i],products[j]]=[products[j],products[i]];}
  dirty=true;
  if(action==='saveDraft'||action==='publish'){const r=await api('admin/catalog','PUT',{version:draftVersion,products,publish:action==='publish'});draftVersion=r.version;dirty=false;notice=action==='publish'?'고객 화면에 게시했습니다.':'초안을 서버에 저장했습니다.';}
 }
 if(action==='saveSettings'){document.querySelectorAll('[data-setting]').forEach(n=>settings[n.dataset.setting]=n.checked);await saveSettings(['smsNumber','mainNumber','adminSms','customerTemplate','adminTemplate','completionText','manualSmsTemplate']);}
 if(['savePlaces','addLocation','removeLocation'].includes(action)){capturePlaces();settings.locations??=[];if(action==='addLocation'){settings.locations.push({id:crypto.randomUUID(),category:'yacht',name:'새 장소',status:'candidate',address:'',mapUrl:'',parking:'',contact:''});dirty=true;}else if(action==='removeLocation'){settings.locations.splice(Number(b.dataset.index),1);dirty=true;}else await saveSettings([]);}
 if(action==='retention'){const out=await api('admin/retention','POST',{});notice='만료 상담 '+out.deleted+'건을 정리했습니다.';}
 if(action==='savePrivacy')await saveSettings(['privacyController','privacyContact','retentionDays','privacyText','consentVersion','accepting']);
 if(action==='refreshJobs')await load();
 if(action==='runJob'){const r=await api('admin/jobs/run','POST',{kind:b.dataset.kind,id:b.dataset.id});notice='처리 상태: '+r.state;await load();}
 if(action==='toggleUser'){const u=users.find(x=>x.id===b.dataset.id);await api('admin/users/'+u.id,'PATCH',{role:u.role,active:!u.active});notice='사용 상태를 변경하고 기존 로그인 세션을 회수했습니다.';await load();}
 if(action==='createStaff'){await api('admin/users','POST',{username:val('staffName'),password:val('staffPassword'),role:val('staffRole')});notice='직원 계정을 생성했습니다. 첫 로그인 시 비밀번호를 변경해야 합니다.';dirty=false;await load();}
 if(action==='password'){await api('auth/password','POST',{username:val('accountUsername'),current:val('currentPassword'),password:val('newPassword')});clear();notice='로그인 정보가 변경되었습니다. 다시 로그인해 주세요.';}
 if(action==='subscribe'){if(!gates.vapid)throw Error('서버 푸시 키가 아직 연결되지 않았습니다.');if(!('PushManager'in window))throw Error('홈 화면 앱과 푸시 지원 브라우저에서 시도해 주세요.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('알림 권한이 허용되지 않았습니다. 접수함은 계속 사용할 수 있습니다.');const reg=await navigator.serviceWorker.ready;const str=gates.vapid.replace(/-/g,'+').replace(/_/g,'/');const key=Uint8Array.from(atob(str),c=>c.charCodeAt(0));const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await api('admin/push','POST',sub.toJSON());notice='이 기기 푸시 구독을 저장했습니다.';}
 if(action==='unsubscribe'){const reg=await navigator.serviceWorker.ready;await (await reg.pushManager.getSubscription())?.unsubscribe();await api('admin/push','DELETE',{});notice='푸시 구독을 해제했습니다.';}
}catch(err){notice=err.message;}finally{busy=false;render();if(action==='messageCustomer')composer.openStage(b.dataset.stage||(detail?.item.status==='closed'&&detail.item.communication?.reservation?'thanks':'receipt'));else if(['closeDetail','tab','detail','newReservation'].includes(action))window.scrollTo(0,0);}});
document.addEventListener('change',async ev=>{if(location.hash.startsWith('#admin')&&['productCategory','productState'].includes(ev.target.id)){if(busy)return;captureProduct();productCategory=val('productCategory');productState=val('productState');selectListedProduct();notice='';render();return;}if(ev.target.id!=='photoFile'||!ev.target.files?.length)return;const file=ev.target.files[0];if((products.find(p=>p.id===editId)?.media||[]).length>=12){notice='사진은 최대 12장입니다.';render();return;}if(file.size>1000000){notice='1MB 이하 이미지를 선택해 주세요.';render();return;}captureProduct();busy=true;try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const r=await api('admin/media','POST',{data,alt:val('photoAlt')||'상품 대표사진'});const p=products.find(p=>p.id===editId);p.media??=p.photo?[{url:p.photo,alt:p.name+' 대표사진'}]:[];if(p.media.length>=12)throw Error('사진은 최대 12장입니다.');p.media.push({url:r.url,alt:r.alt});p.photo=p.media[0].url;dirty=true;notice='사진 업로드 완료. 초안 저장 또는 게시를 눌러 적용하세요.';}catch(err){notice=err.message;}finally{busy=false;render();}});
window.addEventListener('beforeunload',ev=>{if(dirty||composer.isDirty()){ev.preventDefault();ev.returnValue='';}});
document.addEventListener('keydown',ev=>{if(!deletionPrompt)return;if(ev.key==='Escape'){ev.preventDefault();deletionPrompt=null;render();}else if(ev.key==='Tab'){const buttons=[...document.querySelectorAll('.deletion-confirmation button')];const first=buttons[0],last=buttons[buttons.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}}});
window.MomentLinkAdmin={mount,clear};
})();

