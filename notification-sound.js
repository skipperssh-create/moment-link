/* In-page voice only. No customer details, storage, paid service, or background push override. */
(() => {
'use strict';
window.MomentLinkSound=(onChange=()=>{})=>{
 const synth=window.speechSynthesis;
 const supported=!!synth&&typeof window.SpeechSynthesisUtterance==='function';
 let enabled=false,playing=false,error='',current=null,timer=null;
 const state=()=>({supported,enabled,playing,error});
 function stop(){
  clearTimeout(timer);timer=null;
  if(current){current.onstart=current.onend=current.onerror=null;current=null;synth.cancel();}
  playing=false;onChange();
 }
 function fail(message){stop();enabled=false;error=message;onChange();}
 function play(){
  if(!supported||document.hidden||playing)return;
  error='';playing=true;
  const utterance=new window.SpeechSynthesisUtterance('모먼트링크, 새로운 상담이 접수되었습니다.');
  utterance.lang='ko-KR';utterance.rate=1;utterance.pitch=1.05;utterance.volume=1;
  let voices=[];
  try{voices=synth.getVoices();}catch{/* Let the device choose its default Korean voice. */}
  utterance.voice=voices.find(v=>/^ko(?:-|_)/i.test(v.lang)&&v.localService)||voices.find(v=>/^ko(?:-|_)/i.test(v.lang))||null;
  current=utterance;
  utterance.onstart=()=>{if(current!==utterance)return;clearTimeout(timer);timer=setTimeout(()=>fail('음성 재생이 멈췄습니다. 미리 듣기로 다시 확인해 주세요.'),15000);};
  utterance.onend=()=>{if(current!==utterance)return;clearTimeout(timer);timer=null;current=null;playing=false;onChange();};
  utterance.onerror=()=>{if(current===utterance)fail('음성을 재생하지 못했습니다. 기기 음성·볼륨 설정을 확인한 뒤 다시 켜 주세요.');};
  timer=setTimeout(()=>fail('소리 재생이 차단되었습니다. 음성 알림 켜기를 다시 눌러 주세요.'),8000);
  onChange();
  try{synth.speak(utterance);}catch{fail('이 브라우저에서 음성을 재생하지 못했습니다.');}
 }
 function toggle(){
  if(!supported)return;
  if(enabled){enabled=false;error='';stop();return;}
  stop();enabled=true;play();
 }
 return {state,toggle,preview:play,notify:()=>{if(enabled)play();},stop,reset:()=>{enabled=false;error='';stop();}};
};
})();
