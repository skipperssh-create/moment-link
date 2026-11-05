/* MOMENT LINK. Customer data stays in memory; confirmed submissions are stored by the API. */
(() => {
'use strict';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const krw = value => value === null || value === undefined || value === '' ? '상담 후 안내' : `${Number(value).toLocaleString('ko-KR')}원`;
const dateLabel = value => value ? `${Number(value.substring(5,7))}월 ${Number(value.substring(8,10))}일` : '미선택';
const localToday = () => {const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`};
const uid = () => 'i_' + Math.random().toString(36).slice(2, 10);
const pack = (id,name,weekday,weekend,summary,features=[],note='',excludedFeatures=[]) => ({id,name,weekday,weekend,summary,features,note,...(excludedFeatures.length?{excludedFeatures}:{})});
const product = (id,category,sub,name,short,packages,description,extra={}) => ({id,category,sub,name,short,packages,description,visible:true,photo:'',bouquet:false,...extra});
const CATEGORY = [{id:'yacht',label:'요트 프로포즈',sub:'출항형 · 정박형',symbol:'Y'},{id:'visit',label:'출장 프로포즈',sub:'라이트 · 올인원',symbol:'V'},{id:'trunk',label:'트렁크 프로포즈',sub:'차량 이벤트 장식',symbol:'T'},{id:'heli',label:'헬기 프로포즈',sub:'편지 낭독 · 촬영 패키지',symbol:'H'}];
// Yacht contents follow the owner's comparison image supplied on 2026-11-01.
const yachtCommon=['단독 요트 대관','요트 투어·프로포즈','영상편지 상영','프로포즈 장식','LED 촛불 연출','영상촬영 (마케팅 동의 시)'];
const yachtExtra=['와인','DSLR 스냅 촬영','포토데코','폭죽'];
const baseYacht=[...yachtCommon,'총 이용시간 30분 · 실운항 약 25분'];
const allYacht=[...yachtCommon,...yachtExtra,'총 이용시간 50분 · 실운항 약 45분'];
const visitBase=['꽃장식·촛불·조명·소품 전체 세팅','거치대 풍선 세팅','현장 전체 설치','이벤트 종료 후 수거·정리'];
const visitAdd=['미니케이크 준비','맞춤 영상편지 제작·현장 세팅','액션캠 설치·촬영 원본 전달 (동의 조건)','웰컴 드링크 2병','설치 상황 사진 공유','50회 이상 현장 경험 플래너 전담'];
const heliBasic=['헬기탑승 및 비행','지상 남자친구의 헤드셋 편지 낭독 (운항 승인 전제)','착륙 후 WILL YOU MARRY ME? 손현수막','헬기 앞 테이블 세팅·샴페인','헬기 앞 기념촬영'];
const heliFootage=['헬기 내부 액션캠 영상','지상 편지 낭독 장면 촬영','이·착륙 현장 반응 촬영','헬기 앞 DSLR 사진 촬영','사진·영상 촬영 원본 제공'];
const defaults = [
product('classic','yacht','sail','클래식(레오파드)요트','레오파드 · 합리적인 가격의 로맨틱 요트',[
pack('light','라이트',390000,440000,'총 이용시간 30분 · 실운항 약 25분',baseYacht,'',yachtExtra),
pack('all','올인원',440000,540000,'총 이용시간 50분 · 실운항 약 45분',allYacht)
],'합리적인 가격으로 즐기는 로맨틱한 요트 프로포즈.'),
product('premium','yacht','sail','프리미엄(메가)요트','메가 · 넓고 쾌적한 프리미엄 공간',[
pack('light','라이트',490000,590000,'총 이용시간 30분 · 실운항 약 25분',[...baseYacht,'케이크','꽃다발'],'',yachtExtra),
pack('all','올인원',590000,690000,'총 이용시간 50분 · 실운항 약 45분',[...allYacht,'케이크','꽃다발'],'꽃다발: 생화 또는 비누꽃')
],'넓고 쾌적한 공간에서 즐기는 프리미엄 요트 프로포즈.',{bouquet:true}),
product('signature','yacht','sail','시그니처(리파리)요트','리파리 · 프라이빗 럭셔리 요트',[
pack('light','라이트',590000,690000,'총 이용시간 30분 · 실운항 약 25분',[...baseYacht,'케이크','꽃다발'],'',yachtExtra),
pack('all','올인원',690000,790000,'총 이용시간 50분 · 실운항 약 45분',[...allYacht,'케이크','꽃다발'],'꽃다발: 생화 또는 비누꽃')
],'더욱 특별하고 프라이빗한 최고급 럭셔리 요트 프로포즈.',{bouquet:true}),
product('docked','yacht','dock','미출항 · 요트 단독 대관','출항 없이 정박한 요트에서 프라이빗하게 진행',[
pack('light','라이트',290000,290000,'총 이용시간 약 30분 · 승·하선 포함',['요트 단독 대관','영상촬영 (마케팅 동의 시)']),
pack('all','올인원',390000,390000,'총 이용시간 약 50분 · 승·하선 포함',['요트 단독 대관','영상편지 포함','영상촬영 (마케팅 동의 시)'])
],'현장 운영 상황에 따라 프리미엄(메가)요트 또는 시그니처(리파리)요트로 배정합니다. 주중·주말 동일 대관금액입니다.'),
product('visit','visit','main','출장 프로포즈 세팅','두 패키지의 장식 세팅은 동일합니다.',[
{...pack('light','라이트',249000,249000,'장식 세팅 · 현장 설치 · 행사 후 수거',visitBase,'고객은 장소만 준비하면 됩니다.'),options:[{id:'bouquet',name:'기본 꽃다발 추가',amount:30000},{id:'video-letter',name:'영상편지 제작',amount:30000},{id:'usb',name:'소장용 USB',amount:10000,requiresOptionId:'video-letter'}]},
{...pack('all','올인원',348000,348000,'라이트 동일한 장식 + 추가 서비스',[...visitBase,...visitAdd],'액션캠 촬영 원본 전달은 별도 마케팅 활용 동의 조건 적용.'),options:[{id:'usb',name:'소장용 USB',amount:10000},{id:'bouquet',name:'기본 꽃다발 추가',amount:30000}]}
],'올인원은 장식의 품질이나 양이 달라지는 상품이 아니라 미니케이크·영상편지 등 추가 서비스가 포함되는 상품입니다.'),
product('trunk','trunk','main','트렁크 프로포즈','차량 트렁크를 활용한 깜짝 이벤트',[
pack('consult','해운대 사무실 방문',219000,219000,'사무실 방문형',[],'수거·반납: 당일 세팅 후 2시간 대기 후 수거 또는 다음 날 오전 11시 이전 해운대 사무실 방문 반납. 약속 시간 초과 시 1시간당 30,000원.'),
pack('busan','부산지역 출장',249000,249000,'부산지역 출장형',[],'수거: 당일 세팅 후 2시간 대기 후 수거 또는 다음 날 오전 11시 이전 요청하신 출장 위치에 다시 방문해 수거. 약속 시간 초과 시 1시간당 30,000원.')
],'희망 위치와 특이사항을 적어 주시면 맞춤 안내드립니다.\n\n수거·반납 안내\n당일 수거: 세팅 완료 후 2시간 대기한 뒤 수거합니다.\n다음 날 수거: 오전 11시 이전까지 수거·반납을 완료합니다.\n해운대 사무실 방문 세팅: 해운대 사무실로 차량과 함께 방문하시면 수거합니다.\n출장 세팅: 고객님이 원하시는 출장 위치로 다시 방문해 수거합니다.\n약속한 수거·반납 시간을 초과하면 1시간당 30,000원의 추가 요금이 발생합니다.\n수거 방법과 시간은 예약 시 담당자와 정해 주세요.'),
product('heli','heli','main','헬기 프로포즈','하늘에서 듣는 편지, 착륙 후 깜짝 프로포즈',[
pack('basic','기본 프로포즈',690000,690000,'총 약 35분 · 실비행 약 5분',heliBasic,'안전 확인 후 지상·항공 통신으로 편지를 전달합니다.'),
pack('original','촬영 원본',990000,990000,'기본 포함 + 촬영 원본 제공',[...heliBasic,...heliFootage],'추억영상 편집본은 포함되지 않습니다.'),
pack('edited','원본 + 추억영상',1090000,1090000,'기본·촬영 원본 + 추억영상 편집본',[...heliBasic,...heliFootage,'추억영상 편집본 제공'],'촬영 원본과 추억영상 편집본을 함께 제공합니다.')
],'여자친구가 먼저 헬기에 탑승하여 비행하는 동안, 지상 남자친구가 헤드셋으로 편지를 낭독합니다. 착륙 후 손현수막·샴페인·기념촬영으로 마무리합니다. 통신·촬영·현장 이벤트는 운항자 안전 승인 조건으로 진행됩니다. 군산 또는 변산 중 최종 탑승 장소는 전날 기상·운영 확인 후 안내됩니다.')
];
const settingDefaults = {solapi:false,customerAuto:false,adminAuto:false,push:true,smsNumber:'010-8009-8047',mainNumber:'1833-8047',yachtPlace:'한국해양대학교 요트면허시험장 앞 주차장',yachtAddress:'부산광역시 영도구 태종로 727',heliGunsan:'군산 (상세 위치는 최종 안내)',heliByeonsan:'변산 (상세 위치는 최종 안내)'};
let catalog=structuredClone(defaults);
let settings={...settingDefaults,accepting:false};
let catalogVersion=0,requestKey='',submitting=false,apiReady=false;
const state={view:'customer',step:'category',category:null,sub:'sail',selection:null,optionIds:[],firstDate:'',firstTime:'',secondDate:'',secondTime:'',name:'',phone:'',place:'',notes:'',consent:false,complete:false,adminTab:'inbox',editId:'',adminCategory:'yacht',adminSub:'sail',adminDetail:false,notice:'',formError:'',secondEnabled:false,openDetails:[],editorDirty:false};

const getProduct=()=>state.complete&&state.submitted?state.submitted.product:state.selection?.id==='recommend'?{id:'recommend',name:catName(),category:state.category,sub:state.sub,visible:true,packages:[]}:catalog.find(x=>x.id===state.selection?.id);
const getPack=()=>state.complete&&state.submitted?state.submitted.package:state.selection?.id==='recommend'?{id:'recommend',name:'상담 후 추천',weekday:null,weekend:null,summary:'담당자와 상의 후 결정'}:getProduct()?.packages.find(x=>x.id===state.selection?.packId);
const catName=()=>CATEGORY.find(x=>x.id===state.category)?.label||'상담';
const choiceName=()=>`${getProduct()?.name||''} · ${getPack()?.name||''}`;
const priceDisplay=p=>!p||p.weekday===null?'상담 후 안내':p.weekday===p.weekend?krw(p.weekday):`주중 ${krw(p.weekday)} / 주말 ${krw(p.weekend)}`;
const selectedOptions=()=>state.complete&&state.submitted?state.submitted.options||[]:(getPack()?.options||[]).filter(o=>state.optionIds.includes(o.id));
const optionAmount=()=>selectedOptions().reduce((sum,o)=>sum+o.amount,0);
const displayChosenPrice=()=>{const p=getPack(),extra=optionAmount();return priceDisplay(p?{...p,weekday:p.weekday===null?null:p.weekday+extra,weekend:p.weekend===null?null:p.weekend+extra}:p)+(p?.datePrices||[]).filter(x=>x.date===state.firstDate||x.date===state.secondDate).map(x=>' / '+dateLabel(x.date)+' '+krw(x.amount===null?null:x.amount+extra)).join('')+(selectedOptions().length?' · '+selectedOptions().map(o=>o.name).join(', '):'');}; // Keep both published prices visible; final guidance uses the shared date-pricing rules.
const top=()=>`<div class="demo-banner">${settings.accepting?'상담 신청 · 예약 확정은 상담 후 안내':'상담 접수 준비 중 · 대표번호로 문의해 주세요'}</div><header><div class="brand">MOMENT LINK</div><nav class="nav" aria-label="관리자"><a class="tab" href="#admin">관리자 로그인</a></nav></header>`;
const progress=()=>{const count={welcome:0,category:1,products:2,schedule:3,contact:4,review:4,done:4,sms:4}[state.step];return `<div class="step-bar" aria-label="상담 신청 단계">${[1,2,3,4].map(i=>`<span class="${i<=count?'done':''}"></span>`).join('')}</div>`};
const iconBoat=`<svg viewBox="0 0 240 120" fill="none" aria-hidden="true"><path d="M20 72H218L186 104H52Z" fill="#fff" stroke="#98aeb8" stroke-width="3"/><path d="M74 70V24h91l26 46" fill="#f7fcff" stroke="#98aeb8" stroke-width="3"/><path d="M91 35h55v25H91Z" fill="#a8c5d2"/><path d="M25 112q22-12 44 0t44 0t44 0t44 0" stroke="#b2ccd4" stroke-width="4"/></svg>`;
const safeImageURL = value => {
 const v=String(value||'').trim();
 if (!v) return '';
 if (/^\/api\/media\/[a-f0-9-]{36}$/.test(v)) return v;
 if (/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(v)) return v;
 try { const u=new URL(v); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch { return ''; }
};
const photo=p=>safeImageURL(p.photo)?`<img src="${escapeHTML(safeImageURL(p.photo))}" alt="${escapeHTML(p.media?.[0]?.alt||p.name+' 대표사진')}" loading="lazy" decoding="async" />`:`<div class="photo-placeholder"><span class="photo-wordmark">MOMENT LINK</span><span>실제 상품 사진 등록 전</span></div>`;
function packageCard(item,option){const yes=state.selection?.id===item.id&&state.selection?.packId===option.id;
return `<button type="button" class="package-option ${yes?'chosen':''}" data-select="${escapeHTML(item.id)}:${escapeHTML(option.id)}" aria-pressed="${yes}" ${item.salePaused?'disabled':''}><div class="package-title"><span>${escapeHTML(option.name)}</span><span class="selection-dot" aria-hidden="true">${yes?'●':'○'}</span></div>${option.weekday===null?`<div class="package-single">상담 후 안내</div>`:option.weekday===option.weekend?`<div class="package-single">${krw(option.weekday)}</div>`:`<div class="price-line"><small>주중</small><b>${krw(option.weekday)}</b></div><div class="price-line"><small>주말</small><b>${krw(option.weekend)}</b></div>`}<div class="package-notes">${escapeHTML(option.summary).split(' · ').map(t=>`<span>${t}</span>`).join('')}</div>${item.category==='heli'?`<div class="package-highlight">${option.id==='basic'?'헬기 비행·편지 낭독·샴페인':option.id==='original'?'촬영 원본 제공 · 편집본 제외':option.id==='edited'?'촬영 원본 + 추억영상 편집본':'구성 상세 확인'}</div>`:''}</button>`}

function packageDuration(pk,kind){
 if(!pk)return '';
 if(kind==='total'&&pk.durationMinutes)return pk.durationMinutes+'분';
 const text=[pk.summary,...(pk.features||[])].join(' · ');
 const pattern=kind==='total'?/총(?: 이용시간)?\s*((?:약\s*)?\d+분)/:/실(?:운항|비행)(?:시간)?\s*((?:약\s*)?\d+분)/;
 return text.match(pattern)?.[1]||'';
}
function yachtInclusionTable(p){
 const packages=p.packages;
 const features=[...new Set(packages.flatMap(pk=>[...(pk.features||[]),...(pk.excludedFeatures||[])]))].filter(f=>!/^총(?: 이용시간)?\s/.test(f));
 if(!features.length)return '';
 let unknown=false;
 const rows=features.map(f=>`<tr><th scope="row">${escapeHTML(f)}</th>${packages.map(pk=>{
  if(pk.features?.includes(f))return '<td><span class="inclusion-mark" role="img" aria-label="포함">✓</span></td>';
  if(pk.excludedFeatures?.includes(f))return '<td><span class="inclusion-mark excluded" role="img" aria-label="미포함">–</span></td>';
  unknown=true;return '<td class="inclusion-unknown">상담 확인</td>';
 }).join('')}</tr>`).join('');
 return `<section class="package-comparison" aria-label="${escapeHTML(p.name)} 상품 구성 비교"><div class="comparison-scroll inclusion-scroll" tabindex="0" role="region" aria-label="${escapeHTML(p.name)} 라이트·올인원 구성 비교표"><table class="compare-table inclusion-table" ${packages.length>2?'style="min-width:'+(150+packages.length*80)+'px"':''}><caption>상품 구성 비교</caption><thead><tr><th scope="col">포함 내용</th>${packages.map(pk=>`<th scope="col">${escapeHTML(pk.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${unknown?'<p class="micro comparison-note">상담 확인: 제공 여부·조건을 상담 시 안내합니다.</p>':''}</section>`;
}
function comparisonTable(p){
 const packages=p.packages;if(packages.length<2)return '';
 if(p.category==='yacht')return yachtInclusionTable(p);
 // Visit and helicopter services absent from a package are not included (owner confirmed 2026-11-02).
 const useInclusionMarks=['visit','heli'].includes(p.category);
 const unavailable=useInclusionMarks?'미포함':'상담 확인';
 const rows=[];
 const featureLabels={"헬기탑승 및 비행":"헬기 비행","지상 남자친구의 헤드셋 편지 낭독 (운항 승인 전제)":"헤드셋 편지 낭독 (운항 승인 전제)","착륙 후 WILL YOU MARRY ME? 손현수막":"착륙 후 손현수막","헬기 앞 테이블 세팅·샴페인":"테이블 세팅 · 샴페인","헬기 앞 기념촬영":"헬기 앞 기념촬영","헬기 내부 액션캠 영상":"헬기 내부 액션캠 영상","지상 편지 낭독 장면 촬영":"지상 편지 낭독 촬영","이·착륙 현장 반응 촬영":"이·착륙 반응 촬영","헬기 앞 DSLR 사진 촬영":"DSLR 사진 촬영","사진·영상 촬영 원본 제공":"사진·영상 원본","추억영상 편집본 제공":"추억영상 편집본"};
 const heading=pk=>p.category==='heli'?({basic:'기본',original:'촬영 원본',edited:'원본 + 편집본'}[pk.id]||pk.name):pk.name;
 for(const [kind,label] of [['total','총 이용시간'],['travel',p.category==='heli'?'실비행 시간':'실운항 시간']]){
  const values=packages.map(pk=>packageDuration(pk,kind));if(values.every(Boolean))rows.push({label,values});
 }
 const features=[...new Set(packages.flatMap(pk=>[...(pk.features||[]),...(pk.excludedFeatures||[])]))].filter(f=>!/^총(?: 이용시간)?\s/.test(f)&&!f.includes('꽃다발'));
 for(const feature of features)rows.push({label:p.category==='visit'&&feature==='맞춤 영상편지 제작·현장 세팅'?'영상편지 제작':featureLabels[feature]||feature,fullLabel:feature,values:packages.map(pk=>{
  if((pk.features||[]).includes(feature))return '포함';
  const video=p.category==='visit'&&feature==='맞춤 영상편지 제작·현장 세팅'&&pk.options?.find(o=>o.id==='video-letter');
  if(video)return krw(video.amount);
  return pk.excludedFeatures?.includes(feature)||(feature==='추억영상 편집본 제공'&&/편집본.*포함되지/.test(pk.note||''))?'미포함':unavailable;
 })});
 if(p.category==='visit'){
  const at=rows.findIndex(r=>r.label==='영상편지 제작');
  if(at>=0)rows.push(...rows.splice(at,1));
  rows.push({label:'영상편지 제작후 소장용 USB 구매',values:packages.map(pk=>{const usb=pk.options?.find(o=>o.id==='usb');return usb?krw(usb.amount):unavailable;})});
 }
 const options=[...new Map(packages.flatMap(pk=>(pk.options||[]).filter(o=>!(p.category==='visit'&&['video-letter','usb'].includes(o.id))).map(o=>[o.name,o]))).values()];
 for(const option of options)rows.push({label:p.category==='visit'&&option.id==='bouquet'?'꽃다발':option.name+' (선택)',values:packages.map(pk=>{const o=pk.options?.find(o=>o.name===option.name);return o?krw(o.amount)+(p.category==='visit'?'':' 추가'):unavailable;})});
 if(!rows.length)return '';
 const cellValue=value=>useInclusionMarks&&['포함','미포함'].includes(value)?'<span class="inclusion-mark'+(value==='미포함'?' excluded':'')+'" role="img" aria-label="'+value+'">'+(value==='포함'?'✓':'–')+'</span>':escapeHTML(value);
 return '<section class="package-comparison" aria-label="'+escapeHTML(p.name)+' 제공사항 비교"><div class="comparison-scroll" tabindex="0" role="region" aria-label="'+escapeHTML(p.name)+' 패키지 비교표"><table class="compare-table'+(packages.length===3?' three-options':'')+'" '+(packages.length>3?'style="min-width:'+ (120+packages.length*85)+'px"':'')+'><caption>제공사항 한눈에 비교</caption><thead><tr><th scope="col">제공사항</th>'+packages.map(pk=>'<th scope="col" aria-label="'+escapeHTML(pk.name)+'">'+escapeHTML(heading(pk))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr><th scope="row" aria-label="'+escapeHTML(row.fullLabel||row.label)+'">'+escapeHTML(row.label)+'</th>'+row.values.map(v=>'<td class="'+(v==='포함'?'included':'')+'">'+cellValue(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rows.some(r=>r.values.includes('상담 확인'))?'<p class="micro comparison-note">상담 확인: 제공 여부·조건을 상담 시 안내합니다.</p>':'')+'</section>';
}

function optionChoices(pk){
 const options=pk.options||[],groups=[...new Set(options.map(o=>o.group).filter(Boolean))];
 const choice=(o,type='checkbox')=>`<label class="inline-check"><input type="${type}" data-option="${escapeHTML(o.id)}" ${o.group?'name="option-'+escapeHTML(o.group)+'"':''} ${state.optionIds.includes(o.id)?'checked':''} ${o.requiresOptionId&&!state.optionIds.includes(o.requiresOptionId)?'disabled':''}/>${escapeHTML(o.name)} · +${krw(o.amount)}${o.requiresOptionId&&!state.optionIds.includes(o.requiresOptionId)?' (영상편지 제작 선택 후 추가)':''}</label>`;
 return options.filter(o=>!o.group).map(o=>choice(o)).join('')+groups.map(group=>{
  const choices=options.filter(o=>o.group===group),selected=choices.some(o=>state.optionIds.includes(o.id));
  return `<div class="option-group" role="group" aria-label="${escapeHTML(group)}"><p class="micro">${escapeHTML(group)} · 하나만 선택</p><label class="inline-check"><input type="radio" name="option-${escapeHTML(group)}" data-option-none="${escapeHTML(group)}" ${selected?'':'checked'}/>선택 안 함</label>${choices.map(o=>choice(o,'radio')).join('')}</div>`;
 }).join('');
}
function productCard(p){return `<article class="product"><div class="product-photo">${photo(p)}</div><h3 class="product-name">${escapeHTML(p.name)}</h3><p class="product-desc">${escapeHTML(p.short)}</p>${p.salePaused?'<p class="badge">현재 판매 중지</p>':''}${p.category==='visit'?'<div class="pill" style="margin-bottom:10px">라이트·올인원 장식 세팅 동일</div>':''}<div class="package-grid ${p.packages.length>2?'three':''}">${p.packages.map(pk=>packageCard(p,pk)).join('')}</div>${comparisonTable(p)}<details data-detail="${escapeHTML(p.id)}" ${state.openDetails.includes(p.id)?'open':''}><summary>구성·포함 서비스 자세히 보기</summary><div class="detail-body">${escapeHTML(p.description)}</div>${p.packages.map(pk=>`<div class="detail-body"><strong>${escapeHTML(pk.name)}</strong> · ${escapeHTML(priceDisplay(pk))}\n${escapeHTML(pk.features?.join(' · ')||'추후 안내')}${pk.note?'\n※ '+escapeHTML(pk.note):''}${pk.durationMinutes?'\n이용시간 '+pk.durationMinutes+'분':''}${(pk.datePrices||[]).map(x=>'\n'+escapeHTML(x.date)+' 확정 안내 가격 '+krw(x.amount)).join('')}</div>`).join('')}${(p.media||[]).slice(1).some(m=>safeImageURL(m.url))?`<div class="product-gallery">${(p.media||[]).slice(1).filter(m=>safeImageURL(m.url)).map(m=>`<img src="${escapeHTML(safeImageURL(m.url))}" alt="${escapeHTML(m.alt)}" loading="lazy" decoding="async"/>`).join('')}</div>`:''}</details></article>`}
function yachtPlace(){return `<p class="micro">${escapeHTML(MomentLinkPricing.policy)}</p><section class="info"><strong>요트 승선 장소 · 한국해양대학교</strong><div class="muted">${escapeHTML(settings.yachtAddress)}<br>${escapeHTML(settings.yachtPlace)}<br>${escapeHTML(MomentLinkPricing.yachtRoute)}</div></section>`}
function heliPlace(){return `<section class="info"><strong>헬기 탑승 장소 · 전날 최종 안내</strong><div class="muted">군산: ${escapeHTML(settings.heliGunsan)}<br>변산: ${escapeHTML(settings.heliByeonsan)}<br>비행 전날 기상 및 운영 상황 확인 후 최종 탑승장소를 개별 안내합니다.</div></section>`}
function footer(buttonText,action,disabled=false,note=''){return `<div class="action-bar">${state.formError?`<p class="form-error" role="alert">${escapeHTML(state.formError)}</p>`:''}${note?`<div class="micro" style="margin-bottom:9px">${escapeHTML(note)}</div>`:''}<button class="primary" type="button" data-next="${action}" ${disabled?'disabled':''}>${buttonText}</button></div>`}
function scheduleFields(n){
 const d=n===1?state.firstDate:state.secondDate,t=n===1?state.firstTime:state.secondTime;
 const id=n===1?'firstDate':'secondDate';
 const heli=state.category==='heli',times=heli?['오전','오후','시간 무관']:['오전','오후','저녁','시간 무관'];
 return `<div class="sectionlabel">${n}순위 희망 날짜 ${n===1?'· 필수':'· 선택'}</div><input aria-label="${n}순위 희망 날짜" id="${id}" class="field" type="date" min="${localToday()}" value="${escapeHTML(d)}"/><div class="times">${times.map(x=>`<button type="button" class="time ${t===x?'active':''}" data-time="${n}:${x}" aria-pressed="${t===x}">${heli&&x==='시간 무관'?'주간 시간 무관':x}</button>`).join('')}</div>${heli?'<p class="micro">헬기는 주간에만 운항합니다. 정확한 출발 시간은 상담 후 안내합니다.</p>':`<details class="exact-time" ${/^\d{2}:\d{2}$/.test(t)?'open':''}><summary>정확한 시간을 정하고 싶어요</summary><label class="micro" for="exactTime${n}">희망 시간 ${n===1?'(선택)':'(2순위)'}</label><input type="time" class="field" id="exactTime${n}" value="${/^\d{2}:\d{2}$/.test(t)?t:''}"></details>`}`;
}
function customer(){let s=`<main class="layout"><div class="page">${progress()}`;
if(state.step==='welcome')s+=`<section class="hero-card"><div class="eyebrow">PROPOSE CONSULTING</div><h1 class="page-title">특별한 순간을<br>간편하게 준비하세요.</h1><p class="muted">원하시는 상품과 희망 날짜를 선택해 주세요.<br>담당자가 내용을 확인한 후 상담을 도와드립니다.</p><div class="info"><strong>모먼트링크 프로포즈 상담 안내</strong><div class="muted">회원가입 없이 상품·가격을 비교하고 신청할 수 있습니다.</div></div>${footer('간편 상담 시작하기','start')}</section>`;
if(state.step==='category')s+=`<h1 class="page-title">어떤 프로포즈를 준비하시나요?</h1><p class="muted">원하시는 이벤트를 선택해 주세요.</p><div class="category-grid">${CATEGORY.map(c=>`<button type="button" class="select-card" data-category="${c.id}"><span class="category-icon">${c.symbol}</span><div class="card-title">${c.label}</div><div class="card-desc">${c.sub}</div></button>`).join('')}</div>`;
if(state.step==='products'){
s+=`<button class="back" data-back="category">← 다른 상품 보기</button><h1 class="page-title">${escapeHTML(catName())}</h1><p class="muted">가격과 구성을 비교하고, 마음에 드는 패키지를 눌러주세요.</p>`;
if(state.category==='yacht')s+=`<div class="choice-head">${[['sail','출항형 프로포즈'],['dock','정박형 프로포즈']].map(([id,n])=>`<button type="button" class="tab ${state.sub===id?'active':''}" data-sub="${id}">${n}</button>`).join('')}</div>`;
const list=catalog.filter(x=>x.visible&&x.category===state.category&&(state.category!=='yacht'||x.sub===state.sub));
s+=list.length?`<div class="product-grid ${list.length===1?'single-product':''}">${list.map(productCard).join('')}</div>`:'<div class="empty">현재 선택할 수 있는 상품이 없습니다.</div>';
if(state.category==='yacht')s+=state.sub==='sail'?`<div class="info"><strong>이용시간 안내</strong><div class="muted">라이트 총 30분(실운항 약 25분), 올인원 총 50분(실운항 약 45분). 총 이용시간에는 출·입항과 승·하선이 포함됩니다.</div></div>`:`<div class="info"><strong>정박형 상품 안내</strong><div class="muted">출항하지 않고 정박한 요트에서 진행합니다. 프리미엄(메가)요트·시그니처(리파리)요트 중 현장 배정되며 승·하선 시간이 포함됩니다.</div></div>`;
if(state.category==='yacht')s+=yachtPlace();
if(state.category==='heli')s+=heliPlace();
s+=(settings.locations||[]).filter(l=>l.category===state.category).map(l=>`<section class="info"><strong>${escapeHTML(l.name)} · ${l.status==='confirmed'?'확정 안내 장소':'후보 · 미확정'}</strong><div class="muted">${escapeHTML(l.address)}${l.parking?'<br>주차: '+escapeHTML(l.parking):''}${l.contact?'<br>현장 연락: '+escapeHTML(l.contact):''}</div>${l.mapUrl?`<a href="${escapeHTML(l.mapUrl)}" target="_blank" rel="noopener noreferrer">지도 보기</a>`:''}</section>`).join('');
s+=`<button class="secondary recommendation" data-action="recommend" aria-pressed="${state.selection?.id==='recommend'}">${state.selection?.id==='recommend'?'상담 후 추천 선택됨':'아직 고민 중이에요 · 상담 후 추천'}</button>`;
const current=getPack();if(current?.options?.length)s+=`<section class="info"><strong>추가 선택사항 · 선택</strong>${optionChoices(current)}</section>`;s+=footer('선택 완료 · 희망 일정으로','products',!current,current?`${choiceName()} / ${displayChosenPrice()}`:'원하시는 상품을 먼저 선택해 주세요.');
}
if(state.step==='schedule')s+=`<button class="back" data-back="products">← 상품 비교로</button><h1 class="page-title">언제가 좋으세요?</h1><p class="muted">1순위만 선택해도 신청할 수 있습니다.</p><div class="info"><strong>${escapeHTML(choiceName())}</strong><div class="muted">${escapeHTML(displayChosenPrice())}</div></div>${scheduleFields(1)}<button class="secondary optional-toggle" data-action="toggleSecond" aria-expanded="${state.secondEnabled}">${state.secondEnabled?'2순위 일정 닫기':'다른 희망 일정도 추가하기 (선택)'}</button>${state.secondEnabled?`<div class="divider"></div>${scheduleFields(2)}<button class="back" data-action="clearSecond">2순위 선택 취소</button>`:''}${footer('다음','schedule')}`;
if(state.step==='contact'){
s+=`<button class="back" data-back="schedule">← 일정 선택으로</button><h1 class="page-title">연락받으실 정보를 알려주세요.</h1><p class="muted">필요한 항목만 간단히 입력합니다.</p>`;
if(state.category==='yacht')s+=yachtPlace();if(state.category==='heli')s+=heliPlace();
s+=(settings.locations||[]).filter(l=>l.category===state.category).map(l=>`<section class="info"><strong>${escapeHTML(l.name)} · ${l.status==='confirmed'?'확정 안내 장소':'후보 · 미확정'}</strong><div class="muted">${escapeHTML(l.address)}${l.parking?'<br>주차: '+escapeHTML(l.parking):''}${l.contact?'<br>현장 연락: '+escapeHTML(l.contact):''}</div>${l.mapUrl?`<a href="${escapeHTML(l.mapUrl)}" target="_blank" rel="noopener noreferrer">지도 보기</a>`:''}</section>`).join('');
s+=`<div class="fields"><div><label class="sectionlabel" for="name" style="display:block">성함</label><input class="field" id="name" maxlength="60" placeholder="성함" value="${escapeHTML(state.name)}" autocomplete="name" /></div><div><label class="sectionlabel" for="phone" style="display:block">휴대전화 번호</label><input class="field" id="phone" type="tel" inputmode="tel" maxlength="20" placeholder="010-0000-0000" autocomplete="tel" value="${escapeHTML(state.phone)}" /></div></div>`;
if(['visit','trunk'].includes(state.category))s+=`<label for="place" class="sectionlabel" style="display:block">희망 세팅 장소</label><input id="place" maxlength="300" class="field" placeholder="호텔명 또는 주소·지역" value="${escapeHTML(state.place)}"/><p class="micro">정확한 주소를 모르시면 지역·건물명만 입력하셔도 됩니다.</p>`;
s+=`<label for="notes" class="sectionlabel" style="display:block">특이사항 (선택)</label><textarea id="notes" maxlength="1500" class="field" placeholder="추가 요청사항이 있으면 적어주세요.">${escapeHTML(state.notes)}</textarea><label class="inline-check"><input id="consent" type="checkbox" ${state.consent?'checked':''}/><span>상담을 위한 개인정보 수집·이용에 동의합니다.<span class="micro consent-note">${settings.accepting?escapeHTML(settings.privacyController)+' · 보유기간 '+escapeHTML(settings.retentionDays)+'일':'접수 준비 중입니다. 실제 개인정보를 입력하지 마세요.'}</span></span></label><details><summary>개인정보 수집·이용 안내</summary><div class="detail-body">${escapeHTML(settings.privacyText||'운영자가 개인정보 안내를 준비하고 있습니다.')}</div></details><details class="request-summary"><summary>선택 내용 확인</summary><div class="detail-body">${escapeHTML(choiceName())}<br>${escapeHTML(displayChosenPrice())}<br>1순위 ${escapeHTML(dateLabel(state.firstDate)+' '+state.firstTime)}${state.secondDate?'<br>2순위 '+escapeHTML(dateLabel(state.secondDate)+' '+state.secondTime):''}</div></details>${footer(submitting?'저장 중…':state.complete?'이미 접수된 상담입니다':'상담 신청하기','contact',submitting||state.complete||!apiReady||!settings.accepting,settings.accepting?'': '접수 준비 중 · 대표번호로 문의해 주세요.')}`;
}
if(['review','done'].includes(state.step)){
if(state.step==='review')s+=`<button class="back" data-back="contact">← 입력 내용 수정</button><h1 class="page-title">신청 내용을 확인해 주세요.</h1>`;else s+=`<div style="text-align:center;padding:24px 0 8px"><div style="color:#278854;font-size:38px">✓</div><h1 class="page-title">상담 접수 완료</h1><p class="muted">접수번호 ${escapeHTML(state.receipt)}</p></div>`;
const fields=[['상품',catName()],['선택',choiceName()],['안내 가격',displayChosenPrice()],['성함',state.name],['번호',state.phone],['1순위',dateLabel(state.firstDate)+' '+state.firstTime],['2순위',state.secondDate?dateLabel(state.secondDate)+' '+state.secondTime:'미선택'],...(['visit','trunk'].includes(state.category)?[['장소',state.place]]:[]),['특이사항',state.notes||'없음']];
s+=`<section class="info"><dl>${fields.map(([a,b])=>`<div class="summary"><dt>${escapeHTML(a)}</dt><dd>${escapeHTML(b)}</dd></div>`).join('')}</dl></section><p class="micro">상담 신청은 예약 확정이 아닙니다. 담당자가 가능 일정을 확인한 뒤 별도 안내합니다.</p>`;
if(state.step==='done')s+=`<p class="muted">${escapeHTML(settings.completionText||'신청 내용이 저장되었습니다. 고객 문자 발송은 선택사항입니다.')}</p>${footer('내 문자 앱으로 상담 내용 보내기','done')}<button class="secondary" style="width:100%;margin-top:10px" data-action="restart">새 상담 신청</button>`;
else s+=footer('상담 신청 완료 화면 보기','review');
}
if(state.step==='sms')s+=`<h1 class="page-title">문자 발송 미리보기</h1><p class="muted">고객 본인의 휴대폰에서 담당자에게 보낼 문자입니다.</p><div class="info"><strong>받는 사람: ${escapeHTML(settings.smsNumber)}</strong></div><div class="message">${escapeHTML(smsText())}</div><p class="micro">문자 앱의 본문 자동 입력은 기기·운영체제·문자 앱에 따라 달라질 수 있습니다. 자동 전송은 하지 않습니다.</p><div class="btnrow" style="margin-top:16px"><button class="primary" data-action="openSms">휴대폰 문자 앱 열기</button><button class="secondary" data-action="copySms">내용 복사</button></div><button class="back" data-back="done">← 완료 화면으로 돌아가기</button>`;
s+=`<p class="micro" style="text-align:center;margin-top:26px">대표번호 ${escapeHTML(settings.mainNumber)} · <a href="tel:${settings.mainNumber.replace(/[^0-9]/g,'')}">전화하기</a><br><a href="/privacy.html">개인정보 안내</a><br><button type="button" class="pwa-install-link" data-pwa-install><img src="/assets/icon-192.png" width="20" height="20" alt="">모먼트링크 앱 설치</button></p></div></main>`;
return s;
}
function smsText(){if(settings.manualSmsTemplate){const tokens={receipt:state.receipt||'',name:state.name,phone:state.phone,selection:choiceName(),price:displayChosenPrice(),first:dateLabel(state.firstDate)+' '+state.firstTime,second:state.secondDate?dateLabel(state.secondDate)+' '+state.secondTime:'',place:state.place,notes:state.notes||'없음'};return settings.manualSmsTemplate.replace(/\{(receipt|name|phone|selection|price|first|second|place|notes)\}/g,(_,key)=>tokens[key]);}return `[모먼트링크 프로포즈 상담 신청]\n접수번호: ${state.receipt||''}\n성함: ${state.name}\n번호: ${state.phone}\n상품: ${catName()}\n선택: ${choiceName()}\n가격: ${displayChosenPrice()}\n1순위: ${dateLabel(state.firstDate)} ${state.firstTime}${state.secondDate?'\n2순위: '+dateLabel(state.secondDate)+' '+state.secondTime:''}${['visit','trunk'].includes(state.category)?'\n장소: '+state.place:''}\n특이사항: ${state.notes||'없음'}\n위 내용으로 상담 부탁드립니다.`}
function capture(){for(const k of ['name','phone','place','notes','firstDate','secondDate']){const n=document.getElementById(k);if(n)state[k]=n.value}const c=$('#consent');if(c)state.consent=c.checked}
function render(){if(location.hash.startsWith('#admin'))return;if(state.selection&&(!getProduct()?.visible||getProduct()?.salePaused||!getPack()))state.selection=null;$('#app').innerHTML=`<div class="shell">${top()}${customer()}</div>`}
// History stores only public navigation choices. Contact details and dates stay in memory.
let navigationFlow=crypto.randomUUID(),navigationDepth=0,returningToRoot=false;
function navigationEntry(){return {flow:navigationFlow,depth:navigationDepth,step:state.step,category:state.category,sub:state.sub,selection:state.selection?{...state.selection}:null,optionIds:[...state.optionIds]};}
function rememberStep(){if(!location.hash.startsWith('#admin'))history.replaceState({momentLink:navigationEntry()},'',location.href);}
function showStep(x){state.step=x;state.formError='';render();window.scrollTo({top:0,behavior:'instant'});}
function setStep(x){
 rememberStep();
 if(x!==state.step){navigationDepth++;state.step=x;history.pushState({momentLink:navigationEntry()},'',location.href);}
 showStep(x);
}
function previousStep(fallback){capture();rememberStep();if(navigationDepth>0)history.back();else showStep(fallback);}
function resetNavigation(){
 if(navigationDepth>0){returningToRoot=true;history.go(-navigationDepth);}
 else{navigationFlow=crypto.randomUUID();navigationDepth=0;showStep('category');rememberStep();}
}
window.addEventListener('popstate',event=>{
 if(location.hash.startsWith('#admin'))return;
 capture();const entry=event.state?.momentLink;
 if(returningToRoot){returningToRoot=false;navigationFlow=crypto.randomUUID();navigationDepth=0;showStep('category');rememberStep();return;}
 if(!entry)return;
 // A finished/reloaded flow's forward entries cannot resurrect cleared inputs.
 if(entry.flow!==navigationFlow){if(entry.depth>0){returningToRoot=true;history.go(-entry.depth);}else{navigationDepth=0;navigationFlow=entry.flow;showStep('category');}return;}
 navigationDepth=entry.depth;
 Object.assign(state,{category:entry.category,sub:entry.sub,selection:entry.selection,optionIds:entry.optionIds||[]});
 let step=entry.step;
 if(['schedule','contact'].includes(step)&&!state.selection)step='products';
 if(step==='contact'&&(!state.firstDate||!state.firstTime))step='schedule';
 if(['done','sms'].includes(step)&&!state.complete)step='category';
 showStep(step);
});
function initializeNavigation(){
 if(location.hash.startsWith('#admin'))return;
 const previous=history.state?.momentLink;
 if(previous?.depth>0){navigationDepth=previous.depth;returningToRoot=true;history.go(-previous.depth);}
 else rememberStep();
}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v}
function formError(message){state.formError=message;render();document.querySelector('[role=alert]')?.scrollIntoView({block:'nearest'});return false}
async function refreshCatalog(){try{const r=await fetch('/api/catalog',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();catalog=data.products;catalogVersion=data.version;settings={...settingDefaults,...data.settings};apiReady=true;}catch{apiReady=false;settings.accepting=false;}render();}
async function submit(){
 if(submitting||state.complete)return;
 if(!navigator.onLine)return formError('오프라인입니다. 신청이 저장되지 않았습니다. 연결 후 다시 시도해 주세요.');
 if(!apiReady||!settings.accepting)return formError('상담 접수 준비 중입니다. 대표번호로 문의해 주세요.');
 requestKey ||= crypto.randomUUID();submitting=true;render();
 const submittedSnapshot={product:structuredClone(getProduct()),package:structuredClone(getPack()),options:structuredClone(selectedOptions())};
 const submittedFields=Object.fromEntries(['category','sub','selection','optionIds','firstDate','firstTime','secondDate','secondTime','secondEnabled','name','phone','place','notes','consent'].map(key=>[key,structuredClone(state[key])]));
 try {const preferences=[{date:state.firstDate,time:state.firstTime}];if(state.secondDate)preferences.push({date:state.secondDate,time:state.secondTime});
 const r=await fetch('/api/consultations',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({catalogVersion,productId:state.selection.id,packageId:state.selection.packId,optionIds:state.optionIds,category:state.category,person:state.name,phone:state.phone,preferences,place:state.place,notes:state.notes,consent:state.consent,consentVersion:settings.consentVersion})});const data=await r.json();
 if(!r.ok){if(['CATALOG_CHANGED','CONSENT_CHANGED','IDEMPOTENCY_CONFLICT'].includes(data.error)){requestKey='';await refreshCatalog();state.consent=false;}throw Error(data.message||'접수하지 못했습니다. 다시 시도해 주세요.');}
 Object.assign(state,submittedFields);state.submitted=submittedSnapshot;state.receipt=data.receipt;state.complete=true;submitting=false;setStep('done');
 }catch(e){submitting=false;formError(e.message||'통신 오류입니다. 저장 여부를 확인할 수 없습니다. 같은 내용으로 다시 시도하면 중복 접수되지 않습니다.');}
}
document.addEventListener('click',async ev=>{
 if(location.hash.startsWith('#admin'))return;
 const btn=ev.target.closest('button');if(!btn||submitting)return;
 if(btn.dataset.category){state.category=btn.dataset.category;if(state.category==='heli')for(const key of ['firstTime','secondTime'])if(!['오전','오후','시간 무관'].includes(state[key]))state[key]='';state.sub='sail';state.selection=null;state.openDetails=[];state.complete=false;requestKey='';setStep('products');return;}
 if(btn.dataset.sub){state.sub=btn.dataset.sub;state.selection=null;state.optionIds=[];rememberStep();render();return;}
 if(btn.dataset.select){const[id,packId]=btn.dataset.select.split(':');state.selection={id,packId};state.optionIds=[];state.complete=false;rememberStep();render();return;}
 if(btn.dataset.time){capture();const[i,t]=btn.dataset.time.split(':');if(i==='1')state.firstTime=t;else state.secondTime=t;render();return;}
 if(btn.dataset.back){previousStep(btn.dataset.back);return;}
 if(btn.dataset.next){const a=btn.dataset.next;
  if(a==='start')return setStep('category');if(a==='products'){if(state.selection)return setStep('schedule');return;}
  if(a==='schedule'){capture();if(!state.firstDate||!state.firstTime)return formError('1순위 날짜와 시간대를 선택해 주세요.');if(!validDate(state.firstDate)||state.firstDate<localToday())return formError('오늘 이후의 올바른 날짜를 선택해 주세요.');if(state.secondDate&&(!validDate(state.secondDate)||state.secondDate<localToday()))return formError('2순위 날짜를 확인해 주세요.');if(state.secondDate===state.firstDate&&state.secondTime===state.firstTime)return formError('2순위는 다른 날짜 또는 시간으로 선택해 주세요.');if(state.secondDate&&!state.secondTime)return formError('2순위 시간을 선택하거나 일정을 비워 주세요.');return setStep('contact');}
  if(a==='contact'){capture();if(!getPack()||!getProduct()?.visible||getProduct()?.salePaused)return formError('상품을 다시 선택해 주세요.');state.phone=state.phone.replace(/[\s-]/g,'');if(!state.name.trim())return formError('성함을 입력해 주세요.');if(!/^01[016789]\d{7,8}$/.test(state.phone))return formError('휴대전화 번호를 확인해 주세요.');if(['visit','trunk'].includes(state.category)&&!state.place.trim())return formError('희망 장소나 지역을 입력해 주세요.');if(!state.consent)return formError('개인정보 수집·이용 안내를 확인해 주세요.');return submit();}
  if(a==='done'&&state.complete)return setStep('sms');
 }
 const a=btn.dataset.action;
 if(a==='recommend'){state.selection={id:'recommend',packId:'recommend'};state.optionIds=[];state.complete=false;rememberStep();render();}
 if(a==='clearSecond'||a==='toggleSecond'){capture();state.secondEnabled=a==='toggleSecond'?!state.secondEnabled:false;if(!state.secondEnabled){state.secondDate='';state.secondTime='';}render();}
 if(a==='restart'){Object.assign(state,{step:'category',category:null,selection:null,firstDate:'',secondDate:'',firstTime:'',secondTime:'',name:'',phone:'',place:'',notes:'',consent:false,complete:false,secondEnabled:false,formError:'',receipt:'',submitted:null,openDetails:[]});requestKey='';state.optionIds=[];resetNavigation();}
 if(a==='copySms'){try{await navigator.clipboard.writeText(smsText());alert('문자 내용을 복사했습니다.');}catch{alert('내용을 직접 선택해 복사해 주세요.');}}
 if(a==='openSms'){const dest=settings.smsNumber.replace(/\D/g,''),platform=(/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))?'&':'?';location.href=`sms:${dest}${platform}body=${encodeURIComponent(smsText())}`;}
});
document.addEventListener('toggle',ev=>{const id=ev.target.dataset?.detail;if(!id)return;state.openDetails=state.openDetails.filter(x=>x!==id);if(ev.target.open)state.openDetails.push(id);},true);
document.addEventListener('input',ev=>{const k=ev.target.id;if(['name','phone','place','notes','firstDate','secondDate'].includes(k))state[k]=ev.target.value;if(k==='consent')state.consent=ev.target.checked;});
document.addEventListener('change',ev=>{const el=ev.target;if(el.dataset.option||el.dataset.optionNone){
 const options=getPack()?.options||[],selected=options.find(o=>o.id===el.dataset.option),group=selected?.group||el.dataset.optionNone;
 state.optionIds=state.optionIds.filter(id=>id!==selected?.id&&!(group&&options.some(o=>o.id===id&&o.group===group)));
 if(selected&&el.checked&&(!selected.requiresOptionId||state.optionIds.includes(selected.requiresOptionId)))state.optionIds.push(selected.id);
 state.optionIds=state.optionIds.filter(id=>{const o=options.find(x=>x.id===id);return o&&(!o.requiresOptionId||state.optionIds.includes(o.requiresOptionId));});
 rememberStep();render();
 [...document.querySelectorAll('[data-option],[data-option-none]')].find(input=>selected?input.dataset.option===selected.id:input.dataset.optionNone===group)?.focus({preventScroll:true});
 return;
}if(el.id==='exactTime1'||el.id==='exactTime2'){capture();if(el.id==='exactTime1')state.firstTime=el.value;else state.secondTime=el.value;render();}if(el.id==='secondDate'){state.secondDate=el.value;if(!el.value)state.secondTime='';render();}});
window.addEventListener('beforeunload',e=>{if(state.step!=='category'&&!state.complete&&(state.name||state.phone)){e.preventDefault();e.returnValue='';}});
function route(){document.querySelector('meta[name=robots]').content=location.hash.startsWith('#admin')?'noindex,nofollow':'index,follow';if(location.hash.startsWith('#admin'))window.MomentLinkAdmin.mount();else{window.MomentLinkAdmin.clear();if(!history.state?.momentLink){navigationFlow=crypto.randomUUID();navigationDepth=0;showStep('category');rememberStep();}refreshCatalog();render();}}
window.addEventListener('hashchange',route);
window.addEventListener('online',()=>{if(!apiReady&&!location.hash.startsWith('#admin')&&!submitting){capture();refreshCatalog();}});
initializeNavigation();
route();
})();
