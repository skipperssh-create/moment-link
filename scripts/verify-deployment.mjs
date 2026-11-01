import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'https://moment-link-preview.vercel.app';
const results=[];
for(const [path,status] of [['/',200],['/api/catalog',200],['/api/admin/consultations',401],['/.env.local',404],['/CODEX_MASTER.md',404]]){
 const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(20000)});
 const item={path,status:r.status,expected:status,noindex:r.headers.get('x-robots-tag'),cache:r.headers.get('cache-control')};
 if(path==='/api/catalog'){const data=await r.json();item.version=data.version;item.products=data.products?.length;item.accepting=data.settings?.accepting;assert.equal(data.settings?.solapi,undefined);}
 if(path==='/api/admin/consultations'){const data=await r.json();item.error=data.error;assert.equal(data.error,'AUTH_REQUIRED');}
 results.push(item);assert.equal(r.status,status,path);
}
await mkdir('.local',{recursive:true});
await writeFile('.local/http-verification.json',JSON.stringify({base,checkedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results));
