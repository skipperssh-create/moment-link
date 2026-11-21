/* Staff-only intake and accounting. No customer text is persisted in browser storage. */
(() => {
'use strict';
const L=globalThis.MomentLinkLoveHunter,e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const labels={undecided:'상담 후 선택',yacht:'요트',visit:'출장',trunk:'트렁크',heli:'헬기'};
const statuses={new:'접수중',consulting:'상담중',confirmed:'확정',closed:'완료',cancelled:'취소',hold:'보류',awaiting_payment:'입금대기',initial_unreachable:'연락안됨',no_response:'답변없음'};
window.MomentLinkLoveHunterUI=({api,onDirty,onBusy,onCancel,onSaved,onCustomerSaved,render})=>{
 let opened=false,pending=false,draft={},error='',duplicate=null,report=null,month=L.today().slice(0,7),requestId='';
 const input=(id,label,value,type='text',extra='')=>'<div><label class="admin-label" for="lh_'+id+'">'+label+'</label><input class="admin-input" id="lh_'+id+'" data-lh-field="'+id+'" type="'+type+'" value="'+e(value)+'" '+extra+'/></div>';
 const select=(id,label,options,value)=>'<div><label class="admin-label" for="lh_'+id+'">'+label+'</label><select class="admin-select" id="lh_'+id+'" data-lh-field="'+id+'">'+Object.entries(options).map(([k,v])=>'<option value="'+e(k)+'" '+(k===value?'selected':'')+'>'+e(v)+'</option>').join('')+'</select></div>';
 const open=()=>{opened=true;draft={memo:'',phone:'',phones:[],person:'',kind:'general',category:'undecided',receivedDate:L.today()};error='';duplicate=null;requestId=crypto.randomUUID();};
 const close=()=>{opened=false;draft={};error='';duplicate=null;requestId='';};
 const feedback=()=>'<p class="lh-feedback" role="status">'+e(error)+'</p>'+(duplicate?'<button class="secondary" type="button" data-lh="existing">기존 상담 보기 · 추가 수수료 없음</button>':'');
 function preview(){return (draft.phones?.length>1?'<p class="info">전화번호가 여러 개입니다. 이번에 접수할 고객 한 명의 번호를 선택해 주세요.</p>'+select('phone','추출한 전화번호',{'':'고객 번호 선택',...Object.fromEntries(draft.phones.map(p=>[p,p]))},draft.phone):input('phone','고객 전화번호 · 필수',draft.phone,'tel','autocomplete="off" maxlength="20"'))+
 input('person','성함 · 선택',draft.person,'text','autocomplete="off" maxlength="80"')+
 select('kind','러브헌터 문의 구분',{'general':'일반 문의 · 50,000원','visit':'출장 문의 · 40,000원'},draft.kind)+
 select('category','상담할 상품 종류',labels,draft.category)+input('receivedDate','수수료 접수일',draft.receivedDate,'date','max="'+L.today()+'"');}
 function html(){return '<section class="admin-card lh-intake"><div class="status-top"><div><h2>새 상담</h2><p class="micro">러브헌터에서 받은 내용을 붙여넣고 확인해 주세요.</p></div><button class="secondary" type="button" data-lh="cancel">닫기</button></div><form id="loveHunterForm"><label class="admin-label" for="lh_memo">전화번호·성함·예약 요청 붙여넣기</label><textarea class="admin-input" id="lh_memo" data-lh-field="memo" rows="6" maxlength="4000" placeholder="전화번호만 붙여넣어도 상담을 시작할 수 있습니다.">'+e(draft.memo)+'</textarea><p class="micro">이 내용은 직원 전용 상담 메모로만 저장됩니다. 고객 문자·안내 링크에는 들어가지 않습니다.</p><div class="lh-fields" id="lh_preview">'+preview()+'</div><div class="info lh-fee-notice">예약 성사 여부와 관계없이 일반 50,000원 · 출장 40,000원입니다. 같은 전화번호는 기간과 관계없이 최초 1회만 계산합니다. 이후 상품을 변경해도 최초 접수 수수료는 유지됩니다.</div><div id="lh_feedback">'+feedback()+'</div><button class="primary" type="submit" '+(pending?'disabled':'')+'>'+ (pending?'저장 중…':'상담 시작')+'</button></form></section>';}
 const customer=r=>r.communication?.entry?.source==='lovehunter'?'<section class="lh-customer admin-card"><strong>러브헌터 접수</strong><p class="micro">접수 원문은 아래 상담 메모에서 직원만 확인할 수 있습니다.</p>'+(!r.communication.reservation&&!['confirmed','closed','cancelled'].includes(r.status)?'<form id="loveHunterCustomer" data-id="'+e(r.id)+'" data-version="'+r.version+'"><div class="lh-name-row">'+input('customerName','고객 성함',r.communication.entry.nameMissing?'':r.person,'text','maxlength="80" autocomplete="off"')+'<button type="submit" class="secondary">성함 저장</button></div><p role="status" data-lh-customer-status></p></form>':'')+'</section>':'';
 function reportHtml(){
  const t=report?.totals||{general:{count:0,amount:0},visit:{count:0,amount:0},count:0,amount:0};
  return '<section class="lh-report"><p class="micro">최초 접수일 기준 · 전화번호당 최초 1회 · 예약 성사·취소와 관계없이 집계합니다.</p><form id="loveHunterMonth" class="lh-month">'+input('month','조회 월',month,'month')+'<button class="secondary" type="submit">조회</button></form><div class="lh-totals">'+[['일반 문의',t.general.count+'건',money(t.general.amount)],['출장 문의',t.visit.count+'건',money(t.visit.amount)],['총 수수료',t.count+'건',money(t.amount)]].map(([title,count,amount])=>'<div class="admin-card"><span>'+title+' · '+count+'</span><strong>'+amount+'</strong></div>').join('')+'</div><p class="micro">일반 건수 × 50,000원 + 출장 건수 × 40,000원. 이 기능으로 접수한 건부터 집계하며 기존 예약을 소급 청구하지 않습니다.</p><div class="lh-report-list">'+(report?.items||[]).map(r=>'<article class="admin-card lh-report-item" data-status="'+e(Object.hasOwn(statuses,r.status)?r.status:'unknown')+'"><div><div class="lh-report-heading"><strong>'+e(r.person||'상담 삭제·보유기간 종료')+'</strong><span class="lh-status-badge">'+e(statuses[r.status]||'상담 정보 없음')+'</span></div><div>'+e(r.phone||'개인정보 미보관')+'</div><span class="micro">'+e(String(r.received_date).slice(0,10))+' · '+(r.kind==='visit'?'출장':'일반')+'</span></div><strong>'+money(r.amount)+'</strong>'+(r.consultation_id?'<button class="secondary" type="button" data-lh="detail" data-id="'+e(r.consultation_id)+'">상담 보기</button>':'')+'</article>').join('')+(!report?.items?.length?'<p class="info">이 달에 최초 접수된 러브헌터 상담이 없습니다.</p>':'')+'</div><p id="lh_report_error" role="status"></p></section>';
 }
 async function loadReport(){report=await api('admin/lovehunter/report?month='+encodeURIComponent(month));}
 const paintFeedback=()=>{const root=document.getElementById('lh_feedback');if(root)root.innerHTML=feedback();};
 document.addEventListener('input',ev=>{
  if(!opened||!ev.target.closest('#loveHunterForm'))return;
  const key=ev.target.dataset.lhField;if(!key)return;
  draft[key]=ev.target.value;error='';duplicate=null;onDirty();paintFeedback();
  if(key==='memo'){const p=L.parse(draft.memo);Object.assign(draft,p);document.getElementById('lh_preview').innerHTML=preview();}
 });
 document.addEventListener('change',ev=>{
  if(!opened||!ev.target.closest('#loveHunterForm'))return;
  const key=ev.target.dataset.lhField;if(key){draft[key]=ev.target.value;onDirty();}
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
    if(!draft.memo.trim())throw Error('러브헌터 접수 내용을 붙여넣어 주세요.');
    const {person,memo,kind,category,receivedDate}=draft;
    const out=await api('admin/lovehunter/consultations','POST',{requestId,phone,person:person.trim(),memo,kind,category,receivedDate});
    if(out.duplicate){duplicate=out;error='이미 접수한 전화번호입니다. 새 상담이나 추가 수수료를 만들지 않았습니다.';paintFeedback();}
    else {await onSaved(out.item.id,out.charged?'상담을 시작했습니다. 최초 접수 수수료 '+money(out.amount)+'을 기록했습니다.':'상담을 열었습니다. 최초 접수 번호이므로 추가 수수료는 없습니다.');close();}
   }
  }catch(err){error=err.message;paintFeedback();const target=form.querySelector('[data-lh-customer-status]')||document.getElementById('lh_report_error');if(target)target.textContent=err.message;}
  finally{pending=false;onBusy(false);form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 return {open,close,isOpen:()=>opened,html,customer,reportHtml,loadReport};
};
})();
