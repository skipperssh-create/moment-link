import {audit} from '../server/security.mjs';

export function normalizeVisitVideo(products){return products.map(p=>{
 if(p.id!=='visit'||p.category!=='visit')return p;
 return {...p,packages:p.packages.map(pk=>{
  if(!['light','all'].includes(pk.id))return pk;
  const options=(pk.options||[]).filter(o=>!['video-letter','video-letter-usb','video-usb','usb'].includes(o.id));
  if(pk.id==='light')options.push({id:'video-letter',name:'영상편지 제작',amount:30000});
  options.push({id:'usb',name:'소장용 USB',amount:10000,...(pk.id==='light'?{requiresOptionId:'video-letter'}:{})});
  // Remove only the superseded USB-price sentence; keep other operational notes.
  const note=pk.note.replace(/영상편지 USB 희망 시\s*10,000원 추가[.。]?\s*/g,'').replace(/^\s*[·/]\s*/,'').trim();
  return {...pk,options,note};
 })};
});}
export async function migrateVisitVideo(tx){
 const draft=(await tx.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft' FOR UPDATE")).rows[0];
 if((await tx.query('SELECT version FROM moment_link.migrations WHERE version=7')).rows.length)return;
 const published=(await tx.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
 if(!draft||!published)throw Error('Catalog must be seeded before migrating video options');
 const nextDraft=normalizeVisitVideo(draft.data),nextPublished=normalizeVisitVideo(published.products);
 const changedDraft=JSON.stringify(nextDraft)!==JSON.stringify(draft.data),changedPublished=JSON.stringify(nextPublished)!==JSON.stringify(published.products);
 if(changedDraft)await tx.query("UPDATE moment_link.config SET data=$1,version=version+1,updated_at=now() WHERE id='catalog_draft'",[JSON.stringify(nextDraft)]);
 if(changedPublished)await tx.query('INSERT INTO moment_link.catalog_versions(version,products) VALUES($1,$2)',[published.version+1,JSON.stringify(nextPublished)]);
 if(changedDraft||changedPublished)await audit(tx,null,'catalog.visit_video.updated','catalog',{migration:7,version:published.version+Number(changedPublished)});
 await tx.query('INSERT INTO moment_link.migrations(version) VALUES(7)');
}
