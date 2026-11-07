/* Installation is optional; consultation and admin data are never stored offline. */
(()=>{
  'use strict';
  const standalone=window.matchMedia('(display-mode: standalone)');
  let installPrompt=null,installed=standalone.matches||navigator.standalone===true,dialog,opener;
  const offline=document.createElement('div');
  offline.className='pwa-offline';
  offline.setAttribute('role','status');
  offline.textContent='인터넷 연결이 끊겼습니다. 상담 접수와 관리자 업무는 연결 후 이용해 주세요.';
  document.body.prepend(offline);
  function connection(){offline.hidden=navigator.onLine;}
  connection();
  window.addEventListener('online',connection);
  window.addEventListener('offline',connection);

  function reflectInstalled(){document.body.classList.toggle('pwa-installed',installed);}
  reflectInstalled();
  standalone.addEventListener('change',()=>{installed=standalone.matches||navigator.standalone===true;reflectInstalled();});
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    if(dialog?.open)updateInstallAction();
  });
  window.addEventListener('appinstalled',()=>{
    installed=true;installPrompt=null;reflectInstalled();
    if(dialog?.open)dialog.close();
  });

  function updateInstallAction(){
    const action=dialog.querySelector('[data-pwa-confirm]');
    action.hidden=!installPrompt;action.disabled=false;
  }
  function showInstall(button){
    opener=button;
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.className='pwa-dialog';
      dialog.setAttribute('aria-labelledby','pwa-title');
      dialog.setAttribute('aria-describedby','pwa-description');
      dialog.innerHTML=`<div class="pwa-dialog-head"><img src="/assets/icon-192.png" width="56" height="56" alt=""><button type="button" class="secondary" data-pwa-close autofocus>닫기</button></div><h2 class="title" id="pwa-title">모먼트링크 앱 설치</h2><p class="muted" id="pwa-description">홈 화면의 모먼트 로고를 눌러 앱처럼 바로 열 수 있습니다.</p><div class="pwa-install-guide"></div><p class="micro">설치 후 관리자 로그인 → 문자·알림 → ‘이 기기 푸시 구독’에서 알림을 허용해 주세요.</p><p class="micro">상담 접수와 관리자 업무에는 인터넷 연결이 필요합니다.</p><p class="micro" data-pwa-result role="status"></p><button type="button" class="primary" data-pwa-confirm hidden>앱 설치하기</button>`;
      document.body.append(dialog);
      dialog.querySelector('[data-pwa-close]').addEventListener('click',()=>dialog.close());
      dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});});
      dialog.querySelector('[data-pwa-confirm]').addEventListener('click',async()=>{
        if(!installPrompt)return;
        const prompt=installPrompt;installPrompt=null;
        const action=dialog.querySelector('[data-pwa-confirm]');
        const result=dialog.querySelector('[data-pwa-result]');
        action.disabled=true;
        try{
          await prompt.prompt();
          const choice=await prompt.userChoice;
          result.textContent=choice.outcome==='accepted'?'설치가 끝나면 홈 화면 또는 앱 목록에서 모먼트링크를 열어 주세요.':'나중에 브라우저 메뉴에서도 설치할 수 있습니다.';
        }catch{result.textContent='아래 기기별 안내에 따라 브라우저 메뉴에서 설치해 주세요.';}
        updateInstallAction();
      });
    }
    const ios=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const android=/Android/i.test(navigator.userAgent);
    const guide=ios
      ?'<ol><li>Safari에서 이 페이지를 열어 주세요.</li><li>공유 버튼 → <strong>홈 화면에 추가</strong>를 선택해 주세요.</li><li>‘추가’를 누른 뒤 홈 화면에서 모먼트링크를 열어 주세요.</li></ol>'
      :android
        ?'<ol><li>Chrome에서 이 페이지를 열어 주세요.</li><li>메뉴 → <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택해 주세요.</li><li>설치를 마친 뒤 홈 화면에서 모먼트링크를 열어 주세요.</li></ol>'
        :'<ol><li>Chrome 또는 Edge에서 이 페이지를 열어 주세요.</li><li>주소창의 설치 아이콘 또는 브라우저 메뉴의 <strong>앱 설치</strong>를 선택해 주세요.</li><li>설치를 마친 뒤 앱 목록에서 모먼트링크를 열어 주세요.</li></ol>';
    dialog.querySelector('.pwa-install-guide').innerHTML=guide+'<p class="micro">설치 메뉴가 보이지 않으면 Safari·Chrome·Edge에서 다시 열어 주세요. 이미 설치했다면 홈 화면이나 앱 목록을 확인해 주세요.</p>';
    dialog.querySelector('[data-pwa-result]').textContent='';
    updateInstallAction();
    dialog.showModal();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-pwa-install]');
    if(button&&!installed)showInstall(button);
  });
  if('serviceWorker' in navigator&&window.isSecureContext){
    const wasControlled=!!navigator.serviceWorker.controller;
    let registration,lastUpdate=0;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!wasControlled||document.getElementById('pwaUpdate'))return;
      const update=document.createElement('div');update.id='pwaUpdate';update.className='pwa-update';update.setAttribute('role','status');
      update.innerHTML='<span>새 기능이 준비됐습니다. 작성 중인 내용을 저장한 뒤 적용해 주세요.</span><button type="button">새 화면 적용</button>';
      update.querySelector('button').addEventListener('click',()=>window.location.reload());
      document.body.prepend(update);
    });
    const checkUpdate=()=>{if(!registration||document.visibilityState==='hidden'||!navigator.onLine||Date.now()-lastUpdate<60000)return;lastUpdate=Date.now();registration.update().catch(()=>{});};
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(result=>{registration=result;checkUpdate();}).catch(()=>{});
    document.addEventListener('visibilitychange',checkUpdate);
    window.addEventListener('online',checkUpdate);
  }
})();
