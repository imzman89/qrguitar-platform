import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { withUiTextTestContext } from './ui-text-test-context.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(path.join(root,'apps/web/package.json')),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const cache=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const localRequire=withUiTextTestContext(name=>{if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(file),name);const resolved=['.ts','.tsx'].map(ext=>base+ext).find(fs.existsSync);assert.ok(resolved,name);return load(resolved);});
  new Function('require','exports',code)(localRequire,exports);return exports;
}
const {EditorTimelineEntry}=load(path.join(root,'apps/web/components/EditorTimelineEntry.tsx'));
const {InstrumentPreview}=load(path.join(root,'apps/web/components/InstrumentPreview.tsx'));
const history={id:'synthetic-history',title:'QRguitar Profile created',eventType:'profile_created',category:'Documentation',isPublic:true,isSystem:true,canEdit:false,sourceKind:'owner_reported',lockedReason:'This service history belongs to a previous owner, shop, or QRguitar admin.'};
const renderEntry=(entry,extra={})=>renderToStaticMarkup(React.createElement(EditorTimelineEntry,{entry,saving:false,onEdit:()=>{},onDelete:()=>{},...extra}));
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.props?.children)]:[];

test('automatic creation is Profile history, never repair work or someone else’s service',()=>{
  const before=structuredClone(history),html=renderEntry(history);
  assert.match(html,/Profile history/);assert.match(html,/Recorded automatically when this Profile was created/);
  assert.doesNotMatch(html,/Owner-reported service|profile_created|previous owner|Edit Entry|Delete Entry/);
  assert.deepEqual(history,before);
});
test('a creation marker stays factual even when an older response lacks isSystem',()=>{
  const html=renderEntry({...history,isSystem:undefined});assert.match(html,/Recorded automatically when this Profile was created/);assert.doesNotMatch(html,/Owner-reported service|profile_created/);
});
test('real owner service retains its source and supplied history lock explanation',()=>{
  const html=renderEntry({...history,title:'Fret repair',eventType:'repair',category:'Repair',isSystem:false});
  assert.match(html,/Owner-reported service/);assert.match(html,/Fret repair/);assert.match(html,/previous owner/);assert.doesNotMatch(html,/Recorded automatically|Edit Entry/);
});
test('provider approval, verification and evidence review retain distinct qualifiers',()=>{
  const html=renderEntry({...history,title:'Setup',eventType:'setup',category:'Setup',isSystem:false,sourceKind:'provider_submitted_owner_approved',providerVerifiedAt:'2026-09-20',evidenceReviewedAt:'2026-09-20'});
  for(const text of ['Provider-submitted','Owner-approved','Verified Service Provider','QRguitar-reviewed evidence'])assert.ok(html.includes(text));
});
test('editable entries pass the unchanged event to existing actions; saving disables delete',()=>{
  const entry={...history,title:'Owner milestone',eventType:'ownership',category:'Ownership',isSystem:false,canEdit:true},calls=[];
  const tree=EditorTimelineEntry({entry,saving:true,onEdit:value=>calls.push(['edit',value]),onDelete:value=>calls.push(['delete',value])});
  const buttons=nodes(tree).filter(node=>node.type==='button');assert.equal(buttons.length,2);assert.equal(buttons[1].props.disabled,true);
  buttons[0].props.onClick();buttons[1].props.onClick();assert.equal(calls[0][1],entry);assert.equal(calls[1][1],entry);
  const html=renderEntry(entry);assert.match(html,/Owner-reported history/);assert.doesNotMatch(html,/Owner-reported service/);
});
const preview=fields=>renderToStaticMarkup(React.createElement(InstrumentPreview,{qrCode:'QRG-SYNTHETIC',name:'Synthetic acoustic',brand:'Example',model:'Test',serial:'',year:'',owner:'Synthetic owner',customFields:fields}));
test('preview collapses matching Type/Instrument type aliases without modifying fields',()=>{
  const fields=[{id:'type',label:'Type',value:'Acoustic Guitar'},{id:'legacy',label:'Instrument type',value:'Acoustic Guitar'},{id:'finish',label:'Finish',value:'Natural'}],before=structuredClone(fields),html=preview(fields);
  assert.equal(html.match(/Acoustic Guitar/g)?.length,1);assert.match(html,/Natural/);assert.deepEqual(fields,before);
});
test('preview preserves different type values and unrelated custom fields',()=>{
  const html=preview([{id:'type',label:'Type',value:'Acoustic Guitar'},{id:'different',label:'Instrument type',value:'Amplifier'},{id:'custom',label:'Pickup type',value:'Piezo'}]);
  for(const value of ['Acoustic Guitar','Amplifier','Pickup type','Piezo'])assert.ok(html.includes(value));
});
