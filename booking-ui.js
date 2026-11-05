/* Admin-only direct entry. Draft customer information stays in memory, never browser storage. */
(() => {
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
const P=window.MomentLinkPricing;
const O=window.MomentLinkOps;
const actionPaths={back:'m12 5-7 7 7 7 M5 12h14',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18A8 8 0 0 1 4 12',inbox:'M4 4h16v16H4z M4 14h5l2 3h2l2-3h5',calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 11h18 m-13 5 3 3 5-5'};
const actionContent=(name,label)=>`<svg class="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${actionPaths[name]}"/></svg><span class="admin-action-text">${e(label)}</span>`;

window.MomentLinkDirectBooking=function({api,onSaved,onCancel,onDirty,onBusy}){
 let draft=null,catalog=null,staff=[],busy=false,error='',attempt=null;
 const value=id=>document.getElementById(id)?.value||'';
 const product=()=>catalog?.products.find(p=>p.id===draft?.productId);
 const pack=()=>product()?.packages.find(p=>p.id===draft?.packageId);
 function record(){const p=product(),pk=pack();if(!p||!pk)return {category:'',snapshot:{}};const options=(pk.options||[]).filter(o=>draft.optionIds.includes(o.id)),extra=options.reduce((sum,o)=>sum+o.amount,0);return {category:p.category,snapshot:{product:p,package:pk,options,price:{weekday:pk.weekday===null?null:pk.weekday+extra,weekend:pk.weekend===null?null:pk.weekend+extra,optionAmount:extra}}};}
 function price(){if(draft.amountMode==='auto')draft.amount=P.quote(record(),draft.date).amount;}
 function capture(){if(!draft||!document.getElementById('directBooking'))return;if(document.getElementById('direct_opsPax')){draft.opsPax=Number(value('direct_opsPax'));draft.opsPaymentMethod=value('direct_opsPaymentMethod');}for(const k of ['person','phone','date','time','place','notes','assignee','amountMode'])draft[k]=value('direct_'+k);const amount=value('direct_amount');draft.amount=amount===''?null:Number(amount);for(const k of ['scheduleConfirmed','paymentConfirmed'])draft[k]=!!document.getElementById('direct_'+k)?.checked;}
 const field=(k,label,type='text',extra='')=>`<div><label class="admin-label" for="direct_${k}">${label}</label><input class="admin-input" id="direct_${k}" type="${type}" value="${e(draft[k]??'')}" ${extra}/></div>`;
 function render(){
  if(!draft)return '';
  const p=product(),pk=pack(),quote=P.quote(record(),draft.date),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return `<form id="directBooking" class="admin-card direct-booking" autocomplete="off"><header class="direct-heading"><button type="button" class="admin-icon-button" data-direct="cancel" aria-label="취소 · 목록으로" title="취소 · 목록으로" ${busy?'disabled':''}>${actionContent('back','목록')}</button><div><h2>직접 예약 등록</h2><p class="micro">전화·메신저로 받은 예약을 등록하세요.</p></div></header>
  <fieldset class="direct-fields" ${busy?'disabled':''}><legend class="visually-hidden">고객과 예약 정보</legend>
  <section class="direct-section" aria-labelledby="directCustomerHeading"><h3 id="directCustomerHeading">고객</h3><div class="direct-grid">${field('person','고객 이름','text','required maxlength="80" autocomplete="off"')}${field('phone','휴대전화 번호','tel','required maxlength="20" placeholder="010-0000-0000"')}</div></section>
  <section class="direct-section" aria-labelledby="directProductHeading"><div class="direct-section-heading"><h3 id="directProductHeading">상품</h3><button type="button" class="admin-icon-button" data-direct="reload" aria-label="상품 목록 새로고침" title="상품 목록 새로고침">${actionContent('refresh','새로고침')}</button></div><div class="direct-grid"><div><label class="admin-label" for="direct_productId">상품</label><select class="admin-select" id="direct_productId" required><option value="">상품을 선택해 주세요</option>${Object.entries(names).map(([id,name])=>`<optgroup label="${name}">${catalog.products.filter(p=>p.category===id&&!p.salePaused).map(p=>`<option value="${e(p.id)}" ${draft.productId===p.id?'selected':''}>${e(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></div><div><label class="admin-label" for="direct_packageId">패키지</label><select class="admin-select" id="direct_packageId" required ${!p?'disabled':''}>${p?p.packages.map(pk=>`<option value="${e(pk.id)}" ${draft.packageId===pk.id?'selected':''}>${e(pk.name)}</option>`).join(''):'<option value="">상품을 먼저 선택해 주세요</option>'}</select></div></div>
  ${pk?.options?.length?`<div class="direct-options"><span class="admin-label">선택 옵션</span><div class="direct-option-list">${pk.options.map(o=>{const unavailable=o.requiresOptionId&&!draft.optionIds.includes(o.requiresOptionId);return `<label class="inline-check"><input type="checkbox" data-direct-option="${e(o.id)}" ${draft.optionIds.includes(o.id)?'checked':''} ${unavailable?'disabled':''}/><span>${e(o.name)}<span class="direct-option-price">${o.amount.toLocaleString('ko-KR')}원</span>${unavailable?'<span class="consent-note micro">영상편지 제작 선택 후 구매할 수 있습니다.</span>':''}</span></label>`;}).join('')}</div></div>`:''}</section>
  <section class="direct-section" aria-labelledby="directScheduleHeading"><h3 id="directScheduleHeading">일정 · 금액</h3><div class="direct-grid direct-schedule-grid">${field('date','이벤트 날짜','date',`required min="${today}"`)}${field('time','확정 또는 협의한 시간','time','required')}<div><label class="admin-label" for="direct_amountMode">금액 적용</label><select class="admin-select" id="direct_amountMode"><option value="auto" ${draft.amountMode==='auto'?'selected':''}>자동 계산</option><option value="manual" ${draft.amountMode==='manual'?'selected':''}>직접 입력</option></select></div>${field('amount','최종 금액 (원)','number',`required min="0" max="100000000" step="1" ${draft.amountMode==='auto'?'readonly':''}`)}</div>
  <p class="micro" id="directPriceHint" role="status">${draft.amountMode==='auto'?e(quote.label)+(pk?' · 선택 옵션 금액 포함':''):'직접 입력한 최종 금액으로 저장합니다.'}</p>${p?.category==='heli'?'<p class="micro">헬기는 주간에만 운항합니다. 담당자와 확인한 주간 시간을 입력해 주세요.</p>':''}${field('place','이벤트 장소·주소','text','required maxlength="500"')}${O.fields(record(),draft,'direct',busy)}</section>
  <section class="direct-section" aria-labelledby="directNotesHeading"><h3 id="directNotesHeading">요청 · 담당</h3><div class="direct-grid direct-notes-grid"><div><label class="admin-label" for="direct_notes">요청사항·메모 (선택)</label><textarea class="admin-input" id="direct_notes" maxlength="2000" rows="2" placeholder="고객 요청을 입력하세요.">${e(draft.notes)}</textarea></div><div><label class="admin-label" for="direct_assignee">담당자</label><select class="admin-select" id="direct_assignee" required>${staff.filter(u=>u.active).map(u=>`<option value="${e(u.id)}" ${draft.assignee===u.id?'selected':''}>${e(u.displayName||u.username)}</option>`).join('')}</select></div></div></section>
  <section class="direct-section direct-confirmation" aria-labelledby="directConfirmHeading"><h3 id="directConfirmHeading">등록 확인</h3><div class="direct-confirm-checks"><label class="inline-check"><input type="checkbox" id="direct_scheduleConfirmed" ${draft.scheduleConfirmed?'checked':''}/>고객과 일정·장소를 확정했습니다.</label><label class="inline-check"><input type="checkbox" id="direct_paymentConfirmed" ${draft.paymentConfirmed?'checked':''}/>담당자가 입금을 확인했습니다.</label></div><p class="micro">입금 전에는 접수로 등록하세요. 두 항목을 모두 확인하면 확정 예약으로 등록할 수 있습니다.</p>
  <p id="directError" tabindex="-1" class="form-error" role="alert">${e(error)}</p><div class="direct-submit-row"><p class="micro">등록 후 고객별 문자 안내를 준비할 수 있습니다.<br/>문자는 자동 발송되지 않습니다.</p><div class="direct-submit-actions"><button type="submit" name="mode" value="pending" class="admin-icon-button" aria-label="접수로 등록" title="접수로 등록">${actionContent(busy?'refresh':'inbox',busy?'저장 중':'접수 등록')}</button><button type="submit" name="mode" value="confirmed" class="admin-icon-button icon-primary" aria-label="예약 확정 등록" title="예약 확정 등록">${actionContent(busy?'refresh':'calendar',busy?'저장 중':'확정 등록')}</button></div></div></section></fieldset></form>`;

 }
 function repaint(focusId){const node=document.getElementById('directBooking');if(node){node.outerHTML=render();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});}}
 function changed(){onDirty();error='';}
 document.addEventListener('input',ev=>{if(!draft||busy||!ev.target.closest('#directBooking'))return;capture();changed();if(['direct_date','direct_amountMode','direct_amount','direct_place','direct_time','direct_opsPax','direct_opsPaymentMethod'].includes(ev.target.id)){draft.paymentConfirmed=false;draft.scheduleConfirmed=false;for(const k of ['paymentConfirmed','scheduleConfirmed'])document.getElementById('direct_'+k).checked=false;}});
 document.addEventListener('change',ev=>{
  if(!draft||busy||!ev.target.closest('#directBooking'))return;capture();changed();const id=ev.target.id;
  if(id==='direct_productId'||id==='direct_packageId'){
   const oldCategory=product()?.category;draft.optionIds=[];draft.amountMode='auto';
   if(id==='direct_productId'){draft.productId=ev.target.value;draft.packageId=product()?.packages[0]?.id||'';const category=product()?.category;if(category==='yacht')draft.place=P.location(catalog.settings);else if(oldCategory==='yacht')draft.place='';}
   else draft.packageId=ev.target.value;
  }
  const optionId=ev.target.dataset.directOption;
  if(optionId){const option=pack().options.find(o=>o.id===optionId);draft.optionIds=draft.optionIds.filter(x=>x!==optionId&&(!ev.target.checked||!option.group||pack().options.find(o=>o.id===x)?.group!==option.group));if(ev.target.checked)draft.optionIds.push(optionId);draft.optionIds=draft.optionIds.filter(x=>{const o=pack().options.find(o=>o.id===x);return !o.requiresOptionId||draft.optionIds.includes(o.requiresOptionId);});}
  if(['direct_productId','direct_packageId','direct_date','direct_amountMode'].includes(id)||optionId){draft.paymentConfirmed=false;draft.scheduleConfirmed=false;price();repaint(id);}
 });
 document.addEventListener('click',async ev=>{
  const button=ev.target.closest('[data-direct]');if(!button||!draft||busy)return;
  if(button.dataset.direct==='cancel'){onCancel();return;}
  if(button.dataset.direct==='reload'){
   capture();busy=true;onBusy(true);error='';repaint();
   try{catalog=await api('catalog');if(!product()||product().salePaused){draft.productId='';draft.packageId='';}else if(!pack())draft.packageId=product().packages[0]?.id||'';draft.optionIds=[];draft.amountMode='auto';draft.scheduleConfirmed=false;draft.paymentConfirmed=false;price();changed();}
   catch(err){error=err.message;}finally{busy=false;onBusy(false);repaint();}
  }
 });
 document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='directBooking')return;ev.preventDefault();if(busy||!draft)return;capture();price();
  const mode=ev.submitter?.value||'pending';
  if(!product()||!pack()){error='상품과 패키지를 선택해 주세요.';repaint();return;}
  const booking={date:draft.date,time:draft.time,amount:draft.amount,amountMode:draft.amountMode,place:draft.place,scheduleConfirmed:draft.scheduleConfirmed,paymentConfirmed:draft.paymentConfirmed,extra:'',...(O.eligible(record())?{opsPax:draft.opsPax,opsPaymentMethod:draft.opsPaymentMethod}:{})};
  error=MomentLinkMessages.validate(mode==='confirmed'?'confirmed':'receipt',booking,{...record(),phone:draft.phone.replace(/[\s-]/g,'')});
  error ||= mode==='confirmed'?O.validate(record(),booking):'';
  if(error){repaint('directError');return;}
  const data={catalogVersion:catalog.version,person:draft.person,phone:draft.phone,productId:draft.productId,packageId:draft.packageId,optionIds:draft.optionIds,notes:draft.notes,assignee:draft.assignee,booking,mode};
  // Keep the same key/payload after an uncertain response; edits cannot create a second booking on retry.
  if(attempt&&JSON.stringify(data)!==attempt.serialized){error='이전 저장 결과를 확인하지 못했습니다. 새로고침으로 목록을 먼저 확인하거나, 이전 입력 내용 그대로 다시 시도해 주세요.';repaint();return;}
  attempt ||= {serialized:JSON.stringify(data),data:{...data,requestId:crypto.randomUUID()}};
  busy=true;onBusy(true);error='';repaint();
  try{const result=await api('admin/reservations','POST',attempt.data);draft=null;attempt=null;await onSaved(result.item);}
  catch(err){if(err.status&&err.status<500)attempt=null;error=err.message;}
  finally{busy=false;onBusy(false);if(draft)repaint();}
 });
 return {render,isOpen:()=>!!draft,close:()=>{draft=null;attempt=null;error='';},open:async(user,users)=>{catalog=await api('catalog');await O.load(api);staff=users;attempt=null;error='';draft={opsPax:2,opsPaymentMethod:'',person:'',phone:'',productId:'',packageId:'',optionIds:[],date:'',time:'',amount:null,amountMode:'auto',place:'',notes:'',assignee:user.id,scheduleConfirmed:false,paymentConfirmed:false};}};
};
})();
