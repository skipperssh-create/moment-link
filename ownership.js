/* Shared, deterministic ownership/reminder presentation. No customer data is stored. */
(() => {
 'use strict';
 const bookingKey=r=>[r.communication?.booking?.date||'',r.communication?.booking?.time||''].join('T');
 const sent=(r,stage)=>{
  const reservation=r.communication?.reservation||{};
  const since=Math.max(0,...[reservation.confirmedAt,reservation.updatedAt,reservation.restoredAt].map(x=>Date.parse(x)||0));
  return (r.communication?.events||[]).some(event=>event.stage===stage&&event.kind==='manual_sent'&&
   (!event.bookingKey||event.bookingKey===bookingKey(r))&&(stage==='receipt'||Date.parse(event.at)>=since));
 };
 function reminder(r,now=new Date()){
  const date=r.communication?.booking?.date;
  if(r.deleted_at||r.status!=='confirmed'||!date)return {state:'none',due:false,label:''};
  if(sent(r,'reminder'))return {state:'done',due:false,label:'리마인드 발송 기록 완료'};
  const today=new Date(+new Date(now)+9*3600000).toISOString().slice(0,10);
  const tomorrow=new Date(+new Date(now)+33*3600000).toISOString().slice(0,10);
  return {state:date<=tomorrow?'due':'scheduled',due:date<=tomorrow,
   label:date<today?'리마인드 기록 확인 · 행사일 지남':date===today?'리마인드 확인 · 오늘 행사':date===tomorrow?'리마인드 필요 · 내일 행사':'리마인드 예정'};
 }
 globalThis.MomentLinkOwnership={bookingKey,sent,reminder};
})();
