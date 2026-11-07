import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../notification-sound.js',import.meta.url),'utf8');
function harness(supported=true){
 const players=[],attempts=[],timers=new Map(),listeners={};let id=0;
 const document={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};
 const window=supported?{Audio:class{
  constructor(src){this.src=src;this.currentTime=0;this.pauses=0;players.push(this);}
  pause(){this.pauses++;}
  play(){return new Promise((resolve,reject)=>attempts.push({resolve,reject}));}
 }}:{};
 vm.runInNewContext(source,{window,document,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 return {sound:window.MomentLinkSound(),players,attempts,timers,document,gesture:(name='click',isTrusted=true,control=false)=>listeners[name]({isTrusted,target:{closest:()=>control?{}:null}})};
}

test('natural voice starts only after activation, uses one local audio element and never queues duplicates',()=>{
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
 const blocked=harness();blocked.sound.start();blocked.sound.notify();blocked.attempts[0].reject(Error('NotAllowedError'));await Promise.resolve();
 assert.equal(blocked.sound.state().enabled,true);assert.ok(blocked.sound.state().awaitingInteraction);assert.match(blocked.sound.state().error,/차단/);
 blocked.sound.notify();assert.equal(blocked.attempts.length,1);blocked.gesture();assert.equal(blocked.attempts.length,2);blocked.players[0].onplaying();blocked.players[0].onended();assert.ok(blocked.sound.state().enabled);assert.equal(blocked.sound.state().awaitingInteraction,false);
 const h=harness(),p=h.players[0];
 h.sound.toggle();p.onerror();assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/불러오지 못/);
 h.sound.toggle();[...h.timers.values()][0].fn();assert.equal(h.sound.state().enabled,false);assert.match(h.sound.state().error,/지연/);
 h.sound.toggle();p.onplaying();assert.equal([...h.timers.values()][0].ms,15000);[...h.timers.values()][0].fn();assert.match(h.sound.state().error,/멈췄/);
 h.sound.toggle();p.onplaying();p.onended();assert.equal(h.sound.state().error,'');assert.ok(h.sound.state().enabled);
 const unsupported=harness(false);unsupported.sound.toggle();unsupported.sound.preview();assert.equal(unsupported.sound.state().supported,false);assert.equal(unsupported.attempts.length,0);
});

test('authenticated start defaults to on without announcing a false arrival; reload or new session starts on again',()=>{
 const h=harness();assert.equal(h.sound.state().enabled,false);h.sound.start();assert.equal(h.sound.state().enabled,true);assert.equal(h.attempts.length,0);
 h.sound.start();assert.equal(h.attempts.length,0);h.sound.toggle();assert.equal(h.sound.state().enabled,false);
 h.sound.reset();h.sound.start();assert.equal(h.sound.state().enabled,true);assert.equal(h.attempts.length,0);
 const reopened=harness();reopened.sound.start();assert.equal(reopened.sound.state().enabled,true);assert.equal(reopened.attempts.length,0);
});

test('first trusted interaction primes silently and later arrivals reuse the same unmuted player',async()=>{
 const h=harness(),p=h.players[0];h.sound.start();h.gesture('click',false);h.gesture('click',true,true);assert.equal(h.attempts.length,0);
 h.gesture('keydown');assert.equal(h.attempts.length,1);assert.equal(p.muted,true);h.gesture();assert.equal(h.attempts.length,1);
 h.attempts[0].resolve();await Promise.resolve();assert.equal(p.muted,false);assert.equal(h.sound.state().playing,false);assert.ok(p.pauses>0);
 h.gesture();assert.equal(h.attempts.length,1);h.sound.notify();assert.equal(h.attempts.length,2);assert.equal(p.muted,false);p.onplaying();p.onended();
});

test('pending arrival survives silent priming, while logout and hidden pages cannot start stale playback',async()=>{
 const h=harness();h.sound.start();h.gesture();h.sound.notify();h.attempts[0].resolve();await Promise.resolve();assert.equal(h.attempts.length,2);h.players[0].onplaying();h.players[0].onended();
 h.sound.reset();h.sound.start();h.gesture();h.sound.reset();h.attempts[2].resolve();await Promise.resolve();assert.equal(h.sound.state().enabled,false);assert.equal(h.sound.state().playing,false);
 h.sound.start();h.document.hidden=true;h.gesture();h.sound.notify();assert.equal(h.attempts.length,3);
});

test('blocked gesture retries stop after two attempts without turning off the preference',async()=>{
 const h=harness();h.sound.start();h.gesture();h.attempts[0].reject(Error('NotAllowedError'));await Promise.resolve();h.gesture();h.attempts[1].reject(Error('NotAllowedError'));await Promise.resolve();h.gesture();h.sound.notify();h.gesture();assert.equal(h.attempts.length,2);assert.equal(h.sound.state().enabled,true);assert.equal(h.sound.state().awaitingInteraction,true);
});

test('stopped playback callbacks and rejected promises cannot disable a later alert',async()=>{
 const h=harness(),p=h.players[0];h.sound.toggle();const staleError=p.onerror,staleEnd=p.onended;
 h.sound.stop();h.sound.notify();staleError();staleEnd();h.attempts[0].reject(Error('AbortError'));await Promise.resolve();
 assert.ok(h.sound.state().enabled);assert.ok(h.sound.state().playing);assert.equal(h.sound.state().error,'');
 h.sound.reset();h.attempts[1].reject(Error('AbortError'));await Promise.resolve();assert.equal(h.sound.state().error,'');assert.equal(h.timers.size,0);
});
