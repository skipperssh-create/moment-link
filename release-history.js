(() => {
'use strict';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let api=null,active=false,data=null,loading=false,autoAttempted=false,opener=null;
const key='moment-link-release-seen';
const stamp=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
function seen(){try{return localStorage.getItem(key);}catch{return null;}}
function mark(){if(data)try{localStorage.setItem(key,data.currentId);}catch{}}
function dialog(){
 let d=document.getElementById('releaseDialog');if(d)return d;
 d=document.createElement('dialog');d.id='releaseDialog';d.className='release-dialog';d.setAttribute('aria-labelledby','releaseTitle');
 d.innerHTML='<header><div><h2 id="releaseTitle">업데이트 내역</h2><p class="micro">추가·개선·수정된 내용을 날짜별로 확인하세요.</p></div><button type="button" class="secondary" id="releaseClose" aria-label="업데이트 내역 닫기">닫기</button></header><label class="release-search">변경 내용 검색<input id="releaseSearch" class="admin-input" type="search" placeholder="예: 보딩패스, 정산, 알림"/></label><p id="releaseCount" class="micro" role="status"></p><div id="releaseItems"></div>';
 document.body.appendChild(d);d.querySelector('#releaseClose').onclick=()=>d.close();d.addEventListener('close',()=>{mark();opener?.isConnected&&opener.focus();});d.querySelector('#releaseSearch').addEventListener('input',paint);return d;
}
function paint(){
 const d=dialog(),q=d.querySelector('#releaseSearch').value.trim().toLocaleLowerCase(),rows=(data?.items||[]).filter(r=>[r.title,...r.changes,r.at,r.commit,r.original||''].join(' ').toLocaleLowerCase().includes(q));
 d.querySelector('#releaseCount').textContent='전체 '+(data?.items.length||0)+'건 · 현재 '+rows.length+'건';
 d.querySelector('#releaseItems').innerHTML=rows.map(r=>'<article class="release-item"><div class="release-meta"><time datetime="'+e(r.at)+'">'+e(stamp(r.at))+'</time><span>'+e(r.dateBasis)+(r.redeployed?' · 동일 변경 재배포':'')+(r.id===data.currentId?' · 현재 버전':'')+'</span></div><h3>'+e(r.title)+'</h3><ul>'+r.changes.map(c=>'<li>'+e(c)+'</li>').join('')+'</ul>'+(r.original?'<details class="release-original"><summary>개발 기록 원문</summary><p>'+e(r.original)+'</p></details>':'')+(r.observedAt?'<p class="micro">운영 제공 확인: '+e(stamp(r.observedAt))+'</p>':'')+(r.commit?'<small>버전 '+e(r.version||r.commit.slice(0,8))+'</small>':'')+'</article>').join('')||'<p>검색 결과가 없습니다.</p>';
}
async function open(manual=true){
 if(!active||loading)return;loading=true;
 try{
  if(!data)data=await api('admin/releases');
  if(!active||!manual&&(seen()===data.currentId||document.activeElement?.matches('input,textarea,select')||document.querySelector('dialog[open]')))return;
  opener=document.activeElement;paint();const d=dialog();if(!d.open)d.showModal();d.querySelector('#releaseClose').focus();
 }catch(err){if(manual){const d=dialog();d.querySelector('#releaseItems').textContent='업데이트 내역을 불러오지 못했습니다. '+err.message;if(!d.open)d.showModal();}}finally{loading=false;}
}
document.addEventListener('click',ev=>{if(ev.target.closest('[data-release-open]'))void open(true);});
window.MomentLinkReleases={mount(fn,enabled,auto){api=fn;active=!!enabled;if(!active){document.getElementById('releaseDialog')?.close();data=null;autoAttempted=false;return;}if(auto&&!autoAttempted){autoAttempted=true;void open(false);}},open:()=>open(true)};
})();
