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
const verifyProfileEditUploads=async()=>new Map();
export async function run(body,supabase){
  const auth={user:{id:"${owner}",email:"owner@example.test"}};
`;
const actualRoute=readRepo("apps/web/app/api/instruments/route.ts").replaceAll("\r\n","\n");
const patchStart=actualRoute.indexOf("export async function PATCH(request: Request)");
const tailStart=actualRoute.indexOf("  try {\n    const input = {",patchStart);
assert.ok(patchStart>=0 && tailStart>patchStart,"Atomic edit handler must exist in actual route");
const tail=actualRoute.slice(tailStart);
fs.writeFileSync(path.join(runtime,"route-tail.mjs"),ts.transpileModule(prelude+tail,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {run}=await import(pathToFileURL(path.join(runtime,"route-tail.mjs")).href);
function mockDb({readError=false,rpcError=null,rpcData={ok:true,qrCode:"QRG-ORIGINAL123",permanentPath:"/i/QRG-ORIGINAL123"}}={}){
  const calls={rpc:0};
  return {calls,
    from(table){const result=table==="guitars"?{data:{id:guitar,owner_id:owner,serial_number:"ORIGINAL123",hero_image_path:mediaPath,updated_at:"2026-01-02T00:00:00Z"},error:null}:
      table==="guitar_media"?{data:[media],error:null}:{data:[doc],error:readError?{message:"injected read failure"}:null};
      const builder={select(){return builder},eq(){return builder},maybeSingle(){return Promise.resolve(result)},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};
      return builder;},
    async rpc(){calls.rpc++;return {data:rpcData,error:rpcError};}
  };
}
const edit=(extra={})=>({qrCode:"QRG-ORIGINAL123",brand:"Fender",model:"Strat",serial:"ORIGINAL123",instrumentType:"Electric Guitar",photos:[mediaPath],...extra});
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
console.log(`Completed ${passed} asset and route failure-path tests.`);

