import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

const titles={yacht:'요트 프로포즈',visit:'출장 프로포즈',trunk:'트렁크 프로포즈',heli:'헬기 프로포즈'};
export const GUIDE_VARIANTS=Object.keys(titles).flatMap(category=>(category==='trunk'?['office','visit']:['office']).flatMap(mode=>[false,true].map(video=>({category,mode,video,file:`guide/${category}${category==='trunk'&&mode==='visit'?'-visit':''}${video?'-video':''}-v1.html`}))));

// The controlled v1 template has no nested sections or nested data-mode divs.
// Remove unrelated markup at build time, so no script, preview or loading state can show it.
function filterBlocks(html,attribute,accept){
 const pattern=new RegExp('<(section|p|a|div|li)\\b([^>]*?)\\s'+attribute+'(?:="([^"]*)")?([^>]*)>([\\s\\S]*?)<\\/\\1>','g');
 while(new RegExp('\\s'+attribute+'(?:=|[ >])').test(html)){
  const next=html.replace(pattern,(_,tag,before,value,after,body)=>accept(value||'')?`<${tag}${before}${after}>${body}</${tag}>`:'');
  if(next===html)throw Error('Unsupported customer guide template block: '+attribute);
  html=next;
 }
 return html;
}
export async function customerGuidePages(){
 const template=await readFile(new URL('../templates/customer-guide-v1.html',import.meta.url),'utf8');
 return Object.fromEntries(GUIDE_VARIANTS.map(v=>{
  let html=filterBlocks(template,'data-for',value=>value.split(' ').includes(v.category));
  html=filterBlocks(html,'data-video',()=>v.video);
  html=filterBlocks(html,'data-mode',value=>v.category==='trunk'&&value===v.mode);
  const title=titles[v.category]+(v.category==='trunk'?(v.mode==='visit'?' · 출장':' · 사무실 방문'):'');
  html=html.replaceAll('{{title}}',title);
  return [v.file,html];
 }));
}
export async function writeCustomerGuides(directory){
 const pages=await customerGuidePages();
 for(const [file,html] of Object.entries(pages)){const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,html,'utf8');}
 return Object.keys(pages).length;
}
