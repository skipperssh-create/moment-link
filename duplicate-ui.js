/* Private staff-only duplicate consultation linking. */
(()=>{'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status={new:'접수중',consulting:'상담중',confirmed:'확정',closed:'완료',cancelled:'취소',hold:'보류',awaiting_payment:'입금대기',initial_unreachable:'연락안됨',no_response:'답변없음'};
window.MomentLinkDuplicateUI=({api,openRecord,canStart})=>{
 let dialog=null,source=null,candidates=[],working=false,requestId='';
 const line=r=>e([r.person,status[r.status]||r.status,r.date,r.time,r.amount==null?'':r.amount.toLocaleString('ko-KR')+'원',r.receipt].filter(Boolean).join(' · '));
 function close(){if(working)return;dialog?.close();}
 function shell(title,content){const previous=document.activeElement;dialog?.remove();dialog=document.createElement('dialog');dialog.className='duplicate-dialog';dialog.setAttribute('aria-labelledby','duplicateTitle');dialog.innerHTML='<header><h2 id="duplicateTitle">'+title+'</h2><button type="button" class="secondary" data-duplicate-close>닫기</button></header><div class="duplicate-body">'+content+'</div>';document.body.append(dialog);dialog.addEventListener('cancel',ev=>{if(working)ev.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();});dialog.showModal();dialog.querySelector('[data-duplicate-close]').onclick=close;}
 function section(detail){const r=detail.item,linked=detail.linkedConsultations||[];
 return '<section class="duplicate-section"><div class="duplicate-actions">'+(!r.communication?.reservation&&!['confirmed','closed','cancelled'].includes(r.status)?'<button type="button" class="secondary" data-duplicate-link="'+e(r.id)+'">기존 상담에 연결</button>':'')+(linked.length?'<strong>연결된 중복 상담 '+linked.length+'건</strong>':'')+'</div>'+linked.map(s=>'<p class="micro">중복 상담으로 연결됨 · '+e(s.receipt)+' · 원문은 아래 상담 메모에 표시됩니다.</p>').join('')+'</section>';
 }
 function archived(detail){const r=detail.item,m=detail.mergedInto;
 return '<section class="admin-card"><button class="secondary" data-ml="closeDetail">목록</button><h2>'+e(r.person)+'</h2><p>'+e(r.receipt)+'</p><strong>중복 상담으로 연결됨</strong><p>예약 취소가 아닙니다. 연결된 예약에서 상담과 예약을 이어서 관리합니다.</p>'+(m.id?'<button class="primary" data-duplicate-open="'+e(m.id)+'">연결된 예약 보기 · '+e(m.receipt)+'</button>':'<p>연결 대상 예약의 보유기간이 끝났거나 삭제되었습니다.</p>')+'<details><summary>원본 상담 메모</summary>'+detail.notes.map(n=>'<p class="duplicate-note">'+e(n.body)+'</p>').join('')+'</details></section>';
 }
 async function start(id){
  if(!canStart())return;
  shell('기존 상담에 연결','<p role="status">같은 전화번호의 상담을 확인하고 있습니다.</p>');
  try{
   source=(await api('admin/consultations/'+id+'?observe=1')).item;
   candidates=(await api('admin/intake/candidates?phone='+encodeURIComponent(source.phone))).items.filter(r=>r.id!==id);
   requestId=crypto.randomUUID();
   dialog.querySelector('.duplicate-body').innerHTML='<p><strong>보관할 중복 상담</strong><br>'+line(source)+'</p><p>유지할 기존 예약을 선택해 주세요. 일정·결제·OPS·캘린더는 그대로 두고 직원 메모와 정산 연결만 옮깁니다.</p>'+candidates.map(r=>'<label class="duplicate-option"><input type="radio" name="duplicateTarget" value="'+e(r.id)+'"><span>'+line(r)+'<br>'+e(r.product)+'</span></label>').join('')+(candidates.length?'<p class="micro">러브헌터 최초 문의 수수료와 접수일은 유지합니다. 중복 상담은 일반 목록과 상담 통계에서 제외하며, 연결된 상담에서 원본을 볼 수 있습니다.</p><label class="duplicate-option"><input type="checkbox" id="duplicateConfirm"><span>서로 다른 예약이 아닌 같은 예약임을 확인했습니다.</span></label><p role="alert" id="duplicateError"></p><button type="button" class="primary" data-duplicate-submit>선택한 예약에 연결</button>':'<p class="info">연결할 수 있는 같은 번호의 상담이 없습니다. 다른 담당자의 상담은 관리자에게 확인해 주세요.</p>');
  }catch(err){dialog.querySelector('.duplicate-body').textContent=err.message;}
 }
 document.addEventListener('click',async ev=>{
  const link=ev.target.closest('[data-duplicate-link]'),open=ev.target.closest('[data-duplicate-open]'),archive=ev.target.closest('[data-duplicate-archive]'),submit=ev.target.closest('[data-duplicate-submit]');
  if(working)return;
  if(link){await start(link.dataset.duplicateLink);return;}
  if(open){if(!canStart())return;close();await openRecord(open.dataset.duplicateOpen);return;}
  if(archive){
   if(!canStart())return;shell('연결된 상담','<p>조회 중…</p>');
   try{const out=await api('admin/consultation-links');dialog.querySelector('.duplicate-body').innerHTML=out.items.length?out.items.map(r=>'<article class="duplicate-option"><div><strong>중복 상담으로 연결됨</strong><p>'+line(r)+'</p><p>연결 대상 · '+e(r.targetReceipt||'삭제·만료')+'</p><button class="secondary" data-duplicate-open="'+e(r.id)+'">원본·연결 예약 보기</button></div></article>').join(''):'<p>연결된 중복 상담이 없습니다.</p>';}catch(err){dialog.querySelector('.duplicate-body').textContent=err.message;}return;
  }
  if(submit){
   const selected=candidates.find(r=>r.id===dialog.querySelector('[name=duplicateTarget]:checked')?.value),error=dialog.querySelector('#duplicateError');
   if(!selected||!dialog.querySelector('#duplicateConfirm').checked){error.textContent='유지할 예약을 선택하고 같은 예약임을 확인해 주세요.';return;}
   working=true;dialog.querySelectorAll('button,input').forEach(b=>b.disabled=true);error.textContent='연결 중…';
   try{const out=await api('admin/consultation-links','POST',{sourceId:source.id,targetId:selected.id,sourceVersion:source.version,targetVersion:selected.version,requestId,confirmed:true});working=false;close();await openRecord(out.targetId,'중복 상담을 연결했습니다. 예약·금액·OPS는 유지하고 메모와 정산을 연결했습니다.');}
   catch(err){error.textContent=err.message;}finally{working=false;dialog?.querySelectorAll('button,input').forEach(b=>b.disabled=false);}
  }
 });
 return {section,archived};
};
})();
