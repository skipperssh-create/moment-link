import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {database,closeDatabase} from '../server/database.mjs';
import {catalogSchema} from '../server/validation.mjs';
import {audit} from '../server/security.mjs';

const folder=new URL('../deployment-assets/helicopter-20261102/',import.meta.url);
export async function importHelicopterPhotos(db){
 return db.transaction(async tx=>{
  const draft=(await tx.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft' FOR UPDATE")).rows[0];
  if((await tx.query('SELECT version FROM moment_link.migrations WHERE version=8')).rows.length)return {alreadyApplied:true};
  const published=(await tx.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const actor=(await tx.query("SELECT id FROM moment_link.admin_users WHERE username='boatn' AND role='admin' AND active=true")).rows[0];
  if(!draft||!published||!actor)throw Error('Existing catalog and owner are required for helicopter photo replacement');
  const {assets}=JSON.parse(await readFile(new URL('manifest.json',folder),'utf8'));
  if(assets.length!==9||new Set(assets.map(a=>a.id)).size!==9)throw Error('Expected nine distinct helicopter photos');
  const media=assets.map(a=>({url:'/api/media/'+a.id,alt:a.alt}));
  const replace=products=>{
   if(products.filter(p=>p.id==='heli'&&p.category==='heli').length!==1)throw Error('Helicopter product not found');
   return products.map(p=>p.id==='heli'?{...p,photo:media[0].url,media}:p);
  };
  const nextDraft=replace(draft.data),nextPublished=replace(published.products);
  catalogSchema.parse(nextDraft);catalogSchema.parse(nextPublished);
  for(const a of assets){
   if(!/^heli-0[1-9]\.webp$/.test(a.file))throw Error('Unexpected photo filename');
   const bytes=await readFile(new URL(a.file,folder));
   if(bytes.length>1048576||createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw Error('Photo integrity mismatch');
   await tx.query('INSERT INTO moment_link.media(id,mime,bytes,alt,actor_id) VALUES($1,$2,$3,$4,$5)',[a.id,'image/webp',bytes,a.alt,actor.id]);
  }
  // Preserve every non-photo field, separate unpublished drafts and historical snapshots.
  await tx.query("UPDATE moment_link.config SET data=$1,version=version+1,updated_at=now() WHERE id='catalog_draft'",[JSON.stringify(nextDraft)]);
  await tx.query('INSERT INTO moment_link.catalog_versions(version,products) VALUES($1,$2)',[published.version+1,JSON.stringify(nextPublished)]);
  await audit(tx,null,'catalog.heli_photos.replaced','heli',{migration:8,photoCount:9,version:published.version+1});
  await tx.query('INSERT INTO moment_link.migrations(version) VALUES(8)');
  return {version:published.version+1,photoCount:9};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.VERCEL_ENV!=='production'||process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Photo import target mismatch');
 try{console.log('Helicopter photo import:',JSON.stringify(await importHelicopterPhotos(database())));}
 finally{await closeDatabase();}
}
