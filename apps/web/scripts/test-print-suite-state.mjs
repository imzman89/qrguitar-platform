import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { withUiTextTestContext } from './ui-text-test-context.mjs';

const require = createRequire(import.meta.url), ts = require('typescript');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function compile(file, bindings = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(web,file),'utf8'), { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true } }).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',output)(withUiTextTestContext(name => {
    if (Object.hasOwn(bindings,name)) return bindings[name];
    if (name.endsWith('.module.css')) return new Proxy({}, {get:(_,key) => key === '__esModule' ? false : String(key)});
    if (name.startsWith('.')) {
      const target=path.resolve(web,path.dirname(file),name);
      return compile(path.relative(web,target+(fs.existsSync(target+'.ts')?'.ts':'.tsx')),bindings);
    }
    return require(name);
  }),module,module.exports);
  return module.exports;
}
const owner = { user:{id:'SYNTHETIC_OWNER'},access_token:'SYNTHETIC_TOKEN' };
const synthetic = code => ({qrCode:code,name:'Pedal',brand:'Example',year:'2020',instrumentType:'Pedal',serial:'HIDDEN_SERIAL',showSerialPublic:false,customFields:[{label:'Power',value:'9V'},{label:'Seller / source',value:'OWNER_PURCHASE'}],qrStyle:{},createdAt:'2026-01-01'});

async function fixture() {
  const original = { window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let session=owner, authCallback, renderer, printed=0, route={code:'QRG-QR4-A'}, requests=[], jobs=[], sanitizerCalls=[];
  const search=new URLSearchParams('format=qr&size=qr32'), router={replace(){}}, content={};
  const root={querySelectorAll:()=>[{complete:true,naturalWidth:121,addEventListener(){},removeEventListener(){}}],scrollWidth:121,clientWidth:121,scrollHeight:121,clientHeight:121,firstElementChild:null};
  const pageEvents=new EventTarget();
  globalThis.window={setTimeout,clearTimeout,addEventListener:pageEvents.addEventListener.bind(pageEvents),removeEventListener:pageEvents.removeEventListener.bind(pageEvents),print(){printed++;}};
  globalThis.document={fonts:{ready:Promise.resolve()},getElementById:()=>null};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  const presentation=compile('lib/instrument-profile-contract.ts');
  const fakeGenerator=kind => (code,side) => {const job={kind,code,side,...defer()};jobs.push(job);return job.promise;};
  const {default:Page}=compile('app/handout/[code]/page.tsx', {
    'next/navigation':{useParams:()=>route,useRouter:()=>router,useSearchParams:()=>search},
    'next/link':{__esModule:true,default:props=>React.createElement('a',props,props.children)},
    '../../../components/Nav':{Nav:()=>null},'../../../components/Footer':{Footer:()=>null},
    '../../../lib/owner-profile':{ownerProfileHref:()=>'/dashboard'},
    '../../../lib/use-site-content':{useSiteContent:()=>content},
    '../../../lib/content-registry':{getContentValue:(_,key)=>key},
    '../../../lib/local-demo':{instrumentDisplayName:i=>i.name,getInstrumentCondition:()=>'',getInstrumentVerificationStatus:()=> 'unverified'},
    '../../../lib/record-location':{formatRecordLocation:()=>''},
    '../../../lib/supabase-browser':{createBrowserSupabaseClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:cb=>{authCallback=cb;return {data:{subscription:{unsubscribe(){}}}};}}})},
    '../../../lib/handout-load':{loadHandoutInstrument:async options=>{const request={...options,...defer()};requests.push(request);return request.promise;}},
    '../../../lib/instrument-profile-contract':{...presentation,sanitizePublicInstrument:i=>{
      sanitizerCalls.push(i.qrCode);
      // Run the genuine sanitizer from the same-batch Agent1 dependency.
      return presentation.sanitizePublicInstrument(i);
    }},
    '../../../lib/qr-print-output':{...compile('lib/qr-print-output.ts'),printQrSvg:fakeGenerator('svg'),printQrPng:fakeGenerator('png')}
  });
  await act(async()=>{renderer=TestRenderer.create(React.createElement(Page),{createNodeMock:element=> element.props.className === 'canvasViewport' ? {clientWidth:700} : element.props.className === 'pageCanvas' ? {querySelector:()=>root} : null});await tick();});
  async function flush(){await act(async()=>{await tick();await tick();});}
  async function loadLatest(ownerAuthorized=true){await act(async()=>{const request=requests.at(-1);request.resolve({instrument:synthetic(request.code),ownerAuthorized});await tick();});await flush();}
  async function finish(kind){await act(async()=>{const job=jobs.filter(j=>j.kind===kind).at(-1);job.resolve(kind==='svg'?`<svg data-code="${job.code}" data-size="${job.side}"/>`:`data:image/png,${job.code}-${job.side}`);await tick();});await flush();}
  const downloads=()=>renderer.root.findAll(n=>n.type==='a'&&Boolean(n.props.download));
  const format=()=>renderer.root.findAllByType('select').find(n=>n.props.children.some(c=>c.props?.value==='qr'));
  const size=()=>renderer.root.findAllByType('select').find(n=>n.props.children.some(c=>c.props?.value==='qr25'));
  const documentNode=()=>renderer.root.findByProps({'data-print-document':true});
  return {jobs,requests,sanitizerCalls,downloads,loadLatest,finish,flush,documentNode,renderer,
    async chooseFormat(value){await act(async()=>{format().props.onChange({target:{value}});await tick();});},
    async chooseSize(value){await act(async()=>{size().props.onChange({target:{value}});await tick();});},
    async route(value){route={code:value};await act(async()=>{renderer.update(React.createElement(Page));await tick();});},
    async logout(){session=null;await act(async()=>{authCallback('SIGNED_OUT',null);await tick();});},
    async dispose(){await act(async()=>renderer.unmount());for(const key of Object.keys(original)){if(original[key]===undefined) delete globalThis[key];else globalThis[key]=original[key];}},
    printCount:()=>printed
  };
}

test('actual React Print Suite exposes SVG/PNG only for the current loaded code and selected size',async()=>{
  const f=await fixture();
  try {
    assert.equal(f.downloads().length,0);
    await f.loadLatest();await f.finish('svg');await f.finish('png');
    assert.deepEqual(f.downloads().map(n=>n.props.download),['qrguitar-QRG-QR4-A-32mm.svg','qrguitar-QRG-QR4-A-32mm.png']);
    assert.equal(f.documentNode().props['data-mode'],'qr');
    await f.chooseSize('qr25');assert.equal(f.downloads().length,0);
    await f.finish('svg');await f.finish('png');
    assert.ok(f.downloads().every(n=>n.props.download.includes('25mm')));
    await f.route('QRG-QR4-B');assert.equal(f.downloads().length,0);
    await f.loadLatest();await f.finish('svg');await f.finish('png');
    assert.ok(f.downloads().every(n=>n.props.download.includes('QRG-QR4-B')));
    assert.equal(f.printCount(),0);
  } finally {await f.dispose();}
});

test('late SVG/PNG for an old size cannot restore stale downloads; failures offer a retry',async()=>{
  const f=await fixture();
  try {
    await f.loadLatest();const old=f.jobs.slice();
    await f.chooseSize('qr38');
    await act(async()=>{for(const job of old)job.resolve('STALE_OUTPUT');await tick();});await f.flush();
    assert.equal(f.downloads().length,0);
    const job=f.jobs.filter(j=>j.kind==='svg').at(-1);
    await act(async()=>{job.reject(new Error('Generator failed'));await tick();});await f.flush();
    assert.equal(f.downloads().length,0);
    assert.ok(f.renderer.root.findAll(n=>n.type==='button'&&n.props.children==='Try again').length>0);
  } finally {await f.dispose();}
});

test('loaded owner data uses the shared-spec sanitizer; owner copy is explicit and sign-out clears it',async()=>{
  const f=await fixture();
  try {
    await f.loadLatest();await f.finish('svg');await f.chooseFormat('handout');
    const text=()=>JSON.stringify(f.renderer.toJSON());
    assert.ok(f.sanitizerCalls.includes('QRG-QR4-A'));
    assert.ok(!text().includes('OWNER_PURCHASE')&&!text().includes('HIDDEN_SERIAL'));
    const radios=f.renderer.root.findAll(n=>n.type==='input'&&n.props.name==='print-scope');
    await act(async()=>radios[1].props.onChange());
    assert.ok(text().includes('OWNER_PURCHASE')&&text().includes('HIDDEN_SERIAL'));
    await f.logout();assert.ok(!text().includes('OWNER_PURCHASE')&&!text().includes('HIDDEN_SERIAL'));
    await f.loadLatest(false);
    assert.ok(!text().includes('OWNER_PURCHASE')&&!text().includes('HIDDEN_SERIAL'));
    assert.equal(f.printCount(),0);
  } finally {await f.dispose();}
});
