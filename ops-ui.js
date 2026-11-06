/* BOATN uses its own availability and atomic booking writer. No customer data is stored here. */
(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let metadata=null,loading=null,panelTimer=null,panelGeneration=0;
const eligible=r=>r?.category==='yacht'&&['classic','premium','signature'].includes(r.product_id||r.snapshot?.product?.id)&&['light','all'].includes(r.package_id||r.snapshot?.package?.id);
async function load(api){
 if(loading)return loading;
 loading=api('admin/ops/boatn').then(x=>{metadata=x;globalThis.MomentLinkAddOns?.setPrices(x.addOnPrices);return x;}).catch(()=>{metadata={enabled:false,error:true,paymentMethods:[]};return metadata;}).finally(()=>{loading=null;});
 return loading;
}
function fields(r,b,prefix,disabled=false){
 if(!eligible(r))return r?.category==='yacht'?'<p class="micro">정박 상품은 실제 이용 요트를 정한 후 BOATN OPS에서 등록해 주세요.</p>':'';
 const methods=metadata?.paymentMethods||[],known=methods.some(m=>m.id===b.opsPaymentMethod),locked=disabled||!!r.integration;
 return `<div class="info"><h3>BOATN OPS 자동 등록</h3><p class="micro">예약 확정 시 요트 일정과 잔여 인원을 확인한 뒤 자동 등록합니다.</p><div class="admin-cols"><div><label class="admin-label" for="${prefix}_opsPax">탑승 인원</label><input class="admin-input" id="${prefix}_opsPax" data-message-field="opsPax" type="number" min="1" max="63" step="1" value="${esc(b.opsPax??2)}" ${locked?'disabled':''}/></div><div><label class="admin-label" for="${prefix}_opsPaymentMethod">입금 확인한 결제수단</label><select class="admin-select" id="${prefix}_opsPaymentMethod" data-message-field="opsPaymentMethod" ${locked?'disabled':''}><option value="">결제수단 선택</option>${b.opsPaymentMethod&&!known?`<option value="${esc(b.opsPaymentMethod)}" selected>${esc(b.opsPaymentMethod)} · 저장된 결제수단</option>`:''}${methods.map(m=>`<option value="${esc(m.id)}" ${b.opsPaymentMethod===m.id?'selected':''}>${esc(m.label)}</option>`).join('')}</select></div></div>${!metadata?'<p class="micro">OPS 연결 정보를 확인하고 있습니다.</p>':!metadata.enabled||!metadata.installed?'<p class="micro" role="status">OPS 연결을 확인하지 못했습니다. 잠시 후 화면을 다시 열어 주세요.</p>':''}</div>`;
}
function validate(r,b){
 if(!eligible(r))return '';
 if(!metadata?.enabled||!metadata.installed)return 'BOATN OPS 연결을 확인한 뒤 예약을 확정해 주세요.';
 if(b.addOns?.length&&!metadata.addOnPurchases)return 'OPS 추가 구매 연결을 확인한 뒤 예약을 확정해 주세요. 예약사항 저장은 가능합니다.';
 if(r.integration?.state==='succeeded'&&!metadata.scheduleUpdates)return 'OPS 일정 변경 기능을 확인하고 있습니다. 잠시 후 다시 열어 주세요.';
 if(!Number.isSafeInteger(b.opsPax)||b.opsPax<1||b.opsPax>63)return '탑승 인원을 입력해 주세요.';
 if(!metadata.paymentMethods.some(m=>m.id===b.opsPaymentMethod))return '입금을 확인한 결제수단을 선택해 주세요.';
 if(Number(b.time?.split(':')[1])%(metadata.minuteStep||10))return `OPS 출항 시간은 ${metadata.minuteStep||10}분 단위로 선택해 주세요.`;
 return '';
}
const states={pending:'등록 대기',checking:'등록 확인 중',succeeded:'등록 완료',failed:'연결 실패',uncertain:'등록 결과 확인 중',blocked:'연결 확인 필요',conflict:'담당자 확인 필요'};
const reasons={OPS_ADDONS_UNAVAILABLE:'OPS 추가 구매 연결을 확인해 주세요. 선택한 옵션과 금액은 보존되어 있습니다.',OPS_RESOURCE_CONFLICT:'같은 요트의 일정이 겹치거나 운항이 제한되어 있습니다.',OPS_SCHEDULE_REVIEW_REQUIRED:'OPS에서 운항 가능 일정과 탑승 인원을 확인해 주세요.',OPS_DUPLICATE_REVIEW_REQUIRED:'같은 고객·시간의 예약이 있습니다. OPS 기존 예약을 확인해 주세요.',OPS_PAYMENT_METHOD_CHANGED:'OPS 결제수단 설정이 변경되었습니다.',CONSULTATION_CLOSED:'취소·완료된 예약은 신규 등록하지 않습니다.',OPS_PAYLOAD_CHANGED:'이미 등록된 예약 정보와 다릅니다. OPS에서 확인해 주세요.',OPS_INPUT_INVALID:'예약 날짜·시간·인원·금액을 OPS에서 확인해 주세요.'};
const retryReasons={OPS_CALENDAR_SYNC_PENDING:'OPS의 최신 일정 확인이 지연되고 있습니다.',OPS_AVAILABILITY_EXPIRED:'예약 가능 확인 시간이 지나 다시 확인해야 합니다.',OPS_REVIEW_REQUIRED:'OPS에서 등록 확인을 완료하지 못했습니다.',OPS_HTTP_429:'OPS 요청이 잠시 많아 확인이 지연되고 있습니다.',OPS_HTTP_408:'OPS 응답이 지연되고 있습니다.'};
function panel(r){
 if(!r.integration)return '';
 if(r.integration.operation==='inbound')return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${r.integration.state==='succeeded'?'변경 반영 완료':'변경 확인 필요'}</h3><p class="micro">${r.integration.state==='succeeded'?'OPS에서 변경한 예약시간·취소·복원 상태가 반영되었습니다. 금액·입금·메모는 그대로 유지됩니다.':'양쪽 예약 정보가 달라 자동 반영을 멈췄습니다. 기존 예약 내용을 확인해 주세요.'}</p><a class="secondary" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener">BOATN OPS 열기</a></section>`;
 if(r.integration.operation==='addons')return addOnsPanel(r);
 if(r.integration.operation==='restore')return restorationPanel(r);
 if(r.integration.operation==='cancel')return cancellationPanel(r);
 if(['reschedule','registration_revision'].includes(r.integration.operation))return schedulePanel(r);
 const j=r.integration,retryReason=['failed','uncertain'].includes(j.state)&&retryReasons[j.error_code],automatic=retryReason&&Number(j.attempts||0)<2;
 const description=retryReason?retryReason+(automatic?' 잠시 후 자동으로 재확인합니다.':' 자동 시도 2회를 마쳤습니다. 등록 결과만 확인할 수 있습니다.'):reasons[j.error_code]||(['pending','checking'].includes(j.state)?'등록 결과를 자동으로 확인합니다.':'자동 등록이 완료되지 않았습니다. OPS 연결과 예약 조건을 확인한 뒤 다시 시도해 주세요.');
 return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${esc(automatic?'등록 재확인 중':states[j.state]||j.state)}</h3>${j.schedule?`<p class="micro">OPS 등록 요청 일정 · ${esc(j.schedule.date)} ${esc(j.schedule.time)}</p>`:''}${j.state==='conflict'&&!j.external_id?'<p class="micro">이전 등록 요청의 오류입니다. 화면에서 날짜를 바꾸기만 하면 재검사되지 않습니다. 새 날짜·시간을 선택하고 위의 ‘수정·확정’을 누르면 새 일정으로 확인합니다.</p>':''}${j.state==='succeeded'?`<p class="micro">예약번호 ${esc(j.external_id)}</p><p class="micro">날짜·시간은 위의 ‘수정·확정’을 누르면 OPS에도 자동 반영됩니다. 상태 메뉴에서 취소하면 OPS에도 자동 반영됩니다. 구글캘린더 반영 상태는 OPS에서 확인할 수 있습니다.</p>`:`<p class="micro">${esc(description)}</p>${j.error_code?`<p class="micro">확인 코드: ${esc(j.error_code)}</p>`:''}${j.state==='conflict'?'':`<button class="secondary" type="button" data-boatn-retry ${j.state==='checking'?'disabled':''}>${Number(j.attempts||0)>=2?'등록 결과 조회':'등록 상태 확인'}</button>`}`}<a class="secondary" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener">BOATN OPS 열기</a></section>`;
}
function cancellationPanel(r){
 const j=r.integration,done=j.state==='succeeded'&&r.status==='cancelled',conflict=j.state==='conflict',limited=Number(j.attempts||0)>=2;
 const title=done?'취소 반영 완료':conflict?'취소 확인 필요':limited?'취소 결과 확인 필요':'취소 반영 중';
 const reason={OPS_SCHEDULE_CHANGED:'OPS에서 예약시간이 변경되어 자동 취소하지 않았습니다.',OPS_CANCELLATION_REVIEW_REQUIRED:'OPS의 승선·최초 등록 상태를 확인해 주세요.',OPS_CANCELLATION_STATE_CHANGED:'OPS에서 예약 상태가 다시 변경되어 취소 완료로 표시하지 않았습니다.'}[j.error_code];
 const message=done?'모먼트링크와 OPS 예약이 취소되었습니다. 환불은 별도로 확인해 주세요. 구글캘린더 반영 상태는 OPS에서 확인할 수 있습니다.':(reason||(limited?'취소 요청을 최대 2회 시도했습니다. 결과 확인은 같은 요청의 처리 결과만 조회합니다.':'OPS에서 취소가 확인되면 이 예약도 취소로 바뀝니다.'))+' 완료 전까지 기존 예약 상태를 유지합니다.';
 const refresh='<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12"/></svg>';
 const open='<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14 3h7v7 M21 3 11 13 M10 3H3v18h18v-7"/></svg>';
 return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${title}</h3><p class="micro">${esc(message)}</p>${!done&&j.error_code?`<p class="micro">확인 코드: ${esc(j.error_code)}</p>`:''}<div class="btnrow">${!done&&!conflict?`<button class="admin-icon-button" type="button" data-boatn-retry aria-label="${limited?'취소 결과 조회':'취소 상태 확인'}" ${j.state==='checking'?'disabled':''}>${refresh}<span class="admin-action-text">${limited?'결과 조회':'상태 확인'}</span></button>`:''}<a class="admin-icon-button" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener" aria-label="BOATN OPS 열기">${open}<span class="admin-action-text">OPS 열기</span></a></div></section>`;
}
function restorationPanel(r){
 const j=r.integration,done=j.state==='succeeded'&&r.status==='confirmed',conflict=j.state==='conflict',limited=Number(j.attempts||0)>=2;
 const title=done?'복원 반영 완료':conflict?'복원 확인 필요':limited?'복원 결과 확인 필요':'복원 반영 중';
 const reason={OPS_SCHEDULE_CHANGED:'OPS에서 예약시간이 변경되어 자동 복원하지 않았습니다.',OPS_RESTORATION_REVIEW_REQUIRED:'OPS의 일정·정원·승선 상태와 기존 연동 충돌을 확인해 주세요.',OPS_RESTORATION_STATE_CHANGED:'OPS에서 예약 상태가 다시 변경되어 복원 완료로 표시하지 않았습니다.'}[j.error_code];
 const message=done?'모먼트링크와 OPS 예약이 복원되었습니다. 금액·입금 기록은 그대로 유지됩니다. 구글캘린더 반영 상태는 OPS에서 확인할 수 있습니다.':(reason||(limited?'복원 요청을 최대 2회 시도했습니다. 결과 확인은 같은 요청의 처리 결과만 조회합니다.':'OPS에서 복원가 확인되면 이 예약도 복원로 바뀝니다.'))+' 완료 전까지 취소 상태를 유지합니다.';
 const refresh='<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12"/></svg>';
 const open='<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14 3h7v7 M21 3 11 13 M10 3H3v18h18v-7"/></svg>';
 return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${title}</h3><p class="micro">${esc(message)}</p>${!done&&j.error_code?`<p class="micro">확인 코드: ${esc(j.error_code)}</p>`:''}<div class="btnrow">${!done&&!conflict?`<button class="admin-icon-button" type="button" data-boatn-retry aria-label="${limited?'복원 결과 조회':'복원 상태 확인'}" ${j.state==='checking'?'disabled':''}>${refresh}<span class="admin-action-text">${limited?'결과 조회':'상태 확인'}</span></button>`:''}<a class="admin-icon-button" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener" aria-label="BOATN OPS 열기">${open}<span class="admin-action-text">OPS 열기</span></a></div></section>`;
}
function schedulePanel(r){
 const j=r.integration,done=j.state==='succeeded',conflict=j.state==='conflict',limited=Number(j.attempts||0)>=2;
 const revised=j.operation==='registration_revision';
 const title=done?(revised?'새 일정 등록 완료':'일정 반영 완료'):conflict?'일정 변경 확인 필요':limited?'일정 변경 결과 확인 필요':'일정 반영 중';
 const reasons={OPS_SCHEDULE_CHANGED:'OPS에서 예약시간이 별도로 변경되어 자동 덮어쓰지 않았습니다.',OPS_RESOURCE_CONFLICT:'변경할 시간이 다른 운항과 겹칩니다.',OPS_SCHEDULE_REVIEW_REQUIRED:'OPS의 운항·승선 상태 또는 변경할 일정을 확인해 주세요.'};
 const message=done?'변경한 날짜·시간이 모먼트링크와 OPS에 반영되었습니다. 구글캘린더 반영 상태는 OPS에서 확인할 수 있습니다.':(reasons[j.error_code]||(limited?'자동 시도 2회를 마쳤습니다. 결과 확인은 같은 변경 요청만 조회합니다.':'OPS 반영이 완료되면 확정 일정도 자동으로 갱신합니다.'))+' 기존 확정 일정은 유지됩니다.';
 return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${esc(title)}</h3>${revised?'<p class="micro">이전 일정의 등록 실패 기록을 보존하고 새 일정으로 OPS 등록을 확인합니다.</p>':''}${j.schedule?`<p class="micro">변경 요청 · ${esc(j.schedule.date)} ${esc(j.schedule.time)}</p>`:''}<p class="micro">${esc(message)}</p>${!done&&j.error_code?`<p class="micro">확인 코드: ${esc(j.error_code)}</p>`:''}${!done&&!conflict?`<button class="secondary" type="button" data-boatn-retry ${j.state==='checking'?'disabled':''}>${limited?'변경 결과 확인':'변경 상태 확인 · 재시도'}</button>`:''}<a class="secondary" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener">BOATN OPS 열기</a></section>`;
}
function addOnsPanel(r){
 const j=r.integration,done=j.state==='succeeded',conflict=j.state==='conflict',limited=Number(j.attempts||0)>=2;
 const messages={OPS_ADDONS_REFUND_REQUIRED:'변경 금액이 이미 받은 금액보다 작습니다. OPS에서 환불 내역을 먼저 확인해 주세요.',OPS_ADDONS_CHANGED:'OPS의 일정·금액·옵션이 달라 자동 덮어쓰지 않았습니다.',OPS_ADDONS_REVIEW_REQUIRED:'OPS의 기존 변경·충돌 상태를 먼저 확인해 주세요.',OPS_ADDONS_FINANCE_REVIEW:'OPS의 기존 수납·금액 기록을 먼저 확인해 주세요.'};
 return `<section class="info" id="boatnOpsStatus" data-record="${esc(r.id)}" aria-live="polite"><h3>BOATN OPS · ${done?'옵션 반영 완료':conflict?'옵션 변경 확인 필요':'옵션 반영 확인 중'}</h3><p class="micro">${esc(done?'옵션과 총액·잔액이 OPS에 반영되었습니다. 실제 추가 수납은 OPS에서 기록해 주세요.':messages[j.error_code]||(limited?'자동 시도 2회를 마쳤습니다. 결과 조회만 가능합니다.':'OPS 확인 후 옵션과 추가금을 갱신합니다. 기존 예약 금액은 유지합니다.'))}</p>${!done&&j.error_code?`<p class="micro">확인 코드: ${esc(j.error_code)}</p>`:''}${!done&&!conflict?'<button class="secondary" type="button" data-boatn-retry>반영 결과 확인</button>':''}<a class="secondary" href="https://boarding.boatn.co.kr" target="_blank" rel="noopener">BOATN OPS 열기</a></section>`;
}
function mount(r,api){
 clearTimeout(panelTimer);const generation=++panelGeneration;
 const node=document.getElementById('boatnOpsStatus');if(!node||node.dataset.record!==r?.id)return;
 const current=()=>generation===panelGeneration&&document.getElementById('boatnOpsStatus')===node;
 // Replace only the OPS panel: unsaved status, memo and message edits stay intact.
 const refresh=async()=>{const out=await api('admin/consultations/'+r.id);if(current()){node.outerHTML=panel(out.item);mount(out.item,api);if(['reschedule','cancel','restore','registration_revision','addons'].includes(r.integration.operation)&&out.item.integration?.state==='succeeded')document.dispatchEvent(new CustomEvent(r.integration.operation==='addons'?'ml:ops-addons-synced':r.integration.operation==='restore'?'ml:ops-restoration-synced':r.integration.operation==='cancel'?'ml:ops-cancellation-synced':'ml:ops-schedule-synced',{detail:{item:out.item}}));}};
 node.querySelector('[data-boatn-retry]')?.addEventListener('click',async ev=>{
  ev.target.disabled=true;ev.target.textContent='확인 중…';
  try{await api('admin/consultations/'+r.id+'/integration','POST',{});await refresh();}
  catch(error){if(current()){ev.target.disabled=false;ev.target.textContent=error.message;}}
 });
 if(!['succeeded','conflict'].includes(r.integration.state)&&Number(r.integration.attempts||0)<2)panelTimer=setTimeout(async()=>{if(!current())return;if(document.hidden){mount(r,api);return;}try{await refresh();}catch{if(current())mount(r,api);}},['pending','checking'].includes(r.integration.state)?5000:15000);
}
window.MomentLinkOps={eligible,load,fields,validate,panel,mount};
})();
