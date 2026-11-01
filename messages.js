/* Shared, deterministic message helpers. No customer data is stored in this module. */
(() => {
'use strict';
const stages={receipt:'예약 접수·금액 안내',confirmed:'결제 후 예약 확정',reminder:'하루 전 안내',thanks:'이벤트 후 안부'};
const bank='우리은행 1005-703-823528\n예금주: (주)보트앤럭스';
const contact='문의: 1833-8047\n담당자: 010-8009-8047';
const refunds='취소·환불 안내 (행사 예정일 기준)\n45~31일 전: 90% 환불\n30~16일 전: 80% 환불\n15~11일 전: 70% 환불\n10~7일 전: 60% 환불\n6~2일 전: 50% 환불\n1일 전·당일: 환불 불가';
const dateOK=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const timeOK=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const money=value=>Number.isInteger(value)?value.toLocaleString('ko-KR')+'원':'금액 확인 필요';
function defaults(r){
 const p=r.preferences?.[0]||{},price=r.snapshot?.price||{};
 // Different weekday/weekend prices and holidays require an operator's final quote.
 return {date:p.date||'',time:timeOK(p.time)?p.time:'',amount:price.weekday===price.weekend?price.weekday:null,place:r.place||'',scheduleConfirmed:false,paymentConfirmed:false,extra:'',...(r.communication?.booking||{})};
}
function validate(stage,b,r){
 if(!stages[stage])return '안내 단계를 선택해 주세요.';
 if(!/^01[016789]\d{7,8}$/.test(r.phone||''))return '고객 휴대전화 번호를 확인해 주세요.';
 if(r.status==='cancelled')return '취소된 상담에는 이 예약 안내를 보낼 수 없습니다.';
 if(!dateOK(b.date))return '안내할 행사 날짜를 입력해 주세요.';
 if(stage==='thanks')return '';
 if(!timeOK(b.time))return '협의한 정확한 시간을 입력해 주세요.';
 if(!Number.isInteger(b.amount)||b.amount<0||b.amount>100000000)return '안내할 최종 금액을 입력해 주세요.';
 if(['confirmed','reminder'].includes(stage)){
  if(!b.scheduleConfirmed||!b.paymentConfirmed)return '일정·장소 확정과 입금 확인을 모두 체크해 주세요.';
  if(!b.place.trim())return '확정 장소·주소를 입력해 주세요.';
 }
 return '';
}
function hasVideo(r){return (r.snapshot?.package?.features||[]).some(x=>/영상\s*편지/.test(x))||(r.snapshot?.options||[]).some(x=>['video-letter','video-letter-usb'].includes(x.id));}
function videoGuide(r,b){
 if(!hasVideo(r))return '';
 const deadline=dateOK(b.date)?new Date(Date.parse(b.date)-7*86400000).toISOString().slice(0,10):'';
 return '영상편지 준비\n사진 약 30장과 편지글 약 300자를 boatn@naver.com으로 보내 주세요.\n메일 제목: 행사 날짜 / 시간 / 성함\n'+(r.category==='yacht'?'제출 기한: '+(deadline||'행사 7일 전')+' (행사 7일 전까지)\n기한 내 자료가 도착하지 않으면 영상 제작이 어렵습니다. 행사까지 7일 미만이면 제작 가능 여부를 먼저 확인해 주세요.':'자료 전달·제작 일정은 담당자와 확인해 주세요.');
}
function preparation(r,b,short=false){
 switch(r.category){
 case 'yacht':return [(short?'':'승선 장소와 주차 안내는 확정된 주소를 확인해 주세요.\n')+'비만 오는 경우 정상 운항할 수 있으나, 기상·해상 상황에 따라 운항 여부와 일정이 달라질 수 있습니다. 변경 시 담당자가 연락드립니다.',short?'':videoGuide(r,b)].filter(Boolean).join('\n\n');
 case 'visit':return ['장식 설치 시간과 장소 출입 방법을 담당자와 확인해 주세요. 숙소·행사장의 설치 허용 여부도 미리 확인 부탁드립니다.',short?'':videoGuide(r,b)].filter(Boolean).join('\n\n');
 case 'trunk':return /부산|출장/.test(r.snapshot?.package?.name||'')?'부산 출장 진행입니다. 차량 종류, 정확한 주차 위치와 현장 출입 방법을 담당자에게 알려 주세요. 트렁크의 짐은 미리 비워 주세요.':'해운대 사무실 방문 진행입니다. 안내받은 주소로 차량과 함께 방문해 주세요. 차량 종류를 미리 알려 주시고 트렁크의 짐은 비워 주세요.';
 case 'heli':return '헬기는 주간에만 운항하며 기상 상황에 따라 시간·장소가 변경될 수 있습니다. 최종 탑승 장소와 시간을 담당자에게 확인해 주세요. 편지 낭독 준비와 촬영 구성은 선택하신 패키지에 맞춰 안내드립니다.';
 default:return '';
 }
}
function generate(r,stage,b){
 const selection=[r.snapshot?.product?.name,r.snapshot?.package?.name].filter(Boolean).join(' · '),options=(r.snapshot?.options||[]).map(o=>o.name).join(', ');
 const schedule=b.date+(b.time?' '+b.time:' (시간 협의 중)');
 const summary=['상품: '+selection,options?'추가 선택: '+options:'','행사 일정: '+schedule,'금액: '+money(b.amount),'장소: '+(b.place||'담당자와 협의 후 안내')].filter(Boolean).join('\n');
 let parts=[];
 if(stage==='receipt')parts=[`[모먼트링크 · 예약 접수]\n${r.person}님, 소중한 순간을 함께 준비하겠습니다.`,summary,'입금 안내\n'+bank,r.category==='yacht'?'이 안내를 받은 후 2시간 이내 입금 부탁드립니다. 입금 후 회신해 주시면 담당자가 입금·일정을 확인하고 예약 확정 안내를 드립니다.':'입금 후 회신 부탁드립니다. 담당자가 입금·일정을 확인한 후 예약 확정 안내를 드립니다.',['yacht','visit'].includes(r.category)?'100% 예약제로 운영하며, 예약 확정 시 해당 시간대의 다른 예약이 제한됩니다. 신중한 결정 부탁드립니다.\n\n'+refunds+(r.category==='yacht'?'\n날짜 변경은 1회 가능합니다.':''):'',preparation(r,b)];
 if(stage==='confirmed')parts=[`[모먼트링크 · 예약 확정]\n${r.person}님, 입금 확인이 완료되어 예약이 확정되었습니다.`,summary,preparation(r,b),'변경 사항이나 요청이 있으시면 이 번호로 회신해 주세요.'];
 if(stage==='reminder')parts=[`[모먼트링크 · 행사 전 안내]\n${r.person}님, 예정된 프로포즈 일정을 다시 안내드립니다.`,summary,preparation(r,b,true),'도착 또는 일정 변경이 필요하시면 담당자에게 연락해 주세요. 소중한 순간을 위해 정성껏 준비하겠습니다.'];
 if(stage==='thanks'){
  const question={yacht:'요트에서의 시간과 진행은 어떠셨나요?',visit:'준비해 드린 장식과 이벤트 진행은 어떠셨나요?',trunk:'트렁크 이벤트와 장식은 어떠셨나요?',heli:'헬기에서의 특별한 순간과 진행은 어떠셨나요?'}[r.category]||'이벤트 진행은 어떠셨나요?';
  parts=[`[모먼트링크 · 감사 인사]\n${r.person}님, ${b.date} 소중한 순간을 함께할 수 있어 감사했습니다.`,question+'\n좋았던 점이나 아쉬웠던 점을 편하게 회신해 주세요. 불편한 점이 있었다면 담당자가 확인하고 연락드리겠습니다.', '촬영 결과물 전달 일정은 선택하신 구성에 따라 담당자에게 문의해 주세요. 두 분의 행복한 앞날을 응원합니다.'];
 }
 return [...parts,b.extra,contact].filter(Boolean).join('\n\n');
}
function smsURI(phone,body,ua='',platform='',touch=0){
 if(!/^01[016789]\d{7,8}$/.test(phone))throw Error('잘못된 수신 번호');
 const ios=/iPhone|iPad|iPod/.test(ua)||(platform==='MacIntel'&&touch>1);
 return 'sms:'+phone+(ios?'&':'?')+'body='+encodeURIComponent(body);
}
globalThis.MomentLinkMessages=Object.freeze({stages,defaults,validate,generate,smsURI,hasVideo});
})();
