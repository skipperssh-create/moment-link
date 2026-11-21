/* Local parsing only: pasted customer text never leaves this authenticated form until saved. */
(() => {
'use strict';
const normalizePhone=value=>{
 const s=String(value||'').replace(/[^\d+]/g,'').replace(/^(?:\+82|0082)0?/,'0');
 return /^01[016789]\d{7,8}$/.test(s)?s:'';
};
const fees={general:50000,visit:40000};
function parse(text){
 const raw=String(text||'').replace(/\r\n?/g,'\n').trim();
 const matches=[...raw.matchAll(/(?<!\d)(?:01[016789][ \t.-]*\d{3,4}[ \t.-]*\d{4}|(?:\+82|0082)[ \t.-]*1[016789][ \t.-]*\d{3,4}[ \t.-]*\d{4})(?!\d)/g)];
 const phones=[...new Set(matches.map(m=>normalizePhone(m[0])).filter(Boolean))];
 const nameMatch=raw.match(/(?:^|\n|[ \t])(?:신청자|성함|고객명|이름)\s*[:：]\s*([^\n,;]+)/);
 let person=nameMatch?nameMatch[1].replace(/\s*(?:휴대폰|전화번호|연락처|이메일)\s*[:：].*$/,'').trim():'';
 if(!person&&phones.length===1){
  const line=raw.split('\n').find(l=>l.includes(matches[0]?.[0]));
  const rest=((line||'').replace(matches[0]?.[0]||'\0','').trim()||(raw.split('\n').length===2?raw.replace(matches[0]?.[0]||'\0',''):'')).replace(/^\s*\d+[.)]\s*/,'').trim();
  if(/^[가-힣]{2,10}(?:\s*님)?$/.test(rest)&&!['상담입니다','상담','문의','출장'].includes(rest))person=rest.replace(/\s*님$/,'');
 }
 if(person.length>80)person='';
 // Referral classification follows the sender's "출장N." prefix, not a word in the customer's request.
 const kind=/^(?:\s*\d+[.)]\s*)?출장\s*\d*\s*[.)：:]?/m.test(raw)?'visit':'general';
 const category=kind==='visit'?'visit':/트렁크/.test(raw)?'trunk':/헬기/.test(raw)?'heli':/요트/.test(raw)?'yacht':'undecided';
 return {phone:phones.length===1?phones[0]:'',phones,person,kind,category,amount:fees[kind],memo:raw};
}
globalThis.MomentLinkLoveHunter={parse,normalizePhone,fees,today:()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())};
})();
