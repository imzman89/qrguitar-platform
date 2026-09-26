import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const cache = new Map();
function load(relative) {
  const file = path.join(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = fs.readFileSync(file, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((name) => name.startsWith(".")
    ? load(path.relative(root, path.resolve(path.dirname(file), name + (name.endsWith("UiTextProvider") ? ".tsx" : ".ts")))) : require(name), module, module.exports);
  return module.exports;
}
const { createUiText } = load("lib/ui-text.ts");
const { UiTextProvider, useUiText } = load("components/UiTextProvider.tsx");
const registry = load("lib/content-registry.ts");
const { uiTextEntries } = load("lib/ui-text-registry.ts");

test("every connected interface call has a unique registered key, matching default and required placeholders", () => {
  const seen = new Set(), entries = new Map(uiTextEntries.map(entry => [entry.key, entry]));
  assert.equal(entries.size, uiTextEntries.length);
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!file.endsWith(".tsx")) continue;
      const source = fs.readFileSync(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === "ui") {
          assert.ok(ts.isStringLiteral(node.arguments[0]) && ts.isStringLiteral(node.arguments[1]), `Explicit source key/default required: ${file}`);
          const key = node.arguments[0].text, original = node.arguments[1].text;
          const entry = entries.get(key); assert.ok(entry, `Missing registration: ${key}`); assert.equal(entry.text, original);
          const registered = registry.contentRegistryByKey.get(key); assert.ok(registered);
          for (const variable of original.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(registered.allowedVariables.includes(variable[1]));
          seen.add(key);
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  for (const directory of ["app", "components", "lib"]) walk(path.join(root, directory));
  for (const entry of uiTextEntries) assert.ok(seen.has(entry.key) || entry.scope === "workspace", `Unconnected CMS control: ${entry.key}`);
  assert.ok(seen.size > 3000);
  assert.deepEqual(registry.validateContentValues(registry.defaultContentValues), {});
});

test("published overrides render server-side without extra markup and never become HTML", () => {
  const entry = uiTextEntries.find(entry => entry.source === "components/Nav.tsx" && entry.text === "Account");
  assert.ok(entry);
  function Subject() { const ui = useUiText(entry.scope); return React.createElement("button", null, ui(entry.key, entry.text)); }
  const render = content => renderToStaticMarkup(React.createElement(UiTextProvider, { content }, React.createElement(Subject)));
  assert.equal(render({}), "<button>Account</button>");
  assert.equal(render({ [entry.key]: "My account" }), "<button>My account</button>");
  assert.equal(render({ [entry.key]: "<script>bad()</script>" }), "<button>&lt;script&gt;bad()&lt;/script&gt;</button>");
  assert.equal(render({}), "<button>Account</button>", "Another request must not inherit overrides");
});

test("copy preserves required application values and does not recursively interpolate their contents", () => {
  const ui = createUiText({ "ui.test.count": "{{count}} photographs for {{name}}" }, "test");
  assert.equal(ui("ui.test.count", "{{name}}: {{count}}", { count: 2, name: "{{count}}" }), "2 photographs for {{count}}");
  const entry = uiTextEntries.find(entry => entry.text.includes("{{value1}}"));
  const content = { ...registry.defaultContentValues, [entry.key]: "Missing the dynamic value" };
  assert.match(registry.validateContentValues(content)[entry.key], /Keep the/);
  assert.equal(createUiText({}, "test")("ui.test.literal", "Untouched Profile owner data"), "Untouched Profile owner data");
});

test("workspace wording changes labels, never destinations or stored account-type values", () => {
  const { getWorkspace, WORKSPACE_OPTIONS } = load("lib/workspace-tools.ts");
  const entry = uiTextEntries.find(entry => entry.scope === "workspace" && entry.text === "Share your collection");
  const before = getWorkspace("player"), after = getWorkspace("player", { [entry.key]: "My collection page" });
  assert.equal(after.actions[0].title, "My collection page");
  assert.deepEqual(after.actions.map(action => action.href), before.actions.map(action => action.href));
  assert.deepEqual(WORKSPACE_OPTIONS.map(option => option.value), ["player", "collector", "shop", "builder", "luthier", "other"]);
});

test("UI copy preview routes are real safe representatives, not fabricated record links", () => {
  assert.equal(registry.contentPreviewPathForUiText("app/dashboard/page.tsx", "Dashboard"), "/dashboard");
  assert.equal(registry.contentPreviewPathForUiText("app/account/page.tsx", "Account"), "/account");
  assert.equal(registry.contentPreviewPathForUiText("components/Nav.tsx", "Nav"), "/");
  assert.equal(registry.contentPreviewPathForUiText("app/site-editor/page.tsx", "Site Composition Editor"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/i/[code]/ProfileClient.tsx", "Public Profile"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/edit/[code]/page.tsx", "Profile Editor"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/unavailable/page.tsx", "Unavailable Page"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/admin/site-editor/page.tsx", "Site Composition Editor"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/billing/paypal/return/page.tsx", "Billing"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/messages/[conversationId]/page.tsx", "Messages"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("components/QRGuitarBotPopup.tsx", "QRGuitar Bot Popup"), undefined);
  assert.equal(registry.contentPreviewPathForUiText("app/admin/payments/AdminPaymentsPage.tsx", "Admin Payments"), "/admin/payments");
  const publicProfileEntries = registry.contentRegistry.filter((entry) => entry.page === "Public Profile");
  const homeEntries = registry.contentRegistry.filter((entry) => entry.page === "Homepage");
  assert.equal(registry.contentPreviewPathForSelection(publicProfileEntries, "Public Profile"), undefined);
  assert.equal(registry.contentPreviewPathForSelection(homeEntries, "Homepage"), "/");
  for (const entry of uiTextEntries) {
    const previewPath = registry.contentRegistryByKey.get(entry.key)?.previewPath;
    if (!previewPath) continue;
    assert.match(previewPath, /^\/(?:[^\\?#]*)$/);
    assert.ok(!/\[[^\]]+\]/.test(previewPath), `Fabricated route parameter for ${entry.key}: ${previewPath}`);
  }
});
