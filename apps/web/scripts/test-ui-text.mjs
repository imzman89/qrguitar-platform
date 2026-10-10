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
const { uiTextEntries, retiredUiTextEntries } = load("lib/ui-text-registry.ts");
const { protectedUiTextKeys } = load("lib/ui-text-protection.ts");

test("every connected interface call has a unique registered key, matching default and required placeholders", () => {
  const seen = new Set(), entries = new Map(uiTextEntries.map(entry => [entry.key, entry]));
  assert.equal(entries.size, uiTextEntries.length);
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!file.endsWith(".tsx")) continue;
      if (path.relative(root, file).replaceAll("\\", "/") === "components/HomePagePresentation.tsx") {
        function assertUnused(directory) {
          for (const candidate of fs.readdirSync(directory, { withFileTypes: true })) {
            const candidatePath = path.join(directory, candidate.name);
            if (candidate.isDirectory()) { assertUnused(candidatePath); continue; }
            if (!/\.tsx?$/.test(candidate.name) || candidatePath === file) continue;
            assert.doesNotMatch(fs.readFileSync(candidatePath, "utf8"), /\bHomePagePresentation\b/, "Retained compatibility module became connected: "+candidatePath);
          }
        }
        for (const directory of ["app", "components", "lib"]) assertUnused(path.join(root, directory));
        continue;
      }

      const source = fs.readFileSync(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const uiAliases = new Set(["ui"]);
      function findUiAliases(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && ["useUiText", "createUiText"].includes(node.initializer.expression.getText(ast))) uiAliases.add(node.name.text);
        ts.forEachChild(node, findUiAliases);
      }
      findUiAliases(ast);
      function visit(node) {
        if (ts.isCallExpression(node) && uiAliases.has(node.expression.getText(ast))) {
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

test("Content Studio email preview keeps accessible colors inside the light simulation card", () => {
  const css = fs.readFileSync(path.join(root, "app/site-editor/site-editor.module.css"), "utf8");
  const declarations = (selector) => {
    const escaped = selector.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
    assert.ok(match, "Missing scoped email preview rule: " + selector);
    return match[1];
  };
  const property = (selector, name) => {
    const match = declarations(selector).match(new RegExp(name + ":\\s*(#[0-9a-f]{6})", "i"));
    assert.ok(match, "Missing " + name + " in scoped email preview rule: " + selector);
    return match[1];
  };
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
    const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const card = ".studio.studio :global(.cms-email-preview article)";
  const background = property(card, "background");
  for (const selector of [
    ".studio.studio :global(.cms-email-preview article h3)",
    ".studio.studio :global(.cms-email-preview article p)",
    ".studio.studio :global(.cms-email-preview .cms-email-kicker)",
    ".studio.studio :global(.cms-email-preview article small)",
    ".studio.studio :global(.cms-email-preview .cms-email-brand span)",
  ]) assert.ok(contrast(property(selector, "color"), background) >= 4.5, selector + " must meet 4.5:1 contrast");
  const button = ".studio.studio :global(.cms-email-preview .cms-email-button)";
  assert.ok(contrast(property(button, "color"), property(button, "background")) >= 4.5, "Email preview button must meet 4.5:1 contrast");
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
  assert.equal(registry.contentPreviewPathForUiText("app/billing/DirectBillingPage.tsx", "Billing"), "/billing/manual");
  assert.equal(registry.contentPreviewPathForUiText("app/billing/BillingPage.tsx", "Billing"), undefined);
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

 test("removed editor controls retain compatible saved values without active UI bindings", () => {
 assert.ok(retiredUiTextEntries.length >= 8, "retain the original compatibility controls as new retired controls are added");
 assert.equal(new Set(retiredUiTextEntries.map(entry=>entry.key)).size, retiredUiTextEntries.length);
 const originalControls = [
 ["ui.app.edit.code.page.bf60214d782d","Edit Profile sections"],
 ["ui.app.edit.code.page.999f23fcd7be","Identity"],
 ["ui.app.edit.code.page.5e3147ab51e0","Photos"],
 ["ui.app.edit.code.page.d677190e0a99","Service"],
 ["ui.app.edit.code.page.b9920fd79715","Current section"],
 ["ui.app.edit.code.page.c5a754da6b5d","Edit Profile section"],
 ["ui.app.edit.code.page.4a87047e033b","Saving and returning..."],
 ["ui.app.edit.code.page.3c53caf4d68d","Save and Return to Dashboard"]
 ];
 for(const [key,text] of originalControls) {
 assert.equal(retiredUiTextEntries.find(entry=>entry.key===key)?.text,text,"preserve original retired key/default "+key);
 }
 for(const entry of retiredUiTextEntries){
 assert.equal(uiTextEntries.some(active=>active.key===entry.key),false);
 const field=registry.contentRegistryByKey.get(entry.key); assert.ok(field);
 assert.equal(field.defaultValue,entry.text); assert.equal(field.classification,protectedUiTextKeys.has(entry.key) ? "security-locked" : "editable-advanced");
 assert.match(field.help,/removed editor control/);
 const variables = entry.text.match(/\{\{[^{}]+\}\}/g) || [];
 assert.equal(registry.validateContentValues({...registry.defaultContentValues,[entry.key]:"Previously saved label "+variables.join(" ")})[entry.key],undefined);
 if(variables.length) assert.ok(registry.validateContentValues({...registry.defaultContentValues,[entry.key]:"Missing the required application value"})[entry.key]);
 }
 });


test("actual CMS audit writer codes render editable readable admin labels", () => {
  const source = fs.readFileSync(path.join(root, "app/admin/page.tsx"), "utf8");
  const ast = ts.createSourceFile("admin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ["actionLabel", "statLabel"].includes(node.name?.text)).map(node => node.getText(ast)).join("\n");
  const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const { actionLabel, statLabel } = new Function(code + "\nreturn { actionLabel, statLabel }; ")();
  const writer = fs.readFileSync(path.resolve(root, "../../supabase/migrations/20260911003500_atomic_site_editor.sql"), "utf8");
  assert.match(writer, /v_action_name := case when v_action='save_draft' then 'site_draft_saved'/);
  assert.match(writer, /v_action_name := 'site_content_published'/);
  const pairs = [
    ["site_content_published", "ui.app.admin.page.siteContentPublished", "Website content published"],
    ["site_draft_saved", "ui.app.admin.page.siteDraftSaved", "Website draft saved"]
  ];
  for (const [action, key, label] of pairs) {
    assert.equal(actionLabel(action), label, "Persisted lowercase event must have a readable default");
    assert.equal(actionLabel(action.toUpperCase()), label, "Reviewed uppercase alias remains compatible");
    const edited = "Edited " + label;
    assert.equal(actionLabel(action, createUiText({ [key]: edited }, "app.admin.page")), edited);
    assert.equal(actionLabel(action, createUiText({ [key]: edited }, "different.scope")), label);
    assert.equal(renderToStaticMarkup(React.createElement("strong", null, actionLabel(action))), "<strong>" + label + "</strong>");
  }
  assert.equal(actionLabel("lock"), "Account locked");
  assert.equal(actionLabel("user_banned"), "User banned");
  for (const action of ["unknown_event", "Site_content_published", "customAction", ""]) assert.equal(actionLabel(action), statLabel(action));
});
