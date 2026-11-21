(() => {
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),C=globalThis.MomentLinkContract;
const money=v=>v===null||v===undefined?'미확인':Number(v).toLocaleString('ko-KR')+'원';
window.MomentLinkContractUI=({api,onDirty,onSaved})=>{
 let current=null,record=null,pending=false,changed=false;
 const field=(id,label,value,type='text',extra='',help='')=>'<div class="contract-field"><label for="nc_'+id+'">'+label+'</label><input class="admin-input" id="nc_'+id+'" type="'+type+'" value="'+e(value??'')+'" '+extra+(help?' aria-describedby="nc_'+id+'_help"':'')+'>'+ (help?'<p class="micro" id="nc_'+id+'_help">'+help+'</p>':'')+'</div>';
 const area=(id,label,value,rows,limit,placeholder)=>'<div class="contract-field"><label for="nc_'+id+'">'+label+'</label><textarea class="admin-input" id="nc_'+id+'" rows="'+rows+'" maxlength="'+limit+'" placeholder="'+e(placeholder)+'">'+e(value)+'</textarea></div>';
 const step=(n,title,help)=>'<div class="contract-step-heading"><span class="contract-step-number" aria-hidden="true">'+n+'</span><div><h4>'+title+'</h4>'+(help?'<p class="micro">'+help+'</p>':'')+'</div></div>';
 function html(r){
  current=r;record=null;changed=false;
  return '<section class="admin-card naver-contract" aria-label="러브헌터 네이버 결제 기록"><div class="contract-heading"><div><h3>러브헌터 · 네이버 결제</h3><p class="micro">러브헌터에서 ‘계약’으로 보내준 네이버 구매 건을 입력합니다.</p></div><button type="button" class="secondary" data-contract="open" aria-expanded="false" aria-controls="contractEditor">계약 입력 열기</button></div><div id="contractEditor" hidden></div></section>';
 }
 function paint(data){
  changed=false;record=data.contract;const c=record||{},today=new Date(Date.now()+32400000).toISOString().slice(0,10),editable=!!current.can_edit;
  const editor=document.getElementById('contractEditor');editor.hidden=false;
  editor.innerHTML='<form id="naverContractForm">'+
   '<section class="contract-step">'+step('1','계약 내용 붙여넣기','카카오톡으로 받은 계약 안내를 그대로 붙여넣어 주세요.')+
   area('raw','러브헌터에서 받은 계약 안내','',4,4000,'계약: 성함 (전화번호)\n471,000원 카드결제 확인되었습니다.\n리뷰이벤트 폭죽300발')+
   '<div class="contract-parse-actions"><button type="button" class="secondary" data-contract="parse">붙여넣은 내용 불러오기</button><p class="micro">'+(c.id?'저장된 계약은 아래 항목만 수정해도 됩니다.':'전화번호·결제금액·리뷰 내용을 아래 칸에 채웁니다.')+'</p></div><p id="nc_parse" class="contract-feedback" role="status" aria-live="polite" hidden></p></section>'+
   '<section class="contract-step">'+step('2','고객 결제 확인','고객이 네이버에서 결제한 금액과 날짜를 확인해 주세요.')+
   '<div class="contract-fields">'+field('phone','고객 전화번호',current.phone,'tel','required autocomplete="off" inputmode="tel"','현재 예약 고객의 전화번호와 같아야 저장할 수 있습니다.')+
   '<div class="contract-field"><label for="nc_status">네이버 결제 상태</label><select class="admin-select" id="nc_status"><option value="active" '+(c.status!=='cancelled'?'selected':'')+'>결제 완료</option><option value="cancelled" '+(c.status==='cancelled'?'selected':'')+'>결제 취소 · 정산에서 제외</option></select></div>'+
   field('gross','네이버 결제금액 (원)',c.gross,'number','required min="1" max="10000000000" step="1" inputmode="numeric" placeholder="예: 471000"')+
   field('paidDate','고객 결제일',c.paidDate||today,'date','required max="'+today+'"')+'</div>'+
   '<div id="nc_totals" class="contract-totals" aria-live="polite"></div>'+
   '<p class="contract-fee-note micro">기존 문의 수수료(일반 5만원·출장 4만원)는 별도이며, 이 계약을 저장해도 추가로 청구하지 않습니다.</p></section>'+
   '<section class="contract-step">'+step('3','러브헌터 정산 확인','러브헌터에서 실제로 입금받은 금액을 기록합니다.')+
   '<details class="contract-disclosure" id="nc_remittance_section" '+(c.remitted!==null&&c.remitted!==undefined||c.remittedDate?'open':'')+'><summary><span>받은 입금 기록 <small>선택 · 입금받은 뒤 입력</small></span></summary><div class="contract-disclosure-body"><p class="micro">아직 입금받지 않았다면 금액과 날짜를 모두 비워 두세요.</p><div class="contract-fields">'+
   field('remitted','실제로 받은 입금액 (원)',c.remitted,'number','min="0" max="10000000000" step="1" inputmode="numeric" placeholder="입금받은 금액"')+
   field('remittedDate','입금받은 날짜',c.remittedDate,'date','max="'+today+'"')+'</div></div></details></section>'+
   '<details class="contract-disclosure contract-review" id="nc_review_section" '+(c.reviewText||c.fireworksUnits?'open':'')+'><summary><span>리뷰 이벤트 제공 <small>선택 · 안내받은 혜택이 있을 때</small></span></summary><div class="contract-disclosure-body">'+
   area('reviewText','리뷰 이벤트 내용',c.reviewText||'',3,600,'예: 리뷰이벤트 폭죽300발')+
   field('fireworksUnits','무료 폭죽 수량 (개)',c.fireworksUnits||0,'number','min="0" max="1000" step="1" inputmode="numeric" required','폭죽 1개는 30발입니다. 300발은 10개, 즉 1묶음입니다.')+
   '<p id="nc_fireworks" class="contract-quantity" aria-live="polite"></p><p class="micro">직원 메모에 남기고, 요트 예약은 BOATN OPS에도 전달합니다. 무료 제공이므로 예약 금액에는 더하지 않습니다.</p></div></details>'+
   (c.bookingChanged?'<p class="contract-alert" role="alert">계약 저장 후 예약 금액이나 환불 내역이 바뀌었습니다. 네이버 결제·환불 내역을 확인한 뒤 다시 저장해 주세요.</p>':'')+
   '<footer class="contract-save"><label class="inline-check" for="nc_confirmed"><input id="nc_confirmed" type="checkbox" required><span>고객 전화번호·결제금액·리뷰 제공 내용을 확인했습니다.</span></label><div class="contract-actions"><button class="primary" type="submit" '+(!editable?'disabled':'')+'>결제·정산 저장</button><button class="secondary" type="button" data-contract="refresh">저장 내용 다시 확인</button></div><p id="nc_feedback" class="contract-feedback" role="status" aria-live="polite" '+(!syncText(c)?'hidden':'')+'>'+e(syncText(c))+'</p></footer></form>'+
   '<details class="contract-history"><summary>계약 변경 이력 · '+data.history.length+'건</summary>'+data.history.map(h=>'<article><p><strong>'+e(h.action)+'</strong></p><p class="micro">'+e(new Date(h.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · '+e(h.actor)+'</p><dl>'+[['고객 결제',h.data.gross],['6.5% 공제',h.data.fee],['받을 금액',h.data.expectedNet],['실제 입금',h.data.remitted]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+money(value)+'</dd></div>').join('')+'</dl></article>').join('')+'</details>';
  const button=document.querySelector('[data-contract="open"]');if(button){button.textContent='계약 입력 접기';button.setAttribute('aria-expanded','true');}
  totals();quantity();
 }
 function syncText(c){return c.syncState==='succeeded'?'리뷰 이벤트가 BOATN OPS에 반영됐습니다.':c.syncState==='failed'?(c.syncError||'리뷰 이벤트의 OPS 반영 상태를 확인해 주세요.'):c.syncState?'리뷰 이벤트는 요트 예약 확정과 OPS 등록이 완료된 후 반영됩니다.':'';}
 function feedback(id,text){const el=document.getElementById(id);if(el){el.textContent=text;el.hidden=!text;}}
 function quantity(){const el=document.getElementById('nc_fireworks'),v=Number(document.getElementById('nc_fireworksUnits')?.value);if(!el)return;el.textContent=Number.isInteger(v)&&v>0?v*30+'발 = '+v+'개'+(v%10===0?' = '+v/10+'묶음':''):'무료 폭죽 제공 없음';}
 function totals(){
  const v=document.getElementById('nc_gross'),out=document.getElementById('nc_totals');if(!v||!out)return;
  const n=v.value===''?null:Number(v.value);
  if(!C.money(n)||n<=0){out.innerHTML='<p class="contract-empty">네이버 결제금액을 입력하면 6.5% 공제액과 받을 금액을 자동으로 계산합니다.</p>';return;}
  const c=C.calculate(n),booking=current.communication?.booking?.amount??null,cancelled=document.getElementById('nc_status').value==='cancelled';
  const diff=booking===null?null:c.expectedNet-booking;
  out.innerHTML='<dl class="contract-money-grid">'+[['고객이 결제한 금액',c.gross,'네이버 결제금액 · 매출'],['6.5% 공제액',c.fee,'결제금액에서 차감'],['러브헌터가 입금해 줄 금액',c.expectedNet,'고객 결제금액 − 공제액']].map(([label,value,help])=>'<div><dt>'+label+'</dt><dd>'+money(value)+'</dd><small>'+help+'</small></div>').join('')+'</dl>'+
   (booking===null?'': '<div class="contract-comparison"><span>현재 예약 금액 <strong>'+money(booking)+'</strong></span><span>'+ (diff===0?'받을 금액과 일치': '예약 금액과 차이 <strong>'+(diff>0?'+':'−')+money(Math.abs(diff))+'</strong>')+'</span></div>')+
   '<p class="micro">'+(diff?'금액 차이를 확인해 주세요. ':'')+'기존 예약 금액은 그대로 유지합니다. 공제액은 원 단위로 반올림합니다.</p>'+
   (cancelled?'<p class="contract-alert">결제 취소로 저장하면 이 계약의 매출·정산·리뷰 제공이 제외됩니다. 예약 자체는 취소되지 않습니다.</p>':'');
 }
 document.addEventListener('input',ev=>{if(ev.target.closest('#naverContractForm')){changed=true;onDirty();totals();quantity();const check=document.getElementById('nc_confirmed');if(ev.target!==check)check.checked=false;}});
 document.addEventListener('change',ev=>{if(ev.target.id==='nc_status')totals();});
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-contract]');if(!b||pending||!current)return;
  if(b.dataset.contract==='open'&&document.getElementById('naverContractForm')){
   const editor=document.getElementById('contractEditor');editor.hidden=!editor.hidden;b.textContent=editor.hidden?'계약 입력 열기':'계약 입력 접기';b.setAttribute('aria-expanded',String(!editor.hidden));return;
  }
  if(b.dataset.contract==='parse'){
   const raw=document.getElementById('nc_raw').value;if(!raw.trim()){feedback('nc_parse','먼저 러브헌터에서 받은 계약 안내를 붙여넣어 주세요.');document.getElementById('nc_raw').focus();return;}
   const p=C.parse(raw);
   if(p.phone)document.getElementById('nc_phone').value=p.phone;
   if(p.gross!==null)document.getElementById('nc_gross').value=p.gross;
   document.getElementById('nc_reviewText').value=p.reviewText;document.getElementById('nc_fireworksUnits').value=p.fireworksUnits;
   if(p.reviewText||p.fireworksUnits)document.getElementById('nc_review_section').open=true;
   document.getElementById('nc_confirmed').checked=false;changed=true;onDirty();totals();quantity();
   const issues=[p.phones.length!==1?'계약 안내에 고객 전화번호 한 개가 있는지 확인해 주세요.':'',p.phone&&p.phone!==C.cleanPhone(current.phone)?'현재 예약 고객과 전화번호가 다릅니다. 해당 고객의 상담에서 입력해 주세요.':'',p.amountAmbiguous?'결제금액을 한 가지로 확인하지 못했습니다. 아래 금액을 직접 확인해 주세요.':'',p.quantityAmbiguous?'폭죽 수량을 개 단위로 확인해 주세요. 300발은 10개입니다.':''].filter(Boolean);
   feedback('nc_parse',[p.person?'계약 성함: '+p.person+'.':'',issues.length?issues.join(' '):'내용을 불러왔습니다. 아래 결제금액·결제일을 확인하고 저장해 주세요.'].filter(Boolean).join(' '));return;
  }
  if(changed&&document.getElementById('naverContractForm')){feedback('nc_feedback','아직 저장하지 않은 내용이 있습니다. ‘결제·정산 저장’을 먼저 눌러 주세요. 입력한 내용은 유지됩니다.');return;}
  pending=true;b.disabled=true;const id=current.id,editor=document.getElementById('contractEditor');
  try{const result=await api('admin/consultations/'+id+'/naver-contract');if(current?.id===id&&editor===document.getElementById('contractEditor'))paint(result);}
  catch(err){if(editor===document.getElementById('contractEditor')){editor.hidden=false;editor.textContent=err.message;}}
  finally{pending=false;b.disabled=false;}
 });
 document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='naverContractForm')return;ev.preventDefault();if(pending||!current.can_edit)return;
  const val=id=>document.getElementById('nc_'+id).value,form=ev.target;pending=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   const data={version:record?.version||0,raw:val('raw'),phone:val('phone'),gross:Number(val('gross')),paidDate:val('paidDate'),remitted:val('remitted')===''?null:Number(val('remitted')),remittedDate:val('remittedDate'),reviewText:val('reviewText'),fireworksUnits:Number(val('fireworksUnits')),status:val('status'),confirmed:document.getElementById('nc_confirmed').checked};
   const result=await api('admin/consultations/'+current.id+'/naver-contract','POST',data);
   onSaved();paint(result);feedback('nc_feedback','결제·정산 내역을 저장했습니다. '+syncText(result.contract));
  }catch(err){feedback('nc_feedback',err.message);}
  finally{pending=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 return {html};
};
})();
