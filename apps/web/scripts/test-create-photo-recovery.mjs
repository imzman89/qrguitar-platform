import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = fs.readFileSync(new URL('../lib/prepare-profile-photos.ts', import.meta.url), 'utf8');
const module = { exports: {} };
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const { prepareProfilePhotos } = module.exports;
const textModule = { exports: {} };
new Function('module','exports',ts.transpileModule(fs.readFileSync(new URL('../lib/ui-text.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(textModule,textModule.exports);
const ui = textModule.exports.createUiText({},'app.create.page');
const files = (...names) => names.map(name=>new File(['test'],name,{type:'image/jpeg'}));
test('one unreadable photo does not discard readable photos or their selection order',async()=>{
  const result=await prepareProfilePhotos(files('a.jpg','broken.jpg','b.jpg'),async file=>{if(file.name==='broken.jpg')throw Error('decode');return file.name;});
  assert.deepEqual(result,{images:['a.jpg','b.jpg'],failedNames:['broken.jpg'],duplicateCount:0});
});
test('retry succeeds with the same file and preserves previously prepared images',async()=>{
  const original=['a.jpg']; const result=await prepareProfilePhotos(files('b.jpg'),async()=> 'b.jpg',original);
  assert.deepEqual(result.images,['b.jpg']);assert.deepEqual(original,['a.jpg']);assert.deepEqual(result.failedNames,[]);
});
test('reselecting a photo or selecting duplicate content cannot create duplicate image identities',async()=>{
  const result=await prepareProfilePhotos(files('existing.jpg','copy.jpg','new.jpg'),async file=>file.name==='new.jpg'?'new':'existing',['existing']);
  assert.deepEqual(result.images,['new']);assert.equal(result.duplicateCount,2);
});
test('synchronous decoder failures and empty results remain recoverable',async()=>{
  const result=await prepareProfilePhotos(files('throw.jpg','empty.jpg'),file=>{if(file.name==='throw.jpg')throw Error('read');return Promise.resolve('');});
  assert.deepEqual(result.images,[]);assert.deepEqual(result.failedNames,['throw.jpg','empty.jpg']);
});
test('slow decoding preserves selection order',async()=>{
  let finish;const slow=new Promise(resolve=>{finish=resolve;});
  const pending=prepareProfilePhotos(files('first.jpg','second.jpg'),file=>file.name==='first.jpg'?slow:Promise.resolve('second'));
  finish('first');assert.deepEqual((await pending).images,['first','second']);
});
// Exercise the actual create handler with controlled file decoding and React-style setters.
const page=fs.readFileSync(new URL('../app/create/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('create.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map();
function walk(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));ts.forEachChild(n,walk);}walk(ast);
function compile(name,env){env={isCurrent:()=>true,...env};return new Function(...Object.keys(env),ts.transpileModule(functions.get(name),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return '+name)(...Object.values(env));}
function harness(overrides={}){
 const state={preparingFiles:false,photoFeedback:'',photoUploads:{old:{state:'uploaded',storagePath:'saved'}},galleryImages:['old'],form:{brand:'Fender',heroImageDataUrl:'old'},fieldErrors:{photos:'Add photo',brand:'Check brand'}};
 const env={saveInFlight:{current:false},fileSelectionPending:{current:false},galleryImages:state.galleryImages,prepareProfilePhotos,validateImageFiles:input=>({files:input,message:''}),fileToCompressedDataUrl:async file=>{if(file.name==='bad.jpg')throw Error('read');return file.name;},ui,...overrides};
 for(const key of Object.keys(state))env['set'+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==='function'?value(state[key]):value;};
 return {state,env,add:compile('addProfilePhotos',env)};
}
test('actual selection handler retains form and prior uploads after partial failure',async()=>{
 const h=harness();await h.add(files('new.jpg','bad.jpg'));
 assert.deepEqual(h.state.galleryImages,['old','new.jpg']);assert.equal(h.state.form.brand,'Fender');assert.equal(h.state.form.heroImageDataUrl,'old');assert.equal(h.state.photoUploads.old.storagePath,'saved');assert.match(h.state.photoFeedback,/bad.jpg/);assert.equal(h.state.preparingFiles,false);assert.deepEqual(h.state.fieldErrors,{brand:'Check brand'});
});
test('actual selection handler prevents overlapping selection and changes during a save',async()=>{
 for(const overrides of [{saveInFlight:{current:true}},{fileSelectionPending:{current:true}}]){const h=harness(overrides);await h.add(files('new.jpg'));assert.deepEqual(h.state.galleryImages,['old']);}
});
test('actual selection handler releases busy state when every photo fails',async()=>{
 const h=harness();await h.add(files('bad.jpg'));assert.equal(h.env.fileSelectionPending.current,false);assert.equal(h.state.preparingFiles,false);assert.deepEqual(h.state.galleryImages,['old']);assert.match(h.state.photoFeedback,/bad.jpg/);
});
