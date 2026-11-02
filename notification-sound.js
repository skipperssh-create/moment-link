/* In-page, prerecorded brand voice. No customer data or runtime speech service. */
(() => {
'use strict';
window.MomentLinkSound=(onChange=()=>{})=>{
 const supported=typeof window.Audio==='function';
 // Reuse the user-activated element for later alerts, including on mobile.
 const player=supported?new window.Audio('/assets/moment-new-consultation.mp3'):null;
 if(player)player.preload='none';
 let enabled=false,playing=false,error='',timer=null,playId=0;
 const state=()=>({supported,enabled,playing,error});
 function stop(){
  playId++;
  clearTimeout(timer);timer=null;
  if(player){player.onplaying=player.onended=player.onerror=null;player.pause();try{player.currentTime=0;}catch{/* Metadata may not be loaded yet. */}}
  playing=false;onChange();
 }
 function fail(message){stop();enabled=false;error=message;onChange();}
 function play(){
  if(!supported||document.hidden||playing)return;
  error='';playing=true;
  const id=++playId;
  const failCurrent=message=>{if(id===playId)fail(message);};
  player.onplaying=()=>{if(id!==playId)return;clearTimeout(timer);timer=setTimeout(()=>failCurrent('음성 재생이 멈췄습니다. 미리 듣기로 다시 확인해 주세요.'),15000);};
  player.onended=()=>{if(id!==playId)return;playId++;clearTimeout(timer);timer=null;player.onplaying=player.onended=player.onerror=null;playing=false;onChange();};
  player.onerror=()=>failCurrent('알림 음성을 불러오지 못했습니다. 연결을 확인한 뒤 다시 켜 주세요.');
  timer=setTimeout(()=>failCurrent('소리 재생이 지연되었습니다. 미리 듣기로 다시 확인해 주세요.'),8000);
  onChange();
  try{
   player.currentTime=0;
   const attempt=player.play();
   attempt?.catch(()=>failCurrent('소리 재생이 차단되었습니다. 음성 알림 켜기를 다시 눌러 주세요.'));
  }catch{failCurrent('이 브라우저에서 음성을 재생하지 못했습니다.');}
 }
 function toggle(){
  if(!supported)return;
  if(enabled){enabled=false;error='';stop();return;}
  stop();enabled=true;play();
 }
 return {state,toggle,preview:play,notify:()=>{if(enabled)play();},stop,reset:()=>{enabled=false;error='';stop();}};
};
})();
