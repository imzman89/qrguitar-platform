import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../../..");
const require=createRequire(path.join(root,"package.json")),ts=require("typescript"),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const filename=path.join(root,"apps/web/lib",name+".ts");
  const js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};modules.set(name,module.exports);new Function("require","module","exports",js)(id=>id==="server-only"?{}:id.startsWith("./")?load(id.slice(2)):require(id),module,module.exports);
  modules.set(name,module.exports);return module.exports;}
const {createPayPalWebhookSweepHandler}=load("paypal-webhook-sweep-http"),{BillingError}=load("billing-service");
const SECRET="0123456789abcdef0123456789abcdef",request=value=>new Request("https://www.qrguitar.com/api/internal/paypal-webhook-sweep",{headers:value?{Authorization:`Bearer ${value}`}:{}});
let passed=0;async function check(name,run){await run();passed++;console.log("PASS "+name);}

await check("private sweep requires the exact configured Bearer secret",async()=>{let calls=0;const handler=createPayPalWebhookSweepHandler({secret:()=>SECRET,sweep:async()=>{calls++;return{claimed:0,applied:0,completed:0,quarantined:0,deadlineReached:false};}});
  assert.equal((await handler(request())).status,401);assert.equal((await handler(request(SECRET+"x"))).status,401);assert.equal(calls,0);
});
await check("valid sweep returns only bounded operational counts",async()=>{const handler=createPayPalWebhookSweepHandler({secret:()=>SECRET,sweep:async()=>({claimed:3,applied:2,completed:1,quarantined:0,deadlineReached:false,deliveries:[{private:"omitted"}]})});
  const response=await handler(request(SECRET));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,claimed:3,applied:2,completed:1,quarantined:0,deadlineReached:false});assert.equal(response.headers.get("cache-control"),"no-store, no-cache, must-revalidate");
});
await check("missing configuration and transient sweep failure remain retryable",async()=>{const disabled=createPayPalWebhookSweepHandler({secret:()=>null,sweep:async()=>{throw new Error("unreachable");}}),failed=createPayPalWebhookSweepHandler({secret:()=>SECRET,sweep:async()=>{throw new BillingError(503,"webhook_queue_unavailable","retry");}});
  assert.equal((await disabled(request(SECRET))).status,503);const response=await failed(request(SECRET));assert.equal(response.status,503);assert.equal(response.headers.get("retry-after"),"60");
});

console.log(`PayPal webhook sweep HTTP boundary: ${passed} checks passed.`);
