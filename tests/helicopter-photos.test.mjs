import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {importHelicopterPhotos} from '../scripts/import-heli-photos.mjs';

test('helicopter replacement preserves product fields, unpublished edits and history; runs only once',async()=>{
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)};
 try{
  await migrate(db);
  await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role) VALUES($1,'boatn','unused-test-hash','admin')",[randomUUID()]);
  const before=(await db.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const draft=structuredClone(before.products);draft.find(p=>p.id==='heli').short='Unpublished helicopter edit';draft[0].name='Unpublished yacht edit';
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='catalog_draft'",[JSON.stringify(draft)]);
  const result=await importHelicopterPhotos(db);assert.equal(result.photoCount,9);
  const after=(await db.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0];
  const strip=xs=>xs.map(p=>p.id==='heli'?(({photo,media,...rest})=>rest)(p):p);
  assert.deepEqual(strip(after.products),strip(before.products));
  assert.deepEqual(strip((await db.query("SELECT data FROM moment_link.config WHERE id='catalog_draft'")).rows[0].data),strip(draft));
  assert.deepEqual((await db.query('SELECT products FROM moment_link.catalog_versions WHERE version=$1',[before.version])).rows[0].products,before.products);
  const {assets}=JSON.parse(await readFile(new URL('../deployment-assets/helicopter-20261102/manifest.json',import.meta.url),'utf8'));
  for(const a of assets){const m=(await db.query('SELECT mime,bytes FROM moment_link.media WHERE id=$1',[a.id])).rows[0];assert.equal(m.mime,'image/webp');assert.equal(createHash('sha256').update(m.bytes).digest('hex'),a.sha256);}
  const heli=after.products.find(p=>p.id==='heli');assert.equal(heli.media.length,9);assert.equal(heli.photo,heli.media[0].url);
  heli.photo='https://example.com/future-admin-edit.webp';
  await db.query('UPDATE moment_link.catalog_versions SET products=$1 WHERE version=$2',[JSON.stringify(after.products),after.version]);
  assert.deepEqual(await importHelicopterPhotos(db),{alreadyApplied:true});
  assert.deepEqual((await db.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version DESC LIMIT 1')).rows[0],after);
 }finally{await pg.close();}
});
