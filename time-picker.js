/* Staff booking times: explicit ten-minute choices, stored as the existing HH:mm value. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minutes=Object.freeze(['00','10','20','30','40','50']);
const hours=Object.freeze([...Array.from({length:14},(_,h)=>String(h+10)),'00']);
const hourLabel=h=>h==='00'?'밤 12시 (자정)':`${Number(h)<12?'오전':'오후'} ${Number(h)%12||12}시`;
const valid=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
function html(id,label,value='',attributes=''){
 const [hour,minute]=valid(value)?value.split(':'):['',''];
 const disabled=/\bdisabled\b/.test(attributes),required=/\brequired\b/.test(attributes),flags=(disabled?' disabled':'')+(required?' required':'');
 // Display an old irregular time faithfully; never round an existing reservation silently.
 const legacy=minute&&!minutes.includes(minute),legacyHour=hour&&!hours.includes(hour);
 return `<div class="booking-time-picker" data-time-picker role="group" aria-label="${esc(label)} · 오전 10시부터 밤 12시 · 10분 단위"><input type="hidden" data-time-value id="${esc(id)}" value="${esc(valid(value)?value:'')}" ${attributes}/><select class="admin-select" id="${esc(id)}_hour" data-time-part="hour" aria-label="${esc(label)} · 시"${flags}><option value="">시 선택</option>${legacyHour?`<option value="${hour}" selected disabled>${hourLabel(hour)} · 기존 시간</option>`:''}${hours.map(n=>`<option value="${n}" ${n===hour?'selected':''}>${hourLabel(n)}</option>`).join('')}</select><select class="admin-select" id="${esc(id)}_minute" data-time-part="minute" aria-label="${esc(label)} · 분 (10분 단위)"${flags}><option value="">분 선택</option>${legacy?`<option value="${minute}" selected disabled>${minute}분 · 기존 시간</option>`:''}${minutes.map(n=>`<option value="${n}" ${n===minute?'selected':''}${hour==='00'&&n!=='00'?' disabled':''}>${n}분${hour==='00'&&n===minute&&n!=='00'?' · 기존 시간':''}</option>`).join('')}</select><span class="micro" data-time-midnight style="grid-column:1/-1" ${hour==='00'?'':'hidden'}>자정은 날짜가 바뀌는 시간입니다. 예: 12일 밤 12시 → 13일 00:00.</span></div>`;
}
document.addEventListener('change',event=>{
 const select=event.target;if(!select.matches?.('[data-time-part]'))return;
 const root=select.closest('[data-time-picker]'),input=root?.querySelector('[data-time-value]');if(!input||input.disabled)return;
 const hour=root.querySelector('[data-time-part="hour"]'),minute=root.querySelector('[data-time-part="minute"]');
 const midnight=hour.value==='00';
 for(const option of minute.options)option.disabled=!!option.value&&(!minutes.includes(option.value)||(midnight&&option.value!=='00'));
 if(midnight)minute.value='00';
 if(!minutes.includes(minute.value))minute.value='';
 const hint=root.querySelector('[data-time-midnight]');if(hint)hint.hidden=!midnight;
 input.value=hours.includes(hour.value)&&minutes.includes(minute.value)?hour.value+':'+minute.value:'';
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
});
globalThis.MomentLinkTime=Object.freeze({html,minutes,hours});
})();
