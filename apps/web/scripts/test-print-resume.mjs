import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url),ts=require('typescript');
function compile(source,bindings={}) {
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('module','exports',...Object.keys(bindings),output)(module,module.exports,...Object.values(bindings));
  return module.exports;
}
const page=fs.readFileSync(process.env.QR4_HANDOUT_SOURCE || new URL('../app/handout/[code]/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect,printAction;
function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.getText(ast).includes('async function loadHandoutProfile'))effect=node.arguments[0];
  if(ts.isFunctionDeclaration(node)&&node.name?.text==='printSelectedPage')printAction=node;
  ts.forEachChild(node,visit);
}
visit(ast);assert.ok(effect&&printAction);
const {loadHandoutInstrument}=compile(fs.readFileSync(new URL('../lib/handout-load.ts',import.meta.url),'utf8'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const A={user:{id:'SYNTHETIC_A'},access_token:'TOKEN_A'},B={user:{id:'SYNTHETIC_B'},access_token:'TOKEN_B'};
const record=serial=>({qrCode:'QRG-RESUME',name:'Synthetic pedal',serial,createdAt:'2026-01-01'});
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

function fixture({readSession,fetchProfile}={}){
  let actor=A,readCount=0,prints=0,timerId=0;
  const requests=[],authListeners=new Set(),pageListeners=new Set(),timers=new Map();
  const state={loading:false,message:'',instrument:null,loadedCode:'',ownerAuthorized:false,printScope:'public',selectedServiceId:'',selectedPhoto:'',printTitle:null,printNote:'',printing:false,printState:'',mobileControlsOpen:false};
  const loadRevision={current:0},renderedRevision={current:-1};
  const auth={getSession:()=>{readCount++;return readSession?readSession(readCount,actor):Promise.resolve({data:{session:actor}});},onAuthStateChange:callback=>{authListeners.add(callback);return {data:{subscription:{unsubscribe:()=>authListeners.delete(callback)}}};}};
  const browser={setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,callback)=>{assert.equal(name,'pageshow');pageListeners.add(callback);},removeEventListener:(_,callback)=>pageListeners.delete(callback),print:()=>{prints++;}};
  const bindings={code:'QRG-RESUME',searchParams:new URLSearchParams('format=handout'),router:{replace(){}},loadRevision,renderedRevision,ui:(_,fallback)=>fallback,window:browser,createBrowserSupabaseClient:()=>({auth}),
    loadHandoutInstrument:options=>loadHandoutInstrument({...options,fetchProfile:async(url,init)=>{requests.push({url,init});return fetchProfile?fetchProfile(url,init,requests.length):response(200,{ok:true,instrument:record(init.headers.authorization==='Bearer TOKEN_B'?'B_ONLY':init.headers.authorization?'A_ONLY':'SHARED')});}}),
    readyToPrint:true,loadedCode:'QRG-RESUME',printing:false,canvasRef:{current:{querySelector:()=>({querySelectorAll:()=>[],scrollHeight:100,clientHeight:100,scrollWidth:100,clientWidth:100})}},printReadiness:()=> 'Ready to print.'};
  for(const name of Object.keys(state))bindings[`set${name[0].toUpperCase()}${name.slice(1)}`]=value=>{state[name]=typeof value==='function'?value(state[name]):value;};
  const {start,print}=compile(`export function start(){return (${effect.getText(ast)})();}\n${printAction.getText(ast)}\nexport const print=printSelectedPage;`,bindings);
  const cleanup=start();
  return {state,requests,print,cleanup,readCount:()=>readCount,printCount:()=>prints,listenerCount:()=>pageListeners.size,
    show(persisted=true){for(const callback of pageListeners)callback({persisted});},
    emit(session,event='SIGNED_IN'){actor=session;for(const callback of authListeners)callback(event,session);},
    deadline(){const entry=[...timers.values()].find(timer=>timer.ms===2500);assert.ok(entry,'Restored session lookup must have a deadline');entry.callback();}
  };
}

test('persisted Print restoration clears old owner data before a fresh no-store ownership read',async()=>{
  const session=deferred();let owns=true;
  const f=fixture({readSession:count=>count===1?Promise.resolve({data:{session:A}}):session.promise,fetchProfile:(url,init)=>{
    if(url.includes('scope=mine')&&!owns)return response(404,{ok:false,message:'Not owned by this account'});
    return response(200,{ok:true,instrument:record(init.headers.authorization?'A_PRIVATE':'PUBLIC_FRESH')});
  }});
  try{
    await tick();assert.equal(f.state.instrument.serial,'A_PRIVATE');
    f.state.printScope='owner';f.state.printTitle='A_PRIVATE_TITLE';f.state.printNote='A_PRIVATE_NOTE';owns=false;
    f.show();assert.equal(f.state.instrument,null);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');assert.equal(f.state.printTitle,null);assert.equal(f.state.printNote,'');assert.equal(f.state.loading,true);
    f.print();assert.equal(f.printCount(),0);
    session.resolve({data:{session:A}});await tick();await tick();
    assert.equal(f.readCount(),2);assert.equal(f.requests.length,3);
    assert.ok(f.requests[1].url.includes('scope=mine'));assert.equal(f.requests[1].init.cache,'no-store');assert.equal(f.requests[1].init.headers.authorization,'Bearer TOKEN_A');
    assert.ok(!f.requests[2].url.includes('scope=mine'));assert.equal(f.requests[2].init.headers.authorization,undefined);
    assert.equal(f.state.instrument.serial,'PUBLIC_FRESH');assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');
  }finally{f.cleanup();}
});

test('late restored A session cannot replace a newer B auth event or ownership read',async()=>{
  const stale=deferred();const f=fixture({readSession:count=>count===1?Promise.resolve({data:{session:A}}):stale.promise});
  try{
    await tick();f.show();assert.equal(f.readCount(),2,'Restoration must read the current session before any late A result');f.emit(B);await tick();assert.equal(f.state.instrument.serial,'B_ONLY');
    stale.resolve({data:{session:A}});await tick();assert.equal(f.state.instrument.serial,'B_ONLY');assert.equal(f.requests.length,2);
    assert.equal(f.requests[1].init.headers.authorization,'Bearer TOKEN_B');
  }finally{f.cleanup();}
});

test('late A owner response after restored ownership read cannot resurrect data after sign-out',async()=>{
  const stale=deferred();const f=fixture({fetchProfile:(url,init,count)=>count===2?stale.promise:response(200,{ok:true,instrument:record(init.headers.authorization?'A_ONLY':'SHARED')})});
  try{
    await tick();f.show();await tick();assert.equal(f.state.instrument,null);assert.equal(f.requests.length,2);
    f.emit(null,'SIGNED_OUT');await tick();assert.equal(f.state.instrument.serial,'SHARED');assert.equal(f.state.ownerAuthorized,false);
    stale.resolve(response(200,{ok:true,instrument:record('STALE_A_PRIVATE')}));await tick();assert.equal(f.state.instrument.serial,'SHARED');assert.equal(f.state.ownerAuthorized,false);
  }finally{f.cleanup();}
});

test('restored session rejection or deadline leaves no stale owner data or late privilege resurrection',async()=>{
  for(const failure of ['reject','deadline']){
    const stale=deferred();const f=fixture({readSession:count=>count===1?Promise.resolve({data:{session:A}}):stale.promise});
    try{
      await tick();f.show();assert.equal(f.state.instrument,null);
      if(failure==='reject')stale.reject(new Error('Session unavailable'));else f.deadline();
      await tick();assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.instrument.serial,'SHARED');
      assert.equal(f.requests.at(-1).init.headers.authorization,undefined);
      if(failure==='deadline'){stale.resolve({data:{session:A}});await tick();assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.instrument.serial,'SHARED');}
    }finally{f.cleanup();}
  }
});

test('initial non-persisted pageshow preserves edits and unmount removes the restore listener',async()=>{
  const stale=deferred();const f=fixture({readSession:count=>count===1?Promise.resolve({data:{session:A}}):stale.promise});
  await tick();assert.equal(f.listenerCount(),1,'A mounted Print page must receive persisted restore events');f.state.printNote='KEEP_NOTE';f.show(false);assert.equal(f.readCount(),1);assert.equal(f.requests.length,1);assert.equal(f.state.printNote,'KEEP_NOTE');
  f.show();const count=f.requests.length;f.cleanup();assert.equal(f.listenerCount(),0);
  stale.resolve({data:{session:B}});await tick();assert.equal(f.requests.length,count);
});
