import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {passwordHash} from '../server/security.mjs';
const dir=new URL('../.local/',import.meta.url),file=new URL('owner-credentials.json',dir);
if(await access(file).then(()=>true,()=>false))throw Error('Owner credentials already exist. Refusing to replace.');
await mkdir(dir,{recursive:true});const password=randomBytes(24).toString('base64url');
await writeFile(file,JSON.stringify({username:'admin',password,passwordHash:await passwordHash(password),url:'https://link.teamboatn.com/#admin',fallback:'https://moment-link-preview.vercel.app/#admin'},null,2),{mode:0o600});
console.log('Owner credentials created in gitignored .local/owner-credentials.json');
