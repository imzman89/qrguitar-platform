// Additive .11: preserve the complete .10 contract and bind the durable
// account-deletion fulfillment state machine, private custody, and write fences.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { installRepositorySchema } from "./security/postgres-fixture.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const normalize = value => value.replaceAll("\r\n", "\n");
const sha = value => createHash("sha256").update(normalize(value)).digest("hex");
const read = relative => normalize(fs.readFileSync(path.join(repo, relative), "utf8"));
const previousPath = "supabase/migrations/20260918160000_release_readiness.sql";
const fulfillmentPath = "supabase/migrations/20260918170000_account_deletion_fulfillment.sql";
const outputPath = "supabase/migrations/20260918171000_release_readiness.sql";
const previous = read(previousPath);
assert.equal(sha(previous), "ebb74350ee5d842d7c1aa6f0278b935a963af258190ab1bd07a7f9612fcfe88a", "Historical .10 changed; review before generation.");
const embedded = previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded, "Historical .10 manifest is missing.");
const manifest = JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion, "2026-09-17.10");
const historical = structuredClone(manifest);
const fulfillmentSource = read(fulfillmentPath);
assert.equal(sha(fulfillmentSource), "5cd700b7d03aec84f111b597b141a8236757d8c216376ea10ddcdf679e9c2f05", "Fulfillment migration changed; review before repinning.");

const tableNames = [
  "account_deletion_requests",
  "account_deletion_request_receipts",
  "account_deletion_actor_revisions",
  "account_deletion_fulfillments",
  "account_deletion_fulfillment_receipts",
  "account_deletion_profile_custody"
];
const serviceNames = new Set([
  "cancel_account_deletion_request",
  "complete_account_deletion_fulfillment",
  "prepare_account_deletion_fulfillment",
  "read_account_deletion_fulfillment",
  "read_account_deletion_queue",
  "read_account_deletion_requests",
  "submit_account_deletion_request"
]);
const db = new PGlite();

try {
  await installRepositorySchema(db, repo, "20260918170000");
  await db.exec(fulfillmentSource);

  const functions = (await db.query(`
    select 'public.'||p.oid::regprocedure::text signature,p.proname,p.prosecdef,p.provolatile,p.proconfig,
      pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,
      encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash,
      pg_get_userbyid(p.proowner) owner,
      has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
      array(select coalesce(pg_get_userbyid(a.grantee),'PUBLIC')
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.privilege_type='EXECUTE' and a.grantee<>p.proowner
        order by coalesce(pg_get_userbyid(a.grantee),'PUBLIC')) execute_grantees
    from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname like '%account_deletion%'
    order by p.proname,p.oid::regprocedure::text
  `)).rows;
  assert.equal(functions.length, 21, "Expected the complete reviewed account-deletion function surface.");
  for (const item of functions) {
    assert.ok(!["anon", "authenticated", "service_role"].includes(item.owner), item.signature + " has an API-role owner.");
    assert.equal(item.anon_execute, false, item.signature + " cannot be executable by anon.");
    assert.equal(item.authenticated_execute, false, item.signature + " cannot be executable by authenticated.");
    assert.equal(item.public_execute, false, item.signature + " cannot be executable by PUBLIC.");
    assert.equal(item.service_execute, serviceNames.has(item.proname), item.signature + " has the wrong service-role ACL.");
    assert.deepEqual(item.execute_grantees, serviceNames.has(item.proname) ? ["service_role"] : [], item.signature + " has an unreviewed direct grantee.");
  }
  const currentSignatures = new Set(functions.map(item => item.signature));
  const replacedSignatures = new Set([...historical.intakeFunctionSignatures, ...currentSignatures]);
  const allowed = functions.filter(item => serviceNames.has(item.proname)).map(item => item.signature);
  const blocked = functions.filter(item => !serviceNames.has(item.proname)).map(item => item.signature);
  assert.equal(allowed.length, 7);
  assert.equal(blocked.length, 14);
  manifest.releaseVersion = "2026-09-17.11";
  manifest.serviceFunctions = [...historical.serviceFunctions.filter(signature => !replacedSignatures.has(signature)), ...allowed];
  manifest.blockedFunctions = [...historical.blockedFunctions.filter(signature => !replacedSignatures.has(signature)), ...blocked];
  manifest.fingerprints = [
    ...historical.fingerprints.filter(item => !replacedSignatures.has(item.signature)),
    ...functions.map(item => ({
      signature: item.signature,
      source_hash: item.source_hash,
      arguments: item.arguments,
      result: item.result,
      definer: item.prosecdef,
      volatility: item.provolatile,
      settings: item.proconfig
    }))
  ];
  manifest.intakeTables = tableNames;
  manifest.intakeFunctionSignatures = functions.map(item => item.signature);
  manifest.accountDeletionFulfillmentSourceSha256 = sha(fulfillmentSource);

  const columns = (await db.query(`
    select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `, [tableNames])).rows;
  assert.equal(columns.length, 39);
  const tableSet = new Set(tableNames);
  manifest.columns = [...historical.columns.filter(item => !tableSet.has(item.table)), ...columns];
  manifest.intakeDefaults = (await db.query(`
    select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `, [tableNames])).rows;
  manifest.intakeConstraints = (await db.query(`
    select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text as type
    from pg_constraint c join pg_class t on t.oid=c.conrelid
    where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n'
    order by t.relname,c.conname
  `, [tableNames])).rows;
  manifest.intakeIndexes = (await db.query(`
    select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as unique
    from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid
    where t.relnamespace='public'::regnamespace and t.relname=any($1)
    order by t.relname,c.relname
  `, [tableNames])).rows;
  manifest.intakePolicies = (await db.query(`
    select c.relname as table,p.polname as name
    from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1)
      and not p.polpermissive and p.polcmd='*' and p.polroles=array[0::oid]
      and pg_get_expr(p.polqual,p.polrelid)='false' and pg_get_expr(p.polwithcheck,p.polrelid)='false'
    order by c.relname,p.polname
  `, [tableNames])).rows;
  assert.equal(manifest.intakeDefaults.length, 39);
  assert.equal(manifest.intakeConstraints.length, 31);
  assert.equal(manifest.intakeIndexes.length, 17);
  assert.equal(manifest.intakePolicies.length, 6);

  const triggers = (await db.query(`
    select case when n.nspname='public' then c.relname else n.nspname||'.'||c.relname end as table,
      t.tgname as name,pg_get_triggerdef(t.oid) definition
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth') and t.tgname like 'account_deletion_%' and not t.tgisinternal
    order by 1,t.tgname
  `)).rows;
  assert.equal(triggers.length, 44, "Every account-deletion guard, custody, and write-fence trigger must be pinned.");
  manifest.provenanceTriggers = [
    ...historical.provenanceTriggers.filter(([, name]) => !name.startsWith("account_deletion_")),
    ...triggers.map(item => [item.table, item.name, item.definition])
  ];

  const previousHeader = "-- Release 2026-09-17.10: all prior contracts plus direct Profile edit upload consumption.";
  const currentHeader = "-- Release 2026-09-17.11: all prior contracts plus durable account-deletion fulfillment and private Profile custody.";
  assert.equal(previous.split(previousHeader).length, 2, "Historical release header changed; review before generation.");
  let generated = previous
    .replace(embedded[0], () => "$manifest$" + JSON.stringify(manifest) + "$manifest$")
    .replace(previousHeader, currentHeader)
    .replaceAll("2026-09-17.10", "2026-09-17.11");

  const publicOnlyTriggerLookup = "where tgrelid=to_regclass('public.'||(item->>0)) and tgname=item->>1";
  const schemaAwareTriggerLookup = "where tgrelid=to_regclass(case when strpos(item->>0,'.')>0 then item->>0 else 'public.'||(item->>0) end) and tgname=item->>1";
  assert.equal(generated.split(publicOnlyTriggerLookup).length, 2, "Historical trigger verifier changed; review before generation.");
  generated = generated.replace(publicOnlyTriggerLookup, schemaAwareTriggerLookup);

  await db.exec(generated);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false;begin read only;set local role service_role");
  const ready = (await db.query("select qrguitar_release_readiness() value")).rows[0].value;
  await db.exec("rollback");
  assert.equal(ready.ready, true, JSON.stringify(ready));
  assert.equal(ready.releaseVersion, "2026-09-17.11");
  assert.equal(ready.checks.length, 14);
  assert.ok(ready.checks.every(check => check.ok));

  const files = [
    [outputPath, generated],
    ["apps/web/scripts/release-readiness-manifest.json", JSON.stringify(manifest, null, 2) + "\n"]
  ];
  for (const [relative, content] of files) {
    const target = path.join(repo, relative);
    if (process.argv.includes("--write")) fs.writeFileSync(target, content);
    else assert.equal(normalize(fs.readFileSync(target, "utf8")), content, "Generated artifact drift: " + relative);
    console.log(sha(content) + "  " + relative);
  }
  console.log(`Readiness .11 binds ${functions.length} account-deletion functions, ${tableNames.length} private protocol tables, and ${triggers.length} guard triggers; all ${manifest.checks.length} checks pass.`);
} finally {
  await db.close();
}
