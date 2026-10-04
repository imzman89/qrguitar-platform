import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();

function compile(file, imports) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (imports && Object.hasOwn(imports, name)) return imports[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.normalize(path.join(path.dirname(file), name + ".ts"));
    if (!cache.has(target)) cache.set(target, compile(target));
    return cache.get(target);
  }, module, module.exports);
  return module.exports;
}

const registry = compile("lib/content-registry.ts");
const { uiTextEntries, retiredUiTextEntries } = compile("lib/ui-text-registry.ts");
const { protectedUiTextKeys } = compile("lib/ui-text-protection.ts");
const lockedKey = "ui.app.ownership.claim.page.fead057ffd73";
const ordinaryKey = "ui.app.account.page.73949bb1bdba";

test("audited UI protection keys exist and are locked in Content Studio", () => {
  const registered = new Set([...uiTextEntries, ...retiredUiTextEntries].map((entry) => entry.key));
  for (const key of protectedUiTextKeys) {
    assert.ok(registered.has(key), `Missing audited key ${key}`);
    assert.equal(registry.contentRegistryByKey.get(key)?.classification, "security-locked", key);
  }
  assert.equal(registry.contentRegistryByKey.get(ordinaryKey)?.classification, "editable-standard");
});

test("protected comparison preserves approved published overrides and allows ordinary edits", () => {
  const published = { ...registry.defaultContentValues, [lockedKey]: "Previously approved ownership warning." };
  const candidate = { ...published, [ordinaryKey]: "Account details" };
  assert.deepEqual(registry.validateProtectedContentValues(candidate, published), {});
  candidate[lockedKey] = "Scanning transfers ownership.";
  assert.match(registry.validateProtectedContentValues(candidate, published)[lockedKey], /protected wording/);
  assert.match(registry.validateProtectedContentValues({ ...published, "claimCenter.security.warning": "Scanning transfers ownership." }, published)["claimCenter.security.warning"], /protected wording/);
});

function harness({ publishedOverride = "", publishedVersion = "p1", draftVersion = "d1", revision = null } = {}) {
  const published = merge({ content: { [lockedKey]: publishedOverride || registry.defaultContentValues[lockedKey] } });
  const calls = [];
  const state = { publishedValue: published, publishedVersion, draftVersion, draftValue: null, revisionRows: [] };
  const supabase = {
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "read_site_editor_state") return { data: state, error: null };
      assert.equal(name, "mutate_site_editor");
      if (args.p_request.expectedPublishedVersion !== publishedVersion || args.p_request.expectedDraftVersion !== draftVersion) {
        return { data: null, error: { code: "QSE01" } };
      }
      return { data: { state, before: published, changedFields: [ordinaryKey], requestId: args.p_request.requestId }, error: null };
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: revision ? { content_value: { settings: revision } } : null }) }) }) })
  };
  const route = compile("app/api/site-editor/route.ts", {
    "next/cache": { unstable_noStore() {}, revalidatePath() {} },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "../../../lib/site-editor-server": {
      mapEditorState: (raw) => ({ published: merge(raw.publishedValue), publishedVersion: raw.publishedVersion, draftVersion: raw.draftVersion }),
      editorFailure: (code) => ({ status: code === "QSE01" ? 409 : 503, body: { ok: false, conflict: code === "QSE01" } }),
      finishEditorCommit: async (result, invalidate) => { await invalidate(); return { result, warning: "" }; }
    },
    "../../../lib/admin-auth": { getAdminContext: async () => ({ ok: true, user: { id: "actor" }, email: "editor@example.test" }), readAdminEmailList: () => ["editor@example.test"] },
    "../../../lib/content-registry": registry,
    "../../../lib/site-settings": { mergeSiteSettings: merge, publishedSiteSettingsKey: "homepage", validateBrandLogoEntries: () => ({}), validateEditorialComposition: () => ({}), validateSiteThemeContrast: () => ({}) },
    "../../../lib/supabase-server": { createServerSupabaseClientWithTimeout: () => supabase }
  });
  return { route, calls, published };
}

function merge(raw) {
  return {
    brandName: raw?.brandName || "QRguitar",
    colors: raw?.colors || { background: "#0b0d0f", gold: "#f5aa28" },
    seo: raw?.seo || { canonicalUrl: "https://www.qrguitar.com" },
    composition: raw?.composition || {},
    content: registry.mergeContentValues(raw?.content)
  };
}

const wire = { expectedPublishedVersion: "p1", expectedDraftVersion: "d1", expectedActorId: "actor", requestId: "00000000-0000-4000-8000-000000000001" };
const request = (body) => ({ json: async () => body });

test("server allows an ordinary change while retaining approved locked wording", async () => {
  const approved = "Previously approved ownership warning.";
  const h = harness({ publishedOverride: approved });
  const settings = merge({ content: { ...h.published.content, [ordinaryKey]: "Account details" } });
  const response = await h.route.PUT(request({ ...wire, action: "publish", settings }));
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, ["read_site_editor_state", "mutate_site_editor"]);
});

for (const action of ["save_draft", "publish", "restore_revision"]) {
  test(`server rejects protected wording mutation during ${action}`, async () => {
    const h = harness({ revision: merge({ content: { [lockedKey]: "Scanning transfers ownership." } }) });
    const settings = merge({ content: { [lockedKey]: "Scanning transfers ownership." } });
    const response = await h.route.PUT(request({ ...wire, action, settings, revisionId: "site-editor:revision:example" }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).errors[lockedKey], /protected wording/);
    assert.deepEqual(h.calls, ["read_site_editor_state"]);
  });
}

test("stale requests reach the atomic RPC for conflict or receipt replay", async () => {
  const h = harness();
  const settings = merge({ content: { [lockedKey]: "Scanning transfers ownership." } });
  const response = await h.route.PUT(request({ ...wire, expectedDraftVersion: "stale", action: "save_draft", settings }));
  assert.equal(response.status, 409);
  assert.deepEqual(h.calls, ["read_site_editor_state", "mutate_site_editor"]);
});
