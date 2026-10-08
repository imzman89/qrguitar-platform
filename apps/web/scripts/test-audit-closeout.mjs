import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url), ts=require('typescript'), root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=new Map();
function load(relative, overrides={}) {
  if(Object.hasOwn(overrides,relative))return overrides[relative];
  if(!Object.keys(overrides).length&&cache.has(relative))return cache.get(relative);
  const file=path.join(root,relative), m={exports:{}};
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',js)(name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name+(name.endsWith('HowItWorksClient')?'.tsx':'.ts'))).replaceAll('\\','/'),overrides):require(name),m,m.exports);
  if(!Object.keys(overrides).length)cache.set(relative,m.exports);
  return m.exports;
}
const registry=load('lib/content-registry.ts'), settings=load('lib/site-settings.ts'), compact=load('lib/client-site-settings.ts').compactSiteSettingsForClient;
const full=settings.mergeSiteSettings(settings.defaultSiteSettings);
test('compact defaults reconstruct the full real settings contract while reducing initial content bytes',()=>{
 const reduced=compact(full);assert.deepEqual(settings.mergeSiteSettings(reduced),full);assert.ok(JSON.stringify(reduced).length<JSON.stringify(full).length/3);assert.ok(Object.keys(reduced.content).length<Object.keys(full.content).length/3);
});
test('empty, customized, unknown values and composition order round-trip without default substitution',()=>{
 const input={...full,content:{...full.content,'home.finalCta.eyebrow':'','home.pricing.body':'Owner custom body','future.owner.key':'Future content'},composition:{...full.composition,home:{...full.composition.home,sections:[...full.composition.home.sections].reverse()}}};
 const result=compact(input);assert.equal(settings.mergeSiteSettings(result).content['home.finalCta.eyebrow'],'');assert.equal(result.content['future.owner.key'],'Future content');assert.deepEqual(settings.mergeSiteSettings(result),settings.mergeSiteSettings(input));
});
test('explicit typed defaults remain authoritative over stale legacy mirrors',()=>{
 const input=settings.mergeSiteSettings({...full,brandName:'Stale legacy brand',hero:{...full.hero,headline:'Stale legacy headline'},seo:{...full.seo,title:'Stale legacy title'},content:{...full.content,'global.brand.name':registry.defaultContentValues['global.brand.name'],'home.hero.headline':registry.defaultContentValues['home.hero.headline'],'seo.global.title':registry.defaultContentValues['seo.global.title']}});
 const reduced=compact(input);for(const key of ['global.brand.name','home.hero.headline','seo.global.title'])assert.ok(Object.hasOwn(reduced.content,key));assert.deepEqual(settings.mergeSiteSettings(reduced),input);
});
async function guide(input) {
 const route=load('app/how-it-works/page.tsx',{'lib/site-settings-server.ts':{loadPublishedSiteSettings:async()=>input},'lib/public-instruments.ts':{getPublicInstruments:async()=>[]},'app/how-it-works/HowItWorksClient.tsx':{HowItWorksClient:()=>null},'lib/site-metadata.ts':{buildManagedPageMetadata:()=>({})}});
 return route.default();
}
function script(tree){if(!tree||typeof tree!=='object')return null;if(tree.type==='script')return tree;for(const child of require('react').Children.toArray(tree.props?.children)){const found=script(child);if(found)return found;}return null;}
test('actual FAQ route serializes exactly visible saved questions and answers, script safe',async()=>{
 const section=full.composition.howItWorks.sections.find(x=>x.id==='faq');assert.ok(section);const input=settings.mergeSiteSettings({...full,content:{...full.content},composition:{...full.composition,howItWorks:{...full.composition.howItWorks,sections:full.composition.howItWorks.sections.map(s=>s.id==='faq'?{...s,visible:true,blocks:[{...section.blocks[0],visible:true,title:'Owner question </script>',body:'Owner answer & details'},{...section.blocks[0],id:'hidden-test',visible:false,title:'Hidden question',body:'Hidden answer'}]}:s)}}});
 const node=script(await guide(input));assert.ok(node);const encoded=node.props.dangerouslySetInnerHTML.__html;assert.ok(!encoded.includes('</script>'));const expected=settings.resolveVisibleEditorialSections(input,'howItWorks').find(x=>x.id==='faq').blocks.filter(b=>b.visible&&b.title.trim()&&b.body.trim());assert.deepEqual(JSON.parse(encoded).mainEntity.map(x=>[x.name,x.acceptedAnswer.text]),expected.map(x=>[x.title,x.body]));
});
test('a hidden FAQ section emits no search schema',async()=>{
 const input=settings.mergeSiteSettings({...full,composition:{...full.composition,howItWorks:{...full.composition.howItWorks,sections:full.composition.howItWorks.sections.map(s=>s.id==='faq'?{...s,visible:false}:s)}}});assert.equal(script(await guide(input)),null);
});
