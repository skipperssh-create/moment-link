import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ICON_FILES, writeAppIcons } from './app-icons.mjs';
import { writeCustomerGuides } from './customer-guides.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = ['index.html','app.js','admin.js','ownership.js','notification-sound.js','push-device.js','pricing.js','booking-addons.js','messages.js','ops-ui.js','time-picker.js','message-ui.js','booking-ui.js','pwa.js','styles.css','sw.js','manifest.webmanifest','assets/icon.svg','robots.txt','404.html','privacy.html','privacy.js','sitemap.xml','guide.html','guide.css','guide.js'];
const binaryAllowed = ['assets/moment-new-consultation.mp3'];
const out = path.join(root, 'dist');
const exists = async (p) => access(p).then(()=>true,()=>false);
let files = {};
if (await exists(path.join(root, 'app.js'))) {
  for (const name of allowed) files[name] = await readFile(path.join(root,name),'utf8');
} else {
  // REST deployment transport only. Never read customer data or remote resources.
  const encoded = (await readFile(path.join(root,'deployment-payload.part1'),'utf8')) + (await readFile(path.join(root,'deployment-payload.part2'),'utf8'));
  const raw = brotliDecompressSync(Buffer.from(encoded.trim(),'base64'));
  const expected = (await readFile(path.join(root,'deployment-payload.sha256'),'utf8')).trim();
  if (createHash('sha256').update(raw).digest('hex') !== expected) throw Error('Deployment payload integrity mismatch');
  files = JSON.parse(raw.toString('utf8'));
  if (Object.keys(files).length !== allowed.length || Object.keys(files).some(n=>!allowed.includes(n))) throw Error('Invalid deployment file list');
}
const binaries=await Promise.all(binaryAllowed.map(name=>readFile(path.join(root,name))));
await rm(out,{recursive:true,force:true});
for (const name of allowed) {
  if (typeof files[name] !== 'string') throw Error('Missing runtime file: '+name);
  const target=path.join(out,name);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,files[name],'utf8');
}
await writeAppIcons(path.join(out,'assets'),files['assets/icon.svg']);
for(const [i,name] of binaryAllowed.entries())await writeFile(path.join(out,name),binaries[i]);
const guideCount=await writeCustomerGuides(out);
console.log('Built '+(allowed.length+binaryAllowed.length+APP_ICON_FILES.length+guideCount)+' public files. Server code, credentials and reports remain outside the static output.');
