import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
const scriptRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const root=process.env.QRGUITAR_SOURCE_ROOT || scriptRoot;
const require=createRequire(path.join(root,'package.json'));
const ts=require('typescript');
const proposal=fs.existsSync(path.join(scriptRoot,'regions/handoutLoadEffect.tsx.txt'));
const overlay=proposal ? createRequire(import.meta.url)(path.join(scriptRoot,'overlay.cjs')).buildOverlay(root,ts,scriptRoot) : new Map();
const read=file=>overlay.get(file) ?? fs.readFileSync(path.join(root,file),'utf8');
const compile=(source,bindings={})=>{
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',...Object.keys(bindings),compiled)(name=>{throw new Error(`Unexpected import ${name}`);},module,module.exports,...Object.values(bindings));
  return module.exports;
};
const {loadHandoutInstrument,HandoutLoadError}=compile(read('apps/web/lib/handout-load.ts'));
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const instrument={qrCode:'G0',name:'Test guitar',serial:'private-serial'};
const load=options=>loadHandoutInstrument({code:'G0',readToken:async()=>'',timeoutMs:1000,...options});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('signed-in print uses owner data and authorization only on the owner request',async()=>{
  const calls=[];const result=await load({readToken:async()=>'secret-token',fetchProfile:async(url,init)=>{calls.push({url,init});return response(200,{ok:true,instrument});}});
  assert.equal(result.ownerAuthorized,true);assert.equal(result.instrument.serial,'private-serial');assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/instruments?scope=mine&code=G0');assert.equal(calls[0].init.headers.authorization,'Bearer secret-token');assert.equal(calls[0].init.cache,'no-store');
});
for(const status of [401,403,404]) test(`owner ${status} can fall back to an anonymous public profile without leaking the token`,async()=>{
  const calls=[];const result=await load({readToken:async()=>'secret-token',fetchProfile:async(url,init)=>{calls.push({url,init});return calls.length===1?response(status,{ok:false}):response(200,{ok:true,instrument:{qrCode:'G0',serial:''}});}});
  assert.equal(result.ownerAuthorized,false);assert.equal(calls.length,2);assert.equal(calls[1].url,'/api/instruments?code=G0');assert.equal(calls[1].init.headers.authorization,undefined);assert.equal(result.instrument.serial,'');
});
for(const status of [429,500,503,200]) test(`owner ${status} failure does not silently downgrade the print to incomplete public data`,async()=>{
  let calls=0;await assert.rejects(()=>load({readToken:async()=>'token',fetchProfile:async()=>{calls++;return response(status,{ok:false,message:'failure'});}}),HandoutLoadError);assert.equal(calls,1);
});
test('network rejection and malformed JSON produce actionable errors',async()=>{
  await assert.rejects(()=>load({fetchProfile:async()=>{throw new TypeError('fetch failed');}}),/Could not connect/);
  await assert.rejects(()=>load({fetchProfile:async()=>new Response('not json',{status:200})}),HandoutLoadError);
});
test('token-read failure or timeout can still load the public handout',async()=>{
  let calls=0;const fetchProfile=async()=>{calls++;return response(200,{ok:true,instrument});};
  const failed=await load({readToken:async()=>{throw new Error('session inaccessible');},fetchProfile});assert.equal(failed.ownerAuthorized,false);
  const timeout=await load({readToken:()=>new Promise(()=>{}),tokenTimeoutMs:5,fetchProfile});assert.equal(timeout.ownerAuthorized,false);assert.equal(calls,2);
});
test('request deadline handles even a non-resolving fetch and aborts its signal',async()=>{
  let signal;await assert.rejects(()=>load({timeoutMs:5,fetchProfile:async(_url,init)=>{signal=init.signal;return new Promise(()=>{});}}),/Loading took too long/);assert.equal(signal.aborted,true);
});
test('abort before a request starts or while it is running rejects without stale work',async()=>{
  const before=new AbortController();before.abort();let calls=0;
  await assert.rejects(()=>load({signal:before.signal,fetchProfile:async()=>{calls++;return response(200,{ok:true,instrument});}}),{name:'AbortError'});assert.equal(calls,0);
  const during=new AbortController();const wait=deferred();const promise=load({signal:during.signal,fetchProfile:async()=>{calls++;return wait.promise;}});await tick();during.abort();await assert.rejects(()=>promise,{name:'AbortError'});wait.resolve(response(200,{ok:true,instrument}));await tick();
});
test('public missing profile retains the server message',async()=>{
  await assert.rejects(()=>load({fetchProfile:async()=>response(404,{ok:false,message:'Instrument not found.'})}),/Instrument not found/);
});

const page=read('apps/web/app/handout/[code]/page.tsx');
const pageAst=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect,retry;
const visit=node=>{
  if(ts.isCallExpression(node)&&node.expression.getText(pageAst)==='useEffect'&&node.getText(pageAst).includes('async function loadHandoutProfile')) effect=node.arguments[0];
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(pageAst)==='button'&&node.children.some(child=>ts.isJsxText(child)&&child.text.trim()==='Try again')) {
    const attr=node.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(pageAst)==='onClick');retry=attr?.initializer?.expression;
  }
  ts.forEachChild(node,visit);
};visit(pageAst);
assert.ok(effect,'Production handout load effect is missing');assert.ok(retry,'Production retry handler is missing');
function effectFixture(loader) {
  const state={loading:false,message:'Old error',instrument:{qrCode:'OLD'},ownerAuthorized:true,printScope:'owner',selectedServiceId:'old-event',loadAttempt:0};
  const events=[];const replacements=[];const bindings={code:'G0',searchParams:new URLSearchParams('format=service&size=a4'),router:{replace:url=>replacements.push(url)},getSupabaseAccessToken:async()=>'',loadHandoutInstrument:loader};
  for(const name of ['loading','message','instrument','ownerAuthorized','printScope','selectedServiceId','loadAttempt']) bindings[`set${name[0].toUpperCase()}${name.slice(1)}`]=value=>{state[name]=typeof value==='function'?value(state[name]):value;events.push([name,state[name]]);};
  const {runEffect,onRetry}=compile(`export function runEffect(){return (${effect.getText(pageAst)})();}\nexport const onRetry=(${retry.getText(pageAst)});`,bindings);
  return {state,events,replacements,runEffect,onRetry};
}
test('production handout effect ends loading after fetch rejection and retry clears stale errors and privileges',async()=>{
  let attempts=0;const pending=deferred();const f=effectFixture(async()=>{attempts++;if(attempts===1)throw new Error('Connection failed');return pending.promise;});
  const cleanup=f.runEffect();await tick();assert.equal(f.state.loading,false);assert.equal(f.state.message,'Connection failed');assert.equal(f.state.instrument,null);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');assert.equal(f.state.selectedServiceId,'');
  cleanup();f.onRetry();assert.equal(f.state.loadAttempt,1);const retryCleanup=f.runEffect();assert.equal(f.state.loading,true);assert.equal(f.state.message,'');assert.equal(f.state.instrument,null);
  pending.resolve({instrument,ownerAuthorized:true});await tick();assert.equal(f.state.loading,false);assert.equal(f.state.ownerAuthorized,true);assert.equal(f.state.instrument,instrument);retryCleanup();
});
test('production handout effect ignores a late success after unmount or route switch',async()=>{
  const pending=deferred();let signal;const f=effectFixture(options=>{signal=options.signal;return pending.promise;});const cleanup=f.runEffect();const count=f.events.length;cleanup();assert.equal(signal.aborted,true);pending.resolve({instrument,ownerAuthorized:true});await tick();assert.equal(f.events.length,count);assert.equal(f.state.instrument,null);
});
test('canonical handout redirect preserves selected print format and size',async()=>{
  const f=effectFixture(async()=>({instrument:{...instrument,qrCode:'CANONICAL'},ownerAuthorized:true}));const cleanup=f.runEffect();await tick();assert.deepEqual(f.replacements,['/handout/CANONICAL?format=service&size=a4']);assert.equal(f.state.loading,false);cleanup();
});
