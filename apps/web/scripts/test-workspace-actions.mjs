import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports);
  return module.exports;
}
const tools = load("lib/workspace-tools.ts");
const { WorkspaceActions } = load("components/WorkspaceActions.tsx", {
  "../lib/workspace-tools": tools,
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "lucide-react": { ArrowUpRight: () => null },
  "./WorkspaceActions.module.css": new Proxy({}, { get: (_, key) => key })
});
test("every workspace's daily tools render actual local routes without changing account permissions", () => {
  assert.deepEqual(tools.WORKSPACE_OPTIONS.map(({ value }) => value), ["player", "collector", "shop", "builder", "luthier", "other"]);
  for (const { value } of tools.WORKSPACE_OPTIONS) {
    const workspace = tools.getWorkspace(value);
    const html = renderToStaticMarkup(React.createElement(WorkspaceActions, { accountType: value }));
    assert.match(html, /Change workspace type/);
    assert.match(html, /\/account\?section=profile/);
    assert.equal(workspace.actions.length, new Set(workspace.actions.map(({ href }) => href)).size);
    for (const action of workspace.actions) {
      const url = new URL(action.href, "https://test.invalid");
      assert.equal(url.origin, "https://test.invalid");
      assert.equal(fs.existsSync(path.join(root, "app", url.pathname, "page.tsx")), true, `${value}: ${url.pathname}`);
      assert.ok(html.includes(action.href.replaceAll("&", "&amp;")));
    }
    assert.deepEqual(Object.keys(workspace).sort(), ["actions", "description", "label", "title"]);
  }
});
test("claim links describe acquisition while builder handoffs lead to the owner's saved Profiles", () => {
  for (const role of ["player", "collector", "other"]) {
    const action = tools.getWorkspace(role).actions.find(({ href }) => href === "/ownership-claim");
    assert.equal(action.title, "Claim an instrument"); assert.doesNotMatch(action.description, /incoming claims|ownership handoffs/);
  }
  const transfer = tools.getWorkspace("builder").actions.find(({ title }) => title === "Transfer an instrument");
  assert.equal(transfer.href, "/dashboard#saved-profiles");
  assert.match(fs.readFileSync(path.join(root, "app/dashboard/page.tsx"), "utf8"), /id="saved-profiles"/);
  assert.match(transfer.description, /choose|Choose/);
});
test("seller and provider workspaces lead to their daily work while unknown values safely fall back", () => {
  assert.equal(tools.getWorkspace("luthier").actions[0].href, "/dashboard/service");
  for (const role of ["shop", "builder"]) assert.equal(tools.getWorkspace(role).actions[0].href, "/account?section=collection");
  for (const value of ["admin", "__proto__", "constructor", {}, null, undefined]) assert.equal(tools.getWorkspace(value), tools.getWorkspace("player"));
  assert.equal(tools.getWorkspace("brand"), tools.getWorkspace("builder"));
});
