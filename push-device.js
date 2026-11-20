/* Device-scoped push controls. Permission is requested only after a staff click. */
(()=>{
'use strict';
window.MomentLinkPush=(api,onChange=()=>{})=>{
 const initial=()=>({message:'백그라운드 알림 확인 중…',ready:false,busy:false,checking:false});
 let info=initial(),checked=0,revision=0;
 const supported=()=>window.isSecureContext&&'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
 const notify=patch=>{info={...info,...patch};onChange();};
 const bounded=(p,message='알림 연결 확인이 지연됩니다. 잠시 후 다시 연결해 주세요.',ms=10000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(message)),ms);Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
 const registration=()=>bounded(navigator.serviceWorker.ready,'백그라운드 알림 기능을 아직 시작하지 못했습니다. 앱을 닫았다 다시 열고 알림 연결을 눌러 주세요.');
 const request=async(path,method='GET',body)=>{
  const controller=new AbortController();
  try{return await bounded(api(path,method,body,controller.signal),'알림 서버 응답이 늦어 연결을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.');}
  finally{controller.abort();}
 };
 const failure=error=>error?.name==='NotAllowedError'?'휴대폰에서 알림이 차단되어 있습니다. 모먼트링크와 설치에 사용한 브라우저의 알림을 허용한 뒤 다시 연결해 주세요.':error?.message||'알림 연결을 완료하지 못했습니다. 다시 연결해 주세요.';
 const digest=async endpoint=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))),b=>b.toString(16).padStart(2,'0')).join('');
 const subscription=reg=>bounded(reg.pushManager.getSubscription(),'이 기기의 알림 정보를 읽지 못했습니다. 앱을 다시 열고 연결해 주세요.');
 async function current(){const reg=await registration(),sub=await subscription(reg);return {reg,sub,endpointHash:sub?await digest(sub.endpoint):''};}
 async function refresh(force=false){
  if(info.busy||info.checking||!force&&Date.now()-checked<60000)return;checked=Date.now();const version=revision;
  if(!supported()){notify({ready:false,message:'이 브라우저에서는 백그라운드 알림을 지원하지 않습니다. Chrome 또는 설치한 홈 화면 앱에서 확인해 주세요.'});return;}
  // A read-only status check must never disable the permission/connect button.
  notify({checking:true,...(!info.ready?{message:'연결 상태 확인 중… 알림 연결을 눌러 바로 연결할 수 있습니다.'}:{})});
  try{const {sub,endpointHash}=await current();if(version!==revision)return;
   const server=await request('admin/push'+(endpointHash?'?endpointHash='+endpointHash:''));if(version!==revision)return;
   const ready=server.enabled&&server.configured&&server.registered&&!!sub&&Notification.permission==='granted';
   const message=!server.enabled?'서버 새 상담 푸시가 꺼져 있습니다. 문자·알림 설정을 확인해 주세요.':!server.configured?'서버 푸시 연결을 확인해 주세요.':Notification.permission==='denied'?'휴대폰에서 알림이 차단되어 있습니다. 앱·브라우저 설정에서 알림을 허용한 뒤 다시 연결해 주세요.':ready?(server.deliveryProblem?'알림 전송이 2회 실패했습니다. 알림 연결을 다시 눌러 주세요.':server.repeatRunning===false?'푸시 연결됨 · 반복 알림 서버 확인 중':'백그라운드 알림 연결됨 · 새 상담 확인 전까지 2분마다 반복'):'재설치했거나 처음 사용하는 기기는 알림을 다시 연결해야 합니다. 알림 연결을 눌러 허용해 주세요.';
   notify({ready,message});
  }catch(error){if(version===revision)notify({message:failure(error)});}
  finally{if(version===revision)notify({checking:false});}
 }
 async function enable(){
  if(info.busy)return;const version=++revision;
  notify({checking:false});
  try{
   if(!supported())throw Error('Chrome 또는 설치한 홈 화면 앱에서 알림을 연결해 주세요.');
   // Invoke synchronously in the click handler, before any network await.
   const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
   notify({busy:true,message:'휴대폰의 알림 권한을 확인하고 있습니다. 허용 안내가 나오면 허용해 주세요.'});
   if(await bounded(permission,'알림 권한 선택을 기다리다 연결을 멈췄습니다. 허용한 뒤 알림 연결을 다시 눌러 주세요.',60000)!=='granted')throw Error('알림이 차단되어 있습니다. 휴대폰 앱·브라우저 설정에서 허용해 주세요.');
   if(version!==revision)return;
   notify({message:'이 기기의 백그라운드 알림을 연결하고 있습니다…'});
   const server=await request('admin/push');if(version!==revision)return;
   if(!server.enabled||!server.configured)throw Error('문자·알림에서 서버 푸시 사용과 연결 상태를 확인해 주세요.');
   const reg=await registration(),key=Uint8Array.from(atob(server.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   let sub=await subscription(reg);if(version!==revision)return;
   const old=sub?.options?.applicationServerKey;
   if(sub&&old&&Array.from(new Uint8Array(old)).join()!==Array.from(key).join()){await bounded(sub.unsubscribe());sub=null;}
   if(version!==revision)return;
   sub ||= await bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}));
   if(version!==revision)return;
   await request('admin/push','POST',sub.toJSON());if(version!==revision)return;
   notify({ready:true,message:'이 기기 알림을 연결했습니다. 알림 확인을 눌러 수신을 확인해 주세요. 소리는 휴대폰 알림 설정을 따릅니다.'});
  }catch(error){if(version===revision)notify({ready:false,message:failure(error)});throw error;}
  finally{if(version===revision){checked=Date.now();notify({busy:false});}}
 }
 async function test(){
  if(info.busy)return;const version=++revision;notify({busy:true,checking:false,message:'이 기기로 테스트 알림을 요청하고 있습니다…'});
  try{const {endpointHash}=await current();if(version!==revision)return;if(!endpointHash)throw Error('먼저 이 기기 알림을 연결해 주세요.');
   await request('admin/push/test','POST',{endpointHash});if(version===revision)notify({message:'이 기기로 테스트 알림을 요청했습니다. 알림이 보이지 않으면 휴대폰의 알림·방해 금지·배터리 설정을 확인해 주세요.'});
  }catch(error){if(version===revision)notify({message:failure(error)});throw error;}
  finally{if(version===revision){checked=Date.now();notify({busy:false});}}
 }
 async function disable(){
  if(info.busy)return;const version=++revision;notify({busy:true,checking:false,message:'이 기기의 알림 연결을 해제하고 있습니다…'});
  try{const {sub,endpointHash}=await current();if(version!==revision)return;if(endpointHash)await request('admin/push','DELETE',{endpointHash});if(version!==revision)return;await bounded(sub?.unsubscribe());if(version===revision)notify({ready:false,message:'이 기기의 푸시 알림만 해제했습니다.'});}
  catch(error){if(version===revision)notify({message:failure(error)});throw error;}
  finally{if(version===revision){checked=Date.now();notify({busy:false});}}
 }
 return {state:()=>info,refresh,enable,test,disable,reset:()=>{revision++;checked=0;info=initial();}};
};
})();
