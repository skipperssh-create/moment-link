import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import '../pricing.js';
import '../booking-addons.js';
import '../messages.js';
import {attachBoardingMessage} from '../server/boarding-pass.mjs';
const M=globalThis.MomentLinkMessages;
const html=await readFile(new URL('../guide.html',import.meta.url),'utf8');
const script=await readFile(new URL('../guide.js',import.meta.url),'utf8');
const b={date:'2099-11-21',time:'20:00',amount:540000,receivedAmount:90000,place:'부산광역시 합성 주소',extra:''};
const row=(category='yacht',video=true)=>({person:'합성 고객',phone:'01000000000',category,status:'consulting',snapshot:{product:{name:'합성 상품'},package:{name:'올인원',features:video?['영상편지']:[]},options:[]}});

test('short messages preserve schedule, payment, address and phone while linking details without personal URL data',()=>{
 for(const category of ['yacht','visit','trunk','heli'])for(const stage of ['receipt','confirmed','reminder'])for(const useDeposit of [false,true]){
  const r=row(category),body=M.generate(r,stage,{...b,useDeposit,requestedDepositAmount:useDeposit?90000:null},'2099-11-01T03:00:00Z');
  for(const value of ['2099-11-21 20:00','540,000원','90,000원','450,000원',b.place,'010-0000-0000'])assert.ok(body.includes(value),value);
  assert.doesNotMatch(body,/45~31일|A4 용지|사진 순서|정문 진입|기상·해상/);
  assert.ok(body.length<700,`${category}/${stage}: ${body.length}`);
  if(stage==='receipt')assert.equal(body.includes('예약금만 입금'),useDeposit);
  const url=new URL(body.match(/https:\/\/link\.teamboatn\.com\/guide\.html\?\S+/)[0]);
  assert.equal(url.origin,'https://link.teamboatn.com');assert.deepEqual([...url.searchParams.keys()],['v','t','video']);
  assert.equal(url.searchParams.get('t'),category);assert.equal(url.searchParams.get('v'),'1');
  assert.equal(decodeURIComponent(M.smsURI(r.phone,body,'Android').split('body=')[1]),body);
 }
 assert.equal(new URL(M.guideURL({...row('unknown'),person:'<script>'})).searchParams.get('t'),'all');
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
 assert.equal(result.confirmed.match(/guide\.html/g).length,1);assert.deepEqual(M.prepareDrafts(r,result,undefined,b),result);
 const rebuilt=attachBoardingMessage(result.confirmed,info,saved.invitation);
 assert.equal(rebuilt.body.match(/boarding\/synthetic-token/g).length,1);
 assert.notEqual(rebuilt.invitation.digest,saved.invitation.digest);
 const custom={receipt:refund.replace('90%','별도 합의')+'\n\n개별 협의 내용'};
 assert.match(M.prepareDrafts(row('visit'),custom,undefined,b).receipt,/별도 합의/);
});

test('public page retains supplied refund, directions, pickup and video policies, including the corrected email',()=>{
 for(const text of ['45~31일 전','90%','30~16일 전','80%','15~11일 전','70%','10~7일 전','60%','6~2일 전','50%','1일 전·당일','환불 불가','날짜 변경은 1회','정문 진입 → 해안도로 → 요트면허시험장 앞 주차장','세팅 완료 후 2시간','오전 11시 이전','1시간당 30,000원','25~30장','1.jpg, 2.jpg…','A4 용지 1/3 분량','약 300자','날짜(26-00-00)_장소_성함','이벤트 7일 전까지','이벤트까지 7일 이내','자료 전달 일정 및 제작 가능 여부','수정은 오타에 한해','mailto:seolvidmoa@gmail.com'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/boatn@naver|01000000000|합성 고객|synthetic-token/);
 assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|innerHTML|document\.write/);
 assert.match(html,/name="viewport"/);assert.match(html,/noindex, nofollow/);
});

function page(query){
 const elements=[...html.matchAll(/<(?:section|p|a|div|li)\b[^>]*data-(for|video|mode)(?:="([^"]*)")?[^>]*>/g)].map(m=>({source:m[0],hidden:false,dataset:{[m[1]]:m[2]||''}}));
 const ids={guideContent:{hidden:false},guideUnavailable:{hidden:true},guideCategory:{value:'all',addEventListener(type,fn){this.change=fn;}}};
 const document={getElementById:id=>ids[id],querySelectorAll:selector=>elements.filter(e=>Object.hasOwn(e.dataset,selector.slice(6,-1)))};
 vm.runInNewContext(script,{URLSearchParams,location:{search:query},document});
 return {ids,elements};
}
test('guide filtering accepts only known categories, hides unrelated policies and fails clearly for unknown versions',()=>{
 const yacht=page('?v=1&t=yacht&video=1');
 assert.equal(yacht.elements.find(e=>e.source.includes('id="refund"')).hidden,false);
 assert.equal(yacht.elements.find(e=>e.source.includes('id="visit"')).hidden,true);
 assert.equal(yacht.elements.find(e=>e.source.includes('id="video"')).hidden,false);
 const visit=page('?v=1&t=visit');assert.equal(visit.elements.find(e=>e.source.includes('id="video"')).hidden,true);
 const trunk=page('?v=1&t=trunk&mode=visit');
 assert.equal(trunk.elements.find(e=>e.source.includes('id="refund"')).hidden,true);
 for(const e of trunk.elements.filter(e=>e.dataset.mode))assert.equal(e.hidden,e.dataset.mode!=='visit');
 trunk.ids.guideCategory.value='all';trunk.ids.guideCategory.change();assert.ok(trunk.elements.every(e=>!e.hidden));
 const invalid=page('?v=500&t=yacht');assert.equal(invalid.ids.guideContent.hidden,true);assert.equal(invalid.ids.guideUnavailable.hidden,false);
 assert.equal(page('?t=%3Cscript%3E&phone=01000000000').ids.guideCategory.value,'all');
});
