import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';

test('live counts require authentication, respect assignment and ignore expired/trash records beyond the first page',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://test.moment-link.invalid';
 try{
  await migrate(db);const adminId=randomUUID(),staffId=randomUUID(),password=randomUUID();
  for(const [id,name,role] of [[adminId,'refresh-admin','admin'],[staffId,'refresh-staff','counselor']])await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,name,await passwordHash(password),role]);
  const app=createApp({db,env:{APP_ORIGIN:origin}});
  const req=async(path,auth,body)=>{const r=await app(new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:auth}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),headers:r.headers};};
  const login=async username=>(await req('auth/login',null,{username,password})).headers.get('set-cookie').split(';')[0];
  const auth=await login('refresh-admin'),staff=await login('refresh-staff'),endpoint='admin/consultations/updates';
  assert.equal((await req(endpoint)).status,401);
  const baseline=await req(endpoint,auth);assert.equal(baseline.status,200);assert.equal(baseline.data.pending,0);assert.equal(baseline.data.arrivals,0);assert.equal(baseline.data.latestAt,null);
  const add=async({assigned=null,status='new',old=false,expired=false,trashed=false}={})=>{const id=randomUUID();await db.query(`INSERT INTO moment_link.consultations(id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,status,assignee,created_at,expires_at,deleted_at,delete_after)
   VALUES($1::uuid,$2,$1::text,$1::text,'합성 검수','01000000000','visit','visit','light','{}','[]','','','{}',$3,$4,now()-make_interval(days=>$5),now()+make_interval(days=>$6),CASE WHEN $7 THEN now() ELSE NULL END,CASE WHEN $7 THEN now()+interval '7 days' ELSE NULL END)`,[id,'ML-'+id,status,assigned,old?1:0,expired?-1:30,trashed]);};
  await add({old:true});await add({assigned:staffId});await add({assigned:staffId,status:'consulting'});
  for(let i=0;i<53;i++)await add();
  await add({expired:true,assigned:staffId});await add({trashed:true,assigned:staffId});
  const path=endpoint+'?since='+encodeURIComponent(baseline.data.checkedAt);
  const all=await req(path,auth);assert.equal(all.data.pending,55);assert.equal(all.data.arrivals,55);assert.ok(all.data.latestAt>baseline.data.checkedAt);assert.match(all.headers.get('cache-control'),/no-store/);
  assert.deepEqual(Object.keys(all.data).sort(),['arrivals','checkedAt','latestAt','pending']);
  const scoped=await req(path,staff);assert.equal(scoped.data.pending,1);assert.equal(scoped.data.arrivals,2);
  assert.equal((await req(endpoint+'?since='+encodeURIComponent(all.data.checkedAt),auth)).data.arrivals,0);
  assert.equal((await req(endpoint+'?since=not-a-date',auth)).status,400);
  await db.query('UPDATE moment_link.admin_users SET active=false WHERE id=$1',[staffId]);assert.equal((await req(path,staff)).status,401);
 }finally{await pg.close();}
});

async function browserHarness(){
 const listeners={},timers=new Map(),requests=[],sounds=[];let timerId=0;
 const element=()=>({textContent:'',hidden:false,disabled:false,classList:{toggle(){}},querySelector(){return element();}});
 const elements={'#inboxLive':element(),'#inboxLiveSummary':element(),'#inboxLiveTime':element()},document={title:'MOMENT LINK',hidden:false,querySelector:s=>elements[s]||null,addEventListener:(n,fn)=>{listeners[n]=fn;}};
 const composer={clear(){},isBusy:()=>false,isDirty:()=>false};
 const context=vm.createContext({window:{MomentLinkSound:()=>({state:()=>({}),reset(){sounds.push('reset');},stop(){sounds.push('stop');},notify(){sounds.push('new');}}),MomentLinkComposer:composer,MomentLinkDirectBooking:()=>({close(){},isOpen:()=>false}),addEventListener:(n,fn)=>{listeners[n]=fn;},scrollTo(){},scrollBy(){}},document,location:{hash:'#admin'},navigator:{onLine:true},AbortController,Date,console,confirm:()=>false,
  setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,options)=>new Promise((resolve,reject)=>{options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));requests.push({url,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data}),reject});})});
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 vm.runInContext(source.replace('window.MomentLinkAdmin={mount,clear};',`window.MomentLinkAdmin={mount,clear};window.test={live,refreshLive,suspendLive,scheduleLive,showNewInquiries,clear,setDetail:x=>detail=x,setBusy:x=>busy=x,setDirty:x=>dirty=x,setFilters:()=>{search='합성';requestStatus='closed';offset=50;},setUser:()=>user={id:'synthetic',role:'admin'},getDetail:()=>detail};render=()=>{};`),context);
 const api=context.window.test;api.setUser();return {api,document,context,listeners,timers,requests,elements,sounds};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('reservation restoration confirmation pauses list refresh until it closes',async()=>{
 const h=await browserHarness();h.elements['#restorationConfirmation']={};
 await h.api.refreshLive();h.api.scheduleLive();assert.equal(h.requests.length,0);assert.equal(h.timers.size,0);
 delete h.elements['#restorationConfirmation'];h.api.scheduleLive();assert.equal(h.timers.size,1);
 const running=h.api.refreshLive();h.requests[0].resolve({checkedAt:'2026-11-02T00:00:00.000Z',pending:1,arrivals:0});await running;
 assert.equal(h.api.live.pending,1);h.api.clear();
});
test('polling retains edited details, counts across filters, survives errors, pauses offline/hidden and stops on logout',async()=>{
 const h=await browserHarness(),{api,requests}=h;const detail={memo:'unsaved synthetic memo'};api.setDetail(detail);api.setDirty(true);api.setFilters();
 let running=api.refreshLive();assert.equal(requests.length,1);await api.refreshLive();assert.equal(requests.length,1,'no overlapping polls');
 requests[0].resolve({checkedAt:'2026-11-02T00:00:00.000Z',pending:2,arrivals:0});await running;
 assert.equal(api.getDetail(),detail);assert.ok([...h.timers.values()].some(t=>t.delay===30000));
 running=api.refreshLive();assert.ok(requests[1].url.includes('since='));requests[1].resolve({checkedAt:'2026-11-02T00:01:00.000Z',pending:3,arrivals:1});await running;
 assert.equal(api.live.arrivals,1);assert.match(h.document.title,/새 상담 1건/);assert.equal(requests.length,2,'detail never fetched or replaced');
 await api.showNewInquiries();assert.equal(api.getDetail(),detail,'cancel preserves edits');assert.equal(api.live.arrivals,1);
 running=api.refreshLive();requests[2].reject(Error('network'));await running;assert.match(api.live.error,/실패/);assert.equal(api.live.arrivals,1);assert.equal(api.live.checkedAt,'2026-11-02T00:01:00.000Z');
 h.document.hidden=true;h.listeners.visibilitychange();await api.refreshLive();assert.equal(requests.length,3);assert.equal(h.timers.size,0);
 h.document.hidden=false;h.context.navigator.onLine=false;h.listeners.offline();await api.refreshLive();assert.equal(requests.length,3);
 h.context.navigator.onLine=true;api.live.lastAttempt=0;h.listeners.online();requests[3].resolve({checkedAt:'2026-11-02T00:02:00.000Z',pending:4,arrivals:2});await tick();assert.equal(api.live.error,'');
 running=api.refreshLive();api.clear();requests[4].resolve({checkedAt:'2026-11-02T00:03:00.000Z',pending:99,arrivals:99});await running;
 assert.equal(api.live.arrivals,0);assert.equal(h.document.title,'MOMENT LINK');assert.equal(h.timers.size,0);await api.refreshLive();assert.equal(requests.length,5);
});
test('list refresh keeps the selected search/status/page and discards responses after navigation',async()=>{
 const h=await browserHarness();h.api.setFilters();h.elements['#inboxListing']={contains:()=>false,querySelectorAll:()=>[]};
 let running=h.api.refreshLive();h.requests[0].resolve({checkedAt:'2026-11-02T00:00:00.000Z',pending:1,arrivals:0});await tick();
 assert.match(h.requests[1].url,/offset=50/);assert.match(h.requests[1].url,/status=closed/);assert.match(h.requests[1].url,/q=%/);
 h.api.suspendLive();h.api.setDetail({memo:'new editor'});h.requests[1].resolve({items:[],counts:{new:99}});await running;
 assert.equal(h.elements['#inboxListing'].innerHTML,undefined,'stale list response ignored');assert.equal(h.api.getDetail().memo,'new editor');
});

test('expired authentication clears live counts and stops polling',async()=>{
 const h=await browserHarness();h.api.live.arrivals=3;h.api.live.since='2026-11-02T00:00:00.000Z';
 const running=h.api.refreshLive();h.requests[0].resolve({message:'Authentication required'},401);await running;
 assert.equal(h.api.live.arrivals,0);assert.equal(h.api.live.since,'');assert.equal(h.timers.size,0);assert.equal(h.document.title,'MOMENT LINK');
 await h.api.refreshLive();assert.equal(h.requests.length,1);
});

test('a failed first poll waits 30 seconds before retrying',async()=>{
 const h=await browserHarness();const running=h.api.refreshLive();h.requests[0].reject(Error('network unavailable'));await running;
 assert.equal(h.api.live.checkedAt,'');assert.ok([...h.timers.values()].some(t=>t.delay===30000));assert.ok(![...h.timers.values()].some(t=>t.delay===500));
});

test('voice cue ignores the initial list, repeated polls and removals, but notices a new request even when counts stay equal',async()=>{
 const h=await browserHarness();
 async function update(checkedAt,latestAt,arrivals){const running=h.api.refreshLive();h.requests.at(-1).resolve({checkedAt,latestAt,pending:arrivals,arrivals});await running;}
 await update('2026-11-02T01:00:00.000Z','2026-11-02T00:59:00.000Z',0);
 assert.deepEqual(h.sounds,[]);
 await update('2026-11-02T01:01:00.000Z','2026-11-02T01:00:30.000Z',1);
 assert.deepEqual(h.sounds,['new']);
 await update('2026-11-02T01:02:00.000Z','2026-11-02T01:00:30.000Z',1);
 await update('2026-11-02T01:03:00.000Z','2026-11-02T00:59:00.000Z',0);
 assert.deepEqual(h.sounds,['new']);
 await update('2026-11-02T01:04:00.000Z','2026-11-02T01:03:30.000Z',0);
 assert.deepEqual(h.sounds,['new','new']);
 h.document.hidden=true;h.listeners.visibilitychange();assert.equal(h.sounds.at(-1),'stop');
 h.api.clear();assert.equal(h.sounds.at(-1),'reset');
});
