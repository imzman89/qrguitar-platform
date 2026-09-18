import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../../.."),require=createRequire(path.join(root,"package.json")),ts=require("typescript");
const filename=path.join(root,"apps/web/lib/paypal-config.ts"),js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,module={exports:{}};
new Function("require","module","exports",js)(id=>id==="server-only"?{}:require(id),module,module.exports);
const {readPayPalConfig,readPayPalWebhookSweepSecret}=module.exports,secret="0123456789abcdef0123456789abcdef";
const live={QRGUITAR_PAYPAL_ENABLED:"true",PAYPAL_ENVIRONMENT:"live",PAYPAL_CLIENT_ID:"CLIENT_ID_123456",PAYPAL_CLIENT_SECRET:"private-api-secret",PAYPAL_MERCHANT_ID:"ABCDEFGHIJKLM",PAYPAL_WEBHOOK_ID:"WH-123456",CRON_SECRET:secret};
assert.equal(readPayPalConfig(live,"live").enabled,true);assert.equal(readPayPalConfig(live,"live").configured,true);assert.equal(readPayPalWebhookSweepSecret(live),secret);
const paused=readPayPalConfig({...live,QRGUITAR_PAYPAL_ENABLED:"false"},"live");assert.equal(paused.enabled,false);assert.equal(paused.configured,true);assert.ok(paused.clientId);
for(const value of[undefined,"short",`${secret} space`]){const env={...live,CRON_SECRET:value};assert.equal(readPayPalConfig(env,"live").enabled,false);assert.equal(readPayPalConfig(env,"live").configured,false);assert.equal(readPayPalConfig(env,"live").clientId,"");assert.equal(readPayPalWebhookSweepSecret(env),"");}
console.log("PayPal configuration: scheduler-auth fail-closed checks passed.");
