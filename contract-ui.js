(() => {
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),C=globalThis.MomentLinkContract;
const money=v=>v===null||v===undefined?'미확인':Number(v).toLocaleString('ko-KR')+'원';
window.MomentLinkContractUI=({api,onDirty,onSaved})=>{
 let current=null,record=null,pending=false,changed=false;
 const input=(id,label,value,type='text',extra='')=>'<label>'+label+'<input class="admin-input" id="nc_'+id+'" type="'+type+'" value="'+e(value??'')+'" '+extra+'/></label>';
 function html(r){
  current=r;record=null;
  return '<section class="admin-card naver-contract"><div class="contract-heading"><div><h3>러브헌터 계약 · 네이버 결제</h3><p class="micro">기존 상담에 계약 결제·정산·리뷰 이벤트를 기록합니다. 문의 수수료는 다시 청구하지 않습니다.</p></div><button type="button" class="secondary" data-contract="open">계약 정보 열기</button></div><div id="contractEditor"></div></section>';
 }
 function paint(data){
  changed=false;record=data.contract;const c=record||{},today=new Date(Date.now()+32400000).toISOString().slice(0,10);
  document.getElementById('contractEditor').innerHTML='<form id="naverContractForm"><p class="info">예약 원본 금액과 확정 상태는 유지합니다. 매출은 고객 결제금액, 정산 수수료는 결제금액의 6.5%입니다. 실제 송금·문자는 실행하지 않습니다.</p><label>계약 안내 붙여넣기<textarea class="admin-textarea" id="nc_raw" maxlength="4000" rows="5" placeholder="계약: 성함 (전화번호)\n471,000원 카드결제 확인되었습니다.\n리뷰이벤트 폭죽300발"></textarea></label><button type="button" class="secondary" data-contract="parse">내용 수집·미리보기</button><p id="nc_parse" class="micro" role="status"></p><div class="contract-fields">'+input('phone','계약 전화번호',current.phone,'tel','required')+input('gross','고객 네이버 결제금액 (원)',c.gross,'number','required min="1" max="10000000000" step="1"')+input('paidDate','고객 결제일',c.paidDate||today,'date','required')+input('remitted','실제 정산 입금액 (원) · 미입금이면 비워 두세요',c.remitted,'number','min="0" max="10000000000" step="1"')+input('remittedDate','실제 정산 입금일',c.remittedDate,'date')+'<label>계약 정산 상태<select class="admin-select" id="nc_status"><option value="active" '+(c.status!=='cancelled'?'selected':'')+'>유효한 결제</option><option value="cancelled" '+(c.status==='cancelled'?'selected':'')+'>계약 취소 · 정산 집계 제외</option></select></label></div><div id="nc_totals" class="contract-totals"></div><label>리뷰 이벤트 · 직원 전용<textarea class="admin-textarea" id="nc_reviewText" rows="3" maxlength="600">'+e(c.reviewText||'')+'</textarea></label>'+input('fireworksUnits','무료 리뷰 폭죽 수량 (개) · 30발/개, 10개=1묶음',c.fireworksUnits||0,'number','min="0" max="1000" step="1" required')+'<p class="micro">리뷰 이벤트만 BOATN OPS에 전달합니다. 무료 제공이므로 예약 총액에는 더하지 않습니다.</p>'+(c.bookingChanged?'<p class="info" role="alert">계약 저장 후 예약 금액·환불이 변경되었습니다. 네이버 결제·환불 내역을 대조해 금액을 수정한 뒤 저장해 주세요.</p>':'')+'<label class="inline-check"><input id="nc_confirmed" type="checkbox" required/>고객·결제액·리뷰 제공 수량을 확인했습니다. 취소 선택은 계약 정산·리뷰 제공만 제외합니다.</label><div class="contract-actions"><button class="primary" type="submit" '+(!current.can_edit?'disabled':'')+'>계약·정산 저장</button><button class="secondary" type="button" data-contract="refresh">반영 상태 확인</button></div><p id="nc_feedback" role="status">'+syncText(c)+'</p></form><details class="contract-history"><summary>계약 변경 이력 · '+data.history.length+'건</summary>'+data.history.map(h=>'<p>'+e(new Date(h.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · '+e(h.actor)+' · '+e(h.action)+'<br>결제 '+money(h.data.gross)+' / 공제 '+money(h.data.fee)+' / 예정 '+money(h.data.expectedNet)+' / 실제 입금 '+money(h.data.remitted)+'</p>').join('')+'</details>';
  totals();
 }
 function syncText(c){return c.syncState==='succeeded'?'리뷰 이벤트 BOATN OPS 반영 완료':c.syncState==='failed'?e(c.syncError||'OPS 반영 확인 필요'):c.syncState?'리뷰 이벤트 OPS 반영 대기 · 요트 확정 및 OPS 등록 완료 후 반영됩니다.':'';}
 function totals(){
  const v=document.getElementById('nc_gross'),out=document.getElementById('nc_totals');if(!v||!out)return;
  const n=v.value===''?null:Number(v.value);if(!C.money(n)){out.textContent='결제금액을 입력해 주세요.';return;}
  const c=C.calculate(n),booking=current.communication?.booking?.amount??null;
  out.innerHTML=[['고객 결제금액 · 매출',c.gross],['정산 공제 · 6.5%',c.fee],['입금 예정액',c.expectedNet],['현재 예약 금액',booking],['예정액 − 예약 금액',booking===null?null:c.expectedNet-booking]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+money(value)+'</strong></div>').join('')+'<p class="micro">공제액은 원 단위 반올림합니다. 문의 수수료는 별도로 유지됩니다.</p>';
 }
 document.addEventListener('input',ev=>{if(ev.target.closest('#naverContractForm')){changed=true;onDirty();totals();const check=document.getElementById('nc_confirmed');if(ev.target!==check)check.checked=false;}});
 document.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-contract]');if(!b||pending||!current)return;
  if(b.dataset.contract==='parse'){
   const p=C.parse(document.getElementById('nc_raw').value);
   if(p.phone)document.getElementById('nc_phone').value=p.phone;
   if(p.gross!==null)document.getElementById('nc_gross').value=p.gross;
   document.getElementById('nc_reviewText').value=p.reviewText;document.getElementById('nc_fireworksUnits').value=p.fireworksUnits;
   document.getElementById('nc_confirmed').checked=false;changed=true;onDirty();totals();
   document.getElementById('nc_parse').textContent=[p.person?'수집한 성함: '+p.person:'',p.phones.length!==1?'전화번호 한 개를 확인해 주세요.':'',p.phone&&p.phone!==C.cleanPhone(current.phone)?'현재 고객과 전화번호가 다릅니다. 저장할 수 없습니다.':'',p.amountAmbiguous?'결제금액을 직접 확인해 주세요.':'',p.quantityAmbiguous?'폭죽 수량을 개 단위로 직접 확인해 주세요.':'',p.fireworksUnits?'폭죽 '+p.fireworksUnits*30+'발 = '+p.fireworksUnits+'개 ('+p.fireworksUnits/10+'묶음)':''].filter(Boolean).join(' ');
   return;
  }
  if(changed&&document.getElementById('naverContractForm')){document.getElementById('nc_feedback').textContent='입력 중인 내용을 먼저 저장해 주세요. 작성 내용은 그대로 유지했습니다.';return;}
  pending=true;b.disabled=true;
  try{paint(await api('admin/consultations/'+current.id+'/naver-contract'));}catch(err){document.getElementById('contractEditor').textContent=err.message;}finally{pending=false;b.disabled=false;}
 });
 document.addEventListener('submit',async ev=>{
  if(ev.target.id!=='naverContractForm')return;ev.preventDefault();if(pending)return;
  const val=id=>document.getElementById('nc_'+id).value,form=ev.target;pending=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   const data={version:record?.version||0,raw:val('raw'),phone:val('phone'),gross:Number(val('gross')),paidDate:val('paidDate'),remitted:val('remitted')===''?null:Number(val('remitted')),remittedDate:val('remittedDate'),reviewText:val('reviewText'),fireworksUnits:Number(val('fireworksUnits')),status:val('status'),confirmed:document.getElementById('nc_confirmed').checked};
   const result=await api('admin/consultations/'+current.id+'/naver-contract','POST',data);
   onSaved();paint(result);document.getElementById('nc_feedback').textContent='계약 결제·정산을 저장했습니다. 기존 문의 수수료는 유지됩니다. '+syncText(result.contract);
  }catch(err){document.getElementById('nc_feedback').textContent=err.message;}finally{pending=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 return {html};
};
})();
