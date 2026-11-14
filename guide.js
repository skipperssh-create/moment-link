/* Public v1 guidance only. Never fetches bookings or reads customer information. */
(() => {
 'use strict';
 const params=new URLSearchParams(location.search),categories=['all','yacht','visit','trunk','heli'];
 const selected=params.get('t'),category=categories.includes(selected)?selected:'all';
 const picker=document.getElementById('guideCategory');
 if(params.has('v')&&params.get('v')!=='1'){
  document.getElementById('guideContent').hidden=true;
  document.getElementById('guideUnavailable').hidden=false;
  return;
 }
 function show(value){
  for(const el of document.querySelectorAll('[data-for]'))el.hidden=value!=='all'&&!el.dataset.for.split(' ').includes(value);
  for(const el of document.querySelectorAll('[data-video]'))el.hidden=value!=='all'&&params.get('video')!=='1';
  for(const el of document.querySelectorAll('[data-mode]'))el.hidden=value==='trunk'&&category==='trunk'&&el.dataset.mode!==(params.get('mode')==='visit'?'visit':'office');
 }
 picker.value=category;show(category);
 picker.addEventListener('change',()=>show(categories.includes(picker.value)?picker.value:'all'));
})();
