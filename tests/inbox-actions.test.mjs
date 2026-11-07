import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

async function harness(){
 const requests=[],elements={},el=()=>({value:'',checked:false,dataset:{},textContent:'',innerHTML:'',disabled:false,focus(){},setAttribute(){},querySelector(){return null;}});
 for(const id of ['inboxListing','listStatusFeedback','requestNote','requestNoteFeedback','requestNotes','requestStatus','requestAssignee','requestContacted'])elements['#'+id]=el();
 const save=el();elements['#requestNoteEditor']={...el(),querySelector:()=>save};
 const listFields={};for(const id of ['synthetic','other']){const field=el(),summary=el(),feedback=el(),button=el(),root={...el(),querySelector:s=>({'[data-list-note]':field,'[data-list-note-summary]':summary,'[data-ml=saveListNote]':button}[s]||null)};listFields[id]={field,summary,feedback,button,root};elements['[data-list-note-editor="'+id+'"]']=root;elements['[data-list-note-editor="'+id+'"] [data-list-note-feedback]']=feedback;}
 elements['#requestNote'].value='고객 요청\n합성 메모';elements['#requestStatus'].value='hold';elements['#requestAssignee'].value='unsaved-assignee';elements['#requestContacted'].checked=true;
 const context=vm.createContext({crypto:{randomUUID},window:{MomentLinkComposer:{isBusy:()=>false,isDirty:()=>true,clear(){}},MomentLinkSound:()=>({reset(){},stop(){}}),MomentLinkDirectBooking:()=>({close(){}}),addEventListener(){}},document:{title:'test',hidden:false,querySelector:s=>elements[s]||null,querySelectorAll:()=>[],getElementById:id=>elements['#'+id],addEventListener(){}},location:{hash:'#admin'},navigator:{onLine:true},AbortController,Date,console,setTimeout:()=>1,clearTimeout(){},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reject,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}))});
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 vm.runInContext(await readFile(new URL('../messages.js',import.meta.url),'utf8'),context);
 context.window.intentTest={};
 const exposed=source.replace('window.MomentLinkAdmin={mount,clear};','window.intentTest={reservationIntentAction,listCardActions,openReservationIntent,copyReservationIntent,setUser:value=>user=value};window.MomentLinkAdmin={mount,clear};');
 vm.runInContext(exposed.replace('window.MomentLinkAdmin={mount,clear};',`window.test={saveListStatus,saveNote,saveListNote,listNoteEditor,listNoteEditing,statusOrder:()=>Object.keys(statuses),draft:(id,text)=>listNoteDrafts.set(id,text),get:()=>({items,counts,detail,dirty,busy}),set:item=>{items=[item,{...item,id:'other'}];detail={item,notes:[],history:[]};counts={all:2,new:2};}};user={id:'synthetic',role:'admin'};inboxListing=()=>'';render=()=>{};`),context);
 const item={id:'synthetic',person:'합성 고객',version:3,status:'new',assignee:null,contacted:false,communication:{}};context.window.test.set(item);
 return {api:context.window.test,intent:context.window.intentTest,navigator:context.navigator,item,elements,requests,save,listFields};
}
test('list status persists once, refreshes counts, and blocks concurrent clicks',async()=>{
 const h=await harness(),saving=h.api.saveListStatus(h.item.id,'consulting');
 await h.api.saveListStatus(h.item.id,'hold');assert.equal(h.requests.length,1);
 assert.deepEqual(JSON.parse(h.requests[0].options.body),{version:3,status:'consulting'});
 h.requests[0].resolve({item:{...h.item,version:4,status:'consulting'}});
 await new Promise(r=>setImmediate(r));assert.equal(h.requests.length,2);
 h.requests[1].resolve({items:[{...h.item,version:4,status:'consulting'}],counts:{all:1,new:0,consulting:1}});await saving;
 assert.equal(h.api.get().items[0].status,'consulting');assert.equal(h.api.get().counts.consulting,1);assert.equal(h.api.get().busy,false);
 assert.match(h.elements['#listStatusFeedback'].textContent,/저장했습니다/);
});
test('conflicting list write keeps existing state and reports failure',async()=>{
 const h=await harness(),saving=h.api.saveListStatus(h.item.id,'awaiting_payment');h.requests[0].resolve({message:'충돌'},409);await saving;
 assert.equal(h.api.get().items[0].status,'new');assert.equal(h.api.get().counts.new,2);assert.equal(h.elements['#listStatusFeedback'].dataset.state,'error');
});
test('late list response cannot overwrite a replaced screen',async()=>{
 const h=await harness(),saving=h.api.saveListStatus(h.item.id,'hold');h.elements['#inboxListing']={};h.requests[0].resolve({item:{...h.item,status:'hold'}});await saving;
 assert.equal(h.api.get().items[0].status,'new');assert.equal(h.requests.length,1);
});
test('memo save preserves other edits, returns a visible saved note and blocks duplicates',async()=>{
 const h=await harness(),saving=h.api.saveNote();await h.api.saveNote();assert.equal(h.requests.length,1);
 const data=JSON.parse(h.requests[0].options.body);assert.ok(data.noteId);assert.equal(data.body,'고객 요청\n합성 메모');
 h.requests[0].resolve({note:{id:data.noteId,body:data.body,created_at:'2026-11-04T00:00:00Z'}});await saving;
 assert.equal(h.elements['#requestNote'].value,'');assert.equal(h.elements['#requestStatus'].value,'hold');assert.equal(h.elements['#requestAssignee'].value,'unsaved-assignee');assert.equal(h.elements['#requestContacted'].checked,true);assert.equal(h.api.get().dirty,true);
 assert.equal(h.api.get().detail.notes.length,1);assert.match(h.elements['#requestNotes'].innerHTML,/고객 요청\n합성 메모/);assert.match(h.elements['#requestNoteFeedback'].textContent,/저장되었습니다/);
});
test('unknown memo write result preserves text and reuses the same id on retry',async()=>{
 const h=await harness(),saving=h.api.saveNote();h.requests[0].reject(Error('offline'));await saving;
 assert.equal(h.elements['#requestNote'].value,'고객 요청\n합성 메모');assert.equal(h.elements['#requestNoteFeedback'].dataset.state,'error');
 const retry=h.api.saveNote(),first=JSON.parse(h.requests[0].options.body),second=JSON.parse(h.requests[1].options.body);assert.deepEqual(second,first);
 h.requests[1].resolve({note:{id:first.noteId,body:first.body,created_at:'2026-11-04T00:00:00Z'},replayed:true});await retry;assert.equal(h.api.get().detail.notes.length,1);
});

test('inline memo saves only its card and keeps other drafts across renders',async()=>{
 const h=await harness(),card=h.listFields.synthetic,other=h.listFields.other;
 card.field.value='창가 연출 요청\n합성 메모';other.field.value='아직 저장 안 한 다른 고객 메모';h.api.draft('other',other.field.value);
 const saving=h.api.saveListNote('synthetic');await h.api.saveListNote('synthetic');assert.equal(h.requests.length,1);
 const data=JSON.parse(h.requests[0].options.body);h.requests[0].resolve({note:{id:data.noteId,body:data.body,created_at:'2026-11-04T00:00:00Z'}});await saving;
 assert.equal(card.field.value,'');assert.equal(other.field.value,'아직 저장 안 한 다른 고객 메모');assert.equal(h.api.get().items[0].note_count,1);assert.match(card.summary.innerHTML,/창가 연출 요청/);assert.match(card.feedback.textContent,/저장되었습니다/);
 assert.match(h.api.listNoteEditor({...h.item,id:'other'}),/아직 저장 안 한 다른 고객 메모/);assert.equal(h.api.listNoteEditing(),true);assert.equal(h.api.get().dirty,false);
});

test('inline memo retry keeps one request id and preserves text until confirmed',async()=>{
 const h=await harness(),card=h.listFields.synthetic;card.field.value='재시도 메모';
 const saving=h.api.saveListNote('synthetic');h.requests[0].reject(Error('offline'));await saving;
 assert.equal(card.field.value,'재시도 메모');assert.match(h.api.listNoteEditor(h.item),/재시도 메모/);assert.equal(card.feedback.dataset.state,'error');
 const retry=h.api.saveListNote('synthetic'),first=JSON.parse(h.requests[0].options.body);assert.deepEqual(JSON.parse(h.requests[1].options.body),first);
 h.requests[1].resolve({note:{id:first.noteId,body:first.body,created_at:'2026-11-04T00:00:00Z'},replayed:true});await retry;
 assert.equal(h.api.get().items[0].note_count,1);assert.equal(h.api.listNoteEditing(),false);
});

test('inline memo ignores late responses and rejects blank text before writing',async()=>{
 const h=await harness(),card=h.listFields.synthetic;card.field.value='   ';await h.api.saveListNote('synthetic');assert.equal(h.requests.length,0);
 card.field.value='이동 전 작성 메모';const saving=h.api.saveListNote('synthetic'),data=JSON.parse(h.requests[0].options.body);
 h.elements['[data-list-note-editor="synthetic"]']={};h.requests[0].resolve({note:{id:data.noteId,body:data.body,created_at:'2026-11-04T00:00:00Z'}});await saving;
 assert.equal(h.api.get().items[0].latest_note,undefined);assert.equal(card.field.value,'이동 전 작성 메모');
});

test('contact states follow the consultation workflow order',async()=>{
 const h=await harness();assert.deepEqual(Array.from(h.api.statusOrder()),['new','initial_unreachable','consulting','no_response','awaiting_payment','confirmed','hold','closed','cancelled']);
});

test('booking intent SMS is available in every editable consultation state without booking details',async()=>{
 const h=await harness();
 for(const status of h.api.statusOrder()){
  const r={...h.item,status,phone:'01000000000'};
  const html=h.intent.reservationIntentAction(r),href=html.match(/href="([^"]+)"/)[1];
  assert.match(html,/예약 의사 확인 문자/);assert.match(href,/^sms:01000000000\?body=/);
  assert.match(decodeURIComponent(href.split('body=')[1]),/예약을 원하지 않으시면 답장/);
  assert.equal((h.intent.listCardActions(r,status==='confirmed').match(/data-reservation-intent=/g)||[]).length,1);
 }
 assert.equal(h.intent.reservationIntentAction({...h.item,phone:'01000000000?body=evil'}),'');
 assert.equal(h.intent.reservationIntentAction({...h.item,phone:'01000000000',can_edit:false}),'');
 h.intent.setUser({id:'staff',role:'counselor'});assert.equal(h.intent.reservationIntentAction({...h.item,phone:'01000000000',assignee:'other'}),'');
 assert.match(h.intent.reservationIntentAction({...h.item,phone:'01000000000',assignee:'staff'}),/sms:/);
 assert.equal(h.requests.length,0);
});

test('intent SMS opens the current customer URI synchronously without changing notes, status or sent records',async()=>{
 const h=await harness(),r={...h.item,phone:'01000000000',status:'no_response',person:'<합성 & 고객>'};h.api.set(r);
 let panel='',href='',prevented=false;const actions={insertAdjacentHTML:(where,html)=>{panel=html;}};
 const link={dataset:{reservationIntent:r.id},setAttribute:(name,value)=>{href=value;},closest:()=>actions},event={preventDefault(){prevented=true;}};
 const before=JSON.stringify(h.api.get());h.intent.openReservationIntent(link,event);
 assert.equal(prevented,false);assert.match(href,/^sms:01000000000\?body=/);assert.match(panel,/&lt;합성 &amp; 고객&gt;/);assert.match(panel,/readonly/);assert.match(panel,/문구 복사/);
 assert.equal(JSON.stringify(h.api.get()),before);assert.equal(h.elements['#requestNote'].value,'고객 요청\n합성 메모');assert.equal(h.requests.length,0);
 h.intent.setUser(null);h.intent.openReservationIntent(link,event);assert.equal(prevented,true);
});

test('intent message copy supports clipboard success and manual copy fallback',async()=>{
 const h=await harness();let copied='',selected=false;const field={value:'합성 문구',focus(){},select(){selected=true;}},feedback={textContent:''},panel={querySelector:s=>s==='[data-intent-body]'?field:feedback},button={closest:()=>panel};
 h.navigator.clipboard={writeText:async value=>{copied=value;}};await h.intent.copyReservationIntent(button);assert.equal(copied,'합성 문구');assert.match(feedback.textContent,/복사했습니다/);
 h.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.intent.copyReservationIntent(button);assert.equal(selected,true);assert.match(feedback.textContent,/복사 메뉴/);assert.equal(h.requests.length,0);
});
