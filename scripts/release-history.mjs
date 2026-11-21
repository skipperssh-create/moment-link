import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),notes=JSON.parse(readFileSync(new URL('release-notes.json',root),'utf8')),history=JSON.parse(readFileSync(new URL('release-history-source.json',root),'utf8'));
const hash=createHash('sha256');for(const p of ['admin.js','server/app.mjs','styles.css','release-notes.json'])hash.update(readFileSync(new URL(p,root)));
const id=process.env.VERCEL_GIT_COMMIT_SHA||hash.digest('hex'),at=new Date().toISOString();
writeFileSync(new URL('release-history.json',root),JSON.stringify({current:{id,version:notes.version,commit:process.env.VERCEL_GIT_COMMIT_SHA||'',at,dateBasis:'버전 생성 시각',title:notes.title,changes:notes.changes}},null,2)+'\n');
