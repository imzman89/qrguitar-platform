import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript"), libraryModules = new Map();
function loadLibrary(name) {
  if (libraryModules.has(name)) return libraryModules.get(name);
  const compiled = ts.transpileModule(fs.readFileSync(path.join(web, "lib", `${name}.ts`), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const module = { exports: {} }; libraryModules.set(name, module.exports);
  new Function("require", "module", "exports", compiled)(specifier => specifier === "server-only" ? {} : specifier.startsWith("./") ? loadLibrary(specifier.slice(2)) : require(specifier), module, module.exports);
  libraryModules.set(name, module.exports); return module.exports;
}

const { BillingError } = loadLibrary("billing-service");
const { promoAdminAuthTransition } = loadLibrary("promo-codes");
const ADMIN = "11111111-1111-4111-8111-111111111111", PROMO = "22222222-2222-4222-8222-222222222222";
let access;
const adminJson = (value, init = {}) => Response.json(value, { ...init, headers: { "Cache-Control": "no-store, no-cache, must-revalidate", ...(init.headers || {}) } });
const utility = { adminJson, requireAdmin: async () => access };
const routePath = path.join(web, "app/api/admin/promotions/route.ts");
const compiled = ts.transpileModule(fs.readFileSync(routePath, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const routeModule = { exports: {} };
new Function("require", "module", "exports", compiled)(specifier => {
  if (specifier.endsWith("/billing-service")) return { BillingError };
  if (specifier.endsWith("/billing-environment")) return { profileBillingEnvironment: () => "live" };
  if (specifier.endsWith("/billing-http")) return { readBillingBody: async (request, maximum) => {
    const value = new Uint8Array(await request.arrayBuffer());
    if (value.byteLength > maximum) throw new BillingError(413, "request_too_large", "Request too large.");
    return value;
  } };
  if (specifier.endsWith("/supabase-server")) return { getSupabaseEnvStatus: () => ({ supabaseUrl: "https://fixture.supabase.co" }) };
  if (specifier === "../_utils") return utility;
  return require(specifier);
}, routeModule, routeModule.exports);
const route = routeModule.exports;

function fixture(t, handlers = {}) {
  const calls = [], supabase = { async rpc(name, args) {
    calls.push({ name, args }); const handler = handlers[name];
    if (handler === undefined) throw new Error(`Unexpected RPC ${name}`);
    return typeof handler === "function" ? handler(args) : structuredClone(handler);
  } };
  access = { ok: true, supabase, admin: { user: { id: ADMIN }, email: "Admin@Example.Test", accessSource: "role" } };
  t.after(() => { access = undefined; });
  return { calls };
}
const jsonBody = async response => ({ response, body: await response.json() });
const post = (value, headers = {}) => new Request("https://www.qrguitar.com/api/admin/promotions", { method: "POST",
  headers: { origin: "https://www.qrguitar.com", "content-type": "application/json", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) });
const promotion = (patch = {}) => ({ code: " save_30 ", name: " Save thirty ", description: " Admin managed offer. ", status: "active",
  audience: "everyone", discountType: "fixed_total", discountValue: 30, minimumAmount: 0,
  eligibleOfferKeys: ["profile_1", "profile_1", "profile_10"], startsAt: null, endsAt: null,
  maxRedemptions: 20, maxRedemptionsPerOwner: 2, ...patch });

test("same-admin token refresh and repeated sign-in preserve an open promo workspace", () => {
  assert.deepEqual(promoAdminAuthTransition(undefined, ADMIN, false), { actorId: ADMIN, resetWorkspace: false, reload: true });
  assert.deepEqual(promoAdminAuthTransition(ADMIN, ADMIN, true), { actorId: ADMIN, resetWorkspace: false, reload: false });
  assert.deepEqual(promoAdminAuthTransition(ADMIN, null, true), { actorId: null, resetWorkspace: true, reload: true });
  assert.deepEqual(promoAdminAuthTransition(ADMIN, "22222222-2222-4222-8222-222222222222", true), {
    actorId: "22222222-2222-4222-8222-222222222222", resetWorkspace: true, reload: true
  });
});

test("admin promotion list and detail reads use active server-derived authority and never cache", async t => {
  const fixtureState = fixture(t, {
    billing_promo_admin_list: { data: { environment: "live", promotions: [] }, error: null },
    billing_promo_admin_redemptions: { data: { redemptions: [], changes: [] }, error: null }
  });
  let result = await jsonBody(await route.GET(new Request("https://www.qrguitar.com/api/admin/promotions")));
  assert.equal(result.response.status, 200); assert.equal(result.response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  assert.deepEqual(fixtureState.calls[0], { name: "billing_promo_admin_list", args: { p_operator_id: ADMIN, p_allow_environment_admin: false, p_environment: "live" } });
  result = await jsonBody(await route.GET(new Request(`https://www.qrguitar.com/api/admin/promotions?promotionId=${PROMO}`)));
  assert.equal(result.response.status, 200); assert.deepEqual(result.body.changes, []);
  assert.equal(fixtureState.calls[1].name, "billing_promo_admin_redemptions"); assert.equal(fixtureState.calls[1].args.p_promotion_id, PROMO);
});

test("create normalizes bounded fields and derives audit identity and reason on the server", async t => {
  const fixtureState = fixture(t, { billing_promo_admin_create: args => ({ data: { id: PROMO, code: args.p_code, revision: 1 }, error: null }) });
  const result = await jsonBody(await route.POST(post({ action: "create", promotion: promotion(), reason: "Untrusted browser reason" })));
  assert.equal(result.response.status, 200); assert.equal(result.body.promotion.code, "SAVE_30");
  const call = fixtureState.calls[0]; assert.equal(call.name, "billing_promo_admin_create");
  assert.equal(call.args.p_operator_id, ADMIN); assert.equal(call.args.p_operator_email, "Admin@Example.Test"); assert.equal(call.args.p_allow_environment_admin, false);
  assert.equal(call.args.p_code, "SAVE_30"); assert.equal(call.args.p_name, "Save thirty"); assert.equal(call.args.p_description, "Admin managed offer.");
  assert.deepEqual(call.args.p_eligible_offer_keys, ["profile_1", "profile_10"]); assert.equal(call.args.p_reason, "Created promotion SAVE_30 from QRguitar Admin.");
  assert.doesNotMatch(JSON.stringify(call.args), /Untrusted browser reason/);
});

test("environment allowlist admins are conveyed explicitly to the database", async t => {
  const fixtureState = fixture(t, { billing_promo_admin_list: { data: { environment: "live", promotions: [] }, error: null } });
  access.admin.accessSource = "env";
  await route.GET(new Request("https://www.qrguitar.com/api/admin/promotions"));
  assert.equal(fixtureState.calls[0].args.p_allow_environment_admin, true);
});

test("update and status mutations require optimistic revisions and invoke only their dedicated RPC", async t => {
  const fixtureState = fixture(t, {
    billing_promo_admin_update: args => ({ data: { id: PROMO, revision: args.p_expected_revision + 1 }, error: null }),
    billing_promo_admin_set_status: args => ({ data: { id: PROMO, revision: args.p_expected_revision + 1, status: args.p_status }, error: null })
  });
  let result = await jsonBody(await route.POST(post({ action: "update", promotionId: PROMO, expectedRevision: 4,
    promotion: promotion({ code: undefined, name: "Updated", discountType: "percent_off", discountValue: 1250 }) })));
  assert.equal(result.response.status, 200); assert.equal(fixtureState.calls[0].name, "billing_promo_admin_update");
  assert.equal(fixtureState.calls[0].args.p_expected_revision, 4); assert.equal(fixtureState.calls[0].args.p_discount_value, 1250);
  assert.equal("p_code" in fixtureState.calls[0].args, false);
  result = await jsonBody(await route.POST(post({ action: "status", promotionId: PROMO, expectedRevision: 5, status: "paused" })));
  assert.equal(result.response.status, 200); assert.equal(fixtureState.calls[1].name, "billing_promo_admin_set_status");
  assert.equal(fixtureState.calls[1].args.p_status, "paused"); assert.equal(fixtureState.calls[1].args.p_reason, "Paused promotion from QRguitar Admin.");
});

test("origin, content, body size, dates, limits, packs, amounts, ids, and actions fail before RPC", async t => {
  const fixtureState = fixture(t, {});
  const bad = [
    post({ action: "create", promotion: promotion() }, { origin: "https://evil.invalid" }),
    post({ action: "create", promotion: promotion() }, { "content-type": "text/plain" }),
    post("{"),
    post({ action: "create", promotion: promotion({ startsAt: "bad date" }) }),
    post({ action: "create", promotion: promotion({ startsAt: "2026-09-20T00:00:00Z", endsAt: "2026-09-19T00:00:00Z" }) }),
    post({ action: "create", promotion: promotion({ maxRedemptions: 1, maxRedemptionsPerOwner: 2 }) }),
    post({ action: "create", promotion: promotion({ eligibleOfferKeys: ["profile_100"] }) }),
    post({ action: "create", promotion: promotion({ discountValue: 29 }) }),
    post({ action: "update", promotionId: "bad", expectedRevision: 1, promotion: promotion() }),
    post({ action: "status", promotionId: PROMO, expectedRevision: 1, status: "deleted" }),
    post({ action: "unknown" }),
    post({ action: "create", promotion: promotion({ description: "x".repeat(17000) }) })
  ];
  for (const request of bad) assert.ok((await route.POST(request)).status >= 400);
  assert.equal(fixtureState.calls.length, 0);
});

test("query validation, authorization failures, and database conflicts return reviewed responses", async t => {
  const fixtureState = fixture(t, { billing_promo_admin_update: { data: null, error: { code: "PT409", detail: "private" } } });
  assert.equal((await route.GET(new Request("https://www.qrguitar.com/api/admin/promotions?unexpected=x"))).status, 400);
  assert.equal((await route.GET(new Request("https://www.qrguitar.com/api/admin/promotions?promotionId=bad"))).status, 404);
  let result = await jsonBody(await route.POST(post({ action: "update", promotionId: PROMO, expectedRevision: 1, promotion: promotion() })));
  assert.equal(result.response.status, 409); assert.equal(result.body.code, "promotion_conflict"); assert.doesNotMatch(JSON.stringify(result.body), /private/);
  access = { ok: false, response: adminJson({ ok: false, message: "Admin access required." }, { status: 403 }) };
  result = await jsonBody(await route.GET(new Request("https://www.qrguitar.com/api/admin/promotions")));
  assert.equal(result.response.status, 403); assert.equal(result.body.message, "Admin access required.");
  assert.equal(fixtureState.calls.length, 1);
});
