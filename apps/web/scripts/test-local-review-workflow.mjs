import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),root=path.resolve(import.meta.dirname,'..');
function load(file,overrides={}) {
  const exports={};
  const localRequire=name=>{if(name in overrides)return overrides[name];if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'),overrides);return require(name);};
  new Function('require','exports','process',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(localRequire,exports,{env:{QRGUITAR_PUBLIC_REVIEW_SNAPSHOT:'C:/local/snapshot.json',NEXT_PUBLIC_SITE_URL:'https://localhost:55440',QRGUITAR_BUILD_ENV:'isolated-local',QRGUITAR_LOCAL_REVIEW:'build'}});
  return exports;
}
const original={sourceOrigin:'https://www.qrguitar.com',capturedAt:'2026-10-05T17:55:38Z',instruments:[{qrCode:'QRG-A00174',name:'Cobran F-G1',brand:'Cobran',model:'F-G1',year:'2000',instrumentType:'Electric Guitar',createdAt:'2026-08-08T18:54:12Z',visibility:'public',heroImageDataUrl:'/review-content/cobran.jpg'},{qrCode:'QRG-AB02777',name:'Another instrument',brand:'Other',model:'Existing',year:'2000',instrumentType:'Electric Guitar',createdAt:'2026-08-08T18:54:12Z',visibility:'public'}]};
function reader(snapshot) {return load(path.join(root,'lib/public-review-snapshot.ts'),{'node:fs/promises':{readFile:async()=>Buffer.from(JSON.stringify(snapshot))}});}
test('ordinary review remains a read-only snapshot with unchanged instrument identities',async()=>{
  const rows=await reader(original).readPublicReviewSnapshot();assert.equal(rows.length,2);assert.equal(rows[0].qrCode,'QRG-A00174');assert.equal(rows[0].publicReviewSnapshot,true);assert.equal(rows[0].permanentPath,'/i/QRG-A00174');assert.equal(rows[0].recordId,undefined);
});
test('only the chosen local workflow leaves snapshot fallback; the original source is retained',async()=>{
  const value={...original,localWorkflowCodes:['QRG-A00174']},before=structuredClone(value),api=reader(value);
  assert.deepEqual((await api.readPublicReviewSnapshot()).map(row=>row.qrCode),['QRG-AB02777']);
  const state=await api.readPublicReviewState();assert.equal(state.instruments.length,2);assert.deepEqual(state.workflowCodes,['QRG-A00174']);assert.deepEqual(value,before);
});
for(const codes of [['QRG-UNKNOWN'],['QRG-A00174','QRG-A00174'],['qrg-a00174'],'QRG-A00174',[null]])test('invalid local workflow configuration fails closed: '+JSON.stringify(codes),async()=>{
  await assert.rejects(()=>reader({...original,localWorkflowCodes:codes}).readPublicReviewSnapshot(),/Local workflow codes/);
});
test('local workflow cannot import an owner identity through the public snapshot',async()=>{
  const value=structuredClone(original);value.localWorkflowCodes=['QRG-A00174'];value.instruments[0].ownerUserEmail='private@example.invalid';await assert.rejects(()=>reader(value).readPublicReviewSnapshot(),/without local owner identities/);
});
const contract=load(path.join(root,'lib/instrument-profile-contract.ts'));
test('legacy Cobran setup is counted once as service while its original fields are preserved',()=>{
  const event={id:'existing-setup',category:'Other',eventType:'Setup',title:'Full Setup and Maintenance',isPublic:true,isSystem:false},record={...original.instruments[0],timelineEvents:[event],serviceEvents:[event],customFields:[]},before=structuredClone(record);
  assert.equal(contract.isServiceHistoryEvent(event),true);assert.equal(contract.getServiceHistoryEntries(record).length,1);assert.equal(contract.resolveInstrumentPresentation(record).counts.service,1);assert.deepEqual(record,before);
});
test('system transfers and deliberately categorized ownership never become repair work',()=>{
  assert.equal(contract.isServiceHistoryEvent({category:'Ownership',eventType:'Setup',isSystem:false}),false);assert.equal(contract.isServiceHistoryEvent({category:'Other',eventType:'Setup',isSystem:true}),false);assert.equal(contract.isServiceHistoryEvent({category:'Other',eventType:'ownership',isSystem:false}),false);
});
test('two protected ownership events appear in provenance once, with the original Profile origin',()=>{
 const origin={id:'created',title:'QRguitar Profile created',eventType:'profile_created',isPublic:true,isSystem:true},ownership=id=>({id,title:'Ownership transferred',eventType:'ownership',category:'Ownership',isSystem:true,isPublic:true,publicDescription:'Ownership was transferred while the permanent QRguitar Profile remained unchanged.'}),first=ownership('first'),next=ownership('next');
 const record={...original.instruments[0],ownershipTransferCount:2,timelineEvents:[next,first,origin],serviceEvents:[]},presentation=contract.resolveInstrumentPresentation(record);
 assert.deepEqual(presentation.meaningfulTimelineEvents.map(event=>event.id),['next','first']);assert.equal(presentation.counts.timeline,2);assert.equal(presentation.counts.service,0);assert.equal(presentation.profileOrigin.id,'created');assert.equal(presentation.tabs.timeline,true);
 const legacy=contract.resolveInstrumentPresentation({...record,timelineEvents:[origin]});assert.equal(legacy.counts.timeline,2);assert.equal(legacy.profileOrigin.id,'created');
});
