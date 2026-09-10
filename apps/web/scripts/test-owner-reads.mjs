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
const proposal=fs.existsSync(path.join(scriptRoot,'regions/loadRecordsForUser.ts.txt'));
const overlay=proposal ? createRequire(import.meta.url)(path.join(scriptRoot,'overlay.cjs')).buildOverlay(root,ts,scriptRoot) : new Map();
const read=file=>overlay.get(file) ?? fs.readFileSync(path.join(root,file),'utf8');
const compile=(source, bindings={}, file='fixture.ts')=>{
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',...Object.keys(bindings),compiled)(name=>{throw new Error(`Unexpected import ${name}`);},module,module.exports,...Object.values(bindings));
  return module.exports;
};
const helpers=compile(read('apps/web/lib/owner-record-read.ts'));
const contract=compile(read('apps/web/lib/instrument-profile-contract.ts'));
const trust=compile(read('apps/web/lib/record-trust.ts'));
const route=read('apps/web/app/api/instruments/route.ts');
const ast=ts.createSourceFile('route.ts',route,ts.ScriptTarget.Latest,true);
const names=['isRenderablePublicMediaSource','publicSummary','instrumentConditionFromSpec','saleStatusFromSpec','originalityStatusFromSpec','mapInstrumentRow','mapServiceEvent','loadRecordsForUser','GET'];
const functions=names.map(name=>{
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node,`Missing production function ${name}`);
  return node.getText(ast);
}).join('\n')+'\nexport { loadRecordsForUser };';
const owner={id:'owner-1',email:'owner@example.test',user_metadata:{display_name:'Account name'}};
function database(tables={}, {cap=7,failTable='',rejectTable=''}={}) {
  const calls=[];
  return { calls, from(table) {
    const state={table,filters:[],orders:[],columns:'*',from:undefined,to:undefined};
    const result=single=>{
      calls.push(structuredClone(state));
      if(table===rejectTable) return Promise.reject(new Error('network lost'));
      if(table===failTable) return Promise.resolve({data:null,error:{message:'database read failed'}});
      let rows=[...(tables[table]||[])].filter(row=>state.filters.every(([op,key,val])=>op==='in'?val.includes(row[key]):(row[key]??null)===val));
      rows.sort((a,b)=>{for(const [key,options] of state.orders){let x=a[key],y=b[key];if(x===y)continue;if(x==null)return options.nullsFirst===true?-1:1;if(y==null)return options.nullsFirst===true?1:-1;return (x<y?-1:1)*(options.ascending===false?-1:1);}return 0;});
      if(single) return Promise.resolve({data:rows[0]||null,error:null});
      assert.ok(Number.isSafeInteger(state.from)&&Number.isSafeInteger(state.to),`${table}: missing pagination`);
      rows=rows.slice(state.from,Math.min(state.to+1,state.from+cap));
      if(state.columns!=='*') rows=rows.map(row=>Object.fromEntries(state.columns.split(',').map(key=>[key,row[key]])));
      return Promise.resolve({data:rows,error:null});
    };
    const q={select(columns){state.columns=columns;return q;},eq(key,val){state.filters.push(['eq',key,val]);return q;},is(key,val){state.filters.push(['is',key,val]);return q;},in(key,val){state.filters.push(['in',key,val]);return q;},order(key,options={}){state.orders.push([key,options]);return q;},range(from,to){state.from=from;state.to=to;return result(false);},maybeSingle(){return result(true);}};
    return q;
  }};
}
const guitar=(id='g0', extra={})=>({id,owner_id:owner.id,qr_code:id.toUpperCase(),permanent_path:`/i/${id.toUpperCase()}`,name:id,brand:'Fender',model:'Telecaster',year:'1962',serial_number:`serial-${id}`,summary:'Original description',status:'verified',visibility:'private',hero_image_path:null,owner_removed_at:null,created_at:'2026-09-01',...extra});
function fixture(db,{sign=async(bucket,source)=>`https://storage.test/${bucket}/${source}?signed=yes`,user=owner,configured=true}={}) {
  return compile(functions,{
    ...helpers,...contract,...trust,defaultQrStyle:{},MEDIA_BUCKET:'instrument-media',DOCUMENT_BUCKET:'instrument-documents',PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS:86400,
    supabaseSignedStorageUrl:sign,createServerSupabaseClient:()=>configured?db:null,
    getAuthenticatedUser:async()=>({user,error:user?'':'Sign in required.'}),canManageRecordVerification:async()=>false,
    noStore:()=>{},noStoreJson:(body,init={})=>({body,status:init.status||200,headers:init.headers||{}})
  });
}
const get=async(api,query='scope=mine')=>api.GET(new Request(`https://qrguitar.test/api/instruments?${query}`));

test('pagination continues through server caps below the requested page size',async()=>{
  const rows=Array.from({length:1001},(_,i)=>({id:String(i)}));let calls=0;
  const result=await helpers.readAllOwnerPages((from,to)=>{calls++;return Promise.resolve({data:rows.slice(from,Math.min(to+1,from+3)),error:null});},r=>r.id);
  assert.deepEqual(result,rows);assert.equal(calls,335);
});
test('pagination rejects repeated pages, invalid responses, limits and later-page errors without partial success',async()=>{
  await assert.rejects(()=>helpers.readAllOwnerPages(async()=>({data:[{id:'same'}],error:null}),r=>r.id),helpers.OwnerReadError);
  await assert.rejects(()=>helpers.readAllOwnerPages(async()=>({data:null,error:null}),r=>r.id),helpers.OwnerReadError);
  await assert.rejects(()=>helpers.readAllOwnerPages(async()=>({data:[{id:'only'}],error:null}),r=>r.id,{maxPages:1}),helpers.OwnerReadError);
  await assert.rejects(()=>helpers.readAllOwnerPages(async from=>from?{data:null,error:{message:'failure'}}:{data:[{id:'first'}],error:null},r=>r.id),/failure/);
});
test('batched IN reads are unique, bounded, complete, and skip empty input',async()=>{
  const ids=Array.from({length:205},(_,i)=>`g${i}`);const seen=[];
  const rows=await helpers.readOwnerBatches([...ids,ids[0],''],async(batch,from)=>{assert.ok(batch.length<=100);if(!from)seen.push(...batch);return {data:from?[]:batch.map(id=>({id})),error:null};},r=>r.id);
  assert.deepEqual(rows.map(r=>r.id),ids);assert.deepEqual(seen,ids);
  assert.deepEqual(await helpers.readOwnerBatches([],()=>{throw new Error('unexpected query');},r=>r.id),[]);
});
test('owner reads return all related rows across 103 guitars, preserving order, statuses, documents and private history',async()=>{
  const guitars=Array.from({length:103},(_,i)=>guitar(`g${String(i).padStart(3,'0')}`,{hero_image_path:`hero-${i}`,visibility:i%2?'unlisted':'private',safety_status:'stolen',safety_note:'Owner note'}));
  const media=guitars.flatMap(g=>Array.from({length:15},(_,i)=>({id:`${g.id}-m${String(i).padStart(2,'0')}`,guitar_id:g.id,storage_path:`${g.id}/photo-${i}`,sort_order:14-i}))).reverse();
  const docs=Array.from({length:1003},(_,i)=>({id:`d${String(i).padStart(4,'0')}`,guitar_id:guitars[0].id,name:`Document ${i}`,storage_path:`doc-${i}`,is_public:i%2===0,mime_type:'application/pdf',issuer_source:'Luthier',document_date:'2026-08-01',description:'Receipt',public_description:'Public',private_notes:'Keep private',file_size_bytes:0,related_timeline_event_id:'t0',related_service_event_id:'t0',created_at:'2026-01-01',updated_at:'2026-09-01'}));
  const timelines=Array.from({length:1003},(_,i)=>({id:`t${String(i).padStart(4,'0')}`,guitar_id:guitars[0].id,title:`History ${i}`,event_type:'service',category:'Maintenance',event_date:'2026-08-01',private_notes:'Private',description:'Public',is_public:false,created_at:'2026-08-01',related_document_id:docs[0].id}));
  const transfers=Array.from({length:1003},(_,i)=>({id:`x${i}`,guitar_id:guitars[0].id,status:'accepted'}));
  const specs=guitars.flatMap(g=>[{id:`${g.id}-spec1`,guitar_id:g.id,label:'Availability',value:'For Sale',sort_order:2},{id:`${g.id}-spec2`,guitar_id:g.id,label:'Originality',value:'Modified',sort_order:1},{id:`${g.id}-spec3`,guitar_id:g.id,label:'Condition',value:'New',sort_order:0}]);
  const db=database({guitars,guitar_media:media,guitar_documents:docs,guitar_timeline_events:timelines,ownership_transfers:transfers,guitar_specs:specs,profiles:[{id:owner.id,display_name:'DB owner'}],site_content:guitars.map(g=>({content_key:trust.recordTrustContentKey(g.qr_code),content_value:{authenticityStatus:'confirmed',showSerialPublic:false,internalVerificationNote:'Internal'}}))},{cap:31});
  const result=await fixture(db).loadRecordsForUser(db,owner);
  assert.equal(result.records.length,103);
  const first=result.records[0];assert.equal(first.qrCode,'G000');
  assert.equal(first.galleryImageDataUrls.length,16);assert.match(first.galleryImageDataUrls[1],/photo-14\?/);assert.match(first.galleryImageDataUrls.at(-1),/photo-0\?/);
  assert.equal(first.documentFiles.length,1003);assert.equal(first.timelineEvents.length,1003);assert.equal(first.ownershipTransferCount,1003);
  assert.equal(first.verificationStatus,'verified');assert.equal(first.authenticityStatus,'confirmed');assert.equal(first.saleStatus,'for_sale');assert.equal(first.originalityStatus,'modified');assert.equal(first.instrumentCondition,'new');assert.equal(first.visibility,'private');assert.equal(first.safetyStatus,'stolen');assert.equal(first.safetyNote,'Owner note');assert.equal(first.serial,'serial-g000');assert.equal(first.showSerialPublic,false);
  assert.deepEqual(first.documentFiles[0],{id:'d0000',name:'Document 0',url:'https://storage.test/instrument-documents/doc-0?signed=yes',visibility:'public',documentType:'',issuerSource:'Luthier',documentDate:'2026-08-01',description:'Receipt',fileSizeBytes:0,mimeType:'application/pdf',publicDescription:'Public',privateNotes:'Keep private',relatedTimelineEventId:'t0',relatedServiceEventId:'t0',createdAt:'2026-01-01',updatedAt:'2026-09-01'});
  assert.equal(first.timelineEvents[0].privateNotes,'Private');assert.equal(first.timelineEvents[0].relatedDocumentId,'d0000');
  for(const call of db.calls) for(const [op,,ids] of call.filters) if(op==='in')assert.ok(ids.length<=100);
});
test('owner code lookup filters before related reads; another owner and removed records stay excluded',async()=>{
  const db=database({guitars:[guitar('g0'),guitar('g1'),guitar('g2',{owner_id:'other-owner'}),guitar('g3',{owner_removed_at:'2026-09-02'})]});
  const api=fixture(db);const found=await get(api,'scope=mine&code=g1');
  assert.equal(found.status,200);assert.equal(found.body.instrument.qrCode,'G1');
  for(const q of db.calls.filter(q=>q.table==='guitars')) assert.ok(q.filters.some(([op,key,value])=>op==='eq'&&key==='qr_code'&&value==='G1'));
  for(const q of db.calls.filter(q=>q.table.startsWith('guitar_'))) for(const [op,key,value] of q.filters)if(op==='in'&&key==='guitar_id')assert.deepEqual(value,['g1']);
  assert.equal((await get(api,'scope=mine&code=g2')).status,404);assert.equal((await get(api,'scope=mine&code=g3')).status,404);
  const removed=await get(api,'scope=mine&code=g3&includeRemoved=1');assert.equal(removed.status,200);assert.equal(removed.body.instrument.collectionRemovedAt,'2026-09-02');
});
test('empty collection is a complete successful read with no related queries',async()=>{
  const db=database({});const res=await get(fixture(db));assert.equal(res.status,200);assert.deepEqual(res.body,{ok:true,instruments:[],count:0});assert.ok(db.calls.every(q=>['profiles','guitars'].includes(q.table)));
});
for(const table of ['profiles','guitars','guitar_media','guitar_specs','guitar_documents','guitar_timeline_events','ownership_transfers','site_content']) {
  test(`owner ${table} error yields retryable 503 instead of a misleading empty or partial result`,async()=>{
    const db=database({guitars:[guitar()]},{failTable:table});const res=await get(fixture(db));assert.equal(res.status,503);assert.equal(res.body.ok,false);assert.equal(res.body.retryable,true);assert.equal(res.headers['Retry-After'],'10');assert.equal(res.body.instruments,undefined);assert.doesNotMatch(res.body.message,/database/);
  });
}
test('owner network rejection is handled, 401/404 are preserved, and missing backend returns 503',async()=>{
  const db=database({guitars:[guitar()]},{rejectTable:'guitars'});assert.equal((await get(fixture(db))).status,503);
  assert.equal((await get(fixture(db,{user:null}))).status,401);assert.equal((await get(fixture(database({})),'scope=mine&code=missing')).status,404);assert.equal((await get(fixture(db,{configured:false}))).status,503);
});
test('signing deduplicates hero/media paths and bounds signing concurrency',async()=>{
  let current=0,peak=0;const calls=[];
  const urls=await helpers.signOwnerSources(['a','a','b','c','d','e','https://legacy.test/photo'],async source=>{calls.push(source);peak=Math.max(peak,++current);await new Promise(resolve=>setImmediate(resolve));current--;return `https://signed.test/${source}`;},2);
  assert.equal(peak,2);assert.equal(calls.length,5);assert.equal(urls.get('https://legacy.test/photo'),'https://legacy.test/photo');
  const db=database({guitars:[guitar('g0',{hero_image_path:'shared'})],guitar_media:[{id:'m0',guitar_id:'g0',storage_path:'shared',sort_order:0}]});let signed=0;
  assert.equal((await get(fixture(db,{sign:async()=>{signed++;return 'https://signed.test/shared';}}))).status,200);assert.equal(signed,1);
});
for(const kind of ['throw','empty','malformed']) test(`owner signing ${kind} fails with 503; no broken private-bucket public URL fallback`,async()=>{
  const db=database({guitars:[guitar('g0',{hero_image_path:'private-photo'})]});const res=await get(fixture(db,{sign:async()=>{if(kind==='throw')throw new Error('storage down');return kind==='empty'?'':'raw-storage-path';}}));assert.equal(res.status,503);assert.equal(res.body.instrument,undefined);
});
test('document signing failure also fails the owner response without discarding document rows',async()=>{
  const db=database({guitars:[guitar()],guitar_documents:[{id:'d0',guitar_id:'g0',name:'Hidden document',storage_path:'private-doc'}]});assert.equal((await get(fixture(db,{sign:async()=>{throw new Error('storage down');}}))).status,503);
});

test('invalid stored document/media references fail explicitly instead of disappearing',async()=>{
  for(const table of ['guitar_documents','guitar_media']) {
    const db=database({guitars:[guitar()], [table]:[{id:'bad-reference',guitar_id:'g0',name:'Broken asset',storage_path:''}]});
    assert.equal((await get(fixture(db))).status,503);
  }
});
