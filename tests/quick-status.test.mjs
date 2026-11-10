import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function harness(){
 const requests=[],stages=[],initializations=[],accepted=[],elements={};let composerDirty=false,confirmationError='일정·장소 확정과 입금 확인을 모두 체크해 주세요.';
 const el=()=>({dataset:{},textContent:'',innerHTML:'',value:'',checked:false,disabled:false,hidden:true,setAttribute(k,v){this[k]=v;},focus(){},querySelector(){return null;}});
 for(const id of ['quickStatus','quickStatusTrigger','quickStatusMenu','quickStatusFeedback','requestStatus','requestAssignee','requestContacted','requestSaveFeedback','requestHistory','messageComposer','requestNote'])elements['#'+id]=el();
 const fieldset=el(),saveButton=el();elements['#requestStatusEditor']={...el(),querySelector:s=>s==='fieldset'?fieldset:saveButton};
 elements['#requestNote'].value='저장 전 합성 메모';elements['#requestAssignee'].value='unsaved-assignee';elements['#requestContacted'].checked=true;
 elements['.reservation-heading [data-ml=reservationFocus]']=el();
 const confirmation={booking:{date:'2099-11-21',time:'15:00',amount:249000,place:'합성 장소',scheduleConfirmed:true,paymentConfirmed:true},drafts:{confirmed:'합성 예약 안내'},approved:true};
 const composer={isBusy:()=>false,isDirty:()=>composerDirty,clear(){},init:item=>initializations.push(item),openStage:(stage,message)=>stages.push({stage,message}),confirmation(){if(confirmationError)throw Error(confirmationError);return confirmation;},acceptConfirmation(item){accepted.push(item);composerDirty=false;elements['#messageComposer']=el();}};
 const context=vm.createContext({window:{MomentLinkComposer:composer,MomentLinkSound:()=>({reset(){},stop(){}}),MomentLinkDirectBooking:()=>({close(){}}),addEventListener(){}},document:{title:'test',hidden:false,querySelector:s=>elements[s]||null,getElementById:id=>elements['#'+id],addEventListener(){}},location:{hash:'#admin'},navigator:{onLine:true},AbortController,Date,console,setTimeout:()=>1,clearTimeout(){},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data}),reject}))});
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 vm.runInContext(source.replace('window.MomentLinkAdmin={mount,clear};',`window.MomentLinkAdmin={mount,clear};window.test={saveQuickStatus,requestStatusEntries,getDetail:()=>detail,setDetail:x=>detail=x};user={id:'synthetic',role:'admin'};render=()=>{};`),context);
 const item={id:'synthetic',version:3,status:'new',assignee:null,contacted:false,communication:{}};
 context.window.test.setDetail({item,notes:[],history:[]});
 return {api:context.window.test,item,elements,requests,stages,initializations,accepted,confirmation,fieldset,setComposerDirty:v=>composerDirty=v,setConfirmationError:v=>confirmationError=v};
}

test('quick change saves only status, blocks duplicate clicks and preserves other edited fields',async()=>{
 const h=await harness();h.setComposerDirty(true);
 const saving=h.api.saveQuickStatus('consulting');
 assert.equal(h.elements['#quickStatusFeedback'].dataset.state,'saving');assert.equal(h.fieldset.disabled,true);assert.equal(h.elements['#messageComposer'].inert,true);
 await h.api.saveQuickStatus('hold');assert.equal(h.requests.length,1);
 assert.equal(h.requests[0].options.method,'PATCH');assert.deepEqual(JSON.parse(h.requests[0].options.body),{version:3,status:'consulting'});
 h.requests[0].resolve({item:{...h.item,version:4,status:'consulting'}});await saving;
 assert.equal(h.api.getDetail().item.status,'consulting');assert.equal(h.api.getDetail().item.version,4);assert.equal(h.initializations.length,1);
 assert.match(h.elements['#quickStatusFeedback'].textContent,/상담중 상태로 저장했습니다/);
 assert.match(h.elements['#requestStatus'].innerHTML,/value="consulting" selected/);
 assert.equal(h.elements['#requestNote'].value,'저장 전 합성 메모');assert.equal(h.elements['#requestAssignee'].value,'unsaved-assignee');assert.equal(h.elements['#requestContacted'].checked,true);
 assert.match(h.elements['#requestSaveFeedback'].textContent,/아직 저장하지 않았습니다/);assert.equal(h.fieldset.disabled,false);assert.equal(h.elements['#messageComposer'].inert,false);
});

test('missing confirmation details open the booking fields with the exact reason and do not save',async()=>{
 const h=await harness();await h.api.saveQuickStatus('new');await h.api.saveQuickStatus('confirmed');
 assert.equal(h.requests.length,0);assert.equal(h.stages[0].stage,'confirmed');assert.match(h.stages[0].message,/입금 확인/);assert.equal(h.api.getDetail().item.status,'new');assert.match(h.elements['#quickStatusFeedback'].textContent,/입금 확인/);
 assert.equal(h.elements['#quickStatusFeedback'].dataset.state,'error');assert.equal(h.accepted.length,0);
 await h.api.saveQuickStatus('closed');assert.equal(h.requests.length,0,'legacy closed state cannot be chosen');
 h.setComposerDirty(true);await h.api.saveQuickStatus('cancelled');assert.equal(h.requests.length,0);assert.match(h.elements['#quickStatusFeedback'].textContent,/먼저 저장/);
});

test('confirmation saves the validated booking once and checks the confirmed status without losing other edits',async()=>{
 const h=await harness();h.setConfirmationError('');h.setComposerDirty(true);
 const saving=h.api.saveQuickStatus('confirmed');await h.api.saveQuickStatus('confirmed');
 assert.equal(h.requests.length,1);
 assert.deepEqual(JSON.parse(h.requests[0].options.body),{version:3,status:'confirmed',confirmation:h.confirmation});
 const saved={...h.item,version:4,status:'confirmed',communication:{booking:h.confirmation.booking,drafts:h.confirmation.drafts,reservation:{source:'manual'}}};
 h.requests[0].resolve({item:saved});await saving;
 assert.equal(h.api.getDetail().item.status,'confirmed');assert.equal(h.accepted.length,1);assert.equal(h.accepted[0],saved);
 assert.match(h.elements['#quickStatus'].outerHTML,/aria-checked="true"[^>]*data-quick-status="confirmed"/);
 assert.match(h.elements['#requestStatus'].innerHTML,/value="confirmed" selected/);
 assert.match(h.elements['.reservation-heading [data-ml=reservationFocus]']['aria-label'],/확정됨/);
 assert.match(h.elements['.reservation-heading [data-ml=reservationFocus]'].innerHTML,/class="admin-action-text">예약 수정<\/span>/);
 assert.match(h.elements['#quickStatusFeedback'].textContent,/확정 예약 목록/);
 assert.equal(h.elements['#requestNote'].value,'저장 전 합성 메모');assert.equal(h.elements['#requestAssignee'].value,'unsaved-assignee');assert.equal(h.elements['#requestContacted'].checked,true);
 assert.equal(h.elements['#messageComposer'].inert,false);assert.equal(h.fieldset.disabled,false);
 await h.api.saveQuickStatus('confirmed');assert.equal(h.requests.filter(x=>x.options.method==='PATCH').length,1);
});

test('rejected confirmation keeps the previous status and does not mark a booking confirmed',async()=>{
 const h=await harness();h.setConfirmationError('');const saving=h.api.saveQuickStatus('confirmed');
 h.requests[0].resolve({message:'다른 직원이 변경했습니다.'},409);await saving;
 assert.equal(h.api.getDetail().item.status,'new');assert.equal(h.accepted.length,0);assert.equal(h.elements['#quickStatusFeedback'].dataset.state,'error');assert.equal(h.fieldset.disabled,false);
 assert.match(h.elements['#quickStatusFeedback'].textContent,/다른 직원/);
});

test('failed saves keep the existing status and show a retryable result',async()=>{
 for(const kind of ['conflict','network']){
  const h=await harness(),saving=h.api.saveQuickStatus('awaiting_payment');
  if(kind==='conflict')h.requests[0].resolve({message:'다른 직원이 변경했습니다.'},409);else h.requests[0].reject(Error('offline'));
  await saving;assert.equal(h.api.getDetail().item.status,'new');assert.equal(h.elements['#quickStatusFeedback'].dataset.state,'error');assert.equal(h.fieldset.disabled,false);assert.equal(h.elements['#quickStatusTrigger'].disabled,false);
 }
});

test('late save responses cannot overwrite a different consultation',async()=>{
 const h=await harness(),saving=h.api.saveQuickStatus('hold');const next={item:{...h.item,id:'another'},notes:[],history:[]};h.api.setDetail(next);
 h.requests[0].resolve({item:{...h.item,version:4,status:'hold'}});await saving;assert.equal(h.api.getDetail(),next);assert.equal(h.initializations.length,0);
});

test('confirmed bookings can reopen while completed/cancelled bookings stay protected',async()=>{
 const h=await harness(),r={...h.item,status:'confirmed',communication:{reservation:{}}};
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.requestStatusEntries(r))),[['new','접수중'],['initial_unreachable','최초연락안됨'],['consulting','상담중'],['no_response','답변없음'],['awaiting_payment','입금대기'],['confirmed','확정'],['hold','보류'],['closed','이벤트 완료'],['cancelled','취소']]);
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.requestStatusEntries({...r,status:'cancelled'}))),[['cancelled','취소']]);
});
