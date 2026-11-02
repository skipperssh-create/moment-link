import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../notification-sound.js',import.meta.url),'utf8');
function harness(supported=true){
 const utterances=[],timers=new Map();let id=0,cancels=0,changes=0;
 const document={hidden:false},voices=[{lang:'en-US'},{lang:'ko-KR',localService:true}];
 const window=supported?{speechSynthesis:{getVoices:()=>voices,speak:u=>utterances.push(u),cancel:()=>cancels++},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}}:{};
 vm.runInNewContext(source,{window,document,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 const sound=window.MomentLinkSound(()=>changes++);
 return {sound,utterances,timers,document,voices,get cancels(){return cancels;},get changes(){return changes;}};
}
test('voice requires opt-in, speaks only generic Korean branding, and never queues duplicates',()=>{
 const h=harness();h.sound.notify();assert.equal(h.utterances.length,0);
 h.sound.toggle();assert.ok(h.sound.state().enabled);assert.equal(h.utterances.length,1);
 const u=h.utterances[0];assert.equal(u.text,'모먼트링크, 새로운 상담이 접수되었습니다.');assert.equal(u.voice,h.voices[1]);assert.equal(u.lang,'ko-KR');
 h.sound.notify();assert.equal(h.utterances.length,1);u.onstart();u.onend();
 h.sound.notify();assert.equal(h.utterances.length,2);
 h.sound.toggle();assert.equal(h.sound.state().enabled,false);assert.equal(h.cancels,1);assert.equal(h.timers.size,0);
 h.sound.notify();assert.equal(h.utterances.length,2);
});
test('preview does not enable alerts; hidden screens and logout stop speech',()=>{
 const h=harness();h.sound.preview();assert.equal(h.sound.state().enabled,false);h.utterances[0].onend();
 h.document.hidden=true;h.sound.preview();assert.equal(h.utterances.length,1);
 h.document.hidden=false;h.sound.toggle();h.sound.stop();assert.equal(h.cancels,1);assert.ok(h.sound.state().enabled);
 h.sound.notify();h.sound.reset();assert.equal(h.cancels,2);assert.equal(h.sound.state().enabled,false);assert.equal(h.timers.size,0);
});
test('blocked, failed and unsupported speech gives a recoverable status without pretending sound is enabled',()=>{
 const h=harness();h.sound.toggle();h.utterances[0].onerror({error:'not-allowed'});
 assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/재생하지 못/);
 h.sound.toggle();[...h.timers.values()][0].fn();assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/차단/);
 h.sound.toggle();h.utterances.at(-1).onstart();h.utterances.at(-1).onend();assert.equal(h.sound.state().error,'');assert.ok(h.sound.state().enabled);
 const unsupported=harness(false);unsupported.sound.toggle();unsupported.sound.preview();assert.equal(unsupported.sound.state().supported,false);assert.equal(unsupported.utterances.length,0);
});
