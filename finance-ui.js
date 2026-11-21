/* Authenticated administrator management reports. No financial data is stored in browser storage. */
(() => {
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null||n===undefined?'미입력':Math.round(n).toLocaleString('ko-KR')+'원',pct=n=>n===null?'—':n.toFixed(1)+'%';
const sourceNames={lovehunter:'러브헌터',seollem:'설렘',other:'기타',unknown:'미분류',shared:'공통'};
const categories={materials:'재료·제작비',labor:'인건비',travel:'출장·운송비',venue:'장소·대관료',other:'기타 비용'};
const products={yacht:'요트',visit:'출장',trunk:'트렁크',heli:'헬기',undecided:'미정'};
const statuses={new:'접수중',consulting:'상담중',confirmed:'확정',closed:'완료',cancelled:'취소',hold:'보류',awaiting_payment:'입금대기',initial_unreachable:'연락안됨',no_response:'답변없음'};
const field=(id,label,value,type='number')=>'<label>'+label+'<input class="admin-input" id="fin_'+id+'" type="'+type+'" value="'+e(value??'')+'" '+(type==='number'?'min="0" max="10000000000" step="1" inputmode="numeric"':'maxlength="1000"')+'/></label>';
const select=(id,label,options,value)=>'<label>'+label+'<select class="admin-select" id="fin_'+id+'">'+Object.entries(options).map(([k,v])=>'<option value="'+e(k)+'" '+(k===value?'selected':'')+'>'+e(v)+'</option>').join('')+'</select></label>';
const table=(title,heads,rows)=>'<div class="finance-table-wrap" role="region" aria-label="'+e(title)+'" tabindex="0"><table class="finance-table"><caption>'+e(title)+'</caption><thead><tr>'+heads.map(h=>'<th scope="col">'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const csvCell=v=>{let s=String(v??'');if(typeof v!=='number'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
window.MomentLinkFinanceUI=({api,render,onBusy})=>{
 let month=MomentLinkLoveHunter.today().slice(0,7),data=null,error='',pending=false,editing=null,sourceFilter='all',productFilter='all';
 async function load(){data=await api('admin/finance/report?month='+encodeURIComponent(month));}
 const filtered=()=>data.bookings.filter(r=>(sourceFilter==='all'||r.source===sourceFilter)&&(productFilter==='all'||r.category===productFilter));
 function costForm(){
  if(!editing)return '';
  const c=editing;
  return '<form id="financeCost" class="admin-card"><h3>'+ (c.version?'비용 수정':'추가 비용 기록')+'</h3><p class="micro">귀속월 '+e(month)+' · 광고비·러브헌터 수수료는 위 월별 항목에 기록하여 중복 계산을 막습니다.</p><div class="finance-fields">'+select('category','비용 구분',categories,c.category)+select('costSource','귀속 유입경로',Object.fromEntries(Object.entries(sourceNames).filter(([k])=>k!=='unknown')),c.source)+field('vendor','거래처',c.vendor,'text')+field('amount','비용 총액 (부가세 포함)',c.amount)+field('paid','누적 지급액 · 모르면 빈칸',c.paid)+field('vat','증빙상 부가세 · 모르면 빈칸',c.vat)+field('evidence','증빙 종류·번호',c.evidence,'text')+field('costNote','비용 메모',c.note,'text')+'</div>'+(c.version?'<label class="inline-check"><input id="fin_voided" type="checkbox" '+(c.voided?'checked':'')+'/>이 내역을 집계에서 제외 (이력 보존)</label>':'')+'<div class="finance-actions"><button class="primary" type="submit">비용 저장</button><button class="secondary" data-fin="close-cost" type="button">닫기</button></div></form>';
 }
 function html(){
  if(!data)return '<p class="info">통합 정산을 불러오고 있습니다.</p>';
  const d=data,m=d.metrics,s=d.settings,hasWarnings=m.missingAmount||m.missingReceived||m.unclassified||m.cancelledReceived||m.overpaid||m.advertising===null;
  const kpis=[['예약매출 · 조정 후',money(m.sales),'행사월 확정·완료 '+m.reservations+'건'],['입금 누계 · 환불 후',money(m.received),'행사월 예약별 누계'],['미수금',money(m.due),'입금액이 확인된 예약 기준'],['러브헌터 수수료',money(m.fees),'최초 접수 '+m.feeCount+'건'],['설렘 광고비',money(m.advertising),'입력한 월별 총액'],['추가 비용',money(m.otherCosts),'재료·인건비·출장비 등'],['관리손익 · 참고',money(m.margin),'예약매출 − 수수료 − 광고비 − 추가 비용'],['미지급 비용',money(m.payables),'지급액 확인 항목 기준 · 미확인 '+m.missingExpensePayment+'항목']];
  const warning=hasWarnings?'<div class="info">확인 필요: '+[m.missingAmount?'예약 총액 미입력 '+m.missingAmount+'건':'',m.missingReceived?'입금 미입력 '+m.missingReceived+'건':'',m.unclassified?'유입경로 미분류 '+m.unclassified+'건 ('+money(m.unclassifiedSales)+')':'',m.advertising===null?'설렘 광고비 미입력 (없으면 0원 입력)':'',m.cancelledReceived?'취소 예약에 남은 입금 기록 '+money(m.cancelledReceived):'',m.overpaid?'초과 입금 '+money(m.overpaid):''].filter(Boolean).join(' · ')+'</div>':'';
  const monthly='<details class="finance-section"><summary>월별 광고비·지급 기록</summary><form id="financeMonthCost"><p class="micro">설렘 소개 수수료는 0원입니다. 광고비는 이곳에 월별 총액으로 입력합니다. 지급액은 모르면 빈칸으로 두세요. 미입력과 0원은 구분합니다.</p><div class="finance-fields">'+field('advertisingAmount','설렘 광고비 총액',s.advertisingAmount)+field('advertisingPaid','광고비 누적 지급액',s.advertisingPaid)+field('referralPaid','러브헌터 수수료 누적 지급액',s.referralPaid)+field('monthNote','월 정산 메모',s.note,'text')+'</div><button class="primary" type="submit">월별 비용 저장</button></form></details>';
  const sourceRows=d.bySource.map(r=>[e(r.name),r.leads+'건',r.confirmed+'건 / '+pct(r.conversion),money(r.sales),money(r.received),money(r.due),money(r.marketing),money(r.costPerLead),pct(r.roas)]);
  const bookingRows=filtered().map(r=>[e(r.event_date||'날짜 없음'),e(r.person||'개인정보 미보관')+'<br><span class="micro">'+e(r.receipt||'')+'</span>',e(sourceNames[r.source]||'미분류')+(r.source_label?'<br>'+e(r.source_label):''),e(products[r.category]||r.category),'<span class="lh-status-badge" data-status="'+e(r.status)+'">'+e(statuses[r.status]||r.status)+'</span>',money(r.amount),money(r.received),money(r.refund),money(r.due)]);
  const feeRows=d.fees.map(r=>'<article class="admin-card lh-report-item" data-status="'+e(r.status||'unknown')+'"><div><div class="lh-report-heading"><strong>'+e(r.person||'상담 삭제·보유기간 종료')+'</strong><span class="lh-status-badge">'+e(statuses[r.status]||'상담 정보 없음')+'</span></div><span class="micro">'+e(r.received_date)+' · '+(r.kind==='visit'?'출장':'일반')+'</span></div><strong>'+money(r.amount)+'</strong>'+(r.consultation_id?'<button class="secondary" data-lh="detail" data-id="'+e(r.consultation_id)+'" type="button">상담 보기</button>':'')+'</article>').join('');
  return '<section class="finance-report"><form id="financeMonth" class="finance-actions">'+field('month','조회 월',month,'month')+'<button class="secondary" type="submit">조회</button><button class="secondary" type="button" data-fin="csv">정산 CSV 내려받기</button></form><p class="micro">'+e(d.basis)+'</p>'+warning+'<p id="financeError" role="status" class="lh-feedback">'+e(error)+'</p><div class="finance-kpis">'+kpis.map(([title,value,note])=>'<article class="admin-card"><span>'+e(title)+'</span><strong>'+value+'</strong><small>'+e(note)+'</small></article>').join('')+'</div>'+monthly+
  '<details class="finance-section" open><summary>유입경로별 성과·광고 효율</summary><p class="micro">전환율 = 이 달 접수 상담 중 현재 확정·완료 건수 ÷ 이 달 접수 건수. 예약매출은 행사월 기준입니다. ROAS = 해당 유입 예약매출 ÷ 당월 소개비·광고비. 월 기준이 달라 참고 지표로 사용하세요. 공통 비용은 임의 배분하지 않습니다.</p>'+table('유입경로별 통계',['유입경로','접수','확정 / 전환율','예약매출','누적 입금','미수금','소개비·광고비','접수당 비용','ROAS'],sourceRows)+'</details>'+
  '<details class="finance-section"><summary>상품별 매출</summary>'+table('상품별 매출',['상품','예약','매출','입금','미수금'],d.byProduct.map(r=>[e(products[r.category]||r.category),r.count+'건',money(r.sales),money(r.received),money(r.due)]))+'</details>'+
  '<details class="finance-section"><summary>'+e(month.slice(0,4))+'년 월별 추이</summary>'+table('월별 추이',['월','확정·완료','예약매출','수수료','설렘 광고비','추가 비용','관리손익'],d.trend.map(r=>[r.month,r.reservations+'건',money(r.sales),money(r.fees),money(r.advertising),money(r.otherCosts),money(r.margin)]))+'</details>'+
  '<details class="finance-section" open><summary>예약별 매출·입금·환불 상세</summary><div class="finance-fields">'+select('sourceFilter','상세 목록 유입경로',{'all':'전체',...Object.fromEntries(Object.entries(sourceNames).filter(([k])=>k!=='shared'))},sourceFilter)+select('productFilter','상세 목록 상품',{'all':'전체',...products},productFilter)+'</div><p class="micro">위 합계는 전체 예약 기준입니다. 취소 예약은 아래에서 확인할 수 있으며 매출 합계에는 포함하지 않습니다.</p>'+table('예약별 상세',['행사일','고객·접수번호','유입경로','상품','상태','예약금액','누적 입금','누적 환불','잔금'],bookingRows)+'<p class="micro">조정 전 계약액 '+money(m.gross)+' · 감액 '+money(m.reductions)+' · 환불 전 입금 '+money(m.grossReceived)+' · 해당 예약 누적 환불 '+money(m.refundForBookings)+'</p></details>'+
  '<details class="finance-section"><summary>이번 달 옵션 취소·환불 기록 · '+money(m.refundsThisMonth)+'</summary><p class="micro">환불 기록일의 한국 시간 기준입니다. 이미 조정된 예약금액에서 다시 차감하지 않습니다. 별도로 처리한 전액 취소 환불은 예약의 입금 기록과 함께 확인하세요.</p>'+table('월 환불 기록',['기록일','고객','유입경로','감액','환불'],d.refunds.map(r=>[e(new Date(r.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})),e(r.person),e(sourceNames[r.source]),money(r.reduction),money(r.amount)]))+'</details>'+
  '<details class="finance-section"><summary>러브헌터 수수료 상세 · '+m.feeCount+'건</summary><p class="micro">일반 50,000원 · 출장 40,000원. 예약 취소 여부와 무관하게 번호당 최초 1회만 계산합니다. 설렘·기타 접수는 자동 소개 수수료가 없습니다.</p><div class="lh-report-list">'+(feeRows||'<p>해당 월 수수료가 없습니다.</p>')+'</div></details>'+
  '<section class="finance-section"><div class="finance-actions"><h3>추가 비용·증빙</h3><button class="secondary" type="button" data-fin="add-cost">비용 추가</button></div><p class="micro">총액은 부가세 포함 입력값입니다. 증빙상 부가세는 별도 기록하며 공제 가능 여부는 자동 판단하지 않습니다. 미입력 원가·인건비·세금은 관리손익에 반영되지 않습니다.</p>'+costForm()+table('추가 비용 내역',['구분·거래처','유입경로','총액','지급','부가세','증빙','상태','수정'],d.costs.map(c=>[e(categories[c.category])+'<br>'+e(c.vendor),e(sourceNames[c.source]),money(c.amount),money(c.paid),money(c.vat),e(c.evidence),c.voided?'집계 제외':'반영','<button type="button" class="secondary" data-fin="edit-cost" data-id="'+e(c.id)+'">수정</button>']))+'</section>'+
  '<details class="finance-section"><summary>비용 변경 이력 · 최근 '+d.history.length+'건</summary>'+d.history.map(h=>'<article class="finance-history"><strong>'+e(h.action==='month_saved'?'월별 비용 저장':h.action==='cost_voided'?'비용 집계 제외':'비용 저장')+'</strong><span>'+e(h.actor)+' · '+e(new Date(h.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</span>'+historyValues(h)+'</article>').join('')+'</details><p class="micro">최근 조회: '+e(new Date(d.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · 고객 개인정보 보유기간 종료 후에는 금액·유입경로 등 이름과 연락처 없는 집계 기록만 유지됩니다.</p></section>';
 }
 function historyValues(h){
  const keys={advertising_amount:'광고비',advertising_paid:'광고비 지급',referral_paid:'수수료 지급',amount:'비용 총액',paid:'지급액',vat:'증빙 부가세',vendor:'거래처',evidence:'증빙',note:'메모',source:'유입경로',category:'비용 구분',voided:'집계 제외'};
  return '<ul>'+Object.entries(keys).filter(([k])=>Object.hasOwn(h.after_value,k)&&JSON.stringify(h.before_value?.[k])!==JSON.stringify(h.after_value[k])).map(([k,label])=>'<li>'+label+': '+e(h.before_value?.[k]??'미입력')+' → '+e(h.after_value[k]??'미입력')+'</li>').join('')+'</ul>';
 }
 function exportCsv(){
  const d=data,m=d.metrics,rows=[['모먼트링크 통합 정산',month],['집계 기준',d.basis],[],['예약매출',m.sales],['누적 입금',m.received],['미수금',m.due],['소개 수수료',m.fees],['설렘 광고비',m.advertising],['추가 비용',m.otherCosts],['관리손익(참고)',m.margin],[],['행사일','접수번호','고객','유입경로','상품','상태','예약금액','입금누계','환불누계','잔금']];
  d.bookings.forEach(r=>rows.push([r.event_date,r.receipt,r.person,sourceNames[r.source],products[r.category],statuses[r.status],r.amount,r.received,r.refund,r.due]));
  rows.push([],['유입경로','접수','전환','예약매출','입금','미수금','소개비·광고비','ROAS']);
  d.bySource.forEach(r=>rows.push([r.name,r.leads,r.confirmed,r.sales,r.received,r.due,r.marketing,r.roas]));
  rows.push([],['비용구분','유입경로','거래처','총액','지급액','부가세','증빙','메모','집계 제외']);
  d.costs.forEach(c=>rows.push([categories[c.category],sourceNames[c.source],c.vendor,c.amount,c.paid,c.vat,c.evidence,c.note,c.voided?'예':'아니오']));
  rows.push([],['수수료 접수일','고객','문의 구분','수수료']);d.fees.forEach(r=>rows.push([r.received_date,r.person,r.kind==='visit'?'출장':'일반',r.amount]));
  rows.push([],['월','예약매출','수수료','광고비','추가 비용','관리손익']);d.trend.forEach(r=>rows.push([r.month,r.sales,r.fees,r.advertising,r.otherCosts,r.margin]));
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='모먼트링크-통합정산-'+month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const val=id=>document.getElementById('fin_'+id)?.value??'';
 const number=id=>{const v=val(id).trim();if(!v)return null;const n=Number(v);if(!/^\d+$/.test(v)||!Number.isSafeInteger(n)||n>10000000000)throw Error('금액은 0 이상의 정수로 입력해 주세요.');return n;};
 const showError=()=>{const el=document.getElementById('financeError');if(el){el.textContent=error;el.scrollIntoView({block:'nearest'});}};
 document.addEventListener('change',ev=>{if(ev.target.id==='fin_sourceFilter'||ev.target.id==='fin_productFilter'){sourceFilter=val('sourceFilter');productFilter=val('productFilter');render();}});
 document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-fin]');if(!b||pending)return;
  const action=b.dataset.fin;
  if(action==='csv'){exportCsv();return;}
  if(action==='add-cost')editing={id:crypto.randomUUID(),version:0,category:'materials',source:'shared',vendor:'',amount:null,paid:null,vat:null,evidence:'',note:'',voided:false};
  if(action==='edit-cost')editing={...data.costs.find(c=>c.id===b.dataset.id)};
  if(action==='close-cost')editing=null;
  render();if(editing)document.getElementById('financeCost')?.scrollIntoView({block:'nearest'});
 });
 document.addEventListener('submit',async ev=>{
  if(!['financeMonth','financeMonthCost','financeCost'].includes(ev.target.id))return;ev.preventDefault();if(pending)return;
  pending=true;onBusy(true);error='';const form=ev.target;form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   if(form.id==='financeMonth'){const next=val('month');await api('admin/finance/report?month='+encodeURIComponent(next)).then(r=>{data=r;month=next;});editing=null;}
   if(form.id==='financeMonthCost'){await api('admin/finance/month','POST',{month,version:data.settings.version,advertisingAmount:number('advertisingAmount'),advertisingPaid:number('advertisingPaid'),referralPaid:number('referralPaid'),note:val('monthNote')});await load();}
   if(form.id==='financeCost'){const payload={id:editing.id,month,version:editing.version,category:val('category'),source:val('costSource'),vendor:val('vendor'),amount:number('amount'),paid:number('paid'),vat:number('vat'),evidence:val('evidence'),note:val('costNote'),voided:!!document.getElementById('fin_voided')?.checked};await api('admin/finance/cost','POST',payload);editing=null;await load();}
   render();
  }catch(err){error=err.message;showError();}
  finally{pending=false;onBusy(false);form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 return {load,html};
};
})();