import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registry = read("lib/content-registry.ts");
const settings = read("lib/site-settings.ts");
const siteEditor = read("app/site-editor/page.tsx");
const compositionEditor = read("components/SiteCompositionEditor.tsx");
const runtimeFiles = [
  "components/Nav.tsx",
  "components/Footer.tsx",
  "app/page.tsx",
  "app/how-it-works/page.tsx",
  "app/how-it-works/HowItWorksClient.tsx",
  "app/catalog/page.tsx",
  "app/catalog/CatalogClient.tsx",
  "app/dashboard/page.tsx",
  "app/create/page.tsx",
  "app/edit/[code]/page.tsx",
  "components/BulkProfileImport.tsx",
  "app/account/page.tsx",
  "app/ownership-claim/page.tsx",
  "app/service-work/[code]/page.tsx",
  "app/service-review/[id]/page.tsx",
  "app/handout/[code]/page.tsx",
  "app/installers/page.tsx",
  "app/login/page.tsx",
  "app/reset-password/page.tsx",
  "app/contact/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "lib/transactional-email.ts",
  "lib/site-metadata.ts"
].map(read).join("\n");

const keys = [...registry.matchAll(/field\("([^"]+)"/g)].map((match) => match[1]);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
if (!keys.length || duplicates.length) throw new Error(`Content registry keys are missing or duplicated: ${[...new Set(duplicates)].join(", ")}`);

const requiredPages = [
  "Brand", "Header & Navigation", "Footer", "Shared CTAs and states", "Homepage", "How It Works", "Catalog",
  "Pricing", "Installers", "Dashboard", "Create Profile", "Edit Profile", "Bulk Import", "Account",
  "Public Collections", "Public Profile", "Print Workspace", "Ownership Claims", "Ownership Transfers",
  "Lost / Stolen", "Service Providers", "Service Review", "Login", "Reset Password", "Contact", "Privacy",
  "Terms", "Service", "Ownership", "Security", "Global"
];
for (const page of requiredPages) {
  if (!registry.includes(`\"${page}\"`)) throw new Error(`Content registry is missing ${page}.`);
}

for (const marker of ["allowedVariables", "validateContentValues", "validateVariables", "isSafeUrl", "security-locked", "editable-advanced"]) {
  if (!registry.includes(marker)) throw new Error(`Content registry is missing ${marker}.`);
}
for (const marker of ["content: Record<string, string>", "mergeContentValues", "defaultContentValues"]) {
  if (!settings.includes(marker)) throw new Error(`Site settings are missing ${marker}.`);
}
for (const marker of [
  "defaultEditorialComposition", "normalizeEditorialComposition", "validateEditorialComposition",
  "Section IDs must be unique", "Protected block", "Block IDs must be unique", "isSafeEditorialUrl",
  "Unsafe HTML or script content is not allowed"
]) {
  if (!settings.includes(marker)) throw new Error(`Editorial composition schema is missing ${marker}.`);
}
for (const marker of [
  "SiteCompositionEditor", "Move up", "Move down", "Duplicate", "Add item", "Remove", "Hide", "Show",
  "newBlockId", "text/cms-section", "text/cms-block", "Approved icon", "CTA URL"
]) {
  if (!compositionEditor.includes(marker) && !siteEditor.includes(marker)) throw new Error(`Repeatable composition editor is missing ${marker}.`);
}
for (const pageKey of ["home", "howItWorks", "catalog", "installers", "contact", "footer"]) {
  if (!settings.includes(`${pageKey}:`)) throw new Error(`Editorial composition is missing supported page ${pageKey}.`);
}
for (const blockId of ["how-step-create", "how-feature-identity", "how-role-player", "how-faq-serial"]) {
  if (!settings.includes(blockId)) throw new Error(`How It Works composition is missing ${blockId}.`);
}
for (const marker of ["contentRegistry", "Draft", "Published", "Revision history", "Advanced JSON"]) {
  if (!siteEditor.includes(marker)) throw new Error(`Content Studio is missing ${marker}.`);
}
if (!siteEditor.includes("cms-tree-search") || !siteEditor.includes('aria-label={`Search ${selected.page} content`}')) {
  throw new Error("Content Studio is missing its page-scoped accessible content search.");
}
for (const key of [
  "global.navigation.dashboard", "global.footer.description", "home.hero.headline", "howItWorks.hero.headline",
  "catalog.hero.headline", "dashboard.hero.headline", "create.hero.headline", "edit.hero.headline",
  "bulkImport.hero.headline", "account.hero.headline", "claimCenter.hero.headline", "serviceProviders.hero.headline",
  "serviceReview.hero.headline", "printWorkspace.scanInstruction", "login.hero.headline", "resetPassword.hero.headline",
  "contact.hero.headline", "privacy.hero.headline", "terms.hero.headline"
]) {
  if (!runtimeFiles.includes(key) && !settings.includes(key)) throw new Error(`Published content key is not connected to a runtime surface: ${key}.`);
}

for (const marker of [
  'id: "service.submitted"', 'id: "claim.approved"',
  'field(`email.${definition.id}.subject`', 'field(`email.${definition.id}.body`',
  'id: "home"', 'id: "catalog"', 'field(`seo.${definition.id}.title`', 'field(`seo.${definition.id}.description`'
]) {
  if (!registry.includes(marker)) throw new Error(`Content registry is missing managed email/SEO definition ${marker}.`);
}
for (const marker of ["loadPublishedSiteSettings", "renderRegisteredTemplateValue", "buildManagedPageMetadata"]) {
  if (!runtimeFiles.includes(marker)) throw new Error(`Managed content runtime is missing ${marker}.`);
}

const unresolvedMatch = registry.match(/unresolved:\s*(\d+)/);
if (!unresolvedMatch || Number(unresolvedMatch[1]) !== 0) throw new Error("Content coverage manifest contains unresolved strings.");

console.log(`Content coverage assertions passed (${keys.length} stable keys).`);
