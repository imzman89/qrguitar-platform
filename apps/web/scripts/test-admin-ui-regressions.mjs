import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join("") : typeof value === "string" || typeof value === "number" ? String(value) : value && typeof value === "object" ? text(value.props?.children) : "";
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

function hookRuntime() {
  let cursor = 0, dirty = true, mounted = true, tree, Component, props = {};
  const slots = [], pending = [];
  const hooks = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => {
        if (!mounted) return;
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(make, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: make(), deps }; return slots[index].value; },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; },
    useEffect(run, deps) {
      const index = cursor++; slots[index] ??= {};
      if (!same(slots[index].deps, deps)) pending.push(() => { slots[index].cleanup?.(); slots[index].deps = deps; slots[index].cleanup = run(); });
    }
  };
  const runtime = {
    hooks,
    mount(component, initial = {}) { Component = component; props = initial; runtime.render(); },
    render() {
      if (!mounted) return;
      for (let count = 0; count < 40; count++) {
        if (dirty) { dirty = false; cursor = 0; tree = Component(props); }
        pending.splice(0).forEach(run => run());
        if (!dirty) return;
      }
      throw new Error("Effects did not settle");
    },
    async flush() { for (let count = 0; count < 20; count++) { await Promise.resolve(); runtime.render(); } },
    all: () => nodes(tree),
    text: () => text(tree),
    find(predicate) { const result = nodes(tree).find(predicate); assert.ok(result, "Expected rendered element"); return result; },
    button(label) { return runtime.find(node => node.type === "button" && text(node).trim() === label); },
    dispose() { mounted = false; slots.forEach(slot => slot.cleanup?.()); }
  };
  return runtime;
}

function compileTsx(relative, hooks, overrides = {}, bindings = {}) {
  const filename = path.join(web, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  } }).outputText;
  const jsx = (type, props, key) => ({ type, props, key }), module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(bindings), code)(specifier => {
    if (specifier === "react") return hooks;
    if (specifier === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (specifier === "lucide-react") return new Proxy({}, { get: (_target, key) => key });
    return require(specifier);
  }, module, module.exports, ...Object.values(bindings));
  return module.exports;
}

const review = {
  eventId: "event-1", orderId: "order-1", ownerId: "owner-1", holdReason: "refund", reference: "QRG-PAY",
  expectedAmount: 1200, credits: 1, receiptKind: "capture", eventType: "PAYMENT.CAPTURE.REFUNDED",
  providerEventId: "provider-1", eventCursor: 0, resourceKind: "refund", resourceId: "refund-1", refundId: "refund-1",
  disputeId: null, caseId: null, paypalOrderId: "paypal-1", captureId: "capture-1", providerStatus: "COMPLETED",
  amount: 1200, currency: "USD", createdAt: "2026-09-18T12:00:00Z", lastDecision: null
};
const delivery = {
  deliveryId: "delivery-1", state: "retry", eventType: "PAYMENT.CAPTURE.REFUNDED", eventId: "provider-1", cursor: 0,
  totalItems: 1, attemptCount: 2, lastErrorCode: "provider_timeout", nextAttemptAt: "2026-09-18T12:05:00Z",
  lockedUntil: null, receivedAt: "2026-09-18T12:00:00Z", updatedAt: "2026-09-18T12:01:00Z", rawAvailable: false,
  continuationAvailable: true
};

function paymentComponent(relative, name, props) {
  const runtime = hookRuntime();
  const module = compileTsx(relative, runtime.hooks, {
    "next/link": { default: "Link" },
    "../../../components/Nav": { Nav: "Nav" },
    "../../../components/Footer": { Footer: "Footer" },
    "../../../lib/supabase-browser": { createBrowserSupabaseClient: () => ({ auth: {} }) },
    "../../../lib/paypal-admin-reviews-client": { createPayPalAdminReviewsClient() { throw new Error("not mounted"); }, initialPayPalAdminReviewsState: {} },
    "../../../lib/direct-payments-client": { createAdminPaymentsClient() { throw new Error("not mounted"); }, initialAdminPaymentsState: {} },
    "./PayPalReviewQueue": { __esModule: true, default: "PayPalReviewQueue" }
  });
  runtime.mount(module[name], props);
  return runtime;
}

function completeAuditedForm(runtime, outcome) {
  const reason = runtime.find(node => node.type === "textarea");
  const confirmation = runtime.find(node => node.type === "input" && node.props.type === "checkbox");
  reason.props.onChange({ target: { value: "Reviewed provider evidence and ledger state." } });
  confirmation.props.onChange({ target: { checked: true } });
  runtime.render();
  runtime.find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  return runtime.flush().then(() => {
    assert.equal(runtime.find(node => node.type === "textarea").props.value, outcome ? "" : "Reviewed provider evidence and ledger state.");
    assert.equal(runtime.find(node => node.type === "input" && node.props.type === "checkbox").props.checked, !outcome);
    runtime.dispose();
  });
}

for (const outcome of [false, true]) test(`PayPal hold form ${outcome ? "clears" : "retains"} evidence only after a confirmed result`, async () => {
  const runtime = paymentComponent("app/admin/payments/PayPalReviewQueue.tsx", "ReviewHold", { review, busy: false, decide: async () => outcome });
  await completeAuditedForm(runtime, outcome);
});

for (const outcome of [false, true]) test(`PayPal continuation form ${outcome ? "clears" : "retains"} evidence only after a confirmed result`, async () => {
  const runtime = paymentComponent("app/admin/payments/PayPalReviewQueue.tsx", "ReviewDelivery", { delivery, busy: false, retry: async () => outcome, acknowledge: async () => outcome });
  await completeAuditedForm(runtime, outcome);
});

for (const outcome of [false, true]) test(`manual payment review ${outcome ? "clears" : "retains"} evidence only after a confirmed result`, async () => {
  const order = { orderId: "order-1", ownerId: "owner-1", requestId: "request-1", offerKey: "profile_1", method: "paypal", status: "fulfilled",
    reference: "QRG-PAY", offer: { key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, permanent: true, freeAllowance: 25 },
    recipient: { accountKey: "merchant", displayName: "QRguitar", paymentUrl: null, address: null }, createdAt: "2026-09-18T12:00:00Z", payerReference: "customer" };
  const runtime = paymentComponent("app/admin/payments/AdminPaymentsPage.tsx", "ReviewOrder", { order, busy: false, decide: async () => outcome });
  runtime.find(node => node.type === "input" && node.props.type !== "checkbox").props.onChange({ target: { value: "provider-payment-1" } });
  await completeAuditedForm(runtime, outcome);
  if (outcome) assert.equal(runtime.all().find(node => node.type === "input" && node.props.type !== "checkbox")?.props.value || "", "");
});

function renderService(overrides) {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const filename = path.join(web, "app/admin/service-workflow/page.tsx"), source = fs.readFileSync(filename, "utf8");
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), names = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "useState") names.push(node.name.elements[0].name.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  let index = 0;
  const state = { providers: [], submissions: [], search: "", status: "all", phase: "loading", busy: "", message: "", ...overrides };
  const module = { exports: {} }, code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useState(initial) { const name = names[index++]; return [Object.hasOwn(state, name) ? state[name] : typeof initial === "function" ? initial() : initial, () => {}]; } };
    if (specifier === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (specifier.endsWith("/Nav")) return { Nav: () => null };
    if (specifier.endsWith("/Footer")) return { Footer: () => null };
    if (specifier.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => ({ auth: {} }) };
    return require(specifier);
  }, module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

test("Service Operations never turns authorization or network failures into empty queues", () => {
  const denied = renderService({ phase: "unauthorized", message: "This account is not an admin." });
  assert.match(denied, /Admin access required/); assert.match(denied, /Sign in/); assert.match(denied, /Retry access/);
  assert.doesNotMatch(denied, /No provider accounts|No service submissions/);
  const unavailable = renderService({ phase: "error", message: "Network unavailable" });
  assert.match(unavailable, /temporarily unavailable/); assert.match(unavailable, /Try again/);
  assert.doesNotMatch(unavailable, /No provider accounts|No service submissions/);
});

test("Service Operations links private review records to the authenticated editor", () => {
  const submission = { id: "submission-1", status: "submitted", qrCode: "QRG PRIVATE/1", profileTitle: "Private guitar", provider: null,
    ownerUserId: "owner", providerUserId: "provider", serviceDate: "2026-09-18", serviceType: "setup", title: "Setup", workPerformed: "Adjusted action",
    requestedVisibility: "private", evidence: [], activity: [], emailDeliveryStatus: "not_attempted", emailDeliveryMessage: "", resultingServiceEventId: "",
    submittedAt: "2026-09-18T12:00:00Z", updatedAt: "2026-09-18T12:00:00Z" };
  const html = renderService({ phase: "ready", submissions: [submission] });
  assert.match(html, /href="\/edit\/QRG%20PRIVATE%2F1"/); assert.doesNotMatch(html, /href="\/i\//);
});

function promo(code, status = "active") {
  return { id: `${code}-id`, code, name: code, description: "Fixture", status, audience: "everyone", discountType: "percent_off", discountValue: 1000,
    minimumAmount: 0, eligibleOfferKeys: ["profile_1"], startsAt: null, endsAt: null, maxRedemptions: null, maxRedemptionsPerOwner: null,
    revision: 1, createdAt: "2026-09-18T12:00:00Z", updatedAt: "2026-09-18T12:00:00Z", reservedRedemptions: 0, completedRedemptions: 0,
    releasedRedemptions: 0, adjustedRedemptions: 0, grossCapturedAmount: 0 };
}

async function promoPage(t, { post, status = "active" } = {}) {
  const runtime = hookRuntime(), actorA = "actor-a", actorB = "actor-b"; let actor = actorA, observe;
  const auth = { getSession: async () => ({ data: { session: { access_token: `token-${actor}`, user: { id: actor } } } }), onAuthStateChange(callback) { observe = callback; return { data: { subscription: { unsubscribe() {} } } }; } };
  const page = compileTsx("app/admin/promotions/PromoCodesPage.tsx", runtime.hooks, {
    "next/link": { default: "Link" },
    "../../../components/Nav": { Nav: "Nav" },
    "../../../components/Footer": { Footer: "Footer" },
    "../../../lib/supabase-browser": { createBrowserSupabaseClient: () => ({ auth }) },
    "../../../lib/promo-codes": { isOwnerTestPromotion: () => false, promoAdminAuthTransition(previous, next, loaded) { const changed = previous !== undefined && previous !== next; return { actorId: next, resetWorkspace: changed, reload: !loaded || changed }; } }
  }, { window: { setTimeout, clearTimeout }, fetch: async (_url, init = {}) => {
    if (init.method === "POST") return post ? post(init) : Response.json({ ok: true });
    return Response.json({ ok: true, promotions: [promo(actor === actorA ? "ALPHA" : "BRAVO", status)] });
  }, document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  runtime.mount(page.default); await runtime.flush();
  t.after(() => runtime.dispose());
  return { ...runtime, switchActor(next) { actor = next; observe?.("SIGNED_IN", { access_token: `token-${actor}`, user: { id: actor } }); runtime.render(); }, actorB };
}

test("an old promo mutation cannot close or overwrite the next account workspace", async t => {
  let finishPost;
  const pendingPost = new Promise(resolve => { finishPost = resolve; });
  const page = await promoPage(t, { post: () => pendingPost });
  page.button("Pause").props.onClick(); page.render();
  page.switchActor(page.actorB); await page.flush();
  assert.match(page.text(), /BRAVO/); assert.doesNotMatch(page.text(), /ALPHA/);
  finishPost(Response.json({ ok: true })); await page.flush();
  assert.match(page.text(), /BRAVO/); assert.doesNotMatch(page.text(), /Promo settings saved/);
  assert.equal(page.button("Refresh").props.disabled, false);
});

function promoDialog(name, props) {
  const runtime = hookRuntime();
  const module = compileTsx("app/admin/promotions/PromoCodesPage.tsx", runtime.hooks, {
    "next/link": { default: "Link" },
    "../../../components/Nav": { Nav: "Nav" },
    "../../../components/Footer": { Footer: "Footer" },
    "../../../lib/supabase-browser": { createBrowserSupabaseClient: () => ({ auth: {} }) },
    "../../../lib/promo-codes": { isOwnerTestPromotion: () => false, promoAdminAuthTransition() { return {}; } }
  }, { document: { activeElement: null, addEventListener() {}, removeEventListener() {} }, HTMLElement: class {} });
  runtime.mount(module[name], props);
  return runtime;
}

test("promo create, edit, and delete failures remain announced inside their open dialogs", () => {
  const value = { code: "ALPHA", name: "Alpha", description: "Fixture", status: "active", audience: "everyone", discountType: "percent_off",
    discountValue: 1000, minimumAmount: 0, eligibleOfferKeys: ["profile_1"], startsAt: null, endsAt: null, maxRedemptions: null, maxRedemptionsPerOwner: null };
  for (const id of [null, "ALPHA-id"]) {
    const runtime = promoDialog("PromotionEditor", { editing: { id, revision: id ? 1 : null, value }, busy: false,
      error: "Revision conflict. Reload and try again.", onClose() {}, onChange() {}, onSave() {} });
    const dialog = runtime.find(node => node.props?.role === "dialog");
    assert.match(text(dialog), /Revision conflict/);
    assert.ok(nodes(dialog).some(node => node.props?.role === "alert" && node.props?.["aria-live"] === "assertive"));
    runtime.dispose();
  }
  const removal = promoDialog("DeletePromotion", { promotion: promo("ALPHA"), busy: false,
    error: "Deletion failed. Try again.", onClose() {}, onDelete() {} });
  const dialog = removal.find(node => node.props?.role === "dialog");
  assert.match(text(dialog), /Deletion failed/);
  assert.ok(nodes(dialog).some(node => node.props?.role === "alert" && node.props?.["aria-live"] === "assertive"));
  removal.dispose();

  const source = fs.readFileSync(path.join(web, "app/admin/promotions/PromoCodesPage.tsx"), "utf8");
  assert.match(source, /if \(surface === "modal"\) setModalError\(text\)/);
  assert.equal((source.match(/, "modal"\)/g) || []).length, 2);
});

test("deleted promo cards retain Activity and redact a missing operator identity clearly", async t => {
  const page = await promoPage(t, { status: "archived" });
  const checkbox = page.find(node => node.type === "input" && node.props.type === "checkbox");
  checkbox.props.onChange({ target: { checked: true } }); page.render();
  assert.equal(page.button("Activity").props["aria-label"], "View activity for ALPHA");
  const source = fs.readFileSync(path.join(web, "app/admin/promotions/PromoCodesPage.tsx"), "utf8");
  assert.match(source, /operatorEmail \|\| "Deleted admin"/); assert.match(source, /aria-label={`View activity for \$\{promotion\.code\}`}/);
});
