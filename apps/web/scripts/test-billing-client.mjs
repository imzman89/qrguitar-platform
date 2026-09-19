import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(web, "package.json")), ts = require("typescript");
const module = { exports: {} };
new Function("exports", "module", ts.transpileModule(fs.readFileSync(path.join(web, "lib/billing-client.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(module.exports, module);
const { createBillingClient, billingCheckoutUrl, billingOrderId } = module.exports;
const ID = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222", ORDER = "33333333-3333-4333-8333-333333333333", OTHER = "44444444-4444-4444-8444-444444444444";
const offers = [{ key: "profile_1", amount: 1200, credits: 1 }, { key: "profile_10", amount: 5000, credits: 10 }, { key: "profile_25", amount: 9900, credits: 25 }].map(row => ({ ...row, version: 1, currency: "usd", permanent: true, freeAllowance: 25 }));
const snapshot = (patch = {}) => ({ environment: "live", freeLimit: 25, freeRemaining: 23, paidGranted: 10, paidConsumed: 2, paidRemaining: 8, paidAvailable: 8, hold: false, commercialExempt: false, ownedProfiles: 2, unresolvedOrder: null, order: null, ...patch });
const session = id => id ? { access_token: `token-${id}`, user: { id } } : null;
const json = value => Response.json({ ok: true, ...value });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 250; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); }
function fixture(t, options = {}) {
  const f = { session: session("a"), calls: [], navigations: [], stored: new Map(), status: snapshot(), offers, uuidCalls: 0, ...options };
  let listener;
  f.auth = { getSession: () => f.getSession ? f.getSession() : Promise.resolve({ data: { session: f.session } }), onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { f.unsubscribed = true; } } } }; } };
  f.respond = options.respond || (async (url) => url.startsWith("/api/billing/status") ? json(f.status) : url === "/api/billing/offers" ? json({ offers: f.offers }) : json({ orderId: ORDER, status: "checkout", url: "https://checkout.stripe.com/c/pay/example" }));
  f.client = createBillingClient({ auth: () => { if (f.authError) throw new Error("Auth unavailable"); return f.auth; }, fetch: async (url, init) => { f.calls.push({ url, init }); return f.respond(url, init); },
    storage: () => { if (f.storageDenied) throw new Error("Storage denied"); return { getItem: key => f.stored.get(key) || null, setItem: (key, value) => f.stored.set(key, value), removeItem: key => f.stored.delete(key) }; },
    randomUUID: () => { f.uuidCalls++; return f.uuidCalls === 1 ? ID : ID2; }, navigate: url => f.navigations.push(url), timeoutMs: f.timeoutMs ?? 1000, pollMs: f.pollMs ?? 5, maxPolls: f.maxPolls ?? 3, orderId: f.orderId, returnFlow: f.returnFlow });
  f.change = id => { f.session = session(id); listener("SIGNED_IN", f.session); };
  f.ready = async () => { await f.client.start(); await until(() => ["ready", "signed-out", "error"].includes(f.client.getState().phase)); };
  f.posts = () => f.calls.filter(call => call.init.method === "POST");
  t.after(() => f.client.dispose());
  return f;
}
test("only exact HTTPS Stripe checkout URLs are accepted", () => {
  assert.equal(billingCheckoutUrl("https://checkout.stripe.com/c/pay/example"), "https://checkout.stripe.com/c/pay/example");
  for (const value of ["javascript:alert(1)", "http://checkout.stripe.com/pay", "https://checkout.stripe.com.evil.test/pay", "https://checkout.stripe.com:443/pay", "https://checkout.stripe.com:444/pay", "https://user@checkout.stripe.com/pay", "https://checkout.stripe.com@evil.test/pay", "//checkout.stripe.com/pay", " https://checkout.stripe.com/pay", null]) assert.equal(billingCheckoutUrl(value), "", String(value));
});
test("return query accepts a UUID only and carries no payment evidence", () => {
  assert.equal(billingOrderId(ORDER), ORDER);
  for (const value of ["paid", "true", "?paid=true", "../admin", "", null]) assert.equal(billingOrderId(value), "");
});
test("signed-out state issues no billing requests or purchases", async t => {
  const f = fixture(t, { session: null }); await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.client.getState().phase, "signed-out"); assert.equal(f.calls.length, 0);
});
test("verified balance and offers load without writes", async t => {
  const f = fixture(t); await f.ready(); assert.equal(f.client.getState().snapshot.paidAvailable, 8); assert.equal(f.client.getState().offers.length, 3); assert.equal(f.posts().length, 0);
  for (const { init } of f.calls) { assert.equal(init.cache, "no-store"); assert.equal(init.headers.authorization, "Bearer token-a"); }
});
test("empty or invalid offers cannot start a purchase", async t => {
  const f = fixture(t, { offers: [] }); await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.posts().length, 0);
  f.offers = [{ ...offers[0], amount: 1 }]; await f.client.reload(); assert.equal(f.client.getState().offers.length, 0); assert.match(f.client.getState().offersMessage, /verified/); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("offers failure does not fabricate or discard a verified balance", async t => {
  const f = fixture(t); f.respond = async url => url.includes("offers") ? Response.json({ ok: false, message: "Checkout unavailable" }, { status: 503 }) : json(f.status);
  await f.ready(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().snapshot.paidAvailable, 8); assert.equal(f.client.getState().offersMessage, "Checkout unavailable");
});
test("invalid ledger arithmetic fails closed rather than displaying credits", async t => {
  const f = fixture(t, { status: snapshot({ paidAvailable: 9 }) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); await f.client.checkout("profile_1"); assert.equal(f.posts().length, 0);
});
test("hold preserves free balance and disables all purchases", async t => {
  const f = fixture(t, { status: snapshot({ hold: true, paidAvailable: 0 }) }); await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.client.getState().snapshot.freeRemaining, 23); assert.equal(f.posts().length, 0);
});
test("commercial exemption avoids an unnecessary purchase", async t => {
  const f = fixture(t, { status: snapshot({ commercialExempt: true }) }); await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.posts().length, 0);
});
test("double click sends one exact body and validates navigation", async t => {
  const f = fixture(t); await f.ready(); await Promise.all([f.client.checkout("profile_10"), f.client.checkout("profile_10")]);
  assert.equal(f.posts().length, 1); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { offerKey: "profile_10", requestId: ID }); assert.deepEqual(f.navigations, ["https://checkout.stripe.com/c/pay/example"]); assert.equal(f.uuidCalls, 1);
});
test("unknown network result keeps request identity across refresh and retry", async t => {
  const f = fixture(t); const respond = f.respond; let failures = 1;
  f.respond = async (url, init) => { if (init.method === "POST" && failures--) throw new Error("Connection lost"); return respond(url, init); };
  await f.ready(); await f.client.checkout("profile_10"); assert.equal(f.client.getState().uncertain, true); await f.client.reload(); assert.equal(f.client.getState().intent.requestId, ID);
  await f.client.checkout("profile_25"); assert.equal(f.posts().length, 1); await f.client.checkout(); assert.equal(f.posts().length, 2); assert.equal(f.posts()[0].init.body, f.posts()[1].init.body); assert.equal(f.uuidCalls, 1);
});
test("unconfirmed service failure retains order reference and UUID", async t => {
  const f = fixture(t); const respond = f.respond;
  f.respond = async (url, init) => init.method === "POST" ? Response.json({ ok: false, code: "checkout_unconfirmed", message: "Reconciliation pending", orderId: ORDER }, { status: 503 }) : respond(url, init);
  await f.ready(); await f.client.checkout("profile_1"); assert.deepEqual(f.client.getState().intent, { requestId: ID, offerKey: "profile_1", orderId: ORDER }); assert.equal(f.navigations.length, 0);
});
test("unsafe provider URL never navigates or clears existing request", async t => {
  const f = fixture(t); const respond = f.respond; f.respond = async (url, init) => init.method === "POST" ? json({ orderId: ORDER, status: "checkout", url: "https://attacker.test/pay" }) : respond(url, init);
  await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.navigations.length, 0); assert.equal(f.client.getState().intent.requestId, ID); assert.equal(f.client.getState().uncertain, true);
});
test("server pending order restores retry even with storage denied", async t => {
  const f = fixture(t, { storageDenied: true, status: snapshot({ unresolvedOrder: { orderId: ORDER, requestId: ID2, offerKey: "profile_25", status: "reserved" } }) });
  await f.ready(); await f.client.checkout(); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { offerKey: "profile_25", requestId: ID2 }); assert.equal(f.uuidCalls, 0);
});
test("a persisted unknown request survives controller recreation", async t => {
  const stored = new Map([["qrguitar:billing-intent:a", JSON.stringify({ requestId: ID2, offerKey: "profile_1", orderId: "" })]]), f = fixture(t, { stored });
  await f.ready(); assert.equal(f.client.getState().intent.requestId, ID2); await f.client.checkout(); assert.equal(f.uuidCalls, 0); assert.equal(JSON.parse(f.posts()[0].init.body).requestId, ID2);
});
test("switching accounts clears private balance and ignores an old response", async t => {
  const f = fixture(t); await f.ready(); const old = deferred(), respond = f.respond;
  f.respond = async (url, init) => url.includes("status") && init.headers.authorization === "Bearer token-a" ? old.promise : url.includes("status") ? json(snapshot({ ownedProfiles: 20, freeRemaining: 5 })) : respond(url, init);
  const reloading = f.client.reload(); await until(() => f.calls.filter(call => call.url.includes("status")).length === 2); f.change("b"); assert.equal(f.client.getState().snapshot, null);
  await until(() => f.client.getState().phase === "ready"); old.resolve(json(snapshot({ paidGranted: 999, paidConsumed: 0, paidRemaining: 999, paidAvailable: 999 }))); await reloading; await tick(); assert.equal(f.client.getState().actorId, "b"); assert.equal(f.client.getState().snapshot.ownedProfiles, 20); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("a late checkout response cannot navigate after an account switch", async t => {
  const f = fixture(t), post = deferred(), respond = f.respond; f.respond = async (url, init) => init.method === "POST" ? post.promise : respond(url, init);
  await f.ready(); const buying = f.client.checkout("profile_1"); await until(() => f.posts().length === 1); f.change("b"); post.resolve(json({ orderId: ORDER, status: "checkout", url: "https://checkout.stripe.com/c/pay/old" })); await buying; await until(() => f.client.getState().phase === "ready"); assert.equal(f.navigations.length, 0); assert.equal(f.client.getState().intent, null);
});
test("fresh auth check detects a silent account switch before navigation", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { const result = await respond(url, init); if (init.method === "POST") f.session = session("b"); return result; };
  await f.ready(); await f.client.checkout("profile_1"); await until(() => f.client.getState().phase === "ready"); assert.equal(f.navigations.length, 0); assert.equal(f.client.getState().actorId, "b");
});
test("unknown request remains account scoped across switch away and back with denied storage", async t => {
  const f = fixture(t, { storageDenied: true }), respond = f.respond; f.respond = async (url, init) => { if (init.method === "POST") throw new Error("Network lost"); return respond(url, init); };
  await f.ready(); await f.client.checkout("profile_1"); f.change("b"); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().intent, null); f.change("a"); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().intent.requestId, ID);
});
test("same-actor token refresh preserves pending purchase", async t => {
  const f = fixture(t); await f.ready(); await f.client.checkout("profile_1"); f.change("a"); assert.equal(f.client.getState().intent.requestId, ID); assert.equal(f.navigations.length, 1);
});
test("newer refresh wins when earlier response arrives last", async t => {
  const f = fixture(t); await f.ready(); const first = deferred(); let count = 0; const respond = f.respond;
  f.respond = async (url, init) => url.includes("status") ? ++count === 1 ? first.promise : json(snapshot({ freeRemaining: 4 })) : respond(url, init);
  const older = f.client.reload(); await until(() => count === 1); await f.client.reload(); first.resolve(json(snapshot({ freeRemaining: 1 }))); await older; assert.equal(f.client.getState().snapshot.freeRemaining, 4);
});
test("return polling is read-only, bounded, and query alone never claims success", async t => {
  const f = fixture(t, { orderId: ORDER, returnFlow: true, maxPolls: 2, status: snapshot({ order: { orderId: ORDER, status: "reserved", offer: offers[0] } }) }); await f.ready(); await until(() => !f.client.getState().polling); assert.equal(f.calls.filter(call => call.url.includes("status")).length, 3); assert.equal(f.posts().length, 0); assert.equal(f.client.getState().snapshot.order.status, "reserved"); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("server fulfilled order stops polling and clears only its purchase intent", async t => {
  const stored = new Map([["qrguitar:billing-intent:a", JSON.stringify({ requestId: ID, offerKey: "profile_10", orderId: ORDER })]]);
  const f = fixture(t, { stored, orderId: ORDER, returnFlow: true, status: snapshot({ order: { orderId: ORDER, status: "fulfilled", offer: offers[1] } }) }); await f.ready(); assert.equal(f.client.getState().snapshot.order.status, "fulfilled"); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().polling, false); assert.equal(stored.size, 0); assert.equal(f.posts().length, 0);
});
test("checkout fulfilled response alone cannot fabricate ledger success", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => init.method === "POST" ? json({ orderId: ORDER, status: "fulfilled" }) : respond(url, init);
  await f.ready(); await f.client.checkout("profile_10"); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); assert.equal(f.client.getState().intent.requestId, ID);
});
test("only confirmed expired order allows a new request UUID", async t => {
  const f = fixture(t); await f.ready(); await f.client.checkout("profile_1"); f.status = snapshot({ order: { orderId: ORDER, status: "expired", offer: offers[0] } }); await f.client.reload(); assert.equal(f.client.getState().intent, null);
  await f.client.checkout("profile_25"); assert.equal(JSON.parse(f.posts()[1].init.body).requestId, ID2);
});
test("mismatched status order fails closed", async t => {
  const f = fixture(t, { orderId: ORDER, status: snapshot({ order: { orderId: OTHER, status: "fulfilled", offer: offers[0] } }) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null);
});
test("auth timeout has an actionable error and can retry", async t => {
  const f = fixture(t, { timeoutMs: 10, getSession: () => new Promise(() => {}) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.calls.length, 0); delete f.getSession; await f.client.reload(); await until(() => f.client.getState().phase === "ready");
});
test("response JSON timeout keeps purchase UUID for retry", async t => {
  const f = fixture(t, { timeoutMs: 15 }), respond = f.respond;
  f.respond = async (url, init) => init.method === "POST" ? { ok: true, json: () => new Promise(() => {}) } : respond(url, init);
  await f.ready(); await f.client.checkout("profile_1"); assert.equal(f.client.getState().busy, false); assert.equal(f.client.getState().uncertain, true); assert.equal(f.client.getState().intent.requestId, ID); assert.equal(f.navigations.length, 0);
});
test("dispose cancels polling, auth subscription, and late publication", async t => {
  const f = fixture(t, { orderId: ORDER, returnFlow: true, pollMs: 10, status: snapshot({ order: { orderId: ORDER, status: "open", offer: offers[0] } }) }); await f.ready(); let events = 0; f.client.subscribe(() => events++); f.client.dispose(); const count = f.calls.length; await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(f.calls.length, count); assert.equal(events, 0); assert.equal(f.unsubscribed, true);
});
test("prototype properties cannot masquerade as offers or persisted intents", async t => {
  for (const key of ["__proto__", "constructor", "toString"]) {
    const stored = new Map([["qrguitar:billing-intent:a", JSON.stringify({ requestId: ID, offerKey: key, orderId: "" })]]);
    const f = fixture(t, { stored, offers: [{ key, version: 1, currency: "usd", permanent: true, freeAllowance: 25 }] });
    await f.ready(); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().offers.length, 0); await f.client.checkout(key); assert.equal(f.posts().length, 0);
  }
});
test("explicit return order takes priority over old fulfilled persisted intent", async t => {
  const stored = new Map([["qrguitar:billing-intent:a", JSON.stringify({ requestId: ID, offerKey: "profile_1", orderId: ORDER })]]);
  const f = fixture(t, { stored, orderId: OTHER, returnFlow: true, maxPolls: 1 }); const respond = f.respond;
  f.respond = async (url, init) => url.includes("status") ? json(snapshot({ order: { orderId: url.includes(OTHER) ? OTHER : ORDER, status: url.includes(OTHER) ? "open" : "fulfilled", offer: url.includes(OTHER) ? offers[2] : offers[0] } })) : respond(url, init);
  await f.ready(); assert.equal(f.client.getState().snapshot.order.orderId, OTHER); assert.equal(f.client.getState().snapshot.order.status, "open"); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().polling, true); await until(() => !f.client.getState().polling); assert.equal(f.client.getState().snapshot.order.orderId, OTHER); assert.equal(f.posts().length, 0);
});
test("failed reconciliation of a different persisted intent does not clear it or replace displayed order", async t => {
  const stored = new Map([["qrguitar:billing-intent:a", JSON.stringify({ requestId: ID, offerKey: "profile_1", orderId: ORDER })]]), f = fixture(t, { stored, orderId: OTHER }); const respond = f.respond;
  f.respond = async (url, init) => url.includes(ORDER) ? Response.json({ ok: false, message: "Lookup unavailable" }, { status: 503 }) : url.includes("status") ? json(snapshot({ order: { orderId: OTHER, status: "fulfilled", offer: offers[2] } })) : respond(url, init);
  await f.ready(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().snapshot.order.orderId, OTHER); assert.equal(f.client.getState().intent.orderId, ORDER); assert.equal(f.client.getState().intent.requestId, ID);
});
test("detail request with null order fails closed", async t => {
  const f = fixture(t, { orderId: ORDER }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null);
});

function renderBilling(state, mode = "overview", query = "") {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const compiled = ts.transpileModule(fs.readFileSync(path.join(web, "app/billing/BillingPage.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const component = { exports: {} };
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useRef: () => ({ current: null }), useState: () => [state, () => {}] };
    if (specifier === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (specifier === "next/navigation") return { useSearchParams: () => new URLSearchParams(query) };
    if (specifier.endsWith("/Nav")) return { Nav: () => null };
    if (specifier.endsWith("/Footer")) return { Footer: () => null };
    if (specifier.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => { throw new Error("No real auth in render test"); } };
    if (specifier.endsWith("/billing-client")) return module.exports;
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
    return require(specifier);
  }, component, component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default, { mode }));
}
const readyState = patch => ({ ...module.exports.initialBillingState(), phase: "ready", actorId: "a", snapshot: snapshot(), offers, ...patch });
test("actual return page never renders purchase success from query parameters", () => {
  const html = renderBilling(readyState({ snapshot: snapshot({ order: { orderId: ORDER, status: "open", offer: offers[0] } }) }), "return", `orderId=${ORDER}&paid=true&success=true`);
  assert.match(html, /Checking your purchase/); assert.doesNotMatch(html, /credits have been added/); assert.match(html, /after the server verifies payment/);
});
test("actual held fulfillment screen distinguishes received and available credits", () => {
  const html = renderBilling(readyState({ snapshot: snapshot({ hold: true, paidAvailable: 0, order: { orderId: ORDER, status: "fulfilled", offer: offers[1] } }) }), "return", `orderId=${ORDER}`);
  assert.match(html, /Credits received. Billing review is pending/); assert.match(html, /Paid credits are unavailable/); assert.match(html, /8 held/);
  const buyButtons = html.match(/<button[^>]*aria-label="Buy[^>]*>/g); assert.equal(buyButtons.length, 3); assert.ok(buyButtons.every(button => button.includes("disabled")));
});
test("actual empty offers screen has no active purchase controls", () => {
  const html = renderBilling(readyState({ offers: [] })); assert.match(html, /Credit packs are currently unavailable/); assert.doesNotMatch(html, /aria-label="Buy/);
});
test("actual commercial account screen explains existing access and disables packs", () => {
  const html = renderBilling(readyState({ snapshot: snapshot({ commercialExempt: true }) })); assert.match(html, /do not need to purchase credits/); assert.ok(html.match(/<button[^>]*aria-label="Buy[^>]*>/g).every(button => button.includes("disabled")));
});
test("actual signed-out return page preserves only the validated return destination", () => {
  const html = renderBilling({ ...module.exports.initialBillingState(), phase: "signed-out" }, "return", `orderId=${ORDER}&next=https://attacker.test&paid=true`);
  assert.ok(html.includes(`/login?next=${encodeURIComponent(`/billing/return?orderId=${ORDER}`)}`)); assert.doesNotMatch(html, /attacker|paid=true|Paid credits available/);
});
test("actual error and cancel screens do not imply a zero balance or cancellation", () => {
  const error = renderBilling({ ...module.exports.initialBillingState(), phase: "error", message: "Billing unavailable" }); assert.match(error, /Billing unavailable/); assert.doesNotMatch(error, /Paid credits available/);
  const cancel = renderBilling(readyState({ snapshot: snapshot({ order: { orderId: ORDER, status: "open", offer: offers[0] } }) }), "cancel", `orderId=${ORDER}`); assert.match(cancel, /Returning here does not cancel or confirm a payment/); assert.doesNotMatch(cancel, /payment cancelled|purchase successful/i);
});
test("actual page hides a previous order during a return URL change before effects run", () => {
  const html = renderBilling(readyState({ snapshot: snapshot({ order: { orderId: ORDER, status: "fulfilled", offer: offers[0] } }) }), "return", `orderId=${OTHER}`);
  assert.match(html, /Loading your credit balance/); assert.doesNotMatch(html, /credits have been added|aria-label="Buy|Paid credits available/);
});
