import {spawnSync} from 'node:child_process';
if(process.env.RUN_DB_MIGRATIONS==='true'){
 if(process.env.VERCEL_ENV!=='production'||process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Migration target mismatch');
 const r=spawnSync(process.execPath,['scripts/migrate.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
 const photos=spawnSync(process.execPath,['scripts/import-heli-photos.mjs'],{stdio:'inherit'});if(photos.status!==0)process.exit(photos.status||1);
}
await import('./build.mjs');
