#!/usr/bin/env node
/** Creates a NEW private repository only, using the operator's authenticated gh CLI. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const target=process.argv[2]||'skipperssh-create/moment-link';
if(!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(target))throw Error('Invalid owner/repository');
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',...opts});if(r.error)throw r.error;if(r.status!==0)throw Error((r.stderr||r.stdout||cmd+' failed').trim());return (r.stdout||'').trim();}
run('gh',['auth','status']);
const login=run('gh',['api','user','--jq','.login']);
if(login!==target.split('/')[0])throw Error('Authenticated owner mismatch. Verify intended account first.');
const found=spawnSync('gh',['repo','view',target,'--json','nameWithOwner'],{encoding:'utf8'});
if(found.status===0)throw Error('Repository already exists. Inspect and reconcile before connecting; never overwrite automatically.');
if(existsSync(path.join(root,'.git')))throw Error('Existing Git history found. Inspect remotes/branch before publishing.');
run('node',['--check','app.js']);run('node',['--check','sw.js']);run('node',['scripts/build.mjs']);
run('git',['init','-b','main']);run('git',['add','.']);
const staged=run('git',['diff','--cached','--name-only']);
if(staged.split('\n').some(n=>/(^|\/)\.env($|\.)/.test(n)&&!n.endsWith('.env.example')))throw Error('Environment file staged. Remove secrets before continuing.');
run('git',['commit','-m','Initial MOMENT LINK UI, product data and Codex handoff']);
run('gh',['repo','create',target,'--private','--source','.','--remote','origin','--push']);
console.log('Created private repository: https://github.com/'+target);
console.log('Next: connect it to EXISTING Vercel project moment-link-preview; verify Git auto-deploy.');
