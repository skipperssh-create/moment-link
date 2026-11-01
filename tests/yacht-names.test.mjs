import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import catalog from '../catalog.confirmed.json' with {type:'json'};

test('yacht name migration preserves prices, photos, unpublished edits and historical versions, and runs once',async()=>{
 const pg=new PGlite(),db={query:(sql,args)=>pg.query(sql,args),transaction:fn=>pg.transaction(fn)};
 try{
  await migrate(db);
  const legacy={classic:'CLASSIC',premium:'PREMIUM',signature:'SIGNATURE'};
  const previous=catalog.map(p=>({...p,...(legacy[p.id]?{name:legacy[p.id]}:{})}));
  const draft=structuredClone(previous);draft.find(p=>p.id==='classic').short='Unpublished edit';
  await db.query('DELETE FROM moment_link.migrations WHERE version=4');
  await db.query('UPDATE moment_link.catalog_versions SET products=$1 WHERE version=1',[JSON.stringify(previous)]);
  await db.query("UPDATE moment_link.config SET data=$1,version=9 WHERE id='catalog_draft'",[JSON.stringify(draft)]);
  await migrate(db);
  const versions=(await db.query('SELECT version,products FROM moment_link.catalog_versions ORDER BY version')).rows;
  assert.equal(versions.length,2);assert.deepEqual(versions[0].products,previous);
  assert.deepEqual(versions[1].products,catalog);
  const current=(await db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0];
  const expected=structuredClone(catalog);expected.find(p=>p.id==='classic').short='Unpublished edit';
  assert.deepEqual(current,{version:10,data:expected});
  // Future administrator edits must not be overwritten by subsequent deployments.
  current.data.find(p=>p.id==='classic').name='Future administrator name';
  await db.query("UPDATE moment_link.config SET data=$1 WHERE id='catalog_draft'",[JSON.stringify(current.data)]);
  await migrate(db);
  assert.deepEqual((await db.query("SELECT version,data FROM moment_link.config WHERE id='catalog_draft'")).rows[0],current);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM moment_link.catalog_versions')).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM moment_link.audit_logs WHERE action='catalog.yacht_names.updated'")).rows[0].n,1);
 }finally{await pg.close();}
});
