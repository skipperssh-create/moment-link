import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../pricing.js';
import '../booking-addons.js';
import '../messages.js';
import {attachBoardingMessage} from '../server/boarding-pass.mjs';
const M=globalThis.MomentLinkMessages;
import {GUIDE_VARIANTS,customerGuidePages} from '../scripts/customer-guides.mjs';
const html=await readFile(new URL('../templates/customer-guide-v1.html',import.meta.url),'utf8');
const pages=await customerGuidePages();
const entry=await readFile(new URL('../guide.html',import.meta.url),'utf8');
const script=await readFile(new URL('../guide.js',import.meta.url),'utf8');
const b={date:'2099-11-21',time:'20:00',amount:540000,receivedAmount:90000,place:'부산광역시 합성 주소',extra:''};
const row=(category='yacht',video=true)=>({person:'합성 고객',phone:'01000000000',category,status:'consulting',snapshot:{product:{name:'합성 상품'},package:{name:'올인원',features:video?['영상편지']:[]},options:[]}});

test('optional dining notice appears only in yacht guidance and survives preparation without duplication',()=>{
 for(const category of ['yacht','visit','trunk','heli'])for(const stage of ['receipt','confirmed','reminder','thanks']){
  const r=row(category),before=JSON.stringify({r,b});
  const body=M.generate(r,stage,b,'2099-11-01T03:00:00Z');
  const prepared=M.prepareDrafts(r,{[stage]:body},'2099-11-01T03:00:00Z',b)[stage];
  if(category==='yacht'&&stage!=='thanks'){
   assert.match(body,/식사 중 스크래치 복권 당첨은 이벤트 스토리/);
   assert.match(body,/직접 예약·결제/);assert.match(body,/요트 이벤트 예약자/);
   assert.equal(prepared.split('식사(선택·별도 비용)').length-1,1);
  }else assert.doesNotMatch(body,/식사\(선택|스크래치|식당/);
  assert.equal(JSON.stringify({r,b}),before);
 }
});
test('restaurant contacts and separate payment terms are present only in yacht guide variants',()=>{
 for(const variant of GUIDE_VARIANTS){
  const page=pages[variant.file];
  if(variant.category==='yacht'){
   for(const phone of ['0517495320','0517495000','0519901320','0519901310'])assert.ok(page.includes('tel:'+phone));
   assert.match(page,/실제 식사나 식사비는 요트 이벤트 예약에 포함되지 않습니다/);
   assert.match(page,/고객님이 식당에 직접 예약하고, 식사비도 직접 결제/);
   assert.match(page,/요트 이벤트 예약자/);
  }else assert.doesNotMatch(page,/yacht-dining|0517495320|스크래치/);
 }
});

test('short messages preserve schedule, payment, address and phone while linking details without personal URL data',()=>{
 for(const category of ['yacht','visit','trunk','heli'])for(const stage of ['receipt','confirmed','reminder'])for(const useDeposit of [false,true]){
  const r=row(category),body=M.generate(r,stage,{...b,useDeposit,requestedDepositAmount:useDeposit?90000:null},'2099-11-01T03:00:00Z');
  for(const value of ['2099-11-21 20:00','540,000원','90,000원','450,000원',b.place,'010-0000-0000'])assert.ok(body.includes(value),value);
  assert.doesNotMatch(body,/45~31일|A4 용지|사진 순서|정문 진입|기상·해상/);
  assert.ok(body.length<700,`${category}/${stage}: ${body.length}`);
  if(stage==='receipt')assert.equal(body.includes('예약금만 입금'),useDeposit);
  const url=new URL(body.match(/https:\/\/link\.teamboatn\.com\/guide\/\S+/)[0]);
  assert.equal(url.origin,'https://link.teamboatn.com');assert.equal(url.search,'');
  assert.equal(url.pathname,'/guide/'+category+'-video-v1.html');assert.ok(pages[url.pathname.slice(1)]);
  assert.equal(decodeURIComponent(M.smsURI(r.phone,body,'Android').split('body=')[1]),body);
 }
 assert.equal(new URL(M.guideURL({...row('unknown'),person:'<script>'})).pathname,'/guide.html');
});

test('existing generated paragraphs migrate without discarding custom notes, edited terms, quotes or boarding links',()=>{
 const r=row(),refund='취소·환불 안내 (이벤트 예정일 기준)\n45~31일 전: 90% 환불\n30~16일 전: 80% 환불\n15~11일 전: 70% 환불\n10~7일 전: 60% 환불\n6~2일 전: 50% 환불\n1일 전·당일: 환불 불가\n날짜 변경은 1회 가능합니다.';
 const video='⭐️⭐️고객님 준비사항 ⭐️⭐️\n1. 영상편지용 사진과 편지\n파일명 & 메일 제목: 날짜(26-00-00)_장소_성함\n사진: 25~30장\n사진 순서: 1.jpg, 2.jpg… (번호가 없으면 순서는 랜덤입니다)\n편지: A4 용지 1/3 분량 (약 300자가 가장 적당합니다)\n보내실 곳: boatn@naver.com\n기한: 7일 전까지 (오타에 한해 수정 가능합니다)\n제출 기한: 2099-11-14 (이벤트 7일 전까지)';
 const info={id:'synthetic-id',url:'https://boarding.boatn.co.kr/boarding/synthetic-token',context:'a'.repeat(64)};
 const saved=attachBoardingMessage(['상품: 직접 정한 상품\n금액: 540,000원',refund+'\n특약 문구 유지',video+'\n제작자 메모 유지','승선 장소와 주차 안내는 확정된 주소를 확인해 주세요.','고객이 직접 정한 일정 유지'].join('\n\n'),info);
 const before=structuredClone(saved),drafts={confirmed:saved.body};
 const result=M.prepareDrafts(r,drafts,undefined,b);
 assert.deepEqual(saved,before);assert.equal(drafts.confirmed,saved.body);
 for(const text of ['540,000원','직접 정한 상품','특약 문구 유지','제작자 메모 유지','고객이 직접 정한 일정 유지',saved.invitation.block])assert.ok(result.confirmed.includes(text),text);
 assert.doesNotMatch(result.confirmed,/45~31일|25~30장|boatn@naver/);
 assert.equal(result.confirmed.match(/\/guide\//g).length,1);assert.deepEqual(M.prepareDrafts(r,result,undefined,b),result);
 const rebuilt=attachBoardingMessage(result.confirmed,info,saved.invitation);
 assert.equal(rebuilt.body.match(/boarding\/synthetic-token/g).length,1);
 assert.notEqual(rebuilt.invitation.digest,saved.invitation.digest);
 const custom={receipt:refund.replace('90%','별도 합의')+'\n\n개별 협의 내용'};
 assert.match(M.prepareDrafts(row('visit'),custom,undefined,b).receipt,/별도 합의/);
});

test('v1 template retains supplied refund, directions, pickup and video policies, including the corrected email',()=>{
 for(const text of ['45~31일 전','90%','30~16일 전','80%','15~11일 전','70%','10~7일 전','60%','6~2일 전','50%','1일 전·당일','환불 불가','날짜 변경은 1회','정문 진입 → 해안도로 → 요트면허시험장 앞 주차장','세팅 완료 후 2시간','오전 11시 이전','1시간당 30,000원','25~30장','1.jpg, 2.jpg…','A4 용지 1/3 분량','약 300자','날짜(26-00-00)_장소_성함','이벤트 7일 전까지','이벤트까지 7일 이내','자료 전달 일정 및 제작 가능 여부','수정은 오타에 한해','mailto:seolvidmoa@gmail.com'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/boatn@naver|01000000000|합성 고객|synthetic-token/);
 assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|innerHTML|document\.write/);
 assert.match(html,/name="viewport"/);assert.match(html,/noindex, nofollow/);
});

test('each published page contains only its booking category and selected preparation, even without JavaScript',()=>{
 const labels={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
 assert.equal(Object.keys(pages).length,18);
 for(const v of GUIDE_VARIANTS){
  const body=pages[v.file],r=row(v.category,v.video);
  if(v.docked)r.snapshot.product.id='docked';
  if(v.photos)r.snapshot.options.push({id:'paper-frame-photos',name:'종이액자 사진 출력 4개'});
  if(v.category==='trunk'&&v.mode==='visit')r.snapshot.package.name='부산 출장';
  if(v.region==='busan')r.place='부산광역시 합성 주소';
  assert.equal(new URL(M.guideURL(r)).pathname,'/'+v.file.replace('-busan',''));
  assert.match(body,new RegExp('<h1>'+labels[v.category]));
  assert.doesNotMatch(body,/<select|<script|guideCategory|전체 안내|data-for|data-mode|data-video|data-sailing|data-docked|data-region|data-photos|\{\{/);
  for(const category of Object.keys(labels))assert.equal(body.includes('id="'+category+'"'),category===v.category);
  for(const [category,label] of Object.entries(labels))if(category!==v.category)assert.ok(!body.includes(label),v.file+' has '+label);
  assert.equal(body.includes('id="refund"'),['yacht','visit'].includes(v.category));
  assert.equal(body.includes('id="video"'),v.video);assert.equal(body.includes('seolvidmoa@gmail.com'),v.video||v.photos);
  assert.equal(body.includes('id="paper-frame-photos"'),v.photos);
  assert.equal(body.includes('id="visit-pickup"'),v.category==='visit');
  if(v.category==='yacht'){
   assert.equal(body.includes('출항 없이 정박된 요트'),v.docked);
   for(const text of ['기상·운항 안내','승선신고·보딩패스','한국해양대학교에서 출항하는 경우'])assert.equal(body.includes(text),!v.docked);
  }
  if(v.category==='trunk'){
   assert.equal(body.includes('해운대 사무실'),v.mode==='office');
   assert.equal(body.includes('부산 출장'),v.mode==='visit');
  }
  for(const match of body.matchAll(/href="#([^"]+)"/g))assert.ok(body.includes('id="'+match[1]+'"'),v.file+' broken section link');
 }
 assert.doesNotMatch(entry,/<select|id="refund"|id="yacht"|id="visit"|id="trunk"|id="heli"|id="video"/);
});

function redirect(query){
 const destinations=[];
 vm.runInNewContext(script,{URLSearchParams,location:{search:query,replace:path=>destinations.push(path)}});
 return destinations;
}
test('previously sent v1 links open exactly the matching static page without a whole-catalog fallback',()=>{
 for(const v of GUIDE_VARIANTS.filter(v=>!v.docked&&!v.region)){
  const query='?v=1&t='+v.category+(v.video?'&video=1':'')+(v.mode==='visit'?'&mode=visit':'')+(v.photos?'&photos=1':'');
  assert.deepEqual(redirect(query),['/'+v.file]);
 }
 for(const query of ['', '?v=1', '?t=all', '?t=unknown', '?t=%3Cscript%3E', '?v=2&t=yacht', '?v=1&t=yacht&t=visit', '?t=yacht&video=1&video=0'])assert.deepEqual(redirect(query),[]);
 assert.deepEqual(redirect('?t=visit&phone=01000000000&person=PRIVATE'),['/guide/visit-v1.html']);
});

test('saved generated guide links upgrade to the booking selection without changing notes or unrelated versions',()=>{
 for(const category of ['yacht','visit','trunk','heli']){
  const r=row(category,false),original={confirmed:'고객별 메모 유지\nhttps://link.teamboatn.com/guide.html?v=1&t=all\n별도 안내 유지'};
  const updated=M.prepareDrafts(r,original,undefined,b);
  assert.equal(updated.confirmed,'고객별 메모 유지\n'+M.guideURL(r,b)+'\n별도 안내 유지');
  assert.deepEqual(M.prepareDrafts(r,updated,undefined,b),updated);assert.match(original.confirmed,/t=all/);
 }
 const draft={confirmed:'https://link.teamboatn.com/guide.html?v=2&t=yacht\nhttps://external.example/guide.html?v=1&t=visit'};
 assert.deepEqual(M.prepareDrafts(row(),draft,undefined,b),draft);
 const docked={...row(),product_id:'docked'},old={confirmed:'담당자 메모\nhttps://link.teamboatn.com/guide/yacht-video-v1.html'};
 const corrected=M.prepareDrafts(docked,old,undefined,b);
 assert.equal(corrected.confirmed,'담당자 메모\nhttps://link.teamboatn.com/guide/yacht-docked-video-v1.html');assert.deepEqual(M.prepareDrafts(docked,corrected,undefined,b),corrected);
});

test('all visit guides show clearly separated regional pickup terms, including previously shared Busan paths',()=>{
 for(const video of [false,true]){
  const r=row('visit',video),suffix=video?'-video':'';
  for(const place of ['부산광역시 해운대구 합성로 1','부산진구 합성로 2','서울특별시 합성로 1','경상남도 창원시','합성호텔','']){
   const url=M.guideURL({...r,place,communication:{booking:{...b,place}}});
   assert.equal(new URL(url).pathname,`/guide/visit${suffix}-v1.html`);
   const page=pages[new URL(url).pathname.slice(1)];
   for(const text of ['부산 지역 한정','최대 1일 기준','시간당 30,000원','생화·케이크·웰컴드링크를 제외한 나머지 용품','직접 방문 수거','제공해 드린 백에 용품을 넣어 문 앞에','세팅 후 2시간 이내','오전 11시 이내','타지역 수거 안내','당일 수거 무료','세팅 후 2시간 대기한 뒤 당일 수거','해당 지역 출장비가 1회 추가 청구','타지역 출장비는 예약 시 안내드립니다.'])assert.ok(page.includes(text),text);
   assert.match(page,/<strong>중요 · 출장비 안내<\/strong>/);
   assert.match(page,/<strong>부산 일부 지역도 출장비가 발생할 수 있습니다\.<\/strong>/);
   const regions=[...page.matchAll(/<div class="pickup-region">([\s\S]*?)<\/div>/g)].map(x=>x[1]);
   assert.equal(regions.length,2);
   assert.match(regions[0],/부산 지역 한정/);assert.match(regions[0],/시간당 30,000원/);
   assert.match(regions[1],/타지역 수거 안내/);assert.doesNotMatch(regions[1],/시간당 30,000원|오전 11시|2시간 이내/);
   assert.equal((page.match(/택 1/g)||[]).length,2);
   assert.equal(pages[`guide/visit-busan${suffix}-v1.html`],page);
  }
 }
 for(const category of ['yacht','trunk','heli'])for(const video of [false,true]){
  const page=pages[new URL(M.guideURL(row(category,video))).pathname.slice(1)];
  assert.doesNotMatch(page,/부산 일부 지역|타지역 수거 안내|출장 프로포즈 용품 수거/);
 }
});

test('visit messages no longer require a city and migrate Busan links without changing notes or booking data',()=>{
 const r={...row('visit'),place:'부산 해운대',communication:{booking:{...b},messages:{sent:[{body:'보낸 내용 유지'}]}}};
 const before=structuredClone(r),busan='/guide/visit-busan-video-v1.html',other='/guide/visit-video-v1.html';
 assert.ok(M.guideURL(r).endsWith(other));
 for(const place of ['', '합성호텔', '부산광역시 합성로 1', '서울특별시 합성로 1']){
  assert.ok(M.guideURL(r,{...b,place}).endsWith(other));
  for(const stage of ['receipt','confirmed','reminder']){
   const draft=M.generate(r,stage,{...b,place},undefined,'2099-11-01T03:00:00Z');
   assert.ok(draft.includes(other));assert.match(draft,/준비사항·용품 수거/);assert.ok(draft.length<700);
  }
 }
 const saved={confirmed:'개별 수거 메모 유지\nhttps://link.teamboatn.com'+busan+'\nhttps://external.example/guide/visit-v1.html\nhttps://link.teamboatn.com/guide/visit-v2.html\nhttps://link.teamboatn.com/guide/visit-v1.html?custom=1'};
 const updated=M.prepareDrafts(r,saved,undefined,b);
 assert.equal(updated.confirmed,saved.confirmed.replace(busan,other));
 assert.deepEqual(M.prepareDrafts(r,updated,undefined,b),updated);
 assert.deepEqual(M.prepareDrafts(r,updated,undefined,{...b,place:'서울특별시 합성로 1'}),updated);
 assert.match(saved.confirmed,/visit-busan/);
 assert.deepEqual(r,before);
});

test('paper-frame selection adds identifying mail instructions only to relevant drafts and guide pages',()=>{
 const option={id:'paper-frame-photos',name:'종이액자 사진 출력 4개',amount:10000};
 for(const packageId of ['light','all'])for(const stage of ['receipt','confirmed','reminder','thanks']){
  const r=row('visit',packageId==='all');r.snapshot.package.id=packageId;r.snapshot.options=[option];
  r.communication={booking:{...b},events:[{kind:'manual_sent',body:'기존 발송 내용'}]};
  const before=structuredClone(r),body=M.generate(r,stage,b,undefined,'2099-11-01T03:00:00Z');
  if(stage==='thanks'){assert.doesNotMatch(body,/종이액자 사진:|메일 제목:/);continue;}
  assert.match(body,/종이액자 사진: 4장을 seolvidmoa@gmail\.com으로 보내 주세요/);
  assert.match(body,/메일 제목: 2099-11-21 \/ 20:00 \/ 합성 고객/);
  assert.match(body,/날짜·시간·성함 누락 시 예약 확인이 어려울 수 있습니다/);
  assert.match(body,/540,000원/);assert.match(body,/90,000원/);
  const url=new URL(body.match(/https:\/\/link\.teamboatn\.com\/guide\/\S+/)[0]);assert.equal(url.search,'');
  const page=pages[url.pathname.slice(1)];assert.match(page,/id="paper-frame-photos"/);assert.match(page,/예약 날짜 \/ 시간 \/ 성함/);assert.match(page,/누락되면 어떤 예약의 사진인지 확인이 어려울/);
  const legacy=body.replace(/^종이액자 사진:.*\n메일 제목:.*\n날짜·시간·성함 누락 시 예약 확인이 어려울 수 있습니다\.\n\n/m,'').replace('-photos-v1.html','-v1.html')+'\n\n담당자 메모 유지';
  const updated=M.prepareDrafts(r,{[stage]:legacy},undefined,b)[stage];assert.equal((updated.match(/종이액자 사진: /g)||[]).length,1);assert.match(updated,/담당자 메모 유지/);
  assert.equal(M.prepareDrafts(r,{[stage]:updated},undefined,b)[stage],updated);
  const changed={...b,date:'2099-11-22',time:'18:30'};
  assert.match(M.prepareDrafts(r,{[stage]:updated},undefined,changed)[stage],/메일 제목: 2099-11-22 \/ 18:30 \/ 합성 고객/);
  const excluded={...b,excludedOptionIds:[option.id]},removed=M.prepareDrafts(r,{[stage]:updated},undefined,excluded)[stage];
  assert.doesNotMatch(removed,/종이액자 사진:|-photos-v1/);assert.match(removed,/담당자 메모 유지/);
  assert.deepEqual(r,before);
 }
 for(const category of ['yacht','visit','trunk','heli']){
  const r=row(category,false);if(category!=='visit')r.snapshot.options=[option];
  const body=M.generate(r,'confirmed',b);assert.doesNotMatch(body,/종이액자 사진:|-photos-v1/);
 }
});
