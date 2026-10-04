import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// Portable, offline overlay. All filesystem reads are explicit; database is in-memory PGlite.
// Usage: node test-home-title-correction.mjs --repo CHECKOUT --fixture RAW_BACKUP.json [--mode staged|actual]
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? '' : process.argv[at + 1]; };
assert.ok(option('--repo') && option('--fixture'), 'Supply --repo and --fixture (read-only reference inputs).');
const repo = path.resolve(option('--repo')), fixturePath = path.resolve(option('--fixture'));
const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function selectSourceMode(scriptDirectory, referenceDirectory, requested = '') {
  const installed = path.resolve(scriptDirectory) === path.resolve(referenceDirectory);
  const mode = requested || (installed ? 'actual' : 'staged');
  assert.ok(mode === 'actual' || mode === 'staged', '--mode must be actual or staged');
  assert.ok(mode !== 'staged' || !installed, 'Refusing staged inventory scan of an actual checkout');
  return { mode, sourceRoot: mode === 'actual' ? referenceDirectory : scriptDirectory };
}
const { mode: sourceMode, sourceRoot: proposal } = selectSourceMode(scriptRoot, repo, option('--mode'));
const require = createRequire(path.join(repo, 'package.json')), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
const fixtureBytes = fs.readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString('utf8'));
assert.ok(fixture && typeof fixture === 'object' && !Array.isArray(fixture));
const allowedFixtureKeys = new Set(['schema','origin','capturedAt','draftValue','publishedAt','draftVersion','revisionRows','draftUpdatedAt','publishedValue','publishedVersion','editorActorId','field','before','after','operation','eligible','reason','publishedHash']);
assert.ok(Object.keys(fixture).every(key => allowedFixtureKeys.has(key)), 'Inspect changed fixture schema before loading it.');
assert.equal(Object.keys(fixture.publishedValue.content).length, 3813);
assert.equal(fixture.draftValue, null); assert.equal(fixture.draftVersion, '');
const published = fixture.publishedValue;
const fixtureSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const db = new PGlite();
const stagedSource = [
  'apps/web/lib/site-editor-home-title-contract.ts', 'apps/web/lib/site-editor-home-title-server.ts',
  'apps/web/app/api/site-editor/home-title/route.ts', 'apps/web/components/HomeTitleCorrection.tsx',
  'apps/web/app/site-editor/home-title/page.tsx'
];
const inputHashes = new Map();
function inputFile(relative) {
  const staged = path.join(proposal, relative), reference = path.join(repo, relative);
  const file = fs.existsSync(staged) ? staged : reference;
  const source = fs.readFileSync(file, 'utf8');
  inputHashes.set(file, createHash('sha256').update(source).digest('hex'));
  return { file, source };
}
function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const { file, source } = inputFile(relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, relative + ' syntax');
    new Function('require','module','exports', ...Object.keys(globals), compiled.outputText)(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (!name.startsWith('.')) return require(name);
      const stem = path.normalize(path.join(path.dirname(relative), name));
      const suffix = path.extname(stem) ? '' : ['.ts','.tsx'].find(ext => fs.existsSync(path.join(proposal, stem + ext)) || fs.existsSync(path.join(repo, stem + ext)));
      assert.ok(suffix !== undefined, 'Unresolved overlay import ' + name);
      return load(stem + suffix);
    }, module, module.exports, ...Object.values(globals));
    return module.exports;
  }
  return load;
}
const real = loader(), contract = real('apps/web/lib/site-editor-home-title-contract.ts');
const helper = real('apps/web/lib/site-editor-home-title-server.ts'), editorClient = real('apps/web/lib/site-editor-client.ts');
const key = contract.HOME_TITLE_KEY, prior = contract.HOME_TITLE_PRIOR, target = contract.HOME_TITLE_TARGET;
assert.equal(published.content[key], prior);
const settingsModule = real('apps/web/lib/site-settings.ts');
const state = async () => (await db.query('select read_site_editor_state() as state')).rows[0].state;
const snapshot = async () => (await db.query("select jsonb_build_object('content',(select jsonb_agg(to_jsonb(s) order by content_key) from site_content s),'audit',(select jsonb_agg(to_jsonb(a) order by id) from admin_audit_events a),'receipts',(select jsonb_agg(to_jsonb(r) order by request_id) from site_editor_receipts r)) as snapshot")).rows[0].snapshot;
let adminActor = actor, denied = 0, beforeMutation, loseResponse = false, reads = 0, writes = 0, lastSettings;
let overrideRaw, corruptReceipt = false, failIndependentRead = false, cacheFailure = false;
async function mutateRaw(request, settings) {
  return (await db.query('select mutate_site_editor($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) as result', [adminActor,'synthetic-admin@example.test',false,request,settings,{},null])).rows[0].result;
}
async function otherMutation(action, settings) {
  const s = await state();
  return mutateRaw({ action, expectedActorId: adminActor, requestId: randomUUID(), expectedPublishedVersion: s.publishedVersion, expectedDraftVersion: s.draftVersion }, settings);
}
const client = { async rpc(name, args) {
  if (name === 'read_site_editor_state') {
    reads++;
    if (failIndependentRead && writes) throw Error('Synthetic post-commit reread outage');
    return { data: overrideRaw ? overrideRaw(await state()) : await state(), error: null };
  }
  assert.equal(name, 'mutate_site_editor'); writes++; lastSettings = args.p_settings;
  assert.deepEqual(args.p_defaults, {}); assert.equal(args.p_revision_value, null);
  assert.equal(args.p_actor_id, adminActor); assert.equal(args.p_env_authorized, false);
  if (beforeMutation) { const hook = beforeMutation; beforeMutation = undefined; await hook(); }
  let result;
  try { result = await mutateRaw(args.p_request, args.p_settings); }
  catch (error) { return { data: null, error: { code: error.code } }; }
  if (loseResponse) { loseResponse = false; throw Error('Synthetic lost response AFTER actual offline commit'); }
  if (corruptReceipt) { corruptReceipt = false; result.changedFields = ['wrong.field']; }
  return { data: result, error: null };
} };
const cacheCalls = [];
const route = loader({
  'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type':'application/json', ...init.headers } }) } },
  'next/cache': { unstable_noStore() {}, revalidatePath: (...args) => { cacheCalls.push(args); if (cacheFailure) throw Error('Synthetic cache outage'); } },
  '../../../../lib/admin-auth': { getAdminContext: async () => denied ? { ok:false,status:denied,message:'Admin access required.' } : { ok:true,user:{id:adminActor},email:'synthetic-admin@example.test' }, readAdminEmailList: () => [] },
  '../../../../lib/supabase-server': { createServerSupabaseClientWithTimeout: () => client }
})('apps/web/app/api/site-editor/home-title/route.ts');
const get = async () => { const res = await route.GET(new Request('https://isolated.invalid/api/site-editor/home-title')); return { status:res.status,body:await res.json(),headers:res.headers }; };
const post = async body => { const res = await route.POST(new Request('https://isolated.invalid/api/site-editor/home-title', { method:'POST',body:typeof body === 'string' ? body : JSON.stringify(body) })); return { status:res.status,payload:await res.json() }; };
const requestFor = async () => { const s = await state(); return { operation:'correct',field:key,value:target,expectedValue:prior,expectedActorId:adminActor,requestId:randomUUID(),expectedPublishedVersion:s.publishedVersion,expectedDraftVersion:'' }; };
const changedPaths = (before, after, prefix = '') => {
  if (isDeepStrictEqual(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const indices = Array.from({ length: Math.max(before.length, after.length) }, (_v, i) => i);
    return [...(before.length === after.length ? [] : [prefix + '.length']), ...indices.flatMap(i => {
      const at = `${prefix}[${i}]`;
      return Object.hasOwn(before, i) !== Object.hasOwn(after, i) ? [at] : changedPaths(before[i], after[i], at);
    })];
  }
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(before) || !object(after)) return [prefix];
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(k => {
    const at = prefix ? prefix + '.' + k : k;
    return Object.hasOwn(before,k) !== Object.hasOwn(after,k) ? [at] : changedPaths(before[k],after[k],at);
  });
};
async function reset(baseline = published) {
  await db.exec('delete from site_editor_receipts; delete from admin_audit_events; delete from site_content;');
  await db.query("update profiles set role='admin',account_status='active' where id=$1", [actor]);
  await db.query("insert into site_content(content_key,content_value) values('homepage',$1),('unrelated','{\"keep\":true}')", [baseline]);
  adminActor=actor; denied=0; beforeMutation=undefined; loseResponse=false; reads=0; writes=0;
  overrideRaw=undefined; corruptReceipt=false; failIndependentRead=false; cacheFailure=false; cacheCalls.length=0;
}
const results = [];
let currentTest = '';
async function test(name, fn) { currentTest=name; await reset(); await fn(); results.push({ name,pass:true }); console.log('PASS ' + name); }
// The review child is a real pure React function; expand it instead of dropping its rendered content.
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v,...nodes(typeof v.type==='function'?v.type(v.props):v.props?.children)] : [];
const text = v => Array.isArray(v) ? v.map(text).join('') : typeof v === 'string' ? v : v && typeof v === 'object' ? text(typeof v.type==='function'?v.type(v.props):v.props?.children) : '';
function uiFixture(storage = new Map(), fetchOverride, options = {}) {
  let cursor=0,dirty=true,mounted=true,tree,lateWrites=0;
  const slots=[],effects=[],listeners=new Set(),downloads=[],calls=[],redirects=[];
  let session = Object.hasOwn(options,'session') ? options.session : { user:{id:actor} };
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const hooks={
    useState(initial) { const i=cursor++; slots[i]??={value:initial}; return [slots[i].value,next=>{if(!mounted)lateWrites++;slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}]; },
    useRef(initial) { const i=cursor++; slots[i]??={current:initial}; return slots[i]; },
    useCallback(fn,deps) { const i=cursor++; if(!same(slots[i]?.deps,deps))slots[i]={value:fn,deps};return slots[i].value; },
    useEffect(run,deps) { const i=cursor++;slots[i]??={};if(!same(slots[i].deps,deps))effects.push(()=>{slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=run();}); }
  };
  const browserStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(options.storageFails)throw Error('Storage denied');storage.set(k,v);},removeItem:k=>storage.delete(k)};
  const auth={getSession:()=>typeof options.sessionRead==='function'?options.sessionRead():options.sessionRead||Promise.resolve({data:{session},error:null}),onAuthStateChange:fn=>{listeners.add(fn);return{data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};}};
  class BrowserURL extends URL { static createObjectURL(blob){downloads.push(blob);return'blob:offline-backup';}static revokeObjectURL(){} }
  const router={replace:url=>redirects.push(url)};
  const view=loader({react:hooks,'next/link':{__esModule:true,default:'a'},'next/navigation':{useRouter:()=>router},
    '../lib/supabase-browser':{createBrowserSupabaseClient:()=>({auth}),getSupabaseAccessToken:async()=>session?'synthetic-test-session':''},
    '../lib/use-auth-navigation':{useAuthNavigation:()=>({logout:async()=>true,signingOut:false,logoutError:''})}
  },{window:{sessionStorage:browserStorage,setTimeout,clearTimeout,location:{origin:'https://isolated.invalid'}},URL:BrowserURL,crypto:{randomUUID},document:{createElement:()=>({click(){}})},
    fetch:async(url,init)=>{calls.push({url,method:init.method,body:init.body});if(fetchOverride)return fetchOverride(url,init);const req=new Request('https://isolated.invalid'+url,init);return init.method==='POST'?route.POST(req):route.GET(req);}
  })('apps/web/components/HomeTitleCorrection.tsx');
  const ui={
    render(){for(let i=0;i<30;i++){if(dirty){dirty=false;cursor=0;tree=view.HomeTitleCorrection();}effects.splice(0).forEach(fn=>fn());if(!dirty)return;}throw Error('UI did not settle');},
    async flush(){for(let i=0;i<12;i++){await new Promise(done=>setImmediate(done));ui.render();}},
    all:()=>nodes(tree),text:()=>text(tree),
    button(label){const b=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(b,'Expected button '+label);return b;},
    async click(label){const b=ui.button(label);assert.ok(!b.props.disabled,label+' must be enabled');b.props.onClick();ui.render();await ui.flush();},
    confirm(){const box=nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.ok(box&&!box.props.disabled);box.props.onChange({target:{checked:true}});ui.render();},
    emit(next,event=next?'SIGNED_IN':'SIGNED_OUT'){const delivered=next?{user:{id:next}}:null;if(event!=='INITIAL_SESSION')session=delivered;listeners.forEach(fn=>fn(event,delivered));ui.render();},
    dispose(){mounted=false;slots.forEach(s=>s.cleanup?.());},downloads,calls,redirects,lateWrites:()=>lateWrites
  };ui.render();return ui;
}
function strictTypecheck() {
  // Virtual overlay rooted at the reference repo; no files or build output are written there.
  const config=ts.readConfigFile(path.join(repo,'apps/web/tsconfig.json'),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(repo,'apps/web'));
  const options={...parsed.options,incremental:false,noEmit:true};
  const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host);
  const overlay=file=>{const relative=path.relative(repo,file);return !relative.startsWith('..')?path.join(proposal,relative):'';};
  host.readFile=file=>{const candidate=overlay(file);return candidate&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?fs.readFileSync(candidate,'utf8'):read(file);};
  host.fileExists=file=>{const candidate=overlay(file);return Boolean(candidate&&fs.existsSync(candidate)&&fs.statSync(candidate).isFile())||exists(file);};
  const roots=stagedSource.map(p=>path.join(repo,p));
  const program=ts.createProgram([...roots,path.join(repo,'apps/web/next-env.d.ts')],options,host);
  for(let i=0;i<roots.length;i++){const source=program.getSourceFile(roots[i]);assert.ok(source,'Staged root was loaded: '+stagedSource[i]);assert.equal(source.text,inputFile(stagedSource[i]).source,'Typecheck uses staged source, not another checkout');}
  const all=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(all.filter(d=>!d.file).length,0,'Global compiler/configuration diagnostics');
  const diagnostics=all.filter(d=>d.file&&roots.some(r=>path.resolve(r)===path.resolve(d.file.fileName)));
  if(diagnostics.length)console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>repo,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  assert.equal(diagnostics.length,0,'Strict semantic TypeScript errors in the five proposed source files');
}
try {
  await installRepositorySchema(db,repo,'20260911003500');
  await db.exec(fs.readFileSync(path.join(repo,'supabase/migrations/20260911003500_atomic_site_editor.sql'),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[actor,other]);
  await db.query("insert into profiles(id,display_name,role) values($1,'Synthetic editor','admin'),($2,'Other editor','admin')",[actor,other]);

  await test('GET is read-only; real3813 raw snapshot, actor, exact titles, revisions and canonical hash',async()=>{
    const before=await snapshot(),res=await get(),p=res.body.preflight;
    assert.equal(res.status,200);assert.equal(p.eligible,true);assert.equal(p.editorActorId,actor);assert.equal(p.before,prior);assert.equal(p.after,target);
    assert.deepEqual(p.publishedValue,published);assert.equal(Object.keys(p.publishedValue.content).length,3813);assert.equal(p.draftVersion,'');assert.equal(p.draftValue,null);
    assert.equal(p.publishedHash,helper.rawSnapshotHash(published));assert.match(res.headers.get('cache-control'),/no-store/);assert.equal(writes,0);assert.deepEqual(await snapshot(),before);
  });
  await test('actual route+atomic SQL publish exactly one raw path; all3813 keys/pricing/policy preserved',async()=>{
    const before=await state(),res=await post(await requestFor()),after=await state();
    assert.equal(res.status,200);assert.equal(res.payload.committed,true);assert.equal(res.payload.independentlyVerified,true);
    assert.deepEqual(changedPaths(before.publishedValue,after.publishedValue),['content.'+key]);assert.equal(Object.keys(after.publishedValue.content).length,3813);
    assert.notEqual(after.publishedVersion,before.publishedVersion);assert.equal(after.draftVersion,'');assert.equal(after.draftValue,null);
    const policyPricing=Object.keys(published.content).filter(k=>/privacy|terms|pricing|allowance|credits/i.test(k));assert.ok(policyPricing.length>20);
    for(const k of policyPricing)assert.equal(after.publishedValue.content[k],published.content[k]);
    assert.deepEqual(res.payload.record.changedFields,[key]);assert.deepEqual(res.payload.record.before,published);helper.assertRawTitleChange(published,res.payload.record.after);
    const revision=(await db.query('select content_value from site_content where content_key=$1',[after.revisionRows[0].content_key])).rows[0].content_value;
    assert.deepEqual(revision.settings,published);assert.equal((await db.query('select count(*)::int as n from admin_audit_events')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int as n from site_editor_receipts')).rows[0].n,1);assert.ok(cacheCalls.some(c=>c[0]==='/'));
  });
  await test('original atomic SQL retains raw revision and restores only title in disposable memory; no rollback route',async()=>{
    assert.equal((await post(await requestFor())).status,200);
    const s=await state(),revisionId=s.revisionRows[0].content_key;
    const revision=(await db.query('select content_value from site_content where content_key=$1',[revisionId])).rows[0].content_value;
    assert.deepEqual(revision.settings,published);
    const request={action:'restore_revision',revisionId,expectedActorId:actor,requestId:randomUUID(),expectedPublishedVersion:s.publishedVersion,expectedDraftVersion:s.draftVersion};
    await db.query('select mutate_site_editor($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb)',[actor,'synthetic-admin@example.test',false,request,revision.settings,{},revision]);
    const drafted=await state();assert.equal(drafted.publishedValue.content[key],target);assert.deepEqual(drafted.draftValue.settings,published);
    await otherMutation('publish',drafted.draftValue.settings);
    const restored=await state();assert.deepEqual(restored.publishedValue,published);assert.equal(restored.draftValue,null);
    assert.deepEqual(changedPaths(s.publishedValue,restored.publishedValue),['content.'+key]);
    // This test uses only the original SQL inside PGlite, not a new app restore operation.
  });
  await test('real snapshot plus unknown keys, whitespace, nulls, arrays, numbers and omissions survive',async()=>{
    const weird=JSON.parse(JSON.stringify(published));
    delete weird.dashboard;delete weird.instrumentCategories;
    weird.brandName='  Untouched brand  ';weird.unknownTop={arr:[null,false,7,1.25,' text ',{z:2,a:1}],__nested:{keep:true}};
    weird.content['legacy.unknown']={keep:[null,7,' value ']};weird.content['legacy.null']=null;weird.content['legacy.array']=['z','a'];
    Object.defineProperty(weird,'__proto__',{value:{preserve:'own-property'},enumerable:true,writable:true,configurable:true});
    await reset(weird);const res=await post(await requestFor());assert.equal(res.status,200);
    const after=(await state()).publishedValue;assert.deepEqual(after,{...weird,content:{...weird.content,[key]:target}});
    assert.equal(Object.hasOwn(after,'dashboard'),false);assert.equal(Object.hasOwn(after,'instrumentCategories'),false);assert.deepEqual(after.unknownTop.arr,weird.unknownTop.arr);
    assert.equal(after.brandName,'  Untouched brand  ');assert.equal(after.content['legacy.null'],null);
  });
  await test('object property order is semantic-equal; array order changes fail preservation invariant',async()=>{
    const before={content:{[key]:prior,x:'keep'},unknown:{z:2,a:[1,2]},omitted:null};
    const after={omitted:null,unknown:{a:[1,2],z:2},content:{x:'keep',[key]:target}};
    helper.assertRawTitleChange(before,after);assert.equal(helper.rawSnapshotHash(before),helper.rawSnapshotHash({omitted:null,unknown:{a:[1,2],z:2},content:{x:'keep',[key]:prior}}));
    assert.throws(()=>helper.assertRawTitleChange(before,{...after,unknown:{a:[2,1],z:2}}));
    assert.deepEqual(changedPaths(before.unknown.a,[2,1],'arr'),['arr[0]','arr[1]']);
    assert.deepEqual(changedPaths(before.unknown.a,[1,3],'arr'),['arr[1]']);
    assert.deepEqual(changedPaths(before.unknown.a,[1,2,3],'arr'),['arr.length','arr[2]']);
    assert.throws(()=>helper.assertRawTitleChange(before,{...after,unknown:{a:[1,2,3],z:2}}));
    const missing={...after};delete missing.omitted;assert.throws(()=>helper.assertRawTitleChange(before,missing));
    assert.throws(()=>helper.assertRawTitleChange(before,{...after,unregisteredTopLevel:'must not add'}));
    assert.throws(()=>helper.assertRawTitleChange(before,{...after,content:{...after.content,extra:'must not add'}}));
  });
  await test('normalization expands effective defaults but never persists them',async()=>{
    const sparse={content:{[key]:prior,'privacy.custom':' keep '},unknown:[null,9]};await reset(sparse);
    assert.ok(Object.keys(settingsModule.mergeSiteSettings(sparse).content).length>3813);
    const res=await post(await requestFor());assert.equal(res.status,200);assert.deepEqual((await state()).publishedValue,{...sparse,content:{...sparse.content,[key]:target}});
  });
  await test('wrong key/target/prior/settings/action/rollback/body injection rejected before mutation',async()=>{
    const valid=await requestFor();
    for(const change of [{field:'resetPassword.hero.body'},{value:prior},{value:'x'.repeat(71)},{expectedValue:'Another title'},{settings:published},{action:'publish'},{operation:'restore'},{source:'recovery-copy-v1'},{extra:true}]){
      const before=await snapshot(),res=await post({...valid,...change});assert.equal(res.status,400);assert.deepEqual(await snapshot(),before);
    }assert.equal(writes,0);assert.equal((await post('{')).status,400);
  });
  await test('missing preconditions428; malformed IDs400; changed actor403; draft precondition409',async()=>{
    const valid=await requestFor();
    for(const missing of ['expectedActorId','requestId','expectedPublishedVersion','expectedDraftVersion']){const b={...valid};delete b[missing];assert.equal((await post(b)).status,428);}
    for(const change of [{requestId:'bad'},{expectedPublishedVersion:'bad'},{expectedDraftVersion:null}])assert.equal((await post({...valid,...change})).status,400);
    assert.equal((await post({...valid,expectedActorId:other})).status,403);assert.equal((await post({...valid,expectedDraftVersion:randomUUID()})).status,409);assert.equal(writes,0);
  });
  await test('401/403 prevent all raw reads and writes',async()=>{
    const body=await requestFor();for(const status of [401,403]){denied=status;assert.equal((await get()).status,status);assert.equal((await post(body)).status,status);}assert.equal(reads,0);assert.equal(writes,0);
  });
  await test('later legitimate title and already-approved title are ineligible; never overwritten',async()=>{
    for(const title of ['A later legitimate title',target]){await reset({...published,content:{...published.content,[key]:title}});const p=(await get()).body.preflight;assert.equal(p.eligible,false);
      const before=await snapshot(),res=await post(await requestFor());assert.equal(res.status,409);assert.deepEqual(await snapshot(),before);assert.equal(writes,0);}
  });
  await test('effective contrast, raw brand logos, canonical and brand validation fail closed',async()=>{
    const invalid=[{...published,colors:{...published.colors,text:published.colors.background}},
      {...published,brandLogos:null},{...published,seo:{...published.seo,canonicalUrl:'http://example.invalid'}},{...published,brandName:'   '}];
    for(const baseline of invalid){await reset(baseline);assert.equal((await get()).body.preflight.eligible,false);const before=await snapshot(),res=await post(await requestFor());assert.equal(res.status,400);assert.ok(res.payload.errors);assert.deepEqual(await snapshot(),before);assert.equal(writes,0);}
  });
  await test('invalid registered effective content fails without auto-repairing unrelated copy',async()=>{
    const registry=real('apps/web/lib/content-registry.ts');const entry=registry.contentRegistry.find(e=>e.allowedValues?.length&&e.key!==key);assert.ok(entry);
    const baseline={...published,content:{...published.content,[entry.key]:'invalid-choice'}};await reset(baseline);
    const before=await snapshot(),res=await post(await requestFor());assert.equal(res.status,400);assert.ok(res.payload.errors[entry.key]);assert.deepEqual(await snapshot(),before);
  });
  await test('protected-content validation is actually invoked and cannot be bypassed',async()=>{
    let called=0;const registry=real('apps/web/lib/content-registry.ts');
    const blockedHelper=loader({'./content-registry':{...registry,validateProtectedContentValues:(after,before)=>{called++;assert.notEqual(after[key],before[key]);return{'locked.test':'Synthetic protected-copy rejection'};}}})('apps/web/lib/site-editor-home-title-server.ts');
    const s=await state(),request=await requestFor();assert.throws(()=>blockedHelper.prepareHomeTitleSettings(s,request),e=>Boolean(e.errors?.['locked.test']));assert.equal(called,1);
  });
  await test('same-content shared draft and malformed present-draft/empty-version are blocked',async()=>{
    await otherMutation('save_draft',published);assert.equal((await get()).body.preflight.eligible,false);const before=await snapshot();assert.equal((await post(await requestFor())).status,409);assert.deepEqual(await snapshot(),before);
    await reset();overrideRaw=s=>({...s,draftValue:{settings:published},draftVersion:''});assert.equal((await get()).body.preflight.eligible,false);assert.equal((await post(await requestFor())).status,409);assert.equal(writes,0);
  });
  await test('concurrent draft remains intact; atomic version checks reject stale correction',async()=>{
    const b=await requestFor();beforeMutation=()=>otherMutation('save_draft',{...published,newDraft:'preserve'});
    assert.equal((await post(b)).status,409);const s=await state();assert.deepEqual(s.publishedValue,published);assert.equal(s.draftValue.settings.newDraft,'preserve');
  });
  await test('concurrent publication remains intact and stale-without-receipt uses null settings',async()=>{
    const b=await requestFor(),later={...published,concurrent:{preserve:true}};beforeMutation=()=>otherMutation('publish',later);
    assert.equal((await post(b)).status,409);assert.deepEqual((await state()).publishedValue,later);
    const before=await snapshot();assert.equal((await post(b)).status,409);assert.equal(lastSettings,null);assert.deepEqual(await snapshot(),before);
  });
  await test('RPC rechecks actual admin role/status after API authorization',async()=>{
    const b=await requestFor();await db.query("update profiles set account_status='locked' where id=$1",[actor]);
    const before=await snapshot(),res=await post(b);assert.equal(res.status,403);assert.equal(res.payload.code,'QSE05');assert.deepEqual(await snapshot(),before);
  });
  await test('lost response retries frozen request after new draft; receipt-first replay writes nothing',async()=>{
    const p=(await get()).body.preflight,store=new Map(),wire=[];
    const c=editorClient.createEditorMutationController({actorId:actor,storageScope:contract.HOME_TITLE_SOURCE,storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},uuid:randomUUID,
      send:async b=>{wire.push(b);return post(b);}});
    loseResponse=true;await assert.rejects(c.mutate({operation:'correct',field:key,value:target,expectedValue:prior},p,'review'),e=>e.uncertain===true);
    assert.equal((await state()).publishedValue.content[key],target);assert.ok(c.pending);
    await otherMutation('save_draft',{...(await state()).publishedValue,laterDraft:true});assert.equal((await get()).body.preflight.eligible,false);
    const before=await snapshot(),res=await c.retry();assert.equal(wire[1],wire[0]);assert.equal(lastSettings,null);assert.equal(res.replayed,true);assert.equal(res.superseded,true);assert.equal(res.independentlyVerified,false);assert.equal(c.pending,null);assert.deepEqual(await snapshot(),before);
  });
  await test('replay survives later title/validation drift; valid changed body under same UUID409',async()=>{
    const b=await requestFor();assert.equal((await post(b)).status,200);
    const later={...published,content:{...published.content,[key]:'Later reviewed title'},colors:{...published.colors,text:published.colors.background}};await otherMutation('publish',later);
    const before=await snapshot(),res=await post(b);assert.equal(res.status,200);assert.equal(res.payload.replayed,true);assert.equal(res.payload.superseded,true);assert.equal(lastSettings,null);assert.deepEqual(await snapshot(),before);
    const mismatch=await post({...b,expectedPublishedVersion:randomUUID()});assert.equal(mismatch.status,409);assert.equal(mismatch.payload.code,'QSE02');assert.deepEqual(await snapshot(),before);
  });
  await test('post-commit malformed response stays uncertain; exact retry reconciles existing receipt',async()=>{
    const b=await requestFor();corruptReceipt=true;const res=await post(b);assert.equal(res.status,503);assert.equal(res.payload.uncertain,true);assert.equal((await state()).publishedValue.content[key],target);
    const before=await snapshot(),retry=await post(b);assert.equal(retry.status,200);assert.equal(retry.payload.replayed,true);assert.deepEqual(await snapshot(),before);
  });
  await test('cache failure or independent-read outage never falsely reports a rejected commit',async()=>{
    cacheFailure=true;let res=await post(await requestFor());assert.equal(res.status,200);assert.equal(res.payload.committed,true);assert.match(res.payload.message,/cached pages/);
    await reset();failIndependentRead=true;res=await post(await requestFor());assert.equal(res.status,200);assert.equal(res.payload.committed,true);assert.equal(res.payload.independentlyVerified,false);
  });
  await test('controller requires durable recovery storage before any send',async()=>{
    let sends=0;const p=(await get()).body.preflight;
    const c=editorClient.createEditorMutationController({actorId:actor,storageScope:contract.HOME_TITLE_SOURCE,storage:{getItem:()=>null,setItem:()=>{throw Error('denied');},removeItem(){}},uuid:randomUUID,send:async()=>{sends++;return{};}});
    await assert.rejects(c.mutate({operation:'correct',field:key,value:target,expectedValue:prior},p,'review'));assert.equal(sends,0);assert.equal(writes,0);
  });
  await test('actual review renders actor/both revisions/exact titles; UI requires raw backup+explicit confirmation',async()=>{
    const ui=uiFixture();await ui.flush();assert.equal(writes,0);assert.equal(ui.calls.filter(c=>c.method==='POST').length,0);
    await ui.click('Review saved title');assert.match(ui.text(),new RegExp(actor));assert.ok(ui.text().includes(prior)&&ui.text().includes(target));assert.equal(ui.button('Publish only this title').props.disabled,true);
    await ui.click('Download raw backup');const backup=JSON.parse(await ui.downloads[0].text());assert.deepEqual(backup.publishedValue,published);assert.equal(backup.editorActorId,actor);assert.equal(backup.draftValue,null);
    assert.equal(ui.button('Publish only this title').props.disabled,true);ui.confirm();await ui.click('Publish only this title');assert.equal((await state()).publishedValue.content[key],target);
    assert.equal(ui.calls.filter(c=>c.method==='POST').length,1);await ui.click('Download transaction record');const record=JSON.parse(await ui.downloads[1].text());assert.deepEqual(record.before,published);helper.assertRawTitleChange(record.before,record.after);
    await ui.click('Review saved title');assert.equal(ui.all().some(n=>n.type==='button'&&text(n)==='Publish only this title'),false);ui.dispose();
  });
  await test('actual UI synchronous busy guard prevents duplicate click even before rerender',async()=>{
    const ui=uiFixture();await ui.flush();await ui.click('Review saved title');await ui.click('Download raw backup');ui.confirm();
    const b=ui.button('Publish only this title');b.props.onClick();b.props.onClick();ui.render();await ui.flush();assert.equal(ui.calls.filter(c=>c.method==='POST').length,1);ui.dispose();
  });
  await test('actual UI reload restores uncertainty and retries identical body after newer draft',async()=>{
    const store=new Map(),ui=uiFixture(store);await ui.flush();await ui.click('Review saved title');await ui.click('Download raw backup');ui.confirm();loseResponse=true;await ui.click('Publish only this title');
    const original=ui.calls.find(c=>c.method==='POST').body;assert.equal(ui.button('Review saved title').props.disabled,true);ui.dispose();
    await otherMutation('save_draft',{...(await state()).publishedValue,laterDraft:true});const before=await snapshot();
    const reloaded=uiFixture(store);await reloaded.flush();await reloaded.click('Retry the same request');assert.equal(reloaded.calls.find(c=>c.method==='POST').body,original);assert.deepEqual(await snapshot(),before);assert.match(reloaded.text(),/Later changes exist/);reloaded.dispose();
  });
  await test('unsettled/signed-out/non-admin access never exposes correction or redirects prematurely',async()=>{
    let finish;const waiting=new Promise(done=>{finish=done;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});await ui.flush();assert.match(ui.text(),/Checking admin access/);assert.equal(ui.calls.length,0);assert.deepEqual(ui.redirects,[]);
    finish({data:{session:null}});await ui.flush();assert.deepEqual(ui.redirects,['/login?next=%2Fsite-editor%2Fhome-title']);assert.doesNotMatch(ui.text(),/Homepage title correction|Publish only/);ui.dispose();
    denied=403;const deniedUi=uiFixture();await deniedUi.flush();assert.match(deniedUi.text(),/Admin access required/);assert.doesNotMatch(deniedUi.text(),/Homepage title correction|raw backup/);deniedUi.dispose();assert.equal(writes,0);
  });
  await test('INITIAL_SESSION null then SDK error stays recoverable, not confirmed signed-out',async()=>{
    let finish;const waiting=new Promise(done=>{finish=done;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});
    ui.emit(null,'INITIAL_SESSION');await ui.flush();assert.match(ui.text(),/Checking admin access/);assert.deepEqual(ui.redirects,[]);assert.equal(ui.calls.length,0);
    finish({data:{session:null},error:Error('Synthetic SDK refresh failure')});await ui.flush();assert.match(ui.text(),/Admin workspace unavailable/);assert.deepEqual(ui.redirects,[]);assert.equal(ui.calls.length,0);
    ui.emit(null,'INITIAL_SESSION');await ui.flush();assert.match(ui.text(),/Admin workspace unavailable/);assert.deepEqual(ui.redirects,[]);ui.dispose();
  });
  await test('SDK error before INITIAL_SESSION null stays unavailable; owner event recovers normally',async()=>{
    const ui=uiFixture(new Map(),undefined,{sessionRead:Promise.resolve({data:{session:null},error:Error('Synthetic SDK error')})});await ui.flush();assert.match(ui.text(),/Admin workspace unavailable/);
    ui.emit(null,'INITIAL_SESSION');await ui.flush();assert.match(ui.text(),/Admin workspace unavailable/);assert.deepEqual(ui.redirects,[]);
    ui.emit(actor,'SIGNED_IN');await ui.flush();assert.match(ui.text(),/Homepage title correction/);assert.ok(ui.button('Review saved title'));assert.equal(writes,0);ui.dispose();
  });
  await test('INITIAL_SESSION null plus successful explicit null read confirms guest only after read',async()=>{
    let finish;const waiting=new Promise(done=>{finish=done;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});ui.emit(null,'INITIAL_SESSION');await ui.flush();assert.deepEqual(ui.redirects,[]);
    finish({data:{session:null},error:null});await ui.flush();assert.match(ui.text(),/Sign in to continue/);assert.deepEqual(ui.redirects,['/login?next=%2Fsite-editor%2Fhome-title']);assert.equal(ui.calls.length,0);ui.dispose();
  });
  await test('rejected explicit read plus ambiguous SDK event never redirects or exposes title tool',async()=>{
    let reject;const waiting=new Promise((_done,fail)=>{reject=fail;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});ui.emit(null,'INITIAL_SESSION');reject(Error('Synthetic transport rejection'));await ui.flush();
    assert.match(ui.text(),/Admin workspace unavailable/);assert.deepEqual(ui.redirects,[]);assert.equal(ui.calls.length,0);assert.doesNotMatch(ui.text(),/Homepage title correction/);ui.dispose();
  });
  await test('new owner SIGNED_IN outranks late SDK read failure and ambiguous initial null',async()=>{
    let finish;const waiting=new Promise(done=>{finish=done;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});ui.emit(actor,'SIGNED_IN');await ui.flush();assert.match(ui.text(),/Homepage title correction/);
    ui.emit(null,'INITIAL_SESSION');finish({data:{session:null},error:Error('Late SDK failure')});await ui.flush();assert.match(ui.text(),/Homepage title correction/);assert.deepEqual(ui.redirects,[]);assert.equal(writes,0);ui.dispose();
  });
  await test('later SIGNED_OUT beats stale owner read; pending raw GET cannot resurrect workspace',async()=>{
    let finishRead,finishGet;const read=new Promise(done=>{finishRead=done;}),getWait=new Promise(done=>{finishGet=done;});
    const p=(await get()).body.preflight,ui=uiFixture(new Map(),()=>getWait,{sessionRead:read});ui.emit(actor,'SIGNED_IN');await ui.flush();ui.emit(null,'SIGNED_OUT');
    finishRead({data:{session:{user:{id:actor}}},error:null});finishGet(new Response(JSON.stringify({ok:true,preflight:p}),{status:200}));await ui.flush();
    assert.match(ui.text(),/Sign in to continue/);assert.doesNotMatch(ui.text(),/Homepage title correction/);assert.deepEqual(ui.redirects,['/login?next=%2Fsite-editor%2Fhome-title']);assert.equal(writes,0);ui.dispose();
  });
  await test('failed initial read can retry successful owner session using normal observer',async()=>{
    let healthy=false;const ui=uiFixture(new Map(),undefined,{sessionRead:()=>Promise.resolve(healthy?{data:{session:{user:{id:actor}}},error:null}:{data:{session:null},error:Error('Temporary startup failure')})});
    await ui.flush();assert.match(ui.text(),/Admin workspace unavailable/);healthy=true;await ui.click('Retry access check');assert.match(ui.text(),/Homepage title correction/);assert.deepEqual(ui.redirects,[]);assert.equal(writes,0);ui.dispose();
  });
  await test('unmount before session read resolves cancels observer and creates no network/UI writes',async()=>{
    let finish;const waiting=new Promise(done=>{finish=done;});const ui=uiFixture(new Map(),undefined,{sessionRead:waiting});ui.dispose();finish({data:{session:{user:{id:actor}}},error:null});await ui.flush();
    assert.equal(ui.calls.length,0);assert.equal(ui.lateWrites(),0);assert.equal(writes,0);
  });
  await test('Auth change hides review and late request; unmount does not update dead UI',async()=>{
    let finish,count=0;const waiting=new Promise(done=>{finish=done;});const p=(await get()).body.preflight;
    const ui=uiFixture(new Map(),(url,init)=>++count===2?waiting:route.GET(new Request('https://isolated.invalid'+url,init)));await ui.flush();
    ui.button('Review saved title').props.onClick();ui.render();await ui.flush();denied=403;ui.emit(other);assert.doesNotMatch(ui.text(),/Homepage title correction|raw backup/);
    finish(new Response(JSON.stringify({ok:true,preflight:p}),{status:200}));await ui.flush();assert.match(ui.text(),/Admin access required/);assert.equal(writes,0);ui.dispose();assert.equal(ui.lateWrites(),0);
  });
  await test('installed harness defaults to actual-source mode and rejects checkout-wide staged inventory',async()=>{
    assert.deepEqual(selectSourceMode(repo,repo),{mode:'actual',sourceRoot:repo});
    assert.deepEqual(selectSourceMode(scriptRoot,repo,'actual'),{mode:'actual',sourceRoot:repo});
    assert.throws(()=>selectSourceMode(repo,repo,'staged'));
    const separateRoot=path.join(repo,'isolated-proposal-example');
    assert.deepEqual(selectSourceMode(separateRoot,repo),{mode:'staged',sourceRoot:separateRoot});
  });
  await test('private non-autosaving page; additions-only inventory scoped exclusively to separate staged root',async()=>{
    const page=inputFile('apps/web/app/site-editor/home-title/page.tsx').source;assert.match(page,/index: false/);assert.match(page,/HomeTitleCorrection/);assert.doesNotMatch(page,/SiteEditorPage|save_draft|<Nav|<Footer/);
    const component=inputFile('apps/web/components/HomeTitleCorrection.tsx').source;assert.doesNotMatch(component,/save_draft|issueDraftPreview|test-email|window\.localStorage|restore_revision/);
    if(sourceMode==='staged') {
      assert.notEqual(path.resolve(proposal),path.resolve(repo));
      assert.equal(fs.existsSync(path.join(proposal,'supabase')),false);
      const staged=[];function list(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())list(p);else staged.push(path.relative(proposal,p).replaceAll('\\','/'));}}list(proposal);
      assert.deepEqual(staged.sort(),[...stagedSource,'apps/web/scripts/test-home-title-correction.mjs'].sort());
    } else {
      // Only five explicit actual source roots. Never recurse a checkout/node_modules
      // or claim unrelated protected files unchanged without baseline hash evidence.
      assert.equal(path.resolve(proposal),path.resolve(repo));
      for(const relative of stagedSource)assert.equal(inputFile(relative).file,path.join(repo,relative));
    }
  });
  await test('strict semantic TypeScript: five proposed files against readonly reference dependencies',async()=>strictTypecheck());
  for(const[file,hash]of inputHashes)assert.equal(createHash('sha256').update(fs.readFileSync(file,'utf8')).digest('hex'),hash,'Input file changed during test: '+file);
  console.log(JSON.stringify({schema:'home-title-offline-result-v1',sourceMode,passed:results.length,fixtureSha256,realRawContentKeys:3813,sourceFiles:stagedSource,liveRequests:0,database:'in-memory PGlite + real repository atomic SQL035',browserEvidence:false,tests:results}));
} catch(error) {
  console.error(JSON.stringify({failedTest:currentTest,message:String(error.message).slice(0,1600),code:error.code,passedBeforeFailure:results.length}));
  process.exitCode=1;
} finally {await db.close();}
