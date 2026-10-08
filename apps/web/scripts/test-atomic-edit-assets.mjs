import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import os from "node:os";
import {repoRoot as root,readRepo} from "./atomic-test-support.mjs";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-edit-tests-"));
fs.mkdirSync(runtime, {recursive:true});
const helperSource = fs.readFileSync(path.join(root, "apps/web/lib/profile-save-assets.ts"), "utf8");
const helperJs = ts.transpileModule(helperSource, { compilerOptions: {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
fs.writeFileSync(path.join(runtime, "helper.mjs"), helperJs);
const {prepareProfileAssets, existingAssetPath, ProfileSaveError} = await import(pathToFileURL(path.join(runtime, "helper.mjs")).href);
const owner = "10000000-0000-4000-8000-000000000001";
const guitar = "20000000-0000-4000-8000-000000000001";
const mediaPath = `${owner}/${guitar}/original.jpg`;
const documentPath = `${owner}/${guitar}/receipt.pdf`;
const baseUrl = "https://qrguitar-test.supabase.co";
const media = {id:"30000000-0000-4000-8000-000000000001",storage_path:mediaPath,alt:"Existing",sort_order:0};
const doc = {id:"40000000-0000-4000-8000-000000000001",name:"Receipt",storage_path:documentPath,is_public:false,
  updated_at:"2026-01-02T00:00:00Z",document_type:"Receipt",public_description:"Invoice",private_notes:"Private original",
  issuer_source:"Dealer",document_date:"2026-01-01",description:"Original receipt",
  related_timeline_event_id:"50000000-0000-4000-8000-000000000001",related_service_event_id:null,mime_type:"application/pdf",file_size_bytes:1234};
const jpg = "data:image/jpeg;base64," + Buffer.from([0xff,0xd8,0xff,0xe0,0x01]).toString("base64");
const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\nfixture").toString("base64");
const uploadId = "edit-upload-session-01";
const stagedPhoto = `${owner}/${guitar}/profile-uploads/${uploadId}/image-60000000-0000-4000-8000-000000000001.jpg`;
const stagedDocument = `${owner}/${guitar}/profile-uploads/${uploadId}/document-70000000-0000-4000-8000-000000000001.pdf`;
const verified = new Map([[stagedPhoto,{kind:"image",mimeType:"image/jpeg",size:5}],[stagedDocument,{kind:"document",mimeType:"application/pdf",size:16}]]);
const options = (body, verifiedUploads = verified) => ({body, ownerId:owner,guitarId:guitar,currentHeroPath:mediaPath,
  supabaseUrl:baseUrl,existingMedia:[media],existingDocuments:[doc],verifiedUploads});
let passed = 0;
async function test(name, fn) {await fn();console.log("PASS "+name);passed++;}
await test("exact own Storage URLs map to paths; cross-origin and substring tricks do not", async()=>{
  assert.equal(existingAssetPath(baseUrl+"/storage/v1/object/sign/instrument-documents/"+documentPath+"?token=old", [documentPath], "instrument-documents", baseUrl),documentPath);
  for(const source of ["https://evil.test/?path="+documentPath,baseUrl+"/unrelated/"+documentPath,baseUrl+"/storage/v1/object/sign/instrument-documents/"+documentPath+".bak",baseUrl+"/storage/v1/object/sign/instrument-documents/%ZZ"]){
    assert.equal(existingAssetPath(source,[documentPath],"instrument-documents",baseUrl),"");
  }
});
await test("Quick Edit url documents retain identity and omitted private metadata",async()=>{
  const saved = await prepareProfileAssets(options({photos:[mediaPath],documents:[{name:"Renamed",url:baseUrl+"/storage/v1/object/public/instrument-documents/"+documentPath,visibility:"hidden"}]}));
  assert.equal(saved.documents[0].id,doc.id);
  assert.equal(saved.documents[0].private_notes,doc.private_notes);
  assert.equal(saved.documents[0].related_timeline_event_id,doc.related_timeline_event_id);
  assert.equal(saved.documents[0].file_size_bytes,1234);
});
await test("omitted documents preserve all existing documents",async()=>{
  const saved = await prepareProfileAssets(options({photos:[mediaPath]}));
  assert.equal(saved.documents[0].id,doc.id);
  assert.equal(saved.documents[0].private_notes,doc.private_notes);
});
await test("verified staged photo and document paths preserve authoritative file metadata",async()=>{
  const saved = await prepareProfileAssets(options({photos:[stagedPhoto],heroImagePath:stagedPhoto,documents:[{name:"New receipt",storagePath:stagedDocument}]}));
  assert.equal(saved.heroImagePath,stagedPhoto);assert.equal(saved.media[0].storage_path,stagedPhoto);
  assert.equal(saved.documents[0].storage_path,stagedDocument);assert.equal(saved.documents[0].mime_type,"application/pdf");assert.equal(saved.documents[0].file_size_bytes,16);
});
await test("new inline photo and document data URLs are rejected with 413",async()=>{
  for(const body of [{photos:[jpg],documents:[]},{photos:[mediaPath],documents:[{name:"Bad",dataUrl:pdf}]}]) {
    await assert.rejects(prepareProfileAssets(options(body)),error=>error instanceof ProfileSaveError&&error.status===413&&error.code==="inline_profile_upload_rejected");
  }
});
await test("invalid calendar date rejects before any upload",async()=>{
  await assert.rejects(prepareProfileAssets(options({photos:[stagedPhoto],documents:[{name:"Receipt",storagePath:stagedDocument,documentDate:"2026-02-30"}]})),ProfileSaveError);
  await assert.rejects(prepareProfileAssets(options({photos:[stagedPhoto],documents:[{name:"Receipt",storagePath:stagedDocument,documentDate:"2026-99-99"}]})),ProfileSaveError);
});
await test("duplicate existing documents reject before upload",async()=>{
  await assert.rejects(prepareProfileAssets(options({photos:[mediaPath],documents:[{name:"Receipt",storagePath:documentPath},{name:"Receipt",storagePath:documentPath}]})),ProfileSaveError);
});
await test("an unverified staged path cannot enter the atomic payload",async()=>{
  await assert.rejects(prepareProfileAssets(options({photos:[stagedPhoto],documents:[]},new Map())),/could not be matched/);
});
const prelude = `
import { prepareProfileAssets, ProfileSaveError, profileSaveFailure } from "./helper.mjs";
const noStoreJson=(body, options={})=>({body,status:options.status||200});
const normalizeSerialBuildId=(value)=>value.toUpperCase().replace(/[^A-Z0-9]/g,"");
const qrCodeFromSerial=(value)=>"QRG-"+normalizeSerialBuildId(value).slice(0,64);
const resolveCanonicalBrand=async(_db,value)=>({brand:value,suggestion:""});
const findGuitarByExactSerial=async()=>null;
const profileLinkSpecLabel=(value)=>"Profile link: "+value;
const canApproveSerialCorrection=async()=>false;
const getSupabaseEnvStatus=()=>({supabaseUrl:"${baseUrl}"});
const revalidatePublicRecordSurfaces=()=>{};
const cleanProfileUploadId=(value)=>typeof value==="string"?value:"";
const verifyProfileEditUploads=async()=>new Map([["${stagedDocument}",{kind:"document",mimeType:"application/pdf",size:16}]]);
export async function run(body,supabase){
  const auth={user:{id:"${owner}",email:"owner@example.test"}};
`;
const actualRoute=readRepo("apps/web/app/api/instruments/route.ts").replaceAll("\r\n","\n");
const patchStart=actualRoute.indexOf("export async function PATCH(request: Request)");
const tailStart=actualRoute.indexOf("  try {\n",actualRoute.indexOf("if (hasInlineProfileAssets(body))",patchStart));
assert.ok(patchStart>=0 && tailStart>patchStart,"Atomic edit handler must exist in actual route");
const tail=actualRoute.slice(tailStart);
fs.writeFileSync(path.join(runtime,"route-tail.mjs"),ts.transpileModule(prelude+tail,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {run}=await import(pathToFileURL(path.join(runtime,"route-tail.mjs")).href);
function mockDb({visibility="public",readError=false,rpcError=null,rpcData={ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123",updatedAt:"2026-01-02T00:00:01.123456Z"}}={}){
  const calls={rpc:0,sent:null};
  return {calls,
    from(table){const result=table==="guitars"?{data:{id:guitar,owner_id:owner,visibility,serial_number:"ORIGINAL123",hero_image_path:mediaPath,updated_at:"2026-01-02T00:00:00Z"},error:null}:
      table==="guitar_media"?{data:[media],error:null}:{data:[doc],error:readError?{message:"injected read failure"}:null};
      const builder={select(){return builder},eq(){return builder},maybeSingle(){return Promise.resolve(result)},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
      return builder;},
    async rpc(name,args){calls.rpc++;calls.sent={name,args};return {data:rpcData,error:rpcError};}
  };
}
const edit=(extra={})=>({expectedDocuments:[{id:doc.id,updatedAt:doc.updated_at}],expectedUpdatedAt:"2026-01-02T00:00:00Z",qrCode:"QRG-ORIGINAL123",brand:"Fender",model:"Strat",serial:"ORIGINAL123",instrumentType:"Electric Guitar",photos:[mediaPath],...extra});
await test("existing document read failure returns failure before uploading or mutating",async()=>{
  const db=mockDb({readError:true});const result=await run(edit(),db);
  assert.equal(result.body.ok,false);assert.equal(db.calls.rpc,0);
});
await test("missing migration fails closed with 503 and never says saved",async()=>{
  const db=mockDb({rpcError:{code:"PGRST202"}});const result=await run(edit(),db);
  assert.equal(result.body.ok,false);assert.equal(result.status,503);assert.equal(result.body.code,"profile_save_unavailable");assert.equal(db.calls.rpc,1);
});
for(const code of ["PT409","40001"]) await test("atomic RPC conflict "+code+" returns 409 and never says saved",async()=>{
  const db=mockDb({rpcError:{code}});const result=await run(edit(),db);
  assert.equal(result.body.ok,false);assert.equal(result.status,409);
});
await test("an ambiguous response never returns success",async()=>{
  const db=mockDb({rpcData:null});const result=await run(edit(),db);
  assert.equal(result.body.ok,false);assert.equal(result.status,502);
});
await test("confirmed RPC returns success only once, using committed code and path",async()=>{
  const db=mockDb();const result=await run(edit(),db);
  assert.equal(result.body.ok,true);assert.equal(result.body.permanentPath,"/i/QRG-ORIGINAL123");assert.equal(db.calls.rpc,1);
});

await test("stale browser full-save version is bound to RPC instead of the fresh route read",async()=>{
  const stale="2026-01-01T00:00:00.123456Z", current="2026-01-02T00:00:00Z";
  const db=mockDb();let mutations=0,sent;
  db.rpc=async(name,args)=>{db.calls.rpc++;sent={name,args};
    if(args.p_expected_updated_at!==current)return {data:null,error:{code:"PT409"}};
    mutations++;return {data:{ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123",updatedAt:"2026-01-02T00:00:01.123456Z"},error:null};};
  const result=await run(edit({expectedUpdatedAt:stale}),db);
  assert.equal(result.status,409);assert.equal(result.body.ok,false);assert.equal(result.body.code,"profile_changed");
  assert.equal(mutations,0);assert.equal(db.calls.rpc,1);assert.equal(sent.name,"save_catalog_instrument_profile");
  assert.equal(sent.args.p_expected_updated_at,stale);assert.equal(sent.args.p_owner_id,owner);assert.equal(sent.args.p_guitar_id,guitar);
  assert.deepEqual(Object.keys(sent.args).sort(),["p_expected_updated_at","p_guitar_id","p_owner_id","p_payload"]);
});
for(const expectedUpdatedAt of [undefined,null,"","2026","invalid","2026-01-02T00:00:00.1234567Z",42])
await test("invalid browser snapshot version rejects before full-save calls: "+JSON.stringify(expectedUpdatedAt),async()=>{
  const db=mockDb();db.from=()=>{throw new Error("Missing version must reject before full-save reads");};
  const result=await run(edit({expectedUpdatedAt}),db);
  assert.equal(result.status,400);assert.equal(result.body.ok,false);assert.equal(result.body.code,"profile_version_required");assert.equal(db.calls.rpc,0);
});
await test("precise browser version is forwarded raw and the committed version is returned",async()=>{
  const loaded="2026-01-02T00:00:00.123456+00:00",saved="2026-01-02T00:00:01.654321+00:00";
  const db=mockDb();let sent;
  db.rpc=async(name,args)=>{db.calls.rpc++;sent={name,args};return {error:null,data:{ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123",updatedAt:saved}};};
  const result=await run(edit({expectedUpdatedAt:loaded}),db);
  assert.equal(result.body.ok,true);assert.equal(result.body.updatedAt,saved);assert.equal(sent.args.p_expected_updated_at,loaded);assert.equal(sent.args.p_owner_id,owner);
});
for(const updatedAt of [undefined,null,"invalid","2026"])
await test("unconfirmed committed version is not reported saved: "+JSON.stringify(updatedAt),async()=>{
  const db=mockDb({rpcData:{ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123",updatedAt}});
  const result=await run(edit(),db);assert.equal(result.status,502);assert.equal(result.body.ok,false);assert.equal(result.body.code,"profile_save_unconfirmed");assert.equal(db.calls.rpc,1);
});
await test("Edit and Quick Edit wire the loaded version and retain the confirmed response version",async()=>{
  const loaded="2026-01-02T00:00:00.123456+00:00",saved="2026-01-02T00:00:01.654321+00:00";
  for(const [relative,variable] of [["apps/web/app/edit/[code]/page.tsx","original"],["apps/web/components/ProfileQuickEdit.tsx","record"]]){
    const source=readRepo(relative),tree=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const versions=[],confirmations=[];
    const visit=node=>{
      if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==="expectedUpdatedAt")versions.push(node.initializer.getText(tree));
      if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==="updatedAt"&&node.initializer.getText(tree)==="payload.updatedAt")confirmations.push(node.initializer.getText(tree));
      ts.forEachChild(node,visit);};visit(tree);
    assert.equal(versions.length,1);
    if(variable==="record")assert.ok(confirmations.length>=1);
    else {
      assert.equal(confirmations.length,0,"Full Edit must reload server-assigned document IDs, not invent a local saved snapshot");
      assert.ok(source.includes("const savedInstrument = { ...freshRecord.instrument"));
      assert.ok(source.includes("freshRecord.instrument.updatedAt"));
    }
    const evaluate=(expression,values)=>new Function(...Object.keys(values),ts.transpileModule("return ("+expression+");",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(values));
    assert.equal(evaluate(versions[0],{[variable]:{updatedAt:loaded}}),loaded);
    if(variable==="record")assert.equal(evaluate(confirmations[0],{payload:{updatedAt:saved}}),saved);
    const saveStart=source.indexOf(variable==="original"?"async function saveChanges":"async function save()");
    const save=source.slice(saveStart);
    assert.ok(save.indexOf("Reload this Profile before saving again.")<save.indexOf(variable==="original"?"stageSelectedFiles(": 'fetch("/api/instruments"'));
  }
});


function documentVersionDb(rows=[doc],parentVersion="2026-01-02T00:00:00Z"){
  const db=mockDb(),baseFrom=db.from.bind(db),state={mutations:0,sent:null,rows:structuredClone(rows)};
  db.from=table=>{
    if(table!=="guitar_documents")return baseFrom(table);
    const result={data:rows,error:null};
    const builder={select(){return builder},eq(){return builder},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
    return builder;
  };
  db.rpc=async(name,args)=>{
    db.calls.rpc++;state.sent={name,args};
    assert.equal(name,"save_catalog_instrument_profile");
    assert.equal(args.p_owner_id,owner);assert.equal(args.p_guitar_id,guitar);
    assert.deepEqual(Object.keys(args).sort(),["p_expected_updated_at","p_guitar_id","p_owner_id","p_payload"]);
    // Model only the existing installed SQL's locked count + ID/version guard.
    const expected=args.p_payload.expected_documents;
    if(args.p_expected_updated_at!==parentVersion || !Array.isArray(expected) || expected.length!==rows.length ||
       expected.some(entry=>!rows.some(row=>row.id.toLowerCase()===entry.id.toLowerCase()&&row.updated_at===entry.updated_at))) {
      return {data:null,error:{code:"PT409"}};
    }
    state.mutations++;
    return {error:null,data:{ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123",updatedAt:"2026-01-02T00:00:01.123456Z"}};
  };
  return {db,state};
}
const loadedDocuments=rows=>rows.map(({id,updated_at})=>({id,updatedAt:updated_at}));
await test("child snapshot stale document version rejects instead of substituting the fresh read",async()=>{
  const old="2026-01-01T00:00:00.123456Z",browser=[{id:doc.id,updatedAt:old}];
  const {db,state}=documentVersionDb();
  const before=structuredClone(state.rows);
  const result=await run(edit({expectedDocuments:browser,documents:[{name:"Stale draft",storagePath:documentPath,privateNotes:"Stale notes"}]}),db);
  assert.equal(result.status,409);assert.equal(result.body.ok,false);assert.equal(result.body.code,"profile_changed");
  assert.equal(state.mutations,0);assert.deepEqual(state.rows,before);assert.equal(db.calls.rpc,1);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:old}]);
  assert.equal(state.sent.args.p_expected_updated_at,"2026-01-02T00:00:00Z");
});
await test("child snapshot concurrent document addition conflicts even if parent version is unchanged",async()=>{
  const added={...doc,id:"40000000-0000-4000-8000-000000000002",storage_path:documentPath+".second",name:"Added"};
  const {db,state}=documentVersionDb([doc,added]);
  const result=await run(edit({documents:[]}),db);
  assert.equal(result.status,409);assert.equal(state.mutations,0);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:doc.updated_at}]);
});
await test("child snapshot concurrent document removal conflicts even if parent version is unchanged",async()=>{
  const {db,state}=documentVersionDb([]);
  const result=await run(edit({documents:[]}),db);
  assert.equal(result.status,409);assert.equal(state.mutations,0);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:doc.updated_at}]);
});
await test("child snapshot stale intentionally removed document remains in the concurrency vector",async()=>{
  const old="2026-01-01T00:00:00Z",{db,state}=documentVersionDb();
  const result=await run(edit({documents:[],expectedDocuments:[{id:doc.id,updatedAt:old}]}),db);
  assert.equal(result.status,409);assert.equal(state.mutations,0);
  assert.deepEqual(state.sent.args.p_payload.documents,[]);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:old}]);
});
await test("child snapshot valid intentional removal binds the original document, not the desired empty list",async()=>{
  const {db,state}=documentVersionDb();
  const result=await run(edit({documents:[]}),db);
  assert.equal(result.body.ok,true);assert.equal(state.mutations,1);
  assert.deepEqual(state.sent.args.p_payload.documents,[]);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:doc.updated_at}]);
});
await test("child snapshot all originally loaded legacy documents are bound while reducing to the allowed desired count",async()=>{
  const rows=Array.from({length:11},(_,index)=>({...doc,id:"40000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),storage_path:documentPath+"."+index}));
  const {db,state}=documentVersionDb(rows);
  const result=await run(edit({documents:[],expectedDocuments:loadedDocuments(rows)}),db);
  assert.equal(result.body.ok,true);assert.equal(state.mutations,1);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,rows.map(({id,updated_at})=>({id,updated_at})));
});
await test("child snapshot raw precise timestamp and omitted private metadata are preserved",async()=>{
  const precise="2026-01-02T00:00:00.123456+00:00",row={...doc,updated_at:precise};
  const {db,state}=documentVersionDb([row]);
  const result=await run(edit({expectedDocuments:loadedDocuments([row])}),db);
  assert.equal(result.body.ok,true);assert.equal(state.mutations,1);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:precise}]);
  const saved=state.sent.args.p_payload.documents[0];
  for(const key of ["id","name","storage_path","is_public","document_type","public_description","private_notes","issuer_source","document_date","description","related_timeline_event_id","mime_type","file_size_bytes"])
    assert.equal(saved[key],row[key],key);
  assert.equal(saved.related_service_event_id,"");
});
await test("child snapshot new verified document is excluded while retained document identity and private fields survive",async()=>{
  const {db,state}=documentVersionDb();
  const result=await run(edit({uploadId,documents:[
    {name:"Renamed",url:baseUrl+"/storage/v1/object/sign/instrument-documents/"+documentPath+"?token=loaded"},
    {id:"document-1",name:"New receipt",storagePath:stagedDocument,visibility:"hidden"}
  ]}),db);
  assert.equal(result.body.ok,true);assert.equal(state.mutations,1);
  assert.deepEqual(state.sent.args.p_payload.expected_documents,[{id:doc.id,updated_at:doc.updated_at}]);
  const [retained,added]=state.sent.args.p_payload.documents;
  assert.equal(retained.id,doc.id);assert.equal(retained.name,"Renamed");assert.equal(retained.private_notes,doc.private_notes);
  assert.equal(retained.related_timeline_event_id,doc.related_timeline_event_id);assert.equal(retained.mime_type,doc.mime_type);assert.equal(retained.file_size_bytes,doc.file_size_bytes);
  assert.equal(added.id,null);assert.equal(added.storage_path,stagedDocument);assert.equal(added.mime_type,"application/pdf");assert.equal(added.file_size_bytes,16);assert.equal(added.is_public,false);
});
await test("child snapshot valid empty loaded list does not add a new staged document to expected existing rows",async()=>{
  const {db,state}=documentVersionDb([]);
  const result=await run(edit({uploadId,expectedDocuments:[],documents:[{name:"New receipt",storagePath:stagedDocument}]}),db);
  assert.equal(result.body.ok,true);assert.deepEqual(state.sent.args.p_payload.expected_documents,[]);
  assert.equal(state.sent.args.p_payload.documents[0].id,null);
});
const invalidDocumentSnapshots=[
  undefined,null,{},[null],[{}],[{id:42,updatedAt:doc.updated_at}],
  [{id:"document-0",updatedAt:doc.updated_at}],[{id:doc.id}],
  [{id:doc.id,updatedAt:"invalid"}],[{id:doc.id,updatedAt:"2026-99-02T00:00:00Z"}],
  [{id:doc.id,updatedAt:"2026-01-02T00:00:00.1234567Z"}],
  [{id:doc.id,updatedAt:doc.updated_at},{id:doc.id,updatedAt:doc.updated_at}],
  [{id:"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",updatedAt:doc.updated_at},{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",updatedAt:doc.updated_at}]
];
for(const [index,expectedDocuments] of invalidDocumentSnapshots.entries())
await test("child snapshot invalid loaded document vector rejects before full-save reads: "+index,async()=>{
  const db=mockDb();db.from=()=>{throw new Error("Invalid document vector must reject before any full-save reads");};
  const result=await run(edit({expectedDocuments}),db);
  assert.equal(result.status,400);assert.equal(result.body.ok,false);assert.equal(result.body.code,"profile_document_versions_required");assert.equal(db.calls.rpc,0);
});
const evaluateSourceExpression=(expression,values)=>new Function(...Object.keys(values),ts.transpileModule("return ("+expression+");",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)(...Object.values(values));
function sourceNodes(relative,predicate){
  const source=readRepo(relative),tree=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];
  const visit=node=>{if(predicate(node,tree))nodes.push(node);ts.forEachChild(node,visit);};visit(tree);
  return {source,tree,nodes};
}
await test("child snapshot actual Edit and Quick request expressions use all original loaded rows, not edited placeholders",async()=>{
  const browserDocs=[{id:doc.id,updatedAt:"2026-01-02T00:00:00.123456+00:00",privateNotes:"Keep"}];
  for(const [relative,variable]of [["apps/web/app/edit/[code]/page.tsx","original"],["apps/web/components/ProfileQuickEdit.tsx","record"]]){
    const {tree,nodes}=sourceNodes(relative,(node,tree)=>ts.isPropertyAssignment(node)&&node.name.getText(tree)==="expectedDocuments");
    assert.equal(nodes.length,1);
    const actual=evaluateSourceExpression(nodes[0].initializer.getText(tree),{
      [variable]:{documentFiles:browserDocs},documentFiles:[{id:"document-0",updatedAt:"invented"}],staged:{documents:[]}
    });
    assert.deepEqual(actual,browserDocs.map(({id,updatedAt})=>({id,updatedAt})));
    assert.deepEqual(evaluateSourceExpression(nodes[0].initializer.getText(tree),{[variable]:{documentFiles:[]}}),[]);
  }
});
await test("child snapshot actual client guards reject unversioned local IDs before staging or saving",async()=>{
  const versionPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  const documentIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for(const [relative,variable]of [["apps/web/app/edit/[code]/page.tsx","original"],["apps/web/components/ProfileQuickEdit.tsx","record"]]){
    const {source,tree,nodes}=sourceNodes(relative,node=>ts.isIfStatement(node)&&node.expression.getText().includes("!Array.isArray("+variable+".documentFiles)"));
    assert.equal(nodes.length,1);
    const condition=nodes[0].expression.getText(tree),evaluate=documentFiles=>evaluateSourceExpression(condition,{[variable]:{documentFiles},versionPattern,documentIdPattern});
    for(const invalid of [undefined,null,[null],[{id:"document-0",updatedAt:doc.updated_at}],[{id:doc.id}],[{id:doc.id,updatedAt:"invalid"}]])assert.equal(evaluate(invalid),true);
    assert.equal(evaluate([]),false);assert.equal(evaluate([{id:doc.id,updatedAt:doc.updated_at}]),false);
    const save=source.slice(source.indexOf(variable==="original"?"async function saveChanges":"async function save()"));
    assert.ok(save.indexOf(condition)<save.indexOf(variable==="original"?"stageSelectedFiles(": 'fetch("/api/instruments"'));
  }
});
await test("child snapshot actual Quick confirmed response advances all retained document versions without dropping metadata",async()=>{
  const relative="apps/web/components/ProfileQuickEdit.tsx";
  const {tree,nodes}=sourceNodes(relative,(node,tree)=>ts.isPropertyAssignment(node)&&node.name.getText(tree)==="documentFiles"&&node.initializer.getText(tree).includes("payload.updatedAt"));
  assert.equal(nodes.length,1);
  const originalDocs=[{id:doc.id,updatedAt:doc.updated_at,createdAt:"2025-01-01T00:00:00Z",privateNotes:doc.private_notes,issuerSource:doc.issuer_source,relatedTimelineEventId:doc.related_timeline_event_id,url:"signed-owner-url",visibility:"hidden",mimeType:"application/pdf",fileSizeBytes:1234}];
  const committed="2026-01-02T00:00:01.123456Z";
  const advanced=evaluateSourceExpression(nodes[0].initializer.getText(tree),{record:{documentFiles:originalDocs},payload:{updatedAt:committed}});
  assert.deepEqual(advanced,originalDocs.map(document=>({...document,updatedAt:committed})));
  assert.equal(originalDocs[0].updatedAt,doc.updated_at,"loaded immutable record is not mutated in place");
  const {db,state}=documentVersionDb([{...doc,updated_at:committed}],committed);
  const result=await run(edit({expectedUpdatedAt:committed,expectedDocuments:advanced.map(({id,updatedAt})=>({id,updatedAt}))}),db);
  assert.equal(result.body.ok,true);assert.equal(state.mutations,1);
});
await test("child snapshot actual Full Edit requires a fenced authoritative reload before rebasing new document IDs",async()=>{
  const relative="apps/web/app/edit/[code]/page.tsx";
  const {source,tree,nodes}=sourceNodes(relative,node=>ts.isIfStatement(node)&&node.expression.getText().includes("!freshRecord?.ok"));
  assert.equal(nodes.length,1);
  const condition=nodes[0].expression.getText(tree);
  const versionPattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
  const idPattern=sourceNodes(relative,node=>ts.isVariableDeclaration(node)&&node.name.getText()==="documentIdPattern").nodes;
  assert.equal(idPattern.length,1);
  const documentIdPattern=evaluateSourceExpression(idPattern[0].initializer.getText(tree),{});
  const evaluate=freshRecord=>evaluateSourceExpression(condition,{freshRecord,versionPattern,documentIdPattern});
  for(const failed of [null,{ok:false},{ok:true,instrument:{updatedAt:doc.updated_at}},{ok:true,instrument:{updatedAt:doc.updated_at,documentFiles:[{id:"document-0",updatedAt:doc.updated_at}]}},{ok:true,instrument:{updatedAt:"invalid",documentFiles:[]}}])assert.equal(evaluate(failed),true);
  const fresh={ok:true,instrument:{updatedAt:"2026-01-02T00:00:01.123456Z",documentFiles:[{id:doc.id,updatedAt:doc.updated_at},{id:"40000000-0000-4000-8000-000000000002",updatedAt:"2026-01-02T00:00:01.123456Z",privateNotes:"New doc",createdAt:"server creation",url:"server signed URL"}],qrStyle:{}}};
  assert.equal(evaluate(fresh),false);
  const saved=sourceNodes(relative,node=>ts.isVariableDeclaration(node)&&node.name.getText()==="savedInstrument").nodes;
  assert.equal(saved.length,1);assert.ok(!ts.isConditionalExpression(saved[0].initializer));
  const reloaded=evaluateSourceExpression(saved[0].initializer.getText(tree),{freshRecord:fresh,normalizeQrStyle:value=>value});
  assert.deepEqual(reloaded.documentFiles,fresh.instrument.documentFiles);
  const guardIndex=source.indexOf("      if (!freshRecord?.ok");
  assert.ok(source.slice(guardIndex-65,guardIndex).includes("if (!isCurrent(operation)) return;"));
  assert.ok(nodes[0].thenStatement.getText(tree).includes("setMessage(recoveryMessage())"));
  assert.ok(nodes[0].thenStatement.getText(tree).includes("return;"));
  assert.ok(guardIndex<source.indexOf('clearRecovery("details")',guardIndex));
  assert.ok(source.indexOf("setOriginal(savedInstrument)",guardIndex)>guardIndex);
});

for (const stored of ["private","unlisted","public"]) for (const supplied of [undefined,"public","private","unlisted"]) await test("ordinary edit uses stored " + stored + ", incoming " + supplied, async () => {
 const db=mockDb({visibility:stored}),result=await run(edit({visibility:supplied}),db);
 assert.equal(result.status,200);assert.equal(db.calls.rpc,1);assert.equal(db.calls.sent.name,"save_catalog_instrument_profile");
 assert.equal(db.calls.sent.args.p_payload.guitar.visibility,stored);
 assert.equal(db.calls.sent.args.p_payload.documents[0].is_public,false);
 assert.equal(db.calls.sent.args.p_expected_updated_at,"2026-01-02T00:00:00Z");
});
for (const visibility of [null,"PUBLIC","",true]) await test("invalid edit visibility fails before full-save read/RPC: " + JSON.stringify(visibility), async () => {
 const db=mockDb();db.from=()=>{throw new Error("Invalid visibility must reject before reads");};
 const result=await run(edit({visibility}),db);
 assert.equal(result.status,400);assert.equal(result.body.code,"profile_visibility_invalid");assert.equal(db.calls.rpc,0);
});
for (const visibility of [null,"invalid"]) await test("invalid stored visibility fails closed: " + visibility, async () => {
 const db=mockDb({visibility}),result=await run(edit(),db);assert.equal(result.status,502);assert.equal(db.calls.rpc,0);
});

for(const visibility of ["private","unlisted","public"])await test("actual Full/Quick Edit hydration/request/result expressions preserve "+visibility,async()=>{
 for(const relative of ["apps/web/app/edit/[code]/page.tsx","apps/web/components/ProfileQuickEdit.tsx"]){
  const {tree,nodes}=sourceNodes(relative,(node,tree)=>ts.isPropertyAssignment(node)&&node.name.getText(tree)==="visibility");
  const wired=nodes.filter(node=>["instrument.visibility","form.visibility"].includes(node.initializer.getText(tree)) ||
   (relative.includes("ProfileQuickEdit")&&node.initializer.getText(tree).startsWith('record.visibility === "public"')));
  assert.equal(wired.length,3,relative+" must bind hydration, outgoing/preview and saved visibility");
  for(const node of wired)assert.equal(evaluateSourceExpression(node.initializer.getText(tree),{instrument:{visibility},record:{visibility},form:{visibility}}),visibility);
 }
});
for(const [relative,variable]of [["apps/web/app/edit/[code]/page.tsx","instrument"],["apps/web/components/ProfileQuickEdit.tsx","record"]])await test("actual "+variable+" visibility guard fails closed rather than inventing public",async()=>{
 const {tree,nodes}=sourceNodes(relative,(node,tree)=>ts.isIfStatement(node)&&node.expression.getText(tree).includes(variable+'.visibility !== "public"'));
 assert.equal(nodes.length,1);const guard=nodes[0];
 for(const visibility of [undefined,null,"invalid"])assert.equal(evaluateSourceExpression(guard.expression.getText(tree),{[variable]:{visibility}}),true);
 for(const visibility of ["private","unlisted","public"])assert.equal(evaluateSourceExpression(guard.expression.getText(tree),{[variable]:{visibility}}),false);
 assert.ok(guard.thenStatement.getText(tree).includes("throw new Error"));
});
await test("Save Changes and Save-and-View retain ordinary-save calls without inferred publication action",async()=>{
 const relative="apps/web/app/edit/[code]/page.tsx";
 const {tree,nodes}=sourceNodes(relative,(node,tree)=>ts.isCallExpression(node)&&node.expression.getText(tree)==="saveChanges");
 assert.deepEqual(nodes.map(node=>node.arguments[0].getText(tree)).sort(),["false","true"]);
});

console.log(`Completed ${passed} asset and route failure-path tests.`);

