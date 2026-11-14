import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {database,closeDatabase} from '../server/database.mjs';
import {seed} from '../server/seed.mjs';
import {migrateYachtNames} from './migrate-yacht-names.mjs';
import {migrateYachtLocation} from './migrate-yacht-location.mjs';
import {migrateVisitVideo} from './migrate-visit-video.mjs';
export async function migrate(db){await db.transaction(async tx=>{for(const file of ['001_initial.sql','002_retention.sql','003_communications.sql','006_trash.sql','007_payment_status.sql','008_contact_status.sql','010_consultation_alerts.sql']){const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8');if(tx.exec)await tx.exec(sql);else await tx.query(sql);}await seed(tx);await migrateYachtNames(tx);await migrateYachtLocation(tx);await migrateVisitVideo(tx);const photos=await readFile(new URL('../db/009_visit_photo_option.sql',import.meta.url),'utf8');if(tx.exec)await tx.exec(photos);else await tx.query(photos);});}
export async function bootstrapAdmin(db,hash){
 // A renamed administrator must never cause the initial account to be recreated.
 if(hash)await db.query(`INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) SELECT $1,'admin',$2,'admin',false WHERE NOT EXISTS(SELECT 1 FROM moment_link.admin_users) ON CONFLICT DO NOTHING`,[randomUUID(),hash]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Explicit MOMENT_LINK_DATABASE=true required for the dedicated database');
 const db=database();
 try {await migrate(db);
  await bootstrapAdmin(db,process.env.INITIAL_ADMIN_HASH);
  console.log('MOMENT LINK schema and seed ready. Existing records preserved.');
 }finally{await closeDatabase();}
}
