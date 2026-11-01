import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {database,closeDatabase} from '../server/database.mjs';
import {seed} from '../server/seed.mjs';
export async function migrate(db){await db.transaction(async tx=>{for(const file of ['001_initial.sql','002_retention.sql']){const sql=await readFile(new URL('../db/'+file,import.meta.url),'utf8');if(tx.exec)await tx.exec(sql);else await tx.query(sql);}await seed(tx);});}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.MOMENT_LINK_DATABASE!=='true')throw Error('Explicit MOMENT_LINK_DATABASE=true required for the dedicated database');
 const db=database();
 try {await migrate(db);
  if(process.env.INITIAL_ADMIN_HASH){await db.query(`INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'admin',$2,'admin',false) ON CONFLICT(username) DO NOTHING`,[randomUUID(),process.env.INITIAL_ADMIN_HASH]);}
  console.log('MOMENT LINK schema and seed ready. Existing records preserved.');
 }finally{await closeDatabase();}
}
