import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../admin.js',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function menuPlacement('),source.indexOf('function fitPopup(')),context);
const place=context.menuPlacement;

test('left-hand detail status menu stays inside the screen',()=>{
 const box=place({left:70,right:166,top:500,bottom:544},{left:0,top:0,width:768,height:850},208,390);
 assert.equal(box.left,12);
 assert.ok(box.top>=12&&box.top+box.maxHeight<=838);
});

test('menus fit folded, unfolded, landscape and keyboard-reduced viewports',()=>{
 for(const width of [280,320,360,390,600,690,768,844,1024,1440])for(const height of [180,320,390,740,844,1024]){
  for(const left of [0,12,width/2,width-96])for(const top of [-100,12,height/2,height-44,height+100]){
   const box=place({left,right:left+96,top,bottom:top+44},{left:0,top:0,width,height},208,390);
   assert.ok(box.left>=12&&box.left+box.width<=width-12+.01,JSON.stringify({width,height,left,top,box}));
   assert.ok(box.top>=12&&box.top+box.maxHeight<=height-12+.01,JSON.stringify({width,height,left,top,box}));
  }
 }
});

test('zoomed visual viewport offsets and wide assignee menus are respected',()=>{
 const v={left:90,top:160,width:200,height:300};
 const box=place({left:100,right:420,top:330,bottom:374},v,360,240);
 assert.equal(box.width,176);
 assert.ok(box.left>=102&&box.left+box.width<=278);
 assert.ok(box.top>=172&&box.top+box.maxHeight<=448);
});

test('short viewports scroll the menu rather than forcing a minimum overflow height',()=>{
 const box=place({left:20,right:110,top:28,bottom:72},{left:0,top:0,width:320,height:130},208,390);
 assert.ok(box.maxHeight<100);
 assert.ok(box.top+box.maxHeight<=118);
});

function popupHarness(topLayer=true){
 const context=vm.createContext({window:{visualViewport:{width:320,height:740}},document:{documentElement:{clientWidth:305}},innerHeight:740});
 vm.runInContext(source.slice(source.indexOf('function menuPlacement('),source.indexOf('function repositionOpenMenus(')),context);
 let open=false,shown=0,hidden=0;
 const menu={style:{},hidden:false,scrollHeight:430,parentElement:{getBoundingClientRect:()=>({left:36,top:440})},get offsetWidth(){return Number.parseFloat(this.style.width);},setAttribute(){},matches:()=>open};
 if(topLayer){menu.showPopover=()=>{open=true;shown++;};menu.hidePopover=()=>{open=false;hidden++;};}
 const trigger={getBoundingClientRect:()=>({left:36,right:128,top:440,bottom:484,width:92})};
 return {context,menu,trigger,state:()=>({open,shown,hidden})};
}

test('menu reflow reuses the top layer, and closing allows a clean reopen',()=>{
 const h=popupHarness();h.context.fitPopup(h.trigger,h.menu);h.context.fitPopup(h.trigger,h.menu);
 assert.deepEqual(h.state(),{open:true,shown:1,hidden:0});
 assert.equal(h.menu.style.position,'fixed');
 h.context.hidePopup(h.menu);h.context.hidePopup(h.menu);
 assert.deepEqual(h.state(),{open:false,shown:1,hidden:1});assert.equal(h.menu.hidden,true);
 h.menu.hidden=false;h.context.fitPopup(h.trigger,h.menu);
 assert.deepEqual(h.state(),{open:true,shown:2,hidden:1});
});

test('older browsers retain a clamped absolute-position fallback',()=>{
 const h=popupHarness(false);h.context.fitPopup(h.trigger,h.menu);
 assert.equal(Number.parseFloat(h.menu.style.left)+36,12);
 assert.ok(Number.parseFloat(h.menu.style.top)+440>=12);
 h.context.hidePopup(h.menu);assert.equal(h.menu.hidden,true);
});

test('wide assignee menu uses the content viewport rather than covering the scrollbar',()=>{
 const h=popupHarness();h.trigger.getBoundingClientRect=()=>({left:20,right:500,top:440,bottom:484,width:480});
 h.context.fitPopup(h.trigger,h.menu,240,true);
 assert.match(h.menu.style.width,/281px/);
 assert.match(h.menu.style.width,/100%/);
 assert.ok(!h.menu.style.left.includes('100vw'));
});
