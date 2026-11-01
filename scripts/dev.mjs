import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/app.mjs';
import {APP_ICON_FILES,writeAppIcons} from './app-icons.mjs';
const origin='http://127.0.0.1:4173';
let localDb;
if(process.env.LOCAL_SYNTHETIC==='true'&&!process.env.VERCEL){
 const localPassword=process.env.LOCAL_TEST_PASSWORD;
 if(!localPassword||localPassword.length<8)throw Error('Set LOCAL_TEST_PASSWORD to a local-only password of at least 8 characters.');
 const {PGlite}=await import('@electric-sql/pglite');const pg=new PGlite();localDb={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)};
 const {migrate}=await import('./migrate.mjs');const {passwordHash}=await import('../server/security.mjs');const {randomUUID}=await import('node:crypto');
 await migrate(localDb);await localDb.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'local-admin',$2,'admin',false)",[randomUUID(),await passwordHash(localPassword)]);
 const settings=(await localDb.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
 await localDb.query("UPDATE moment_link.config SET data=$1 WHERE id='settings'",[JSON.stringify({...settings,accepting:true,privacyController:'합성 테스트 운영자',privacyContact:'합성 테스트',privacyText:'로컬 합성 데이터 검수 전용. 실제 개인정보 입력 금지.',retentionDays:1,consentVersion:'synthetic-v1'})]);
 console.log('SYNTHETIC LOCAL DATABASE ONLY. No external DB or notifications.');
}
const app=createApp({db:localDb,env:{...process.env,APP_ORIGIN:origin}});
await writeAppIcons(fileURLToPath(new URL('../assets/',import.meta.url)),await readFile(new URL('../assets/icon.svg',import.meta.url),'utf8'));
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json',txt:'text/plain'};
const allowed=new Set(['/','/index.html','/app.js','/styles.css','/admin.js','/messages.js','/message-ui.js','/pwa.js','/sw.js','/manifest.webmanifest','/assets/icon.svg','/robots.txt','/privacy.html','/privacy.js','/sitemap.xml']);
for(const name of APP_ICON_FILES)allowed.add('/assets/'+name);
createServer(async(req,res)=>{try{const url=new URL(req.url,origin);if(url.pathname.startsWith('/api/')){const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await app(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}else if(allowed.has(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.writeHead(200,{'Content-Type':types[file.split('.').pop()]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(new URL('../'+file,import.meta.url)));}else{res.writeHead(404);res.end('Not found');}}catch{res.writeHead(500);res.end('Server error');}}).listen(4173,'127.0.0.1',()=>console.log('MOMENT LINK '+origin));
