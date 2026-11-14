import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
if(process.env.RUN_DB_MIGRATIONS==='true'){
 if(process.env.VERCEL_ENV!=='production'||process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Migration target mismatch');
 const r=spawnSync(process.execPath,['scripts/migrate.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
 const photos=spawnSync(process.execPath,['scripts/import-heli-photos.mjs'],{stdio:'inherit'});if(photos.status!==0)process.exit(photos.status||1);
}
// This release needs only the contact-state constraint and private memo index.
// Keep the broad seed/photo migrations behind their existing explicit flag.
if(process.env.VERCEL_ENV==='production'){
 if(process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Contact status migration requires the dedicated MOMENT LINK database');
 const {database,closeDatabase}=await import('../server/database.mjs');
 try{const db=database();for(const file of ['008_contact_status.sql','010_consultation_alerts.sql']){const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8');await db.transaction(tx=>tx.query(sql));}console.log('Contact and notification schemas ready. Existing consultation data preserved.');}
 finally{await closeDatabase();}
}
await import('./build.mjs');
