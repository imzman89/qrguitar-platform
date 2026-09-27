import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  new Function("require", "module", "exports", code)((name) => name.startsWith(".")
    ? load(path.relative(webRoot, path.resolve(path.dirname(file), name + ".ts")))
    : require(name), module, module.exports);
  return module.exports;
}

const registry = load("lib/content-registry.ts");
const { emailTemplateDeliveryBoundary } = load("lib/email-template-boundary.ts");
const { uiTextEntries } = load("lib/ui-text-registry.ts");
const uiByKey = new Map(uiTextEntries.map((entry) => [entry.key, entry]));
const sourceFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "site-editor") collect(file);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const relative = path.relative(webRoot, file).replaceAll("\\", "/");
    if (["lib/content-registry.ts", "lib/ui-text-registry.ts"].includes(relative)) continue;
    sourceFiles.push({ relative, text: fs.readFileSync(file, "utf8") });
  }
}

for (const directory of ["app", "components", "lib"]) collect(path.join(webRoot, directory));

const publicPages = new Set([
  "Homepage", "How It Works", "Catalog", "Contact", "Installers", "Privacy", "Terms",
  "Collections", "Public Collections", "Public Profile", "Footer", "Header & Navigation"
]);
const administratorPages = new Set([
  "Admin", "Admin Payments", "Admin Promotions", "Admin Service Workflow",
  "Site Composition Editor", "Revision history", "Copy coverage", "Advanced JSON"
]);
const recordRequiredPages = new Set([
  "Profile Editor", "Public Profile", "Print Workspace", "Service Review",
  "Ownership Transfers", "Unavailable Page"
]);

function audienceFor(entry) {
  if (entry.area === "Emails") return ["delivery-recipient", "administrator"];
  if (entry.area === "SEO") return ["public-visitor", "search-crawler", "administrator"];
  if (administratorPages.has(entry.page) || entry.page.startsWith("Admin")) return ["administrator"];
  if (publicPages.has(entry.page) || entry.area === "Marketing" || entry.area === "Support & Legal") return ["public-visitor"];
  if (/Dashboard|Account|Owner|Editor|Billing|Messages|Transfer|Service/.test(entry.page)) return ["signed-in-member", "administrator"];
  return ["public-or-signed-in-user"];
}

function previewFor(entry) {
  if (entry.area === "Emails") return {
    mode: "inline-template-preview",
    route: null,
    note: "Previewed inside Content Studio with sample variables; this is not proof of provider delivery."
  };
  if (recordRequiredPages.has(entry.page)) return {
    mode: "record-required",
    route: null,
    note: "No fabricated ID is used. Open a real permitted record in the live product to inspect this state."
  };
  if (entry.previewPath) return {
    mode: "representative-route",
    route: entry.previewPath.split(/[?#]/, 1)[0] || "/",
    note: "Safe representative route only; conditional data and state may still be required for this exact field."
  };
  return {
    mode: "unavailable",
    route: null,
    note: "No safe standalone representative route is available for this field."
  };
}

function bindingFor(entry) {
  const uiEntry = uiByKey.get(entry.key);
  if (uiEntry) {
    const sourcePath = path.join(webRoot, uiEntry.source);
    const sourceText = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
    const connected = sourceText.includes(entry.key);
    return {
      kind: "typed-ui-copy",
      status: connected ? "connected-interface-call" : "registered-awaiting-source-integration",
      sourceFiles: [uiEntry.source],
      note: connected
        ? "The source contains the registered key/default pair; the UI registry test enforces this connection."
        : "The registry reservation is present, but this branch does not yet contain the matching source call."
    };
  }
  if (entry.key.startsWith("email.") && emailTemplateDeliveryBoundary(entry.key.slice(0, entry.key.lastIndexOf("."))).kind === "application") return {
    kind: "transactional-email",
    status: "application-renderer-bound",
    sourceFiles: [entry.key.startsWith("email.service.submitted.") ? "lib/transactional-email.ts" : "lib/action-required-email-delivery.ts"],
    note: "Published wording is rendered by application workflow delivery when runtime and database controls are enabled; binding does not prove activation or inbox delivery."
  };
  if (entry.key.startsWith("email.security.passwordReset.")) return {
    kind: "provider-auth-email",
    status: "provider-owned-export-artifact",
    sourceFiles: ["docs/provider-email-templates/supabase-recovery.html"],
    note: "Supabase Auth owns recovery delivery. Content Studio is a review reference; the install artifact preserves the provider placeholder."
  };
  if (entry.key.startsWith("email.ownership.transferInvitation.")) return {
    kind: "provider-auth-email",
    status: "provider-owned-export-artifact",
    sourceFiles: ["docs/provider-email-templates/supabase-magic-link.html"],
    note: "Supabase Auth owns transfer sign-in delivery. Content Studio is a review reference; the provider cannot consume the profile-specific CMS variables."
  };
  if (entry.key.startsWith("email.")) return {
    kind: "transactional-email",
    status: "editor-preview-only",
    sourceFiles: [],
    note: "Editable design preview only; no application or provider delivery trigger is bound."
  };
  if (entry.key.startsWith("seo.")) return {
    kind: "seo-metadata",
    status: "registry-family-binding",
    sourceFiles: ["lib/seo.ts", "lib/site-settings-server.ts"],
    note: "Resolved through the typed SEO registry family rather than literal key calls."
  };
  const refs = sourceFiles.filter((file) => file.text.includes(entry.key)).map((file) => file.relative);
  return {
    kind: "site-copy",
    status: refs.length ? "literal-runtime-reference" : "registry-only-review-required",
    sourceFiles: refs,
    note: refs.length
      ? "At least one non-editor runtime source contains this exact key."
      : "No non-editor exact-key literal was found; dynamic family binding or retirement must be verified before claiming a rendered surface."
  };
}

const surfaces = registry.contentRegistry.map((entry) => ({
  key: entry.key,
  area: entry.area,
  page: entry.page,
  section: entry.section,
  label: entry.label,
  editorLocation: `Content Studio / ${entry.area} / ${entry.page} / ${entry.section}`,
  fieldType: entry.type,
  classification: entry.classification,
  editable: entry.classification !== "security-locked",
  required: entry.required !== false,
  maxLength: entry.maxLength,
  allowedVariables: entry.allowedVariables || [],
  allowedValues: entry.allowedValues || [],
  defaultValue: entry.defaultValue,
  audience: audienceFor(entry),
  publishBehavior: entry.classification === "security-locked"
    ? "locked-not-publishable"
    : "shared-draft-atomic-global-publish",
  preview: previewFor(entry),
  binding: bindingFor(entry)
}));

const counts = surfaces.reduce((result, surface) => {
  result.total += 1;
  result.byClassification[surface.classification] = (result.byClassification[surface.classification] || 0) + 1;
  result.byBindingStatus[surface.binding.status] = (result.byBindingStatus[surface.binding.status] || 0) + 1;
  result.byPreviewMode[surface.preview.mode] = (result.byPreviewMode[surface.preview.mode] || 0) + 1;
  return result;
}, { total: 0, byClassification: {}, byBindingStatus: {}, byPreviewMode: {} });

const document = {
  schemaVersion: 1,
  sourceBaseline: "ea717cfe93ec47d952b21d2cf43b040167052f44",
  editorRoutes: ["/admin/site-editor", "/site-editor"],
  publicationModel: {
    draft: "One shared server draft; ordinary fields autosave.",
    publish: "A publish applies the complete validated draft atomically across the site.",
    rollback: "Published revisions can be copied into a new draft and require a separate publish.",
    preview: "Draft preview uses an administrator-scoped signed preview session; published preview clears that session.",
    boundary: "Content Studio edits presentation settings only, never saved member/Profile/account data."
  },
  emailBoundary: {
    applicationRendererBoundPrefixes: [...new Set(registry.contentRegistry.filter(entry => entry.key.startsWith("email.")).map(entry => entry.key.slice(0, entry.key.lastIndexOf("."))).filter(prefix => emailTemplateDeliveryBoundary(prefix).kind === "application"))].sort().map(prefix => prefix + "."),
    applicationTestSendPrefix: "email.service.submitted.",
    providerOwnedPrefixes: ["email.security.passwordReset.", "email.ownership.transferInvitation."],
    allOtherEmailTemplates: "editor-preview-only",
    authProviderTemplates: "reviewed install artifacts; Content Studio does not configure or synchronize the authentication provider"
  },
  previewBoundary: "Representative routes prove routing and draft/published rendering only. Conditional, record-specific, and session-return states require a real permitted record or state and are never fabricated.",
  counts,
  surfaces
};

const output = path.join(repoRoot, "docs", "content-studio-map.json");
const { surfaces: mapSurfaces, ...metadata } = document;
const compactSurfaces = mapSurfaces.map((surface) => `    ${JSON.stringify(surface)}`).join(",\n");
const serialized = `${JSON.stringify(metadata, null, 2).slice(0, -1)},\n  "surfaces": [\n${compactSurfaces}\n  ]\n}\n`;
fs.writeFileSync(output, serialized);
console.log(`Wrote ${path.relative(repoRoot, output)} with ${surfaces.length} keys.`);

