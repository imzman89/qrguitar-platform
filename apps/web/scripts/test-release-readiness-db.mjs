import assert from 'node:assert/strict';import fs from 'node:fs';import path from'node:path';import{createHash}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';import{createRequire}from'node:module';
const scripts=path.dirname(fileURLToPath(import.meta.url));
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const repo=path.resolve(option('--repo')||path.resolve(scripts,'../../..')),overlay=option('--migration-root');
const source=overlay?path.resolve(overlay):repo;
const manifest=JSON.parse(fs.readFileSync(path.join(source,'apps/web/scripts/release-readiness-manifest.json'),'utf8'));
const migrationSha=relative=>createHash('sha256').update(fs.readFileSync(path.join(source,relative),'utf8').replaceAll('\r\n','\n')).digest('hex');
assert.equal(manifest.paypalWebhookSourceSha256,migrationSha('supabase/migrations/20260918132000_paypal_webhook_inbox.sql'));
assert.equal(manifest.paypalAdminReviewSourceSha256,migrationSha('supabase/migrations/20260918133000_paypal_admin_reviews.sql'));
assert.equal(manifest.profileEditUploadSourceSha256,migrationSha('supabase/migrations/20260918150000_profile_edit_staged_uploads.sql'));
assert.equal(manifest.accountDeletionFulfillmentSourceSha256,migrationSha('supabase/migrations/20260918170000_account_deletion_fulfillment.sql'));
assert.equal(manifest.accountDeletionPromotionSourceSha256,migrationSha('supabase/migrations/20260918172000_billing_promo_codes.sql'));
assert.equal(manifest.accountDeletionPromotionCompatibilitySourceSha256,migrationSha('supabase/migrations/20260918172500_account_deletion_promo_compatibility.sql'));
assert.equal(manifest.memberMessagingSourceSha256,migrationSha('supabase/migrations/20260918180000_member_messaging.sql'));
assert.equal(manifest.memberMessagingAccountDeletionSourceSha256,migrationSha('supabase/migrations/20260918181000_member_messaging_account_deletion.sql'));
assert.deepEqual(manifest.profileEditUploadFunctionSignatures,[
  'public.cleanup_staged_instrument_edit_uploads(uuid,text,uuid,text[],text[])',
  'public.consume_staged_instrument_edit_upload()',
  'public.register_staged_instrument_edit_upload(uuid,text,uuid,text,text)'
]);
const {PGlite}=createRequire(path.join(repo,'package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
const db=new PGlite();await installRepositorySchema(db,repo,overlay?'20260917190000':undefined);
if(overlay)for(const file of fs.readdirSync(path.join(source,'supabase/migrations')).filter(file=>file.endsWith('.sql')&&file>='20260917190000').sort())await db.exec(fs.readFileSync(path.join(source,'supabase/migrations',file),'utf8').replaceAll('\r\n','\n'));await db.exec("insert into storage.buckets(id,name,public)values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id)do update set public=false;");
const ready=async()=> (await db.query('select public.qrguitar_release_readiness() result')).rows[0].result;
let passed=0;async function test(name,fn){await db.exec('begin');try{await fn();console.log('PASS '+name);passed++;}finally{await db.exec('rollback');}}
function assertShape(result){assert.deepEqual(Object.keys(result).sort(),['checks','ready','releaseVersion']);assert.equal(result.releaseVersion,'2026-09-17.11');assert.equal(typeof result.ready,'boolean');assert.deepEqual(result.checks.map(c=>c.name),manifest.checks);assert.equal(new Set(result.checks.map(c=>c.name)).size,manifest.checks.length);for(const check of result.checks){assert.deepEqual(Object.keys(check).sort(),['name','ok']);assert.equal(typeof check.ok,'boolean');}}
async function expectFalse(name){const result=await ready();assertShape(result);assert.equal(result.ready,false);assert.equal(result.checks.find(c=>c.name===name)?.ok,false);}
await test('complete schema returns exact version and all14 checks true',async()=>{const result=await ready();assertShape(result);assert.equal(result.ready,true,JSON.stringify(result));assert.equal(result.checks.length,14);assert.ok(result.checks.every(c=>c.ok));});
await test('anonymous and authenticated callers cannot execute the readiness routine',async()=>{for(const role of['anon','authenticated']){await db.exec('savepoint deny');try{await db.exec('set role '+role);await assert.rejects(ready,e=>e.code==='42501');}finally{await db.exec('rollback to savepoint deny');}}});
await test('service-role execution succeeds inside an explicitly read-only transaction',async()=>{await db.exec('set transaction read only;set role service_role;');const result=await ready();assert.equal(result.ready,true);});
await test('missing required data RPC fails readiness',async()=>{await db.exec('drop function public.update_instrument_controls(uuid,text,text,jsonb,boolean);');await expectFalse('required_functions');});
await test('old backing create function gaining a service grant fails readiness',async()=>{await db.exec('grant execute on function public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text) to service_role;');await expectFalse('blocked_function_grants');});
await test('old two-argument transfer function gaining a service grant fails readiness',async()=>{await db.exec('grant execute on function public.complete_ownership_transfer(uuid,uuid) to service_role;');await expectFalse('blocked_function_grants');});
for(const role of['public','anon','authenticated'])await test(role+' data RPC EXECUTE drift fails readiness',async()=>{await db.exec('grant execute on function public.update_instrument_controls(uuid,text,text,jsonb,boolean) to '+role);await expectFalse('function_security');});
await test('changed backing create implementation fails its fixed fingerprint',async()=>{const source=(await db.query("select pg_get_functiondef('public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)'::regprocedure) definition")).rows[0].definition;assert.ok(source.includes('AS $function$'));await db.exec(source.replace('AS $function$','AS $function$\n-- unexpected implementation drift'));await expectFalse('function_security');});
for(const role of['public','anon','authenticated'])await test(role+' table SELECT grant drift fails readiness',async()=>{await db.exec('grant select on public.profiles to '+role);await expectFalse('private_table_grants');});
await test('restored private per-column SELECT grant fails readiness',async()=>{await db.exec('grant select(display_name) on public.profiles to authenticated;');await expectFalse('private_table_grants');});
await test('disabled private table RLS fails readiness',async()=>{await db.exec('alter table public.guitars disable row level security;');await expectFalse('private_tables');});
await test('missing restrictive app policy fails readiness',async()=>{await db.exec('drop policy qrguitar_server_api_only on public.profiles;');await expectFalse('server_only_policies');});
await test('permissive policy with the same name cannot pass the restrictive boundary check',async()=>{await db.exec('drop policy qrguitar_server_api_only on public.profiles;create policy qrguitar_server_api_only on public.profiles as permissive for all to anon,authenticated using(false)with check(false);');await expectFalse('server_only_policies');});
await test('missing required private bucket fails readiness',async()=>{await db.exec("delete from storage.buckets where id='service-evidence';");await expectFalse('private_storage_buckets');});
await test('public or unknown bucket privacy state fails readiness',async()=>{for(const value of['true','null']){await db.exec('update storage.buckets set public='+value+" where id='instrument-documents'");await expectFalse('private_storage_buckets');}});
await test('storage boundary missing a protected bucket fails readiness',async()=>{await db.exec("drop policy qrguitar_server_owned_files on storage.objects;create policy qrguitar_server_owned_files on storage.objects as restrictive for all to anon,authenticated using(bucket_id not in ('instrument-media','instrument-documents'))with check(bucket_id not in ('instrument-media','instrument-documents'));");await expectFalse('private_storage_policy');});
await test('disabled Storage RLS fails readiness',async()=>{await db.exec('alter table storage.objects disable row level security;');await expectFalse('private_storage_policy');});
await test('missing receipt uniqueness fails readiness',async()=>{await db.exec('alter table instrument_create_receipts drop constraint instrument_create_receipts_owner_id_upload_id_key;');await expectFalse('receipt_constraints');});
await test('disabled editor version trigger fails readiness',async()=>{await db.exec('alter table public.site_content disable trigger site_content_editor_version;');await expectFalse('editor_versioning');});
await test('disabled provenance protection trigger fails readiness',async()=>{await db.exec('alter table public.guitar_timeline_events disable trigger protect_service_provider_provenance_trigger;');await expectFalse('schema_columns');});
await test('wrong trigger function under the expected name fails readiness',async()=>{await db.exec('drop trigger protect_system_timeline_event_trigger on guitar_timeline_events;create trigger protect_system_timeline_event_trigger before update or delete on guitar_timeline_events for each row execute function protect_service_provider_provenance();');await expectFalse('schema_columns');});
await test('public schema CREATE capability fails readiness',async()=>{await db.exec('grant create on schema public to authenticated;');await expectFalse('public_schema_create');});
await test('readiness routine itself losing read-only STABLE contract fails',async()=>{await db.exec('alter function public.qrguitar_release_readiness() volatile;');await expectFalse('self_security');});
await test('readiness routine exposed to clients reports self-security drift',async()=>{await db.exec('grant execute on function public.qrguitar_release_readiness() to anon;');await expectFalse('self_security');});
await test('readiness response contains no customer content or identifiers',async()=>{await db.exec("insert into auth.users(id,email)values('10000000-0000-4000-8000-000000000009','private-sentinel@example.test');insert into profiles(id,display_name)values('10000000-0000-4000-8000-000000000009','PRIVATE_SENTINEL_NAME');");const before=(await db.query('select to_jsonb(p) value from profiles p')).rows;const result=await ready();assertShape(result);assert.equal(JSON.stringify(result).includes('SENTINEL'),false);assert.equal(JSON.stringify(result).includes('example.test'),false);assert.equal(JSON.stringify(result).includes('10000000-'),false);assert.deepEqual((await db.query('select to_jsonb(p) value from profiles p')).rows,before);});
await test('legacy claim approval grant cannot bypass current ownership guards',async()=>{await db.exec('grant execute on function public.approve_ownership_claim(uuid,uuid,text) to service_role;');await expectFalse('blocked_function_grants');});
await test('missing guarded claim approval blocks deployment',async()=>{await db.exec('drop function public.approve_ownership_claim(uuid,uuid,text,boolean);');await expectFalse('required_functions');});
await test('legacy account save grant cannot bypass version checks',async()=>{await db.exec('grant execute on function public.save_account_settings(uuid,text,jsonb) to service_role;');await expectFalse('blocked_function_grants');});
await test('missing account version column blocks deployment',async()=>{await db.exec('alter table public.profiles drop column account_settings_version;');await expectFalse('schema_columns');});
for(const signature of ['public.save_account_settings(uuid,text,jsonb,bigint)','public.save_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)','public.commit_service_evidence(uuid,uuid,boolean,text,jsonb)'])await test('restored serialization_failure conflict blocks deployment: '+signature,async()=>{const source=(await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;assert.ok(source.includes("errcode = 'PT409'"));assert.ok(!source.includes("errcode = '40001'"));await db.exec(source.replace("errcode = 'PT409'","errcode = '40001'"));await expectFalse('function_security');});

for(const table of manifest.rpcOnlyTables){
 await test(table+' cannot acquire direct service SELECT access',async()=>{await db.exec('grant select on public.'+table+' to service_role');await expectFalse('private_table_grants');});
 await test(table+' cannot acquire column-only service access',async()=>{const column=manifest.columns.find(c=>c.table===table).name;await db.exec('grant select('+column+') on public.'+table+' to service_role');await expectFalse('private_table_grants');});
 await test(table+' must retain RLS',async()=>{await db.exec('alter table public.'+table+' disable row level security');await expectFalse('private_tables');});
 await test(table+' must retain its restrictive policy',async()=>{await db.exec('drop policy qrguitar_billing_server_only on public.'+table);await expectFalse('server_only_policies');});
}
for(const role of ['public','anon','authenticated'])await test(role+' cannot acquire billing ledger table privilege',async()=>{await db.exec('grant select on billing_credit_grants to '+role);await expectFalse('private_table_grants');});
const billingFunctions=manifest.fingerprints.filter(f=>/^public\.(?:_?billing_|create_instrument_profile(?:_credited)?\()/.test(f.signature));
for(const item of billingFunctions)await test('billing function ACL drift fails closed: '+item.signature,async()=>{await db.exec('grant execute on function '+item.signature+' to '+(manifest.blockedFunctions.includes(item.signature)?'service_role':'authenticated'));await expectFalse(manifest.blockedFunctions.includes(item.signature)?'blocked_function_grants':'function_security');});
await test('missing billing catalog cannot claim launch readiness',async()=>{await db.exec('drop function billing_catalog(text)');await expectFalse('required_functions');});
await test('private billing helper implementation drift fails its fingerprint',async()=>{const value=(await db.query("select pg_get_functiondef('public._billing_consume_profile_credit(uuid,text,uuid,text)'::regprocedure) definition")).rows[0].definition;assert.ok(value.includes("errcode='QG008'"));await db.exec(value.replace("errcode='QG008'","errcode='PT409'"));await expectFalse('function_security');});
for(const [table,name]of manifest.provenanceTriggers.filter(([table])=>table.startsWith('billing_')))await test('disabled '+table+' append-only/identity trigger fails readiness',async()=>{await db.exec('alter table '+table+' disable trigger '+name);await expectFalse('schema_columns');});
await test('weakened positive-only debit constraint fails exact credits=1 contract',async()=>{await db.exec('alter table billing_credit_consumptions drop constraint billing_credit_consumptions_credits_check;alter table billing_credit_consumptions add constraint billing_credit_consumptions_credits_check check(credits>0)');await expectFalse('receipt_constraints');});
await test('ledger ownership foreign key cannot degrade to order-only linkage',async()=>{const item=manifest.billingConstraints.find(c=>c.table==='billing_credit_grants'&&c.type==='f');assert.ok(item);await db.exec('alter table billing_credit_grants drop constraint '+item.name+';alter table billing_credit_grants add constraint '+item.name+' foreign key(order_id) references billing_orders(id)');await expectFalse('receipt_constraints');});
await test('missing unique provider event receipt prevents readiness',async()=>{await db.exec('alter table billing_receipts drop constraint billing_receipts_pkey cascade');await expectFalse('receipt_constraints');});
await test('nonunique pending-order index cannot masquerade under required name',async()=>{await db.exec("drop index billing_one_unresolved_checkout;create index billing_one_unresolved_checkout on billing_orders(owner_id,environment) where status in ('reserved','open')");await expectFalse('receipt_constraints');});
await test('partial uniqueness must cover both reserved and open checkout states',async()=>{await db.exec("drop index billing_one_unresolved_checkout;create unique index billing_one_unresolved_checkout on billing_orders(owner_id,environment) where status='open'");await expectFalse('receipt_constraints');});
await test('unvalidated ledger check constraint cannot pass by identical expression',async()=>{const item=manifest.billingConstraints.find(c=>c.table==='billing_credit_consumptions'&&c.name==='billing_credit_consumptions_credits_check');await db.exec('alter table billing_credit_consumptions drop constraint '+item.name+';alter table billing_credit_consumptions add constraint '+item.name+' '+item.definition+' not valid');await expectFalse('receipt_constraints');});
await test('wrong debit default fails required schema contract',async()=>{await db.exec('alter table billing_credit_consumptions alter column credits set default 2');await expectFalse('schema_columns');});
await test('TEST-configured empty sandbox intentionally cannot pass production readiness',async()=>{await db.exec("update billing_instance_config set create_environment='test' where singleton");await expectFalse('receipt_constraints');});
await test('missing singleton database environment cannot pass production readiness',async()=>{await db.exec('alter table billing_instance_config disable trigger billing_instance_boundary;delete from billing_instance_config;alter table billing_instance_config enable trigger billing_instance_boundary');await expectFalse('receipt_constraints');});
await test('billing snapshots never appear in readiness response',async()=>{await db.exec("insert into billing_orders(owner_id,environment,request_key,offer,last_error)values('10000000-0000-4000-8000-000000000009','live','10000000-0000-4000-8000-000000000008','{\"privateSentinel\":\"BILLING_SENTINEL\"}','PRIVATE_ERROR_SENTINEL')");const result=await ready();assertShape(result);assert.equal(result.ready,true);assert.equal(JSON.stringify(result).includes('SENTINEL'),false);});

await test('PG17 relation nullability uses attnotnull without requiring PG18-only constraint rows',async()=>{
 assert.equal(manifest.billingConstraints.some(c=>c.type==='n'),false);
 const actual=(await db.query("select t.relname as table,a.attname as name,a.attnotnull as not_null from pg_attribute a join pg_class t on t.oid=a.attrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and a.attnum>0 and not a.attisdropped order by t.relname,a.attname",[manifest.rpcOnlyTables])).rows;
 const expected=manifest.columns.filter(c=>manifest.rpcOnlyTables.includes(c.table)).map(({table,name,not_null})=>({table,name,not_null})).sort((a,b)=>(a.table+'.'+a.name).localeCompare(b.table+'.'+b.name));
 assert.deepEqual(actual,expected,'Every billing column retains exact pg_attribute nullability coverage');
 assert.equal((await ready()).ready,true);
 const fields=[['billing_instance_config','create_environment'],['billing_offers','amount'],['billing_customers','created_at'],['billing_orders','offer'],['billing_receipts','receipt'],['billing_credit_grants','credits'],['billing_credit_consumptions','credits'],['billing_credit_holds','reason'],['billing_review_decisions','reason']];
 for(const [table,column]of fields){
  assert.equal(expected.find(c=>c.table===table&&c.name===column)?.not_null,true);
  await db.exec('savepoint nullability');
  try{await db.exec('alter table '+table+' alter column '+column+' drop not null');await expectFalse('schema_columns');}
  finally{await db.exec('rollback to savepoint nullability;release savepoint nullability');}
  assert.equal((await ready()).ready,true,table+' readiness is restored only after NOT NULL is restored');
 }
});

await test('unreviewed direct payment RPC overload cannot bypass the approved protocol',async()=>{
  await db.exec("create function public.billing_direct_verify_order(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;");await expectFalse('function_security');
});
await test('global direct receipt uniqueness remains required after receiver config rotation',async()=>{
  const constraint=manifest.billingConstraints.find(c=>c.table==='billing_direct_payments'&&c.definition==='UNIQUE (environment, provider, normalized_reference)');assert.ok(constraint);
  await db.exec('alter table billing_direct_payments drop constraint '+constraint.name);await expectFalse('receipt_constraints');
});
await test('one payment claim per order remains a required database constraint',async()=>{
  const constraint=manifest.billingConstraints.find(c=>c.table==='billing_direct_claims'&&c.definition==='UNIQUE (order_id)');assert.ok(constraint);
  await db.exec('alter table billing_direct_claims drop constraint '+constraint.name);await expectFalse('receipt_constraints');
});
await test('unreviewed PayPal settlement RPC overload cannot bypass exact capture checks',async()=>{
  await db.exec("create function public.billing_paypal_apply_capture(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;");await expectFalse('function_security');
});
await test('unreviewed private PayPal helper overload cannot bypass the approved protocol',async()=>{
  await db.exec("create function public._billing_paypal_webhook_headers(text) returns void language plpgsql as $$begin null;end$$;");await expectFalse('function_security');
});
await test('durable recovery cannot ship without its service-only claim-due RPC',async()=>{
  const signature=manifest.paypalBillingFunctionSignatures.find(item=>item.startsWith('public.billing_paypal_webhook_claim_due('));assert.ok(signature);
  await db.exec('drop function '+signature);await expectFalse('required_functions');
});
await test('checkout cannot ship without the scheduler-readiness gate',async()=>{
  const signature=manifest.paypalBillingFunctionSignatures.find(item=>item.startsWith('public.billing_paypal_webhook_scheduler_ready('));assert.ok(signature);
  await db.exec('drop function '+signature);await expectFalse('required_functions');
});
await test('scheduler heartbeat identity remains exact',async()=>{
  const constraint=manifest.billingConstraints.find(item=>item.table==='billing_paypal_webhook_heartbeats'&&item.type==='p');assert.ok(constraint);
  await db.exec('alter table billing_paypal_webhook_heartbeats drop constraint '+constraint.name);
  await expectFalse('receipt_constraints');
});
await test('automatic/manual provider receipt identity remains globally unique',async()=>{
  await db.exec('alter table billing_provider_references drop constraint billing_provider_references_pkey');await expectFalse('receipt_constraints');
});
await test('PayPal order identity cannot be bound to two local purchases',async()=>{
  const constraint=manifest.billingConstraints.find(c=>c.table==='billing_paypal_bindings'&&c.definition==='UNIQUE (environment, paypal_order_id)');assert.ok(constraint);
  await db.exec('alter table billing_paypal_bindings drop constraint '+constraint.name);await expectFalse('receipt_constraints');
});
await test('durable webhook scheduling index must remain nonunique',async()=>{
  const index=manifest.billingIndexes.find(item=>item.name==='billing_paypal_webhook_due');assert.equal(index?.unique,false);
  await db.exec('drop index billing_paypal_webhook_due;'+index.definition.replace('CREATE INDEX','CREATE UNIQUE INDEX'));
  await expectFalse('receipt_constraints');
});
await test('webhook delivery state constraint remains exact',async()=>{
  const constraint=manifest.billingConstraints.find(item=>item.table==='billing_paypal_webhook_deliveries'&&item.name.endsWith('_state_check'));assert.ok(constraint);
  await db.exec('alter table billing_paypal_webhook_deliveries drop constraint '+constraint.name);
  await expectFalse('receipt_constraints');
});
const profileEditServiceFunctions=manifest.profileEditUploadFunctionSignatures.filter(signature=>manifest.serviceFunctions.includes(signature));
const profileEditBlockedFunctions=manifest.profileEditUploadFunctionSignatures.filter(signature=>manifest.blockedFunctions.includes(signature));
assert.equal(profileEditServiceFunctions.length,2);
assert.deepEqual(profileEditBlockedFunctions,['public.consume_staged_instrument_edit_upload()']);
for(const signature of profileEditServiceFunctions)await test('missing Profile edit service RPC fails readiness: '+signature,async()=>{
  await db.exec('drop function '+signature);await expectFalse('required_functions');
});
await test('missing trigger-only Profile edit consumer fails readiness',async()=>{
  await db.exec('drop function public.consume_staged_instrument_edit_upload() cascade');await expectFalse('required_functions');
});
for(const signature of profileEditServiceFunctions)for(const role of['public','anon','authenticated'])await test(role+' cannot execute Profile edit RPC: '+signature,async()=>{
  await db.exec('grant execute on function '+signature+' to '+role);await expectFalse('function_security');
});
for(const signature of profileEditServiceFunctions)await test('missing service grant fails Profile edit readiness: '+signature,async()=>{
  await db.exec('revoke execute on function '+signature+' from service_role');await expectFalse('function_security');
});
for(const role of['public','anon','authenticated','service_role'])await test(role+' cannot directly execute trigger-only Profile edit consumer',async()=>{
  await db.exec('grant execute on function public.consume_staged_instrument_edit_upload() to '+role);await expectFalse('blocked_function_grants');
});
for(const name of['register_staged_instrument_edit_upload','cleanup_staged_instrument_edit_uploads','consume_staged_instrument_edit_upload'])await test('unreviewed Profile edit upload overload cannot bypass '+name,async()=>{
  await db.exec("create function public."+name+"(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;");await expectFalse('function_security');
});
for(const signature of manifest.profileEditUploadFunctionSignatures)await test('unreviewed role cannot execute Profile edit function: '+signature,async()=>{
  await db.exec('create role unexpected_profile_editor;grant execute on function '+signature+' to unexpected_profile_editor');await expectFalse('function_security');
});
await test('Profile edit upload functions cannot be owned by an API role',async()=>{
  await db.exec('alter function public.register_staged_instrument_edit_upload(uuid,text,uuid,text,text) owner to service_role');await expectFalse('function_security');
});
for(const signature of manifest.profileEditUploadFunctionSignatures)await test('Profile edit upload implementation drift fails its fixed fingerprint: '+signature,async()=>{
  const source=(await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
  assert.ok(source.includes('AS $function$'));
  await db.exec(source.replace('AS $function$','AS $function$\n-- unexpected Profile edit implementation drift'));
  await expectFalse('function_security');
});
for(const signature of manifest.profileEditUploadFunctionSignatures)await test('Profile edit upload search-path drift fails: '+signature,async()=>{
  await db.exec('alter function '+signature+' set search_path=public');await expectFalse('function_security');
});
for(const signature of manifest.profileEditUploadFunctionSignatures)await test('Profile edit upload SECURITY INVOKER drift fails: '+signature,async()=>{
  await db.exec('alter function '+signature+' security invoker');await expectFalse('function_security');
});
for(const signature of manifest.profileEditUploadFunctionSignatures)await test('Profile edit upload volatility drift fails: '+signature,async()=>{
  await db.exec('alter function '+signature+' stable');await expectFalse('function_security');
});
for(const [table,name]of manifest.provenanceTriggers.filter(([,name])=>name.startsWith('consume_staged_instrument_edit_')))await test('disabled '+table+' Profile edit consumption trigger fails readiness',async()=>{
  await db.exec('alter table '+table+' disable trigger '+name);await expectFalse('schema_columns');
});
for(const [table,name]of manifest.provenanceTriggers.filter(([,name])=>name.startsWith('consume_staged_instrument_edit_')))await test('missing '+table+' Profile edit consumption trigger fails readiness',async()=>{
  await db.exec('drop trigger '+name+' on '+table);await expectFalse('schema_columns');
});
for(const [table,name]of manifest.provenanceTriggers.filter(([,name])=>name.startsWith('consume_staged_instrument_edit_')))await test('wrong '+table+' Profile edit consumption trigger fails readiness',async()=>{
  await db.exec('drop trigger '+name+' on '+table+';create trigger '+name+' before insert on '+table+' for each row execute function public.create_profile_timeline_event()');await expectFalse('schema_columns');
});
assert.deepEqual([...manifest.intakeTables].sort(),[
  'account_deletion_actor_revisions','account_deletion_billing_subjects','account_deletion_custody_evidence_reviews',
  'account_deletion_custody_release_receipts','account_deletion_fulfillment_receipts','account_deletion_fulfillments',
  'account_deletion_identity_inventory','account_deletion_profile_custody','account_deletion_profile_review_attestations',
  'account_deletion_profile_review_scopes','account_deletion_request_receipts','account_deletion_requests',
  'account_deletion_retention_attestations','account_deletion_service_subjects','account_deletion_storage_content_reviews',
  'account_deletion_storage_relocations'
]);
assert.equal(manifest.intakeFunctionSignatures.length,89);
await test('missing deletion fulfillment RPC blocks release',async()=>{
  await db.exec('drop function public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[])');await expectFalse('required_functions');
});
await test('private deletion helper cannot acquire service execution',async()=>{
  await db.exec('grant execute on function public._account_deletion_write_fence() to service_role');await expectFalse('blocked_function_grants');
});
await test('fulfillment tombstones cannot acquire direct service reads',async()=>{
  await db.exec('grant select on public.account_deletion_fulfillments to service_role');await expectFalse('private_table_grants');
});
await test('request actor nullability required by Auth erasure is pinned',async()=>{
  await db.exec('alter table public.account_deletion_requests alter column actor_id set not null');await expectFalse('schema_columns');
});
await test('disabled post-deletion UUID write fence blocks release',async()=>{
  await db.exec('alter table public.billing_orders disable trigger account_deletion_fence_billing_orders');await expectFalse('schema_columns');
});
await test('missing irreversible actor fingerprint uniqueness blocks release',async()=>{
  const item=manifest.intakeConstraints.find(c=>c.table==='account_deletion_fulfillments'&&c.definition==='UNIQUE (actor_fingerprint)');assert.ok(item);
  await db.exec('alter table public.account_deletion_fulfillments drop constraint '+item.name);await expectFalse('receipt_constraints');
});
await test('unreviewed deletion fulfillment overload cannot bypass reviewed protocol',async()=>{
  await db.exec("create function public.prepare_account_deletion_fulfillment(uuid) returns jsonb language sql as $$select '{}'::jsonb$$");await expectFalse('function_security');
});
console.log('Completed '+passed+' actual PostgreSQL readiness tests.');await db.close();
