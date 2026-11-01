/* Shared browser/server pricing. Calendar dates are Korean event dates, not device timestamps. */
(() => {
'use strict';
// Verified against KASI calendar tables and KASA's 2027 calendar announcement.
// Includes the 2026 public-holiday additions. Sources and maintenance: docs/PRICING_CALENDAR.md.
const calendars={
 2026:{'01-01':'신정','02-16':'설 연휴','02-17':'설날','02-18':'설 연휴','03-01':'삼일절','03-02':'삼일절 대체공휴일','05-01':'노동절','05-05':'어린이날','05-24':'부처님오신날','05-25':'부처님오신날 대체공휴일','06-03':'전국동시지방선거','06-06':'현충일','07-17':'제헌절','08-15':'광복절','08-17':'광복절 대체공휴일','09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴','10-03':'개천절','10-05':'개천절 대체공휴일','10-09':'한글날','12-25':'성탄절'},
 2027:{'01-01':'신정','02-06':'설 연휴','02-07':'설날','02-08':'설 연휴','02-09':'설날 대체공휴일','03-01':'삼일절','05-01':'노동절','05-03':'노동절 대체공휴일','05-05':'어린이날','05-13':'부처님오신날','06-06':'현충일','07-17':'제헌절','07-19':'제헌절 대체공휴일','08-15':'광복절','08-16':'광복절 대체공휴일','09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴','10-03':'개천절','10-04':'개천절 대체공휴일','10-09':'한글날','10-11':'한글날 대체공휴일','12-25':'성탄절','12-27':'성탄절 대체공휴일'}
};
const yachtPlace='한국해양대학교 요트면허시험장 앞 주차장';
const yachtAddress='부산광역시 영도구 태종로 727';
const yachtRoute='정문 진입 → 해안도로 → 요트면허시험장 앞 주차장. 도착 후 대기해 주세요.';
const policy='주중 월~목 / 주말 금~일·공휴일 전날·당일 (대체공휴일 포함)';
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const holiday=date=>calendars[date.slice(0,4)]?.[date.slice(5)];
function dayRate(date){
 if(!validDate(date))return {rate:null,label:'행사 날짜를 선택해 주세요.'};
 const next=new Date(Date.parse(date)+86400000).toISOString().slice(0,10),day=new Date(date).getUTCDay();
 if(holiday(date))return {rate:'weekend',label:'주말 요금 · '+holiday(date)};
 if(holiday(next))return {rate:'weekend',label:'주말 요금 · '+holiday(next)+' 전날'};
 if([0,5,6].includes(day))return {rate:'weekend',label:'주말 요금 · '+['일','월','화','수','목','금','토'][day]+'요일'};
 if(!calendars[date.slice(0,4)]||!calendars[next.slice(0,4)])return {rate:null,label:'해당 연도 공휴일 확인 필요 · 금액을 직접 입력해 주세요.'};
 return {rate:'weekday',label:'주중 요금 · '+['일','월','화','수','목','금','토'][day]+'요일'};
}
function quote(r,date){
 if(!validDate(date))return {amount:null,label:'행사 날짜를 선택해 주세요.'};
 const price=r.snapshot?.price||{},pack=r.snapshot?.package||{};
 const optionAmount=price.optionAmount??(r.snapshot?.options||[]).reduce((sum,o)=>sum+(o.amount||0),0);
 const recorded=price.dateOverrides?.find(x=>x.date===date)?.override;
 const rule=pack.datePrices?.find(x=>x.date===date);
 // Stored dateOverrides already include options. Package datePrices are base prices.
 if(recorded||rule){const amount=recorded?recorded.amount:rule.amount===null?null:rule.amount+optionAmount;return {amount,label:'날짜별 지정 요금'+(amount===null?' · 금액 확인 필요':'')};}
 const rated=r.category==='yacht'?dayRate(date):{rate:null,label:''};
 if(price.weekday===price.weekend)return {amount:Number.isInteger(price.weekday)?price.weekday:null,label:'동일 요금'+(rated.rate?' · '+rated.label:'')};
 if(!rated.rate)return {amount:null,label:r.category==='yacht'?rated.label:'금액을 직접 확인해 주세요.'};
 const amount=Number.isInteger(price[rated.rate])?price[rated.rate]:null;
 return {...rated,amount,label:rated.label+(amount===null?' · 금액 확인 필요':'')};
}
function location(settings={}){return [settings.yachtAddress||yachtAddress,settings.yachtPlace||yachtPlace].join(', ');}
globalThis.MomentLinkPricing=Object.freeze({quote,dayRate,validDate,location,yachtPlace,yachtAddress,yachtRoute,policy,calendarYears:Object.freeze(Object.keys(calendars))});
})();
