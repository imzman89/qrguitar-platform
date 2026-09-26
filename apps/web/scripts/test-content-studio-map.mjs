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
  assert.equal(byKey.get("email.ownership.transferInvitation.subject").binding.status, "editor-preview-only");
  assert.equal(map.emailBoundary.authProviderTemplates.includes("does not configure"), true);
  for (const surface of map.surfaces) {
    if (surface.preview.mode !== "representative-route") continue;
    assert.match(surface.preview.route, /^\/(?:[^\\?#]*)$/);
    assert.ok(!/\[[^\]]+\]/.test(surface.preview.route));
    assert.notEqual(surface.preview.route, "/site-editor");
  }
});

