import { withUiTextTestContext } from "./ui-text-test-context.mjs";
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
  bindings={ui:withUiTextTestContext(()=>{throw new Error("Unexpected module");})("UiTextProvider").useUiText("app.handout.code.page"),...bindings};
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
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
let effect,retry,printAction,viewport;
const visit=node=>{
  if(ts.isCallExpression(node)&&node.expression.getText(pageAst)==='useEffect'&&node.getText(pageAst).includes('async function loadHandoutProfile')) effect=node.arguments[0];
  if(ts.isFunctionDeclaration(node)&&node.name?.getText(pageAst)==='printSelectedPage') printAction=node;
  if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(pageAst)==='ref'&&p.initializer?.expression?.getText(pageAst)==='viewportRef')) viewport=node;
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(pageAst)==='button'&&node.children.some(child=>(ts.isJsxText(child)&&child.text.trim()==='Try again')||(ts.isJsxExpression(child)&&ts.isCallExpression(child.expression)&&child.expression.expression.getText(pageAst)==='ui'&&ts.isStringLiteral(child.expression.arguments[1])&&child.expression.arguments[1].text==='Try again'))) {
    const attr=node.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(pageAst)==='onClick');retry=attr?.initializer?.expression;
  }
  ts.forEachChild(node,visit);
};visit(pageAst);
assert.ok(effect,'Production handout load effect is missing');assert.ok(retry,'Production retry handler is missing');assert.ok(printAction,'Production print action is missing');
assert.ok(viewport,'Production preview viewport must remain mounted while loading or unavailable');
const ownerA={user:{id:'synthetic-owner-a'},access_token:'synthetic-token-a'};
const ownerB={user:{id:'synthetic-owner-b'},access_token:'synthetic-token-b'};
function effectFixture(loader,{session=ownerA,sessionRead,clientError=false}={}) {
  const state={loading:false,message:'Old error',instrument:{qrCode:'OLD'},loadedCode:'G0',ownerAuthorized:true,printScope:'owner',selectedServiceId:'old-event',selectedPhoto:'private-photo',printTitle:'Private custom title',printNote:'Private custom note',printing:false,printState:'Ready to print.',mobileControlsOpen:true,loadAttempt:0};
  const events=[],replacements=[],listeners=new Set(),loadRevision={current:0},renderedRevision={current:0};let prints=0;
  const auth={getSession:()=>sessionRead || Promise.resolve({data:{session}}),onAuthStateChange:callback=>{listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}};}};
  const bindings={code:'G0',searchParams:new URLSearchParams('format=service&size=a4'),router:{replace:url=>replacements.push(url)},loadHandoutInstrument:loader,loadRevision,renderedRevision,
    createBrowserSupabaseClient:()=>{if(clientError)throw new Error('Unavailable browser auth');return {auth};},window:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){},print:()=>{prints++;}},
    readyToPrint:true,loadedCode:'G0',printing:false,canvasRef:{current:{querySelector:()=>({querySelectorAll:()=>[],scrollHeight:100,clientHeight:100,scrollWidth:100,clientWidth:100})}},printReadiness:()=> 'Ready to print.'};
  for(const name of Object.keys(state)) bindings[`set${name[0].toUpperCase()}${name.slice(1)}`]=value=>{state[name]=typeof value==='function'?value(state[name]):value;events.push([name,state[name]]);};
  const {runEffect,onRetry,runPrint}=compile(`export function runEffect(){return (${effect.getText(pageAst)})();}\nexport const onRetry=(${retry.getText(pageAst)});\n${printAction.getText(pageAst)}\nexport const runPrint=printSelectedPage;`,bindings);
  const emit=(event,next)=>{session=next;for(const listener of listeners)listener(event,next);};
  return {state,events,replacements,runEffect,onRetry,runPrint,emit,loadRevision,renderedRevision,listenerCount:()=>listeners.size,printCount:()=>prints};
}
test('production handout effect ends loading after fetch rejection and retry clears stale errors and privileges',async()=>{
  let attempts=0;const pending=deferred();const f=effectFixture(async()=>{attempts++;if(attempts===1)throw new Error('Connection failed');return pending.promise;});
  const cleanup=f.runEffect();await tick();assert.equal(f.state.loading,false);assert.equal(f.state.message,'Connection failed');assert.equal(f.state.instrument,null);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');assert.equal(f.state.selectedServiceId,'');
  cleanup();f.onRetry();assert.equal(f.state.loadAttempt,1);const retryCleanup=f.runEffect();assert.equal(f.state.loading,true);assert.equal(f.state.message,'');assert.equal(f.state.instrument,null);
  pending.resolve({instrument,ownerAuthorized:true});await tick();assert.equal(f.state.loading,false);assert.equal(f.state.ownerAuthorized,true);assert.equal(f.state.instrument,instrument);retryCleanup();
});
test('production handout effect ignores a late success after unmount or route switch',async()=>{
  const pending=deferred();let signal;const f=effectFixture(options=>{signal=options.signal;return pending.promise;});const cleanup=f.runEffect();await tick();const count=f.events.length;cleanup();assert.equal(signal.aborted,true);assert.equal(f.listenerCount(),0);pending.resolve({instrument,ownerAuthorized:true});await tick();assert.equal(f.events.length,count);assert.equal(f.state.instrument,null);
});
test('canonical handout redirect preserves selected print format and size',async()=>{
  const f=effectFixture(async()=>({instrument:{...instrument,qrCode:'CANONICAL'},ownerAuthorized:true}));const cleanup=f.runEffect();await tick();assert.deepEqual(f.replacements,['/handout/CANONICAL?format=service&size=a4']);assert.equal(f.state.loading,false);cleanup();
});

test('cross-tab logout immediately clears private print data and blocks a stale print click',async()=>{
  const anonymous=deferred(),calls=[];
  const f=effectFixture(async options=>{const token=await options.readToken();calls.push({token,signal:options.signal});return token?{instrument,ownerAuthorized:true}:anonymous.promise;});
  const cleanup=f.runEffect();await tick();
  Object.assign(f.state,{printScope:'owner',selectedServiceId:'private-service',selectedPhoto:'private-photo',printTitle:'Private title',printNote:'Private notes',printing:true,mobileControlsOpen:true});
  f.runPrint();assert.equal(f.printCount(),1);
  f.emit('SIGNED_OUT',null);
  assert.equal(calls[0].signal.aborted,true);assert.equal(f.state.instrument,null);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');
  assert.equal(f.state.selectedServiceId,'');assert.equal(f.state.selectedPhoto,'');assert.equal(f.state.printTitle,null);assert.equal(f.state.printNote,'');assert.equal(f.state.printing,false);assert.equal(f.state.mobileControlsOpen,false);assert.equal(f.state.loading,true);
  f.runPrint();assert.equal(f.printCount(),1,'Old ready-to-print closure must not print after invalidation');
  await tick();assert.equal(calls[1].token,'');anonymous.reject(new Error('This private Profile is unavailable.'));await tick();
  assert.equal(f.state.instrument,null);assert.equal(f.state.loading,false);assert.match(f.state.message,/unavailable/);cleanup();
});

test('actor changes abort old loads and fence late A-to-B-to-A results and redirects',async()=>{
  const calls=[];const f=effectFixture(options=>{const pending=deferred();calls.push({options,pending});return pending.promise;});
  const cleanup=f.runEffect();await tick();f.emit('SIGNED_IN',ownerB);assert.equal(calls[0].options.signal.aborted,true);
  f.emit('SIGNED_IN',ownerA);assert.equal(calls[1].options.signal.aborted,true);assert.equal(calls.length,3);
  assert.equal(await calls[1].options.readToken(),ownerB.access_token);assert.equal(await calls[2].options.readToken(),ownerA.access_token);
  calls[0].pending.resolve({instrument:{...instrument,qrCode:'OLD-A'},ownerAuthorized:true});calls[1].pending.resolve({instrument:{...instrument,qrCode:'OLD-B'},ownerAuthorized:true});await tick();
  assert.equal(f.state.instrument,null);assert.equal(f.state.loading,true);assert.deepEqual(f.replacements,[]);
  calls[2].pending.resolve({instrument:{qrCode:'G0',name:'Current A'},ownerAuthorized:true});await tick();assert.equal(f.state.instrument.name,'Current A');assert.equal(f.state.loading,false);cleanup();
});

test('late initial session cannot resurrect the old account after an Auth event',async()=>{
  const initial=deferred(),tokens=[];const f=effectFixture(async options=>{tokens.push(await options.readToken());return {instrument:{qrCode:'G0',name:'Current B'},ownerAuthorized:true};},{sessionRead:initial.promise});
  const cleanup=f.runEffect();f.emit('SIGNED_IN',ownerB);await tick();initial.resolve({data:{session:ownerA}});await tick();
  assert.deepEqual(tokens,[ownerB.access_token]);assert.equal(f.state.instrument.name,'Current B');cleanup();
});

test('logout reloads a public-safe version without restoring owner customizations',async()=>{
  const publicInstrument={qrCode:'G0',name:'Public guitar',serial:''},calls=[];
  const f=effectFixture(async options=>{const token=await options.readToken();calls.push(token);return {instrument:token?instrument:publicInstrument,ownerAuthorized:Boolean(token)};});
  const cleanup=f.runEffect();await tick();Object.assign(f.state,{printScope:'owner',printTitle:'Private override',printNote:'Private note',selectedPhoto:'private-photo',selectedServiceId:'private-service'});
  f.emit('SIGNED_OUT',null);await tick();assert.deepEqual(calls,[ownerA.access_token,'']);assert.equal(f.state.instrument,publicInstrument);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.printScope,'public');assert.equal(f.state.printTitle,null);assert.equal(f.state.printNote,'');assert.equal(f.state.selectedPhoto,'');assert.equal(f.state.selectedServiceId,'');cleanup();
});

test('same-account token refresh preserves current print edits without reloading',async()=>{
  let calls=0;const f=effectFixture(async()=>{calls++;return {instrument,ownerAuthorized:true};});const cleanup=f.runEffect();await tick();
  Object.assign(f.state,{printTitle:'Current title',printNote:'Current note',printScope:'owner'});const revision=f.loadRevision.current;
  f.emit('TOKEN_REFRESHED',{...ownerA,access_token:'synthetic-refreshed'});await tick();assert.equal(calls,1);assert.equal(f.loadRevision.current,revision);assert.equal(f.state.printTitle,'Current title');assert.equal(f.state.printNote,'Current note');assert.equal(f.state.printScope,'owner');cleanup();
});

for(const scenario of ['signed-out access','unconfigured auth','failed session lookup']) test(`anonymous public printing survives ${scenario}`,async()=>{
  const options=scenario==='unconfigured auth'?{clientError:true}:scenario==='failed session lookup'?{sessionRead:Promise.reject(new Error('Session unavailable'))}:{session:null};
  const tokens=[];const publicInstrument={qrCode:'G0',serial:''};const f=effectFixture(async request=>{tokens.push(await request.readToken());return {instrument:publicInstrument,ownerAuthorized:false};},options);
  const cleanup=f.runEffect();await tick();assert.deepEqual(tokens,['']);assert.equal(f.state.instrument,publicInstrument);assert.equal(f.state.ownerAuthorized,false);assert.equal(f.state.loading,false);cleanup();
});

// Render the production viewport branches, not a second test-only status component.
const webRequire=createRequire(path.join(root,'apps/web/package.json'));
const React=webRequire('react');
const {renderToStaticMarkup}=webRequire('react-dom/server');
function renderViewport(overrides={}) {
  const documentProps=[];
  const bindings={
    React,styles:new Proxy({},{get:(_target,key)=>String(key)}),viewportRef:{current:null},canvasRef:{current:null},
    loading:false,instrument:null,message:'This private Profile is unavailable.',setLoadAttempt:()=>{},
    QrCode:props=>React.createElement('svg',props),FileText:props=>React.createElement('svg',props),
    geometry:{width:8.5,height:11,margin:0.35,contentWidth:7.8,contentHeight:10.3},previewScale:0.4,
    mode:'handout',printSize:'letter',orientation:'portrait',theme:'light',printedTitle:'Public guitar',canonicalCode:'G0',serialDisplay:'',primaryFacts:[],
    condition:'',originalityStatus:'',includeAvailability:false,saleStatus:'',includeAttribution:false,
    activeFormat:{specifications:false,timeline:false,photo:true},includeSpecifications:false,printableSpecs:[],includeTimeline:false,timelineEntries:[],
    renderBadges:()=>null,includePhoto:true,photoUrl:'/public-photo.jpg',photoFit:'contain',qrDataUrl:'data:image/png;base64,synthetic',profileUrl:'https://www.qrguitar.com/i/G0',
    includeLogo:true,includeUrlLabel:true,includeScanInstruction:true,getContentValue:()=> 'Scan to view the Profile.',content:{},printNote:'',selectedService:null,
    PrintDocument:props=>{documentProps.push(props);return React.createElement('article',{'data-print-document':true},props.title);},
    ...overrides
  };
  const {render}=compile(`export function render(){return (${viewport.getText(pageAst)});}`,bindings);
  const element=render();
  return {html:renderToStaticMarkup(element),documentProps,element,viewportRef:bindings.viewportRef};
}
test('loading retains the measurement viewport without rendering a scaled blank sheet or retry',()=>{
  const {html,element,viewportRef}=renderViewport({loading:true});
  assert.equal(element.props.ref,viewportRef);assert.equal(element.props.className,'canvasViewport');
  assert.match(html,/role="status"/);assert.match(html,/aria-live="polite"/);assert.match(html,/Preparing Print Suite/);assert.match(html,/Loading the selected Profile/);
  assert.doesNotMatch(html,/class="(?:paperSpace|pageCanvas)"|--preview-scale|data-print-document|Try again/);
});
test('unavailable Profile has readable unscaled recovery content and a normal-size retry control',()=>{
  const {html}=renderViewport();
  assert.match(html,/class="loadStatus no-print" role="status"/);assert.match(html,/This private Profile is unavailable/);
  assert.match(html,/<button type="button" class="retryButton">Try again<\/button>/);
  assert.doesNotMatch(html,/class="(?:paperSpace|pageCanvas)"|--preview-scale|data-print-document/);
  assert.match(html,/class="printUnavailable"/,'Native print attempts must still explain why no document is available');
  const css=read('apps/web/app/handout/[code]/print-suite.module.css');
  assert.match(css,/\.retryButton\s*\{[^}]*min-height:\s*44px/);assert.match(css,/\.previewStageEmpty\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
});
test('loaded Profile keeps the same measurement viewport and the existing paper and document inputs',()=>{
  const {html,element,viewportRef,documentProps}=renderViewport({instrument:{qrCode:'G0'}});
  assert.equal(element.props.ref,viewportRef);assert.match(html,/class="paperSpace"/);assert.match(html,/class="pageCanvas"/);assert.match(html,/--preview-scale:0.4/);assert.match(html,/data-print-document="true"/);
  assert.doesNotMatch(html,/loadStatus|Try again|Print Suite unavailable/);assert.equal(documentProps.length,1);
  assert.equal(documentProps[0].title,'Public guitar');assert.equal(documentProps[0].code,'G0');assert.equal(documentProps[0].photo,'/public-photo.jpg');assert.equal(documentProps[0].profileUrl,'https://www.qrguitar.com/i/G0');
});
