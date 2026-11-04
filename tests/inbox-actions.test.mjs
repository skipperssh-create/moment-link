import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';

async function harness(){
 const requests=[],elements={},el=()=>({value:'',checked:false,dataset:{},textContent:'',innerHTML:'',disabled:false,focus(){},setAttribute(){},querySelector(){return null;}});
 for(const id of ['inboxListing','listStatusFeedback','requestNote','requestNoteFeedback','requestNotes','requestStatus','requestAssignee','requestContacted'])elements['#'+id]=el();
 const save=el();elements['#requestNoteEditor']={...el(),querySelector:()=>save};
 elements['#requestNote'].value='고객 요청\n합성 메모';elements['#requestStatus'].value='hold';elements['#requestAssignee'].value='unsaved-assignee';elements['#requestContacted'].checked=true;
 const context=vm.createContext({crypto:{randomUUID},window:{MomentLinkComposer:{isBusy:()=>false,isDirty:()=>true,clear(){}},MomentLinkSound:()=>({reset(){},stop(){}}),MomentLinkDirectBooking:()=>({close(){}}),addEventListener(){}},document:{title:'test',hidden:false,querySelector:s=>elements[s]||null,querySelectorAll:()=>[],getElementById:id=>elements['#'+id],addEventListener(){}},location:{hash:'#admin'},navigator:{onLine:true},AbortController,Date,console,setTimeout:()=>1,clearTimeout(){},fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,reject,resolve:(data,status=200)=>resolve({ok:status<400,status,json:async()=>data})}))});
 const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
 vm.runInContext(source.replace('window.MomentLinkAdmin={mount,clear};',`window.test={saveListStatus,saveNote,get:()=>({items,counts,detail,dirty,busy}),set:item=>{items=[item];detail={item,notes:[],history:[]};counts={all:1,new:1};}};user={id:'synthetic',role:'admin'};inboxListing=()=>'';render=()=>{};`),context);
 const item={id:'synthetic',person:'합성 고객',version:3,status:'new',assignee:null,contacted:false,communication:{}};context.window.test.set(item);
 return {api:context.window.test,item,elements,requests,save};
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
 assert.equal(h.api.get().items[0].status,'new');assert.equal(h.api.get().counts.new,1);assert.equal(h.elements['#listStatusFeedback'].dataset.state,'error');
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
