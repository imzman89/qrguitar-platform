// Transactional promotion behavior. The database owns pricing, eligibility,
// usage accounting, immutable order snapshots, and the administrator audit.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installRepositorySchema } from "./security/postgres-fixture.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const db = new PGlite();
await installRepositorySchema(db, repo);

const ENVIRONMENT = "live";
const MERCHANT = "SYNTHETICMERCHANT";
const ADMIN_EMAIL = "admin@example.test";
const [admin, owner, owner2, owner3, inactiveAdmin] = Array.from({ length: 5 }, () => randomUUID());
await db.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [
  admin, ADMIN_EMAIL, owner, "owner@example.test", owner2, "owner2@example.test", owner3, "owner3@example.test", inactiveAdmin, "inactive@example.test"
]);
await db.query("insert into profiles(id,display_name,role,account_status) values($1,'Promo admin','admin','active'),($2,'Owner one','owner','active'),($3,'Owner two','owner','active'),($4,'Owner three','owner','active'),($5,'Inactive admin','admin','locked')", [admin, owner, owner2, owner3, inactiveAdmin]);

let passed = 0;
async function test(name, run) {
  await db.exec("begin");
  try { await run(); passed++; console.log(`PASS ${name}`); }
  finally { await db.exec("rollback"); }
}
async function rpc(name, args, role = "service_role") {
  await db.exec(`savepoint promo_rpc; set local role ${role}`);
  try {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(",");
    const result = (await db.query(`select public.${name}(${placeholders}) value`, args)).rows[0].value;
    await db.exec("reset role; release savepoint promo_rpc");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint promo_rpc; release savepoint promo_rpc");
    throw error;
  }
}
const reject = (operation, code) => assert.rejects(operation, error => error.code === code, `Expected SQLSTATE ${code}`);
async function rejectQuery(text, params, code) {
  await db.exec("savepoint rejected_sql");
  try {
    await db.query(text, params);
    await db.exec("release savepoint rejected_sql");
    assert.fail(`Expected SQLSTATE ${code}`);
  } catch (error) {
    await db.exec("rollback to savepoint rejected_sql; release savepoint rejected_sql");
    assert.equal(error.code, code);
  }
}
const providerId = () => randomUUID().replaceAll("-", "").toUpperCase();
const quote = (actor, pack, code, internal = false) => rpc("billing_promo_quote", [actor, ENVIRONMENT, pack, code, internal]);
const unavailable = async operation => {
  const result = await operation();
  assert.deepEqual(result, { available: false, rateLimited: false });
};
const reserve = (actor, requestKey, pack, promoQuote, code = promoQuote.promotion?.code || null, internal = false) => rpc("billing_paypal_reserve_promoted_order", [
  actor, ENVIRONMENT, requestKey, pack, MERCHANT, code,
  promoQuote.promotion?.id || null, promoQuote.promotion?.revision || null,
  promoQuote.promotion ? promoQuote.offer.amount : null, internal
]);
const bind = (actor, order, paypalOrderId = providerId()) => rpc("billing_paypal_bind_order", [actor, ENVIRONMENT, order.orderId, paypalOrderId, MERCHANT]);
const receipt = (order, captureId = providerId(), amount = order.offer.amount, status = "COMPLETED") => ({
  paypalOrderId: order.paypalOrderId, captureId, merchantId: MERCHANT,
  referenceId: order.orderId, customId: order.orderId, invoiceId: `QRG-${order.orderId}`,
  amount, currency: "USD", status
});
const capture = (order, incoming = receipt(order)) => rpc("billing_paypal_apply_capture", [ENVIRONMENT, order.orderId, incoming]);
const createPromotion = (values = {}) => rpc("billing_promo_admin_create", [
  values.operatorId || admin, values.operatorEmail || ADMIN_EMAIL, values.allowEnvironmentAdmin || false, ENVIRONMENT,
  values.code || `TEST_${providerId().slice(0, 8)}`, values.name || "Test promotion", values.description || "Promotion ledger acceptance fixture.",
  values.status || "active", values.audience || "everyone", values.discountType || "fixed_total", values.discountValue ?? 30,
  values.minimumAmount ?? 0, values.eligibleOfferKeys || ["profile_1", "profile_10", "profile_25"],
  values.startsAt ?? null, values.endsAt ?? null, values.maxRedemptions ?? null, values.maxRedemptionsPerOwner ?? null,
  values.reason || "Created by the promotion acceptance suite."
]);
const updatePromotion = (promotion, values = {}) => rpc("billing_promo_admin_update", [
  values.operatorId || admin, values.operatorEmail || ADMIN_EMAIL, values.allowEnvironmentAdmin || false, ENVIRONMENT,
  promotion.id, values.expectedRevision ?? promotion.revision, values.name || promotion.name,
  values.description ?? promotion.description, values.audience || promotion.audience,
  values.discountType || promotion.discountType, values.discountValue ?? promotion.discountValue,
  values.minimumAmount ?? promotion.minimumAmount, values.eligibleOfferKeys || promotion.eligibleOfferKeys,
  values.startsAt ?? promotion.startsAt, values.endsAt ?? promotion.endsAt,
  values.maxRedemptions ?? promotion.maxRedemptions, values.maxRedemptionsPerOwner ?? promotion.maxRedemptionsPerOwner,
  values.reason || "Updated by the promotion acceptance suite."
]);
const setPromotionStatus = (promotion, status, values = {}) => rpc("billing_promo_admin_set_status", [
  values.operatorId || admin, values.operatorEmail || ADMIN_EMAIL, values.allowEnvironmentAdmin || false,
  ENVIRONMENT, promotion.id, values.expectedRevision ?? promotion.revision, status,
  values.reason || `${status} action performed by the promotion acceptance suite.`
]);
const close = order => rpc("billing_paypal_close_order", [ENVIRONMENT, order.orderId, order.paypalOrderId, MERCHANT, "VOIDED"]);

try {
  await test("promotion tables, helpers, and public RPCs enforce the server-only boundary", async () => {
    const tables = ["billing_promo_codes", "billing_order_promotions", "billing_promo_admin_events", "billing_promo_quote_limits"];
    for (const table of tables) for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed", [role, table])).rows[0].allowed, false);
    const policies = (await db.query("select c.relname table_name,p.polpermissive,p.polcmd,pg_get_expr(p.polqual,p.polrelid) using_expression,pg_get_expr(p.polwithcheck,p.polrelid) check_expression from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname=any($1::text[]) order by c.relname", [tables])).rows;
    assert.equal(policies.length, 4);
    for (const policy of policies) assert.deepEqual([policy.polpermissive, policy.polcmd, policy.using_expression, policy.check_expression], [false, "*", "false", "false"]);
    const functions = (await db.query("select oid::regprocedure::text signature,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_promo_%' or proname like '_billing_promo_%' or proname='billing_paypal_reserve_promoted_order')")).rows;
    for (const fn of functions) for (const role of ["anon", "authenticated", "service_role"])
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, fn.signature])).rows[0].allowed,
        role === "service_role" && (fn.proname.startsWith("billing_promo_") || fn.proname === "billing_paypal_reserve_promoted_order"));
  });

  await test("GARYWON is an active internal code that prices every pack at exactly thirty cents", async () => {
    const seed = (await db.query("select * from billing_promo_codes where environment=$1 and code='GARYWON'", [ENVIRONMENT])).rows[0];
    assert.equal(seed.status, "active"); assert.equal(seed.audience, "admin"); assert.equal(seed.discount_type, "fixed_total"); assert.equal(seed.discount_value, 30);
    assert.deepEqual(seed.eligible_offer_keys, ["profile_1", "profile_10", "profile_25"]); assert.equal(seed.max_redemptions, 100); assert.equal(seed.max_redemptions_per_owner, 100);
    for (const [pack, listAmount, credits] of [["profile_1", 1200, 1], ["profile_10", 5000, 10], ["profile_25", 9900, 25]]) {
      const result = await quote(admin, pack, "  garywon  ");
      assert.deepEqual(result.offer, { key: pack, version: 1, currency: "usd", amount: 30, credits });
      assert.equal(result.promotion.code, "GARYWON"); assert.equal(result.promotion.originalAmount, listAmount);
      assert.equal(result.promotion.discountAmount, listAmount - 30); assert.equal(result.promotion.finalAmount, 30);
      assert.equal(result.promotion.classification, "internal_test");
    }
    await unavailable(() => quote(owner, "profile_1", "GARYWON"));
    assert.equal((await quote(owner, "profile_1", "GARYWON", true)).offer.amount, 30);
  });

  await test("GARYAPPLE is protected admin-only Apple Pay acceptance pricing at exactly one dollar", async () => {
    const seed = (await db.query("select * from billing_promo_codes where environment=$1 and code='GARYAPPLE'", [ENVIRONMENT])).rows[0];
    assert.equal(seed.status, "active"); assert.equal(seed.audience, "admin"); assert.equal(seed.discount_type, "fixed_total"); assert.equal(seed.discount_value, 100);
    assert.equal(seed.minimum_amount, 0); assert.deepEqual(seed.eligible_offer_keys, ["profile_1", "profile_10", "profile_25"]);
    for (const pack of ["profile_1", "profile_10", "profile_25"]) assert.equal((await quote(admin, pack, "GARYAPPLE")).offer.amount, 100);
    await unavailable(() => quote(owner, "profile_1", "GARYAPPLE"));
  });

  await test("the quoted revision and amount are atomic checkout preconditions", async () => {
    const promotion = await createPromotion({ code: "STALE30", discountValue: 30 });
    const stale = await quote(owner, "profile_1", "stale30");
    const changed = await updatePromotion(promotion, { discountValue: 40 });
    assert.equal(changed.revision, promotion.revision + 1);
    await reject(() => reserve(owner, randomUUID(), "profile_1", stale), "PT410");
    assert.equal((await db.query("select count(*)::int count from billing_orders where owner_id=$1", [owner])).rows[0].count, 0);
    const fresh = await quote(owner, "profile_1", "STALE30"); assert.equal(fresh.offer.amount, 40); assert.equal(fresh.promotion.revision, changed.revision);
    assert.equal((await reserve(owner, randomUUID(), "profile_1", fresh)).offer.amount, 40);
  });

  await test("a promoted order freezes its pricing snapshot and request replay cannot switch details", async () => {
    const originalQuote = await quote(admin, "profile_25", "GARYWON");
    const requestKey = randomUUID(), first = await reserve(admin, requestKey, "profile_25", originalQuote, "garywon");
    assert.equal(first.offer.amount, 30); assert.equal(first.promotion.code, "GARYWON"); assert.equal(first.promotion.originalAmount, 9900);
    assert.equal(first.promotion.classification, "internal_test");
    assert.deepEqual(await reserve(admin, requestKey, "profile_25", originalQuote), first);
    await reject(() => rpc("billing_paypal_reserve_promoted_order", [admin, ENVIRONMENT, requestKey, "profile_25", MERCHANT, null, null, null, null, false]), "PT409");
    await reject(() => rpc("billing_paypal_reserve_promoted_order", [admin, ENVIRONMENT, requestKey, "profile_10", MERCHANT, "GARYWON", originalQuote.promotion.id, originalQuote.promotion.revision, 30, false]), "PT409");
    const seed = (await rpc("billing_promo_admin_list", [admin, false, ENVIRONMENT])).promotions.find(value => value.code === "GARYWON");
    await updatePromotion(seed, { name: "Changed test name" });
    const stored = await rpc("billing_paypal_get_order", [admin, ENVIRONMENT, first.orderId]);
    assert.equal(stored.offer.amount, 30); assert.equal(stored.promotion.name, "Owner payment test"); assert.equal(stored.promotion.revision, originalQuote.promotion.revision);
  });

  await test("PayPal binding and capture require the promoted thirty-cent amount exactly", async () => {
    const order = await bind(admin, await reserve(admin, randomUUID(), "profile_10", await quote(admin, "profile_10", "GARYWON")));
    for (const amount of [29, 31, 1200, 5000]) await reject(() => capture(order, receipt(order, providerId(), amount)), "22023");
    assert.equal((await db.query("select count(*)::int count from billing_credit_grants where order_id=$1", [order.orderId])).rows[0].count, 0);
    const savedReceipt = receipt(order), fulfilled = await capture(order, savedReceipt);
    assert.equal(fulfilled.status, "fulfilled"); assert.equal(fulfilled.offer.amount, 30); assert.equal(fulfilled.granted, true);
    assert.equal((await rpc("billing_account_status", [admin, ENVIRONMENT])).paidGranted, 10);
    const replay = await capture(order, savedReceipt); assert.equal(replay.alreadyGranted, true);
  });

  await test("fixed totals, amount-off, percentages, minimums, and eligible packs remain server-calculated", async () => {
    const amount = await createPromotion({ code: "LESS200", discountType: "amount_off", discountValue: 200, eligibleOfferKeys: ["profile_1"] });
    const amountQuote = await quote(owner, "profile_1", amount.code);
    assert.equal(amountQuote.offer.amount, 1000); assert.equal(amountQuote.promotion.classification, "promotion");
    await unavailable(() => quote(owner, "profile_10", amount.code));
    const percent = await createPromotion({ code: "QUARTER", discountType: "percent_off", discountValue: 2500, minimumAmount: 1200, eligibleOfferKeys: ["profile_1", "profile_10"] });
    assert.equal((await quote(owner, "profile_1", percent.code)).offer.amount, 900);
    const floor = await createPromotion({ code: "THIRTYFLOOR", discountType: "amount_off", discountValue: 1000000, eligibleOfferKeys: ["profile_1"] });
    assert.equal((await quote(owner, "profile_1", floor.code)).offer.amount, 30);
    const minimum = await createPromotion({ code: "MINIMUM50", discountValue: 30, minimumAmount: 5000, eligibleOfferKeys: ["profile_1", "profile_10"] });
    await unavailable(() => quote(owner, "profile_1", minimum.code)); assert.equal((await quote(owner, "profile_10", minimum.code)).offer.amount, 30);
  });

  await test("pause, resume, archive, future start, and expiry govern both quote and reservation", async () => {
    let promotion = await createPromotion({ code: "LIFECYCLE", discountValue: 30 });
    const beforePause = await quote(owner, "profile_1", promotion.code);
    promotion = await setPromotionStatus(promotion, "paused"); await unavailable(() => quote(owner, "profile_1", promotion.code));
    await reject(() => reserve(owner, randomUUID(), "profile_1", beforePause), "PT410");
    promotion = await setPromotionStatus(promotion, "active"); assert.equal((await quote(owner, "profile_1", promotion.code)).offer.amount, 30);
    promotion = await setPromotionStatus(promotion, "archived"); await unavailable(() => quote(owner, "profile_1", promotion.code));
    await reject(() => updatePromotion(promotion, { name: "Cannot change" }), "PT409");
    await reject(() => setPromotionStatus(promotion, "active"), "22023");
    const future = await createPromotion({ code: "FUTURE30", startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    const ended = await createPromotion({ code: "ENDED30", startsAt: new Date(Date.now() - 172_800_000).toISOString(), endsAt: new Date(Date.now() - 86_400_000).toISOString() });
    await unavailable(() => quote(owner, "profile_1", future.code)); await unavailable(() => quote(owner, "profile_1", ended.code));
  });

  await test("per-owner and global limits count reserved and fulfilled orders while expired orders release capacity", async () => {
    const promotion = await createPromotion({ code: "LIMITED", maxRedemptions: 2, maxRedemptionsPerOwner: 1 });
    const first = await reserve(owner, randomUUID(), "profile_1", await quote(owner, "profile_1", promotion.code));
    await unavailable(() => quote(owner, "profile_10", promotion.code));
    const second = await bind(owner2, await reserve(owner2, randomUUID(), "profile_1", await quote(owner2, "profile_1", promotion.code)));
    await unavailable(() => quote(owner3, "profile_1", promotion.code));
    const expired = await close(second); assert.equal(expired.status, "expired");
    const third = await reserve(owner3, randomUUID(), "profile_1", await quote(owner3, "profile_1", promotion.code)); assert.equal(third.offer.amount, 30);
    assert.equal(first.status, "reserved");
  });

  await test("refund and dispute review never restores a fulfilled promotion use", async () => {
    const promotion = await createPromotion({ code: "ONEPAID", maxRedemptions: 1, maxRedemptionsPerOwner: 1 });
    const order = await bind(owner, await reserve(owner, randomUUID(), "profile_1", await quote(owner, "profile_1", promotion.code)));
    const incoming = receipt(order); await capture(order, incoming);
    await rpc("billing_paypal_record_review", [ENVIRONMENT, order.orderId, providerId(), "refund", incoming]);
    await unavailable(() => quote(owner2, "profile_1", promotion.code));
    const list = await rpc("billing_promo_admin_list", [admin, false, ENVIRONMENT]);
    const row = list.promotions.find(value => value.id === promotion.id);
    assert.equal(row.completedRedemptions, 1); assert.equal(row.releasedRedemptions, 0); assert.equal(row.adjustedRedemptions, 1); assert.equal(row.grossCapturedAmount, 30);
  });

  await test("administrator CRUD is revision-safe, audited, and reports redemption history", async () => {
    await reject(() => createPromotion({ operatorId: owner, code: "NOADMIN" }), "42501");
    await reject(() => createPromotion({ operatorId: inactiveAdmin, code: "LOCKEDADMIN" }), "42501");
    let promotion = await createPromotion({ code: "CRUD30", name: "CRUD fixture", maxRedemptions: 5, maxRedemptionsPerOwner: 2 });
    assert.equal(promotion.revision, 1); assert.equal(promotion.code, "CRUD30");
    const stale = promotion;
    promotion = await updatePromotion(promotion, { name: "CRUD fixture updated", discountType: "amount_off", discountValue: 300 });
    assert.equal(promotion.revision, 2); assert.equal(promotion.name, "CRUD fixture updated");
    await reject(() => updatePromotion(stale, { name: "Lost update" }), "PT409");
    const order = await reserve(owner, randomUUID(), "profile_1", await quote(owner, "profile_1", promotion.code));
    let list = await rpc("billing_promo_admin_list", [admin, false, ENVIRONMENT]);
    let listed = list.promotions.find(value => value.id === promotion.id); assert.equal(listed.reservedRedemptions, 1); assert.equal(listed.completedRedemptions, 0);
    const redemptions = await rpc("billing_promo_admin_redemptions", [admin, false, ENVIRONMENT, promotion.id]);
    assert.equal(redemptions.redemptions.length, 1); assert.equal(redemptions.redemptions[0].orderId, order.orderId); assert.equal(redemptions.redemptions[0].finalAmount, 900);
    promotion = await setPromotionStatus(promotion, "paused"); promotion = await setPromotionStatus(promotion, "active"); promotion = await setPromotionStatus(promotion, "archived");
    const events = (await db.query("select action,operator_email,before_value,after_value from billing_promo_admin_events where promotion_id=$1 order by created_at,id", [promotion.id])).rows;
    assert.deepEqual(events.map(event => event.action), ["create", "update", "pause", "resume", "archive"]);
    assert.ok(events.every(event => event.operator_email === ADMIN_EMAIL)); assert.equal(events[0].before_value, null); assert.equal(events.at(-1).after_value.status, "archived");
    const activity = await rpc("billing_promo_admin_redemptions", [admin, false, ENVIRONMENT, promotion.id]);
    assert.deepEqual(activity.changes.map(change => change.action), ["archive", "resume", "pause", "update", "create"]);
    assert.ok(activity.changes.every(change => change.operatorEmail === ADMIN_EMAIL && Number.isSafeInteger(change.revision)));
    list = await rpc("billing_promo_admin_list", [admin, false, ENVIRONMENT]); listed = list.promotions.find(value => value.id === promotion.id); assert.equal(listed.status, "archived");
  });

  await test("promotion identities, order snapshots, and admin events are immutable", async () => {
    const promotion = await createPromotion({ code: "IMMUTABLE" });
    const order = await reserve(owner, randomUUID(), "profile_1", await quote(owner, "profile_1", promotion.code));
    const eventId = (await db.query("select id from billing_promo_admin_events where promotion_id=$1", [promotion.id])).rows[0].id;
    await rejectQuery("update billing_promo_codes set code='REWRITTEN' where id=$1", [promotion.id], "42501");
    await rejectQuery("delete from billing_promo_codes where id=$1", [promotion.id], "42501");
    await rejectQuery("update billing_order_promotions set final_amount=31 where order_id=$1", [order.orderId], "42501");
    await rejectQuery("delete from billing_order_promotions where order_id=$1", [order.orderId], "42501");
    await rejectQuery("update billing_promo_admin_events set reason='Rewritten immutable audit reason.' where id=$1", [eventId], "42501");
    await rejectQuery("delete from billing_promo_admin_events where id=$1", [eventId], "42501");
  });

  await test("owner acceptance codes keep their purpose but allow descriptive edits and pause or resume", async () => {
    for (const [code, amount] of [["GARYWON", 30], ["GARYAPPLE", 100]]) {
      let promotion = (await rpc("billing_promo_admin_list", [admin, false, ENVIRONMENT])).promotions.find(value => value.code === code);
      promotion = await updatePromotion(promotion, { name: `${code} renamed`, description: "Updated internal acceptance description.", startsAt: new Date(Date.now() - 1000).toISOString(), maxRedemptions: 50, maxRedemptionsPerOwner: 25 });
      assert.equal(promotion.audience, "admin"); assert.equal(promotion.discountType, "fixed_total"); assert.equal(promotion.discountValue, amount); assert.equal(promotion.minimumAmount, 0);
      await reject(() => updatePromotion(promotion, { audience: "everyone" }), "PT409");
      await reject(() => updatePromotion(promotion, { discountValue: amount + 1 }), "PT409");
      await reject(() => updatePromotion(promotion, { eligibleOfferKeys: ["profile_1"] }), "PT409");
      await reject(() => setPromotionStatus(promotion, "archived"), "PT409");
      promotion = await setPromotionStatus(promotion, "paused");
      promotion = await setPromotionStatus(promotion, "active");
      assert.equal(promotion.status, "active");
    }
  });

  await test("unknown, malformed, private, inactive, and no-discount quote outcomes are indistinguishable", async () => {
    await unavailable(() => quote(owner, "profile_1", "NO_SUCH_CODE"));
    await unavailable(() => quote(owner, "profile_1", "x"));
    await unavailable(() => quote(owner, "profile_1", "GARYWON"));
    await reject(() => rpc("billing_promo_quote", [owner, "test", "profile_1", "GARYWON", true]), "42501");
    const ineffective = await createPromotion({ code: "NOREDUCTION", discountType: "fixed_total", discountValue: 1200, eligibleOfferKeys: ["profile_1"] });
    await unavailable(() => quote(owner, "profile_1", ineffective.code));
  });

  await test("promo quote throttling is durable, bounded per account, and resets by window", async () => {
    for (let attempt = 1; attempt <= 12; attempt++) await unavailable(() => quote(owner, "profile_1", `GUESS_${attempt}`));
    assert.deepEqual(await quote(owner, "profile_1", "GARYWON"), { available: false, rateLimited: true });
    assert.equal((await quote(owner2, "profile_1", "NO_SUCH_CODE")).rateLimited, false);
    await db.query("update billing_promo_quote_limits set window_started_at=clock_timestamp()-interval '6 minutes' where owner_id=$1 and environment=$2", [owner, ENVIRONMENT]);
    assert.equal((await quote(owner, "profile_1", "NO_SUCH_CODE")).rateLimited, false);
  });
} finally {
  await db.close();
}

console.log(`Promotion ledger: ${passed} checks passed.`);
