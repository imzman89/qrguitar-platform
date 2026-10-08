import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=path.resolve(import.meta.dirname,'..');
function load(file){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),exports);return exports;}
const {defaultQrBatchSettings:defaults}=load(root+'/lib/qr-batch-layout.ts'),{readQrPaperSettings,saveQrPaperSettings}=load(root+'/lib/qr-paper-settings.ts');
const actorA='0c29ab42-4d03-4997-b486-89bd4ded61b5',actorB='ac4cfb1a-5adf-41b9-afc1-ece3e9433db9';
function store(){const values=new Map();return{values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
test('repeat jobs restore alignment but never retain a first-sheet skip or instrument data',()=>{
 const storage=store();saveQrPaperSettings(actorA,{...defaults,leftMm:12,skip:3,requests:[{code:'QRG-A00174',quantity:12}],token:'private-token'},storage);
 const restored=readQrPaperSettings(actorA,storage);assert.equal(restored.leftMm,12);assert.equal(restored.skip,0);assert.equal(restored.requests,undefined);assert.equal(restored.token,undefined);assert.equal([...storage.values.values()].some(value=>value.includes('QRG-A00174')||value.includes('private-token')),false);
});
test('sheet and thermal settings remain separate and another account never loads them',()=>{
 const storage=store();saveQrPaperSettings(actorA,{...defaults,leftMm:12},storage);saveQrPaperSettings(actorA,{...defaults,stock:'single'},storage);
 assert.equal(readQrPaperSettings(actorA,storage).stock,'single');assert.equal(readQrPaperSettings(actorA,storage,'letter').leftMm,12);assert.equal(readQrPaperSettings(actorB,storage),null);
});
test('corrupt or impossible stored settings fall back rather than partially alter a print job',()=>{
 const storage=store();storage.setItem('qrguitar.qr-paper.v1:'+actorA,JSON.stringify({version:1,lastStock:'letter',stocks:{letter:{...defaults,leftMm:NaN}}}));assert.equal(readQrPaperSettings(actorA,storage),null);
 storage.setItem('qrguitar.qr-paper.v1:'+actorA,'{broken');assert.equal(readQrPaperSettings(actorA,storage),null);
 assert.throws(()=>saveQrPaperSettings(actorA,{...defaults,leftMm:100,rightMm:100},storage),/does not fit/);
});
test('denied persistence cannot report a successful save and signed-out actors cannot save',()=>{
 const storage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');}};
 assert.equal(readQrPaperSettings(actorA,storage),null);assert.throws(()=>saveQrPaperSettings(actorA,defaults,storage),/could not save/);assert.throws(()=>saveQrPaperSettings('',defaults,store()),/Sign in/);
});
