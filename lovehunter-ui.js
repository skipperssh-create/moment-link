/* Staff-only intake and accounting. No customer text is persisted in browser storage. */
(() => {
'use strict';
const L=globalThis.MomentLinkLoveHunter,e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const labels={undecided:'상담 후 선택',yacht:'요트',visit:'출장',trunk:'트렁크',heli:'헬기'};
const sources={lovehunter:'러브헌터',seollem:'설렘',other:'기타(수기입력)'};
const statuses={new:'접수중',consulting:'상담중',confirmed:'확정',closed:'완료',cancelled:'취소',hold:'보류',awaiting_payment:'입금대기',initial_unreachable:'연락안됨',no_response:'답변없음'};
window.MomentLinkLoveHunterUI=({api,onDirty,onBusy,onCancel,onSaved,onCustomerSaved,render})=>{
 let opened=false,pending=false,draft={},error='',candidates=null,duplicate=null,report=null,month=L.today().slice(0,7),requestId='';
 const input=(id,label,value,type='text',extra='')=>'<div><label class="admin-label" for="lh_'+id+'">'+label+'</label><input class="admin-input" id="lh_'+id+'" data-lh-field="'+id+'" type="'+type+'" value="'+e(value)+'" '+extra+'/></div>';
 const select=(id,label,options,value)=>'<div><label class="admin-label" for="lh_'+id+'">'+label+'</label><select class="admin-select" id="lh_'+id+'" data-lh-field="'+id+'">'+Object.entries(options).map(([k,v])=>'<option value="'+e(k)+'" '+(k===value?'selected':'')+'>'+e(v)+'</option>').join('')+'</select></div>';
 const open=()=>{opened=true;candidates=null;draft={source:'',sourceLabel:'',memo:'',phone:'',phones:[],person:'',kind:'general',category:'undecided',receivedDate:L.today()};error='';duplicate=null;requestId=crypto.randomUUID();};
 const close=()=>{opened=false;candidates=null;draft={};error='';duplicate=null;requestId='';};
 const matchesHtml=()=>candidates?'<div class="lh-matches"><strong>같은 전화번호의 기존 상담이 있습니다.</strong><p class="micro">같은 예약이면 기존 건을 선택해 메모와 접수 경로만 연결하세요. 일정·금액·OPS는 변경하지 않습니다.</p>'+candidates.items.map(r=>'<label class="inline-check"><input type="radio" name="intakeMatch" data-lh-match="'+e(r.id)+'" '+(draft.existingId===r.id?'checked':'')+'/>'+e(r.person)+' · '+e(statuses[r.status]||r.status)+' · '+e([r.date,r.time,r.product].filter(Boolean).join(' '))+'</label>').join('')+(candidates.restricted?'<p class="micro">다른 담당자의 상담 '+candidates.restricted+'건이 있습니다. 담당자 또는 관리자에게 확인해 주세요.</p>':'')+'<label class="inline-check"><input type="radio" name="intakeMatch" data-lh-match="separate" '+(draft.separate?'checked':'')+'/>다른 날짜·별개 예약으로 새 상담 만들기</label></div>':'';
 const feedback=()=>matchesHtml()+'<p class="lh-feedback" role="status">'+e(error)+'</p>'+(duplicate?'<button class="secondary" type="button" data-lh="existing">기존 상담 보기 · 추가 수수료 없음</button>':'');
 function preview(){return (draft.phones?.length>1?'<p class="info">전화번호가 여러 개입니다. 이번에 접수할 고객 한 명의 번호를 선택해 주세요.</p>'+select('phone','추출한 전화번호',{'':'고객 번호 선택',...Object.fromEntries(draft.phones.map(p=>[p,p]))},draft.phone):input('phone','고객 전화번호 · 필수',draft.phone,'tel','autocomplete="off" maxlength="20"'))+
 input('person','성함 · 선택',draft.person,'text','autocomplete="off" maxlength="80"')+
 (draft.source==='lovehunter'?select('kind','러브헌터 문의 구분',{'general':'일반 문의 · 50,000원','visit':'출장 문의 · 40,000원'},draft.kind):'')+
 select('category','상담할 상품 종류',labels,draft.category)+input('receivedDate','최초 상담 접수일',draft.receivedDate,'date','max="'+L.today()+'"');}
 const feeNotice=()=>draft.source==='lovehunter'?'러브헌터만 일반 50,000원 · 출장 40,000원. 예약 성사·취소와 관계없이 같은 번호는 기간에 관계없이 최초 1회만 계산합니다.':draft.source?'설렘·기타 상담은 소개 수수료 0원입니다. 설렘 광고비는 관리자 통합 정산에서 월별로 입력합니다.':'유입경로를 선택해 주세요. 러브헌터를 선택한 경우에만 소개 수수료가 발생합니다.';
 function html(){return '<section class="admin-card lh-intake"><div class="status-top"><div><h2>새 상담</h2><p class="micro">유입경로를 선택하고 내용을 붙여넣거나 직접 입력해 주세요.</p></div><button class="secondary" type="button" data-lh="cancel">닫기</button></div><form id="loveHunterForm"><div class="lh-fields">'+select('source','유입경로 · 필수',{'':'선택해 주세요',...sources},draft.source)+'<div id="lh_source_label">'+(draft.source==='other'?input('sourceLabel','기타 유입경로 이름',draft.sourceLabel,'text','maxlength="60"'):'')+'</div></div><label class="admin-label" for="lh_memo">전화번호·성함·예약 요청 붙여넣기</label><textarea class="admin-input" id="lh_memo" data-lh-field="memo" rows="6" maxlength="4000" placeholder="전화번호만 붙여넣어도 상담을 시작할 수 있습니다.">'+e(draft.memo)+'</textarea><p class="micro">이 내용은 직원 전용 상담 메모로만 저장됩니다. 고객 문자·안내 링크에는 들어가지 않습니다.</p><div class="lh-fields" id="lh_preview">'+preview()+'</div><div class="info lh-fee-notice" id="lh_fee_notice">'+feeNotice()+'</div><div id="lh_feedback">'+feedback()+'</div><button class="primary" type="submit" '+(pending?'disabled':'')+'>'+ (pending?'저장 중…':'상담 시작')+'</button></form></section>';}
 const customer=r=>sources[r.communication?.entry?.source]?'<section class="lh-customer admin-card"><strong>'+e(sources[r.communication.entry.source])+' 접수</strong><p class="micro">접수 원문은 아래 상담 메모에서 직원만 확인할 수 있습니다.</p>'+(!r.communication.reservation&&!['confirmed','closed','cancelled'].includes(r.status)?'<form id="loveHunterCustomer" data-id="'+e(r.id)+'" data-version="'+r.version+'"><div class="lh-name-row">'+input('customerName','고객 성함',r.communication.entry.nameMissing?'':r.person,'text','maxlength="80" autocomplete="off"')+'<button type="submit" class="secondary">성함 저장</button></div><p role="status" data-lh-customer-status></p></form>':'')+'</section>':'';
 const finance=window.MomentLinkFinanceUI?.({api,render,onBusy});
 function reportHtml(){
  if(finance)return finance.html();
  const t=report?.totals||{general:{count:0,amount:0},visit:{count:0,amount:0},count:0,amount:0};
  return '<section class="lh-report"><p class="micro">최초 접수일 기준 · 전화번호당 최초 1회 · 예약 성사·취소와 관계없이 집계합니다.</p><form id="loveHunterMonth" class="lh-month">'+input('month','조회 월',month,'month')+'<button class="secondary" type="submit">조회</button></form><div class="lh-totals">'+[['일반 문의',t.general.count+'건',money(t.general.amount)],['출장 문의',t.visit.count+'건',money(t.visit.amount)],['총 수수료',t.count+'건',money(t.amount)]].map(([title,count,amount])=>'<div class="admin-card"><span>'+title+' · '+count+'</span><strong>'+amount+'</strong></div>').join('')+'</div><p class="micro">일반 건수 × 50,000원 + 출장 건수 × 40,000원. 이 기능으로 접수한 건부터 집계하며 기존 예약을 소급 청구하지 않습니다.</p><div class="lh-report-list">'+(report?.items||[]).map(r=>'<article class="admin-card lh-report-item" data-status="'+e(Object.hasOwn(statuses,r.status)?r.status:'unknown')+'"><div><div class="lh-report-heading"><strong>'+e(r.person||'상담 삭제·보유기간 종료')+'</strong><span class="lh-status-badge">'+e(statuses[r.status]||'상담 정보 없음')+'</span></div><div>'+e(r.phone||'개인정보 미보관')+'</div><span class="micro">'+e(String(r.received_date).slice(0,10))+' · '+(r.kind==='visit'?'출장':'일반')+'</span></div><strong>'+money(r.amount)+'</strong>'+(r.consultation_id?'<button class="secondary" type="button" data-lh="detail" data-id="'+e(r.consultation_id)+'">상담 보기</button>':'')+'</article>').join('')+(!report?.items?.length?'<p class="info">이 달에 최초 접수된 러브헌터 상담이 없습니다.</p>':'')+'</div><p id="lh_report_error" role="status"></p></section>';
 }
 async function loadReport(){if(finance)return finance.load();report=await api('admin/lovehunter/report?month='+encodeURIComponent(month));}
 const paintFeedback=()=>{const root=document.getElementById('lh_feedback');if(root)root.innerHTML=feedback();};
 document.addEventListener('input',ev=>{
  if(!opened||!ev.target.closest('#loveHunterForm'))return;
  const key=ev.target.dataset.lhField;if(!key)return;
  draft[key]=ev.target.value;error='';duplicate=null;if(['phone','memo','source'].includes(key)){candidates=null;delete draft.existingId;draft.separate=false;}onDirty();paintFeedback();
  if(key==='memo'){const p=L.parse(draft.memo);Object.assign(draft,p);document.getElementById('lh_preview').innerHTML=preview();}
 });
 document.addEventListener('change',ev=>{
  if(!opened||!ev.target.closest('#loveHunterForm'))return;
  const key=ev.target.dataset.lhField;if(key){draft[key]=ev.target.value;onDirty();}
  if(ev.target.dataset.lhMatch){draft.separate=ev.target.dataset.lhMatch==='separate';draft.existingId=draft.separate?undefined:ev.target.dataset.lhMatch;}
  if(key==='source'){candidates=null;delete draft.existingId;draft.separate=false;document.getElementById('lh_preview').innerHTML=preview();document.getElementById('lh_source_label').innerHTML=draft.source==='other'?input('sourceLabel','기타 유입경로 이름',draft.sourceLabel,'text','maxlength="60"'):'';document.getElementById('lh_fee_notice').textContent=feeNotice();paintFeedback();}
 });
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-lh]');if(!b||pending)return;
  if(b.dataset.lh==='cancel'){onCancel();return;}
  if(b.dataset.lh==='existing'||b.dataset.lh==='detail'){
   pending=true;onBusy(true);
   try{await onSaved(b.dataset.id||duplicate.consultationId,'기존 상담을 열었습니다. 추가 수수료는 없습니다.');close();}
   catch(err){error=err.message;paintFeedback();const el=document.getElementById('lh_report_error');if(el)el.textContent=err.message;}
   finally{pending=false;onBusy(false);}
  }
 });
 document.addEventListener('submit',async ev=>{
  if(!['loveHunterForm','loveHunterMonth','loveHunterCustomer'].includes(ev.target.id))return;
  ev.preventDefault();if(pending)return;
  const form=ev.target;pending=true;onBusy(true);
  form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   if(form.id==='loveHunterMonth'){month=document.getElementById('lh_month').value;await loadReport();render();}
   if(form.id==='loveHunterCustomer'){
    const person=document.getElementById('lh_customerName').value.trim();
    if(!person)throw Error('고객 성함을 입력해 주세요.');
    const out=await api('admin/consultations/'+form.dataset.id+'/customer','POST',{person,version:Number(form.dataset.version)});
    onCustomerSaved(out.item);
   }
   if(form.id==='loveHunterForm'){
    const phone=L.normalizePhone(draft.phone);
    if(!phone)throw Error('고객 휴대전화 번호 한 개를 선택하거나 입력해 주세요.');
    if(!draft.source)throw Error('러브헌터·설렘·기타 중 유입경로를 선택해 주세요.');
    if(draft.source==='other'&&!draft.sourceLabel.trim())throw Error('기타 유입경로 이름을 입력해 주세요.');
    const {person,memo,kind,category,receivedDate,source,sourceLabel,existingId,separate}=draft;
    const out=await api('admin/intake/consultations','POST',{requestId,phone,person:person.trim(),memo,kind,category,receivedDate,source,sourceLabel,...(existingId?{existingId}:{}),separate:!!separate});
    if(out.candidates){candidates={items:out.candidates,restricted:out.restrictedCount};error='연결할 기존 예약 또는 별개 예약을 선택하고 상담 시작을 눌러 주세요.';paintFeedback();}
    else if(out.duplicate){duplicate=out;error='이미 접수한 전화번호입니다. 새 상담이나 추가 수수료를 만들지 않았습니다.';paintFeedback();}
    else {await onSaved(out.item.id,out.charged?'접수를 저장했습니다. 최초 접수 수수료 '+money(out.amount)+'을 기록했습니다.':(out.linked?'기존 예약에 접수 내용을 연결했습니다. 추가 수수료는 없습니다.':'상담을 시작했습니다. 소개 수수료는 없습니다.'));close();}
   }
  }catch(err){error=err.message;paintFeedback();const target=form.querySelector('[data-lh-customer-status]')||document.getElementById('lh_report_error');if(target)target.textContent=err.message;}
  finally{pending=false;onBusy(false);form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 return {open,close,isOpen:()=>opened,html,customer,reportHtml,loadReport};
};
})();
