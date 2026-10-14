import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const cache = new Map();

function load(relative) {
  const file = path.join(webRoot, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("require", "module", "exports", code)((name) => name.startsWith(".")
    ? load(path.relative(webRoot, path.resolve(path.dirname(file), name + ".ts")))
    : require(name), module, module.exports);
  return module.exports;
}

const registry = load("lib/content-registry.ts");
const { retiredUiTextEntries } = load("lib/ui-text-registry.ts");
const { protectedUiTextKeys } = load("lib/ui-text-protection.ts");
const map = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "content-studio-map.json"), "utf8"));

test("content map inventories every registered field exactly once", () => {
  const registryKeys = registry.contentRegistry.map((entry) => entry.key).sort();
  const mapKeys = map.surfaces.map((entry) => entry.key).sort();
  assert.equal(new Set(mapKeys).size, mapKeys.length);
  assert.deepEqual(mapKeys, registryKeys);
  assert.equal(map.counts.total, registryKeys.length);
  for (const surface of map.surfaces) {
    assert.equal(surface.editorLocation, `Content Studio / ${surface.area} / ${surface.page} / ${surface.section}`);
    assert.ok(surface.audience.length);
    assert.ok(surface.binding.status);
  }
});

test("content map distinguishes representative, record-required, and delivery boundaries", () => {
  const byKey = new Map(map.surfaces.map((entry) => [entry.key, entry]));
  assert.equal(byKey.get("profile.tabs.overview").preview.mode, "record-required");
  assert.equal(byKey.get("profile.tabs.overview").preview.route, null);
  assert.equal(byKey.get("email.service.submitted.subject").binding.status, "application-renderer-bound");
  assert.equal(byKey.get("email.ownership.transferInvitation.subject").binding.status, "provider-owned-export-artifact");
  const deliveryNotice = byKey.get("ui.app.site.editor.page.emailDeliveryBoundary");
  assert.equal(deliveryNotice.classification, "security-locked");
  assert.equal(deliveryNotice.binding.status, "connected-interface-call");
  assert.match(deliveryNotice.defaultValue, /Supabase Auth templates require separate provider setup/);
  assert.equal(map.emailBoundary.applicationRendererBoundPrefixes.length, 12);
  assert.equal(map.emailBoundary.applicationTestSendPrefix, "email.service.submitted.");
  assert.equal(byKey.get("email.claim.approved.subject").binding.status, "application-renderer-bound");
  assert.equal(byKey.get("email.service.resubmitted.subject").binding.status, "editor-preview-only");
  assert.equal(map.emailBoundary.authProviderTemplates.includes("does not configure or synchronize"), true);
  for (const surface of map.surfaces) {
    if (surface.preview.mode !== "representative-route") continue;
    assert.match(surface.preview.route, /^\/(?:[^\\?#]*)$/);
    assert.ok(!/\[[^\]]+\]/.test(surface.preview.route));
    assert.notEqual(surface.preview.route, "/site-editor");
  }
});

test("claim withdrawal copy is typed, connected, and mapped to the real workflow", () => {
  const byKey = new Map(map.surfaces.map((entry) => [entry.key, entry]));
  const expected = new Map([
    ["withdrawRequest", "Withdraw request"],
    ["withdrawConfirmTitle", "Withdraw this ownership request?"],
    ["withdrawConfirmBody", "This closes the pending request. Ownership and submitted evidence stay unchanged. A withdrawn request cannot be reopened."],
    ["withdrawConfirmAction", "Yes, withdraw request"],
    ["keepRequest", "Keep request"],
    ["withdrawingRequest", "Withdrawing request..."],
    ["withdrawSuccess", "Ownership request withdrawn."],
    ["withdrawConflict", "This request changed before it could be withdrawn. Refresh the latest status and try again."],
    ["withdrawFailure", "Could not withdraw this request. Refresh its status and try again."],
    ["withdrawRefreshFailure", "The saved request status could not be loaded. Refresh before taking another action."],
  ]);
  for (const [suffix, defaultValue] of expected) {
    const entry = byKey.get("ui.app.ownership.claim.page." + suffix);
    assert.ok(entry, "Missing claim withdrawal map entry: " + suffix);
    assert.equal(entry.defaultValue, defaultValue);
    assert.equal(entry.editorLocation, "Content Studio / Product / Ownership Claims / Request withdrawal");
    assert.equal(entry.binding.status, "connected-interface-call");
    assert.deepEqual(entry.binding.sourceFiles, ["app/ownership-claim/page.tsx"]);
    assert.equal(entry.preview.mode, "representative-route");
    assert.equal(entry.preview.route, "/ownership-claim");
  }
});

test("retired interface controls remain inventoried without claiming a rendered binding", () => {
  const byKey = new Map(map.surfaces.map((entry) => [entry.key, entry]));
  for (const entry of retiredUiTextEntries) {
    const surface = byKey.get(entry.key);
    assert.ok(surface, "Missing retained legacy key: " + entry.key);
    assert.equal(surface.classification, protectedUiTextKeys.has(entry.key) ? "security-locked" : "editable-advanced");
    assert.equal(surface.defaultValue, entry.text);
    assert.equal(surface.binding.status, "retired-compatible-saved-value");
    assert.deepEqual(surface.binding.sourceFiles, [entry.source]);
  }
});

test("retired security warnings preserve independent locks and reject changed wording", () => {
  const byKey = new Map(map.surfaces.map((entry) => [entry.key, entry]));
  const expectedLockedKeys = [
    "ui.app.create.page.dba16601d30d",
    "ui.app.dashboard.page.e5d3af1efed5",
    "ui.app.edit.code.page.a8782c988bf8",
    "ui.app.edit.code.page.51e39f20046d",
    "ui.app.handout.code.page.5c027d45a7ce",
    "ui.components.ProfileQuickEdit.b281350e38d8"
  ];
  for (const key of expectedLockedKeys) {
    assert.ok(retiredUiTextEntries.some((entry) => entry.key === key), "Expected retained warning: " + key);
    assert.ok(protectedUiTextKeys.has(key), "Audited warning must stay protected: " + key);
    assert.equal(byKey.get(key)?.classification, "security-locked", "Map must not downgrade a retired warning: " + key);
    assert.equal(registry.contentRegistryByKey.get(key)?.classification, "security-locked");
    const published = { ...registry.defaultContentValues, [key]: "Previously approved retained warning." };
    assert.deepEqual(registry.validateProtectedContentValues(published, published), {});
    const changed = { ...published, [key]: "Changed protected wording." };
    assert.match(registry.validateProtectedContentValues(changed, published)[key], /protected wording/);
  }
});

test("retired homepage section fields preserve values and advertise no live preview binding", () => {
  const byKey = new Map(map.surfaces.map(entry => [entry.key, entry]));
  assert.equal(registry.retiredHomepageContentKeys.size, 28);
  let required = 0, optional = 0;
  for (const key of registry.retiredHomepageContentKeys) {
    const entry = registry.contentRegistryByKey.get(key), surface = byKey.get(key);
    assert.ok(entry && surface, key);
    assert.equal(entry.section, "Legacy editor controls (not displayed)");
    assert.equal(entry.classification, "editable-advanced");
    assert.equal(surface.classification, entry.classification);
    assert.equal(surface.defaultValue, entry.defaultValue);
    assert.equal(surface.binding.status, "retired-compatible-saved-value");
    assert.deepEqual(surface.binding.sourceFiles, ["components/HomePageClient.tsx"]);
    assert.equal(surface.preview.mode, "unavailable");
    assert.equal(surface.preview.route, null);
    assert.equal(entry.previewPath, undefined);
    if (entry.required) required++; else optional++;
  }
  assert.deepEqual({ required, optional }, { required: 19, optional: 9 });
});
