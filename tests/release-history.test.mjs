import test from 'node:test';
import assert from 'node:assert/strict';
import {ownershipFixture} from './ownership-fixture.mjs';
test('deployed release history requires staff login and stays idempotent',async t=>{
 const f=await ownershipFixture();t.after(()=>f.pg.close());
 assert.equal((await f.request('admin/releases',null)).status,401);
 const first=await f.request('admin/releases');assert.equal(first.status,200,JSON.stringify(first.data));assert.ok(first.data.items.length>=142);assert.ok(first.data.items.some(x=>x.id===first.data.currentId));
 const again=await f.request('admin/releases','counselor-a');assert.equal(again.status,200);assert.equal(again.data.items.length,first.data.items.length);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM moment_link.consultations')).rows[0].n,0);
});
