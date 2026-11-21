/* Customer-only departure notice. No reservation, notification or OPS requests. */
(() => {
  let dialog = null, returnFocus = null, previousOverflow = '';
  const markup = `
    <div class="yacht-notice-head">
      <div><p class="yacht-notice-kicker">요트 프로포즈 · 출항지 안내</p><h2 id="yachtNoticeTitle">부산항(영도)에서 만나요</h2></div>
      <button type="button" class="yacht-notice-close" aria-label="출항지 안내 닫기" data-yacht-notice-close>×</button>
    </div>
    <div class="yacht-notice-body">
      <section class="yacht-notice-hero">
        <p class="yacht-notice-lead">평생 기억할 프로포즈,<br>멀미 걱정보다<br class="yacht-notice-mobile-break"> 설렘에 집중하세요.</p>
        <p>부산항대교와 도시의 풍경, 방파제가 감싸는 항내 코스.<br>소중한 고백에 집중할 수 있도록 모먼트링크가 추천하는 요트 프로포즈 장소입니다.</p>
      </section>
      <section class="yacht-notice-move" aria-labelledby="yachtNoticeMove">
        <h3 id="yachtNoticeMove">기존 수영만 출항지는 재개발 중입니다</h3>
        <p>수영만 요트경기장은 재개발에 따라 운영이 중단되었습니다. 모먼트링크의 요트 프로포즈는 <strong>부산항(영도)</strong>에서 안내합니다.</p>
        <p class="yacht-notice-small">기존 출항지의 재개장 시점은 공사 진행과 공식 안내에 따라 달라질 수 있습니다.</p>
      </section>
      <div class="yacht-notice-benefits">
        <section><span class="yacht-notice-number" aria-hidden="true">01</span><h3>부산항대교와 시티뷰</h3><p>바다 위에서 바라보는 부산항대교와 부산항의 도시 풍경을 두 사람의 특별한 순간에 담아보세요.</p></section>
        <section><span class="yacht-notice-number" aria-hidden="true">02</span><h3>크루즈가 더하는 특별한 풍경</h3><p>대형 크루즈가 정박한 날에는 웅장한 크루즈 전망도 함께 즐길 수 있습니다.</p><p class="yacht-notice-small">크루즈 입항·정박 일정과 운항 코스에 따라 관람 여부가 달라집니다.</p></section>
        <section><span class="yacht-notice-number" aria-hidden="true">03</span><h3>방파제가 감싸는 항내 코스</h3><p>부산항 입구의 두 방파제, <strong>조도·오륙도 방파제</strong>가 외해의 파도를 줄여줍니다. 비교적 잔잔한 항내에서 풍경과 고백에 집중하는 프로포즈를 추천합니다.</p></section>
      </div>
      <p class="yacht-notice-weather">흔들림과 멀미는 당일 바람·파도·주변 선박과 개인에 따라 달라집니다. 운항 여부와 코스는 현장 상황을 확인해 안내합니다.</p>
      <p class="yacht-notice-small">항해 중 전망은 출항형 기준입니다. 정박형은 출항 없이 정박한 요트에서 진행합니다.</p>
      <details class="yacht-notice-sources"><summary>출항지 변경 관련 안내 확인</summary><div>
        <a href="https://www.visitbusan.net/board/view.do?boardId=BBS_0000001&amp;dataSid=6312&amp;menuCd=DOM_000000204001000000&amp;paging=ok&amp;startPage=2" target="_blank" rel="noopener noreferrer">부산시 공식 관광포털 안내 ↗</a>
        <a href="https://n.news.naver.com/article/001/0016411420?sid=102" target="_blank" rel="noopener noreferrer">관련 기사 보기 · 연합뉴스 ↗</a>
      </div></details>
    </div>
    <div class="yacht-notice-foot"><button type="button" class="primary" data-yacht-notice-close>확인했어요 · 요트 상품 보기</button></div>`;
  function finish() {
    document.body.style.overflow = previousOverflow;
    const focus = returnFocus?.isConnected ? returnFocus : document.querySelector('[data-action="yachtNotice"]');
    dialog?.remove(); dialog = null; returnFocus = null;
    focus?.focus({preventScroll:true});
  }
  function close() { if (dialog?.open) dialog.close(); }
  function open(trigger) {
    if (location.hash.startsWith('#admin') || dialog?.open) return;
    returnFocus = trigger || document.querySelector('[data-action="yachtNotice"]') || document.activeElement;
    dialog = document.createElement('dialog');
    dialog.className = 'yacht-notice';
    dialog.setAttribute('aria-labelledby', 'yachtNoticeTitle');
    dialog.innerHTML = markup;
    dialog.addEventListener('close', finish, {once:true});
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-yacht-notice-close]')) close();
    });
    document.body.append(dialog);
    previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('.yacht-notice-close').focus({preventScroll:true});
  }
  window.addEventListener('hashchange', close);
  window.addEventListener('popstate', close);
  window.MomentLinkYachtNotice = {open, close};
})();
