import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(import.meta.url)("typescript");
const source = fs.readFileSync(path.join(root, "app/dashboard/page.tsx"), "utf8");
const tree = ts.createSourceFile("dashboard.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements = [];
function visit(node) {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);
function uniqueElement(predicate, description) {
  const matches = elements.filter(predicate);
  assert.equal(matches.length, 1, description + " must have exactly one actual JSX element");
  return matches[0];
}
function attribute(node, name) {
  return node.openingElement.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === name)?.initializer?.getText(tree);
}
const headerActions = uniqueElement(node => attribute(node, "className") === "{styles.headerActions}", "Dashboard header actions");
const collectionTool = uniqueElement(node => node.openingElement.tagName.getText(tree) === "Link" &&
  node.getText(tree).includes('"ui.app.dashboard.page.ownerDashboardPolicy.namedCollection"'), "Named-collection tool");

// Load only real pure text/registry modules; no browser, Auth or network adapters.
const modules = new Map();
function loadModule(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name.startsWith("."), "Text fixture must use only local pure modules");
    return loadModule(path.resolve(path.dirname(file), name + ".ts"));
  }, module, module.exports);
  return module.exports;
}
const { createUiText } = loadModule(path.join(root, "lib/ui-text.ts"));
const { getContentValue, contentRegistryByKey } = loadModule(path.join(root, "lib/content-registry.ts"));
const { uiTextEntries } = loadModule(path.join(root, "lib/ui-text-registry.ts"));
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join("") : typeof value === "string" || typeof value === "number" ? String(value) : value && typeof value === "object" ? text(value.props?.children) : "";
function render(node, accountType, handle, content = {}) {
  const code = ts.transpileModule("const element = (" + node.getText(tree) + ");", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const jsx = (type, props) => ({ type, props });
  return new Function("require", "exports", "Link", "Wrench", "FileSpreadsheet", "UsersRound", "styles", "collectionAccountType", "collectionHandle", "ui", "content", "getContentValue", code + "\nreturn element;")(
    name => { assert.equal(name, "react/jsx-runtime"); return { jsx, jsxs: jsx }; },
    {}, "Link", "Wrench", "FileSpreadsheet", "UsersRound", { headerActions: "headerActions" }, accountType, handle,
    createUiText(content, "app.dashboard.page"), content, getContentValue
  );
}
const links = element => nodes(element).filter(node => node.type === "Link").map(node => ({
  href: node.props.href, label: text(node).trim(), className: node.props.className
}));

test("existing named collections keep collection settings and create actions, not a publication toggle", () => {
  for (const type of ["player", "collector"]) assert.deepEqual(links(render(headerActions, type, "saved-collection")), [
    { href: "/create", label: "Create Profile", className: "button" },
    { href: "/account?section=collection", label: "Collection settings", className: "button secondary" }
  ]);
});
test("new collections use the same settings/create destinations without a publication setup action", () => {
  for (const type of ["", "player", "collector"]) assert.deepEqual(links(render(headerActions, type, "")), [
    { href: "/create", label: "Create Profile", className: "button" },
    { href: "/account?section=collection", label: "Collection settings", className: "button secondary" }
  ]);
});
test("service-provider workbench and own-instrument actions are preserved", () => {
  for (const handle of ["", "saved-collection"]) assert.deepEqual(links(render(headerActions, "luthier", handle)), [
    { href: "/dashboard/service", label: "Open service workbench", className: "button" },
    { href: "/create", label: "Add your own instrument", className: "button secondary" }
  ]);
});
test("shop and builder keep their separate import action", () => {
  for (const type of ["shop", "builder"]) assert.deepEqual(links(render(headerActions, type, "")), [
    { href: "/create", label: "Create Profile", className: "button" },
    { href: "/dashboard/import", label: "Bulk Import", className: "button secondary" }
  ]);
});
test("collection tool status follows the actual chosen handle, not publication", () => {
  for (const [handle, status] of [["saved-collection", "Named collection"], ["", "Collection details"]]) {
    const tool = render(collectionTool, "player", handle);
    assert.equal(tool.props.href, "/account?section=collection");
    assert.equal(text(tool).trim(), "Collection & inquiries " + status);
    assert.equal(tool.props.title, "Manage your collection name and member inquiries");
  }
});
test("actual registered CMS keys edit action/status text without changing destinations", () => {
  const overrides = {
    "dashboard.actions.create": "Edited create",
    "dashboard.actions.bulk": "Edited import",
    "ui.app.dashboard.page.ownerDashboardPolicy.collectionSettings": "Edited settings",
    "ui.app.dashboard.page.ownerDashboardPolicy.collectionSettingsHelp": "Edited inquiry help",
    "ui.app.dashboard.page.ownerDashboardPolicy.namedCollection": "Edited named",
    "ui.app.dashboard.page.ownerDashboardPolicy.collectionDetails": "Edited details",
    "ui.app.dashboard.page.2c8274b24de5": "Edited collection",
    "ui.app.dashboard.page.61669a91a83b": "Edited service",
    "ui.app.dashboard.page.3880eee7e45c": "Edited own instrument"
  };
  for (const key of Object.keys(overrides)) {
    assert.ok(contentRegistryByKey.has(key), key + " must be registered");
    if (key.startsWith("ui.")) {
      const entries = uiTextEntries.filter(entry => entry.key === key);
      assert.equal(entries.length, 1, key + " must be an active unique key");
      assert.equal(entries[0].scope, "app.dashboard.page");
      assert.equal(entries[0].source, "app/dashboard/page.tsx");
    }
  }
  for (const [type, labels] of [
    ["player", ["Edited create", "Edited settings"]],
    ["shop", ["Edited create", "Edited import"]],
    ["builder", ["Edited create", "Edited import"]],
    ["luthier", ["Edited service", "Edited own instrument"]]
  ]) {
    const before = links(render(headerActions, type, "saved-collection"));
    const after = links(render(headerActions, type, "saved-collection", overrides));
    assert.deepEqual(after.map(link => link.label), labels);
    assert.deepEqual(after.map(({ href, className }) => ({ href, className })), before.map(({ href, className }) => ({ href, className })));
  }
  for (const [handle, status] of [["saved-collection", "Edited named"], ["", "Edited details"]]) {
    const tool = render(collectionTool, "player", handle, overrides);
    assert.equal(tool.props.href, "/account?section=collection");
    assert.equal(text(tool).trim(), "Edited collection " + status);
    assert.equal(tool.props.title, "Edited inquiry help");
  }
});
