import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(import.meta.dirname, "..");
const ui = (key, fallback, values = {}) => fallback.replace(/{{(\w+)}}/g, (_, name) => String(values[name] ?? ""));
const snapshot = { freeLimit: 5, freeRemaining: 5, paidAvailable: 0, paidGranted: 0, paidConsumed: 0, ownedProfiles: 0, offers: [], methods: [], environment: "production", enabled: false, hold: false, commercialExempt: false };
function billing(name, state, props) {
  state = { offers: [], ...state };
  let calls = 0;
  const hooks = { ...React, useState: initial => [++calls === 1 ? state : typeof initial === "function" ? initial() : initial, () => {}], useRef: initial => ({ current: initial }), useEffect() {} };
  const content = name === "DirectBillingPage" ? "DirectBillingContent" : name === "PayPalBillingPage" ? "PayPalBillingContent" : "BillingContent";
  const source = fs.readFileSync(path.join(root, "app/billing/" + name + ".tsx"), "utf8") + "\nexport { " + content + " as TestContent };";
  const modules = specifier => {
    if (specifier === "react") return hooks;
    if (specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "next/link" || specifier.endsWith("/CheckoutAwareLink")) return { __esModule: true, default: "a" };
    if (specifier === "next/navigation") return { useSearchParams: () => new URLSearchParams() };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (specifier.endsWith("UiTextProvider")) return { useUiText: () => ui };
    const actualModulePaths = { "/AccountAccessHelp": "components/AccountAccessHelp.tsx", "/PublicCreditPricing": "components/PublicCreditPricing.tsx", "/direct-payments": "lib/direct-payments.ts" };
    const actualModule = Object.entries(actualModulePaths).find(([suffix]) => specifier.endsWith(suffix));
    if (actualModule) {
      const dependency = { exports: {} };
      const actual = fs.readFileSync(path.join(root, actualModule[1]), "utf8");
      const compiled = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
      new Function("require", "exports", "module", compiled)(modules, dependency.exports, dependency);
      if (specifier.endsWith("/direct-payments")) assert.ok(Array.isArray(dependency.exports.DIRECT_OFFERS), "Actual approved offers must load");
      else assert.equal(typeof dependency.exports[actualModule[0].slice(1)], "function", "Actual informational component export must load");
      return dependency.exports;
    }
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (specifier.endsWith("/Nav") || specifier.endsWith("/Footer")) return { Nav: () => null, Footer: () => null };
    if (specifier.endsWith("/direct-payments-client")) return { directOrderId: () => "", initialDirectPaymentsState: {} };
    if (specifier.endsWith("/paypal-payments-client")) return { initialPayPalPaymentsState: {} };
    if (specifier.endsWith("/billing-client")) return { billingOrderId: () => "", initialBillingState: {} };
    if (specifier.endsWith("/supabase-browser") || specifier.endsWith("/paypal-browser-sdk") || specifier.endsWith("/paypal-apple-pay")) return {};
    throw Error("Unexpected presentation import: " + specifier);
  };
  const module = { exports: {} };
  new Function("require", "exports", "module", ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText)(modules, module.exports, module);
  return renderToStaticMarkup(module.exports.TestContent(props));
}
test("Manual recovery renders its purpose and permanent free Profiles policy without a pack CTA", () => {
  const html = billing("DirectBillingPage", { phase: "ready", actorId: "fixture", snapshot }, { existingOnly: true });
  assert.match(html, /Check an earlier payment/); assert.match(html, /does not start a new payment/); assert.match(html, /Profiles are always free/);
  assert.doesNotMatch(html, /Start with 25|Choose 25|Continue with|Send payment/);
});
test("Non-recovery Direct page retains its independent existing heading", () => {
  const html = billing("DirectBillingPage", { phase: "signed-out", snapshot: null }, { existingOnly: false });
  assert.match(html, /Start with 25/); assert.doesNotMatch(html, /Check an earlier payment/);
});
for (const status of [null, "cancelled", "reserved", "approval_pending", "processing", "fulfilled", "needs_review"]) test("PayPal cancel copy agrees with " + status, () => {
  const order = status ? { orderId: "fixture", status, offer: { credits: 10 } } : null;
  const html = billing("PayPalBillingPage", { phase: "ready", actorId: "fixture", snapshot: { ...snapshot, order }, intent: null }, { mode: "cancel" });
  if (["reserved", "approval_pending"].includes(status)) assert.match(html, /saved payment is still available to resume/);
  else assert.doesNotMatch(html, /saved payment is still available to resume/);
  if (status === "cancelled") assert.match(html, /This checkout is closed/);
  if (status === null) assert.match(html, /Only a pending payment confirmed by the server/);
  if (status === "processing") assert.match(html, /Confirming your payment/);
  if (status === "fulfilled") assert.match(html, /ready to create/);
});
for (const status of [null, "reserved", "open", "expired", "fulfilled"]) test("Stripe cancel copy agrees with " + status, () => {
  const order = status ? { orderId: "fixture", status, offer: { credits: 10 } } : null;
  const html = billing("BillingPage", { phase: "ready", actorId: "fixture", snapshot: { ...snapshot, order } }, { mode: "cancel" });
  if (["reserved", "open"].includes(status)) assert.match(html, /resume a pending checkout/);
  else assert.doesNotMatch(html, /resume a pending checkout/);
  if (status === null) assert.match(html, /No resumable checkout has been confirmed/);
});

// Execute the actual JSX input handlers, using the existing file collector as
// the boundary. Copying FileList before reset must also survive live-list clearing.
const claimSource = fs.readFileSync(path.join(root, "app/ownership-claim/page.tsx"), "utf8");
const ast = ts.createSourceFile("claim.tsx", claimSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callbacks(attribute, predicate) {
  const found = [];
  function visit(node) { if (ts.isJsxAttribute(node) && node.name.text === attribute && node.initializer?.expression && predicate(node.initializer.expression.getText(ast))) found.push(node.initializer.expression.getText(ast)); ts.forEachChild(node, visit); }
  visit(ast); return found;
}
function execute(source, env) { const code = ts.transpileModule("const handler = " + source + "; exports.handler = handler;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; const exports = {}; new Function("exports", ...Object.keys(env), code)(exports, ...Object.values(env)); return exports.handler; }
for (const name of ["addEvidence", "addResponseEvidence"]) test(name + " supports reselect after rejection and snapshots before reset", () => {
  const [source] = callbacks("onChange", text => text.includes(name + "(")); assert.ok(source);
  const selected = [], file = { name: "evidence.pdf" }, env = { [name]: files => selected.push(files) };
  const handler = execute(source, env);
  for (let n = 0; n < 2; n++) {
    const files = [file], target = { files, get value() { return ""; }, set value(next) { assert.equal(next, ""); files.length = 0; } };
    handler({ currentTarget: target }); assert.equal(files.length, 0);
  }
  assert.equal(selected.length, 2); assert.deepEqual(selected, [[file], [file]]);
});
test("Requested evidence is named/removable and Remove obeys busy/read/session fences", () => {
  assert.match(claimSource, /responseEvidence\.map\(\(file, index\)/);
  assert.match(claimSource, /<span>{file\.name}<small>/);
  const [source] = callbacks("onClick", text => text.includes("setResponseEvidence(current => current.filter"));
  assert.ok(source);
  for (const [busy, evidenceReading, lease, expected] of [[false, false, {}, 1], [true, false, {}, 2], [false, true, {}, 2], [false, false, null, 2]]) {
    let files = [{ name: "first" }, { name: "second" }];
    execute(source, { busy, evidenceReading, index: 0, claimGuard: { current: { lease: () => lease } }, setResponseEvidence: fn => { files = fn(files); } })();
    assert.equal(files.length, expected); if (expected === 1) assert.equal(files[0].name, "second");
  }
});
test("Messages native file input has a visible keyboard-focus parent outline", () => {
  const css = fs.readFileSync(path.join(root, "components/MessagesClient.module.css"), "utf8");
  assert.match(css, /\.attachButton:focus-within\s*{[^}]*outline:\s*2px solid var\(--action\)/);
});
