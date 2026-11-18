/* Mail preparation only: fixed recipient; no requests, storage or automatic sending. */
(() => {
 'use strict';
 const form=document.querySelector('#guide-mail-form');
 if(!form)return;
 const recipient='seolvidmoa@gmail.com';
 const fields={date:form.elements.namedItem('date'),time:form.elements.namedItem('time'),person:form.elements.namedItem('person')};
 const links=[...document.querySelectorAll('a[data-guide-mail]')];
 const subjects=[...document.querySelectorAll('[data-mail-subject]')];
 const status=document.querySelector('#guide-mail-status');
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 const validPerson=value=>!!value.trim()&&value.trim().length<=60&&!/[\u0000-\u001f\u007f]/.test(value);
 let mailHash='',ready=false;
 function readFragment(){
 try{
  const match=/^#mail=([0-9a-z]{1,8})\.([\w-]{1,320})(?:&section=[\w-]+)?$/.exec(location.hash);
  if(match){
   const iso=new Date(parseInt(match[1],36)*60000).toISOString(),date=iso.slice(0,10),time=iso.slice(11,16),person=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(match[2].replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0)));
   if(validDate(date)&&validTime(time)&&validPerson(person)){
    fields.date.value=date;fields.time.value=time;fields.person.value=person.trim();
    mailHash=location.hash.split('&section=')[0];
   }
  }
 }catch{/* Older or incomplete links use the visible reservation fields. */}
 }
 readFragment();
 function refresh(){
  const date=fields.date.value,time=fields.time.value,person=fields.person.value.trim();
  fields.date.setCustomValidity(!date||validDate(date)?'':'예약 날짜를 확인해 주세요.');
  fields.time.setCustomValidity(!time||validTime(time)?'':'예약 시간을 확인해 주세요.');
  fields.person.setCustomValidity(!person||validPerson(fields.person.value)?'':'성함을 확인해 주세요.');
  ready=validDate(date)&&validTime(time)&&validPerson(fields.person.value);
  if(ready)mailHash='#mail='+(Date.parse(date+'T'+time+':00Z')/60000).toString(36)+'.'+btoa(String.fromCharCode(...new TextEncoder().encode(person))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const subject=ready?[date,time,person].join(' / '):'예약 날짜 / 시간 / 성함';
  for(const node of subjects)node.textContent=subject;
  for(const link of links)link.href=ready?'mailto:'+recipient+'?subject='+encodeURIComponent(subject):'#mail-details';
  status.textContent=ready?'메일 앱에 받는 주소와 위 제목이 자동 입력됩니다. 사진·편지 파일은 직접 첨부해 주세요.':'문자에 안내된 예약 날짜·시간·성함을 입력해 주세요. 누락되면 예약 확인이 어려울 수 있습니다.';
 }
 refresh();
 window.addEventListener('hashchange',()=>{
  if(!location.hash.startsWith('#mail='))return;
  for(const field of Object.values(fields))field.value='';
  mailHash='';readFragment();refresh();
 });
 form.addEventListener('input',refresh);
 form.addEventListener('submit',event=>{event.preventDefault();refresh();form.reportValidity();});
 for(const link of links)link.addEventListener('click',event=>{
  refresh();
  if(!ready){
   event.preventDefault();
   document.querySelector('#mail-details').scrollIntoView({block:'center'});
   form.reportValidity();
   const invalid=Object.values(fields).find(field=>!field.checkValidity());
   (invalid||fields.person).focus();
  }
 });
 // Keep the booking fragment when using the page's section navigation.
 for(const link of document.querySelectorAll('nav a[href^="#"]'))link.addEventListener('click',event=>{
  if(!mailHash)return;
  const id=link.getAttribute('href').slice(1),target=document.getElementById(id);
  if(!target)return;
  event.preventDefault();
  history.replaceState(null,'',mailHash+'&section='+encodeURIComponent(id));
  target.scrollIntoView({block:'start'});
 });
})();
