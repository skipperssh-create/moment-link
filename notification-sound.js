/* In-page, prerecorded brand voice. No customer data or runtime speech service. */
(() => {
'use strict';
window.MomentLinkSound=(onChange=()=>{})=>{
 const supported=typeof window.Audio==='function';
 // Reuse the user-activated element for later alerts, including on mobile.
 const player=supported?new window.Audio('/assets/moment-new-consultation.mp3'):null;
 if(player)player.preload='none';
 let enabled=false,playing=false,error='',timer=null,playId=0;
 let priming=false,unlocked=false,awaitingInteraction=false,pendingNotice=false,gestureAttempts=0;
 const state=()=>({supported,enabled,playing,error,awaitingInteraction});
 function stop(){
  playId++;
  clearTimeout(timer);timer=null;
  if(player){player.onplaying=player.onended=player.onerror=null;player.pause();player.muted=false;try{player.currentTime=0;}catch{/* Metadata may not be loaded yet. */}}
  playing=false;priming=false;onChange();
 }
 function fail(message){stop();enabled=false;error=message;onChange();}
 function play(isNotice=false){
  if(!supported||document.hidden||playing)return;
  if(priming){pendingNotice ||= isNotice;return;}
  error='';playing=true;
  const id=++playId;
  const failCurrent=message=>{if(id===playId)fail(message);};
  player.onplaying=()=>{if(id!==playId)return;unlocked=true;awaitingInteraction=false;pendingNotice=false;clearTimeout(timer);timer=setTimeout(()=>failCurrent('음성 재생이 멈췄습니다. 미리 듣기로 다시 확인해 주세요.'),15000);onChange();};
  player.onended=()=>{if(id!==playId)return;playId++;clearTimeout(timer);timer=null;player.onplaying=player.onended=player.onerror=null;playing=false;onChange();};
  player.onerror=()=>failCurrent('알림 음성을 불러오지 못했습니다. 연결을 확인한 뒤 다시 켜 주세요.');
  timer=setTimeout(()=>failCurrent('소리 재생이 지연되었습니다. 미리 듣기로 다시 확인해 주세요.'),8000);
  onChange();
  try{
   player.currentTime=0;
   const attempt=player.play();
   attempt?.catch(err=>{if(id!==playId)return;if(err?.name==='NotAllowedError'||err?.message==='NotAllowedError'){
    stop();awaitingInteraction=true;unlocked=false;pendingNotice=enabled&&isNotice;error='소리 재생이 차단되었습니다. 화면을 한 번 누르면 다시 활성화합니다.';onChange();
   }else failCurrent('소리를 재생하지 못했습니다. 미리 듣기로 다시 확인해 주세요.');});
  }catch{failCurrent('이 브라우저에서 음성을 재생하지 못했습니다.');}
 }
 function toggle(){
  if(!supported)return;
  if(enabled){enabled=false;error='';pendingNotice=false;awaitingInteraction=false;stop();return;}
  stop();enabled=true;gestureAttempts=0;play();
 }
 function start(){if(!supported||enabled)return;enabled=true;error='';gestureAttempts=0;onChange();}
 function interact(event){
  if(!event.isTrusted||event.target?.closest?.('[data-ml=toggleSound],[data-ml=previewSound],[data-ml=logout]')||!enabled||!supported||document.hidden||playing||priming||gestureAttempts>=2)return;
  if(pendingNotice){gestureAttempts++;play(true);return;}
  if(unlocked)return;
  // Warm the same audio element during an actual gesture, without announcing a nonexistent arrival.
  gestureAttempts++;priming=true;player.muted=true;const id=++playId;
  const finish=(ready)=>{if(id!==playId)return;stop();unlocked=ready;awaitingInteraction=!ready;if(ready){error='';if(pendingNotice&&enabled)play(true);}onChange();};
  player.onerror=()=>finish(false);
  timer=setTimeout(()=>finish(false),8000);
  try{const attempt=player.play();if(attempt?.then)attempt.then(()=>finish(true),()=>finish(false));else finish(false);}catch{finish(false);}
 }
 document.addEventListener?.('click',interact);
 document.addEventListener?.('keydown',interact);
 return {state,start,toggle,preview:()=>play(),notify:()=>{if(enabled){if(awaitingInteraction){pendingNotice=true;return;}play(true);}},stop,reset:()=>{enabled=false;error='';unlocked=false;awaitingInteraction=false;pendingNotice=false;gestureAttempts=0;stop();}};
};
})();
