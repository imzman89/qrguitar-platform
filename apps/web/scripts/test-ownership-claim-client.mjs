import { withUiTextTestContext } from "./ui-text-test-context.mjs";
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
const { createClaimSessionGuard, ClaimRequestError, StaleClaimRequest, claimReturnPath, claimLinkId, visibleClaimRequests, serializeClaimBody, confirmedClaimMutation, readClaimEvidence, MAX_CLAIM_EVIDENCE_BYTES } = exports;
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
  h.change = (next, event = "TEST") => { h.session = next; listener(event, next); };
  h.emit = (event, next) => listener(event, next);
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
await test("uncertain server errors expose only a validated claim UUID", async () => {
  const valid = "11111111-1111-4111-8111-111111111111";
  for (const [claimId, expected] of [[valid.toUpperCase(), valid], ["claim-fixture", ""], ["22222222-2222-2222-2222-222222222222", ""], [null, ""]]) {
    const h = await harness({ reply: async () => Response.json({ ok: false, uncertain: true, message: "Saved but unconfirmed", claimId, privateEvidence: "must-not-escape" }, { status: 503 }) }).mount();
    const lease = h.guard.beginWrite(); let error;
    try { await h.guard.request(lease, "/api/ownership-claims", { method: "PATCH" }); } catch (caught) { error = caught; }
    assert.ok(error instanceof ClaimRequestError); assert.equal(error.claimId, expected); assert.equal("privateEvidence" in error, false);
    h.guard.finishWrite(lease); h.guard.dispose();
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
const canWithdrawClaim = compile(functions.get("canWithdrawClaim"), {}, "canWithdrawClaim");
const canCompleteClaimSubmission = compile(functions.get("canCompleteClaimSubmission"), {}, "canCompleteClaimSubmission");
const claimSubmissionIncomplete = compile(functions.get("claimSubmissionIncomplete"), {}, "claimSubmissionIncomplete");
const canonicalClaimQrIdentifier = compile(functions.get("canonicalClaimQrIdentifier"), {}, "canonicalClaimQrIdentifier");
const claimHasRecoverableSubmission = compile(functions.get("claimHasRecoverableSubmission"), { canCompleteClaimSubmission }, "claimHasRecoverableSubmission");
function compile(code, env, result) {
  const { useUiText } = withUiTextTestContext(() => { throw new Error("Unexpected module"); })("UiTextProvider");
  env = { useUiText, ui: useUiText("app.ownership.claim.page"), ...env };
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(env), js + "\nreturn " + result)(...Object.values(env));
}
function setters(state) { return Object.fromEntries(Object.keys(state).map(key => ["set" + key[0].toUpperCase() + key.slice(1), value => { state[key] = typeof value === "function" ? value(state[key]) : value; }])); }
function pageHarness(options = {}) {
  const h = harness(options);
  const state = { evidenceReading: false, claimsLoading: false, claimsError: "", signedIn: null, scenarioId: "", identifier: "", acquisitionDetails: "old private narrative", ownershipDeclaration: "", challengeCode: "", evidence: [], claims: [], busy: false, message: "", complete: false, responseClaimId: "", responseEvidence: [], buyerCode: "private-code", buyerOrderReference: "", authError: "", withdrawClaimId: "", withdrawNotice: null, reviewNotice: null, completionNotice: null };
  const refs = { focusedClaim: { current: "" }, claimGuard: { current: null }, reloadClaimsRef: { current: async () => {} }, claimLoadRevision: { current: 0 }, evidenceRead: { current: null } };
  const env = { ...refs, ...setters(state), returnPath: "/ownership-claim?code=QRG-SYNTH&handoff=buyer-code", createClaimSessionGuard: () => h.guard, createBrowserSupabaseClient: () => { throw new Error("Unexpected auth factory use"); } };
  const dispose = compile("const effect = " + pageEffect + ";", env, "effect")();
  return { h, state, refs, env, dispose };
}
await test("page actor changes clear drafts, evidence, codes and previously loaded claims", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  assert.equal(p.state.claims.length, 1); assert.equal(p.state.identifier, "QRG-SYNTH"); assert.equal(p.state.scenarioId, "builder");
  p.state.evidence = [{ private: "file" }]; p.state.buyerCode = "secret-code"; p.state.acquisitionDetails = "private narrative"; p.state.completionNotice = { id: claim.id, text: "private completion", error: false }; p.h.change(null);
  assert.equal(p.state.signedIn, false); assert.deepEqual(p.state.evidence, []); assert.deepEqual(p.state.claims, []); assert.equal(p.state.buyerCode, ""); assert.equal(p.state.acquisitionDetails, ""); assert.equal(p.state.completionNotice, null); p.dispose();
});
await test("page keeps real empty claims distinct from list outage or malformed response", async () => {
  for (const reply of [async () => ok({ claims: [] }), async () => Response.json({ ok: false, message: "Claims unavailable" }, { status: 503 }), async () => ok({ claims: [{ id: "incomplete" }] }), async () => ok({ claims: [{ ...claim, canCompleteSubmission: "true", submissionComplete: false }] }), async () => ok({ claims: [{ ...claim, canCompleteSubmission: true }] })]) {
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
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
  await write("/api/ownership-claims", "POST", { evidence: [] }, "claim", () => { p.state.complete = true; });
  assert.equal(p.state.complete, false); assert.equal(p.state.busy, false); assert.match(p.state.message, /may already be saved/); p.dispose();
});
await test("uncertain claim POST discovers the saved request and suppresses duplicate form submission", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  const recovered = { ...claim, id: "claim-recovered", canWithdraw: true, canCompleteSubmission: true, submissionComplete: false };
  p.state.evidence = [{ name: "private.pdf" }];
  p.h.reply = async (_url, init) => {
    if (init.method === "POST") throw new Error("Lost final acknowledgement");
    return ok({ claims: [claim, recovered] });
  };
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
  await write("/api/ownership-claims", "POST", { identifier: "QRG-SYNTH", evidence: p.state.evidence }, "claim", () => assert.fail("uncertain POST must not use its missing receipt"));
  assert.equal(p.h.calls.filter(call => call.method === "POST").length, 1);
  assert.equal(p.h.calls.filter(call => !call.method).length, 2);
  assert.equal(p.state.complete, true); assert.deepEqual(p.state.evidence, []); assert.equal(p.state.claims.some(item => item.id === recovered.id), true);
  assert.match(p.state.message, /Do not submit another request/); assert.match(p.state.message, /Finish submitting/); assert.equal(p.state.busy, false); p.dispose();
});
await test("authoritative error claimId recovers the exact saved request even from a serial lookup", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  const exactId = "11111111-1111-4111-8111-111111111111";
  const recovered = { ...claim, id: exactId, qrCode: "QRG-EXACT", canCompleteSubmission: true, submissionComplete: false };
  p.h.reply = async (_url, init) => init.method === "POST"
    ? Response.json({ ok: false, uncertain: true, message: "Saved but completion failed", claimId: exactId, ignoredPrivate: "never expose" }, { status: 503 })
    : ok({ claims: [claim, recovered] });
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
  await write("/api/ownership-claims", "POST", { identifier: "SERIAL-ONLY" }, "claim", () => assert.fail("uncertain response must reconcile through GET"));
  assert.equal(p.state.complete, true); assert.equal(p.state.claims.some(item => item.id === exactId), true); assert.doesNotMatch(p.state.message, /ignoredPrivate|never expose/); p.dispose();
});

await test("authoritative partial save preserves the local evidence and declarations", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  const exactId = "11111111-1111-4111-8111-111111111111";
  const partial = { ...claim, id: exactId, canWithdraw: true, canCompleteSubmission: false, submissionComplete: false };
  p.state.evidence = [{ name: "private.pdf", dataUrl: "private-data", bytes: 12, type: "ownership_document" }];
  p.state.acquisitionDetails = "private acquisition"; p.state.ownershipDeclaration = "private declaration"; p.state.challengeCode = "ABC234";
  p.h.reply = async (_url, init) => init.method === "POST"
    ? Response.json({ ok: false, uncertain: true, message: "Only part of the request was saved", claimId: exactId }, { status: 503 })
    : ok({ claims: [claim, partial] });
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
  await write("/api/ownership-claims", "POST", { identifier: "QRG-SYNTH", evidence: p.state.evidence }, "claim", () => assert.fail("partial save must not confirm"));
  assert.equal(p.state.complete, false); assert.equal(p.state.evidence.length, 1); assert.equal(p.state.evidence[0].dataUrl, "private-data");
  assert.equal(p.state.acquisitionDetails, "private acquisition"); assert.equal(p.state.ownershipDeclaration, "private declaration"); assert.equal(p.state.challengeCode, "ABC234");
  assert.match(p.state.message, /partial request was saved/); assert.match(p.state.message, /local files and declarations remain/); assert.match(p.state.message, /will not replay/); p.dispose();
});

await test("QR fallback does not recover an owner-side incoming claim with the same code", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  const ownerSide = { ...claim, id: "owner-side", qrCode: "QRG-SYNTH", canWithdraw: false, canReview: true, canCompleteSubmission: true, submissionComplete: false };
  p.state.evidence = [{ name: "private.pdf", dataUrl: "private-data", bytes: 12, type: "ownership_document" }];
  p.state.ownershipDeclaration = "private declaration";
  p.h.reply = async (_url, init) => init.method === "POST" ? Promise.reject(new Error("No response")) : ok({ claims: [claim, ownerSide] });
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
  await write("/api/ownership-claims", "POST", { identifier: "QRG-SYNTH", evidence: p.state.evidence }, "claim", () => assert.fail("owner-side match must not confirm"));
  assert.equal(p.state.complete, false); assert.equal(p.state.evidence.length, 1); assert.equal(p.state.ownershipDeclaration, "private declaration");
  assert.match(p.state.message, /may already be saved/); assert.doesNotMatch(p.state.message, /Do not submit another request/); p.dispose();
});

await test("uncertain POST never guesses an unrelated, ambiguous, or serial-only new request", async () => {
  const cases = [
    { identifier: "QRG-SYNTH", rows: [{ ...claim, id: "other-a", qrCode: "QRG-OTHER" }] },
    { identifier: "SERIAL-ONLY", rows: [{ ...claim, id: "other-b", qrCode: "QRG-SYNTH" }] },
    { identifier: "QRG-SYNTH", rows: [{ ...claim, id: "other-c", qrCode: "QRG-SYNTH" }, { ...claim, id: "other-d", qrCode: "QRG-SYNTH" }] }
  ];
  for (const example of cases) {
    const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading);
    p.h.reply = async (_url, init) => {
      if (init.method === "POST") throw new Error("No response");
      return ok({ claims: [claim, ...example.rows] });
    };
    const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim");
    await write("/api/ownership-claims", "POST", { identifier: example.identifier }, "claim", () => assert.fail("uncertain response must not confirm"));
    assert.equal(p.state.complete, false); assert.match(p.state.message, /may already be saved/); assert.equal(p.h.calls.filter(call => call.method === "POST").length, 1); p.dispose();
  }
});
await test("page applies only a verified successful mutation receipt once", async () => {
  const p = pageHarness(); await until(() => p.state.signedIn === true && !p.state.claimsLoading); const gate = deferred(); p.h.reply = () => gate.promise;
  const write = compile(functions.get("writeClaim"), { ...p.env, ...p.state, ClaimRequestError, serializeClaimBody, confirmedClaimMutation, canonicalClaimQrIdentifier, claimHasRecoverableSubmission }, "writeClaim"); let confirmed = 0;
  const saving = write("/api/ownership-claims", "POST", {}, "claim", () => confirmed++);
  await until(() => p.h.calls.length === 2); await write("/api/ownership-claims", "POST", {}, "claim", () => confirmed++); assert.equal(p.h.calls.length, 2);
  gate.resolve(ok({ claim })); await saving; assert.equal(confirmed, 1); assert.equal(p.state.busy, false); p.dispose();
});
await test("signed-out page renders login return intent without private controls or claim records", () => {
  const params = new URLSearchParams({ code: "QRG-SYNTH", handoff: "buyer-code" }); let index = 0;
  const empty = () => null;
  const Component = compile(functions.get("OwnershipClaimContent"), { React, workflow: { claims: "claims-workspace" }, useSiteContent: () => ({}), useSearchParams: () => params, claimReturnPath, claimLinkId, visibleClaimRequests, ClaimOwnerReview: () => null, useRef: value => ({ current: value }), useMemo: fn => fn(), useEffect() {}, useState: initial => [index++ === 4 ? false : typeof initial === "function" ? initial() : initial, () => {}], scenarioDefinitions: [], statusSteps: [], getContentValue: (_, key) => key,
    Nav: empty, Footer: empty, ShieldCheck: empty, Link: ({ children, ...props }) => React.createElement("a", props, children)
  }, "OwnershipClaimContent");
  const html = renderToStaticMarkup(React.createElement(Component));
  assert.match(html, /next=%2Fownership-claim%3Fcode%3DQRG-SYNTH%26handoff%3Dbuyer-code/); assert.doesNotMatch(html, /type="file"|Accept handoff|Submit for review/);
});

function claimChooserHarness(search = "", savedClaims = [], notice = null, completionNotice = null, busy = false) {
  const empty = () => null;
  const icons = Object.fromEntries(["ArrowLeft", "Check", "FileCheck2", "Gift", "Handshake", "PackageCheck", "ShieldCheck", "Store", "Wrench", "X"].map(name => [name, empty]));
  const definition = ast.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find(item => item.name.getText(ast) === "scenarioDefinitions");
  const actualScenarios = compile("const scenarioDefinitions = " + definition.initializer.getText(ast), icons, "scenarioDefinitions");
  const params = new URLSearchParams(search);
  const values = [], refs = [], frames = [], focused = [];
  let currentTree;
  let stateIndex = 0, refIndex = 0;
  const Component = compile(functions.get("OwnershipClaimContent"), {
    React, ...icons, workflow: { claims: "claims-workspace" }, useSiteContent: () => ({}), useSearchParams: () => params, claimReturnPath, claimLinkId, visibleClaimRequests, ClaimOwnerReview: () => null,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = index === 4 ? true : index === 11 ? savedClaims : index === 12 ? busy : index === 20 ? notice : index === 22 ? completionNotice : typeof initial === "function" ? initial() : initial;
      return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useMemo: fn => fn(), useEffect() {}, scenarioDefinitions: actualScenarios, statusSteps: ["submitted", "awaiting_owner", "admin_review", "approved"], getContentValue: (_, key) => key, canWithdrawClaim, canCompleteClaimSubmission, claimSubmissionIncomplete, claimStatusLabel: status => status,
    createChallengeCode: () => "ABC234", window: { requestAnimationFrame(callback) { frames.push(callback); } },
    document: { getElementById(id) { const node = claimElements(currentTree, item => item.props.id === id)[0]; return node ? { focus() { focused.push(id); }, scrollIntoView() {}, querySelector(selector) { assert.equal(selector, "button"); return claimElements(node, item => item.type === "button").length ? { focus() { focused.push(id + " button"); } } : null; } } : null; } },
    Nav: empty, Footer: empty, Link: ({ children, ...props }) => React.createElement("a", props, children)
  }, "OwnershipClaimContent");
  return { focused, flushFrames() { while (frames.length) frames.shift()(); }, render() { stateIndex = 0; refIndex = 0; return currentTree = Component(); } };
}
function claimElements(tree, predicate) {
  if (!React.isValidElement(tree)) return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => claimElements(child, predicate))];
}
const situationButtons = tree => claimElements(tree, node => node.type === "button" && String(node.props.className).includes("claim-scenario-card"));
const changeSituation = tree => claimElements(tree, node => node.type === "button" && renderToStaticMarkup(node).includes("Change situation"))[0];
await test("choosing a situation focuses the relevant form and Change situation restores all choices", () => {
  const ui = claimChooserHarness("code=QRG-SYNTH");
  let tree = ui.render();
  assert.equal(situationButtons(tree).length, 6);
  assert.equal(claimElements(tree, node => node.type === "form").length, 0);
  situationButtons(tree)[0].props.onClick();
  tree = ui.render();
  assert.equal(situationButtons(tree).length, 0, "selected flow must not retain six cards above the form");
  assert.equal(claimElements(tree, node => node.type === "form").length, 1);
  let html = renderToStaticMarkup(tree);
  assert.match(html, /claimCenter.scenarios.store.title/);
  assert.match(html, /Private buyer handoff/);
  assert.match(html, /Submit for review/);
  ui.flushFrames();
  assert.equal(ui.focused.at(-1), "claim-workspace-heading");
  assert.match(html, /value="QRG-SYNTH"/);
  const acquisition = claimElements(tree, node => node.type === "textarea" && node.props.maxLength === 3000)[0];
  acquisition.props.onChange({ target: { value: "Purchased in September" } });
  changeSituation(tree).props.onClick();
  tree = ui.render();
  assert.equal(situationButtons(tree).length, 6);
  assert.equal(claimElements(tree, node => node.type === "form").length, 0);
  assert.equal(changeSituation(tree), undefined);
  ui.flushFrames();
  assert.equal(ui.focused.at(-1), "claim-situations button");
  situationButtons(tree)[5].props.onClick();
  tree = ui.render();
  html = renderToStaticMarkup(tree);
  assert.equal(situationButtons(tree).length, 0);
  assert.match(html, /claimCenter.scenarios.legacy.title/);
  assert.match(html, /Private possession challenge/);
  assert.match(html, /ABC234/);
  assert.match(html, /Purchased in September/);
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /Private buyer handoff code/);
});
await test("buyer-code deep links open the selected handoff without an extra situation chooser", () => {
  const ui = claimChooserHarness("code=QRG-SYNTH&handoff=buyer-code");
  const tree = ui.render(), html = renderToStaticMarkup(tree);
  assert.equal(situationButtons(tree).length, 0);
  assert.match(html, /claimCenter.scenarios.builder.title/);
  assert.match(html, /Private buyer handoff code/);
  assert.match(html, /Order reference supplied by the seller/);
  assert.ok(changeSituation(tree));
});

await test("completion recovery renders only an explicit incomplete capability and explains saved-file reuse", () => {
  const eligible = { ...claim, canCompleteSubmission: true, submissionComplete: false };
  const tree = claimChooserHarness("", [eligible]).render();
  const buttons = claimElements(tree, node => node.type === "button" && node.props.id === "complete-submission-claim-a");
  assert.equal(buttons.length, 1); assert.equal(buttons[0].props.disabled, false); assert.equal(buttons[0].props.style.minHeight, 44);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Submission incomplete/); assert.match(html, /Finish submitting/); assert.match(html, /evidence files are already saved and will be reused/); assert.match(html, /do not need to upload them again/);
  const currentSteps = claimElements(tree, node => node.type === "li" && node.props.className === "is-current");
  assert.equal(currentSteps.length, 1); assert.match(renderToStaticMarkup(currentSteps[0]), /saved, not submitted/); assert.doesNotMatch(renderToStaticMarkup(currentSteps[0]), /awaiting owner/);
  assert.doesNotMatch(html, /complete_submission|type="file"/);
  for (const visibleIncomplete of [
    { ...claim, status: "awaiting_owner", canCompleteSubmission: false, submissionComplete: false },
    { ...claim, status: "admin_review", submissionComplete: false }
  ]) {
    const incompleteTree = claimChooserHarness("", [visibleIncomplete]).render();
    const incompleteHtml = renderToStaticMarkup(incompleteTree);
    assert.match(incompleteHtml, /Submission incomplete/); assert.match(incompleteHtml, /saved, not submitted/);
    assert.doesNotMatch(incompleteHtml, /Finish submitting/);
  }
  for (const preserved of [
    { ...claim, status: "awaiting_owner" },
    { ...claim, status: "cancelled", submissionComplete: false },
    { ...claim, status: "approved", submissionComplete: true }
  ]) {
    const preservedHtml = renderToStaticMarkup(claimChooserHarness("", [preserved]).render());
    assert.doesNotMatch(preservedHtml, /Submission incomplete|saved, not submitted|Finish submitting/);
  }
  const busyTree = claimChooserHarness("", [eligible], null, null, true).render();
  assert.equal(claimElements(busyTree, node => node.props.id === "complete-submission-claim-a")[0].props.disabled, true);
  for (const capability of [
    {},
    { canCompleteSubmission: false, submissionComplete: false },
    { canCompleteSubmission: true, submissionComplete: true },
    { canCompleteSubmission: "true", submissionComplete: false },
    { canCompleteSubmission: true }
  ]) {
    const candidate = { ...claim, ...capability };
    assert.equal(canCompleteClaimSubmission(candidate), false);
    assert.equal(claimElements(claimChooserHarness("", [candidate]).render(), node => node.props.id === "complete-submission-claim-a").length, 0);
  }
});

async function completionHarness() {
  const incomplete = { ...claim, canCompleteSubmission: true, submissionComplete: false };
  const p = pageHarness({ reply: async () => ok({ claims: [incomplete] }) });
  await until(() => p.state.signedIn === true && !p.state.claimsLoading);
  p.focused = [];
  p.finish = () => compile(functions.get("completeSubmission"), {
    ...p.env, ...p.state, canCompleteClaimSubmission, serializeClaimBody, ClaimRequestError,
    window: { requestAnimationFrame: fn => fn() },
    document: { getElementById: id => ({ focus: () => p.focused.push(id) }) }
  }, "completeSubmission")(claim.id);
  return { p, incomplete };
}

await test("Finish submitting writes once, stays busy, and succeeds only after authoritative GET", async () => {
  const { p, incomplete } = await completionHarness();
  const gate = deferred(); let completed = false;
  p.h.reply = async (_url, init) => {
    if (init.method === "PATCH") { await gate.promise; completed = true; return ok({ submissionComplete: true }); }
    return ok({ claims: [{ ...incomplete, evidenceCount: 1, canCompleteSubmission: !completed, submissionComplete: completed }] });
  };
  const pending = p.finish(); await until(() => p.h.calls.some(call => call.method === "PATCH"));
  assert.equal(p.state.busy, true); await p.finish();
  assert.equal(p.h.calls.filter(call => call.method === "PATCH").length, 1);
  gate.resolve(); assert.equal(await pending, true);
  const patch = p.h.calls.find(call => call.method === "PATCH");
  assert.equal(patch.url, "/api/ownership-claims"); assert.deepEqual(JSON.parse(patch.body), { id: claim.id, action: "complete_submission" });
  assert.equal(patch.headers.Authorization, "Bearer token-a");
  assert.equal(p.h.calls.filter(call => !call.method).length, 2); assert.ok(p.h.calls.filter(call => !call.method).every(call => call.body === undefined));
  assert.equal(p.state.claims[0].submissionComplete, true); assert.equal(p.state.claims[0].evidenceCount, 1);
  assert.equal(p.state.completionNotice.error, false); assert.match(p.state.completionNotice.text, /Submission is confirmed/);
  assert.equal(p.state.busy, false); assert.equal(p.focused.at(-1), "completion-status-claim-a"); p.dispose();
});

await test("lost completion reply reconciles by GET without replaying the mutation", async () => {
  const { p, incomplete } = await completionHarness(); let writes = 0;
  p.h.reply = async (_url, init) => {
    if (init.method === "PATCH") { writes++; throw new Error("Lost response"); }
    return ok({ claims: [{ ...incomplete, canCompleteSubmission: false, submissionComplete: true }] });
  };
  assert.equal(await p.finish(), true); assert.equal(writes, 1);
  assert.equal(p.state.completionNotice.error, false); assert.equal(p.state.claims[0].submissionComplete, true); p.dispose();
});

await test("PATCH receipt alone never claims completion when GET is incomplete or unavailable", async () => {
  for (const readFails of [false, true]) {
    const { p, incomplete } = await completionHarness();
    p.h.reply = async (_url, init) => init.method === "PATCH"
      ? ok({ submissionComplete: true })
      : readFails ? Response.json({ ok: false, message: "Read unavailable" }, { status: 503 }) : ok({ claims: [incomplete] });
    assert.equal(await p.finish(), false); assert.equal(p.state.completionNotice.error, true);
    assert.match(p.state.completionNotice.text, readFails ? /could not be loaded/ : /not yet confirmed complete/);
    assert.equal(Boolean(p.state.claimsError), readFails); assert.equal(p.state.busy, false); p.dispose();
  }
});

await test("completion capability and late replies cannot cross an account revision", async () => {
  const { p } = await completionHarness(); const gate = deferred();
  p.h.reply = async (_url, init) => init.method === "PATCH" ? gate.promise : ok({ claims: [] });
  const pending = p.finish(); await until(() => p.h.calls.some(call => call.method === "PATCH"));
  p.h.change(null); gate.resolve(ok({ submissionComplete: true }));
  assert.equal(await pending, false); assert.deepEqual(p.state.claims, []); assert.equal(p.state.completionNotice, null); assert.equal(p.state.signedIn, false); p.dispose();
});
await test("withdrawal eligibility requires an explicit server capability and an open state", () => {
  for (const status of ['awaiting_claimant','awaiting_owner','admin_review','approved','denied','expired','cancelled']) {
    for (const canWithdraw of [true,false,undefined,'true']) {
      const expected = canWithdraw === true && ['awaiting_claimant','awaiting_owner','admin_review'].includes(status);
      const tree = claimChooserHarness('', [{...claim,status,canWithdraw}]).render();
      const actions = claimElements(tree, node => node.type === 'button' && node.props.id === 'withdraw-request-claim-a');
      assert.equal(actions.length, expected ? 1 : 0);
    }
  }
});

await test("withdraw confirmation states consequences, defaults focus to Keep, and Keep makes no mutation", () => {
  const ui = claimChooserHarness('', [{...claim,canWithdraw:true}]);
  const button = (tree, label) => claimElements(tree, node => node.type === 'button' && renderToStaticMarkup(node).includes(label))[0];
  button(ui.render(),'Withdraw request').props.onClick();
  const confirmation = ui.render(), html = renderToStaticMarkup(confirmation);
  assert.match(html,/Ownership and submitted evidence stay unchanged/);assert.match(html,/cannot be reopened/);
  ui.flushFrames();assert.equal(ui.focused.at(-1),'keep-request-claim-a');
  button(confirmation,'Keep request').props.onClick();
  assert.doesNotMatch(renderToStaticMarkup(ui.render()),/Yes, withdraw request/);
  ui.flushFrames();assert.equal(ui.focused.at(-1),'withdraw-request-claim-a');
});

async function withdrawalHarness() {
  const p=pageHarness({reply:async()=>ok({claims:[{...claim,canWithdraw:true}]})});
  await until(()=>p.state.signedIn===true&&!p.state.claimsLoading);p.state.withdrawClaimId=claim.id;
  p.focused=[];
  p.withdraw=()=>compile(functions.get('withdrawRequest'),{...p.env,...p.state,canWithdrawClaim,serializeClaimBody,window:{requestAnimationFrame:fn=>fn()},document:{getElementById:id=>({focus:()=>p.focused.push(id)})}},'withdrawRequest')(claim.id);
  return p;
}
await test("withdraw sends authenticated cancel once, waits for authoritative status and preserves evidence", async()=>{
  const p=await withdrawalHarness(),gate=deferred();let cancelled=false;
  p.h.reply=async(_url,init)=>{if(init.method==='PATCH'){await gate.promise;cancelled=true;return ok({message:'cancelled'});}return ok({claims:[{...claim,canWithdraw:!cancelled,status:cancelled?'cancelled':'awaiting_owner'}]});};
  const pending=p.withdraw();await until(()=>p.h.calls.some(c=>c.method==='PATCH'));
  assert.equal(p.state.busy,true);assert.equal(p.state.claims[0].status,'awaiting_owner');await p.withdraw();
  assert.equal(p.h.calls.filter(c=>c.method==='PATCH').length,1);gate.resolve();await pending;
  const patch=p.h.calls.find(c=>c.method==='PATCH');assert.deepEqual(JSON.parse(patch.body),{id:claim.id,action:'cancel'});assert.equal(patch.headers.Authorization,'Bearer token-a');
  assert.equal(p.state.claims[0].status,'cancelled');assert.equal(p.state.claims[0].evidenceCount,claim.evidenceCount);assert.equal(p.state.withdrawNotice.error,false);assert.equal(p.state.busy,false);assert.equal(p.focused.at(-1),'withdraw-status-claim-a');p.dispose();
});
await test("closed409 refreshes saved status without claiming successful withdrawal",async()=>{
  const p=await withdrawalHarness();p.h.reply=async(_url,init)=>init.method==='PATCH'?Response.json({ok:false,message:'Already closed'},{status:409}):ok({claims:[{...claim,status:'approved',canWithdraw:false}]});
  await p.withdraw();assert.equal(p.state.claims[0].status,'approved');assert.equal(p.state.withdrawNotice.error,true);assert.match(p.state.withdrawNotice.text,/changed/);assert.equal(p.state.busy,false);p.dispose();
});
await test("uncertain withdrawal is resolved by GET, while failed refresh blocks further writes",async()=>{
  for(const refreshFails of [false,true]){const p=await withdrawalHarness();p.h.reply=async(_url,init)=>{if(init.method==='PATCH')throw Error('Lost reply');return refreshFails?Response.json({ok:false,message:'Read failed'},{status:503}):ok({claims:[{...claim,status:'cancelled',canWithdraw:false}]});};
    await p.withdraw();assert.equal(p.state.withdrawNotice.error,refreshFails);assert.equal(Boolean(p.state.claimsError),refreshFails);const count=p.h.calls.length;await p.withdraw();assert.equal(p.h.calls.length,count);assert.equal(p.state.busy,false);p.dispose();}
});
await test("withdrawal cannot run without confirmation or apply a late response after sign-out",async()=>{
  const p=await withdrawalHarness();p.state.withdrawClaimId='';const before=p.h.calls.length;await p.withdraw();assert.equal(p.h.calls.length,before);
  p.state.withdrawClaimId=claim.id;const gate=deferred();p.h.reply=()=>gate.promise;const pending=p.withdraw();await until(()=>p.h.calls.length>before);p.h.change(null);gate.resolve(ok());await pending;
  assert.deepEqual(p.state.claims,[]);assert.equal(p.state.withdrawClaimId,'');assert.equal(p.state.withdrawNotice,null);p.dispose();
});

await test("removed request keeps its authoritative reconciliation notice visible and focusable",async()=>{
  const p=await withdrawalHarness();p.h.reply=async(_url,init)=>init.method==='PATCH'?Response.json({ok:false,message:'Changed'},{status:409}):ok({claims:[]});await p.withdraw();
  assert.deepEqual(p.state.claims,[]);assert.equal(p.state.withdrawNotice.error,true);
  const tree=claimChooserHarness('',[],p.state.withdrawNotice).render();
  const notices=claimElements(tree,node=>node.props.id==='withdraw-status-claim-a');assert.equal(notices.length,1);assert.equal(notices[0].props.role,'alert');assert.equal(notices[0].props.tabIndex,-1);assert.equal(p.focused.at(-1),'withdraw-status-claim-a');p.dispose();
});



await test("claim email link preserves only valid request identity through sign-in", () => {
 const id="aabbccdd-1111-4111-8111-123456789abc";
 assert.equal(claimReturnPath(new URLSearchParams({claim:id,next:"https://invalid.test",token:"secret"})),"/ownership-claim?claim="+id);
 assert.equal(claimReturnPath(new URLSearchParams({claim:"//evil.test?token=secret"})),"/ownership-claim");
 assert.equal(claimLinkId(id.toUpperCase()),id);
});
await test("email target beyond six requests is visible without manufacturing missing/private data", () => {
 const rows=Array.from({length:10},(_,i)=>({id:"claim-"+i}));
 assert.equal(visibleClaimRequests(rows,"claim-9")[0],rows[9]);
 assert.equal(visibleClaimRequests(rows,"missing").length,6);
 assert.equal(new Set(visibleClaimRequests(rows,"claim-9")).size,6);
 assert.deepEqual(visibleClaimRequests([],"private-claim"),[]);
});
await test("owner decision reconciles lost response without repeating mutation", async () => {
 const review={...claim,canReview:true};const p=pageHarness({reply:async()=>ok({claims:[review]})});
 await until(()=>p.state.signedIn===true&&!p.state.claimsLoading);
 let writes=0;p.h.reply=async (_url,init)=>{if(init?.method==="PATCH"){writes++;throw new Error("Lost reply");}return ok({claims:[{...review,status:"approved",canReview:false}]});};
 const decide=compile(functions.get("reviewClaim"),{...p.env,...p.state,serializeClaimBody,window:{requestAnimationFrame(){} }},"reviewClaim");
 assert.equal(await decide(claim.id,"approve","Evidence reviewed"),true);assert.equal(writes,1);assert.equal(p.state.reviewNotice.error,false);p.dispose();
});
await test("owner decision does not claim success when refreshed state is unavailable", async () => {
 const review={...claim,canReview:true};const p=pageHarness({reply:async()=>ok({claims:[review]})});
 await until(()=>p.state.signedIn===true&&!p.state.claimsLoading);
 p.h.reply=async (_url,init)=>init?.method==="PATCH"?ok({status:"approved"}):Response.json({ok:false},{status:503});
 const decide=compile(functions.get("reviewClaim"),{...p.env,...p.state,serializeClaimBody,window:{requestAnimationFrame(){} }},"reviewClaim");
 assert.equal(await decide(claim.id,"approve","Evidence reviewed"),false);assert.equal(p.state.reviewNotice.error,true);assert.equal(p.state.busy,false);p.dispose();
});
await test("status-only claim never enables owner mutations", async () => {
 const p=pageHarness();await until(()=>p.state.signedIn===true&&!p.state.claimsLoading);
 const before=p.h.calls.length;
 const decide=compile(functions.get("reviewClaim"),{...p.env,...p.state,serializeClaimBody},"reviewClaim");
 assert.equal(await decide(claim.id,"approve","Not authorized"),false);assert.equal(p.h.calls.length,before);p.dispose();
});


const ownerReviewSource = fs.readFileSync(path.join(root,"components/ClaimOwnerReview.tsx"),"utf8");
const ownerAst=ts.createSourceFile("ClaimOwnerReview.tsx",ownerReviewSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const ownerFunction=ownerAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="ClaimOwnerReview");
function ownerReviewHarness(claimValue={...claim,canReview:true}, callback=async()=>true){
 const state=[],refs=[],frames=[],focused=[];let index=0,refIndex=0;
 const Component=compile(ownerFunction.getText(ownerAst).replace(/^export /, ""),{React,styles:{review:"review",confirmation:"confirmation"},useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=typeof v==="function"?v(state[i]):v];},useRef(initial){const i=refIndex++;return refs[i]||={current:initial};},window:{requestAnimationFrame(fn){frames.push(fn);}}},"ClaimOwnerReview");
 return {focused,flush(){while(frames.length)frames.shift()();},render(){index=0;refIndex=0;const tree=Component({claim:claimValue,disabled:false,onDecision:callback});for(const node of claimElements(tree,n=>Boolean(n.props.ref)))node.props.ref.current={focus(){focused.push(renderToStaticMarkup(node).replace(/<[^>]*>/g,""));}};return tree;}};
}
function reviewButton(tree,label){return claimElements(tree,n=>n.type==="button"&&renderToStaticMarkup(n).replace(/<[^>]*>/g,"")===label)[0];}
await test("owner review requires server capability, confirms consequences, and Escape makes no decision",async()=>{
 let writes=0;const p=ownerReviewHarness({...claim,canReview:true},async()=>{writes++;return true;});let tree=p.render();
 reviewButton(tree,"Approve ownership request").props.onClick();tree=p.render();p.flush();assert.equal(p.focused.at(-1),"Keep reviewing");
 assert.match(renderToStaticMarkup(tree),/Approval moves this Profile/);assert.equal(reviewButton(tree,"Confirm decision").props.disabled,true);assert.equal(writes,0);
 claimElements(tree,n=>n.props.role==="group")[0].props.onKeyDown({key:"Escape",preventDefault(){}});tree=p.render();p.flush();assert.equal(p.focused.at(-1),"Approve ownership request");assert.equal(writes,0);
 assert.equal(ownerReviewHarness({...claim,canReview:false}).render(),null);assert.equal(ownerReviewHarness({...claim,canReview:true,status:"approved"}).render(),null);
});
await test("confirm decision sends once even before rerender and preserves note on failure",async()=>{
 const gate=deferred(),calls=[];const p=ownerReviewHarness({...claim,canReview:true},async(...args)=>{calls.push(args);return gate.promise;});let tree=p.render();
 reviewButton(tree,"Decline request").props.onClick();tree=p.render();claimElements(tree,n=>n.type==="textarea")[0].props.onChange({target:{value:"Wrong instrument"}});tree=p.render();
 const confirm=reviewButton(tree,"Confirm decision");confirm.props.onClick();confirm.props.onClick();assert.deepEqual(calls,[["deny","Wrong instrument"]]);gate.resolve(false);await tick();tree=p.render();
 assert.equal(claimElements(tree,n=>n.type==="textarea")[0].props.value,"Wrong instrument");assert.equal(reviewButton(tree,"Confirm decision").props.disabled,false);
});
await test("owner review escapes evidence labels and excludes script links",()=>{
 const tree=ownerReviewHarness({...claim,canReview:true,evidence:[{id:"bad",fileName:"<script>private</script>",url:"javascript:alert(1)"}]}).render();const html=renderToStaticMarkup(tree);assert.doesNotMatch(html,/href=|<script>/);assert.match(html,/&lt;script&gt;/);
});

await test("actual late INITIAL_SESSION null cannot clear a confirmed owner or write lease",async()=>{
 const h=await harness().mount(),lease=h.guard.beginWrite(),before=h.guard.getState();h.emit("INITIAL_SESSION",null);
 assert.deepEqual(h.guard.getState(),before);assert.equal(h.guard.isCurrent(lease),true);h.guard.finishWrite(lease);h.guard.dispose();
});
await test("INITIAL_SESSION null before resolved getSession keeps loading and accepts valid snapshot",async()=>{
 const gate=deferred(),h=harness({getSession:()=>gate.promise});const pending=h.guard.start();h.emit("INITIAL_SESSION",null);assert.equal(h.guard.getState().phase,"loading");
 gate.resolve({data:{session:session("a")}});await pending;assert.equal(h.guard.getState().phase,"ready");assert.equal(h.guard.getState().actorId,"a");h.guard.dispose();
});
await test("real SIGNED_OUT and SIGNED_IN account changes supersede initial snapshots",async()=>{
 const h=await harness().mount();let lease=h.guard.lease();h.change(null,"SIGNED_OUT");h.emit("INITIAL_SESSION",session("a"));assert.equal(h.guard.isCurrent(lease),false);assert.equal(h.guard.getState().phase,"signed-out");
 h.change(session("b"),"SIGNED_IN");lease=h.guard.lease();h.emit("INITIAL_SESSION",null);assert.equal(h.guard.getState().actorId,"b");assert.equal(h.guard.isCurrent(lease),true);h.guard.dispose();
});

await test("explicitly denied evidence capability cannot be overridden by withdrawal permission",()=>{
 const row={...claim,status:"awaiting_claimant",canWithdraw:true,canSubmitEvidence:false};
 const html=renderToStaticMarkup(claimChooserHarness('',[row]).render());assert.doesNotMatch(html,/Add requested evidence|Requested evidence \(/);assert.match(html,/Withdraw request/);
 const permitted=renderToStaticMarkup(claimChooserHarness('',[{...row,canSubmitEvidence:true}]).render());assert.match(permitted,/Add requested evidence/);
});
console.log(count + " ownership claim client cases passed.");
