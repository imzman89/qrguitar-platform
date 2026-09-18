import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = fs.readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} }; cache.set(filename, module);
  const localRequire = (specifier) => {
    if (specifier.endsWith(".module.css")) return { link: "seller-link" };
    if (!specifier.startsWith(".")) return require(specifier);
    const target = path.resolve(path.dirname(filename), specifier);
    const extension = [".ts", ".tsx"].find((suffix) => fs.existsSync(target + suffix));
    return load(target + extension);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}
const { cleanCollectionWebsite } = load("lib/public-collections.ts");
const { getWorkspace, WORKSPACE_OPTIONS } = load("lib/workspace-tools.ts");
const { SellerWebsiteLink } = load("components/SellerWebsiteLink.tsx");

test("pasted website keeps its destination path, query and fragment", () => {
  assert.equal(cleanCollectionWebsite(" HTTPS://SHOP.EXAMPLE/guitars?ref=QR#stock "), "https://shop.example/guitars?ref=QR#stock");
  const unicodeUrl = cleanCollectionWebsite("https://shop.example/café");
  assert.equal(cleanCollectionWebsite(unicodeUrl), unicodeUrl);
  assert.equal(cleanCollectionWebsite("https://shop.example/" + "é".repeat(100)), "");
});
for (const input of ["https://", "shop.example", "//shop.example", "http://shop.example", "javascript:alert(1)", "https://user:password@shop.example", "https://shop.example\\@other.example", "https://shop.example/has space", "https://shop.example/" + "x".repeat(500), {}, null]) test("unsafe or incomplete website cannot render a link: " + JSON.stringify(input), () => {
  assert.equal(cleanCollectionWebsite(input), "");
  assert.equal(renderToStaticMarkup(React.createElement(SellerWebsiteLink, { websiteUrl: input, publicName: "Shop", accountType: "shop" })), "");
});
test("shop link exposes destination and opens safely without promising checkout", () => {
  const html = renderToStaticMarkup(React.createElement(SellerWebsiteLink, { websiteUrl: "https://www.shop.example/store", publicName: "My shop", accountType: "shop" }));
  assert.match(html, /href="https:\/\/www.shop.example\/store"/);
  assert.match(html, /Visit shop website/);
  assert.match(html, /shop.example/);
  assert.match(html, /opens in a new tab/);
  const rel = html.match(/\srel="([^"]+)"/)?.[1].split(/\s+/) || [];
  for (const token of ["ugc", "nofollow", "noopener", "noreferrer"]) assert.ok(rel.includes(token), `missing rel=${token}`);
  assert.doesNotMatch(html, /Buy now|Checkout/);
});
test("every supported workspace offers valid local daily actions", () => {
  for (const option of WORKSPACE_OPTIONS) {
    const workspace = getWorkspace(option.value);
    assert.ok(workspace.title && workspace.description);
    assert.equal(workspace.actions.length, 3);
    for (const action of workspace.actions) {
      assert.match(action.href, /^\/(account|dashboard|installers|ownership-claim)/);
      assert.ok(action.title && action.description);
    }
  }
});
test("repair tools lead with the workbench while seller tools lead with website setup", () => {
  assert.equal(getWorkspace("luthier").actions[0].href, "/dashboard/service");
  for (const role of ["shop", "builder"]) assert.equal(getWorkspace(role).actions[0].title, "Connect your website");
});
test("unknown roles have a safe workspace fallback and legacy brands retain builder tools", () => {
  for (const input of ["admin", "__proto__", "constructor", null, ""]) assert.equal(getWorkspace(input), getWorkspace("player"));
  assert.equal(getWorkspace("brand"), getWorkspace("builder"));
});
