import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const require = process.env.QRGUITAR_SOURCE_ROOT
  ? createRequire(path.join(process.env.QRGUITAR_SOURCE_ROOT, "package.json"))
  : createRequire(import.meta.url);
const ts = require("typescript");

let moduleSequence = 0;
async function loadConsentModule(label = "main") {
  const source = fs.readFileSync(path.join(webRoot, "lib/optional-tracking-consent.ts"), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const isolated = `${javascript}\n// isolated test module: ${label}-${moduleSequence++}`;
  return import(`data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`);
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

class SerialLockManager {
  tails = new Map();
  names = [];
  async request(name, callback) {
    this.names.push(name);
    const previous = this.tails.get(name) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    this.tails.set(name, current);
    await previous;
    try { return await callback(); }
    finally {
      release();
      if (this.tails.get(name) === current) this.tails.delete(name);
    }
  }
}

const consent = await loadConsentModule();
const analytics = consent.parseOptionalTrackingConfig("analytics");
const advertising = consent.parseOptionalTrackingConfig("advertising");
const both = consent.parseOptionalTrackingConfig(" advertising, analytics,analytics ");

test("optional tracking is disabled for empty or partly invalid configuration", () => {
  assert.deepEqual(consent.parseOptionalTrackingConfig(""), { enabled: false, purposes: [] });
  assert.deepEqual(consent.parseOptionalTrackingConfig(undefined), { enabled: false, purposes: [] });
  assert.deepEqual(consent.parseOptionalTrackingConfig("analytics,unknown"), { enabled: false, purposes: [] });
  assert.deepEqual(both, { enabled: true, purposes: ["analytics", "advertising"] });
});

test("registration and conversion names are stable, explicit, and provider-neutral", () => {
  assert.deepEqual(consent.optionalTrackingProductEvents, {
    publicProfileViewed: "public_profile_viewed",
    qrLandingViewed: "qr_landing_viewed",
    registrationCompleted: "account_registration_completed",
    profileCreated: "profile_creation_completed",
    checkoutStarted: "credit_checkout_started",
    purchaseCompleted: "credit_purchase_completed",
    ownershipTransferCompleted: "ownership_transfer_completed"
  });
  const guide = fs.readFileSync(path.join(repoRoot, "docs/OPTIONAL_TRACKING.md"), "utf8");
  for (const name of Object.values(consent.optionalTrackingProductEvents)) assert.match(guide, new RegExp(name));
  assert.match(guide, /Do not queue or replay events that happened before\s+acceptance/);
  assert.match(guide, /Never emit a success event from a button click/);
  assert.match(guide, /Reserved and intentionally blocked/);
  assert.match(guide, /provider adapter \*\*must\*\* pass `idempotencyToken`/i);
  assert.match(guide, /pseudonymous rather than\s+anonymous/);
});

test("missing, malformed, denied, and purpose-stale choices all fail closed", () => {
  const storage = new MemoryStorage();
  assert.equal(consent.readOptionalTrackingConsent({ config: both, storage }).status, "pending");
  assert.equal(consent.canUseOptionalTracking("analytics", { config: both, storage }), false);

  storage.setItem(consent.optionalTrackingConsentStorageKey(both), "yes-please");
  assert.equal(consent.readOptionalTrackingConsent({ config: both, storage }).status, "pending");

  storage.setItem(consent.optionalTrackingConsentStorageKey(analytics), "accepted");
  assert.equal(consent.readOptionalTrackingConsent({ config: both, storage }).status, "pending");

  storage.setItem(consent.optionalTrackingConsentStorageKey(both), "denied");
  assert.equal(consent.readOptionalTrackingConsent({ config: both, storage }).status, "denied");
  assert.equal(consent.canUseOptionalTracking("analytics", { config: both, storage }), false);
  assert.equal(consent.canUseOptionalTracking("advertising", { config: both, storage }), false);
});

test("acceptance stores only the exact choice and authorizes only configured purposes", () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const runtime = { config: analytics, storage, eventTarget: target };
  let updates = 0;
  const stop = consent.subscribeToOptionalTrackingConsent((state) => {
    updates++;
    assert.equal(state.status, "accepted");
  }, runtime);

  assert.equal(consent.saveOptionalTrackingConsent("accepted", runtime), true);
  assert.deepEqual([...storage.values.entries()], [[consent.optionalTrackingConsentStorageKey(analytics), "accepted"]]);
  assert.equal(consent.canUseOptionalTracking("analytics", runtime), true);
  assert.equal(consent.canUseOptionalTracking("advertising", runtime), false);
  assert.equal(updates, 1);
  stop();
});

test("denial persists as an equal first-class choice and never activates a loader", () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const runtime = { config: advertising, storage, eventTarget: target };
  let loads = 0;
  const stop = consent.activateOptionalTracking("advertising", () => { loads++; }, runtime);
  assert.equal(consent.saveOptionalTrackingConsent("denied", runtime), true);
  assert.equal(consent.readOptionalTrackingConsent(runtime).status, "denied");
  assert.equal(loads, 0);
  stop();
});

test("a loader runs once only after a verified accepted choice", () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const runtime = { config: both, storage, eventTarget: target };
  let loads = 0;
  const stop = consent.activateOptionalTracking("analytics", () => { loads++; }, runtime);
  assert.equal(loads, 0);
  assert.equal(consent.saveOptionalTrackingConsent("accepted", runtime), true);
  assert.equal(loads, 1);
  consent.saveOptionalTrackingConsent("accepted", runtime);
  assert.equal(loads, 1);
  stop();
});

test("provider cleanup runs on withdrawal, reactivation, disposal, and an async consent race", async () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const runtime = { config: analytics, storage, eventTarget: target };
  assert.equal(consent.saveOptionalTrackingConsent("accepted", runtime), true);
  let loads = 0, cleanups = 0;
  const stop = consent.activateOptionalTracking("analytics", () => {
    loads++;
    return () => { cleanups++; };
  }, runtime);
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(consent.saveOptionalTrackingConsent("denied", runtime), true);
  assert.equal(cleanups, 1);
  assert.equal(consent.saveOptionalTrackingConsent("accepted", runtime), true);
  await Promise.resolve();
  assert.equal(loads, 2);
  stop();
  assert.equal(cleanups, 2);

  let release;
  const lateRuntime = { config: both, storage: new MemoryStorage(), eventTarget: new EventTarget() };
  consent.saveOptionalTrackingConsent("accepted", lateRuntime);
  const lateStop = consent.activateOptionalTracking("analytics", () => new Promise((resolve) => { release = resolve; }), lateRuntime);
  consent.saveOptionalTrackingConsent("denied", lateRuntime);
  release(() => { cleanups++; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cleanups, 3);
  lateStop();
});

test("product events require accepted analytics, sanitize detail, and never replay pre-consent work", async () => {
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: analytics, storage, dedupeStorage, eventTarget: target };
  const received = [];
  const stop = consent.subscribeToOptionalTrackingProductEvents((event) => received.push(event), runtime);
  const event = { name: consent.optionalTrackingProductEvents.publicProfileViewed, properties: { visibility: "public" } };

  assert.equal(await consent.dispatchOptionalTrackingProductEvent(event, { runtime }), false);
  assert.deepEqual(received, []);
  assert.equal(consent.saveOptionalTrackingConsent("accepted", runtime), true);
  assert.deepEqual(received, []);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(event, { runtime }), true);
  assert.deepEqual(received, [event]);

  const advertisingStorage = new MemoryStorage(), advertisingRuntime = { config: advertising, storage: advertisingStorage, eventTarget: new EventTarget() };
  consent.saveOptionalTrackingConsent("accepted", advertisingRuntime);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(event, { runtime: advertisingRuntime }), false);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent({ name: consent.optionalTrackingProductEvents.qrLandingViewed, properties: {} }, { runtime }), false);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent({ ...event, properties: { visibility: "public", profileId: "QRG-PRIVATE" } }, { runtime }), false);
  stop();
});

test("business success detail carries only a stable pseudonymous token and bounded properties", async () => {
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: analytics, storage, dedupeStorage, eventTarget: target };
  consent.saveOptionalTrackingConsent("accepted", runtime);
  const received = [];
  consent.subscribeToOptionalTrackingProductEvents((event) => received.push(event), runtime);
  const privateOrderId = "44444444-4444-4444-8444-444444444444";
  const purchase = { name: consent.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 10, valueUsd: 50 } };
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(purchase, { runtime, dedupeKey: privateOrderId }), true);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(purchase, { runtime, dedupeKey: privateOrderId }), false);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].properties, purchase.properties);
  assert.deepEqual(Object.keys(received[0]).sort(), ["idempotencyToken", "name", "properties"]);
  assert.match(received[0].idempotencyToken, /^qrg_evt_v1_[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(received), new RegExp(privateOrderId));
  assert.doesNotMatch(JSON.stringify([...dedupeStorage.values.entries()]), new RegExp(privateOrderId));
  assert.match(JSON.stringify([...dedupeStorage.values.entries()]), /qrg_evt_v1_[a-f0-9]{64}/);

  const forged = new Event(consent.OPTIONAL_TRACKING_PRODUCT_EVENT);
  Object.defineProperty(forged, "detail", { value: { ...received[0], email: "private@example.test" } });
  target.dispatchEvent(forged);
  assert.equal(received.length, 1);
});

test("durable conversion markers retain only the latest bounded token set", async () => {
  const isolated = await loadConsentModule("bounded-markers");
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: isolated.parseOptionalTrackingConfig("analytics"), storage, dedupeStorage, eventTarget: target };
  isolated.saveOptionalTrackingConsent("accepted", runtime);
  const event = { name: isolated.optionalTrackingProductEvents.profileCreated, properties: { visibility: "private" } };
  for (let index = 0; index < 130; index++) {
    assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: `private-profile-${index}` }), true);
  }
  const stored = JSON.parse([...dedupeStorage.values.values()][0]);
  assert.equal(stored.length, 128);
  assert.ok(stored.every((value) => /^qrg_evt_v1_[a-f0-9]{64}$/.test(value)));
  assert.doesNotMatch(JSON.stringify(stored), /private-profile-/);
});

test("conversion dedupe survives tabs and browser sessions and serializes concurrent tabs", async () => {
  const tabA = await loadConsentModule("tab-a"), tabB = await loadConsentModule("tab-b"), laterSession = await loadConsentModule("later-session");
  const sharedConsent = new MemoryStorage(), sharedDedupe = new MemoryStorage(), locks = new SerialLockManager();
  const targetA = new EventTarget(), targetB = new EventTarget(), targetLater = new EventTarget();
  const configA = tabA.parseOptionalTrackingConfig("analytics"), configB = tabB.parseOptionalTrackingConfig("analytics"), configLater = laterSession.parseOptionalTrackingConfig("analytics");
  const runtimeA = { config: configA, storage: sharedConsent, dedupeStorage: sharedDedupe, eventTarget: targetA, lockManager: locks };
  const runtimeB = { config: configB, storage: sharedConsent, dedupeStorage: sharedDedupe, eventTarget: targetB, lockManager: locks };
  const runtimeLater = { config: configLater, storage: sharedConsent, dedupeStorage: sharedDedupe, eventTarget: targetLater, lockManager: locks };
  assert.equal(tabA.saveOptionalTrackingConsent("accepted", runtimeA), true);
  let delivered = 0;
  tabA.subscribeToOptionalTrackingProductEvents(() => { delivered++; }, runtimeA);
  tabB.subscribeToOptionalTrackingProductEvents(() => { delivered++; }, runtimeB);
  laterSession.subscribeToOptionalTrackingProductEvents(() => { delivered++; }, runtimeLater);
  const businessKey = "55555555-5555-4555-8555-555555555555";
  const eventA = { name: tabA.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 25, valueUsd: 99 } };
  const eventB = { name: tabB.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 25, valueUsd: 99 } };
  const outcomes = await Promise.all([
    tabA.dispatchOptionalTrackingProductEvent(eventA, { runtime: runtimeA, dedupeKey: businessKey }),
    tabB.dispatchOptionalTrackingProductEvent(eventB, { runtime: runtimeB, dedupeKey: businessKey })
  ]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(delivered, 1);
  assert.ok(locks.names.length >= 2);
  assert.equal(new Set(locks.names).size, 1);
  assert.doesNotMatch(locks.names[0], new RegExp(businessKey));

  const laterEvent = { name: laterSession.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 25, valueUsd: 99 } };
  assert.equal(await laterSession.dispatchOptionalTrackingProductEvent(laterEvent, { runtime: runtimeLater, dedupeKey: businessKey }), false);
  assert.equal(delivered, 1);
});

test("same-page concurrent conversions dedupe even without durable storage or locks", async () => {
  const isolated = await loadConsentModule("same-page-race");
  const storage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: isolated.parseOptionalTrackingConfig("analytics"), storage, dedupeStorage: null, eventTarget: target, lockManager: null };
  isolated.saveOptionalTrackingConsent("accepted", runtime);
  let delivered = 0;
  isolated.subscribeToOptionalTrackingProductEvents(() => { delivered++; }, runtime);
  const event = { name: isolated.optionalTrackingProductEvents.profileCreated, properties: { visibility: "public" } };
  const outcomes = await Promise.all([
    isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: "QRG-RACE-001" }),
    isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: "QRG-RACE-001" })
  ]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(delivered, 1);
});

test("consent withdrawal clears local markers while stable provider tokens survive reacceptance", async () => {
  const isolated = await loadConsentModule("consent-toggle");
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: isolated.parseOptionalTrackingConfig("analytics"), storage, dedupeStorage, eventTarget: target };
  const received = [];
  isolated.subscribeToOptionalTrackingProductEvents((event) => received.push(event), runtime);
  const event = { name: isolated.optionalTrackingProductEvents.ownershipTransferCompleted, properties: { method: "review" } };
  const key = "transfer-private-001";
  isolated.saveOptionalTrackingConsent("accepted", runtime);
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: key }), true);
  const firstToken = received[0].idempotencyToken;
  assert.equal(isolated.saveOptionalTrackingConsent("denied", runtime), true);
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: key }), false);
  assert.match(JSON.stringify([...dedupeStorage.values.values()]), /\[\]/);
  assert.equal(isolated.saveOptionalTrackingConsent("accepted", runtime), true);
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: key }), true);
  assert.equal(received.length, 2);
  assert.equal(received[1].idempotencyToken, firstToken);
});

test("public Profile views remain repeatable and never carry a business idempotency token", async () => {
  const isolated = await loadConsentModule("repeatable-views");
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const runtime = { config: isolated.parseOptionalTrackingConfig("analytics"), storage, dedupeStorage, eventTarget: target };
  const received = [];
  isolated.saveOptionalTrackingConsent("accepted", runtime);
  isolated.subscribeToOptionalTrackingProductEvents((event) => received.push(event), runtime);
  const event = { name: isolated.optionalTrackingProductEvents.publicProfileViewed, properties: { visibility: "public" } };
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime }), true);
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime }), true);
  assert.deepEqual(received, [event, event]);
  assert.equal(dedupeStorage.values.size, 0);
  assert.equal(await isolated.dispatchOptionalTrackingProductEvent(event, { runtime, dedupeKey: "must-not-dedupe-page-views" }), false);
});

test("every supported event enforces its bounded non-identifying property schema", async () => {
  const storage = new MemoryStorage(), target = new EventTarget();
  const dedupeStorage = new MemoryStorage(), runtime = { config: analytics, storage, dedupeStorage, eventTarget: target };
  consent.saveOptionalTrackingConsent("accepted", runtime);
  const events = [
    { name: consent.optionalTrackingProductEvents.publicProfileViewed, properties: { visibility: "unlisted" } },
    { name: consent.optionalTrackingProductEvents.registrationCompleted, properties: { confirmation: "email_pending" } },
    { name: consent.optionalTrackingProductEvents.profileCreated, properties: { visibility: "private" } },
    { name: consent.optionalTrackingProductEvents.checkoutStarted, properties: { credits: 1, valueUsd: 12 } },
    { name: consent.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 25, valueUsd: 99 } },
    { name: consent.optionalTrackingProductEvents.ownershipTransferCompleted, properties: { method: "buyer_code" } }
  ];
  for (const [index, event] of events.entries()) {
    const repeatable = event.name === consent.optionalTrackingProductEvents.publicProfileViewed;
    assert.equal(await consent.dispatchOptionalTrackingProductEvent(event, repeatable ? { runtime } : { runtime, dedupeKey: `business-${index}` }), true);
  }
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(events[1], { runtime }), false);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent(events[2], { runtime, dedupeKey: "" }), false);
  for (const invalid of [
    { name: consent.optionalTrackingProductEvents.publicProfileViewed, properties: { visibility: "private" } },
    { name: consent.optionalTrackingProductEvents.registrationCompleted, properties: { confirmation: "clicked" } },
    { name: consent.optionalTrackingProductEvents.profileCreated, properties: { visibility: "public", email: "private@example.com" } },
    { name: consent.optionalTrackingProductEvents.checkoutStarted, properties: { credits: "10", valueUsd: 50 } },
    { name: consent.optionalTrackingProductEvents.checkoutStarted, properties: { credits: 10, valueUsd: 99 } },
    { name: consent.optionalTrackingProductEvents.purchaseCompleted, properties: { credits: 10, valueUsd: "50" } },
    { name: consent.optionalTrackingProductEvents.ownershipTransferCompleted, properties: { method: "token" } }
  ]) assert.equal(await consent.dispatchOptionalTrackingProductEvent(invalid, { runtime, dedupeKey: "invalid" }), false);
});

test("blocked browser storage is handled without granting consent", () => {
  const deniedRead = { getItem() { throw new DOMException("blocked", "SecurityError"); }, setItem() {} };
  const deniedWrite = { getItem() { return null; }, setItem() { throw new DOMException("blocked", "SecurityError"); } };
  assert.equal(consent.readOptionalTrackingConsent({ config: analytics, storage: deniedRead }).status, "pending");
  assert.equal(consent.canUseOptionalTracking("analytics", { config: analytics, storage: deniedRead }), false);
  assert.equal(consent.saveOptionalTrackingConsent("accepted", { config: analytics, storage: deniedWrite }), false);
  const blockedRuntime = { config: analytics, storage: null, eventTarget: new EventTarget() };
  assert.equal(consent.saveOptionalTrackingConsent("denied", blockedRuntime), false);
  assert.equal(consent.readOptionalTrackingConsent(blockedRuntime).status, "denied");
  assert.equal(consent.canUseOptionalTracking("analytics", blockedRuntime), false);
});

test("the UI contract stays compact, accessible, balanced, and hidden without explicit config", () => {
  const component = fs.readFileSync(path.join(webRoot, "components/OptionalTrackingConsent.tsx"), "utf8");
  const css = fs.readFileSync(path.join(webRoot, "components/OptionalTrackingConsent.module.css"), "utf8");
  const layout = fs.readFileSync(path.join(webRoot, "app/layout.tsx"), "utf8");
  const privacy = fs.readFileSync(path.join(webRoot, "app/privacy/page.tsx"), "utf8");
  assert.match(component, /!configuredOptionalTracking\.enabled \|\| !consent/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-label="Optional tracking choices"/);
  assert.match(component, />Accept<\/button>/);
  assert.match(component, /"Deny" : "Keep off"/);
  assert.match(component, /href="\/privacy"/);
  assert.match(component, /aria-label="Privacy choices"/);
  assert.match(component, /onClick=\{\(\) => choose\("denied"\)\}>Turn off/);
  assert.match(component, /setManaging\(false\);\s*setStorageError\(true\)/);
  assert.match(component, /className=\{styles\.statusOnly\} role="status"/);
  assert.match(css, /width:\s*min\(430px,/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.privacyLink,\s*\n\.controls button/);
  assert.match(css, /\.preferenceTrigger/);
  assert.match(layout, /<OptionalTrackingConsent \/>/);
  assert.match(privacy, /Cookies and browser storage/);
  assert.match(privacy, /remain available if you deny optional tracking/);
  assert.match(privacy, /pseudonymous conversion markers made with a one-way hash/);
  assert.match(privacy, /it is not anonymous/);
  assert.doesNotMatch(layout + component, /googletag|gtag|facebook|segment|posthog|plausible|analytics\.js/i);
});

test("authoritative product success call sites use the consent-gated boundary and never claim every visit is a QR scan", () => {
  const read = (relative) => fs.readFileSync(path.join(webRoot, relative), "utf8");
  const profile = read("app/i/[code]/ProfileClient.tsx");
  const login = read("app/login/page.tsx");
  const create = read("app/create/page.tsx");
  const paypal = read("lib/paypal-payments-client.ts");
  const transfer = read("app/transfer/[id]/page.tsx");
  const buyer = read("app/ownership-claim/page.tsx");
  const admin = read("app/admin/page.tsx");

  assert.match(profile, /instrument\.visibility === "private"/);
  assert.match(profile, /optionalTrackingProductEvents\.publicProfileViewed/);
  assert.doesNotMatch(profile, /qrLandingViewed/);
  assert.match(login, /Array\.isArray\(data\.user\.identities\) && data\.user\.identities\.length > 0/);
  assert.match(login, /optionalTrackingProductEvents\.registrationCompleted/);
  assert.ok(create.indexOf("if (!response.ok || !result?.ok)") < create.indexOf("optionalTrackingProductEvents.profileCreated"));
  assert.match(paypal, /order\?\.status === "fulfilled"[\s\S]*optionalTrackingProductEvents\.purchaseCompleted/);
  assert.match(paypal, /if \(terminal\(String\(status\)\)\)[\s\S]*optionalTrackingProductEvents\.checkoutStarted/);
  assert.match(transfer, /payload\.transfer\.status === "accepted"[\s\S]*method: "email_link"/);
  assert.match(buyer, /confirmedClaimMutation\(kind, payload\)[\s\S]*method: "buyer_code"/);
  assert.match(admin, /payload\.ok === true && action === "approve"[\s\S]*method: "review"/);
  assert.doesNotMatch(profile + login + create + paypal + transfer + buyer + admin, /properties:\s*\{[^}]*?(email|qrCode|orderId|transferId|serial|profileUrl)\s*:/s);
});

test("documented default remains blank, provider-neutral, and banner-free", () => {
  for (const relative of [".env.example", "apps/web/.env.example"]) {
    const sample = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(sample, /^NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES=$/m);
  }
});
