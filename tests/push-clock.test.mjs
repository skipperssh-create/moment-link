import test from 'node:test';
import assert from 'node:assert/strict';
import {createClock} from '../functions/pushclock/index.mjs';
test('clock validates Neon provenance, trigger name, time and enabled state before one authenticated app request',async()=>{
 const when=Date.parse('2026-11-14T00:00:00Z'),payload={version:1,invocation_id:'synthetic-tick',trigger:{type:'schedule',id:'synthetic',name:'moment-link-unread-2min'},data:{scheduled_at:new Date(when).toISOString()}};
 let calls=0;const env={PUSH_CLOCK_ENABLED:'true',PUSH_REPEAT_SECRET:'synthetic-123456789012345678901234567890'};
 const clock=createClock({env,now:()=>when,request:async(url,options)=>{calls++;assert.equal(url,'https://link.teamboatn.com/api/cron/consultation-alerts');assert.equal(options.headers.Authorization,'Bearer '+env.PUSH_REPEAT_SECRET);assert.equal(options.redirect,'error');return Response.json({sent:0,failed:0});}});
 const req=(data=payload,header='synthetic-tick')=>new Request('https://synthetic.invalid/tick',{method:'POST',headers:{'content-type':'application/json',...(header?{'x-neon-trigger-invocation-id':header}:{})},body:JSON.stringify(data)});
 assert.equal((await clock.fetch(req(payload,''))).status,401);assert.equal((await clock.fetch(req(payload,'wrong'))).status,401);
 assert.equal((await clock.fetch(req({...payload,data:{scheduled_at:'invalid'}}))).status,400);
 assert.equal((await clock.fetch(req({...payload,data:{scheduled_at:'2020-01-01T00:00:00Z'}}))).status,400);
 assert.equal((await clock.fetch(req({...payload,trigger:{...payload.trigger,name:'unrelated'}}))).status,400);assert.equal(calls,0);
 assert.equal((await clock.fetch(req())).status,200);assert.equal(calls,1);
 env.PUSH_CLOCK_ENABLED='false';assert.equal((await clock.fetch(req())).status,200);assert.equal(calls,1);
 env.PUSH_CLOCK_ENABLED='true';const failed=createClock({env,now:()=>when,request:async()=>{calls++;throw Error('synthetic');}});
 assert.equal((await failed.fetch(req())).status,502);assert.equal(calls,2,'No automatic resend');
});
