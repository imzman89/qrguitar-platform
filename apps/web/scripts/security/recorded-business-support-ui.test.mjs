import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const args=process.argv.slice(2),repo=path.resolve(args.includes("--repo")?args[args.indexOf("--repo")+1]:path.join(path.dirname(fileURLToPath(import.meta.url)),"../../../.."));
const ts=createRequire(path.join(repo,"apps/web/package.json"))("typescript");
const actor="11111111-1111-4111-8111-111111111111",transfer="55555555-5555-4555-8555-555555555555";
const valid={transferId:transfer,publicName:"Synthetic business",handle:"recorded-shop",messageAllowed:true,warrantyHelpUrl:"https://support.example.test/"};
const session={access_token:"synthetic-fixture-token",user:{id:actor}};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
let passes=0;
async function test(name,run){await run();passes++;console.log("PASS "+name);}
function fixture(){
 let states=[],index=0,callbacks=[],listener,current=session,pending=[];
 const jsx=(type,props)=>({type,props});
 const react={useState(initial){const position=index++;states[position]??=initial;return [states[position],value=>{states[position]=typeof value==="function"?value(states[position]):value;}];},useEffect(callback){callbacks.push(callback);}};
 const auth={async getSession(){return {data:{session:current},error:null};},onAuthStateChange(callback){listener=callback;return {data:{subscription:{unsubscribe(){listener=null;}}}};}};
 const cache=new Map();
 function load(relative){
  if(cache.has(relative))return cache.get(relative).exports;
  const source=fs.readFileSync(path.join(repo,relative),"utf8"),module={exports:{}};cache.set(relative,module);
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const require=specifier=>{
   if(specifier==="react")return react;
   if(specifier==="react/jsx-runtime")return {jsx,jsxs:jsx,Fragment:"fragment"};
   if(specifier==="next/link")return {__esModule:true,default:"link"};
   if(specifier==="lucide-react")return {MessageCircle:"icon"};
   if(specifier.endsWith("supabase-browser"))return {createBrowserSupabaseClient:()=>({auth})};
   if(specifier.endsWith("UiTextProvider"))return {useUiText:()=>((_key,fallback)=>fallback)};
   if(specifier.startsWith(".")){const target=path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier));return load(target+(target.endsWith("MemberMessageLink")?".tsx":".ts"));}
   throw new Error("Unexpected UI dependency: "+specifier);
  };
  vm.runInNewContext("(function(require,module,exports){"+code+"})",{URL,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}))})(require,module,module.exports);
  return module.exports;
 }
 const component=load("apps/web/components/RecordedBusinessSupport.tsx").RecordedBusinessSupport;
 function render(){index=0;return component({code:"QRG-SUPPORT"});}
 const initial=render();const cleanup=callbacks[0]();
 return {initial,render,pending,states,cleanup,async auth(value){current=value;listener?.("SIGNED_IN",value);await flush();},async finish(contact=valid,index=0){pending[index].resolve({ok:true,json:async()=>({ok:true,actorId:actor,contact})});await flush();}};
}
function flatten(node){if(node==null||typeof node!=="object")return [node];const expanded=typeof node.type==="function"?node.type(node.props):node;return [expanded,...[expanded.props?.children].flat(2).flatMap(flatten)];}
await test("owner component clears on sign-out and discards older account response",async()=>{
 const f=fixture();await flush();assert.equal(f.initial,null);assert.equal(f.pending.length,1);
 assert.equal(f.pending[0].options.cache,"no-store");assert.ok(f.pending[0].options.signal);
 await f.auth(null);assert.equal(f.states[0],null);assert.equal(f.pending[0].options.signal.aborted,true);
 await f.finish();assert.equal(f.render(),null);f.cleanup();
});
await test("actual component exposes only opted-in actions; message carries transfer, never public profileCode",async()=>{
 for(const messages of [false,true])for(const help of [false,true]){
  const f=fixture();await flush();await f.finish({...valid,messageAllowed:messages,warrantyHelpUrl:help?valid.warrantyHelpUrl:""});
  const nodes=flatten(f.render()),links=nodes.filter(node=>node?.type==="link");
  assert.equal(links.length,messages?1:0);
  if(messages){const href=links[0].props.href;assert.ok(href.includes("transfer="+transfer));assert.ok(!href.includes("profile="));}
  assert.equal(nodes.filter(node=>node?.type==="a").length,help?1:0);
  if(help)assert.equal(nodes.find(node=>node?.type==="a").props.rel,"noopener noreferrer");
  assert.equal(nodes.some(node=>node?.type==="summary"),true);f.cleanup();
 }
});
await test("invalid assistance URL is a retryable failure with no rendered contact",async()=>{
 const f=fixture();await flush();await f.finish({...valid,warrantyHelpUrl:"javascript:alert(1)"});
 assert.equal(f.states[0],null);assert.equal(f.states[1],true);assert.equal(flatten(f.render()).some(node=>node?.type==="button"),true);f.cleanup();
});
await test("owner route is the only mount; public Profile source is unchanged",async()=>{
 const owner=fs.readFileSync(path.join(repo,"apps/web/app/dashboard/profile/[code]/OwnerProfileClient.tsx"),"utf8");
 assert.match(owner,/status === "ready" && instrument && instrument.qrCode.toUpperCase\(\) === code.toUpperCase\(\)/);
 assert.match(owner,/<RecordedBusinessSupport code=\{instrument.qrCode\}/);
 const publicSource=fs.readFileSync(path.join(repo,"apps/web/app/i/[code]/ProfileClient.tsx"),"utf8");
 assert.doesNotMatch(publicSource,/RecordedBusinessSupport|ownerSupport/);
});
console.log(passes+" actual-source support UI fixture tests passed; not native/browser acceptance.");
