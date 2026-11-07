/* Shared, deterministic ownership/reminder presentation. No customer data is stored. */
(() => {
 'use strict';
 let clockOffset=0;
 const syncClock=value=>{const timestamp=Date.parse(value);if(Number.isFinite(timestamp))clockOffset=timestamp-Date.now();};
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
 function paymentWait(r,now=Date.now()+clockOffset){
  if(r.deleted_at||r.status!=='awaiting_payment')return {state:'none',overdue:false};
  const latest=r.status_timeline?.at(-1),value=r.awaiting_payment_at||(latest?.to==='awaiting_payment'?latest.at:null),start=Date.parse(value);
  if(!Number.isFinite(start))return {state:'unknown',overdue:false};
  const deadline=start+2*60*60*1000,current=Number(new Date(now));
  const lastSent=(r.communication?.events||[]).filter(x=>x.stage==='payment_reminder'&&x.kind==='manual_sent'&&Date.parse(x.at)>=start&&(!x.waitingStartedAt||Date.parse(x.waitingStartedAt)===start)).at(-1)?.at;
  return {state:current>=deadline?'overdue':'waiting',overdue:current>=deadline,startedAt:new Date(start).toISOString(),deadline:new Date(deadline).toISOString(),remainingMinutes:Math.max(0,Math.ceil((deadline-current)/60000)),overdueMinutes:Math.max(0,Math.floor((current-deadline)/60000)),lastSentAt:lastSent||null};
 }
 globalThis.MomentLinkOwnership={bookingKey,sent,reminder,paymentWait,syncClock};
})();
