import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(web, "lib/home-signup-layout.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("module", "exports", output)(module, module.exports);
const { homeSignupSections, mergeHomeSignupSections } = module.exports;
const section = (id, extra = {}) => ({ id, name: "Custom " + id, visible: true, blocks: [{ id: id + "-custom", title: "", body: "Owner's custom text", visible: true }], ...extra });
const saved = ["hero", "lifecycle", "anatomy", "roles", "continuity", "pricing", "archive", "finalCta"].map(id => section(id));

test("homepage exposes only its three editable sections in saved order and honors hidden sections", () => {
  const input = saved.map(item => item.id === "archive" ? { ...item, visible: false } : item);
  const before = JSON.stringify(input);
  const current = homeSignupSections(input);
  assert.deepEqual(current.map(item => [item.id, item.visible]), [["hero", true], ["roles", true], ["archive", false]]);
  assert.equal(current[1].name, "Free signup");
  assert.deepEqual(current[1].blocks, []);
  assert.equal(JSON.stringify(input), before);
});

test("reordering and hiding current sections retains every retired section and its optional blanks", () => {
  const before = JSON.stringify(saved);
  const edited = homeSignupSections(saved).reverse().map(item => item.id === "hero" ? { ...item, visible: false } : item);
  const merged = mergeHomeSignupSections(saved, edited);
  assert.deepEqual(homeSignupSections(merged).map(item => [item.id, item.visible]), [["archive", true], ["roles", true], ["hero", false]]);
  for (const original of saved.filter(item => !["hero", "archive", "roles"].includes(item.id))) {
    assert.strictEqual(merged.find(item => item.id === original.id), original);
  }
  assert.strictEqual(merged.find(item => item.id === "roles").blocks, saved.find(item => item.id === "roles").blocks);
  assert.equal(merged.find(item => item.id === "roles").name, "Custom roles");
  assert.equal(JSON.stringify(saved), before);
});

test("repeated editor projection and save round trips neither drop nor duplicate legacy content", () => {
  let current = saved;
  for (let index = 0; index < 3; index++) current = mergeHomeSignupSections(current, homeSignupSections(current));
  assert.deepEqual(current, mergeHomeSignupSections(saved, homeSignupSections(saved)));
  assert.deepEqual(current.map(item => item.id).sort(), saved.map(item => item.id).sort());
  assert.equal(new Set(current.map(item => item.id)).size, saved.length);
});

test("future unrendered saved sections survive edits without becoming visible homepage sections", () => {
  const future = section("future-editor-section");
  const input = [future, ...saved];
  const merged = mergeHomeSignupSections(input, homeSignupSections(input));
  assert.strictEqual(merged.find(item => item.id === future.id), future);
  assert.deepEqual(homeSignupSections(merged).map(item => item.id), ["hero", "roles", "archive"]);
});

const oldNames = ["Hero and latest Profile", "Profile lifecycle", "Profile anatomy", "Role and use cases", "Service, ownership, and provenance", "Profile access", "Public Profile archive", "Closing action"];
const oldDefault = saved.map((item, index) => ({ ...item, name: oldNames[index] }));
test("only the known legacy default adopts gallery-before-signup without altering visibility or content", () => {
  const input = oldDefault.map(item => item.id === "archive" ? { ...item, visible: false } : item);
  const before = JSON.stringify(input);
  assert.deepEqual(homeSignupSections(input).map(item => [item.id, item.visible]), [["hero", true], ["archive", false], ["roles", true]]);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(homeSignupSections([...input].reverse()).map(item => item.id), ["archive", "roles", "hero"]);
  assert.deepEqual(homeSignupSections(input.map(item => item.id === "roles" ? { ...item, name: "Gary's arrangement" } : item)).map(item => item.id), ["hero", "roles", "archive"]);
});
test("an explicit saved owner order remains authoritative even when it matches the old visible order", () => {
  const projected = homeSignupSections(oldDefault);
  const edited = ["hero", "roles", "archive"].map(id => projected.find(item => item.id === id));
  const firstSave = mergeHomeSignupSections(oldDefault, edited);
  assert.deepEqual(homeSignupSections(firstSave).map(item => item.id), ["hero", "roles", "archive"]);
  const secondSave = mergeHomeSignupSections(firstSave, homeSignupSections(firstSave));
  assert.deepEqual(secondSave, firstSave);
  for (const original of oldDefault.filter(item => !["hero", "roles", "archive"].includes(item.id))) assert.strictEqual(secondSave.find(item => item.id === original.id), original);
});
