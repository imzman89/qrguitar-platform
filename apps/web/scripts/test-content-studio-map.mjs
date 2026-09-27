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
