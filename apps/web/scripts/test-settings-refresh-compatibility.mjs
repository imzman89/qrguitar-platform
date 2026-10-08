import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';

const require=createRequire(import.meta.url), ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function loader(overrides={}, globals={}) {
  const cache=new Map();
  function load(relative) {
    if(Object.hasOwn(overrides,relative))return overrides[relative];
    if(cache.has(relative))return cache.get(relative).exports;
    const file=path.join(root,relative), module={exports:{}};
    cache.set(relative,module);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    new Function('require','module','exports','globalThis','fetch','window',code)(name=>{
      if(Object.hasOwn(overrides,name))return overrides[name];
      if(!name.startsWith('.'))return require(name);
      const base=path.resolve(path.dirname(file),name);
      const dependency=['.ts','.tsx','.mjs'].map(ext=>base+ext).find(fs.existsSync);
      if(!dependency)throw Error('Unexpected dependency '+name);
      return load(path.relative(root,dependency).replaceAll('\\','/'));
    },module,module.exports,globals.globalThis??globalThis,globals.fetch??fetch,globals.window);
    return module.exports;
  }
  return load;
}
const load=loader(), settings=load('lib/site-settings.ts'), defaults=load('lib/content-registry.ts').defaultContentValues;
const fingerprint=createHash('sha256').update(JSON.stringify(defaults)).digest('hex');
const published=settings.mergeSiteSettings({...settings.defaultSiteSettings,brandName:'Old mirror',sections:{...settings.defaultSiteSettings.sections,pricingBody:'Stale optional mirror'},content:{...defaults,'global.brand.name':defaults['global.brand.name'],'home.hero.body':'Saved owner copy','home.finalCta.eyebrow':'','home.pricing.body':''}});
const draft=settings.mergeSiteSettings({...published,content:{...published.content,'home.hero.body':'Unpublished private draft'}});

function routeHarness({authorized=false,configured=true,error=false}={}) {
  const reads=[],mutations=[];
  const client={from:()=>({select:()=>({eq:(_key,value)=>({maybeSingle:async()=>{
    reads.push(value);
    return error?{data:null,error:{message:'Unavailable'}}:{data:{content_value:value==='fixture-draft'?{settings:draft}:published},error:null};
  }})})})};
  const route=loader({
    '../site-editor/route':{PUT:async request=>{mutations.push(await request.json());return Response.json({ok:false,uncertain:false,message:'Conflict'},{status:409});}},
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    'next/cache':{unstable_noStore:()=>{},revalidatePath:()=>{}},
    'lib/supabase-server.ts':{createServerSupabaseClient:()=>null,createServerSupabaseClientWithTimeout:()=>configured?client:null,getSupabaseEnvStatus:()=>({missing:['fixture']} )},
    'lib/admin-auth.ts':{},
    'lib/site-preview-server.ts':{isSitePreviewAuthorized:async()=>authorized},
    'lib/site-preview.ts':{sitePreviewTokenFromCookie:()=>null,sitePreviewDraftKey:'fixture-draft'}
  })('app/api/site-settings/route.ts');
  return {route,reads,mutations};
}
const request=query=>new Request('http://127.0.0.1:3004/api/site-settings'+query);

test('matching defaults reduce the actual GET response and reconstruct every saved setting',async()=>{
  const {route}=routeHarness();
  const full=await route.GET(request(''));
  const compact=await route.GET(request('?defaults='+fingerprint));
  const fullText=await full.text(),compactText=await compact.text();
  const value=JSON.parse(compactText);
  assert.deepEqual(settings.mergeSiteSettings(value.settings),published);
  assert.equal(settings.mergeSiteSettings(value.settings).content['home.finalCta.eyebrow'],'');
  assert.equal(value.settings.content['home.pricing.body'],'');
  const future=load('lib/client-site-settings.ts').compactSiteSettingsForClient({...published,content:{...published.content,'future.owner.key':'Unknown preserved value'}});
  assert.equal(future.content['future.owner.key'],'Unknown preserved value');
  assert.equal(value.settings.content['global.brand.name'],defaults['global.brand.name']);
  assert.ok(compactText.length<fullText.length/3);
  assert.match(compact.headers.get('cache-control'),/no-store/);
  console.log(JSON.stringify({scope:'Synthetic saved-content fixture through actual GET handler',fullResponseBytes:Buffer.byteLength(fullText),compactResponseBytes:Buffer.byteLength(compactText)}));
});

test('direct GET and a stale tab fingerprint retain the complete response contract',async()=>{
  for(const query of ['', '?defaults='+ '0'.repeat(64), '?defaults=invalid']) {
    const {route}=routeHarness();
    const value=await (await route.GET(request(query))).json();
    assert.deepEqual(value.settings,published);
  }
});

test('a matching fingerprint cannot disclose an unauthorized draft',async()=>{
  const {route,reads}=routeHarness();
  const value=await (await route.GET(request('?defaults='+fingerprint+'&cmsPreview=draft'))).json();
  assert.equal(value.preview,'published');
  assert.equal(settings.mergeSiteSettings(value.settings).content['home.hero.body'],'Saved owner copy');
  assert.deepEqual(reads,['homepage']);
});

test('authorized draft projection preserves the selected private draft and its saved values',async()=>{
  const {route,reads}=routeHarness({authorized:true});
  const value=await (await route.GET(request('?defaults='+fingerprint+'&cmsPreview=draft'))).json();
  assert.equal(value.preview,'draft');
  assert.deepEqual(settings.mergeSiteSettings(value.settings),draft);
  assert.deepEqual(reads,['fixture-draft']);
});

test('missing configuration and failed reads remain errors with the full safe fallback',async()=>{
  for(const options of [{configured:false},{error:true}]) {
    const {route}=routeHarness(options);
    const value=await (await route.GET(request('?defaults='+fingerprint))).json();
    assert.equal(value.ok,false);
    assert.deepEqual(value.settings,JSON.parse(JSON.stringify(settings.defaultSiteSettings)));
  }
});

test('PUT and PATCH still delegate version-protected writes without projecting their errors',async()=>{
  for(const method of ['PUT','PATCH']) {
    const {route,mutations}=routeHarness();
    const response=await route[method](new Request('http://127.0.0.1:3004/api/site-settings?defaults='+fingerprint,{method,headers:{'content-type':'application/json'},body:JSON.stringify({publishedVersion:'previous',draftVersion:'draft',settings:published})}));
    assert.equal(response.status,409);
    assert.deepEqual(await response.json(),{ok:false,uncertain:false,message:'Conflict'});
    assert.equal(mutations.length,1);
    assert.deepEqual(mutations[0],{publishedVersion:'previous',draftVersion:'draft',settings:published,action:'publish',source:'brand_logo_admin'});
  }
});

test('client hashes its own defaults once, reconstructs compact responses, and retains draft selection',async()=>{
  const calls=[];
  let hashes=0;
  const client=loader({}, {globalThis:{crypto:{subtle:{digest:(...args)=>{hashes++;return webcrypto.subtle.digest(...args);}}}},window:{location:{search:'?cmsPreview=draft'}},fetch:async(url,options)=>{
    calls.push({url,options});
    return Response.json({ok:true,settings:load('lib/client-site-settings.ts').compactSiteSettingsForClient(published)});
  }})('lib/site-settings.ts');
  assert.deepEqual(await client.fetchPublishedSiteSettings(),published);
  assert.deepEqual(await client.fetchPublishedSiteSettings(),published);
  assert.equal(hashes,1);
  for(const call of calls) {
    const params=new URL(call.url,'http://127.0.0.1:3004').searchParams;
    assert.equal(params.get('defaults'),fingerprint);
    assert.equal(params.get('cmsPreview'),'draft');
    assert.equal(call.options.cache,'no-store');
  }
});

test('unavailable or failed WebCrypto safely requests the original full response',async()=>{
  for(const crypto of [undefined,{subtle:{digest:async()=>{throw Error('Unavailable');}}}]) {
    let requestUrl='';
    const client=loader({}, {globalThis:{crypto},fetch:async url=>{requestUrl=url;return Response.json({ok:true,settings:published});}})('lib/site-settings.ts');
    assert.deepEqual(await client.fetchPublishedSiteSettings(),published);
    assert.equal(new URL(requestUrl,'http://127.0.0.1:3004').searchParams.has('defaults'),false);
  }
});
