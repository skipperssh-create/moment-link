import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const APP_ICON_FILES = ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','notification-badge.png','favicon-32.png'];

// Derive every platform asset from the existing MOMENT LINK vector mark.
export async function writeAppIcons(directory, svg) {
  await mkdir(directory,{recursive:true});
  const source=Buffer.from(svg);
  const badge=svg.replace(/<rect\b[^>]*\/>/,'').replace('viewBox="0 0 512 512"','viewBox="70 90 372 372"');
  const variants=[
    ['icon-192.png',source,192,false],
    ['icon-512.png',source,512,false],
    ['icon-maskable-512.png',source,512,true],
    ['apple-touch-icon.png',source,180,true],
    ['notification-badge.png',Buffer.from(badge),96,false],
    ['favicon-32.png',source,32,false]
  ];
  for(const [name,input,size,opaque] of variants){
    let pipeline=sharp(input).resize(size,size);
    if(opaque)pipeline=pipeline.flatten({background:'#111113'});
    await writeFile(path.join(directory,name),await pipeline.png().toBuffer());
  }
}
