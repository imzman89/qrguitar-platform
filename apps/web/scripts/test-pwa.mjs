import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=withUiTextTestContext(process.env.QRGUITAR_SOURCE_ROOT?createRequire(path.join(process.env.QRGUITAR_SOURCE_ROOT,'package.json')):createRequire(import.meta.url));
const ts=require('typescript');
const read=file=>fs.readFileSync(path.join(root,'apps/web',file),'utf8');
function compile(source,bindings={},imports={}) {
  const module={exports:{}};
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',...Object.keys(bindings),js)(name=>name in imports?imports[name]:require(name),module,module.exports,...Object.values(bindings));
  return module.exports;
}
const offline=read('public/offline.html');
const worker=read('public/sw.js');
const origin='https://qrguitar.test';
function workerFixture({network=async()=>new Response(offline,{headers:{'content-type':'text/html'}}),unavailableCache=false}={}) {
  const handlers={},stores=new Map(),fetches=[],puts=[],deletes=[];
  let claimed=0,skipped=0;
  const caches={async open(name){if(unavailableCache)throw new Error('storage disabled');if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async put(key,response){puts.push(key);store.set(key,response.clone());},async match(key){return store.get(key)?.clone();}};},async keys(){return [...stores.keys()];},async delete(name){deletes.push(name);return stores.delete(name);}};
  const self={location:{origin},clients:{claim:async()=>{claimed++;}},skipWaiting:async()=>{skipped++;},addEventListener:(type,handler)=>{handlers[type]=handler;}};
  vm.runInNewContext(worker,{self,caches,Request,Response,URL,fetch:async(...args)=>{fetches.push(args);return network(...args);},console});
  return {stores,fetches,puts,deletes,async event(type,request){let result;handlers[type]({request,waitUntil:promise=>{result=promise;},respondWith:promise=>{result=promise;}});return result;},counts:()=>({claimed,skipped})};
}
const navigation=(pathname,extra={})=>({url:origin+pathname,method:'GET',mode:'navigate',headers:new Headers(),...extra});

test('manifest points to the working website with same-origin standalone identity and no offline promise',()=>{
  const manifest=compile(read('app/manifest.ts')).default();
  assert.equal(manifest.id,'/');assert.equal(manifest.name,'QRguitar');assert.equal(manifest.start_url,'/dashboard');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.match(manifest.description,/internet connection is required/);
  assert.equal(manifest.icons.length,3);
  for(const icon of manifest.icons){assert.ok(icon.src.startsWith('/app-icons/'));assert.ok(fs.existsSync(path.join(root,'apps/web/public',icon.src)));assert.equal(icon.type,'image/png');}
  assert.deepEqual(manifest.icons.filter(i=>i.purpose==='any').map(i=>i.sizes),['192x192','512x512']);assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
});
test('generated app icons have exact opaque dimensions and maskable artwork inside the safe circle',async()=>{
  const sharp=require('sharp');
  for(const [name,size] of [['qrguitar-192.png',192],['qrguitar-512.png',512],['qrguitar-maskable-512.png',512],['apple-touch-icon.png',180]]){
    const buffer=fs.readFileSync(path.join(root,'apps/web/public/app-icons',name));const info=await sharp(buffer).metadata();assert.equal(info.width,size);assert.equal(info.height,size);assert.equal(info.hasAlpha,false);
  }
  const {data,info}=await sharp(path.join(root,'apps/web/public/app-icons/qrguitar-maskable-512.png')).raw().toBuffer({resolveWithObject:true});
  let visible=0,maxRadius=0;
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const p=(y*512+x)*info.channels;if(Math.abs(data[p]-12)+Math.abs(data[p+1]-23)+Math.abs(data[p+2]-24)>12){visible++;maxRadius=Math.max(maxRadius,Math.hypot(x+.5-256,y+.5-256));}}
  assert.ok(visible>512*512*.08,'Artwork must not be blank');assert.ok(maxRadius<=512*.4,`Artwork exceeds mask safe zone: ${maxRadius}`);
});
test('offline document is self-contained, accessible and honest about required connectivity',()=>{
  assert.match(offline,/<html lang="en">/);assert.match(offline,/name="viewport"/);assert.match(offline,/internet connection is needed/);assert.match(offline,/check its status when you reconnect/);assert.match(offline,/<a href="">Try again<\/a>/);
  assert.doesNotMatch(offline,/<script|<link|<img|https?:\/\/|offline editing|saved your changes/i);
});
test('service-worker install stores only the fixed anonymous offline document',async()=>{
  const f=workerFixture();await f.event('install');assert.deepEqual(f.puts,[origin+'/offline.html']);assert.equal(f.fetches.length,1);
  const request=f.fetches[0][0];assert.equal(request.url,origin+'/offline.html');assert.equal(request.credentials,'omit');assert.equal(request.cache,'reload');assert.equal(request.redirect,'error');assert.equal(f.counts().skipped,1);
});
for(const [label,response] of [['500',()=>new Response('error',{status:500})],['wrong MIME',()=>new Response(offline,{headers:{'content-type':'application/json'}})],['wrong document',()=>new Response('<h1>Signed-in customer page</h1>',{headers:{'content-type':'text/html'}})]]) test(`install refuses ${label} instead of caching an unexpected page`,async()=>{
  const f=workerFixture({network:async()=>response()});await assert.rejects(()=>f.event('install'));assert.equal(f.puts.length,0);assert.equal(f.counts().skipped,0);
});
test('activation deletes only obsolete caches owned by this offline worker',async()=>{
  const f=workerFixture();f.stores.set('qrguitar-offline-v0',new Map());f.stores.set('unrelated-cache',new Map());await f.event('install');await f.event('activate');assert.deepEqual(f.deletes,['qrguitar-offline-v0']);assert.ok(f.stores.has('unrelated-cache'));assert.equal(f.counts().claimed,1);
});
test('authenticated navigation is network-only and its body is never stored for another session',async()=>{
  let online=true;const f=workerFixture({network:async request=>{if(request.url===origin+'/offline.html')return new Response(offline,{headers:{'content-type':'text/html'}});if(!online)throw new TypeError('offline');return new Response('PRIVATE OWNER ONE RECORD');}});
  await f.event('install');const result=await f.event('fetch',navigation('/account',{headers:new Headers({authorization:'Bearer private-token'})}));assert.equal(await result.text(),'PRIVATE OWNER ONE RECORD');assert.equal(f.fetches.at(-1)[1].cache,'no-store');assert.deepEqual(f.puts,[origin+'/offline.html']);
  online=false;const fallback=await f.event('fetch',navigation('/i/PRIVATE-CODE?owner=1'));assert.match(await fallback.text(),/internet connection is needed/);assert.deepEqual(f.puts,[origin+'/offline.html']);assert.deepEqual([...f.stores.values()].flatMap(store=>[...store.keys()]),[origin+'/offline.html']);
});
for(const request of [navigation('/api/account'),navigation('/api/instruments?scope=mine'),navigation('/_next/data/private'),navigation('/account',{method:'POST'}),navigation('/i/CODE',{mode:'cors',headers:new Headers({rsc:'1'})}),navigation('/private-document.pdf',{mode:'no-cors'}),navigation('/auth/token',{mode:'cors'}),{...navigation('/photo'),url:'https://private.supabase.co/storage/v1/object/sign/photo'}]) test(`worker does not intercept non-navigation/data request ${request.method} ${request.url} ${request.mode}`,async()=>{
  const f=workerFixture();assert.equal(await f.event('fetch',request),undefined);assert.equal(f.fetches.length,0);assert.equal(f.puts.length,0);
});
for(const status of [401,404,500,503])test(`online HTTP ${status} remains intact instead of becoming an offline success`,async()=>{
  const f=workerFixture({network:async()=>new Response('server response',{status})});const response=await f.event('fetch',navigation('/dashboard'));assert.equal(response.status,status);assert.equal(await response.text(),'server response');assert.equal(f.puts.length,0);
});
test('cache eviction/denial still yields a minimal no-store offline fallback with no private content',async()=>{
  const f=workerFixture({network:async()=>{throw new TypeError('offline');},unavailableCache:true});const response=await f.event('fetch',navigation('/account?private=token'));assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/token|account|PRIVATE/);assert.equal(f.puts.length,0);
});

const install=compile(read('lib/pwa-install.ts'));
function installFixture({ios=false,standalone=false}={}){
  const events=new Map(),states=[];const controller=install.createInstallController({listen:(key,fn)=>events.set(key,fn),unlisten:key=>events.delete(key),isStandalone:()=>standalone,isIos:ios},state=>states.push(structuredClone(state)));
  return {controller,states,state:()=>states.at(-1),fire:(name,event)=>events.get(name)?.(event),events};
}
const promptEvent=(prompt)=>Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt});
test('installation is hidden when unsupported and never prompts during capture',async()=>{
  let prompts=0;const f=installFixture();assert.equal(f.state().canPrompt,false);await f.controller.install();assert.equal(prompts,0);
  const event=promptEvent(async()=>{prompts++;return {outcome:'dismissed'};});f.fire('beforeinstallprompt',event);assert.equal(event.defaultPrevented,true);assert.equal(f.state().canPrompt,true);assert.equal(prompts,0);
  await f.controller.install();assert.equal(prompts,1);assert.equal(f.state().canPrompt,false);await f.controller.install();assert.equal(prompts,1);f.controller.dispose();
});
test('rapid install clicks consume one browser event once and disposal ignores late completion',async()=>{
  let finish,prompts=0;const f=installFixture();f.fire('beforeinstallprompt',promptEvent(()=>{prompts++;return new Promise(resolve=>{finish=resolve;});}));const first=f.controller.install();await f.controller.install();assert.equal(prompts,1);assert.equal(f.state().busy,true);f.controller.dispose();const count=f.states.length;finish({outcome:'accepted'});await first;assert.equal(f.states.length,count);assert.equal(f.events.size,0);
});
test('installed state suppresses prompts and iOS guidance; rejected prompts remain truthful',async()=>{
  const installed=installFixture({ios:true,standalone:true});assert.equal(installed.state().iosInstructions,false);installed.fire('beforeinstallprompt',promptEvent(async()=>{throw new Error('unexpected');}));assert.equal(installed.state().canPrompt,false);installed.controller.dispose();
  const f=installFixture({ios:true});assert.equal(f.state().iosInstructions,true);f.fire('beforeinstallprompt',promptEvent(async()=>{throw new Error('not allowed');}));await f.controller.install();assert.match(f.state().message,/could not open installation/);f.fire('appinstalled',new Event('appinstalled'));assert.equal(f.state().installed,true);assert.equal(f.state().iosInstructions,false);f.controller.dispose();
});
test('iOS guidance recognizes touch iPad desktop mode without misidentifying desktop Macs',()=>{
  assert.equal(install.isIosInstallDevice({userAgent:'iPhone',platform:'iPhone',maxTouchPoints:1}),true);assert.equal(install.isIosInstallDevice({userAgent:'Mac OS',platform:'MacIntel',maxTouchPoints:5}),true);assert.equal(install.isIosInstallDevice({userAgent:'Mac OS',platform:'MacIntel',maxTouchPoints:0}),false);assert.equal(install.isIosInstallDevice({userAgent:'Android',platform:'Linux',maxTouchPoints:5}),false);
});
test('install panel renders nothing when unsupported, and instructions rather than a fake install button on iOS',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');let state={...install.initialInstallState,install:()=>{throw new Error('Rendering must not prompt');}};
  const {PwaInstall}=compile(read('components/PwaInstall.tsx'),{}, {'./PwaRuntime':{usePwaInstall:()=>state},'./PwaInstall.module.css':{default:{card:'pwa-card'}}});
  assert.equal(renderToStaticMarkup(React.createElement(PwaInstall)),'');state={...state,iosInstructions:true};const ios=renderToStaticMarkup(React.createElement(PwaInstall));assert.match(ios,/Add to Home Screen/);assert.match(ios,/Open as Web App/);assert.doesNotMatch(ios,/<button/);state={...state,iosInstructions:false,canPrompt:true};assert.match(renderToStaticMarkup(React.createElement(PwaInstall)),/Install QRguitar/);
});
