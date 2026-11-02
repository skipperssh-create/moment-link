import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../notification-sound.js',import.meta.url),'utf8');
function harness(supported=true){
 const players=[],attempts=[],timers=new Map();let id=0;
 const document={hidden:false};
 const window=supported?{Audio:class{
  constructor(src){this.src=src;this.currentTime=0;this.pauses=0;players.push(this);}
  pause(){this.pauses++;}
  play(){return new Promise((resolve,reject)=>attempts.push({resolve,reject}));}
 }}:{};
 vm.runInNewContext(source,{window,document,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 return {sound:window.MomentLinkSound(),players,attempts,timers,document};
}

test('natural voice is opt-in, uses one local audio element and never queues duplicates',()=>{
 const h=harness(),p=h.players[0];h.sound.notify();assert.equal(h.attempts.length,0);
 assert.equal(p.src,'/assets/moment-new-consultation.mp3');assert.equal(p.preload,'none');
 h.sound.toggle();assert.ok(h.sound.state().enabled);assert.equal(h.attempts.length,1);
 h.sound.notify();assert.equal(h.attempts.length,1);p.onplaying();p.onended();
 p.currentTime=3.4;h.sound.notify();assert.equal(p.currentTime,0);assert.equal(h.attempts.length,2);assert.equal(h.players.length,1);
 h.sound.toggle();assert.equal(h.sound.state().enabled,false);assert.equal(h.timers.size,0);assert.ok(p.pauses>0);
 h.sound.notify();assert.equal(h.attempts.length,2);
});

test('preview does not enable alerts; hidden screens and logout stop playback',()=>{
 const h=harness(),p=h.players[0];h.sound.preview();assert.equal(h.sound.state().enabled,false);p.onended();
 h.document.hidden=true;h.sound.preview();assert.equal(h.attempts.length,1);
 h.document.hidden=false;h.sound.toggle();h.sound.stop();assert.ok(h.sound.state().enabled);assert.equal(h.sound.state().playing,false);
 h.sound.notify();h.sound.reset();assert.equal(h.sound.state().enabled,false);assert.equal(h.sound.state().playing,false);assert.equal(h.timers.size,0);assert.equal(p.onended,null);
});

test('blocked, failed, stalled and unsupported audio provide recoverable state',async()=>{
 const h=harness(),p=h.players[0];h.sound.toggle();h.attempts[0].reject(Error('NotAllowedError'));await Promise.resolve();
 assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/차단/);
 h.sound.toggle();p.onerror();assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/불러오지 못/);
 h.sound.toggle();[...h.timers.values()][0].fn();assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/지연/);
 h.sound.toggle();p.onplaying();assert.equal([...h.timers.values()][0].ms,15000);[...h.timers.values()][0].fn();assert.match(h.sound.state().error,/멈췄/);
 h.sound.toggle();p.onplaying();p.onended();assert.equal(h.sound.state().error,'');assert.ok(h.sound.state().enabled);
 const unsupported=harness(false);unsupported.sound.toggle();unsupported.sound.preview();assert.equal(unsupported.sound.state().supported,false);assert.equal(unsupported.attempts.length,0);
});

test('stopped playback callbacks and rejected promises cannot disable a later alert',async()=>{
 const h=harness(),p=h.players[0];h.sound.toggle();const staleError=p.onerror,staleEnd=p.onended;
 h.sound.stop();h.sound.notify();staleError();staleEnd();h.attempts[0].reject(Error('AbortError'));await Promise.resolve();
 assert.ok(h.sound.state().enabled);assert.ok(h.sound.state().playing);assert.equal(h.sound.state().error,'');
 h.sound.reset();h.attempts[1].reject(Error('AbortError'));await Promise.resolve();assert.equal(h.sound.state().error,'');assert.equal(h.timers.size,0);
});
