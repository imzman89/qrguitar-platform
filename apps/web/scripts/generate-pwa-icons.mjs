import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=process.env.QRGUITAR_SOURCE_ROOT?createRequire(path.join(process.env.QRGUITAR_SOURCE_ROOT,'package.json')):createRequire(import.meta.url);
const sharp=require('sharp');
const icons=path.join(root,'apps/web/public/app-icons');
const source=fs.readFileSync(path.join(icons,'qrguitar.svg'));
for(const [name,size] of [['qrguitar-192.png',192],['qrguitar-512.png',512],['qrguitar-maskable-512.png',512],['apple-touch-icon.png',180]]) {
  await sharp(source).resize(size,size).flatten({background:'#0c1718'}).png().toFile(path.join(icons,name));
}
console.log('Generated four local PNG derivatives from the original SVG.');
