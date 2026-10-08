import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(option("--overlay")) : repo;
const ts = createRequire(path.join(repo, "apps/web/package.json"))("typescript");
const gatePath = "apps/web/app/dashboard/profile/[code]/OwnerProfileClient.tsx";
const profilePath = "apps/web/app/i/[code]/ProfileClient.tsx";
const ownerPath = "apps/web/lib/owner-profile.ts";
const source = (relative) => fs.readFileSync(fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(repo, relative), "utf8");
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function flush() { for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve)); }
function expression(relative, kind, index = 0) {
  const sf = ts.createSourceFile(relative, source(relative), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === (relative === gatePath ? "OwnerProfileClient" : "ProfileClient"));
  if (kind !== "effect") {
    for (const statement of component.body.statements) if (ts.isVariableStatement(statement)) {
      const variable = statement.declarationList.declarations.find((item) => item.name.getText(sf) === kind);
      if (variable) return variable.initializer.arguments[0].getText(sf);
    }
  }
  const effects = component.body.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(sf) === "useEffect");
  return effects[index].expression.arguments[0].getText(sf);
}
function helper(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(compile(source(ownerPath)), { module, exports: module.exports, fetch, Error, encodeURIComponent });
  return module.exports;
}
const contractModule = { exports: {} };
vm.runInNewContext(compile(source("apps/web/lib/instrument-profile-contract.ts")), { module: contractModule, exports: contractModule.exports, URL });
const record = (tag, visibility = "private") => ({ qrCode: "QRG-TEST", visibility, serial: "PRIVATE-" + tag, ownerUserEmail: tag + "@example.test", name: tag });
const session = (tag) => ({ access_token: tag, user: { id: tag, email: tag + "@example.test" } });
function fixture({ preview = false, initialRecord = null, configError = false } = {}) {
  const initial = deferred(), listeners = new Set(), requests = [], timers = new Map();
  let timerId = 0;
  const state = { instrument: null, status: "loading", stored: initialRecord, ownerRecord: null, transfers: [], currentUserEmail: "", currentWorkspaceType: "", activeMedia: null, profileLoadError: false, resolved: true, changes: 0 };
  const update = (name) => (value) => { state[name] = value; state.changes++; };
  const fetch = (url, options = {}) => { const pending = deferred(); const request = { url: String(url), options, ...pending }; requests.push(request); return pending.promise; };
  const owner = helper(fetch);
  const supabase = { auth: { getSession: () => initial.promise, onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }; } } };
  const globals = { Promise, AbortController, AbortSignal, Error, console, encodeURIComponent, decodeURIComponent,
    setTimeout: (fn) => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id),
    fetch, ...owner, code: "QRG-TEST", ownerPreview: preview, initialInstrument: initialRecord, PROFILE_FETCH_TIMEOUT_MS: 28000,
    get publicReviewSnapshot() {
      return Boolean(initialRecord?.publicReviewSnapshot || state.stored?.publicReviewSnapshot);
    },
    createBrowserSupabaseClient: () => { if (configError) throw new Error("Configuration missing"); return supabase; },
    getSupabaseAccessToken: async () => (await initial.promise).data.session?.access_token || "",
    setInstrument: update("instrument"), setStatus: update("status"), setStored: update("stored"), setOwnerRecord: update("ownerRecord"),
    setTransfers: update("transfers"), setCurrentUserEmail: update("currentUserEmail"), setCurrentWorkspaceType: update("currentWorkspaceType"), setActiveMedia: update("activeMedia"),
    setProfileLoadError: update("profileLoadError"), setResolved: update("resolved")
  };
  const mount = (relative, index = 0) => vm.runInNewContext(compile("(" + expression(relative, "effect", index) + ")()"), globals);
  return { state, initial, requests, timers, listeners, globals, mount,
    emit(value) { for (const callback of listeners) callback(value ? "SIGNED_IN" : "SIGNED_OUT", value); },
    request(token, transfer = false) { const matching = requests.filter((item) => (item.options.headers?.authorization || "") === "Bearer " + token && (transfer ? item.url.includes("/api/transfers") : item.url.includes("/api/instruments?scope=mine"))); assert.ok(matching.length, "Expected request for " + token + (transfer ? " transfers" : " owner")); return matching.at(-1); },
    presentation() { return vm.runInNewContext(compile("(" + expression(profilePath, "presentation") + ")()"), { ...globals, instrument: this.displayed(), ownerRecord: state.ownerRecord, resolveInstrumentPresentation: contractModule.exports.resolveInstrumentPresentation }); },
    displayed() { return vm.runInNewContext(compile("(" + expression(profilePath, "instrument") + ")()"), { ...globals, stored: state.stored, ownerRecord: state.ownerRecord }); }
  };
}
function okRecord(request, value) { request.resolve(Response.json({ ok: true, instrument: value })); }
function okTransfers(request, tag) { request.resolve(Response.json({ ok: true, transfers: [{ id: tag, guitarQrCode: "QRG-TEST", toEmail: tag + "@example.test" }] })); }
async function settleOwner(f, tag, value = record(tag)) { okRecord(f.request(tag), value); okTransfers(f.request(tag, true), tag); await flush(); }
let passes = 0;
async function test(name, run) { if (args.includes("--match") && !name.includes(option("--match"))) return; await run(); passes++; console.log("PASS " + name); }
await test("owner links route private records to the gate and preserve public links", async () => {
  const api = helper(() => { throw new Error("No fetch expected"); });
  assert.equal(api.ownerProfileHref({ qrCode: "A/B", visibility: "private" }), "/dashboard/profile/A%2FB");
  assert.equal(api.ownerProfileHref({ qrCode: "ABC", visibility: "public", permanentPath: "/i/ABC" }), "/i/ABC");
  assert.equal(api.ownerProfileHref({ qrCode: "ABC", visibility: "unlisted" }), "/i/ABC");
});
await test("owner endpoint consumes singular instrument with token, code and no-store", async () => {
  let call;
  const api = helper(async (url, options) => { call = { url, options }; return Response.json({ ok: true, instrument: record("A") }); });
  assert.equal((await api.fetchOwnerProfile("qrg-test", "A")).serial, "PRIVATE-A");
  assert.equal(call.url, "/api/instruments?scope=mine&code=qrg-test"); assert.equal(call.options.headers.authorization, "Bearer A"); assert.equal(call.options.cache, "no-store");
});
for (const [name, status, body, expected] of [
  ["expired", 401, {}, 401], ["forbidden", 403, {}, 404], ["not found", 404, {}, 404], ["API down", 503, {}, 503],
  ["legacy array", 200, { ok: true, instruments: [record("A")] }, 503],
  ["malformed record", 200, { ok: true, instrument: {} }, 503],
  ["wrong code", 200, { ok: true, instrument: { ...record("A"), qrCode: "OTHER" } }, 503],
  ["false success", 200, { ok: false, instrument: record("A") }, 503]
]) await test("owner endpoint rejects " + name, async () => {
  const api = helper(async () => Response.json(body, { status }));
  await assert.rejects(api.fetchOwnerProfile("QRG-TEST", "A"), (error) => error instanceof api.OwnerProfileError && error.status === expected);
});
await test("missing token never requests a private record", async () => {
  const api = helper(() => { throw new Error("No fetch expected"); });
  await assert.rejects(api.fetchOwnerProfile("QRG-TEST", ""), (error) => error.status === 401);
});
await test("gate login event wins over a late initial session snapshot", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A"));
  f.initial.resolve({ data: { session: null } }); okRecord(f.request("A"), record("A")); await flush();
  assert.equal(f.state.status, "ready"); assert.equal(f.state.instrument.serial, "PRIVATE-A"); cleanup();
});
await test("gate sign-out clears private data immediately and rejects late success", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A"));
  const pending = f.request("A"); f.state.instrument = record("old"); f.emit(null);
  assert.equal(f.state.instrument, null); assert.equal(f.state.status, "signin"); assert.equal(pending.options.signal.aborted, true);
  okRecord(pending, record("A")); await flush(); assert.equal(f.state.instrument, null); assert.equal(f.state.status, "signin"); cleanup();
});
await test("gate account switch ignores late success from prior account", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A")); f.emit(session("B"));
  okRecord(f.request("B"), record("B")); await flush(); okRecord(f.request("A"), record("A")); await flush();
  assert.equal(f.state.instrument.serial, "PRIVATE-B"); assert.equal(f.state.status, "ready"); cleanup();
});
await test("gate old request failure cannot replace newer ready state", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A")); f.emit(session("B"));
  okRecord(f.request("B"), record("B")); await flush(); f.request("A").reject(new Error("late outage")); await flush();
  assert.equal(f.state.instrument.serial, "PRIVATE-B"); assert.equal(f.state.status, "ready"); cleanup();
});
for (const [status, expected] of [[401, "signin"], [404, "missing"], [503, "error"]]) await test("gate API " + status + " shows " + expected + " without private data", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A")); f.request("A").resolve(Response.json({}, { status })); await flush();
  assert.equal(f.state.status, expected); assert.equal(f.state.instrument, null); cleanup();
});
await test("gate session lookup failure and missing configuration show recoverable error", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.initial.reject(new Error("session outage")); await flush(); assert.equal(f.state.status, "error"); cleanup();
  const missing = fixture({ configError: true }); missing.mount(gatePath); assert.equal(missing.state.status, "error"); assert.equal(missing.state.instrument, null);
});
await test("gate unmount aborts and unsubscribes without accepting late result", async () => {
  const f = fixture(); const cleanup = f.mount(gatePath); f.emit(session("A")); cleanup(); const changes = f.state.changes;
  assert.equal(f.listeners.size, 0); assert.equal(f.request("A").options.signal.aborted, true);
  okRecord(f.request("A"), record("A")); await flush(); assert.equal(f.state.changes, changes);
});
await test("late anonymous refresh cannot overwrite authenticated owner detail; logout restores latest public data", async () => {
  const initial = { ...record("public", "public"), serial: "", documentFiles: [] };
  const f = fixture({ initialRecord: initial }); const cleanupPublic = f.mount(profilePath, 0), cleanupOwner = f.mount(profilePath, 1);
  f.initial.resolve({ data: { session: session("A") } }); await flush(); await settleOwner(f, "A");
  assert.equal(f.displayed().serial, "PRIVATE-A");
  const publicRequest = f.requests.find((item) => item.url.includes("?code="));
  okRecord(publicRequest, { ...initial, name: "Fresh public data" }); await flush();
  assert.equal(f.displayed().serial, "PRIVATE-A");
  f.state.activeMedia = "signed-private-image"; f.emit(null);
  assert.equal(f.state.ownerRecord, null); assert.equal(f.state.activeMedia, null); assert.equal(f.state.transfers.length, 0);
  assert.equal(f.displayed().serial, ""); assert.equal(f.displayed().name, "Fresh public data"); cleanupPublic(); cleanupOwner();
});
await test("public profile account switch clears transfers and private gallery before next response", async () => {
  const f = fixture({ initialRecord: { ...record("public", "public"), serial: "" } }); const cleanup = f.mount(profilePath, 1);
  f.initial.resolve({ data: { session: session("A") } }); await flush(); await settleOwner(f, "A");
  f.state.activeMedia = "signed-private-image"; f.emit(session("B"));
  assert.equal(f.state.transfers.length, 0); assert.equal(f.state.ownerRecord, null); assert.equal(f.state.activeMedia, null); assert.equal(f.displayed().serial, "");
  await settleOwner(f, "B"); assert.equal(f.displayed().serial, "PRIVATE-B"); cleanup();
});
await test("owner context ignores late results after sign-out", async () => {
  const f = fixture({ initialRecord: { ...record("public", "public"), serial: "" } }); const cleanup = f.mount(profilePath, 1);
  f.emit(session("A")); f.emit(null); await settleOwner(f, "A");
  assert.equal(f.state.transfers.length, 0); assert.equal(f.state.ownerRecord, null); assert.equal(f.displayed().serial, ""); cleanup();
});
await test("old owner request failure cannot clear newer account transfers", async () => {
  const f = fixture(); const cleanup = f.mount(profilePath, 1); f.emit(session("A")); f.emit(session("B")); await settleOwner(f, "B");
  f.request("A").reject(new Error("old owner request failed")); f.request("A", true).reject(new Error("old transfer request failed")); await flush();
  assert.equal(f.state.transfers[0].id, "B"); assert.equal(f.state.ownerRecord.serial, "PRIVATE-B"); cleanup();
});
await test("private preview clears both initial/private owner records and gallery on sign-out", async () => {
  const f = fixture({ preview: true, initialRecord: record("A") }); const cleanup = f.mount(profilePath, 1);
  f.initial.resolve({ data: { session: session("A") } }); await flush(); await settleOwner(f, "A");
  f.state.activeMedia = "signed-private-image"; f.emit(null);
  assert.equal(f.state.stored, null); assert.equal(f.state.ownerRecord, null); assert.equal(f.displayed(), null); assert.equal(f.state.activeMedia, null); assert.equal(f.state.transfers.length, 0); cleanup();
});
await test("owner API failure clears private preview instead of retaining a cached private record", async () => {
  const f = fixture({ preview: true, initialRecord: record("A") }); const cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  f.request("A").resolve(Response.json({}, { status: 404 })); okTransfers(f.request("A", true), "A"); await flush();
  assert.equal(f.state.stored, null); assert.equal(f.state.ownerRecord, null); assert.equal(f.displayed(), null); cleanup();
});
await test("transfer outage does not discard a successfully authorized owner record", async () => {
  const f = fixture(); const cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  okRecord(f.request("A"), record("A")); f.request("A", true).reject(new Error("transfer outage")); await flush();
  assert.equal(f.displayed().serial, "PRIVATE-A"); assert.equal(f.state.transfers.length, 0); cleanup();
});
await test("late initial session never replaces an event-selected account", async () => {
  const f = fixture(); const cleanup = f.mount(profilePath, 1); f.emit(session("B"));
  f.initial.resolve({ data: { session: session("A") } }); await flush(); await settleOwner(f, "B");
  assert.equal(f.state.currentUserEmail, "B@example.test".toLowerCase()); assert.equal(f.state.ownerRecord.serial, "PRIVATE-B");
  assert.equal(f.requests.some((item) => item.options.headers?.authorization === "Bearer A"), false); cleanup();
});
await test("owner context unmount prevents all late updates and aborts requests", async () => {
  const f = fixture(); const cleanup = f.mount(profilePath, 1); f.emit(session("A")); cleanup(); const changes = f.state.changes;
  await settleOwner(f, "A"); assert.equal(f.state.changes, changes); assert.equal(f.listeners.size, 0); assert.equal(f.request("A").options.signal.aborted, true);
});
await test("owner preview never starts an anonymous profile refresh", async () => {
  const f = fixture({ preview: true, initialRecord: record("A") }); const cleanup = f.mount(profilePath, 0); await flush(); assert.equal(f.requests.length, 0); cleanup();
});
await test("owner presentation includes private serial/documents and purges them on logout", async () => {
  const documents = [{ name: "Public invoice", url: "https://test.invalid/public", visibility: "public" }, { name: "Private receipt", url: "https://test.invalid/private", visibility: "private" }];
  const publicRecord = { ...record("public", "public"), serial: "", showSerialPublic: false, documentFiles: [documents[0]] };
  const f = fixture({ initialRecord: publicRecord }); const cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  await settleOwner(f, "A", { ...record("A", "public"), showSerialPublic: false, documentFiles: documents });
  assert.equal(f.presentation().scope, "owner"); assert.equal(f.presentation().serialNumber, "PRIVATE-A"); assert.equal(f.presentation().documents.length, 2);
  f.emit(null); assert.equal(f.presentation().scope, "public"); assert.equal(f.presentation().serialNumber, ""); assert.equal(f.presentation().documents.length, 1); cleanup();
});
await test("gated private preview uses owner presentation before its background context refresh", async () => {
  const f = fixture({ preview: true, initialRecord: { ...record("A"), showSerialPublic: false, documentFiles: [{ name: "Private receipt", visibility: "private" }] } });
  assert.equal(f.presentation().scope, "owner"); assert.equal(f.presentation().serialNumber, "PRIVATE-A"); assert.equal(f.presentation().documents.length, 1);
});
await test("navigating to another code cannot render a prior private record before effects run", async () => {
  const f = fixture({ initialRecord: record("A") }); f.state.ownerRecord = record("A");
  f.globals.code = "QRG-OTHER"; assert.equal(f.displayed(), null);
});
console.log(passes + " owner preview behavior/effect tests passed.");





await test("snapshot marker skips owner auth, requests and transfer subscription", async () => {
  const f = fixture({
    initialRecord: {
      ...record("public", "public"),
      publicReviewSnapshot: true,
      ownerUserEmail: undefined
    }
  });
  let authCalls = 0;
  f.globals.createBrowserSupabaseClient = () => {
    authCalls++;
    throw Error("Unexpected Auth access");
  };

  const cleanup = f.mount(profilePath, 1);
  f.emit(session("A"));
  await flush();

  assert.equal(cleanup, undefined);
  assert.equal(authCalls, 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.state.ownerRecord, null);
  assert.equal(f.state.currentUserEmail, "");
  assert.equal(f.displayed().publicReviewSnapshot, true);
});

await test("snapshot fixture marker binding matches actual component initializer", async () => {
  const sf = ts.createSourceFile(
    profilePath, source(profilePath),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX
  );
  const component = sf.statements.find(n =>
    ts.isFunctionDeclaration(n) && n.name?.text === "ProfileClient"
  );
  const variable = component.body.statements
    .filter(ts.isVariableStatement)
    .flatMap(n => Array.from(n.declarationList.declarations))
    .find(n => n.name.getText(sf) === "publicReviewSnapshot");

  assert.ok(variable, "Actual marker initializer must exist");

  for (const [initial, stored] of [
    [null, null],
    [{}, {}],
    [{ publicReviewSnapshot: true }, null],
    [null, { publicReviewSnapshot: true }]
  ]) {
    const f = fixture({ initialRecord: initial });
    f.state.stored = stored;
    const actual = vm.runInNewContext(
      compile(variable.initializer.getText(sf)),
      { initialInstrument: initial, stored }
    );
    assert.equal(f.globals.publicReviewSnapshot, actual);
  }
});

console.log("TOTAL_WITH_FIXTURE_BINDING " + passes);

function workspaceRequest(f, token) {
  const request = f.requests.filter(item => item.url === "/api/account" && item.options.headers.authorization === "Bearer " + token).at(-1);
  assert.ok(request, "Expected authenticated workspace lookup");
  return request;
}
function serviceShortcut(f, instrument = record("PUBLIC", "public"), canEdit = false) {
  return Boolean(vm.runInNewContext(compile("(" + expression(profilePath, "canSubmitService") + ")"), {
    publicReviewSnapshot: Boolean(instrument?.publicReviewSnapshot), currentUserEmail: f.state.currentUserEmail,
    currentWorkspaceType: f.state.currentWorkspaceType, instrument, canEdit
  }));
}
for (const type of ["player", "collector", "other", "builder", "shop", "luthier", "unknown"]) await test("Profile service shortcut follows saved workspace: " + type, async () => {
  const f = fixture(), cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  assert.equal(serviceShortcut(f), false);
  workspaceRequest(f, "A").resolve(Response.json({ ok: true, account: { publicCollection: { accountType: type } } }));
  await flush();
  assert.equal(serviceShortcut(f), type === "shop" || type === "luthier");
  assert.equal(serviceShortcut(f, record("PRIVATE"), false), false);
  assert.equal(serviceShortcut(f, record("PUBLIC", "public"), true), false);
  assert.equal(serviceShortcut(f, { ...record("PUBLIC", "public"), publicReviewSnapshot: true }), false);
  cleanup();
});
await test("late professional workspace cannot restore a shortcut after account switch or logout", async () => {
  const f = fixture(), cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  const old = workspaceRequest(f, "A"); f.emit(session("B"));
  workspaceRequest(f, "B").resolve(Response.json({ ok: true, account: { publicCollection: { accountType: "player" } } }));
  old.resolve(Response.json({ ok: true, account: { publicCollection: { accountType: "shop" } } }));
  await flush(); assert.equal(serviceShortcut(f), false);
  f.emit(session("C")); const pending = workspaceRequest(f, "C"); f.emit(null);
  pending.resolve(Response.json({ ok: true, account: { publicCollection: { accountType: "luthier" } } }));
  await flush(); assert.equal(f.state.currentWorkspaceType, ""); assert.equal(serviceShortcut(f), false);
  cleanup();
});
await test("workspace failure does not block owner Profile or restore professional tools", async () => {
  const f = fixture(), cleanup = f.mount(profilePath, 1); f.emit(session("A"));
  workspaceRequest(f, "A").reject(new Error("Account unavailable"));
  await settleOwner(f, "A"); assert.equal(f.state.ownerRecord.serial, "PRIVATE-A"); assert.equal(serviceShortcut(f), false);
  cleanup();
});
console.log("TOTAL_WITH_PROFILE_WORKSPACE " + passes);
