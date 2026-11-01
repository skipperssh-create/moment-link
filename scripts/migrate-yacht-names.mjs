import {audit} from '../server/security.mjs';

const names={classic:'클래식(레오파드)요트',premium:'프리미엄(메가)요트',signature:'시그니처(리파리)요트'};
const rename=products=>products.map(product=>{
 const next={...product};
 if(names[next.id])next.name=names[next.id];
 if(next.id==='docked'&&typeof next.description==='string')next.description=next.description.replace(/PREMIUM/g,names.premium).replace(/SIGNATURE 요트/g,names.signature);
 return next;
});

// Runs inside the migration transaction. Keep drafts, old versions and booking snapshots intact.
export async function migrateYachtNames(tx){
 const draft=(await tx.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft' FOR UPDATE")).rows[0];
 if((await tx.query('SELECT version FROM moment_link.migrations WHERE version=4')).rows.length)return;
 const published=(await tx.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
 if(!draft||!published)throw Error('Catalog must be seeded before renaming yachts');
 const nextDraft=rename(draft.data),nextPublished=rename(published.products);
 const draftChanged=JSON.stringify(nextDraft)!==JSON.stringify(draft.data);
 const publishedChanged=JSON.stringify(nextPublished)!==JSON.stringify(published.products);
 if(draftChanged)await tx.query("UPDATE moment_link.config SET data=$1,version=version+1,updated_at=now() WHERE id='catalog_draft'",[JSON.stringify(nextDraft)]);
 if(publishedChanged)await tx.query('INSERT INTO moment_link.catalog_versions(version,products) VALUES($1,$2)',[published.version+1,JSON.stringify(nextPublished)]);
 if(draftChanged||publishedChanged)await audit(tx,null,'catalog.yacht_names.updated','catalog',{names,version:published.version+Number(publishedChanged),migration:4});
 await tx.query('INSERT INTO moment_link.migrations(version) VALUES(4)');
}
