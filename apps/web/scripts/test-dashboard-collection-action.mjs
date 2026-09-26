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
let expression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression?.getText(tree).includes('"ui.app.dashboard.page.managePublicCollection"')) expression = node.expression.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(expression, "Dashboard collection action must use state-aware copy");
const label = new Function("collectionAccountType", "collectionHandle", "ui", `return ${expression};`);
const ui = (_key, fallback) => fallback;

test("existing public collection has a management action, not setup", () => {
  assert.equal(label("player", "saved-collection", ui), "Manage public collection");
  assert.equal(label("collector", "saved-collection", ui), "Manage public collection");
});
test("new or unpublished collection keeps its setup action", () => {
  assert.equal(label("player", "", ui), "Set up public collection");
});
test("service-provider own-instrument action is preserved", () => {
  assert.equal(label("luthier", "saved-collection", ui), "Add your own instrument");
});
