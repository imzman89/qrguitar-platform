"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { AsyncLocalStorage } = require("node:async_hooks");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const repo = path.resolve(process.argv[2] || path.join(__dirname, "../../../.."));
const overlay = path.resolve(process.argv[3] || repo);
const req = createRequire(path.join(repo, "apps/web/package.json"));
const ts = req("typescript");
const React = req("next/dist/server/route-modules/app-page/vendored/rsc/react");
const renderer = req("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-webpack-server");
const nextCache = req("next/cache");
const requestFixture = new AsyncLocalStorage();
const syntheticSecret = "fixture-only-not-a-live-secret";
const actorA = "10000000-0000-4000-8000-000000000001";
const actorB = "10000000-0000-4000-8000-000000000002";
const current = () => { const scope = requestFixture.getStore(); assert(scope, "Fixture request context required"); return scope; };
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function scope(marker = "Public A", changes = {}) {
  return { published: { brandName: marker }, draft: { brandName: "Draft A" }, actor: actorA,
    now: Date.now(), role: "admin", status: "active", userExists: true, profileExists: true,
    previewHeader: false, configured: true, counts: { client: 0, published: 0, draft: 0, profile: 0, user: 0, headers: 0, cookies: 0, noStore: 0 }, ...changes };
}
function fixtureClient() {
  const scope = current(); scope.counts.client++;
  if (!scope.configured) return null;
  return { auth: { admin: { getUserById: async id => {
    scope.counts.user++;
    if (scope.authThrow) throw Error("fixture auth unavailable");
    return { error: scope.authError ? {} : null, data: { user: scope.userExists ? { id: scope.returnedActor || id, email: "editor@fixture.invalid" } : null } };
  } } }, from: table => ({ select: () => ({ eq: (_key, value) => ({ maybeSingle: async () => {
    await new Promise(resolve => setImmediate(resolve));
    if (table === "profiles") {
      scope.counts.profile++;
      return { error: scope.profileError ? {} : null, data: scope.profileExists ? { role: scope.role, account_status: scope.status } : null };
    }
    assert.equal(table, "site_content");
    if (value === "site-editor:draft") {
      scope.counts.draft++;
      return { error: scope.draftError ? {} : null, data: scope.draftMissing ? null : { content_value: { settings: clone(scope.draft) } } };
    }
    assert.equal(value, "homepage"); scope.counts.published++;
    if (scope.publishedThrow) throw Error("fixture published transport failure");
    return { error: scope.publishedError ? {} : null, data: scope.publishedMissing ? null : { content_value: clone(scope.published) } };
  } }) }) }) };
}
function sourceModules(useOverlay) {
  const modules = new Map(), hashes = [];
  const fakeProcess = { env: new Proxy({}, { get: (_obj, key) => {
    if (key === "QRGUITAR_PREVIEW_SECRET") return requestFixture.getStore()?.previewSecret || syntheticSecret;
    if (key === "QRGUITAR_ADMIN_EMAILS") return requestFixture.getStore()?.allowlisted ? "editor@fixture.invalid" : "";
    if (key === "NODE_ENV") return "test";
    return "";
  } }) };
  class FixtureDate extends Date { static now() { return requestFixture.getStore()?.now ?? Date.now(); } }
  function load(relative) {
    if (relative === "apps/web/lib/supabase-server.ts") return { createServerSupabaseClient: fixtureClient, getAuthenticatedUser: () => { throw Error("Unexpected live-user lookup"); } };
    if (modules.has(relative)) return modules.get(relative).exports;
    const candidate = useOverlay && fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(repo, relative);
    const raw = fs.readFileSync(candidate);
    hashes.push({ file: relative, source: candidate === path.join(repo, relative) ? "repository" : "proposal overlay", sha256: createHash("sha256").update(raw).digest("hex") });
    const source = raw.toString("utf8");
    const module = { exports: {} }; modules.set(relative, module);
    const resolve = id => {
      if (id === "react") return React;
      if (id === "next/cache") return { ...nextCache, unstable_noStore: () => { current().counts.noStore++; return nextCache.unstable_noStore(); } };
      if (id === "next/headers") return {
        headers: async () => { const s = current(); s.counts.headers++; if (s.headerThrow) throw Error("fixture headers unavailable"); return { get: name => name === "x-qrguitar-site-preview" && s.previewHeader ? "draft" : null }; },
        cookies: async () => { const s = current(); s.counts.cookies++; return { get: () => s.token ? { value: s.token } : undefined }; }
      };
      if (id.startsWith(".")) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), id));
        const resolved = [base + ".ts", base + ".tsx", base + "/index.ts"].find(file => fs.existsSync(path.join(repo, file)) || (useOverlay && fs.existsSync(path.join(overlay, file))));
        assert(resolved, "Unresolved fixture source " + id); return load(resolved);
      }
      return req(id);
    };
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: relative, reportDiagnostics: true });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    vm.runInNewContext(result.outputText, { module, exports: module.exports, require: resolve, process: fakeProcess, Date: FixtureDate,
      Buffer, URL, Request, Response, Headers, AbortController, AbortSignal, setTimeout, clearTimeout, setImmediate, structuredClone, console }, { filename: relative });
    return module.exports;
  }
  const api = load("apps/web/lib/site-settings-server.ts");
  const preview = load("apps/web/lib/site-preview.ts");
  const settings = load("apps/web/lib/site-settings.ts");
  return { api, preview, settings, hashes };
}
async function render(s, work) {
  let result, renderError;
  async function FixtureComponent() { result = await work(); return React.createElement("span", null, "settings request fixture"); }
  await requestFixture.run(s, async () => {
    const stream = await renderer.renderToReadableStream(React.createElement(FixtureComponent), {}, { onError(error) { renderError = error; return "fixture-render-error"; } });
    await new Response(stream).text();
  });
  if (renderError) throw renderError;
  return result;
}
function authorize(modules, s) { s.previewHeader = true; s.token = requestFixture.run(s, () => modules.preview.createSitePreviewToken(s.actor)); return s; }
async function fanout(api) {
  const [directA, wrappedA, directB, wrappedB] = await Promise.all([api.loadSiteSettingsRequest(), api.loadPublishedSiteSettings(), api.loadSiteSettingsRequest(), api.loadPublishedSiteSettings()]);
  const sequential = await api.loadSiteSettingsRequest();
  assert.strictEqual(directA, directB); assert.strictEqual(directA, sequential);
  assert.strictEqual(directA.settings, wrappedA); assert.strictEqual(wrappedA, wrappedB);
  return directA;
}
const passed = [], observations = [];
async function check(name, work) { await work(); passed.push(name); console.log("PASS " + name); }
async function main() {
  const proposed = sourceModules(true), api = proposed.api;
  const helper = fs.readFileSync(path.join(overlay, "apps/web/lib/site-settings-server.ts"), "utf8");
  assert(helper.includes("loadSiteSettingsRequest = cache("), "Test target must be the proposed or integrated cache wrapper");
  const repositoryHelper = fs.readFileSync(path.join(repo, "apps/web/lib/site-settings-server.ts"), "utf8");
  if (!repositoryHelper.includes("loadSiteSettingsRequest = cache(")) {
    const original = sourceModules(false), s = scope();
    await render(s, async () => { await Promise.all([original.api.loadSiteSettingsRequest(), original.api.loadPublishedSiteSettings(), original.api.loadSiteSettingsRequest(), original.api.loadPublishedSiteSettings()]); await original.api.loadSiteSettingsRequest(); });
    assert.equal(s.counts.published, 5); observations.push({ originalRscFanout: 5, counts: s.counts });
  }
  await check("Real installed Next RSC dispatcher coalesces direct and wrapper concurrent plus sequential calls", async () => {
    const s = scope(); const result = await render(s, () => fanout(api));
    assert.equal(result.settings.brandName, "Public A"); assert.equal(result.source, "published");
    assert.equal(s.counts.published, 1); assert.equal(s.counts.client, 1); assert.equal(s.counts.noStore, 1);
    observations.push({ proposedRscFanout: 1, counts: s.counts });
  });
  await check("Same render deliberately retains its first settings snapshot; later render observes publication", async () => {
    const s = scope(); await render(s, async () => { const first = await api.loadSiteSettingsRequest(); s.published = { brandName: "Public B" }; assert.strictEqual(await api.loadSiteSettingsRequest(), first); });
    const next = scope("Public B"); assert.equal((await render(next, () => fanout(api))).settings.brandName, "Public B"); assert.equal(next.counts.published, 1);
  });
  await check("Concurrent real RSC renders isolate authorized preview actor A from public actor B", async () => {
    const a = authorize(proposed, scope("Public A")), b = scope("Public B", { actor: actorB });
    const [draft, pub] = await Promise.all([render(a, () => fanout(api)), render(b, () => fanout(api))]);
    assert.equal(draft.source, "draft"); assert.equal(draft.settings.brandName, "Draft A"); assert.equal(pub.source, "published"); assert.equal(pub.settings.brandName, "Public B");
    assert.equal(a.counts.draft, 1); assert.equal(b.counts.draft, 0); assert.equal(b.counts.user, 0); assert.equal(b.counts.cookies, 0);
  });
  await check("Concurrent preview and invalid-role actor renders do not share authorization or draft", async () => {
    const a = authorize(proposed, scope()), b = authorize(proposed, scope("Public denied", { actor: actorB, role: "owner" }));
    const [active, denied] = await Promise.all([render(a, () => fanout(api)), render(b, () => fanout(api))]);
    assert.equal(active.source, "draft"); assert.equal(denied.source, "published"); assert.equal(denied.settings.brandName, "Public denied"); assert.equal(b.counts.draft, 0);
  });
  await check("Signed capability remains subject to fresh role and account eligibility on each new render", async () => {
    const active = authorize(proposed, scope()); assert.equal((await render(active, () => fanout(api))).source, "draft");
    for (const changes of [{ role: "owner" }, { status: "locked" }, { status: "banned" }, { status: "removed" }, { userExists: false }, { profileError: true }, { authError: true }, { authThrow: true }]) {
      const denied = scope("Public revoked", { ...changes, previewHeader: true, token: active.token });
      assert.equal((await render(denied, () => fanout(api))).source, "published"); assert.equal(denied.counts.draft, 0);
    }
  });
  await check("Mid-render revocation remains a read snapshot only; next render immediately denies", async () => {
    const s = authorize(proposed, scope());
    await render(s, async () => { const first = await api.loadSiteSettingsRequest(); s.role = "owner"; assert.strictEqual(await api.loadSiteSettingsRequest(), first); assert.equal(first.source, "draft"); });
    const next = scope("Public revoked", { role: "owner", token: s.token, previewHeader: true }); assert.equal((await render(next, () => fanout(api))).source, "published");
  });
  await check("Actual five-minute token expiry and signature rotation are reevaluated in later renders", async () => {
    const a = authorize(proposed, scope()); assert.equal((await render(a, () => fanout(api))).source, "draft");
    for (const changes of [{ now: a.now + 301000 }, { previewSecret: "different-fixture-only-secret" }]) {
      const next = scope("Public expired", { ...changes, token: a.token, previewHeader: true });
      assert.equal((await render(next, () => fanout(api))).source, "published"); assert.equal(next.counts.user, 0); assert.equal(next.counts.draft, 0);
    }
  });
  await check("Malformed capabilities and absent preview header never query a private draft", async () => {
    for (const token of ["", "malformed", "x." + "a".repeat(43)]) {
      const s = scope("Public invalid", { previewHeader: true, token }); assert.equal((await render(s, () => fanout(api))).source, "published"); assert.equal(s.counts.user, 0); assert.equal(s.counts.draft, 0);
    }
    const s = authorize(proposed, scope()); s.previewHeader = false; assert.equal((await render(s, () => fanout(api))).source, "published"); assert.equal(s.counts.cookies, 0); assert.equal(s.counts.draft, 0);
  });
  await check("Original allowlist semantics are preserved without inventing browser-session actor binding", async () => {
    const allowed = authorize(proposed, scope("Public", { role: "owner", allowlisted: true })); assert.equal((await render(allowed, () => fanout(api))).source, "draft");
    const denied = scope("Public", { role: "owner", previewHeader: true, token: allowed.token }); assert.equal((await render(denied, () => fanout(api))).source, "published");
  });
  await check("Draft errors missing data and malformed settings fall back to published in each request", async () => {
    for (const changes of [{ draftError: true }, { draftMissing: true }, { draft: null }]) {
      const s = authorize(proposed, scope("Public fallback", changes)); assert.equal((await render(s, () => fanout(api))).source, "published"); assert.equal(s.counts.draft, 1); assert.equal(s.counts.published, 1);
    }
  });
  await check("Missing backend and published errors/defaults are render-local and recover next request", async () => {
    for (const changes of [{ configured: false }, { publishedError: true }, { publishedMissing: true }]) {
      const s = scope("Unused", changes); const result = await render(s, () => fanout(api)); assert.strictEqual(result.settings, proposed.settings.defaultSiteSettings); assert.equal(result.source, "published"); assert.equal(s.counts.client, 1);
      const next = scope("Recovered"); assert.equal((await render(next, () => fanout(api))).settings.brandName, "Recovered"); assert.equal(next.counts.published, 1);
    }
  });
  await check("Rejected promise is coalesced only within real RSC render; later render retries", async () => {
    const s = scope("Unused", { publishedThrow: true });
    await render(s, async () => { const a = api.loadSiteSettingsRequest(), b = api.loadSiteSettingsRequest(); assert.strictEqual(a, b); const results = await Promise.allSettled([a, b]); assert.equal(results[0].status, "rejected"); assert.strictEqual(results[0].reason, results[1].reason); await assert.rejects(api.loadPublishedSiteSettings(), /fixture published transport failure/); });
    assert.equal(s.counts.published, 1); const next = scope("Retry recovered"); assert.equal((await render(next, () => fanout(api))).settings.brandName, "Retry recovered");
  });
  await check("Non-RSC route/email wrapper remains per-call fresh after data or eligibility changes", async () => {
    const s = scope(); await requestFixture.run(s, async () => { assert.equal((await api.loadPublishedSiteSettings()).brandName, "Public A"); s.published = { brandName: "Fresh email" }; assert.equal((await api.loadPublishedSiteSettings()).brandName, "Fresh email"); }); assert.equal(s.counts.published, 2);
    const active = authorize(proposed, scope()); await requestFixture.run(active, async () => { assert.equal((await api.loadSiteSettingsRequest()).source, "draft"); active.role = "owner"; assert.equal((await api.loadSiteSettingsRequest()).source, "published"); }); assert.equal(active.counts.user, 2);
  });
  await check("Non-RSC failed calls retry independently without cached rejection", async () => {
    const s = scope("Unused", { publishedThrow: true }); await requestFixture.run(s, async () => { await assert.rejects(api.loadPublishedSiteSettings()); s.publishedThrow = false; s.published = { brandName: "Outside retry" }; assert.equal((await api.loadPublishedSiteSettings()).brandName, "Outside retry"); }); assert.equal(s.counts.published, 2);
  });
  const receipt = { createdAt: new Date().toISOString(), result: "PASS", groups: passed.length, passed, observations, repo, overlay,
    nextVersion: req("next/package.json").version, ordinaryReactVersion: req("react/package.json").version, actualRscReactVersion: React.version,
    rendererPath: req.resolve("next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-webpack-server"), actualReactPath: req.resolve("next/dist/server/route-modules/app-page/vendored/rsc/react"), sourceDependencies: proposed.hashes,
    method: "Actual installed Next vendored RSC React.cache and matching renderToReadableStream create genuine request cache dispatchers. No handcrafted cache/Map mock; Map only loads TS modules. Actual loader, merge, preview signature/expiry and eligibility helper source execute with synthetic in-memory Supabase rows, auth replies and Next headers/cookies. Fake clock/env remain inside fixture VM; no live tokens, actors or backend I/O.",
    limitations: ["Not a live authenticated RSC route or live Supabase role mutation test.", "Request fanout fixture mirrors four code call sites plus a sequential lookup; actual deployed HTTP query timings not instrumented.", "No field/cold/LCP saving claim.", "In-render first-read snapshot is intentional and must never authorize writes."] };
  if (process.env.QRGUITAR_TEST_RECEIPT) fs.writeFileSync(process.env.QRGUITAR_TEST_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log("RESULT " + passed.length + " actual RSC settings-cache groups; serverReact " + React.version);
}
main().catch(error => { console.error(error.message.slice(0,900)); process.exitCode = 1; });
