import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(path.join(here, "../../../.."));
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const baselineRoot = path.resolve(option("--baseline-root") || process.env.QRGUITAR_READINESS_BASELINE_ROOT || repo);
const require = createRequire(path.join(repo, "apps/web/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs")));
const promoSource = fs.readFileSync(path.join(repo, "supabase/migrations/20260918172000_billing_promo_codes.sql"), "utf8");
const compatibilitySource = fs.readFileSync(path.join(repo, "supabase/migrations/20260918172500_account_deletion_promo_compatibility.sql"), "utf8");
const db = new PGlite();

const ACTOR = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const ADMIN = "30000000-0000-4000-8000-000000000003";
const ACTOR_EMAIL = "former.admin@example.test";
let passed = 0, savepoint = 0;

async function fail(work, code) {
  const point = "expected_failure_" + ++savepoint;
  await db.exec("savepoint " + point);
  try { await assert.rejects(work, error => error?.code === code, `Expected PostgreSQL error ${code}`); }
  finally { await db.exec(`rollback to savepoint ${point}; release savepoint ${point}`); }
}
async function check(name, work) {
  await db.exec("begin");
  try { await work(); passed += 1; console.log("PASS " + name); }
  finally { await db.exec("rollback"); }
}
async function seed({ actorRole = "owner" } = {}) {
  await db.query("insert into auth.users(id,email) values($1,$4),($2,'other@example.test'),($3,'admin@example.test')", [ACTOR, OTHER, ADMIN, ACTOR_EMAIL]);
  await db.query("insert into profiles(id,display_name,role,purchased_code_count,remaining_code_count) values($1,'Former Admin',$4,0,0),($2,'Other Person','owner',0,0),($3,'Admin','admin',0,0)", [ACTOR, OTHER, ADMIN, actorRole]);
}
async function request() {
  const revision = (await db.query("select coalesce((select revision from account_deletion_actor_revisions where actor_id=$1),0)::text value", [ACTOR])).rows[0].value;
  return (await db.query("select public.submit_account_deletion_request($1,$2,$3) result", [ACTOR, randomUUID(), revision])).rows[0].result;
}
async function prepare(requestId) {
  return (await db.query("select public.prepare_account_deletion_fulfillment($1,false,$2,$3,'{}'::text[]) result", [ADMIN, requestId, randomUUID()])).rows[0].result;
}
async function attestReviews(requestId, snapshot) {
  for (const review of snapshot.profileReviews || []) if (!review.attested) {
    await db.query("select public.attest_account_deletion_profile_review($1,false,$2,$3,$4,$5,true)",
      [ADMIN, requestId, randomUUID(), review.guitarId, review.contentFingerprint]);
  }
  for (const review of snapshot.retentionReviews || []) if (review.required && !review.attested) {
    const decision = review.domain === "billing" ? "lawful_financial_retention_reviewed" : "service_history_privacy_reviewed";
    await db.query("select public.attest_account_deletion_retention_review($1,false,$2,$3,$4,$5,$6,true)",
      [ADMIN, requestId, randomUUID(), review.domain, review.contentFingerprint, decision]);
  }
}
async function expireStorageQuiescence(requestId) {
  await db.query("select set_config('qrguitar.account_deletion_request',$1,true)", [requestId]);
  await db.query("update account_deletion_fulfillments set storage_quiesce_until=clock_timestamp()-interval '1 second' where request_id=$1 and state='quiescing_storage'", [requestId]);
  await db.exec("select set_config('qrguitar.account_deletion_request','',true)");
}
async function insertPromotion({ creator = ACTOR, code = "FORMERADMIN", identifying = true } = {}) {
  const name = identifying ? `Offer by ${ACTOR}` : "Retained offer";
  const description = identifying ? `${ACTOR_EMAIL} configured this offer.` : "Non-identifying promotion details.";
  return (await db.query(`insert into billing_promo_codes(environment,code,name,description,status,audience,discount_type,
      discount_value,minimum_amount,eligible_offer_keys,max_redemptions,max_redemptions_per_owner,created_by,updated_by)
    values('test',$1,$2,$3,'active','everyone','fixed_total',30,0,array['profile_1'],10,2,$4,$4) returning *`,
    [code, name, description, creator])).rows[0];
}

try {
  await installRepositorySchema(db, baselineRoot, "20260918172000");
  await db.exec(promoSource);
  const protectedSources = (await db.query(`select proname,prosrc from pg_proc where pronamespace='public'::regnamespace
    and proname=any(array['_account_deletion_blockers','_account_deletion_retained_pii','prepare_account_deletion_fulfillment'])
    order by proname`)).rows;
  await db.exec(compatibilitySource);
  const hasDurableFulfillment = (await db.query(
    "select to_regclass('public.account_deletion_fulfillments') is not null value"
  )).rows[0].value;
  const expectedFence = hasDurableFulfillment
    ? "_account_deletion_write_fence"
    : "_account_deletion_promo_write_fence";

  await check("the additive migration pins narrow helpers, nullable operator identity, and all four privacy fences", async () => {
    const afterSources = (await db.query(`select proname,prosrc from pg_proc where pronamespace='public'::regnamespace
      and proname=any(array['_account_deletion_blockers','_account_deletion_retained_pii','prepare_account_deletion_fulfillment'])
      order by proname`)).rows;
    assert.deepEqual(afterSources, protectedSources, "Compatibility must not replace the fulfillment scanner, postcondition, or prepare procedure.");

    const columns = (await db.query(`select attname,attnotnull from pg_attribute
      where attrelid='public.billing_promo_admin_events'::regclass and attname=any(array['operator_id','operator_email'])
      order by attname`)).rows;
    assert.deepEqual(columns, [
      { attname: "operator_email", attnotnull: false },
      { attname: "operator_id", attnotnull: false }
    ]);

    const triggers = (await db.query(`select c.relname table_name,t.tgname name,pg_get_triggerdef(t.oid) definition
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where not t.tgisinternal and t.tgname=any($1::text[]) order by t.tgname`, [[
        "account_deletion_fence_billing_order_promotions",
        "account_deletion_fence_billing_promo_codes",
        "account_deletion_fence_billing_promo_admin_events",
        "account_deletion_fence_billing_promo_quote_limits",
        "account_deletion_promo_profile_redaction",
        "billing_promo_admin_events_immutable"
      ]])).rows;
    assert.equal(triggers.length, 6);
    assert.deepEqual(triggers.filter(item => item.name.startsWith("account_deletion_fence_")).map(item => item.table_name).sort(),
      ["billing_order_promotions", "billing_promo_admin_events", "billing_promo_codes", "billing_promo_quote_limits"]);
    for (const trigger of triggers.filter(item => item.name.startsWith("account_deletion_fence_")))
      assert.match(trigger.definition, new RegExp(expectedFence));
    assert.match(triggers.find(item => item.name === "billing_promo_admin_events_immutable").definition, /_billing_promo_admin_event_guard/);

    const helpers = (await db.query(`select oid::regprocedure::text signature from pg_proc
      where pronamespace='public'::regnamespace and proname=any($1::text[]) order by proname`, [[
        "_account_deletion_promo_billing_graph", "_account_deletion_promo_migrate_billing_subject",
        "_account_deletion_promo_blockers", "_account_deletion_promo_redact_json",
        "_account_deletion_promo_retained_pii", "_account_deletion_promo_scrub_profile",
        "_account_deletion_promo_text_has_identity", "_account_deletion_promo_write_fence",
        "_billing_promo_admin_event_guard"
      ]])).rows;
    assert.equal(helpers.length, 9);
    for (const helper of helpers) for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, helper.signature])).rows[0].allowed, false);
  });

  if (!hasDurableFulfillment) {
    await check("the partial-schema fallback freezes promotion actor links during an active deletion request", async () => {
      await seed();
      await db.query("insert into billing_promo_quote_limits(owner_id,environment) values($1,'test')", [ACTOR]);
      const requestId = (await request()).request.requestId;

      await fail(() => db.query(
        "update billing_promo_quote_limits set owner_id=$2 where owner_id=$1 and environment='test'",
        [ACTOR, OTHER]
      ), "PD423");
      await fail(() => db.query(
        "insert into billing_promo_quote_limits(owner_id,environment) values($1,'live')",
        [ACTOR]
      ), "PD423");

      await db.query("select set_config('qrguitar.account_deletion_request',$1,true)", [requestId]);
      await db.query(
        "update billing_promo_quote_limits set owner_id=$2 where owner_id=$1 and environment='test'",
        [ACTOR, OTHER]
      );
      await db.exec("select set_config('qrguitar.account_deletion_request','',true)");
      assert.equal((await db.query(
        "select count(*)::int n from billing_promo_quote_limits where owner_id=$1",
        [ACTOR]
      )).rows[0].n, 0);
    });
  } else {
  await check("a demoted former administrator is scrubbed without deleting factual promotion or audit history", async () => {
    await seed({ actorRole: "admin" });
    const promotion = await insertPromotion();
    const firstEvent = randomUUID(), secondEvent = randomUUID();
    await db.query(`insert into billing_promo_admin_events(id,promotion_id,environment,operator_id,operator_email,action,reason,before_value,after_value)
      values($1,$2,'test',$3,$4,'create',$5,null,$6)`, [firstEvent, promotion.id, ACTOR, ACTOR_EMAIL,
      `${ACTOR_EMAIL} approved the initial promotion.`, {
        id: promotion.id, code: promotion.code, revision: 1, discountValue: 30,
        status: "active", nested: { actor: ACTOR, email: ACTOR_EMAIL, factual: "preserve me" }
      }]);
    await db.query(`insert into billing_promo_admin_events(id,promotion_id,environment,operator_id,operator_email,action,reason,before_value,after_value)
      values($1,$2,'test',$3,'other@example.test','update',$4,$5,$6)`, [secondEvent, promotion.id, OTHER,
      `Reviewed account ${ACTOR} without changing pricing.`, { revision: 1, discountValue: 30 },
      { revision: 1, discountValue: 30, note: ACTOR_EMAIL }]);
    await db.query("insert into billing_promo_quote_limits(owner_id,environment) values($1,'test')", [ACTOR]);
    await fail(() => db.query("update billing_promo_admin_events set reason='Rewritten immutable audit reason.' where id=$1", [firstEvent]), "42501");

    await db.query("update profiles set role='owner' where id=$1", [ACTOR]);
    const requestId = (await request()).request.requestId;
    const frozen = await prepare(requestId);
    assert.equal(frozen.fulfillment.state, "quiescing_storage");
    assert.deepEqual(frozen.fulfillment.blockers, ["storage_quiescence_required"]);

    const savedPromotion = (await db.query("select * from billing_promo_codes where id=$1", [promotion.id])).rows[0];
    assert.equal(savedPromotion.created_by, null); assert.equal(savedPromotion.updated_by, null);
    assert.equal(savedPromotion.name, "Redacted promotion"); assert.equal(savedPromotion.description, "");
    assert.equal(savedPromotion.code, "FORMERADMIN"); assert.equal(savedPromotion.discount_value, 30);
    assert.equal(savedPromotion.status, "active"); assert.equal(savedPromotion.revision, 1);

    const events = (await db.query("select * from billing_promo_admin_events where promotion_id=$1 order by id", [promotion.id])).rows;
    assert.equal(events.length, 2);
    const operated = events.find(item => item.id === firstEvent), referenced = events.find(item => item.id === secondEvent);
    assert.equal(operated.operator_id, null); assert.equal(operated.operator_email, null);
    assert.equal(operated.reason, "Personal information removed after an account deletion request.");
    assert.equal(operated.after_value.revision, 1); assert.equal(operated.after_value.discountValue, 30);
    assert.equal(operated.after_value.status, "active"); assert.equal(operated.after_value.nested.actor, "[personal information removed]");
    assert.equal(operated.after_value.nested.email, "[personal information removed]"); assert.equal(operated.after_value.nested.factual, "preserve me");
    assert.equal(referenced.operator_id, OTHER); assert.equal(referenced.operator_email, "other@example.test");
    assert.equal(referenced.reason, "Personal information removed after an account deletion request.");
    assert.equal(referenced.before_value.discountValue, 30); assert.equal(referenced.after_value.note, "[personal information removed]");
    assert.equal((await db.query("select count(*)::int n from billing_promo_quote_limits where owner_id=$1", [ACTOR])).rows[0].n, 0);
    assert.deepEqual((await db.query("select public._account_deletion_promo_blockers($1) value", [ACTOR])).rows[0].value, []);
    assert.equal((await db.query("select public._account_deletion_promo_retained_pii($1,$2) value", [ACTOR, ACTOR_EMAIL])).rows[0].value, false);

    await fail(() => db.query(`insert into billing_promo_codes(environment,code,name,description,status,audience,discount_type,
      discount_value,minimum_amount,eligible_offer_keys,created_by,updated_by)
      values('test','LATEACTOR','Late actor','Late actor','active','everyone','fixed_total',30,0,array['profile_1'],$1,$1)`, [ACTOR]), "PD423");
    await fail(() => db.query(`insert into billing_promo_admin_events(promotion_id,environment,operator_id,operator_email,action,reason,before_value,after_value)
      values($1,'test',$2,$3,'create','Late identifying audit write.',null,'{}')`, [promotion.id, ACTOR, ACTOR_EMAIL]), "PD423");
    await fail(() => db.query("insert into billing_promo_quote_limits(owner_id,environment) values($1,'live')", [ACTOR]), "PD423");
    await fail(() => db.query("update billing_promo_admin_events set reason='Still immutable after redaction.' where id=$1", [firstEvent]), "42501");

    await expireStorageQuiescence(requestId);
    const ready = await prepare(requestId);
    assert.equal(ready.fulfillment.state, "ready_for_auth_deletion");
    const retainedText = (await db.query(`select concat_ws('|',
      coalesce((select string_agg(to_jsonb(p)::text,'|') from billing_promo_codes p),''),
      coalesce((select string_agg(to_jsonb(e)::text,'|') from billing_promo_admin_events e),'')) value`)).rows[0].value.toLowerCase();
    assert.equal(retainedText.includes(ACTOR.toLowerCase()), false);
    assert.equal(retainedText.includes(ACTOR_EMAIL), false);

    await db.query("delete from auth.users where id=$1", [ACTOR]);
    const completed = (await db.query("select public.complete_account_deletion_fulfillment($1,false,$2,$3) result", [ADMIN, requestId, randomUUID()])).rows[0].result;
    assert.equal(completed.fulfillment.state, "completed");
    assert.equal((await db.query("select count(*)::int n from billing_promo_codes where id=$1", [promotion.id])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from billing_promo_admin_events where promotion_id=$1", [promotion.id])).rows[0].n, 2);
  });

  await check("a promoted settled order migrates to the reviewed billing subject and can complete deletion", async () => {
    await seed();
    const promotion = await insertPromotion({ creator: ADMIN, code: "PAIDHISTORY", identifying: false });
    const orderId = randomUUID();
    await db.query("insert into billing_orders(id,owner_id,environment,request_key,offer,status) values($1,$2,'test',$3,$4,'fulfilled')",
      [orderId, ACTOR, randomUUID(), { key: "profile_1", version: 1, currency: "usd", amount: 30, credits: 1 }]);
    await db.query(`insert into billing_order_promotions(order_id,promotion_id,owner_id,environment,code,name,promotion_revision,
      discount_type,discount_value,classification,original_amount,discount_amount,final_amount)
      values($1,$2,$3,'test',$4,$5,1,'fixed_total',30,'promotion',1200,1170,30)`,
      [orderId, promotion.id, ACTOR, promotion.code, promotion.name]);

    assert.deepEqual((await db.query("select public._account_deletion_promo_blockers($1) value", [ACTOR])).rows[0].value, []);
    const requestId = (await request()).request.requestId;
    const blocked = await prepare(requestId);
    assert.equal(blocked.fulfillment.state, "blocked");
    assert.deepEqual(blocked.fulfillment.blockers, ["billing_retention_review_required"]);
    assert.equal((await db.query("select account_status from profiles where id=$1", [ACTOR])).rows[0].account_status, "active");
    assert.equal((await db.query("select owner_id from billing_order_promotions where order_id=$1", [orderId])).rows[0].owner_id, ACTOR);
    await attestReviews(requestId, blocked);
    const frozen = await prepare(requestId); assert.equal(frozen.fulfillment.state, "quiescing_storage");
    await expireStorageQuiescence(requestId);
    const ready = await prepare(requestId); assert.equal(ready.fulfillment.state, "ready_for_auth_deletion");
    const promotionRow = (await db.query("select owner_id,subject_id from billing_order_promotions where order_id=$1", [orderId])).rows[0];
    assert.equal(promotionRow.owner_id, promotionRow.subject_id); assert.notEqual(promotionRow.owner_id, ACTOR);
    assert.equal((await db.query("select public._account_deletion_promo_retained_pii($1,$2) value", [ACTOR, ACTOR_EMAIL])).rows[0].value, false);
    await db.query("delete from auth.users where id=$1", [ACTOR]);
    const completed = (await db.query("select public.complete_account_deletion_fulfillment($1,false,$2,$3) result", [ADMIN, requestId, randomUUID()])).rows[0].result;
    assert.equal(completed.fulfillment.state, "completed");
  });
  }
} finally {
  await db.close();
}

console.log(`Promotion account-deletion compatibility: ${passed} checks passed.`);
