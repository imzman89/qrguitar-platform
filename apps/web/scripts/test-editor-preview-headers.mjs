import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(path.join(root,'package.json')),ts=require('typescript'),{NextRequest}=require('next/server');
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','process',code)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),exports,{env:{NODE_ENV:'production'}});return exports;}
const {middleware}=load(path.join(root,'apps/web/middleware.ts'));
const {securityHeaders}=load(path.join(root,'apps/web/lib/security-headers.ts'));
const request=(suffix,headers={})=>new NextRequest('https://localhost:55440/'+suffix,{headers});
test('published preview renders in same-origin iframe, without selecting private draft content',()=>{
  const response=middleware(request('?cmsPreview=published&v=0',{'x-qrguitar-site-preview':'draft'}));
  assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.equal(response.headers.get('x-middleware-request-x-qrguitar-site-preview'),null);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});
test('draft preview keeps its existing explicit draft header and same-origin frame policy',()=>{
  const response=middleware(request('?cmsPreview=draft'));
  assert.equal(response.headers.get('x-middleware-request-x-qrguitar-site-preview'),'draft');assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self'/);
});
test('ordinary and unknown-mode pages retain the strict default frame policy',()=>{
  const defaults=new Map(securityHeaders().map(header=>[header.key,header.value]));assert.equal(defaults.get('X-Frame-Options'),'DENY');assert.match(defaults.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  for(const suffix of ['','?cmsPreview=unknown']){const response=middleware(request(suffix,{'x-qrguitar-site-preview':'draft'}));assert.equal(response.headers.get('x-frame-options'),null);assert.equal(response.headers.get('content-security-policy'),null);assert.equal(response.headers.get('x-middleware-request-x-qrguitar-site-preview'),null);}
});
test('preview never grants a foreign origin permission to frame the page',()=>{
  for(const mode of ['draft','published']){const response=middleware(request('?cmsPreview='+mode,{origin:'https://example.invalid'}));assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'self';/);assert.doesNotMatch(response.headers.get('content-security-policy'),/example\.invalid/);}
});
