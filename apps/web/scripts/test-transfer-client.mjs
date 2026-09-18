import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(process.env.QRGUITAR_SOURCE_ROOT ? path.join(process.env.QRGUITAR_SOURCE_ROOT,"package.json") : import.meta.url)("typescript");
const source = fs.readFileSync(path.join(root, "app/transfer/[id]/page.tsx"), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect, accept, copy;
function visit(n) {
  if (ts.isCallExpression(n) && n.expression.getText(ast) === "useEffect") effect = n.arguments[0].getText(ast);
  if (ts.isFunctionDeclaration(n) && n.name?.text === "acceptTransfer") accept = n.getText(ast);
  if (ts.isFunctionDeclaration(n) && n.name?.text === "copyProfileLink") copy = n.getText(ast);
  ts.forEachChild(n, visit);
}
visit(ast);
function compile(code, env, returned) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(env), js + "\nreturn " + returned)(...Object.values(env));
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
function harness(fetch) {
  const state = { loading: true, loadError: false, requiresAccess: false, transfer: null, permanentPath: "", signedIn: false, accepting: false, message: "" };
  const revision = { current: 0 };
  let callback;
  let unsubscribed = false;
  const env = { fetch, transferId: "fixture-transfer", authRevision: revision,
    createBrowserSupabaseClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: "owner-a", user: { id: "a" } } } }),
      onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; }
    }}),
    AbortController, setTimeout, clearTimeout };
  for (const key of Object.keys(state)) env["set" + key[0].toUpperCase() + key.slice(1)] = value => { state[key] = value; };
  const dispose = compile("const effect = " + effect + ";", env, "effect")();
  return { state, env, revision, dispose, auth: session => callback("SIGNED_IN", session), unsubscribed: () => unsubscribed };
}
const record = { id: "fixture-transfer", status: "sent", guitarQrCode: "QRG-FIXTURE" };
const response = () => Response.json({ ok: true, transfer: record });
await test("network failure ends loading and offers retry", async () => {
  const h = harness(async () => { throw new Error("offline"); }); await flush();
  assert.equal(h.state.loading, false); assert.equal(h.state.loadError, true); assert.equal(h.state.transfer, null); h.dispose();
});
await test("malformed response never becomes a missing or successful transfer", async () => {
  const h = harness(async () => new Response("invalid-json")); await flush();
  assert.equal(h.state.loadError, true); assert.equal(h.state.transfer, null); h.dispose();
});
await test("unavailable transfer is distinct from retryable outage", async () => {
  const h = harness(async () => Response.json({ok:false,message:"Not available"},{status:404})); await flush();
  assert.equal(h.state.loadError, false); assert.equal(h.state.loading, false); assert.equal(h.state.message, "Not available"); h.dispose();
});
await test("generic access response requires the recipient account and exposes no private transfer", async () => {
  const h = harness(async () => Response.json({ok:true,requiresSignIn:true,transfer:{id:"fixture-transfer"}})); await flush();
  assert.equal(h.state.loading,false); assert.equal(h.state.loadError,false); assert.equal(h.state.requiresAccess,true); assert.equal(h.state.transfer,null); assert.equal(h.state.permanentPath,""); h.dispose();
});
await test("signout immediately clears prior private transfer before next response", async () => {
  const delayed = deferred(); let n = 0;
  const h = harness(async () => ++n === 1 ? response() : delayed.promise); await flush();
  assert.deepEqual(h.state.transfer, record); h.auth(null);
  assert.equal(h.state.transfer, null); assert.equal(h.state.signedIn, false);
  delayed.resolve(Response.json({ok:false},{status:401})); await flush(); h.dispose();
});
await test("old account response cannot replace the next account response", async () => {
  const delayed = deferred(); let n = 0; const second = { ...record, id: "second-account" };
  const h = harness(async () => ++n === 1 ? delayed.promise : Response.json({ok:true,transfer:second})); await flush();
  h.auth({access_token:"owner-b",user:{id:"b"}}); await flush();
  delayed.resolve(response()); await flush(); assert.deepEqual(h.state.transfer, second); h.dispose();
});
await test("late previous request error cannot clear current account transfer", async () => {
  const delayed = deferred(); let n = 0;
  const h = harness(async () => ++n === 1 ? delayed.promise : response()); await flush();
  h.auth({access_token:"owner-b",user:{id:"b"}}); await flush(); delayed.reject(new Error("old outage")); await flush();
  assert.deepEqual(h.state.transfer, record); assert.equal(h.state.loadError, false); h.dispose();
});
await test("unmount aborts request and ignores its late response", async () => {
  const delayed=deferred(); let signal;
  const h=harness(async (_url, init) => { signal=init.signal; return delayed.promise; }); await flush(); h.dispose();
  assert.equal(signal.aborted,true); assert.equal(h.unsubscribed(),true);
  delayed.resolve(response()); await flush(); assert.equal(h.state.transfer,null);
});
async function runAccept(fetch, during) {
  const state={accepting:false,message:"",loadError:false,transfer:record,permanentPath:""};
  const revision={current:1}; const env={fetch,transfer:record,authRevision:revision,feedbackRevision:{current:0},acceptMutation:{current:null},accepting:false,getSupabaseAccessToken:async()=>"fixture-token"};
  for(const key of Object.keys(state))env["set"+key[0].toUpperCase()+key.slice(1)] = value => {state[key]=value;};
  const pending=compile(accept,env,"acceptTransfer")(); if(during)await during(revision); await pending; return state;
}
await test("unknown acceptance outcome restores controls and requests status reload",async()=>{
  const state=await runAccept(async()=>{throw new Error("lost response");});
  assert.equal(state.accepting,false);assert.equal(state.loadError,true);assert.match(state.message,/could not confirm/i);assert.equal(state.transfer.status,"sent");
});
await test("acceptance commits display only after confirmed successful API response",async()=>{
  const accepted={...record,status:"accepted"};
  const state=await runAccept(async()=>Response.json({ok:true,transfer:accepted,permanentPath:"/i/QRG-FIXTURE"}));
  assert.deepEqual(state.transfer,accepted);assert.equal(state.accepting,false);assert.equal(state.permanentPath,"/i/QRG-FIXTURE");
});
await test("accept response after account change cannot expose previous transfer",async()=>{
  const delayed=deferred();const state=await runAccept(async()=>delayed.promise,async revision=>{
    await flush();revision.current++;delayed.resolve(Response.json({ok:true,transfer:{...record,status:"accepted"}}));
  });assert.equal(state.transfer.status,"sent");assert.equal(state.permanentPath,"");
});
for(const mode of ["missing","reject","success"]) await test("clipboard "+mode+" reports the actual outcome",async()=>{
  const messages=[];const clipboard=mode==="missing"?undefined:{writeText:async value=>{assert.equal(value,"https://qrguitar.com/i/QRG-FIXTURE");if(mode==="reject")throw new Error("denied");}};
  await compile(copy,{window:{navigator:{clipboard},location:{origin:"https://qrguitar.com"}},profileHref:"/i/QRG-FIXTURE",authRevision:{current:0},feedbackRevision:{current:0},acceptMutation:{current:null},accepting:false,setMessage:m=>messages.push(m)},"copyProfileLink")();
  assert.match(messages.at(-1), mode==="success"?/Profile link copied/:/Could not copy/);
});
console.log(count + " transfer UI behavior cases passed; no external messages or account writes.");
