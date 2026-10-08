// Additive .9: preserve the pinned .8 contract and bind the durable PayPal
// webhook inbox, scheduler heartbeat, and administrator review surface.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const normalize=value=>value.replaceAll('\r\n','\n');
const sha=value=>createHash('sha256').update(normalize(value)).digest('hex');
const read=relative=>normalize(fs.readFileSync(path.join(repo,relative),'utf8'));
const previousPath='supabase/migrations/20260918131000_release_readiness.sql';
const webhookPath='supabase/migrations/20260918132000_paypal_webhook_inbox.sql';
const adminPath='supabase/migrations/20260918133000_paypal_admin_reviews.sql';
const outputPath='supabase/migrations/20260918134000_release_readiness.sql';
const previous=read(previousPath);
assert.equal(
  sha(previous),
  'c30913977dce1c0f3682ff20884ac9539029b634db93441ba4f7b46b51146f92',
  'Historical .8 changed; review before generation.'
);
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded,'Historical .8 manifest is missing.');
const manifest=JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion,'2026-09-17.8');
const historical=structuredClone(manifest);
const webhookSource=read(webhookPath);
const adminSource=read(adminPath);
const db=new PGlite();

try{
  // Load through .8, then apply the two sources explicitly so their exact
  // bytes are the inputs whose hashes are recorded in the generated contract.
  await installRepositorySchema(db,repo,'20260918132000');
  await db.exec(webhookSource);
  await db.exec(adminSource);

  const functions=(await db.query(`
    select 'public.'||oid::regprocedure::text signature,proname,prosecdef,provolatile,proconfig,
      pg_get_function_arguments(oid) arguments,pg_get_function_result(oid) result,
      encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash
    from pg_proc
    where pronamespace='public'::regnamespace
      and (proname like 'billing_paypal_%' or proname like '_billing_paypal_%')
    order by proname,oid::regprocedure::text
  `)).rows;
  assert.ok(functions.length>historical.paypalBillingFunctionSignatures.length,'Expected the inbox/admin migrations to add PayPal functions.');
  assert.ok(functions.some(item=>item.proname==='billing_paypal_webhook_claim_due'),'Durable recovery requires the service-only claim-due RPC.');
  assert.ok(functions.some(item=>item.proname==='billing_paypal_webhook_record_heartbeat'),'Scheduler activation requires the service-only heartbeat RPC.');
  assert.ok(functions.some(item=>item.proname==='billing_paypal_webhook_scheduler_ready'),'Checkout activation requires the scheduler-readiness gate.');
  const allowed=functions.filter(item=>item.proname.startsWith('billing_')).map(item=>item.signature);
  const blocked=functions.filter(item=>item.proname.startsWith('_billing_')).map(item=>item.signature);
  assert.equal(allowed.length+blocked.length,functions.length,'Every PayPal function must have an explicit ACL class.');
  const previousPayPal=new Set(historical.paypalBillingFunctionSignatures);
  manifest.releaseVersion='2026-09-17.9';
  manifest.serviceFunctions=[...historical.serviceFunctions.filter(signature=>!previousPayPal.has(signature)),...allowed];
  manifest.blockedFunctions=[...historical.blockedFunctions.filter(signature=>!previousPayPal.has(signature)),...blocked];
  manifest.fingerprints=[
    ...historical.fingerprints.filter(item=>!previousPayPal.has(item.signature)),
    ...functions.map(item=>({
      signature:item.signature,
      source_hash:item.source_hash,
      arguments:item.arguments,
      result:item.result,
      definer:item.prosecdef,
      volatility:item.provolatile,
      settings:item.proconfig
    }))
  ];
  manifest.paypalBillingFunctionSignatures=functions.map(item=>item.signature);
  manifest.paypalWebhookSourceSha256=sha(webhookSource);
  manifest.paypalAdminReviewSourceSha256=sha(adminSource);

  const requiredTables=[
    'billing_paypal_webhook_admin_actions',
    'billing_paypal_webhook_deliveries',
    'billing_paypal_webhook_heartbeats',
    'billing_paypal_webhook_outcomes',
    'billing_paypal_webhook_payloads'
  ].sort();
  const names=(await db.query(`
    select relname as name from pg_class
    where relnamespace='public'::regnamespace and relkind='r' and relname like 'billing_paypal_%'
    order by relname
  `)).rows.map(item=>item.name).filter(name=>!historical.rpcOnlyTables.includes(name));
  for(const table of requiredTables) assert.ok(names.includes(table),'Missing durable inbox table: '+table);
  manifest.rpcOnlyTables=[...historical.rpcOnlyTables,...names.filter(name=>!historical.rpcOnlyTables.includes(name))];
  const columns=(await db.query(`
    select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1)
      and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `,[names])).rows;
  manifest.columns=[...historical.columns,...columns];
  const defaults=(await db.query(`
    select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where c.relnamespace='public'::regnamespace and c.relname=any($1)
      and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `,[names])).rows;
  manifest.billingDefaults=[...historical.billingDefaults,...defaults];
  const constraints=(await db.query(`
    select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text type
    from pg_constraint c join pg_class t on t.oid=c.conrelid
    where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n'
    order by t.relname,c.conname
  `,[names])).rows;
  manifest.billingConstraints=[...historical.billingConstraints,...constraints];
  const indexes=(await db.query(`
    select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as "unique"
    from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid
    where t.relnamespace='public'::regnamespace and t.relname=any($1)
    order by t.relname,c.relname
  `,[names])).rows;
  manifest.billingIndexes=[
    ...historical.billingIndexes.map(item=>({...item,unique:item.unique??true})),
    ...indexes
  ];
  const triggers=(await db.query(`
    select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1) and not t.tgisinternal
    order by c.relname,t.tgname
  `,[names])).rows;
  assert.ok(triggers.some(item=>item.name==='billing_paypal_webhook_outcomes_immutable'));
  assert.ok(triggers.some(item=>item.name==='billing_paypal_webhook_admin_actions_immutable'));
  manifest.provenanceTriggers=[...historical.provenanceTriggers,...triggers.map(item=>[item.table,item.name,item.definition])];

  const policies=(await db.query(`
    select c.relname as table,p.polname as name
    from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1)
      and p.polname='qrguitar_billing_server_only' and not p.polpermissive and p.polcmd='*'
    order by c.relname
  `,[names])).rows;
  assert.deepEqual(policies,names.map(table=>({table,name:'qrguitar_billing_server_only'})),'Every inbox table needs the reviewed restrictive policy.');

  // .9 must add only PayPal functions and the durable inbox tables to the .8
  // contract. Every unrelated historical fingerprint remains byte-for-byte.
  for(const item of historical.fingerprints.filter(entry=>!previousPayPal.has(entry.signature))){
    assert.deepEqual(manifest.fingerprints.find(entry=>entry.signature===item.signature),item,'Unrelated fingerprint changed: '+item.signature);
  }
  assert.deepEqual(manifest.rpcOnlyTables.slice(0,historical.rpcOnlyTables.length),historical.rpcOnlyTables);

  const oldIndexCheck=`      and i.indrelid=to_regclass('public.'||(item->>'table')) and i.indisunique and i.indisvalid and i.indisready
      and pg_get_indexdef(i.indexrelid)=item->>'definition') then flags:=jsonb_set(flags,'{receipt_constraints}','false'); end if;`;
  const newIndexCheck=`      and i.indrelid=to_regclass('public.'||(item->>'table')) and to_jsonb(i.indisunique)=item->'unique'
      and i.indisvalid and i.indisready and pg_get_indexdef(i.indexrelid)=item->>'definition') then
      flags:=jsonb_set(flags,'{receipt_constraints}','false');
    end if;`;
  const previousHeader='-- Release 2026-09-17.8: all .4 contracts plus durable direct service-evidence uploads.';
  const currentHeader='-- Release 2026-09-17.9: all prior contracts plus the durable PayPal webhook and scheduler gate.';
  assert.equal(previous.split(previousHeader).length,2,'Historical release header changed; review before generation.');
  assert.equal(previous.split(oldIndexCheck).length,2,'Historical billing-index check changed; review before generation.');
  const generated=previous
    .replace(embedded[0],()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$')
    .replace(previousHeader,currentHeader)
    .replaceAll('2026-09-17.8','2026-09-17.9')
    .replace(oldIndexCheck,newIndexCheck);

  await db.exec(generated);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false;begin read only;set local role service_role");
  const ready=(await db.query('select qrguitar_release_readiness() value')).rows[0].value;
  await db.exec('rollback');
  assert.equal(ready.ready,true,JSON.stringify(ready));
  assert.equal(ready.releaseVersion,'2026-09-17.9');

  // The active release manifest belongs to the newest additive generator;
  // .9 remains a reproducible historical migration.
  const files=[[outputPath,generated]];
  for(const [relative,content] of files){
    const target=path.join(repo,relative);
    if(process.argv.includes('--write')) fs.writeFileSync(target,content);
    else assert.equal(normalize(fs.readFileSync(target,'utf8')),content,'Generated artifact drift: '+relative);
    console.log(sha(content)+'  '+relative);
  }
  console.log(`Readiness .9 binds ${functions.length} PayPal functions, ${names.length} durable inbox tables, ${indexes.length} indexes and ${triggers.length} table triggers; all ${manifest.checks.length} checks pass.`);
}finally{
  await db.close();
}
