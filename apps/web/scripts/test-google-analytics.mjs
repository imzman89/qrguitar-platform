import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

function compile(relative, mocks = {}, processEnv = {}) {
  const source = fs.readFileSync(path.join(webRoot, relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", code)(name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected import ${name} in ${relative}`);
  }, module, module.exports, { env: processEnv });
  return module.exports;
}

const consentSource = fs.readFileSync(path.join(webRoot, "lib/optional-tracking-consent.ts"), "utf8");
const consentCode = ts.transpileModule(consentSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const consent = await import(`data:text/javascript;base64,${Buffer.from(`${consentCode}\n// ga4-isolated-consent`).toString("base64")}`);
const gaConfig = compile("lib/google-analytics-config.ts", { "./optional-tracking-consent": consent });
const analytics = gaConfig.parseGoogleAnalyticsConfig("G-ABC12345", "analytics");
const ga = compile("lib/google-analytics.ts", {
  "./optional-tracking-consent": consent,
  "./google-analytics-config": { configuredGoogleAnalytics: analytics }
});
const headers = compile("lib/security-headers.ts");

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

class FakeDocument {
  scripts = [];
  cookieWrites = [];
  initialCookies = "_ga=client; _ga_ABC12345=session; qrguitar_session=essential";
  get cookie() { return this.initialCookies; }
  set cookie(value) { this.cookieWrites.push(value); }
  head = { appendChild: script => { this.scripts.push(script); return script; } };
  createElement(name) {
    assert.equal(name, "script");
    const script = {
      async: false, id: "", referrerPolicy: "", removed: false, src: "",
      remove() { this.removed = true; }
    };
    return script;
  }
  getElementById(id) { return this.scripts.find(script => script.id === id && !script.removed) || null; }
}

function directives(values) {
  const csp = new Headers(values.map(({ key, value }) => [key, value])).get("content-security-policy");
  return new Map(csp.split(";").map(value => {
    const parts = value.trim().split(/\s+/);
    return [parts[0], parts.slice(1)];
  }));
}

test("GA4 configuration requires a strict Measurement ID and the analytics purpose", () => {
  for (const valid of ["G-ABC123", "G-1234567890", "G-ABCDEFGHIJKLMNOPQRST"]) {
    assert.equal(gaConfig.parseGoogleAnalyticsMeasurementId(valid), valid);
    assert.deepEqual(gaConfig.parseGoogleAnalyticsConfig(valid, "analytics"), { enabled: true, measurementId: valid });
  }
  for (const invalid of [undefined, "", "g-ABC123", "G-ABC", "G-ABC_123", "GTM-ABC123", "G-ABC123<script>"]) {
    assert.equal(gaConfig.parseGoogleAnalyticsMeasurementId(invalid), null);
    assert.deepEqual(gaConfig.parseGoogleAnalyticsConfig(invalid, "analytics"), { enabled: false, measurementId: null });
  }
  assert.deepEqual(gaConfig.parseGoogleAnalyticsConfig("G-ABC12345", "advertising"), { enabled: false, measurementId: null });
  assert.deepEqual(gaConfig.parseGoogleAnalyticsConfig("G-ABC12345", "analytics,unknown"), { enabled: false, measurementId: null });
  assert.equal(gaConfig.hasConfiguredOptionalTrackingProvider(consent.parseOptionalTrackingConfig("analytics"), { enabled: false, measurementId: null }), false);
  assert.equal(gaConfig.hasConfiguredOptionalTrackingProvider(consent.parseOptionalTrackingConfig("advertising"), { enabled: false, measurementId: null }), false);
  assert.equal(gaConfig.hasConfiguredOptionalTrackingProvider(consent.parseOptionalTrackingConfig("analytics,advertising"), { enabled: false, measurementId: null }), false);
  assert.equal(gaConfig.hasConfiguredOptionalTrackingProvider(consent.parseOptionalTrackingConfig("analytics"), analytics), true);
  assert.equal(gaConfig.hasConfiguredOptionalTrackingProvider(consent.parseOptionalTrackingConfig("analytics,advertising"), analytics), true);
});

test("route mapping exposes only coarse allowlisted categories and synthetic context", () => {
  const cases = new Map([
    ["/", "home"],
    ["/catalog", "catalog"],
    ["/i/QRG-VERY-PRIVATE-CODE", "public_profile"],
    ["/collections/private-handle", "public_collection"],
    ["/transfer/super-secret-token", "ownership_transfer"],
    ["/dashboard/profile/QRG-PRIVATE", "owner_profile"],
    ["/billing/paypal/return", "billing"],
    ["/unknown/private-value", "other"]
  ]);
  for (const [pathname, category] of cases) {
    assert.equal(ga.categorizeGoogleAnalyticsRoute(pathname), category);
    const serialized = JSON.stringify(ga.googleAnalyticsPageContext(category));
    assert.match(serialized, new RegExp(`_measurement/${category}`));
    assert.doesNotMatch(serialized, /QRG-|private-handle|super-secret-token|unknown\/private-value/);
  }
  for (const unsafe of ["https://www.qrguitar.com/catalog", "/i/code?token=secret", "/i/code#serial", "\\i\\code", ""]) {
    assert.equal(ga.categorizeGoogleAnalyticsRoute(unsafe), null);
  }
  assert.equal(ga.dispatchGoogleAnalyticsRoute("/catalog"), false);
});

test("event mapping is bounded, useful, and rejects malformed or identifying payloads", () => {
  const token = `qrg_evt_v1_${"a".repeat(64)}`;
  const mapped = [
    ga.mapOptionalTrackingEventToGoogleAnalytics({ name: "public_profile_viewed", properties: { visibility: "public" } }),
    ga.mapOptionalTrackingEventToGoogleAnalytics({ idempotencyToken: token, name: "account_registration_completed", properties: { confirmation: "session_ready" } }),
    ga.mapOptionalTrackingEventToGoogleAnalytics({ idempotencyToken: token, name: "profile_creation_completed", properties: { visibility: "private" } }),
    ga.mapOptionalTrackingEventToGoogleAnalytics({ idempotencyToken: token, name: "credit_checkout_started", properties: { credits: 10, valueUsd: 50, pricing: "standard" } }),
    ga.mapOptionalTrackingEventToGoogleAnalytics({ idempotencyToken: token, name: "credit_purchase_completed", properties: { credits: 25, valueUsd: 0.3, pricing: "internal_test" } }),
    ga.mapOptionalTrackingEventToGoogleAnalytics({ idempotencyToken: token, name: "ownership_transfer_completed", properties: { method: "buyer_code" } })
  ];
  assert.deepEqual(mapped.map(event => event?.name), ["public_profile_viewed", "sign_up", "profile_created", "begin_checkout", "purchase", "ownership_transfer_completed"]);
  for (const event of mapped.slice(1)) assert.equal(event.parameters.event_id, token);
  assert.equal(mapped[3].parameters.currency, "USD");
  assert.equal(mapped[3].parameters.value, 50);
  assert.equal(mapped[3].parameters.pricing_tier, "standard");
  assert.deepEqual(mapped[3].parameters.items, [{ item_id: "profile_credit_pack_10", item_name: "10 Profile credits", item_category: "profile_credits", price: 50, quantity: 1 }]);
  assert.equal(mapped[4].parameters.transaction_id, token);
  assert.equal(mapped[4].parameters.value, 0.3);
  assert.equal(mapped[4].parameters.pricing_tier, "internal_test");

  for (const malformed of [
    null,
    { name: "public_profile_viewed", properties: { visibility: "public", qrgCode: "QRG-SECRET" } },
    { idempotencyToken: token, name: "credit_checkout_started", properties: { credits: 10, valueUsd: 99, pricing: "standard" } },
    { idempotencyToken: "raw-order-id", name: "credit_purchase_completed", properties: { credits: 1, valueUsd: 12, pricing: "standard" } },
    { idempotencyToken: token, name: "credit_purchase_completed", properties: { credits: 1, valueUsd: 12, pricing: "promotion" } },
    { idempotencyToken: token, name: "credit_purchase_completed", properties: { credits: 1, valueUsd: 0.29, pricing: "internal_test" } },
    { idempotencyToken: token, name: "profile_creation_completed", properties: { visibility: "private", email: "owner@example.test" } },
    { idempotencyToken: token, name: "profile_creation_completed", properties: { visibility: { toString: () => "private" } } },
    { idempotencyToken: token, name: "ownership_transfer_completed", properties: { method: "raw-token" } },
    { idempotencyToken: token, name: "ownership_transfer_completed", properties: { method: { toString: () => "review" } } }
  ]) assert.equal(ga.mapOptionalTrackingEventToGoogleAnalytics(malformed), null);
});

test("the provider has zero pre-consent side effects, catches accepted initial events, and cleans up on withdrawal", async () => {
  const storage = new MemoryStorage(), dedupeStorage = new MemoryStorage(), target = new EventTarget();
  const trackingRuntime = { config: consent.parseOptionalTrackingConfig("analytics"), storage, dedupeStorage, eventTarget: target };
  const previousLayer = [["event", "pre_consent_secret", { email: "never-send@example.test" }]];
  const windowPort = { dataLayer: previousLayer, location: { hostname: "www.qrguitar.com", pathname: "/i/QRG-SECRET-CODE" } };
  const documentPort = new FakeDocument();
  let loads = 0;
  const stop = consent.activateOptionalTracking("analytics", () => {
    loads++;
    return ga.startGoogleAnalytics(analytics, { document: documentPort, trackingRuntime, window: windowPort, now: () => new Date(0) });
  }, trackingRuntime);

  assert.equal(loads, 0);
  assert.equal(documentPort.scripts.length, 0);
  assert.equal(windowPort.dataLayer, previousLayer);
  assert.equal(ga.dispatchGoogleAnalyticsRoute("/catalog"), false);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent({ name: "public_profile_viewed", properties: { visibility: "public" } }, { runtime: trackingRuntime }), false);

  assert.equal(consent.saveOptionalTrackingConsent("accepted", trackingRuntime), true);
  assert.equal(loads, 1);
  assert.equal(documentPort.scripts.length, 1);
  assert.equal(documentPort.scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-ABC12345");
  assert.notEqual(windowPort.dataLayer, previousLayer);
  const activeLayer = windowPort.dataLayer;
  assert.ok(activeLayer.every(command => Object.prototype.toString.call(command) === "[object Arguments]"));
  assert.equal(await consent.dispatchOptionalTrackingProductEvent({
    name: "credit_purchase_completed",
    properties: { credits: 10, valueUsd: 50, pricing: "standard" }
  }, { runtime: trackingRuntime, dedupeKey: "raw-order-id-must-never-leave" }), true);
  assert.equal(ga.dispatchGoogleAnalyticsRoute("/i/QRG-ANOTHER-SECRET"), true);

  const sent = JSON.stringify(activeLayer);
  assert.match(sent, /"purchase"/);
  assert.match(sent, /"transaction_id":"qrg_evt_v1_/);
  assert.match(sent, /_measurement\/public_profile/);
  for (const forbidden of ["pre_consent_secret", "never-send@example.test", "raw-order-id-must-never-leave", "QRG-SECRET", "QRG-ANOTHER-SECRET"]) assert.doesNotMatch(sent, new RegExp(forbidden));
  assert.match(sent, /"send_page_view":false/);
  assert.match(sent, /"allow_google_signals":false/);
  assert.match(sent, /"allow_ad_personalization_signals":false/);

  await Promise.resolve();
  assert.equal(consent.saveOptionalTrackingConsent("denied", trackingRuntime), true);
  assert.equal(windowPort["ga-disable-G-ABC12345"], true);
  assert.equal(documentPort.scripts[0].removed, true);
  assert.equal(windowPort.dataLayer, previousLayer);
  assert.equal(ga.dispatchGoogleAnalyticsRoute("/catalog"), false);
  assert.equal(await consent.dispatchOptionalTrackingProductEvent({ name: "public_profile_viewed", properties: { visibility: "public" } }, { runtime: trackingRuntime }), false);
  assert.ok(documentPort.cookieWrites.some(value => value.startsWith("_ga=")));
  assert.ok(documentPort.cookieWrites.some(value => value.startsWith("_ga_ABC12345=")));
  assert.ok(documentPort.cookieWrites.every(value => !value.startsWith("qrguitar_session=")));
  assert.deepEqual(Array.from(activeLayer.at(-1)), ["consent", "update", {
    ad_personalization: "denied", ad_storage: "denied", ad_user_data: "denied", analytics_storage: "denied"
  }]);
  stop();
});

test("a stale activation cleanup cannot tear down a newer accepted GA4 runtime", () => {
  const storage = new MemoryStorage(), target = new EventTarget();
  const trackingRuntime = { config: consent.parseOptionalTrackingConfig("analytics"), storage, eventTarget: target };
  consent.saveOptionalTrackingConsent("accepted", trackingRuntime);
  const originalLayer = { existing: true };
  const windowPort = { dataLayer: originalLayer, location: { hostname: "www.qrguitar.com", pathname: "/privacy" } };
  const documentPort = new FakeDocument();
  const firstCleanup = ga.startGoogleAnalytics(analytics, { document: documentPort, trackingRuntime, window: windowPort });
  const firstLayer = windowPort.dataLayer;
  const secondCleanup = ga.startGoogleAnalytics(analytics, { document: documentPort, trackingRuntime, window: windowPort });
  const secondLayer = windowPort.dataLayer, secondScript = documentPort.scripts.at(-1);
  const firstLayerLength = firstLayer.length;
  assert.notEqual(firstLayer, secondLayer);
  firstCleanup();
  assert.equal(firstLayer.length, firstLayerLength, "stale cleanup must not update the provider's global consent state");
  assert.equal(windowPort.dataLayer, secondLayer);
  assert.equal(secondScript.removed, false);
  assert.equal(windowPort["ga-disable-G-ABC12345"], false);
  assert.deepEqual(documentPort.cookieWrites, []);
  secondCleanup();
  assert.equal(windowPort.dataLayer, originalLayer);
  assert.equal(secondScript.removed, true);
  assert.equal(windowPort["ga-disable-G-ABC12345"], true);
});

test("CSP expands only for valid accepted-purpose configuration and never grants ad origins", () => {
  const plain = directives(headers.securityHeaders({ ga4MeasurementId: "", optionalTrackingPurposes: "analytics" }));
  const invalid = directives(headers.securityHeaders({ ga4MeasurementId: "G-INVALID_", optionalTrackingPurposes: "analytics" }));
  const wrongPurpose = directives(headers.securityHeaders({ ga4MeasurementId: "G-ABC12345", optionalTrackingPurposes: "advertising" }));
  for (const policy of [plain, invalid, wrongPurpose]) {
    assert.equal(policy.get("script-src").includes("https://www.googletagmanager.com"), false);
    assert.equal(policy.get("connect-src").includes("https://www.google-analytics.com"), false);
  }
  const enabled = directives(headers.securityHeaders({ ga4MeasurementId: "G-ABC12345", optionalTrackingPurposes: "analytics" }));
  assert.ok(enabled.get("script-src").includes("https://www.googletagmanager.com"));
  for (const origin of ["https://www.google-analytics.com", "https://region1.google-analytics.com", "https://analytics.google.com", "https://region1.analytics.google.com"]) {
    assert.ok(enabled.get("connect-src").includes(origin), origin);
  }
  const googleSources = [...enabled.values()].flat().filter(value => /google|doubleclick/i.test(value));
  assert.ok(googleSources.every(value => !value.includes("*")));
  assert.ok(googleSources.every(value => !/doubleclick|googleadservices|googlesyndication/i.test(value)));
  assert.equal(enabled.get("frame-src").includes("https://www.googletagmanager.com"), false);
});

test("layout, environment, privacy, and operator docs preserve the consent contract", () => {
  const read = relative => fs.readFileSync(path.join(repoRoot, relative), "utf8");
  const runtime = read("apps/web/components/GoogleAnalyticsRuntime.tsx");
  const layout = read("apps/web/app/layout.tsx");
  const consentUi = read("apps/web/components/OptionalTrackingConsent.tsx");
  const privacy = read("apps/web/app/privacy/page.tsx");
  const guide = read("docs/OPTIONAL_TRACKING.md");
  assert.match(runtime, /useLayoutEffect[\s\S]*activateOptionalTracking\("analytics", \(\) => startGoogleAnalytics/);
  assert.match(runtime, /useEffect[\s\S]*dispatchGoogleAnalyticsRoute\(pathname\)/);
  assert.ok(layout.indexOf("<GoogleAnalyticsRuntime />") < layout.indexOf("<PwaRuntime>"));
  assert.match(consentUi, /hasConfiguredOptionalTrackingProvider\(\)/);
  assert.match(consentUi, /saveOptionalTrackingConsentForReload\(\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(privacy, /cannot erase information Google already received/);
  assert.match(guide, /does not by itself guarantee provider-side or cross-device deduplication/);
  assert.match(guide, /GA4 does not promise equivalent automatic deduplication for other web events/);
  assert.match(guide, /other events may be counted again/);
  assert.match(guide, /Page changes based on browser history events/);
  assert.match(guide, /Do not queue or replay events that happened before\s+acceptance/);
  for (const relative of [".env.example", "apps/web/.env.example"]) {
    const sample = read(relative);
    assert.match(sample, /^NEXT_PUBLIC_GA4_MEASUREMENT_ID=$/m);
    assert.doesNotMatch(sample, /^NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-/m);
  }
});
