/* Device-scoped push controls. Permission is requested only after a staff click. */
(()=>{
'use strict';
window.MomentLinkPush=(api,onChange=()=>{})=>{
 let info={message:'백그라운드 알림 확인 중…',ready:false,busy:false},checked=0,revision=0;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
 const notify=patch=>{info={...info,...patch};onChange();};
 const bounded=p=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('알림 연결 확인이 지연됩니다. 잠시 후 다시 연결해 주세요.')),10000);Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
 const registration=()=>bounded(navigator.serviceWorker.ready);
 const digest=async endpoint=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),b=>b.toString(16).padStart(2,'0')).join('');
 async function current(){const reg=await registration(),sub=await reg.pushManager.getSubscription();return {reg,sub,endpointHash:sub?await digest(sub.endpoint):''};}
 async function refresh(force=false){
  if(info.busy||!force&&Date.now()-checked<60000)return;checked=Date.now();const version=revision;
  if(!supported()){notify({ready:false,message:'이 브라우저에서는 백그라운드 알림을 지원하지 않습니다. Chrome 또는 설치한 홈 화면 앱에서 확인해 주세요.'});return;}
  notify({busy:true});
  try{const {sub,endpointHash}=await current(),server=await api('admin/push'+(endpointHash?'?endpointHash='+endpointHash:''));if(version!==revision)return;
   const ready=server.enabled&&server.configured&&server.registered&&!!sub&&Notification.permission==='granted';
   const message=!server.enabled?'서버 새 상담 푸시가 꺼져 있습니다. 문자·알림 설정을 확인해 주세요.':!server.configured?'서버 푸시 연결을 확인해 주세요.':Notification.permission==='denied'?'휴대폰에서 알림이 차단되어 있습니다. 앱·브라우저 설정에서 알림을 허용한 뒤 다시 연결해 주세요.':ready?(server.deliveryProblem?'알림 전송이 2회 실패했습니다. 알림 연결을 다시 눌러 주세요.':server.repeatRunning===false?'푸시 연결됨 · 반복 알림 서버 확인 중':'백그라운드 알림 연결됨 · 새 상담 확인 전까지 2분마다 반복'):'이 기기 알림 연결이 필요합니다. 알림 연결을 눌러 허용해 주세요.';
   notify({ready,message});
  }catch{if(version===revision)notify({ready:false,message:'알림 연결 상태를 확인하지 못했습니다. 다시 연결해 주세요.'});}
  finally{if(version===revision)notify({busy:false});}
 }
 async function enable(){
  if(info.busy)return;if(!supported())throw Error('Chrome 또는 설치한 홈 화면 앱에서 알림을 연결해 주세요.');
  // Must run before any network await to preserve the user's permission gesture.
  const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
  notify({busy:true});
  try{if(await permission!=='granted')throw Error('알림이 차단되어 있습니다. 휴대폰 앱·브라우저 설정에서 허용해 주세요.');
   const server=await api('admin/push');if(!server.enabled||!server.configured)throw Error('문자·알림에서 서버 푸시 사용과 연결 상태를 확인해 주세요.');
   const reg=await registration(),key=Uint8Array.from(atob(server.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   let sub=await reg.pushManager.getSubscription();
   const old=sub?.options?.applicationServerKey;
   if(sub&&old&&Array.from(new Uint8Array(old)).join()!==Array.from(key).join()){await sub.unsubscribe();sub=null;}
   sub ||= await bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}));
   await api('admin/push','POST',sub.toJSON());notify({ready:true,message:'이 기기 알림을 연결했습니다. 앱을 뒤로 보낸 후 테스트 알림 수신을 확인해 주세요.'});
  }finally{notify({busy:false});checked=0;}
 }
 async function test(){
  if(info.busy)return;notify({busy:true});
  try{const {endpointHash}=await current();if(!endpointHash)throw Error('먼저 이 기기 알림을 연결해 주세요.');await api('admin/push/test','POST',{endpointHash});notify({message:'이 기기로 테스트 알림을 요청했습니다. 알림이 보이지 않으면 휴대폰의 알림·방해 금지·배터리 설정을 확인해 주세요.'});}
  finally{notify({busy:false});}
 }
 async function disable(){
  const {sub,endpointHash}=await current();if(endpointHash)await api('admin/push','DELETE',{endpointHash});await sub?.unsubscribe();notify({ready:false,message:'이 기기의 푸시 알림만 해제했습니다.'});checked=Date.now();
 }
 return {state:()=>info,refresh,enable,test,disable,reset:()=>{revision++;checked=0;info={message:'백그라운드 알림 확인 중…',ready:false,busy:false};}};
};
})();
