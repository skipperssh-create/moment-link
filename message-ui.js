/* Private composer: memory + authenticated API only; sending stays in the phone's SMS app. */
(() => {
'use strict';
const M=globalThis.MomentLinkMessages;
const P=globalThis.MomentLinkPricing;
const O=globalThis.MomentLinkOps;
const A=globalThis.MomentLinkAddOns;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let item=null,booking={},drafts={},paymentDeadline='',stage='receipt',prepared=false,pending=false,changed=false,templateDirty={},notice='',api,updated;
let catalog=null,catalogError='',catalogLoading=false,selection=null,selectionTouched=false,productSettings={};
const canChangeProduct=()=>item&&!item.integration&&['new','initial_unreachable','consulting','no_response','awaiting_payment','hold'].includes(item.status);
const selectedProduct=()=>catalog?.products.find(p=>p.id===selection?.productId);
const selectedPackage=()=>selectedProduct()?.packages.find(p=>p.id===selection?.packageId);
function resetSelection(){selection={productId:item?.product_id||item?.snapshot?.product?.id,packageId:item?.package_id||item?.snapshot?.package?.id,optionIds:(item?.snapshot?.options||[]).map(o=>o.id)};selectionTouched=false;}
function record(){
 if(!selectionTouched)return item;
 const p=selectedProduct(),pk=selectedPackage();if(!p||!pk)return item;
 const options=(pk.options||[]).filter(o=>selection.optionIds.includes(o.id)),optionAmount=options.reduce((sum,o)=>sum+o.amount,0);
 return {...item,category:p.category,product_id:p.id,package_id:pk.id,snapshot:{catalogVersion:catalog.version,product:{...p,packages:undefined},package:pk,options,price:{weekday:pk.weekday===null?null:pk.weekday+optionAmount,weekend:pk.weekend===null?null:pk.weekend+optionAmount,optionAmount},timezone:'Asia/Seoul'}};
}
async function loadProducts(){
 if(!canChangeProduct()||catalogLoading)return;
 const id=item.id;catalogLoading=true;catalogError='';
 try{const out=await api('catalog');if(item?.id!==id)return;if(!Array.isArray(out?.products))throw Error('상품 목록을 불러오지 못했습니다.');catalog=out;}
 catch(err){if(item?.id===id)catalogError=err.message;}
 finally{if(item?.id===id){catalogLoading=false;const el=document.getElementById('consultationProduct');if(el)el.innerHTML=productFields();}}
}
function productFields(){
 if(!canChangeProduct())return '<div class="workflow-current-product"><strong>'+esc(item.snapshot.product.name)+'</strong><span>'+esc(item.snapshot.package.name)+'</span></div>';
 if(!catalog)return '<p class="micro" role="status">'+esc(catalogError||'상품 목록을 불러오는 중입니다.')+'</p>'+(catalogError?actionButton('reloadProducts','refresh','상품 새로고침'):'');
 const p=selectedProduct(),pk=selectedPackage(),products=catalog.products.filter(x=>x.visible!==false&&!x.archived&&!x.salePaused);
 return '<div class="admin-cols product-selection"><div><label class="admin-label" for="msg_product">요트·상품</label><select class="admin-select" id="msg_product" data-product-field="productId" '+(pending?'disabled':'')+'>'+(!products.some(x=>x.id===selection.productId)?'<option value="'+esc(selection.productId)+'">'+esc(item.snapshot.product.name)+' · 기존 선택</option>':'')+products.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selection.productId?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div><div><label class="admin-label" for="msg_package">패키지</label><select class="admin-select" id="msg_package" data-product-field="packageId" '+(pending||!p?'disabled':'')+'>'+(!pk?'<option value="'+esc(selection.packageId)+'">'+esc(item.snapshot.package.name)+' · 기존 선택</option>':'')+(p?.packages||[]).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selection.packageId?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div></div>'+(pk?.options?.length?'<div class="product-options"><span class="admin-label">상품 선택 옵션</span>'+pk.options.map(o=>'<label class="inline-check"><input type="checkbox" data-product-option="'+esc(o.id)+'" '+(selection.optionIds.includes(o.id)?'checked':'')+' '+(pending||o.requiresOptionId&&!selection.optionIds.includes(o.requiresOptionId)?'disabled':'')+'/><span>'+esc(o.name)+' · '+A.money(o.amount)+'</span></label>').join('')+'</div>':'')+'<p class="micro product-change-hint">'+(selectionTouched?'변경한 상품의 날짜별 요금을 적용했습니다. 예약사항을 저장해 주세요.':'요트와 라이트·올인원을 여기서 변경할 수 있습니다.')+'</p>';
}
function focusSection(id){const el=document.getElementById(id);el?.scrollIntoView({behavior:'smooth',block:'start'});}
const root=()=>document.getElementById('messageComposer');
const value=id=>document.getElementById(id)?.value||'';
const actionIcons={cart:'M3 3h2l3 12h11l2-8H6 M9 20h.01 M18 20h.01',save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2z M7 3v6h10V3 M7 21v-8h10v8',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 11h18 m-13 5 3 3 5-5',copy:'M9 9h12v12H9z M15 5V3H3v12h2',check:'m5 12 4 4L19 6',chat:'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2z M7 9h10 M7 13h6'};
const actionIcon=name=>`<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${actionIcons[name]}"/></svg>`;
const actionCaptions={bookingSave:'예약 저장',reserve:'예약 확정',autoAmount:'요금 적용',regenerate:'문구 갱신',save:'문자 준비',copy:'문구 복사',sent:'발송 기록'};
const actionButton=(action,name,label,primary=false)=>`<button type="button" class="admin-icon-button ${primary?'icon-primary':''}" data-message="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${pending?'disabled':''}>${actionIcon(name)}<span class="admin-action-text">${esc(pending?'처리 중':action==='reserve'&&item?.status==='confirmed'?'수정·확정':actionCaptions[action]||label)}</span></button>`;
function reveal(){const panel=document.getElementById('detailMessages');if(panel)panel.open=true;}
function reset(){item=null;booking={};drafts={};paymentDeadline='';prepared=false;pending=false;changed=false;templateDirty={};notice='';catalog=null;catalogError='';catalogLoading=false;selection=null;selectionTouched=false;}
function regenerate(){drafts=Object.fromEntries(Object.keys(M.stages).map(s=>[s,M.templateOnly(s)&&drafts[s]!==undefined?drafts[s]:M.generate(record(),s,booking,paymentDeadline)]));}
function init(r,request,onUpdate,settings={}){
 api=request;updated=onUpdate;productSettings=settings;
 if(item?.id!==r.id){reset();item=r;resetSelection();booking=M.defaults(r,settings);paymentDeadline=r.communication?.paymentDeadline||M.paymentDeadlineFrom();stage='receipt';regenerate();if(['date','time','amount','place'].every(k=>r.communication?.booking?.[k]===booking[k]))drafts=M.prepareDrafts(r,{...drafts,...r.communication?.drafts},paymentDeadline,booking);for(const key of ['intent','payment_reminder']){if(r.communication?.drafts?.[key]!==undefined&&(key!=='payment_reminder'||r.communication.paymentReminderFor===r.awaiting_payment_at))drafts[key]=r.communication.drafts[key];}}
 else item=r;
 if(canChangeProduct()&&(r.product_id||r.snapshot?.product?.id)&&!catalog&&!catalogError&&!catalogLoading)void loadProducts();
 if(O.eligible(r)){booking.opsPax??=2;O.load(api).then(()=>{if(item?.id===r.id){const el=document.getElementById("messageOpsFields");if(el)el.innerHTML=O.fields(record(),booking,"msg",pending);const extras=document.getElementById('messageAddOns');if(extras&&!changed)extras.innerHTML=A?.html(booking,'msg_addon',pending||!!item.integration&&!editableAddOns())||'';}}); }
}
function openStage(next='receipt',message=''){reveal();if(M.stages[next])stage=next;if(stage==='payment_reminder'&&item.communication?.paymentReminderFor!==item.awaiting_payment_at)drafts[stage]=M.generate(item,stage,booking);prepared=false;notice=message;render();focusSection(message?'workflowBooking':'workflowMessages');}
function confirmation(){
 if(selectionTouched)throw Error('변경한 상품을 먼저 예약사항 저장해 주세요.');
 const problem=M.validate('confirmed',booking,record())||O.validate(item,booking);if(problem)throw Error(problem);
 if(!drafts.confirmed?.trim())throw Error('예약 확정 안내 내용을 입력해 주세요.');
 return {booking:{...booking},drafts:{...drafts},approved:true};
}
function refreshStatus(){prepared=false;if(stage==='payment_reminder'&&item.status!=='awaiting_payment')stage='receipt';if(item.status==='awaiting_payment')drafts.payment_reminder=M.generate(item,'payment_reminder',booking);render();}
function acceptConfirmation(r){
 item=r;booking={...r.communication.booking};drafts={...r.communication.drafts};paymentDeadline=r.communication.paymentDeadline||paymentDeadline;
 stage='confirmed';prepared=true;changed=false;notice='예약을 확정했습니다. 문자 앱 열기 버튼으로 예약 확정 문자를 준비할 수 있습니다.';render();
}
const editableAddOns=()=>item?.status==='confirmed'&&!!item.communication?.reservation&&(!item.integration||item.integration.state==='succeeded'&&!!item.integration.external_id);
function addOnControls(){return editableAddOns()?`<div class="reservation-confirm-actions">${actionButton('addonsSave','save','옵션 저장',true)}</div><p class="micro">옵션과 추가금만 저장합니다. 연결된 OPS의 총액·잔액에 자동 반영하며, 이미 받은 금액은 유지합니다. 환불이 필요하면 OPS에서 먼저 확인해 주세요.</p>${item.communication?.opsPayment?.balance>0?`<p class="micro">OPS 미수금 · ${A.money(item.communication.opsPayment.balance)}</p>`:''}`:'';}
function reservationControls(){
 const revise=item.integration?.state==='conflict'&&!item.integration.external_id&&[undefined,null,'registration_revision'].includes(item.integration.operation)&&['OPS_RESOURCE_CONFLICT','OPS_SCHEDULE_REVIEW_REQUIRED'].includes(item.integration.error_code);
 if(revise&&item.status==='confirmed'&&item.communication?.reservation)return `<div class="reservation-confirm"><p>이전 일정은 OPS에 등록되지 않았습니다. 새 날짜·시간과 입금을 확인한 뒤 ‘수정·확정’을 눌러 주세요.</p>${actionButton('reserve','calendar','수정·확정',true)}<p class="micro">새 일정으로 OPS 등록이 확인되면 확정 날짜를 변경합니다. 이전 오류 기록과 금액·입금·메모는 보존합니다.</p></div>`;
 if(item.integration&&item.integration.state!=='succeeded')return `<p class="micro" role="status">${item.integration.operation==='restore'?'OPS 복원 결과를 확인 중입니다. 완료 전까지 취소 상태가 유지됩니다.':item.integration.operation==='cancel'?'OPS 취소 결과를 확인 중입니다. 완료 전까지 기존 예약 상태가 유지됩니다.':['reschedule','registration_revision'].includes(item.integration.operation)?'OPS 일정 변경 결과를 확인 중입니다. 반영 완료 전까지 기존 확정 일정이 유지됩니다.':'BOATN OPS 등록이 완료된 후 수정·확정할 수 있습니다.'} 아래 OPS 상태를 확인해 주세요.</p>`;
 if(item.status==='cancelled'||item.status==='closed'&&item.communication?.reservation)return '';
 if(item.status==='confirmed'&&!item.communication?.reservation)return '<p class="micro">OPS에서 확정된 예약입니다. 일정 변경은 OPS에서 확인해 주세요.</p>';
 return `<div class="reservation-confirm"><p>${item.status==='confirmed'?'변경한 일정과 입금을 확인한 뒤 ‘수정·확정’을 눌러 주세요.':'입금 전에는 예약사항을 저장하고, 예약금 입금 확인 후 예약을 확정해 주세요. 잔금이 있어도 확정됩니다.'}</p><div class="reservation-confirm-actions">${actionButton('reserve','calendar',item.status==='confirmed'?'수정·확정':'예약 확정',true)}</div><p class="micro booking-save-feedback" role="status">${esc(notice)}</p><p class="micro">${item.integration?'상담 상태를 되돌려도 OPS 예약 일정은 유지됩니다. 날짜·시간은 연결된 OPS 예약에도 자동 반영합니다. 추가 구매는 ‘옵션 저장’으로 반영하며, 장소·인원·결제수단은 유지합니다. 상태 메뉴에서 취소하면 OPS에도 자동 반영합니다.':'확정하면 ‘확정 예약’ 목록에서 관리합니다.'} 문자 발송은 아래에서 별도로 진행합니다.</p></div>`;
}
const field=(key,label,type='text')=>{const locked=pending||!!item.integration&&['amount','place'].includes(key);return `<div class="${key==='place'?'booking-address-field':''}"><label class="admin-label" for="msg_${key}">${label}</label>${type==='time'?globalThis.MomentLinkTime.html('msg_'+key,label,booking[key],'data-message-field="'+key+'" '+(locked?'disabled':'')):key==='place'?`<textarea class="admin-input message-place" data-booking-address data-message-field="place" id="msg_place" rows="3" maxlength="500" ${locked?'disabled':''}>${esc(booking.place)}</textarea>`:`<input class="admin-input" data-message-field="${key}" id="msg_${key}" type="${type}" value="${esc(key==='amount'?A.base(booking):booking[key])}" ${locked?'disabled':''} ${type==='number'?'min="0" max="100000000" step="1"':''}/>`}</div>`;};
function pricingHint(){
 if(item.integration)return '<p class="micro">기본 예약 금액은 유지합니다. 추가 구매 옵션은 아래 ‘옵션 저장’으로 변경할 수 있습니다.</p>';
 const quote=P.quote(record(),booking.date),options=record().snapshot?.price?.optionAmount??(record().snapshot?.options||[]).reduce((sum,o)=>sum+(o.amount||0),0);
 return `<p class="micro" role="status">${esc(booking.amountMode==='auto'?'자동 반영 · '+quote.label:'직접 입력 · 저장된 금액 유지')}${options?' · 선택 옵션 '+options.toLocaleString('ko-KR')+'원 합산':''}</p>${record().category==='yacht'?`<p class="micro">${esc(P.policy)}</p>`:''}${actionButton('autoAmount','refresh','날짜 요금 적용')}`;
}
function refreshPrice(){
 document.getElementById('msg_amount').value=A.base(booking)??'';
 document.getElementById('messagePricing').innerHTML=pricingHint();
}
function quoteSummary(){
 let extra;try{extra=A.total(booking.addOns);}catch{extra=null;}
 const rows=(booking.addOns||[]).map(row=>{const option=A.catalog.find(o=>o.id===row.id);return esc(option?.label||row.id)+' × '+esc(row.quantity??'');});
 return '<div class="consultation-quote-copy"><span class="micro">예약 총액 · 기본 금액 + 추가상품</span><strong data-quote-total>'+A.money(booking.amount)+'</strong><span class="micro" data-quote-extra>기본 '+A.money(A.base(booking))+' + 추가 '+A.money(extra)+'</span><span class="micro" data-quote-items>'+(rows.length?rows.join(' · '):'추가상품을 선택하면 금액이 합산됩니다.')+'</span></div>'+actionButton('purchases','cart','추가상품');
}
function html(middleHTML=''){
 if(!item)return '';
 const error=M.validate(stage,booking,record()),events=item.communication?.events||[];
 const href=prepared&&!error?M.smsURI(item.phone,drafts[stage],navigator.userAgent,navigator.platform,navigator.maxTouchPoints):'';
 return `<section class="message-composer" id="messageComposer" aria-labelledby="messageHeading"><h3 class="visually-hidden" id="messageHeading">상담·예약 관리</h3><nav class="workflow-nav" aria-label="상담 진행 순서"><button type="button" data-message="jump" data-section="workflowBooking"><span>01</span>예약사항</button><button type="button" data-message="jump" data-section="workflowNotes"><span>02</span>상담 메모</button><button type="button" data-message="jump" data-section="workflowConfirm"><span>03</span>예약 확정</button><button type="button" data-message="jump" data-section="workflowMessages"><span>04</span>문자 안내</button></nav><section class="workflow-section" id="workflowBooking"><h3>1. 상품·일정·금액</h3><div id="consultationProduct">${productFields()}</div><div class="consultation-quote" id="bookingQuoteSummary" aria-live="polite">${quoteSummary()}</div><div class="message-booking"><div class="admin-cols booking-schedule-grid">${field('date','이벤트 날짜','date')}${field('time','협의한 시간','time')}${field('place','안내할 장소·주소')}</div><div class="booking-amount-row">${field('amount','기본 예약 금액 (원)','number')}<div id="messagePricing">${pricingHint()}</div></div><div id="messageAddOns">${A.html(booking,'msg_addon',pending||!!item.integration&&!editableAddOns())}</div>${addOnControls()}${M.depositFields(booking,'msg',pending)}${field('extra','추가 안내 (선택)')}</div><div id="messageOpsFields">${O.fields(record(),booking,'msg',pending)}</div><div class="workflow-save-row">${canChangeProduct()?actionButton('bookingSave','save','예약사항 저장',true):''}<p class="micro booking-save-feedback" role="status">${esc(notice||'상품·옵션·일정·금액을 저장합니다. 입금 전에도 저장할 수 있습니다.')}</p></div></section><section class="workflow-section" id="workflowNotes"><h3>2. 상담 메모·담당</h3><div id="workflowNotesContent">${middleHTML}</div></section><section class="workflow-section" id="workflowConfirm"><h3>3. 예약 확정</h3>${M.paymentFields(booking,'msg',pending||!!item.integration)}<div class="message-checks"><label class="inline-check"><input type="checkbox" data-message-field="scheduleConfirmed" id="msg_scheduleConfirmed" ${pending?'disabled':''} ${booking.scheduleConfirmed?'checked':''}/> 일정·장소를 고객과 확정했습니다</label><label class="inline-check"><input type="checkbox" data-message-field="paymentConfirmed" id="msg_paymentConfirmed" ${pending?'disabled':''} ${booking.paymentConfirmed?'checked':''}/> 예약금 또는 완납 입금을 확인했습니다</label></div>${reservationControls()}</section><section class="workflow-section" id="workflowMessages"><h3>4. 문자 안내</h3><p class="micro">${esc(item.phone)} · 단계를 선택하고 안내 내용을 확인해 주세요.</p><div class="message-stages" role="group" aria-label="문자 안내 단계">${Object.entries(M.stages).filter(([id])=>id!=='payment_reminder'||item.status==='awaiting_payment').map(([id,n],i)=>`<button type="button" class="secondary" data-message="stage" data-stage="${id}" aria-pressed="${id===stage}" ${pending?'disabled':''}>${M.templateOnly(id)?'':(i+1)+'. '}${n}</button>`).join('')}</div>${stage==='payment_reminder'?'<p class="micro">입금대기로 변경한 시각부터 2시간이 지나면 준비할 수 있습니다. 입금 여부와 진행 의사를 확인해 주세요.</p>':''}${stage==='intent'?'<p class="micro">일정·금액 확정 전에도 보낼 수 있습니다. 예약 거절 회신을 받으면 담당자가 상담 상태와 후속 안내를 정리해 주세요.</p>':''}${error&&notice?`<p class="message-notice" role="alert">${esc(notice)}</p>`:''}<label class="admin-label" for="messageBody">${M.stages[stage]} · 보낼 내용</label><textarea class="admin-input message-body" id="messageBody" rows="14" maxlength="5000" ${pending?'disabled':''}>${esc(drafts[stage]||'')}</textarea>${stage==='receipt'&&item.status==='awaiting_payment'?'<p class="micro">입금 기한은 입금대기로 변경한 시각부터 2시간입니다. 문자 재준비로 연장되지 않습니다.</p>':stage==='receipt'&&record().category==='yacht'?'<p class="micro">입금 기한은 ‘저장하고 문자 준비’를 누른 시각부터 2시간 뒤로 계산됩니다. 날짜·시간은 한국 시간 기준입니다.</p>':''}<p class="micro" id="messageLength">${(drafts[stage]||'').length.toLocaleString('ko-KR')}자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.</p><div class="message-actions">${actionButton('regenerate','refresh','기본 문구로 다시 만들기')}${actionButton('save',pending?'refresh':'save',pending?'저장 중…':'저장하고 문자 준비',true)}</div><div class="message-send" id="messageSend">${href?`<p class="micro">${esc(item.phone)} · 저장된 안내 문자</p><div class="message-actions"><a class="admin-icon-button icon-primary" data-message="sms" href="${esc(href)}" aria-label="문자 앱 열기" title="문자 앱 열기">${actionIcon('chat')}<span class="admin-action-text">문자 열기</span></a>${actionButton('copy','copy','문구 복사')}${actionButton('sent','check','휴대폰 발송 완료 기록')}</div>`:'<p class="micro">내용 확인 후 ‘저장하고 문자 준비’를 눌러 주세요.</p>'}</div><p class="micro">휴대폰 문자 앱에 번호와 내용이 채워집니다. 마지막 전송 버튼은 직접 눌러 주세요. 기기에서 본문이 채워지지 않으면 문구 복사를 이용해 주세요. PC에서도 복사할 수 있습니다.</p><p class="message-notice" id="messageNotice" role="status">${esc(notice)}</p>${events.length?`<details><summary>문자 안내 기록 (${events.length})</summary><ul class="message-history">${events.slice().reverse().map(x=>`<li>${esc(M.stages[x.stage])} · ${x.kind==='manual_sent'?'담당자 발송 확인':'문자 앱 열기 요청'}<span class="micro">${esc(new Date(x.at).toLocaleString('ko-KR'))} · ${esc(x.actor)}</span></li>`).join('')}</ul><p class="micro">문자 앱 열기 요청은 발송 완료가 아닙니다. 발송 확인은 담당자가 기록한 상태이며 수신 확인과 다릅니다.</p></details>`:''}</section></section>`;
}
function render(){
 const el=root();if(!el)return;
 const middle=document.getElementById('workflowNotesContent'),active=document.activeElement,activeId=active&&el.contains?.(active)?active.id:'';
 const top=active?.getBoundingClientRect?.().top;
 el.outerHTML=html();M.fitAddresses(root());
 if(middle)document.getElementById('workflowNotesContent')?.replaceWith?.(middle);
 const restored=activeId&&document.getElementById(activeId);restored?.focus?.({preventScroll:true});
 if(restored&&Number.isFinite(top)&&typeof window.scrollBy==='function')window.scrollBy(0,restored.getBoundingClientRect().top-top);
}
function feedback(message){notice=message;for(const el of document.querySelectorAll?.('.booking-save-feedback')||[])el.textContent=message;const el=document.getElementById('messageNotice');if(el)el.textContent=message;}
function invalidate(){prepared=false;changed=true;const summary=document.getElementById('bookingQuoteSummary');if(summary)summary.innerHTML=quoteSummary();const el=document.getElementById('messageSend');if(el)el.innerHTML='<p class="micro">변경 내용을 저장한 뒤 문자 앱을 열어 주세요.</p>';}
function length(){const el=document.getElementById('messageLength');if(el)el.textContent=(drafts[stage]||'').length.toLocaleString('ko-KR')+'자 · 긴 문자는 통신사 요금제에 따라 요금이 발생할 수 있습니다.';}
document.addEventListener('change',ev=>{
 if(!root()?.contains(ev.target)||pending||!canChangeProduct()||!catalog)return;
 const key=ev.target.dataset.productField,option=ev.target.dataset.productOption;if(!key&&!option)return;
 const oldCategory=record().category;
 if(key){selection[key]=ev.target.value;selection.optionIds=[];if(key==='productId'){const p=selectedProduct();if(!p?.packages.some(x=>x.id===selection.packageId))selection.packageId=p?.packages[0]?.id||'';}}
 if(option){const choices=selectedPackage()?.options||[],row=choices.find(x=>x.id===option);if(!row)return;selection.optionIds=selection.optionIds.filter(x=>x!==option&&(!ev.target.checked||!row.group||choices.find(o=>o.id===x)?.group!==row.group));if(ev.target.checked)selection.optionIds.push(option);selection.optionIds=selection.optionIds.filter(x=>{const o=choices.find(o=>o.id===x);return o&&(!o.requiresOptionId||selection.optionIds.includes(o.requiresOptionId));});}
 selectionTouched=true;
 if(record().category!==oldCategory)booking.place=record().category==='yacht'?P.location(productSettings):'';
 if(record().category==='yacht')booking.opsPax??=2;
 booking.amountMode='auto';booking.baseAmount=P.quote(record(),booking.date).amount;A.recalculate(booking);booking.scheduleConfirmed=false;booking.paymentConfirmed=false;
 regenerate();invalidate();notice='상품 변경 내용을 예약사항 저장해 주세요.';render();
 if(O.eligible(record())){const target=item.id;O.load(api).then(()=>{if(item?.id!==target)return;const el=document.getElementById('messageOpsFields');if(el)el.innerHTML=O.fields(record(),booking,'msg',pending);});}
});
document.addEventListener('input',ev=>{
 if(!root()?.contains(ev.target)||pending)return;
 if(ev.target.id==='messageBody'){drafts[stage]=ev.target.value;if(M.templateOnly(stage)){templateDirty[stage]=true;prepared=false;}else invalidate();length();return;}
 if(ev.target.dataset.addonToggle||ev.target.dataset.addonField){
  if(item.integration&&!editableAddOns())return;
  if(ev.target.dataset.addonToggle)A.toggle(booking,ev.target.dataset.addonToggle,ev.target.checked);
  else A.edit(booking,ev.target.dataset.addonId,ev.target.dataset.addonField,ev.target.value);
  booking.paymentConfirmed=false;regenerate();invalidate();notice='';
  if(ev.target.dataset.addonToggle){const focus=ev.target.id;render();document.getElementById(focus)?.focus({preventScroll:true});}
  else{document.getElementById('msg_paymentConfirmed').checked=false;document.getElementById('messageBody').value=drafts[stage];length();for(const [selector,amount] of [['[data-addon-base]',A.base(booking)],['[data-addon-total]',(()=>{try{return A.total(booking.addOns);}catch{return null;}})()],['[data-booking-total]',booking.amount]])root().querySelector(selector).textContent=A.money(amount);}
  M.paintPayment(root(),booking);return;
 }
 const key=ev.target.dataset.messageField;if(!key)return;
 booking[key]=ev.target.type==='checkbox'?ev.target.checked:['amount','receivedAmount','requestedDepositAmount','opsPax'].includes(key)?(ev.target.value===''?null:Number(ev.target.value)):ev.target.value;
 if(key==='useDeposit'){if(!booking.useDeposit)booking.requestedDepositAmount=null;M.paintDeposit(root(),booking);}
 if(key==='amount'){booking.amountMode='manual';booking.baseAmount=booking.amount;A.recalculate(booking);}
 if(key==='date'&&item.integration)booking.amountMode='manual';
 if(key==='date'&&booking.amountMode==='auto'){
  const amount=P.quote(record(),booking.date).amount;
  if(booking.amount!==amount){booking.paymentConfirmed=false;document.getElementById('msg_paymentConfirmed').checked=false;}
  booking.baseAmount=amount;A.recalculate(booking);
 }
 if(['date','amount'].includes(key)){refreshPrice();document.getElementById('messageAddOns').innerHTML=A.html(booking,'msg_addon',pending||!!item.integration&&!editableAddOns());}
 if(key==='amount')document.getElementById('messagePricing').innerHTML=pricingHint();
 if(['date','time','place'].includes(key)){booking.scheduleConfirmed=false;document.getElementById('msg_scheduleConfirmed').checked=false;}
 if(['amount','receivedAmount'].includes(key)){booking.paymentConfirmed=false;document.getElementById('msg_paymentConfirmed').checked=false;}
 if(!['scheduleConfirmed','paymentConfirmed'].includes(key)){regenerate();document.getElementById('messageBody').value=drafts[stage];length();}
 M.paintPayment(root(),booking);if(key==='place')M.fitAddresses(root());
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
 if(action==='purchases'){ev.preventDefault();focusSection('messageAddOns');return;}
 if(action==='jump'){ev.preventDefault();focusSection(b.dataset.section);return;}
 if(action==='reloadProducts'){ev.preventDefault();if(!pending)void loadProducts();return;}
 if(pending){ev.preventDefault();return;}
 if(action==='sms'){
  if(!prepared||(M.templateOnly(stage)?templateDirty[stage]:changed)){ev.preventDefault();feedback('먼저 변경 내용을 저장해 주세요.');return;}
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
 if(action==='stage'){stage=b.dataset.stage;if(stage==='payment_reminder'&&item.communication?.paymentReminderFor!==item.awaiting_payment_at)drafts[stage]=M.generate(item,stage,booking);prepared=false;notice='';render();return;}
 if(action==='fullPayment'){
  if(item.integration)return;
  const problem=M.applyFullPayment(booking);if(problem){feedback(problem);render();return;}
  regenerate();invalidate();notice='완납 금액을 입력했습니다. 내용을 확인한 뒤 예약사항 저장 또는 예약 확정을 눌러 주세요.';render();return;
 }
 if(action==='autoAmount'){booking.amountMode='auto';booking.baseAmount=P.quote(record(),booking.date).amount;A.recalculate(booking);booking.paymentConfirmed=false;regenerate();invalidate();notice='선택 날짜와 추가 옵션 금액을 반영했습니다. 내용을 확인해 주세요.';render();return;}
 if(action==='regenerate'){drafts[stage]=M.generate(record(),stage,booking,paymentDeadline);if(M.templateOnly(stage)){templateDirty[stage]=true;prepared=false;}else invalidate();notice='기본 문구를 다시 만들었습니다.';render();return;}
 if(action==='copy'){
  const problem=!prepared||(M.templateOnly(stage)?templateDirty[stage]:changed)?'먼저 변경 내용을 저장해 주세요.':M.paymentDeadlineError(item,stage,paymentDeadline);
  if(problem){prepared=false;feedback(problem);render();return;}
  try{await navigator.clipboard.writeText(drafts[stage]);feedback('문구를 복사했습니다.');}catch{document.getElementById('messageBody').select();feedback('문구를 선택했습니다. 복사 메뉴를 사용해 주세요.');}return;
 }
 if(action==='addonsSave'){
  let saved=false;
  const target=item.id,old=item.communication.booking;
  const problem=A.problem(booking);if(problem){feedback(problem);render();return;}
  if(['date','time','place','extra'].some(key=>booking[key]!==old[key])){feedback('일정·추가 안내 변경을 먼저 저장한 뒤 옵션을 수정해 주세요.');render();return;}
  pending=true;notice='옵션을 저장하고 있습니다…';render();
  try{const out=await api('admin/consultations/'+target+'/addons','POST',{version:item.version,addOns:booking.addOns||[]});
   if(item?.id!==target)return;
   item=out.item;booking=M.defaults(item);drafts={...item.communication.drafts};updated(item);prepared=false;changed=false;saved=true;
   const panel=document.getElementById('boatnOpsStatus');if(panel){panel.outerHTML=O.panel(item);O.mount(item,api);}
   notice=item.integration&&item.integration.state!=='succeeded'?'OPS 옵션 반영 결과를 확인 중입니다. 아래 OPS 상태를 확인해 주세요.':'옵션과 추가금을 저장했습니다.';
  }catch(err){if(item?.id===target)notice='저장하지 못했습니다. '+err.message;}
  finally{if(item?.id===target){pending=false;render();if(saved)document.dispatchEvent(new CustomEvent('ml:reservation-options-updated',{detail:{item}}));}}return;
 }
 if(selectionTouched&&(!M.templateOnly(stage)||action==='reserve')&&['save','reserve','copy','sent','sms'].includes(action)){feedback('변경한 상품을 먼저 예약사항 저장해 주세요.');focusSection('workflowBooking');return;}
 if(action==='bookingSave'){
  const target=item.id,problem=M.amountError(booking,record());if(problem){feedback(problem);render();return;}
  pending=true;notice='예약사항 저장 중…';render();
  try{const out=selectionTouched?await api('admin/consultations/'+target+'/product','POST',{version:item.version,selection:{...selection,catalogVersion:catalog.version},booking}):await api('admin/consultations/'+target+'/communications','PUT',{version:item.version,booking,drafts});
   if(item?.id!==target)return;
   item=out.item;booking=M.defaults(item);drafts={...item.communication.drafts};updated(item);prepared=false;changed=false;resetSelection();notice='예약사항을 저장했습니다. 예약 확정·OPS 등록·문자 발송은 진행하지 않았습니다.';
  }catch(err){if(item?.id===target){prepared=false;notice='저장하지 못했습니다. '+err.message;}}
  finally{if(item?.id===target){pending=false;render();}}
  return;
 }
 pending=true;render();
 try{
  if(action==='save'||action==='reserve'){
   if(action==='reserve')stage='confirmed';
   const problem=M.validate(stage,booking,record())||(action==='reserve'?O.validate(item,booking):'');if(problem)throw Error(problem);
   if(!drafts[stage]?.trim())throw Error('보낼 내용을 입력해 주세요.');
   const templateOnly=action==='save'&&M.templateOnly(stage);
   const target=item.id,out=await api('admin/consultations/'+target+(action==='reserve'?'/reservation':'/communications'),action==='reserve'?'POST':'PUT',templateOnly?{version:item.version,prepareStage:stage,drafts:{[stage]:drafts[stage]}}:{version:item.version,booking,drafts,...(action==='reserve'?{approved:true}:{prepareStage:stage})});
   if(item?.id!==target)return;
   item=out.item;if(templateOnly){drafts[stage]=item.communication.drafts[stage];delete templateDirty[stage];}else{booking={...item.communication.booking};drafts={...item.communication.drafts};paymentDeadline=item.communication.paymentDeadline||paymentDeadline;changed=false;templateDirty={};}updated(out.item);prepared=templateOnly||!(['reschedule','registration_revision'].includes(item.integration?.operation)&&item.integration.state!=='succeeded');notice='저장했습니다. 문자 앱 열기 버튼을 누르면 문자 앱으로 연결됩니다.';
   if(action==='save'&&stage==='receipt'&&(item.category==='yacht'||item.status==='awaiting_payment'))notice='입금 기한을 '+M.paymentDeadlineLabel(paymentDeadline)+'으로 반영했습니다. 문구를 확인한 뒤 문자 앱 열기 버튼을 눌러 주세요.';
   if(action==='reserve'){notice=['reschedule','registration_revision'].includes(item.integration?.operation)?(item.integration.state==='succeeded'?'수정·확정했습니다. 변경한 일정이 OPS에도 반영되었습니다.':'OPS 일정 변경이 아직 완료되지 않았습니다. 기존 확정 일정은 유지되며 아래 OPS 상태에서 결과를 확인할 수 있습니다.'):'예약을 확정했습니다. 예약 확정 문자를 보낼 수 있습니다.';document.dispatchEvent(new CustomEvent('ml:reservation-confirmed',{detail:{id:target,message:notice}}));}
  }
  if(action==='sent'){
   if(!prepared||(M.templateOnly(stage)?templateDirty[stage]:changed))throw Error('변경 내용을 먼저 저장해 주세요.');
   if(!confirm('휴대폰 문자 앱에서 실제 전송을 완료했나요? 완료한 경우에만 기록해 주세요.'))return;
   await log('manual_sent');notice='담당자의 발송 확인을 기록했습니다.';
  }
 }catch(err){prepared=false;notice=err.message;}
 finally{pending=false;render();}
});
window.MomentLinkComposer={init,html,clear:reset,isDirty:()=>changed||Object.values(templateDirty).some(Boolean),isBusy:()=>pending,openStage,confirmation,acceptConfirmation,refreshStatus,focusConfirmation(){focusSection('workflowConfirm');},focus(){reveal();focusSection('workflowMessages');}};
})();
