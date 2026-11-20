/* Device-scoped push controls. Permission is requested only after a staff click. */
(()=>{
'use strict';
window.MomentLinkPush=(api,onChange=()=>{})=>{
 const initial=()=>({message:'백그라운드 알림 확인 중…',ready:false,busy:false,checking:false,canRepair:false,diagnosing:false,diagnostic:''});
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


 let diagnosisRevision=0;
 const permissionLabel=value=>({granted:'허용',denied:'차단',prompt:'미결정',default:'미결정'})[value]||'확인 불가';
 const browserLabel=()=>{
  const ua=navigator.userAgent||'';
  for(const [pattern,label] of [[/SamsungBrowser\/([\d.]+)/,'삼성 인터넷'],[/EdgA?\/([\d.]+)/,'Edge'],[/Firefox\/([\d.]+)/,'Firefox'],[/Chrome\/([\d.]+)/,'Chrome'],[/Version\/([\d.]+).*Safari/,'Safari']]){
   const match=ua.match(pattern);if(match)return label+' '+match[1];
  }return '브라우저 식별 불가';
 };
 async function diagnose(){
  if(info.diagnosing)return;
  const version=++diagnosisRevision,rows=new Map();
  const put=(label,value)=>{rows.set(label,value);if(version===diagnosisRevision)notify({diagnostic:[...rows].map(([k,v])=>k+': '+v).join('\n')});};
  const probe=async(label,read,format=value=>String(value))=>{
   try{const value=await bounded(Promise.resolve().then(read),'DIAGNOSTIC_TIMEOUT',2000);put(label,format(value));return value;}
   catch(error){put(label,error?.message==='DIAGNOSTIC_TIMEOUT'?'응답 없음 (2초)':error?.name==='NotAllowedError'?'차단됨':error?.name==='TypeError'?'조회 미지원':'확인 불가');return null;}
  };
  notify({diagnosing:true,diagnostic:''});
  put('진단 버전','D01');
  put('실행 브라우저',browserLabel());
  put('실행 방식',window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true?'홈 화면 앱':'브라우저 탭');
  put('보안 연결',window.isSecureContext?'정상':'보안 연결 필요');
  put('알림 권한','Notification'in window?permissionLabel(Notification.permission):'미지원');
  put('권한 조회','확인 중');
  put('백그라운드 기능','확인 중');
  put('푸시 권한','확인 중');
  put('기기 구독','확인 중');
  put('알림 서버','확인 중');
  try{
   await Promise.all([
    navigator.permissions?.query?probe('권한 조회',()=>navigator.permissions.query({name:'notifications'}),s=>permissionLabel(s.state)):Promise.resolve(put('권한 조회','조회 미지원')),
    (async()=>{
     if(!navigator.serviceWorker){put('백그라운드 기능','미지원');put('푸시 권한','확인 불가');put('기기 구독','확인 불가');return;}
     const reg=await probe('백그라운드 기능',()=>navigator.serviceWorker.ready,r=>r.active?.state==='activated'?'준비됨':r.active?.state||'등록 응답 있음');
     if(!reg?.pushManager){put('푸시 권한','확인 불가');put('기기 구독','확인 불가');return;}
     await Promise.all([
      reg.pushManager.permissionState?probe('푸시 권한',()=>reg.pushManager.permissionState({userVisibleOnly:true,...(reconnect?.key?{applicationServerKey:reconnect.key}:{})}),permissionLabel):Promise.resolve(put('푸시 권한','조회 미지원')),
      probe('기기 구독',()=>reg.pushManager.getSubscription(),s=>s?'있음':'없음')
     ]);
    })(),
    (async()=>{
     const controller=new AbortController();
     try{await probe('알림 서버',()=>api('admin/push','GET',undefined,controller.signal),s=>!s.enabled?'사용 꺼짐':!s.configured?'설정 필요':'사용 가능');}
     finally{controller.abort();}
    })()
   ]);
  }finally{if(version===diagnosisRevision)notify({diagnosing:false});}
 }

 let reconnect=null;
 const remember=(reg,server)=>{if(server.enabled&&server.configured&&server.vapidPublicKey)reconnect={reg,key:Uint8Array.from(atob(server.vapidPublicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))};};
 async function prepareReconnect(version){
  const [reg,server]=await Promise.all([registration(),request('admin/push')]);
  if(version!==revision)return null;
  if(!server.enabled||!server.configured)throw Error('문자·알림에서 서버 푸시 사용과 연결 상태를 확인해 주세요.');
  remember(reg,server);return reconnect;
 }
 function waitForPermission(prompt,version){
  return new Promise((resolve,reject)=>{
   let done=false,poll,timer,permissionStatus,pushChecked=false;
   const onChange=()=>read(permissionStatus?.state);
   const finish=(value,error)=>{if(done)return;done=true;clearTimeout(poll);clearTimeout(timer);permissionStatus?.removeEventListener?.('change',onChange);error?reject(error):resolve(value);};
   const read=value=>{if(done)return;if(version!==revision){finish('cancelled');return;}if(value==='granted'||value==='denied')finish(value);};
   const check=()=>{if(done)return;read(Notification.permission);readPush();if(!done)poll=setTimeout(check,250);};
   timer=setTimeout(()=>{const error=Error('휴대폰의 알림 권한 응답을 받지 못했습니다. 알림 진단에서 기기 상태를 확인해 주세요. [알림 P01]');error.code='PUSH_PERMISSION_PENDING';finish(null,error);},10000);
   Promise.resolve(prompt).then(value=>{if(value==='default')finish(value);else read(value);},error=>finish(null,error));
   check();
   try{Promise.resolve(navigator.permissions?.query({name:'notifications'})).then(status=>{
    if(done||!status)return;permissionStatus=status;status.addEventListener?.('change',onChange);onChange();
   }).catch(()=>{});}catch{}
   // These browser APIs only report permission; the eventual subscribe still enforces it.
   function readPush(){if(done||pushChecked||!reconnect?.reg.pushManager.permissionState)return;pushChecked=true;try{Promise.resolve(reconnect.reg.pushManager.permissionState({userVisibleOnly:true,applicationServerKey:reconnect.key})).then(read,()=>{});}catch{}}
  });
 }
 async function repair(){
  if(info.busy)return;const version=++revision;notify({checking:false});
  try{
   if(!supported())throw Error('삼성 인터넷·Chrome 또는 설치한 홈 화면 앱에서 알림을 연결해 주세요.');
   if(!reconnect){
    notify({busy:true,message:'이 기기의 알림 연결을 준비하고 있습니다…'});
    await prepareReconnect(version);if(version!==revision)return;
    notify({canRepair:true,message:'연결 준비가 끝났습니다. 권한 재연결을 한 번 더 눌러 주세요.'});return;
   }
   // Alternative browser-native permission path: subscribe in this exact click stack.
   // Never pretend a pending/denied permission is granted, or alter other devices.
   const pending=reconnect.reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:reconnect.key});
   notify({busy:true,message:'이 기기의 알림 권한과 구독을 다시 연결하고 있습니다…'});
   const sub=await bounded(pending,'기기 알림 구독 응답이 없습니다. 설치에 사용한 브라우저와 앱의 연결 상태를 확인해야 합니다. [알림 P02]');
   if(version!==revision)return;
   await request('admin/push','POST',sub.toJSON());if(version!==revision)return;
   notify({ready:true,canRepair:false,message:'이 기기 알림을 다시 연결했습니다. 알림 확인을 눌러 수신을 확인해 주세요.'});
  }catch(error){if(version===revision)notify({ready:false,canRepair:true,message:failure(error)});throw error;}
  finally{if(version===revision){checked=Date.now();notify({busy:false});}}
 }

 async function readPermission(reg){
  if(Notification.permission!=='default')return Notification.permission;
  const checks=[];
  try{if(navigator.permissions?.query)checks.push(Promise.resolve(navigator.permissions.query({name:'notifications'})).then(s=>s.state));}catch{}
  try{if(reg.pushManager.permissionState)checks.push(reg.pushManager.permissionState({userVisibleOnly:true,...(reconnect?.key?{applicationServerKey:reconnect.key}:{})}));}catch{}
  const values=await Promise.all(checks.map(p=>bounded(p,'',1000).catch(()=>null)));
  return values.includes('denied')?'denied':values.includes('granted')?'granted':'default';
 }

 async function refresh(force=false){
  if(info.busy||info.checking||!force&&Date.now()-checked<60000)return;checked=Date.now();const version=revision;
  if(!supported()){notify({ready:false,message:'이 브라우저에서는 백그라운드 알림을 지원하지 않습니다. 삼성 인터넷·Chrome 또는 설치한 홈 화면 앱에서 확인해 주세요.'});return;}
  // A read-only status check must never disable the permission/connect button.
  notify({checking:true,...(!info.ready?{message:'연결 상태 확인 중… 알림 연결을 눌러 바로 연결할 수 있습니다.'}:{})});
  try{const {reg,sub,endpointHash}=await current();if(version!==revision)return;
   const server=await request('admin/push'+(endpointHash?'?endpointHash='+endpointHash:''));if(version!==revision)return;
   remember(reg,server);const permission=await readPermission(reg);if(version!==revision)return;
   const ready=server.enabled&&server.configured&&server.registered&&!!sub&&permission==='granted';
   const message=!server.enabled?'서버 새 상담 푸시가 꺼져 있습니다. 문자·알림 설정을 확인해 주세요.':!server.configured?'서버 푸시 연결을 확인해 주세요.':permission==='denied'?'휴대폰에서 알림이 차단되어 있습니다. 앱·브라우저 설정에서 알림을 허용한 뒤 다시 연결해 주세요.':ready?(server.deliveryProblem?'알림 전송이 2회 실패했습니다. 알림 연결을 다시 눌러 주세요.':server.repeatRunning===false?'푸시 연결됨 · 반복 알림 서버 확인 중':'백그라운드 알림 연결됨 · 새 상담 확인 전까지 2분마다 반복'):'재설치했거나 처음 사용하는 기기는 알림을 다시 연결해야 합니다. 알림 연결을 눌러 허용해 주세요.';
   notify({ready,message});
  }catch(error){if(version===revision)notify({message:failure(error)});}
  finally{if(version===revision)notify({checking:false});}
 }
 async function enable(){
  if(info.busy)return;const version=++revision;
  notify({checking:false});
  try{
   if(!supported())throw Error('삼성 인터넷·Chrome 또는 설치한 홈 화면 앱에서 알림을 연결해 주세요.');
   if(Notification.permission==='denied')throw Error('알림이 차단되어 있습니다. 휴대폰 앱·브라우저 설정에서 허용해 주세요.');
   // Invoke synchronously in the click handler, before any network await.
   const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
   notify({busy:true,message:'휴대폰의 알림 권한을 확인하고 있습니다. 허용 안내가 나오면 허용해 주세요.'});
   const prepared=prepareReconnect(version).then(value=>({value}),error=>({error}));
   if(await waitForPermission(permission,version)!=='granted'&&version===revision)throw Error('알림이 차단되어 있습니다. 휴대폰 앱·브라우저 설정에서 허용해 주세요.');
   if(version!==revision)return;
   notify({message:'이 기기의 백그라운드 알림을 연결하고 있습니다…'});
   const setup=await prepared;if(version!==revision)return;if(setup.error)throw setup.error;
   const {reg,key}=setup.value;
   let sub=await subscription(reg);if(version!==revision)return;
   const old=sub?.options?.applicationServerKey;
   if(sub&&old&&Array.from(new Uint8Array(old)).join()!==Array.from(key).join()){await bounded(sub.unsubscribe());sub=null;}
   if(version!==revision)return;
   sub ||= await bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key}));
   if(version!==revision)return;
   await request('admin/push','POST',sub.toJSON());if(version!==revision)return;
   notify({ready:true,canRepair:false,message:'이 기기 알림을 연결했습니다. 알림 확인을 눌러 수신을 확인해 주세요. 소리는 휴대폰 알림 설정을 따릅니다.'});
  }catch(error){if(version===revision)notify({ready:false,canRepair:error.code==='PUSH_PERMISSION_PENDING',message:failure(error)});throw error;}
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
 return {state:()=>info,refresh,enable,repair,test,disable,diagnose,reset:()=>{revision++;diagnosisRevision++;checked=0;reconnect=null;info=initial();}};
};
})();
