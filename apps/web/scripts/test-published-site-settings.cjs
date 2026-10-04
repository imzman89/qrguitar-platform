"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { webcrypto, createHash } = require("node:crypto");
const sourceRoot = path.resolve(process.argv[2] || path.resolve(__dirname, "../../.."));
const sourceFile = path.join(sourceRoot, "apps/web/lib/site-settings.ts");
const sourceRequire = createRequire(sourceFile);
const ts = sourceRequire("typescript");
const source = fs.readFileSync(sourceFile, "utf8");
assert.match(source, /const publishedSettingsRequests = new Map/, "Run only after reviewed in-flight map is integrated");
const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true);
const original = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "fetchPublishedSiteSettings");
assert(original && original.parameters.length === 0, "Source function contract changed");
const modified = source;
const passed = [];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
const fixture = () => ({
  brandName: "QRguitar",
  content: { "home.hero.headline": "Concurrent published content", "qa.ephemeral": "mock-only" },
  sections: { howCards: [{ title: "Scan", copy: "Open the permanent Profile." }] }
});
function makeSubject({ crypto = webcrypto } = {}) {
  const calls = [];
  const window = { location: { search: "" } };
  let clock = 100;
  const DateMock = class extends Date { static now() { return ++clock; } };
  const context = vm.createContext({
    TextEncoder, URLSearchParams, Uint8Array, structuredClone, Date: DateMock,
    crypto, window, console,
    fetch: (url, options) => {
      const wait = deferred();
      calls.push({ url, options, wait });
      return wait.promise;
    }
  });
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const localRequire = createRequire(file);
    const requireFrom = spec => {
      if (!spec.startsWith(".")) return localRequire(spec);
      const base = path.resolve(path.dirname(file), spec);
      const target = [base, base + ".ts", base + ".tsx", base + ".js", path.join(base, "index.ts")]
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw new Error("Unresolved local dependency: " + spec);
      return /\.[cm]?js$/.test(target) ? localRequire(target) : load(target);
    };
    const input = file === path.resolve(sourceFile) ? modified : fs.readFileSync(file, "utf8");
    const output = ts.transpileModule(input, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: file,
      reportDiagnostics: true
    });
    const errors = output.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) || [];
    assert.equal(errors.length, 0, "Proposed source has transpile diagnostics");
    const testHook = file === path.resolve(sourceFile) ? "\nglobalThis.__testPublishedSettingsRequests = publishedSettingsRequests;" : "";
    const run = new vm.Script("(function(exports,require,module,__filename,__dirname){" + output.outputText + testHook + "\n})", { filename: file }).runInContext(context);
    run(module.exports, requireFrom, module, file, path.dirname(file));
    return module.exports;
  }
  const api = load(sourceFile);
  return { api, calls, window, context };
}
function respond(call, settings = fixture(), ok = true) {
  call.wait.resolve({ ok, json: async () => ({ ok, settings }) });
}
function assertPublic(call) {
  assert.equal(call.options.cache, "no-store");
  assert.equal(call.options.headers["Cache-Control"], "no-store");
  assert.equal(call.options.credentials, "omit");
  assert(!call.url.includes("cmsPreview"));
}
async function check(name, fn) {
  await fn();
  passed.push(name);
  process.stdout.write("PASS " + name + "\n");
}
(async () => {
  await check("Four simultaneous published reads share one GET and four isolated normalized results", async () => {
    const s = makeSubject();
    const pending = Array.from({ length: 4 }, () => s.api.fetchPublishedSiteSettings());
    await tick();
    assert.equal(s.calls.length, 1);
    assertPublic(s.calls[0]);
    assert.match(s.calls[0].url, /defaults=[a-f0-9]{64}/);
    respond(s.calls[0]);
    const results = await Promise.all(pending);
    assert(results.every(result => result.content["home.hero.headline"] === "Concurrent published content"));
    for (const result of results.slice(1)) {
      assert.notEqual(result, results[0]);
      assert.notEqual(result.content, results[0].content);
      assert.notEqual(result.sections, results[0].sections);
      assert.notEqual(result.sections.howCards, results[0].sections.howCards);
      assert.notEqual(result.sections.howCards[0], results[0].sections.howCards[0]);
      assert.notEqual(result.colors, results[0].colors);
      assert.notEqual(result.composition, results[0].composition);
    }
    results[0].content["home.hero.headline"] = "Mutated caller only";
    results[0].sections.howCards[0].title = "Changed";
    results[0].colors.text = "#000000";
    assert(results.slice(1).every(result => result.content["home.hero.headline"] === "Concurrent published content" && result.sections.howCards[0].title === "Scan"));
    assert.notEqual(results[1].colors.text, "#000000");
  });
  await check("Settled success never caches later independent refreshes", async () => {
    const s = makeSubject();
    const first = s.api.fetchPublishedSiteSettings();
    await tick(); respond(s.calls[0]); await first;
    const second = s.api.fetchPublishedSiteSettings();
    await tick();
    assert.equal(s.calls.length, 2);
    assert.notEqual(s.calls[0].url, s.calls[1].url);
    respond(s.calls[1], { content: { "home.hero.headline": "Updated published" } });
    assert.equal((await second).content["home.hero.headline"], "Updated published");
  });
  await check("Rejected concurrent GET clears state and retry performs a new GET", async () => {
    const s = makeSubject();
    const reads = [s.api.fetchPublishedSiteSettings(), s.api.fetchPublishedSiteSettings()];
    await tick(); s.calls[0].wait.reject(new Error("Mock transport failure"));
    assert((await Promise.all(reads)).every(result => result === null));
    const retry = s.api.fetchPublishedSiteSettings(); await tick();
    assert.equal(s.calls.length, 2);
    respond(s.calls[1]); assert(await retry);
  });
  await check("HTTP failure, malformed JSON and ok:false clear in-flight state", async () => {
    const s = makeSubject();
    const first = s.api.fetchPublishedSiteSettings(); await tick();
    s.calls[0].wait.resolve({ ok: false }); assert.equal(await first, null);
    const second = s.api.fetchPublishedSiteSettings(); await tick();
    s.calls[1].wait.resolve({ ok: true, json: async () => { throw new Error("Mock malformed JSON"); } });
    assert.equal(await second, null);
    const third = s.api.fetchPublishedSiteSettings(); await tick();
    s.calls[2].wait.resolve({ ok: true, json: async () => ({ ok: false, settings: fixture() }) });
    assert.equal(await third, null);
    const fourth = s.api.fetchPublishedSiteSettings(); await tick(); respond(s.calls[3]); assert(await fourth);
    assert.equal(s.calls.length, 4);
  });
  await check("Absent WebCrypto keeps full-response fallback and normalization", async () => {
    const s = makeSubject({ crypto: {} });
    const reads = [s.api.fetchPublishedSiteSettings(), s.api.fetchPublishedSiteSettings()];
    await tick(); assert.equal(s.calls.length, 1);
    assert(!s.calls[0].url.includes("defaults=")); assertPublic(s.calls[0]);
    respond(s.calls[0], s.api.defaultSiteSettings);
    const results = await Promise.all(reads);
    assert.equal(results[0].brandName, s.api.defaultSiteSettings.brandName);
    assert.notEqual(results[0], results[1]);
  });
  await check("Rejected fingerprint keeps full-response fallback", async () => {
    const s = makeSubject({ crypto: { subtle: { digest: async () => { throw new Error("Mock hash failure"); } } } });
    const read = s.api.fetchPublishedSiteSettings(); await tick();
    assert(!s.calls[0].url.includes("defaults="));
    respond(s.calls[0]); assert(await read);
  });
  await check("Draft reads never coalesce and preserve same-origin authorized context", async () => {
    const s = makeSubject(); s.window.location.search = "?cmsPreview=draft";
    const reads = [s.api.fetchPublishedSiteSettings(), s.api.fetchPublishedSiteSettings()];
    await tick(); assert.equal(s.calls.length, 2);
    assert(s.calls.every(call => call.url.includes("cmsPreview=draft") && call.options.credentials === "same-origin" && call.options.cache === "no-store"));
    respond(s.calls[0], { content: { "home.hero.headline": "Draft A" } });
    respond(s.calls[1], { content: { "home.hero.headline": "Draft B" } });
    const results = await Promise.all(reads);
    assert.equal(results[0].content["home.hero.headline"], "Draft A");
    assert.equal(results[1].content["home.hero.headline"], "Draft B");
  });
  await check("Preview transitions during pending fingerprint isolate public and draft reads", async () => {
    const hash = deferred();
    const s = makeSubject({ crypto: { subtle: { digest: () => hash.promise } } });
    const publicRead = s.api.fetchPublishedSiteSettings();
    s.window.location.search = "?cmsPreview=draft";
    const draftRead = s.api.fetchPublishedSiteSettings();
    s.window.location.search = "";
    const publicRead2 = s.api.fetchPublishedSiteSettings();
    hash.resolve(new Uint8Array(32).buffer); await tick();
    assert.equal(s.calls.length, 2);
    const pub = s.calls.find(call => !call.url.includes("cmsPreview"));
    const draft = s.calls.find(call => call.url.includes("cmsPreview"));
    assertPublic(pub); assert.equal(draft.options.credentials, "same-origin");
    respond(pub, { content: { "home.hero.headline": "Public only" } });
    respond(draft, { content: { "home.hero.headline": "Private draft only" } });
    const results = await Promise.all([publicRead, draftRead, publicRead2]);
    assert.equal(results[0].content["home.hero.headline"], "Public only");
    assert.equal(results[1].content["home.hero.headline"], "Private draft only");
    assert.equal(results[2].content["home.hero.headline"], "Public only");
  });
  await check("Preview transitions during pending fetch never cross-share payloads", async () => {
    const s = makeSubject();
    const pub = s.api.fetchPublishedSiteSettings(); await tick();
    s.window.location.search = "?cmsPreview=draft";
    const draft = s.api.fetchPublishedSiteSettings(); await tick();
    s.window.location.search = "";
    const pub2 = s.api.fetchPublishedSiteSettings(); await tick();
    assert.equal(s.calls.length, 2);
    respond(s.calls[1], { content: { "home.hero.headline": "Draft pending" } });
    respond(s.calls[0], { content: { "home.hero.headline": "Public pending" } });
    const results = await Promise.all([pub, draft, pub2]);
    assert.deepEqual(results.map(result => result.content["home.hero.headline"]), ["Public pending", "Draft pending", "Public pending"]);
  });
  await check("Map identity includes endpoint and fingerprint, not fresh-only nonce", async () => {
    assert.match(source, /const key = \x60\/api\/site-settings\$\{fingerprint/);
    assert.match(source, /publishedSettingsRequests\.get\(key\)/);
    const s = makeSubject();
    vm.runInContext('__testPublishedSettingsRequests.set("/different-endpoint?defaults=abc", Promise.resolve({brandName:"Wrong endpoint"})); __testPublishedSettingsRequests.set("/api/site-settings?defaults=different", Promise.resolve({brandName:"Wrong fingerprint"}));', s.context);
    const read = s.api.fetchPublishedSiteSettings(); await tick();
    assert.equal(s.calls.length, 1); respond(s.calls[0]); assert.equal((await read).brandName, "QRguitar");
  });
  await check("Current compact overrides, empty values and legacy bindings stay compatible", async () => {
    const s = makeSubject();
    const input = { brandName: "Legacy brand", hero: { headline: "Legacy heading" },
      content: { "home.hero.headline": "", "custom.saved.key": "Retained" }, instrumentCategories: [] };
    const expected = s.api.mergeSiteSettings(input);
    const read = s.api.fetchPublishedSiteSettings(); await tick(); respond(s.calls[0], input);
    const result = await read;
    assert.equal(result.content["home.hero.headline"], expected.content["home.hero.headline"]);
    assert.equal(result.content["custom.saved.key"], expected.content["custom.saved.key"]);
    assert.equal(result.content["global.brand.name"], expected.content["global.brand.name"]);
    assert.equal(result.instrumentCategories.length, 0);
    assert.notEqual(result.content, expected.content);
  });
  const receipt = {
    createdAt: new Date().toISOString(), status: "actual-integrated-source focused mock tests passed",
    passed, sourceFile, sourceSha256: createHash("sha256").update(source).digest("hex"),
    method: "Actual integrated site-settings TypeScript and mergeSiteSettings dependencies evaluated unchanged in isolated VM; only test-internal map accessor exposed. No proposal substitution. All fetch/crypto-failure/window contexts mocked. No source, runtime, backend or CMS writes.",
    limitations: ["Not a browser post-fix trace", "No full TypeScript project typecheck", "Draft server authorization not re-tested here; preserved existing server behavior"],
    requestContract: { publishedCredentials: "omit", draftCredentials: "same-origin", cache: "no-store", settledCache: false }
  };
  if (process.argv[3]) fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(receipt, null, 2) + "\n");
  console.log("RESULT " + passed.length + " focused checks passed; source/runtime untouched.");
})().catch(error => { console.error((error?.stack || String(error)).slice(0, 1400)); process.exitCode = 1; });



