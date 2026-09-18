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

async function loadConsentModule() {
  const source = fs.readFileSync(path.join(webRoot, "lib/optional-tracking-consent.ts"), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
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
    registrationCompleted: "account_registration_completed",
    profileCreated: "profile_creation_completed",
    checkoutStarted: "credit_checkout_started",
    purchaseCompleted: "credit_purchase_completed",
    ownershipTransferCompleted: "ownership_transfer_completed"
  });
  const guide = fs.readFileSync(path.join(repoRoot, "docs/OPTIONAL_TRACKING.md"), "utf8");
  for (const name of Object.values(consent.optionalTrackingProductEvents)) assert.match(guide, new RegExp(name));
  assert.match(guide, /Do not queue or replay events that happened before acceptance/);
  assert.match(guide, /Never emit a success event from a button click/);
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

test("blocked browser storage is handled without granting consent", () => {
  const deniedRead = { getItem() { throw new DOMException("blocked", "SecurityError"); }, setItem() {} };
  const deniedWrite = { getItem() { return null; }, setItem() { throw new DOMException("blocked", "SecurityError"); } };
  assert.equal(consent.readOptionalTrackingConsent({ config: analytics, storage: deniedRead }).status, "pending");
  assert.equal(consent.canUseOptionalTracking("analytics", { config: analytics, storage: deniedRead }), false);
  assert.equal(consent.saveOptionalTrackingConsent("accepted", { config: analytics, storage: deniedWrite }), false);
  assert.equal(consent.saveOptionalTrackingConsent("denied", { config: analytics, storage: null }), false);
});

test("the UI contract stays compact, accessible, balanced, and hidden without explicit config", () => {
  const component = fs.readFileSync(path.join(webRoot, "components/OptionalTrackingConsent.tsx"), "utf8");
  const css = fs.readFileSync(path.join(webRoot, "components/OptionalTrackingConsent.module.css"), "utf8");
  const layout = fs.readFileSync(path.join(webRoot, "app/layout.tsx"), "utf8");
  const privacy = fs.readFileSync(path.join(webRoot, "app/privacy/page.tsx"), "utf8");
  assert.match(component, /!configuredOptionalTracking\.enabled \|\| consent\?\.status !== "pending"/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-label="Optional tracking choices"/);
  assert.match(component, />Accept<\/button>/);
  assert.match(component, />Deny<\/button>/);
  assert.match(component, /href="\/privacy"/);
  assert.match(css, /width:\s*min\(430px,/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.privacyLink,\s*\n\.controls button/);
  assert.match(layout, /<OptionalTrackingConsent \/>/);
  assert.match(privacy, /Cookies and browser storage/);
  assert.match(privacy, /remain available if you deny optional tracking/);
  assert.doesNotMatch(layout + component, /googletag|gtag|facebook|segment|posthog|plausible|analytics\.js/i);
});

test("documented default remains blank, provider-neutral, and banner-free", () => {
  for (const relative of [".env.example", "apps/web/.env.example"]) {
    const sample = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(sample, /^NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES=$/m);
  }
});
