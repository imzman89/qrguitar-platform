import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{pathToFileURL}from'node:url';import ts from 'typescript';import{readRepo}from'./atomic-test-support.mjs';
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'qrguitar-transfer-access-tests-'));
const prelude=`
let current,user=null;export function setBackend(db,nextUser){current=db;user=nextUser;}
const NextResponse={json:(body,init={})=>({body,status:init.status||200})};
const createServerSupabaseClient=()=>current;
const getAuthenticatedUser=async()=>({user});
const readAdminEmailList=()=>[];
const normalizeAdminEmail=value=>String(value||'').trim().toLowerCase();
const isAdminRole=value=>value==='admin';
`;
const entry=path.join(runtime,'route.mjs');fs.writeFileSync(entry,ts.transpileModule(prelude+readRepo('apps/web/app/api/transfers/route.ts').replace(/^import .*\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const route=await import(pathToFileURL(entry).href),id='30000000-0000-4000-8000-000000000001',guitarId='20000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000001',recipient='10000000-0000-4000-8000-000000000002',stranger='10000000-0000-4000-8000-000000000003';
const baseTransfer={id,guitar_id:guitarId,from_owner_id:owner,to_email:'recipient@example.test',to_name:'Private Recipient',status:'sent',accepted_by:null,accepted_at:null,created_at:'2026-09-01T12:00:00Z',purchaser_code_hash:'a'.repeat(64),claim_token_hash:'b'.repeat(64),fee_cents:700};
const guitar={id:guitarId,owner_id:owner,qr_code:'SECRET-SERIAL',permanent_path:'/i/SECRET-SERIAL',name:'Private Guitar Name',brand:'Fender',visibility:'private'};
function backend({row=baseTransfer,role='owner',failTable=''}={}){return{from(table){const chain={select(){return chain;},eq(){return chain;},or(){return chain;},async maybeSingle(){return{data:table==='profiles'?{role}:row,error:table===failTable?{message:'sensitive SQL internal details'}:null};},async in(){return{data:[guitar],error:table===failTable?{message:'sensitive SQL internal details'}:null};},async order(){return{data:[row],error:table===failTable?{message:'sensitive SQL internal details'}:null};}};return chain;}};}
async function get(user,db=backend(),query='id='+id){route.setBackend(db,user);return route.GET({url:'https://example.invalid/api/transfers?'+query});}
let passed=0;async function test(name,fn){await fn();console.log('PASS '+name);passed++;}
const assertGeneric=r=>{assert.equal(r.status,200);assert.equal(r.body.requiresSignIn,true);assert.deepEqual(r.body.transfer,{id});for(const secret of ['SECRET-SERIAL','Private Guitar Name','recipient@example.test','Private Recipient',owner,'accepted','2026-09-01'])assert.equal(JSON.stringify(r.body).includes(secret),false);};
await test('anonymous private handoff reveals only opaque transfer ID and sign-in gate',async()=>assertGeneric(await get(null)));
await test('unrelated signed-in owner role cannot see private handoff details',async()=>assertGeneric(await get({id:stranger,email:'stranger@example.test'})));
await test('empty buyer recipient email cannot match an unrelated account with no email',async()=>assertGeneric(await get({id:stranger,email:''},backend({row:{...baseTransfer,to_email:''}}))));
await test('assigned recipient can read the private handoff after authentication',async()=>{const r=await get({id:recipient,email:' RECIPIENT@example.test '});assert.equal(r.body.requiresSignIn,false);assert.equal(r.body.transfer.guitarName,guitar.name);assert.equal(r.body.transfer.toEmail,baseTransfer.to_email);});
await test('current owner and admin role can read the authorized private handoff',async()=>{for(const [user,db]of[[{id:owner,email:'owner@example.test'},backend()],[{id:stranger,email:'admin@example.test'},backend({role:'admin'})]]){const r=await get(user,db);assert.equal(r.body.requiresSignIn,false);assert.equal(r.body.transfer.guitarQrCode,guitar.qr_code);}});
await test('positive historical fee has no fabricated payment-collected evidence',async()=>{const r=await get({id:owner,email:'owner@example.test'});assert.equal(r.body.transfer.feeCents,700);assert.equal(r.body.transfer.paymentCollected,false);});
await test('database or authorization-read errors become handled503 without leaked SQL',async()=>{for(const failTable of ['ownership_transfers','guitars','profiles']){const r=await get({id:stranger,email:'other@example.test'},backend({failTable}));assert.equal(r.status,503);assert.equal(r.body.ok,false);assert.equal(r.body.code,'transfer_read_unavailable');assert.equal(JSON.stringify(r.body).includes('sensitive SQL'),false);}});
await test('invalid transfer IDs and absent records return404 without details',async()=>{assert.equal((await get(null,backend(),'id=not-a-uuid')).status,404);assert.equal((await get(null,backend({row:null}))).status,404);});
await test('mine requires authentication and preserves participant history',async()=>{assert.equal((await get(null,backend(),'scope=mine')).status,401);const r=await get({id:owner,email:'owner@example.test'},backend(),'scope=mine');assert.equal(r.body.transfers[0].id,id);assert.equal(r.body.transfers[0].paymentCollected,false);});
console.log('Completed '+passed+' transfer access/payment-mapping tests.');
