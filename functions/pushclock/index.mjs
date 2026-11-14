import {parseTriggerDelivery} from './triggers.mjs';

// This function is a clock only. It never reads bookings or receives push/DB keys.
export function createClock({env=process.env,request=fetch,now=Date.now}={}){
 return {async fetch(req){
  if(req.method!=='POST'||new URL(req.url).pathname!=='/tick')return new Response('Not found',{status:404});
  const parsed=await parseTriggerDelivery(req);
  if(!parsed.ok)return new Response('Unauthorized',{status:401});
  const invocation=parsed.invocation;
  if(invocation.type!=='schedule'||invocation.trigger.name!=='moment-link-unread-2min'||!Number.isFinite(Date.parse(invocation.data.scheduledAt))||Math.abs(now()-Date.parse(invocation.data.scheduledAt))>300000)return new Response('Invalid tick',{status:400});
  if(env.PUSH_CLOCK_ENABLED!=='true')return Response.json({enabled:false});
  if(!env.PUSH_REPEAT_SECRET||env.PUSH_REPEAT_SECRET.length<32)return new Response('Not configured',{status:503});
  try{
   const res=await request('https://link.teamboatn.com/api/cron/consultation-alerts',{method:'POST',headers:{Authorization:'Bearer '+env.PUSH_REPEAT_SECRET},redirect:'error',signal:AbortSignal.timeout(55000)});
   // No retry of this invocation; delivery claims and the two-failure limit live on the app server.
   if(!res.ok)return new Response('Tick unavailable',{status:502});
   const result=await res.json();return Response.json({ok:true,sent:result.sent,failed:result.failed});
  }catch{return new Response('Tick unavailable',{status:502});}
 }};
}
export default createClock();
