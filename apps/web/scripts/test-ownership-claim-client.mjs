import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let readerMode = "success";
const readers = [];
class FakeFileReader {
  constructor() { readers.push(this); this.result = "data:application/pdf;base64,YQ=="; }
  readAsDataURL() {
    if (readerMode === "throw") throw new Error("Synthetic read failure");
    if (readerMode === "success") queueMicrotask(() => this.onload());
    if (readerMode === "error") queueMicrotask(() => this.onerror());
  }
  abort() { this.aborted = true; this.onabort?.(); }
}
const source = fs.readFileSync(path.join(root, "lib/ownership-claim-client.ts"), "utf8");
const exports = {};
new Function("exports", "FileReader", ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(exports, FakeFileReader);
const { createClaimSessionGuard, ClaimRequestError, StaleClaimRequest, claimReturnPath, serializeClaimBody, confirmedClaimMutation, readClaimEvidence, MAX_CLAIM_EVIDENCE_BYTES } = exports;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(predicate) { for (let i = 0; i < 80 && !predicate(); i++) await tick(); assert.ok(predicate(), "state did not settle"); }
const session = (id) => id ? { access_token: "token-" + id, user: { id } } : null;
const ok = (body = {}) => Response.json({ ok: true, ...body });
const claim = { id: "claim-a", status: "awaiting_owner", profileTitle: "Synthetic", qrCode: "QRG-SYNTH", evidenceCount: 1 };
function harness(options = {}) {
  const h = { session: session("a"), calls: [], authCalls: 0, unsubscribed: false, ...options };
  let listener;
  h.guard = createClaimSessionGuard({ timeoutMs: h.timeoutMs || 1000, auth: () => {
    if (h.constructError) throw new Error("Auth unavailable");
    return { getSession: async () => { h.authCalls++; return h.getSession ? h.getSession() : { data: { session: h.session } }; }, onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { h.unsubscribed = true; } } } }; } };
  }, fetch: async (url, init) => { h.calls.push({ url, ...init }); return h.reply ? h.reply(url, init) : ok({ claims: [claim] }); } });
  h.change = (next) => { h.session = next; listener("TEST", next); };
  h.mount = async () => { await h.guard.start(); return h; };
  return h;
}
let count = 0;
async function test(name, run) { await run(); count++; console.log("PASS " + name); }

await test("signed-out state cannot lease or start a write", async () => {
  const h = await harness({ session: null }).mount(); assert.equal(h.guard.getState().phase, "signed-out"); assert.equal(h.guard.lease(), null); assert.equal(h.guard.beginWrite(), null); assert.equal(h.calls.length, 0); h.guard.dispose();
});
await test("auth construction and rejected session finish with retryable errors", async () => {
  for (const options of [{ constructError: true }, { getSession: async () => { throw new Error("Session rejected"); } }]) {
    const h = await harness(options).mount(); assert.equal(h.guard.getState().phase, "error"); assert.equal(h.guard.beginWrite(), null); assert.equal(h.calls.length, 0); h.guard.dispose();
  }
});
await test("auth deadline ends a non-settling session check", async () => {
  const h = await harness({ timeoutMs: 8, getSession: () => new Promise(() => {}) }).mount(); assert.equal(h.guard.getState().phase, "error"); assert.match(h.guard.getState().error, /timed out/); h.guard.dispose();
});
await test("late initial session cannot replace a newer account event", async () => {
  const gate = deferred(), h = harness({ getSession: () => gate.promise }); const starting = h.guard.start(); await tick(); h.change(session("b")); gate.resolve({ data: { session: session("a") } }); await starting;
  assert.equal(h.guard.getState().actorId, "b"); assert.equal(h.guard.getState().phase, "ready"); h.guard.dispose();
});
await test("token refresh preserves account revision while requests use fresh tokens", async () => {
  const h = await harness().mount(), lease = h.guard.lease(); h.change({ ...session("a"), access_token: "fresh-token" });
  assert.equal(h.guard.isCurrent(lease), true); await h.guard.request(lease, "/api/ownership-claims"); assert.equal(h.calls[0].headers.Authorization, "Bearer fresh-token"); assert.equal(h.calls[0].cache, "no-store"); h.guard.dispose();
});
await test("one write lease excludes duplicate clicks until finished", async () => {
  const h = await harness().mount(), first = h.guard.beginWrite(); assert.ok(first); assert.equal(h.guard.beginWrite(), null); assert.equal(h.guard.getState().busy, true);
  h.guard.finishWrite(first); assert.equal(h.guard.getState().busy, false); assert.ok(h.guard.beginWrite()); h.guard.dispose();
});
await test("finishing an old account operation cannot unlock a new account write", async () => {
  const h = await harness().mount(), old = h.guard.beginWrite(); h.change(session("b")); const next = h.guard.beginWrite(); h.guard.finishWrite(old);
  assert.equal(h.guard.getState().busy, true); h.guard.finishWrite(next); assert.equal(h.guard.getState().busy, false); h.guard.dispose();
});
await test("fresh session catches silent account switches before sending private request data", async () => {
  const h = await harness().mount(), lease = h.guard.beginWrite(); h.session = session("b");
  await assert.rejects(h.guard.request(lease, "/api/ownership-claims", { method: "POST", body: "private-a" }), error => error instanceof StaleClaimRequest);
  assert.equal(h.calls.length, 0); assert.equal(h.guard.getState().actorId, "b"); h.guard.dispose();
});
await test("sign-out aborts a pending response and prevents stale actor hydration", async () => {
  const gate = deferred(), h = await harness({ reply: () => gate.promise }).mount(), lease = h.guard.lease();
  const pending = h.guard.request(lease, "/api/ownership-claims"); const rejected = assert.rejects(pending, error => error instanceof StaleClaimRequest);
  await until(() => h.calls.length === 1); h.change(null); gate.resolve(ok({ claims: [claim] })); await rejected;
  assert.equal(h.calls[0].signal.aborted, true); assert.equal(h.guard.getState().phase, "signed-out"); h.guard.dispose();
});
await test("account change after a write response discards the previous actor's receipt", async () => {
  const h = await harness().mount(), lease = h.guard.beginWrite(); h.reply = async () => { h.session = session("b"); return ok({ claim }); };
  await assert.rejects(h.guard.request(lease, "/api/ownership-claims", { method: "POST" }), error => error instanceof StaleClaimRequest);
  assert.equal(h.calls.length, 1); assert.equal(h.guard.getState().actorId, "b"); h.guard.dispose();
});
await test("transport, invalid JSON, 5xx and unconfirmed successes are uncertain writes", async () => {
  for (const reply of [async () => { throw new Error("Network reply lost"); }, async () => new Response("invalid json"), async () => Response.json({ ok: false }, { status: 503 }), async () => ok({ ok: false })]) {
    const h = await harness({ reply }).mount(), lease = h.guard.beginWrite();
    await assert.rejects(h.guard.request(lease, "/api/ownership-claims", { method: "POST" }), error => error instanceof ClaimRequestError && error.uncertain);
    h.guard.finishWrite(lease); assert.equal(h.guard.getState().busy, false); h.guard.dispose();
  }
});
await test("read outage and confirmed validation rejection are not uncertain writes", async () => {
  for (const method of ["GET", "POST"]) {
    const h = await harness({ reply: async () => Response.json({ ok: false, message: "Unavailable" }, { status: method === "GET" ? 503 : 400 }) }).mount(), lease = h.guard.lease();
    await assert.rejects(h.guard.request(lease, "/api/ownership-claims", { method }), error => error instanceof ClaimRequestError && !error.uncertain); h.guard.dispose();
  }
});
await test("response body parsing deadline aborts and reports an uncertain mutation", async () => {
  const h = await harness({ timeoutMs: 8, reply: async () => ({ status: 201, ok: true, json: () => new Promise(() => {}) }) }).mount();
  const lease = h.guard.beginWrite(); await assert.rejects(h.guard.request(lease, "/api/ownership-claims", { method: "POST" }), error => error instanceof ClaimRequestError && error.uncertain);
  assert.equal(h.calls[0].signal.aborted, true); h.guard.finishWrite(lease); assert.equal(h.guard.getState().busy, false); h.guard.dispose();
});
await test("disposed guard unsubscribes and cannot retain actor or leases", async () => {
  const h = await harness().mount(), lease = h.guard.lease(); h.guard.dispose(); h.change(session("b"));
  assert.equal(h.unsubscribed, true); assert.equal(h.guard.getState().actorId, ""); assert.equal(h.guard.isCurrent(lease), false); assert.equal(h.guard.lease(), null);
});
await test("login return path preserves QR/serial/handoff intent but stays local", () => {
  const result = claimReturnPath(new URLSearchParams({ code: "QRG-A/B", serial: "AB 123", handoff: "buyer-code", next: "https://attacker.invalid", access_token: "private-token" }));
  const url = new URL(result, "https://test.invalid"); assert.equal(url.pathname, "/ownership-claim"); assert.equal(url.searchParams.get("code"), "QRG-A/B"); assert.equal(url.searchParams.get("serial"), "AB 123"); assert.equal(url.searchParams.get("handoff"), "buyer-code"); assert.equal(url.searchParams.has("next"), false); assert.equal(url.searchParams.has("access_token"), false);
  assert.equal(claimReturnPath(new URLSearchParams()), "/ownership-claim");
});
await test("claim bodies enforce UTF-8 upload size without modifying normal content", () => {
  const body = { declaration: "Owned instrument café", evidence: [] }; assert.deepEqual(JSON.parse(serializeClaimBody(body)), body);
  assert.throws(() => serializeClaimBody({ note: "é".repeat(2_100_001) }), error => error instanceof ClaimRequestError && !error.uncertain);
});
await test("all mutation kinds require their actual saved outcome", () => {
  for (const [kind, valid] of [["claim", { claim }], ["evidence", { status: "admin_review" }], ["buyer", { transfer: { id: "transfer-a", status: "accepted" } }]]) {
    confirmedClaimMutation(kind, { ok: true, ...valid });
    for (const invalid of [{ ok: true }, { ok: false, ...valid }, { ok: true, claim: { id: "claim", status: "draft" }, transfer: { id: "transfer", status: "sent" }, status: "awaiting_claimant" }]) assert.throws(() => confirmedClaimMutation(kind, invalid), error => error instanceof ClaimRequestError && error.uncertain);
  }
});
await test("FileReader rejects unsupported/empty/oversized files before opening them", async () => {
  const countBefore = readers.length;
  for (const file of [{ type: "text/html", size: 1 }, { type: "application/pdf", size: 0 }, { type: "image/jpeg", size: 3_000_001 }]) await assert.rejects(readClaimEvidence(file));
  assert.equal(readers.length, countBefore);
});
await test("FileReader success, errors, synchronous failure and deadline all settle", async () => {
  const file = { type: "application/pdf", size: 1 };
  readerMode = "success"; assert.equal(await readClaimEvidence(file), "data:application/pdf;base64,YQ==");
  for (const mode of ["error", "throw", "never"]) { readerMode = mode; await assert.rejects(readClaimEvidence(file, 8)); }
  assert.equal(readers.at(-1).aborted, true); readerMode = "success";
});

const pageSource = fs.readFileSync(path.join(root, "app/ownership-claim/page.tsx"), "utf8");
const ast = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(); let pageEffect;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0].getText(ast).includes("createClaimSessionGuard")) pageEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function compile(code, env, result) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(env), js + "\nreturn " + result)(...Object.values(env));
}
function setters(state) { return Object.fromEntries(Object.keys(state).map(key => ["set" + key[0].toUpperCase() + key.slice(1), value => { state[key] = typeof value === "function" ? value(state[key]) : value; }])); }
function pageHarness(options = {}) {
  const h = harness(options);
  const state = { evidenceReading: false, claimsLoading: false, claimsError: "", signedIn: null, scenarioId: "", identifier: "", acquisitionDetails: "old private narrative", ownershipDeclaration: "", challengeCode: "", evidence: [], claims: [], busy: false, message: "", complete: false, responseClaimId: "", responseEvidence: [], buyerCode: "private-code", buyerOrderReference: "", authError: "" };
  const refs = { claimGuard: { current: null }, reloadClaimsRef: { current: async () => {} }, claimLoadRevision: { current: 0 }, evidenceRead: { current: null } };
  const env = { ...refs, ...setters(state), returnPath: "/ownership-claim?code=QRG-SYNTH&handoff=buyer-code", createClaimSessionGuard: () => h.guard, createBrowserSupabaseClient: () => { throw new Error("Unexpected auth factory use"); } };
  const dispose = compile("const effect = " + pageEffect + ";", env, "effect")();
  return { h, state, refs, env, dispose };
}
await test("page actor changes clear drafts, evidence, codes and previously loaded claims", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  assert.equal(p.state.claims.length, 1); assert.equal(p.state.identifier, "QRG-SYNTH"); assert.equal(p.state.scenarioId, "builder");
  p.state.evidence = [{ private: "file" }]; p.state.buyerCode = "secret-code"; p.state.acquisitionDetails = "private narrative"; p.h.change(null);
  assert.equal(p.state.signedIn, false); assert.deepEqual(p.state.evidence, []); assert.deepEqual(p.state.claims, []); assert.equal(p.state.buyerCode, ""); assert.equal(p.state.acquisitionDetails, ""); p.dispose();
});
await test("page keeps real empty claims distinct from list outage or malformed response", async () => {
  for (const reply of [async () => ok({ claims: [] }), async () => Response.json({ ok: false, message: "Claims unavailable" }, { status: 503 }), async () => ok({ claims: [{ id: "incomplete" }] })]) {
    const p = pageHarness({ reply }); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
    const payload = await reply().then(response => response.json());
    assert.equal(Boolean(p.state.claimsError), !(payload.ok && payload.claims?.length === 0)); assert.deepEqual(p.state.claims, []); p.dispose();
  }
});
await test("page rejects old-account list completion while loading the next account", async () => {
  const gate = deferred(); const p = pageHarness({ reply: (_url, init) => init.headers.Authorization === "Bearer token-a" ? gate.promise : ok({ claims: [{ ...claim, id: "claim-b" }] }) });
  await until(() => p.h.calls.length === 1); p.h.change(session("b")); gate.resolve(ok({ claims: [claim] })); await until(() => p.state.claims[0]?.id === "claim-b");
  assert.deepEqual(p.state.claims.map(item => item.id), ["claim-b"]); p.dispose();
});
await test("page ignores FileReader completion after sign-out and releases reading state", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading); const gate = deferred();
  const collect = compile(functions.get("collectEvidence"), { ...p.env, ...p.state, MAX_CLAIM_EVIDENCE_BYTES, readClaimEvidence: () => gate.promise, needsChallenge: true }, "collectEvidence");
  const pending = collect([{ name: "private.pdf", type: "application/pdf", size: 1 }], false); assert.equal(p.state.evidenceReading, true);
  p.h.change(null); gate.resolve("data:application/pdf;base64,YQ=="); await pending;
  assert.deepEqual(p.state.evidence, []); assert.equal(p.state.evidenceReading, false); p.dispose();
});
await test("page rejects excess files and combined bytes without starting FileReader", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading); let reads = 0;
  const collect = compile(functions.get("collectEvidence"), { ...p.env, ...p.state, MAX_CLAIM_EVIDENCE_BYTES, readClaimEvidence: async () => { reads++; return "data"; }, needsChallenge: false }, "collectEvidence");
  await collect(Array.from({ length: 4 }, () => ({ name: "file.pdf", type: "application/pdf", size: 1 })), false);
  assert.match(p.state.message, /three/); await collect([{ size: 2_000_000 }, { size: 2_000_000 }], false); assert.match(p.state.message, /3 MB/); assert.equal(reads, 0); p.dispose();
});
await test("page unknown write outcome warns without marking complete and releases its lock", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading); p.h.reply = async () => { throw new Error("Network reply lost"); };
  const write = compile(functions.get("writeClaim"), { ...p.env, ClaimRequestError, serializeClaimBody, confirmedClaimMutation }, "writeClaim");
  await write("/api/ownership-claims", "POST", { evidence: [] }, "claim", () => { p.state.complete = true; });
  assert.equal(p.state.complete, false); assert.equal(p.state.busy, false); assert.match(p.state.message, /may already be saved/); p.dispose();
});
await test("page applies only a verified successful mutation receipt once", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading); const gate = deferred(); p.h.reply = () => gate.promise;
  const write = compile(functions.get("writeClaim"), { ...p.env, ClaimRequestError, serializeClaimBody, confirmedClaimMutation }, "writeClaim"); let confirmed = 0;
  const saving = write("/api/ownership-claims", "POST", {}, "claim", () => confirmed++);
  await until(() => p.h.calls.length === 2); await write("/api/ownership-claims", "POST", {}, "claim", () => confirmed++); assert.equal(p.h.calls.length, 2);
  gate.resolve(ok({ claim })); await saving; assert.equal(confirmed, 1); assert.equal(p.state.busy, false); p.dispose();
});
await test("signed-out page renders login return intent without private controls or claim records", () => {
  const params = new URLSearchParams({ code: "QRG-SYNTH", handoff: "buyer-code" }); let index = 0;
  const empty = () => null;
  const Component = compile(functions.get("OwnershipClaimContent"), { React, useSiteContent: () => ({}), useSearchParams: () => params, claimReturnPath, useRef: value => ({ current: value }), useMemo: fn => fn(), useEffect() {}, useState: initial => [index++ === 4 ? false : typeof initial === "function" ? initial() : initial, () => {}], scenarioDefinitions: [], statusSteps: [], getContentValue: (_, key) => key,
    Nav: empty, Footer: empty, ShieldCheck: empty, Link: ({ children, ...props }) => React.createElement("a", props, children)
  }, "OwnershipClaimContent");
  const html = renderToStaticMarkup(React.createElement(Component));
  assert.match(html, /next=%2Fownership-claim%3Fcode%3DQRG-SYNTH%26handoff%3Dbuyer-code/); assert.doesNotMatch(html, /type="file"|Accept handoff|Submit for review/);
});
console.log(`${count} ownership claim client cases passed.`);
