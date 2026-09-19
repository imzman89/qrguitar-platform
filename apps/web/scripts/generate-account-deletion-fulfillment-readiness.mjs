// Additive .13: preserve the complete .12 contract and bind the 25-free entitlement plus durable
// member-message pagination, account-deletion fulfillment, private custody, and write fences.
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
const outputPath = "supabase/migrations/20260919102000_release_readiness.sql";
const previous = read(previousPath);
assert.equal(sha(previous), "ebb74350ee5d842d7c1aa6f0278b935a963af258190ab1bd07a7f9612fcfe88a", "Historical .10 changed; review before generation.");
const embedded = previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded, "Historical .10 manifest is missing.");
const manifest = JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion, "2026-09-17.10");
const historical = structuredClone(manifest);
const fulfillmentSource = read(fulfillmentPath);
assert.equal(sha(fulfillmentSource), "1cfc789fb6e5b09de94de7271215fb6539aea356361c4f5478049015ceabcc5e", "Fulfillment migration changed; review before repinning.");
const promotionSource = read("supabase/migrations/20260918172000_billing_promo_codes.sql");
const promotionDeletionSource = read("supabase/migrations/20260918172500_account_deletion_promo_compatibility.sql");
const messagingSource = read("supabase/migrations/20260918180000_member_messaging.sql");
const messagingDeletionSource = read("supabase/migrations/20260918181000_member_messaging_account_deletion.sql");
const durableMessagingSource = read("supabase/migrations/20260918182000_durable_member_message_history.sql");
const twentyFiveFreeSource = read("supabase/migrations/20260919100000_twenty_five_free_profiles.sql");
const messagingPaginationSource = read("supabase/migrations/20260919101000_member_messaging_pagination.sql");
assert.equal(sha(promotionSource), "a7cf0c00615feeeb76d3533250c127f16eb8f1cd19349e639276d98433ea98a5", "Promotion migration changed; review before repinning.");
assert.equal(sha(promotionDeletionSource), "e8504d19dfd6484f0b5cdf59fdfb057471b0f58c527ee80d60a324d0757d26f2", "Promotion deletion migration changed; review before repinning.");
assert.equal(sha(messagingSource), "fc2cd013dd29f632c48a05f2fc62afc86c1f513ebe787405f95b66b1b34b1816", "Messaging migration changed; review before repinning.");
assert.equal(sha(messagingDeletionSource), "7d4f6a8acbbe1a65ebbd9ee64999b1171027d682c0ca7c5ff4ba263301e1d400", "Messaging deletion migration changed; review before repinning.");
assert.equal(sha(durableMessagingSource), "a4c3d97445e160759fef2b7072184fbb2a8ca9b93d0433beee7a3840460a37c5", "Durable messaging migration changed; review before repinning.");
assert.equal(sha(twentyFiveFreeSource), "d121f64709aee3a018c5bcbfc4d138fb337aad4d2a066d241876d405fcfd3c90", "25-free migration changed; review before repinning.");
assert.equal(sha(messagingPaginationSource), "045a145bc33b092be1a8335f9ecea6b06e48a6f57650cbae2a8ca095e449681f", "Messaging pagination migration changed; review before repinning.");

const tableNames = [
  "account_deletion_actor_revisions",
  "account_deletion_billing_subjects",
  "account_deletion_custody_evidence_reviews",
  "account_deletion_custody_release_receipts",
  "account_deletion_fulfillment_receipts",
  "account_deletion_fulfillments",
  "account_deletion_identity_inventory",
  "account_deletion_profile_custody",
  "account_deletion_profile_review_attestations",
  "account_deletion_profile_review_scopes",
  "account_deletion_request_receipts",
  "account_deletion_requests",
  "account_deletion_retention_attestations",
  "account_deletion_service_subjects",
  "account_deletion_storage_content_reviews",
  "account_deletion_storage_relocations"
];const serviceNames = new Set([
  "attest_account_deletion_custody_evidence",
  "attest_account_deletion_profile_review",
  "attest_account_deletion_retention_review",
  "attest_account_deletion_storage_content",
  "authorize_account_deletion_storage_relocation",
  "cancel_account_deletion_request",
  "complete_member_messaging_account_deletion",
  "complete_account_deletion_fulfillment",
  "complete_account_deletion_storage_relocation",
  "finalize_account_deletion_storage_relocation",
  "inspect_account_deletion_review_page",
  "prepare_account_deletion_fulfillment",
  "prepare_member_messaging_account_deletion",
  "read_account_deletion_custody_evidence_inventory",
  "read_account_deletion_custody_evidence_source",
  "read_account_deletion_fulfillment",
  "read_account_deletion_queue",
  "read_account_deletion_requests",
  "read_account_deletion_review_snapshot",
  "read_account_deletion_storage_review_source",
  "redact_account_deletion_profile_review",
  "release_account_deletion_profile_custody",
  "submit_account_deletion_request"
]);
const db = new PGlite();

try {
  await installRepositorySchema(db, repo, "20260918170000");
  await db.exec(fulfillmentSource);
  await db.exec(promotionSource);
  await db.exec(promotionDeletionSource);
  await db.exec(messagingSource);
  await db.exec(messagingDeletionSource);
  await db.exec(durableMessagingSource);
  await db.exec(twentyFiveFreeSource);
  await db.exec(messagingPaginationSource);

  const allFunctions = (await db.query(`
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
    where p.pronamespace='public'::regnamespace
    order by p.proname,p.oid::regprocedure::text
  `)).rows;
  const historicalFingerprintSignatures = new Set(historical.fingerprints.map(item => item.signature));
  const functions = allFunctions.filter(item => item.proname.includes("account_deletion"));
  const fingerprintFunctions = allFunctions.filter(item => historicalFingerprintSignatures.has(item.signature) || item.proname.includes("account_deletion") || item.proname === "billing_paypal_reserve_promoted_order");
  const fingerprintSignatures = new Set(fingerprintFunctions.map(item => item.signature));
  assert.equal(functions.length, 90, "Expected the complete reviewed account-deletion function surface.");
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
  assert.equal(allowed.length, 23);
  assert.equal(blocked.length, 67);
  const promotedCheckoutFunctions = allFunctions.filter(item => item.proname === "billing_paypal_reserve_promoted_order");
  assert.equal(promotedCheckoutFunctions.length, 1, "Expected the reviewed promoted PayPal reservation RPC.");
  for (const item of promotedCheckoutFunctions) {
    assert.equal(item.service_execute, true, item.signature + " must remain service-only.");
    assert.equal(item.anon_execute, false, item.signature + " cannot be executable by anon.");
    assert.equal(item.authenticated_execute, false, item.signature + " cannot be executable by authenticated.");
    assert.equal(item.public_execute, false, item.signature + " cannot be executable by PUBLIC.");
    assert.deepEqual(item.execute_grantees, ["service_role"], item.signature + " has an unreviewed direct grantee.");
  }
  manifest.releaseVersion = "2026-09-17.13";
  manifest.serviceFunctions = [...historical.serviceFunctions.filter(signature => !replacedSignatures.has(signature)), ...allowed, ...promotedCheckoutFunctions.map(item => item.signature)];
  manifest.blockedFunctions = [...historical.blockedFunctions.filter(signature => !replacedSignatures.has(signature)), ...blocked];
  manifest.paypalBillingFunctionSignatures = [...historical.paypalBillingFunctionSignatures, ...promotedCheckoutFunctions.map(item => item.signature)];
  manifest.fingerprints = [
    ...historical.fingerprints.filter(item => !fingerprintSignatures.has(item.signature)),
    ...fingerprintFunctions.map(item => ({
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
  manifest.accountDeletionPromotionSourceSha256 = sha(promotionSource);
  manifest.accountDeletionPromotionCompatibilitySourceSha256 = sha(promotionDeletionSource);
  manifest.memberMessagingSourceSha256 = sha(messagingSource);
  manifest.memberMessagingAccountDeletionSourceSha256 = sha(messagingDeletionSource);
  manifest.memberMessagingDurableHistorySourceSha256 = sha(durableMessagingSource);
  manifest.twentyFiveFreeProfilesSourceSha256 = sha(twentyFiveFreeSource);
  manifest.memberMessagingPaginationSourceSha256 = sha(messagingPaginationSource);

  const columns = (await db.query(`
    select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `, [tableNames])).rows;
  assert.equal(columns.length, 139);
  const tableSet = new Set(tableNames);
  const manifestColumnTables = [...new Set([...historical.columns.map(item => item.table), ...tableNames])];
  manifest.columns = (await db.query(`
    select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `, [manifestColumnTables])).rows;
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
  assert.equal(manifest.intakeDefaults.length, 139);
  assert.equal(manifest.intakeConstraints.length, 125);
  assert.equal(manifest.intakeIndexes.length, 41);
  assert.equal(manifest.intakePolicies.length, 16);

  const refreshCatalog = async names => ({
    defaults: (await db.query(`
      select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression
      from pg_attribute a join pg_class c on c.oid=a.attrelid
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped
      order by c.relname,a.attnum
    `, [names])).rows,
    constraints: (await db.query(`
      select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text as type
      from pg_constraint c join pg_class t on t.oid=c.conrelid
      where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n'
      order by t.relname,c.conname
    `, [names])).rows,
    indexes: (await db.query(`
      select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as unique
      from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid
      where t.relnamespace='public'::regnamespace and t.relname=any($1)
      order by t.relname,c.relname
    `, [names])).rows
  });
  const billingCatalog = await refreshCatalog(manifest.rpcOnlyTables);
  manifest.billingDefaults = billingCatalog.defaults;
  manifest.billingConstraints = billingCatalog.constraints;
  manifest.billingIndexes = billingCatalog.indexes;
  manifest.memberMessagingPaginationIndexes = (await db.query(`
    select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as unique
    from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid
    where t.relnamespace='public'::regnamespace
      and c.relname=any(array['member_conversations_user_a_updated_page','member_conversations_user_b_updated_page'])
    order by c.relname
  `)).rows;
  assert.deepEqual(manifest.memberMessagingPaginationIndexes.map(item => [item.table,item.name,item.unique]), [
    ['member_conversations','member_conversations_user_a_updated_page',false],
    ['member_conversations','member_conversations_user_b_updated_page',false]
  ]);
  const evidenceCatalog = await refreshCatalog(manifest.serviceEvidenceTables);
  manifest.serviceEvidenceDefaults = evidenceCatalog.defaults;
  manifest.serviceEvidenceConstraints = evidenceCatalog.constraints;
  manifest.serviceEvidenceIndexes = evidenceCatalog.indexes;

  const triggers = (await db.query(`
    select case when n.nspname='public' then c.relname else n.nspname||'.'||c.relname end as table,
      t.tgname as name,pg_get_triggerdef(t.oid) definition
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth','storage') and t.tgname like 'account_deletion_%' and not t.tgisinternal
    order by 1,t.tgname
  `)).rows;
  assert.equal(triggers.length, 121, "Every account-deletion guard, custody, and write-fence trigger must be pinned.");
  manifest.provenanceTriggers = [
    ...historical.provenanceTriggers.filter(([, name]) => !name.startsWith("account_deletion_")),
    ...triggers.map(item => [item.table, item.name, item.definition])
  ];

  const previousHeader = "-- Release 2026-09-17.10: all prior contracts plus direct Profile edit upload consumption.";
  const currentHeader = "-- Release 2026-09-17.13: all prior contracts plus 25 free Profiles and stable member conversation pagination.";
  assert.equal(previous.split(previousHeader).length, 2, "Historical release header changed; review before generation.");
  let generated = previous
    .replace(embedded[0], () => "$manifest$" + JSON.stringify(manifest) + "$manifest$")
    .replace(previousHeader, currentHeader)
    .replaceAll("2026-09-17.10", "2026-09-17.13");

  const publicOnlyTriggerLookup = "where tgrelid=to_regclass('public.'||(item->>0)) and tgname=item->>1";
  const schemaAwareTriggerLookup = "where tgrelid=to_regclass(case when strpos(item->>0,'.')>0 then item->>0 else 'public.'||(item->>0) end) and tgname=item->>1";
  assert.equal(generated.split(publicOnlyTriggerLookup).length, 2, "Historical trigger verifier changed; review before generation.");
  generated = generated.replace(publicOnlyTriggerLookup, schemaAwareTriggerLookup);
  const billingIndexLoop = "jsonb_array_elements(manifest->'billingIndexes')";
  const completeIndexLoop = "jsonb_array_elements((manifest->'billingIndexes')||(manifest->'memberMessagingPaginationIndexes'))";
  assert.equal(generated.split(billingIndexLoop).length, 2, "Historical index verifier changed; review before generation.");
  generated = generated.replace(billingIndexLoop, completeIndexLoop);

  await db.exec(generated);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false;begin read only;set local role service_role");
  const ready = (await db.query("select qrguitar_release_readiness() value")).rows[0].value;
  await db.exec("rollback");
  if (!ready.ready) {
    const bySignature = new Map(allFunctions.map(item => [item.signature, item]));
    const fingerprintMismatches = manifest.fingerprints.filter(expected => {
      const actual = bySignature.get(expected.signature);
      return !actual || actual.source_hash !== expected.source_hash || actual.arguments !== expected.arguments || actual.result !== expected.result || actual.prosecdef !== expected.definer || actual.provolatile !== expected.volatility || JSON.stringify(actual.proconfig) !== JSON.stringify(expected.settings);
    }).map(item => item.signature);
    const groups = [
      ["serviceEvidence", manifest.serviceEvidenceFunctionSignatures, item => item.proname.includes("service_evidence_upload")],
      ["directBilling", manifest.directBillingFunctionSignatures, item => item.proname.startsWith("billing_direct_") || item.proname.startsWith("_billing_direct_")],
      ["paypalBilling", manifest.paypalBillingFunctionSignatures, item => item.proname.startsWith("billing_paypal_") || item.proname.startsWith("_billing_paypal_")],
      ["profileEdit", manifest.profileEditUploadFunctionSignatures, item => ["register_staged_instrument_edit_upload","cleanup_staged_instrument_edit_uploads","consume_staged_instrument_edit_upload"].includes(item.proname)]
    ];
    const unreviewed = Object.fromEntries(groups.map(([name, approved, predicate]) => [name, allFunctions.filter(predicate).map(item => item.signature).filter(signature => !approved.includes(signature))]));
    console.error(JSON.stringify({ fingerprintMismatches, unreviewed }, null, 2));
  }
  assert.equal(ready.ready, true, JSON.stringify(ready));
  assert.equal(ready.releaseVersion, "2026-09-17.13");
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
  console.log(`Readiness .13 binds ${functions.length} account-deletion functions, ${tableNames.length} private protocol tables, the 25-free allowance, and stable member-message pagination; all ${manifest.checks.length} checks pass.`);
} finally {
  await db.close();
}
