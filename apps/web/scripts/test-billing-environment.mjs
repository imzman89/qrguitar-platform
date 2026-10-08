import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript'),module={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync(new URL('../lib/billing-environment.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports);
const {isIsolatedBillingTestDatabase,profileBillingEnvironment}=module.exports;
const live='https://qvoruycxxrbarlafvhbi.supabase.co',sandbox='https://sandbox-example.supabase.co';
test('test mode cannot use the known production project, including slash/case variants',()=>{
  for(const url of [live,live+'/',live.toUpperCase()]){
    const env={STRIPE_ENVIRONMENT:'test',QRGUITAR_BILLING_TEST_DATABASE_URL:url};
    assert.equal(isIsolatedBillingTestDatabase(env,url),false);assert.equal(profileBillingEnvironment(env,url),null);
  }
});
test('test mode requires explicit matching isolated HTTPS database configuration',()=>{
  for(const url of ['',live,sandbox+'/path','http://sandbox-example.supabase.co','https://user:secret@sandbox-example.supabase.co',sandbox+'?x=1',sandbox+'#x']){
    const env={STRIPE_ENVIRONMENT:'test',QRGUITAR_BILLING_TEST_DATABASE_URL:url};assert.equal(profileBillingEnvironment(env,sandbox),null);
  }
  assert.equal(profileBillingEnvironment({STRIPE_ENVIRONMENT:'test',QRGUITAR_BILLING_TEST_DATABASE_URL:sandbox+'/'},sandbox),'test');
});
test('existing unset/live environments preserve live creation, unknown modes fail closed',()=>{
  assert.equal(profileBillingEnvironment({},live),'live');assert.equal(profileBillingEnvironment({STRIPE_ENVIRONMENT:'live'},live),'live');
  assert.equal(profileBillingEnvironment({STRIPE_ENVIRONMENT:'demo'},sandbox),null);
});
