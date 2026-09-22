import { withUiTextTestContext } from "../ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const args = process.argv.slice(2), option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(option("--overlay")) : repo;
const require = createRequire(path.join(repo, "apps/web/package.json")), ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function runtime(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    if (Object.hasOwn(overrides, relative)) return overrides[relative];
    if (cache.has(relative)) return cache.get(relative).exports;
    const filename = [relative + ".ts", relative + ".tsx"].find((file) => fs.existsSync(path.join(overlay, file)) || fs.existsSync(path.join(repo, file)));
    const source = fs.readFileSync(fs.existsSync(path.join(overlay, filename)) ? path.join(overlay, filename) : path.join(repo, filename), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(relative, module);
    const localRequire = withUiTextTestContext((specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (specifier.startsWith("@/")) return load("apps/web/" + specifier.slice(2));
      return specifier.startsWith(".") ? load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier))) : require(specifier);
    });
    new Function("require", "exports", "module", code)(localRequire, module.exports, module); return module.exports;
  }
  return load;
}
const load = runtime();
const { createAccountSettings, savedCollectionHref, accountReturnPath } = load("apps/web/lib/account-settings");
const { defaultPublicCollectionSettings } = load("apps/web/lib/public-collections");
const sessionFor = (id) => id ? { access_token: `token-${id}`, user: { id, email: `${id}@example.test` } } : null;
const accountFor = (id) => ({ email: `${id}@example.test`, displayName: `Owner ${id}`, role: "owner", plan: "free", accountStatus: "active", settingsVersion: 0, publicCollection: { ...defaultPublicCollectionSettings, enabled: true, handle: `${id}-saved`, publicName: `Collection ${id}` }, stats: { records: 3, publicRecords: 1, privateRecords: 1, unlistedRecords: 1 } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) { for (let index = 0; index < 100; index++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); }
const ok = (value) => Response.json({ ok: true, ...value });
function fixture(options = {}) {
  const f = { session: sessionFor("a"), accounts: { a: accountFor("a"), b: accountFor("b") }, calls: [], saved: 0, cleared: 0, resetCalls: [], signoutCalls: 0, ...options };
  let listener;
  f.respond = async (_url, init) => {
    const id = init.headers.authorization.replace("Bearer token-", "");
    if (init.method === "PATCH") {
      const { expectedVersion, ...draft } = JSON.parse(init.body);
      if (expectedVersion !== f.accounts[id].settingsVersion) return Response.json({ ok: false, reloadRequired: true, message: "Account settings changed. Reload your account before saving again." }, { status: 409 });
      f.accounts[id] = { ...f.accounts[id], ...draft, settingsVersion: expectedVersion + 1 };
      return ok({ committed: true, account: f.accounts[id], message: "Account updated." });
    }
    return ok({ account: f.accounts[id] });
  };
  f.client = createAccountSettings({ timeoutMs: f.timeoutMs || 1000,
    auth: () => {
      if (f.constructError) throw new Error("Sign-in unavailable");
      return {
        getSession: () => f.getSession ? f.getSession() : Promise.resolve({ data: { session: f.session } }),
        onAuthStateChange: (callback) => { listener = callback; return { data: { subscription: { unsubscribe() { f.unsubscribed = true; } } } }; },
        resetPasswordForEmail: async (email, options) => { f.resetCalls.push({ email, options }); return f.reset ? f.reset() : { error: null }; },
        signOut: async () => { f.signoutCalls++; if (f.signout) return f.signout(); f.change(null); return { error: null }; }
      };
    },
    fetch: async (url, init) => { f.calls.push({ url, ...init }); return f.reply ? f.reply(url, init) : f.respond(url, init); },
    onSaved: () => f.saved++, onSignedOut: () => f.cleared++
  });
  f.change = (session) => { f.session = session; listener("SIGNED_IN", session); };
  f.mount = async () => { await f.client.start(); await until(() => f.client.getState().phase !== "loading"); return f; };
  f.writes = () => f.calls.filter((call) => call.method === "PATCH");
  f.edit = () => f.client.setDraft({ displayName: "Updated owner", publicCollection: { ...f.client.getState().draft.publicCollection, handle: "updated-link" } });
  return f;
}

test("initial account load publishes complete authenticated settings", async () => {
  const f = await fixture().mount(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().account.email, "a@example.test"); assert.equal(f.client.getState().account.stats.records, 3); assert.equal(f.writes().length, 0); f.client.dispose();
});
test("auth construction failure is retryable", async () => {
  const f = await fixture({ constructError: true }).mount(); assert.equal(f.client.getState().phase, "error"); f.constructError = false; await f.client.reload(); await until(() => f.client.getState().phase === "ready"); f.client.dispose();
});
test("auth deadline and rejected session both end loading", async () => {
  for (const getSession of [() => new Promise(() => {}), () => Promise.reject(new Error("offline"))]) { const f = await fixture({ timeoutMs: 8, getSession }).mount(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.calls.length, 0); f.client.dispose(); }
});
test("late initial session cannot replace a newer signed-in account", async () => {
  const gate = deferred(), f = fixture({ getSession: () => gate.promise }); const starting = f.client.start(); await tick(); f.getSession = undefined; f.change(sessionFor("b")); await until(() => f.client.getState().phase === "ready"); gate.resolve({ data: { session: sessionFor("a") } }); await starting; assert.equal(f.client.getState().account.email, "b@example.test"); f.client.dispose();
});
test("sign-out clears private details immediately and ignores an old load response", async () => {
  const f = await fixture().mount(), gate = deferred(); f.reply = () => gate.promise; const reloading = f.client.reload(); await tick(); f.change(null);
  assert.equal(f.client.getState().account, null); assert.equal(f.client.getState().draft.displayName, ""); assert.equal(f.client.getState().phase, "signed-out"); gate.resolve(ok({ account: accountFor("a") })); await reloading; await tick(); assert.equal(f.client.getState().account, null); assert.equal(f.cleared, 1); f.client.dispose();
});
test("account switch cannot expose previous settings while the new account loads", async () => {
  const f = await fixture().mount(), gate = deferred(); f.reply = () => gate.promise; f.change(sessionFor("b")); await tick(); assert.equal(f.client.getState().actorId, "b"); assert.equal(f.client.getState().account, null); assert.equal(savedCollectionHref(f.client.getState().account), ""); gate.resolve(ok({ account: accountFor("b") })); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().account.email, "b@example.test"); f.client.dispose();
});
test("same-user token refresh preserves unsaved fields without reloading", async () => {
  const f = await fixture().mount(); f.edit(); const calls = f.calls.length; f.change(sessionFor("a")); await tick(); assert.equal(f.client.getState().draft.displayName, "Updated owner"); assert.equal(f.calls.length, calls); f.client.dispose();
});
for (const [name, payload] of [["missing account", { ok: true }], ["wrong account", { ok: true, account: accountFor("b") }], ["missing counts", { ok: true, account: { ...accountFor("a"), stats: {} } }]]) test("invalid account payload cannot enable editing: " + name, async () => {
  const f = await fixture({ reply: async () => Response.json(payload) }).mount(); assert.equal(f.client.getState().phase, "error"); await f.client.save(); assert.equal(f.writes().length, 0); f.client.dispose();
});
test("account network and JSON deadlines are finite", async () => {
  for (const reply of [() => new Promise(() => {}), async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })]) { const f = await fixture({ timeoutMs: 8, reply }).mount(); assert.equal(f.client.getState().phase, "error"); f.client.dispose(); }
});
test("duplicate saves hold one lock before token resolution", async () => {
  const f = await fixture().mount(), gate = deferred(); f.edit(); f.getSession = () => gate.promise; const first = f.client.save(), second = f.client.save(); await tick(); assert.equal(f.writes().length, 0); f.getSession = undefined; gate.resolve({ data: { session: sessionFor("a") } }); await Promise.all([first, second]); assert.equal(f.writes().length, 1); assert.equal(f.saved, 1); assert.equal(f.client.getState().busy, ""); f.client.dispose();
});
test("changed session during token resolution prevents writes", async () => {
  const f = await fixture().mount(), gate = deferred(); f.edit(); f.getSession = () => gate.promise; const saving = f.client.save(); await tick(); f.getSession = undefined; f.change(sessionFor("b")); gate.resolve({ data: { session: sessionFor("a") } }); await saving; assert.equal(f.writes().length, 0); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().account.email, "b@example.test"); f.client.dispose();
});
test("session changes without an auth callback are checked before writes", async () => {
  const f = await fixture().mount(); f.session = sessionFor("b"); await f.client.save(); assert.equal(f.writes().length, 0); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().actorId, "b"); f.client.dispose();
});
test("old save response cannot update a new account or fire success", async () => {
  const f = await fixture().mount(), gate = deferred(); f.reply = (url, init) => init.method === "PATCH" ? gate.promise : f.respond(url, init); const saving = f.client.save(); await until(() => f.writes().length === 1); f.change(sessionFor("b")); gate.resolve(ok({ committed: true, account: accountFor("a") })); await saving; await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().account.email, "b@example.test"); assert.equal(f.saved, 0); f.client.dispose();
});
test("validation failure preserves unsaved edits and saved public link", async () => {
  const f = await fixture().mount(); f.edit(); f.reply = async () => Response.json({ ok: false, message: "That handle is in use." }, { status: 409 }); await f.client.save(); assert.equal(f.client.getState().message, "That handle is in use."); assert.equal(f.client.getState().draft.publicCollection.handle, "updated-link"); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/a-saved"); assert.equal(f.client.getState().uncertainSave, false); assert.equal(f.client.getState().busy, ""); f.client.dispose();
});
test("confirmed save updates preview and preserves postcommit synchronization warning", async () => {
  const f = await fixture().mount(); f.edit(); f.reply = async (url, init) => { const response = await f.respond(url, init); return ok({ ...await response.json(), authMetadataSynced: false, message: "Account saved. Sign-in sync failed." }); }; await f.client.save(); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/updated-link"); assert.equal(f.client.getState().message, "Account saved. Sign-in sync failed."); assert.equal(f.saved, 1); f.client.dispose();
});
for (const [name, reply] of [["offline", async () => { throw new Error("offline"); }], ["gateway", async () => new Response("gateway outage", { status: 502 })], ["malformed confirmation", async () => ok({ committed: true, account: { displayName: "Missing fields" } })]]) test("unconfirmed save blocks retries until reload: " + name, async () => {
  const f = await fixture().mount(); f.edit(); f.reply = reply; await f.client.save(); assert.equal(f.client.getState().uncertainSave, true); assert.equal(f.client.getState().busy, ""); assert.equal(f.saved, 0); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/a-saved"); const count = f.calls.length; await f.client.save(); assert.equal(f.calls.length, count); f.reply = undefined; await f.client.reload(); assert.equal(f.client.getState().uncertainSave, false); assert.equal(f.client.getState().draft.publicCollection.handle, "a-saved"); f.client.dispose();
});
test("lost response after commit recovers committed link", async () => {
  const f = await fixture().mount(); f.edit(); f.reply = async (url, init) => { await f.respond(url, init); throw new Error("Lost response"); }; await f.client.save(); assert.equal(f.client.getState().uncertainSave, true); f.reply = undefined; await f.client.reload(); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/updated-link"); f.client.dispose();
});
test("saves use the confirmed settings version and advance it after each commit", async () => {
  const f = await fixture().mount(); f.edit(); await f.client.save(); await f.client.save();
  assert.deepEqual(f.writes().map((call) => JSON.parse(call.body).expectedVersion), [0, 1]);
  assert.equal(f.client.getState().account.settingsVersion, 2); assert.equal(f.saved, 2); f.client.dispose();
});
test("conflict preserves draft and confirmed preview until explicit reload", async () => {
  const f = await fixture().mount(); f.edit();
  f.accounts.a = { ...f.accounts.a, settingsVersion: 1, displayName: "Other tab", publicCollection: { ...f.accounts.a.publicCollection, handle: "other-tab" } };
  await f.client.save(); assert.equal(f.client.getState().uncertainSave, true); assert.equal(f.saved, 0);
  assert.equal(f.client.getState().draft.publicCollection.handle, "updated-link"); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/a-saved");
  await f.client.save(); assert.equal(f.writes().length, 1);
  await f.client.reload(); assert.equal(f.client.getState().account.settingsVersion, 1); assert.equal(f.client.getState().uncertainSave, false);
  assert.equal(savedCollectionHref(f.client.getState().account), "/collections/other-tab"); f.edit(); await f.client.save();
  assert.equal(JSON.parse(f.writes()[1].body).expectedVersion, 1); assert.equal(f.client.getState().account.settingsVersion, 2); f.client.dispose();
});
test("timeout then pre-save reload cannot let late A replace confirmed B", async () => {
  const f = await fixture({ timeoutMs: 8 }).mount(), gate = deferred(); let lateResponse;
  f.edit(); f.reply = async (url, init) => { await gate.promise; lateResponse = await f.respond(url, init); return lateResponse; };
  await f.client.save(); assert.equal(f.client.getState().uncertainSave, true);
  f.reply = undefined; await f.client.reload(); assert.equal(f.client.getState().account.settingsVersion, 0);
  f.client.setDraft({ displayName: "Confirmed B", publicCollection: { ...f.client.getState().draft.publicCollection, handle: "confirmed-b" } });
  await f.client.save(); assert.equal(f.saved, 1); assert.equal(f.client.getState().account.settingsVersion, 1);
  gate.resolve(); await until(() => Boolean(lateResponse)); assert.equal(lateResponse.status, 409);
  assert.equal(f.accounts.a.displayName, "Confirmed B"); assert.equal(savedCollectionHref(f.client.getState().account), "/collections/confirmed-b"); assert.equal(f.saved, 1); f.client.dispose();
});
test("late A committed after reload makes B conflict and recovers A version", async () => {
  const f = await fixture({ timeoutMs: 8 }).mount(), gate = deferred(); let lateResponse;
  f.edit(); f.reply = async (url, init) => { await gate.promise; lateResponse = await f.respond(url, init); return lateResponse; };
  await f.client.save(); f.reply = undefined; await f.client.reload(); gate.resolve(); await until(() => Boolean(lateResponse));
  assert.equal(lateResponse.status, 200); f.client.setDraft({ displayName: "Stale B" }); await f.client.save();
  assert.equal(f.client.getState().uncertainSave, true); assert.equal(f.accounts.a.displayName, "Updated owner"); assert.equal(f.saved, 0);
  await f.client.reload(); assert.equal(f.client.getState().account.settingsVersion, 1); assert.equal(f.client.getState().draft.displayName, "Updated owner"); f.client.dispose();
});
for (const settingsVersion of [undefined, -1, 0.5, "0", Number.MAX_SAFE_INTEGER + 1]) test("invalid GET version cannot enable editing: " + settingsVersion, async () => {
  const f = await fixture({ reply: async () => ok({ account: { ...accountFor("a"), settingsVersion } }) }).mount();
  assert.equal(f.client.getState().phase, "error"); await f.client.save(); assert.equal(f.writes().length, 0); f.client.dispose();
});
for (const settingsVersion of [undefined, 0, 2, "1"]) test("invalid save version cannot publish success: " + settingsVersion, async () => {
  const f = await fixture().mount(); f.reply = async () => ok({ committed: true, account: { ...accountFor("a"), settingsVersion } });
  await f.client.save(); assert.equal(f.client.getState().uncertainSave, true); assert.equal(f.saved, 0); assert.equal(f.client.getState().account.settingsVersion, 0); f.client.dispose();
});
test("password reset rejection releases lock", async () => {
  const f = await fixture({ reset: () => Promise.reject(new Error("offline")) }).mount(); await f.client.resetPassword("https://test.invalid/reset-password?next=%2Faccount"); assert.equal(f.client.getState().busy, ""); assert.match(f.client.getState().message, /Could not confirm/); assert.equal(f.resetCalls.length, 1); f.client.dispose();
});
test("password reset withheld if session switches", async () => {
  const f = await fixture().mount(); f.session = sessionFor("b"); await f.client.resetPassword("https://test.invalid/reset-password"); assert.equal(f.resetCalls.length, 0); f.client.dispose();
});
test("save timeout blocks blind retry and ignores late success", async () => {
  const f = await fixture({ timeoutMs: 8 }).mount(), gate = deferred(); f.reply = () => gate.promise;
  await f.client.save(); assert.equal(f.client.getState().uncertainSave, true); assert.equal(f.client.getState().busy, "");
  gate.resolve(ok({ committed: true, account: accountFor("a") })); await tick(); assert.equal(f.saved, 0); f.client.dispose();
});
test("password reset and sign-out deadlines always release busy state", async () => {
  const f = await fixture({ timeoutMs: 8, reset: () => new Promise(() => {}), signout: () => new Promise(() => {}) }).mount();
  await f.client.resetPassword("https://test.invalid/reset-password"); assert.equal(f.client.getState().busy, "");
  await f.client.signOut(); assert.equal(f.client.getState().busy, ""); assert.equal(f.client.getState().phase, "ready"); f.client.dispose();
});
test("failed sign-out leaves account usable and preserves session", async () => {
  for (const signout of [async () => ({ error: new Error("offline") }), async () => { throw new Error("offline"); }]) { const f = await fixture({ signout }).mount(); await f.client.signOut(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().busy, ""); assert.match(f.client.getState().message, /Could not sign out/); assert.equal(f.cleared, 0); f.client.dispose(); }
});
test("successful sign-out clears state and cleanup runs once", async () => {
  const f = await fixture().mount(); await f.client.signOut(); await tick(); assert.equal(f.client.getState().phase, "signed-out"); assert.equal(f.client.getState().account, null); assert.equal(f.cleared, 1); f.client.dispose();
});
test("dispose unsubscribes and prevents late read publication", async () => {
  const f = await fixture().mount(), gate = deferred(); let notifications = 0; f.client.subscribe(() => notifications++); f.reply = () => gate.promise; const pending = f.client.reload(); await tick(); f.client.dispose(); const before = notifications; gate.resolve(ok({ account: accountFor("a") })); await pending; assert.equal(f.unsubscribed, true); assert.equal(notifications, before); assert.equal(f.client.getState().account, null);
});
test("login destinations retain sections and reject arbitrary redirects", () => {
  for (const section of ["collection", "profile", "security", "provider", "privacy", "notifications"]) assert.equal(accountReturnPath(section), "/account?section=" + section);
  for (const section of ["overview", "https://attacker.example", "//attacker.example", "__proto__"]) assert.equal(accountReturnPath(section), "/account");
  assert.equal(savedCollectionHref({ ...accountFor("a"), publicCollection: { ...defaultPublicCollectionSettings, handle: "not-published" } }), "");
});
async function accountPageUI(f, section = "collection") {
  const values = [], effects = [], previous = []; let cursor = 0, effectCursor = 0;
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useEffect(run, deps) { const index = effectCursor++; if (!previous[index] || deps.some((item, i) => item !== previous[index][i])) { previous[index] = deps; effects.push(run); } }
  };
  const search = new URLSearchParams("section=" + section);
  const ui = runtime({ react: hooks, "next/navigation": { useSearchParams: () => search }, "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "apps/web/lib/account-settings": { ...load("apps/web/lib/account-settings"), createAccountSettings: () => f.client },
    "apps/web/lib/supabase-browser": {}, "apps/web/lib/use-site-content": { useSiteContent: () => ({}) },
    "apps/web/components/Nav": { Nav: () => null }, "apps/web/components/Footer": { Footer: () => null }, "apps/web/components/PwaInstall": { PwaInstall: () => null },
    "apps/web/components/CheckoutAwareLink": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) }
  });
  const Component = ui("apps/web/app/account/page").default().props.children.type;
  const render = () => { cursor = effectCursor = 0; return Component(); };
  render(); effects.splice(0).forEach((run) => run()); await until(() => f.client.getState().phase === "ready");
  return render;
}
function nodes(tree, match, result = []) {
  if (!tree || typeof tree !== "object") return result;
  if (match(tree)) result.push(tree);
  React.Children.forEach(tree.props?.children, (child) => nodes(child, match, result));
  return result;
}
test("actual account page keeps saved preview and collection sign-in destination", async () => {
  const f = await fixture().mount(), render = await accountPageUI(f); f.edit();
  let html = renderToStaticMarkup(render()); assert.match(html, /href="\/collections\/a-saved"/); assert.doesNotMatch(html, /href="\/collections\/updated-link"/);
  f.change(null); html = renderToStaticMarkup(render()); assert.match(html, /next=%2Faccount%3Fsection%3Dcollection/); assert.doesNotMatch(html, /a@example.test|a-saved/); f.client.dispose();
});
test("uncertain account save disables editing but leaves Security actions usable", async () => {
  const f = await fixture().mount(), render = await accountPageUI(f);
  f.reply = async () => { throw new Error("Reply lost"); }; await f.client.save();
  let tree = render(); assert.equal(nodes(tree, (node) => node.type === "fieldset")[0].props.disabled, true);
  nodes(tree, (node) => node.type === "button" && node.props.children === "Security")[0].props.onClick();
  tree = render(); assert.equal(nodes(tree, (node) => node.type === "fieldset")[0].props.disabled, false);
  const signout = nodes(tree, (node) => node.type === "button" && renderToStaticMarkup(node).includes("Sign out"))[0];
  assert.equal(signout.props.disabled, false); await signout.props.onClick(); await tick();
  assert.equal(f.client.getState().phase, "signed-out"); assert.match(renderToStaticMarkup(render()), /next=%2Faccount%3Fsection%3Dsecurity/); f.client.dispose();
});

test("privacy intake remains outside account settings while a save is in flight or uncertain", async () => {
  const f = await fixture().mount(), render = await accountPageUI(f, "privacy");
  const gate = deferred(); f.reply = async () => { await gate.promise; throw new Error("Settings reply lost"); };
  const saving = f.client.save(); await tick();
  const tree = render(), fieldset = nodes(tree, node => node.type === "fieldset")[0];
  assert.equal(fieldset.props.disabled, true);
  const intake = nodes(tree, node => node.type?.name === "AccountDeletionSection");
  assert.equal(intake.length, 1); assert.equal(intake[0].props.actorId, "a"); assert.equal(typeof intake[0].props.auth, "function");
  assert.equal(nodes(fieldset, node => node.type?.name === "AccountDeletionSection").length, 0);
  gate.resolve(); await saving;
  assert.equal(f.client.getState().uncertainSave, true);
  assert.equal(nodes(render(), node => node.type?.name === "AccountDeletionSection").length, 1);
  f.client.dispose();
});

test("authenticated metadata failure preserves self privacy intake but sign-out removes it", async () => {
  const f = await fixture().mount(), render = await accountPageUI(f, "privacy");
  f.reply = async () => { throw new Error("Metadata unavailable"); }; await f.client.reload();
  assert.equal(f.client.getState().phase, "error");
  const intake = nodes(render(), node => node.type?.name === "AccountDeletionSection");
  assert.equal(intake.length, 1); assert.equal(intake[0].props.actorId, "a");
  f.change(null); assert.equal(nodes(render(), node => node.type?.name === "AccountDeletionSection").length, 0);
  f.client.dispose();
});
