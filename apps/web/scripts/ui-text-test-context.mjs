import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../lib/ui-text.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
new Function("module", "exports", code)(module, module.exports);

// Existing controller/render fixtures have their own fake hook runtimes. Give
// them the real pure text resolver without adding unrelated hook slots. Actual
// React provider + overrides are tested separately in test-ui-text.mjs.
export function withUiTextTestContext(baseRequire, content = {}) {
  return (name) => /(?:^|\/)UiTextProvider$/.test(name)
    ? { useUiText: (scope) => module.exports.createUiText(content, scope), useUiTextContent: () => content }
    : baseRequire(name);
}
