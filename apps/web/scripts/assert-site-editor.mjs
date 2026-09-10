import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const route = read("app/api/site-editor/route.ts");
const previewRoute = read("app/api/site-editor/preview/route.ts");
const page = read("app/site-editor/page.tsx");
const preview = read("lib/site-preview.ts");
const settingsServer = read("lib/site-settings-server.ts");
const middleware = read("middleware.ts");
const compositionEditor = read("components/SiteCompositionEditor.tsx");
const settings = read("lib/site-settings.ts");
const howItWorksPage = read("app/how-it-works/page.tsx");
const howItWorksClient = read("app/how-it-works/HowItWorksClient.tsx");
const layout = read("app/layout.tsx");
const metadata = read("lib/site-metadata.ts");
const themeRuntime = read("components/ThemeRuntime.tsx");

for (const marker of ["site-editor:draft", "site-editor:revision:", "save_draft", "restore_revision", "validateContentValues", "mutate_site_editor", "read_site_editor_state"]) {
  if (!route.includes(marker)) throw new Error(`Site Editor API is missing ${marker}.`);
}
for (const marker of ["crashRecovery", "executeEditor", "publish", "restoreRevision", "discardDraft", "previewPath", "Revision history", "Advanced JSON", "Read-only by default", "Unlock editor", "Download backup", "Fix highlighted content and ensure primary text and actions meet 4.5:1 contrast before publishing.", "Send test to my admin email", "/api/site-editor/test-email"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio is missing ${marker}.`);
}
for (const marker of ["SiteCompositionEditor", "compositionPageKey", "settings.composition"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio composition integration is missing ${marker}.`);
}
for (const marker of ["draggable", "text/cms-section", "text/cms-block", "Move up", "Move down", "Duplicate", "Add item", "Remove", "Hide", "Show", "newBlockId"]) {
  if (!compositionEditor.includes(marker)) throw new Error(`Content Studio block control is missing ${marker}.`);
}
for (const marker of ["validateEditorialComposition", "Block IDs must be unique", "Protected block", "Unsafe HTML or script content is not allowed", "This required section must stay shown in its fixed position."]) {
  if (!settings.includes(marker)) throw new Error(`Content Studio composition validation is missing ${marker}.`);
}
for (const marker of ["issueDraftPreview", "<iframe", "Desktop preview", "Tablet preview", "Mobile preview", "Open full preview", "Draft", "Published"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio actual-page preview is missing ${marker}.`);
}
for (const marker of ["getAdminContext", "createSitePreviewToken", "isSitePreviewAuthorized", "safePreviewPath", "httpOnly", "X-Robots-Tag", "noindex, nofollow"]) {
  if (!previewRoute.includes(marker)) throw new Error(`Site Editor preview route is missing ${marker}.`);
}
for (const marker of ["createHmac", "timingSafeEqual", "PREVIEW_TTL_SECONDS", "verifySitePreviewToken"]) {
  if (!preview.includes(marker)) throw new Error(`Site Editor preview authorization is missing ${marker}.`);
}
for (const marker of ["sitePreviewCookie", "sitePreviewDraftKey", "isSitePreviewAuthorized"]) {
  if (!settingsServer.includes(marker)) throw new Error(`Draft preview content source is missing ${marker}.`);
}
for (const marker of ["qrguitar_site_preview", "X-Robots-Tag", "noindex, nofollow", "no-store"]) {
  if (!middleware.includes(marker)) throw new Error(`Preview middleware is missing ${marker}.`);
}
if (/mock\s+(draft\s+)?preview/i.test(page)) throw new Error("Content Studio still contains a mock-only preview.");
for (const marker of ["resolveVisibleEditorialSections", "loadPublishedSiteSettings", "revalidatePublishedSettings", 'revalidatePath("/", "layout")']) {
  if (![settings, howItWorksPage, howItWorksClient, route].some((source) => source.includes(marker))) {
    throw new Error(`Published section visibility is missing ${marker}.`);
  }
}
if (!howItWorksPage.includes("loadPublishedSiteSettings") || !howItWorksClient.includes("visibleSectionIds.has")) {
  throw new Error("How It Works does not omit hidden published sections from server-backed rendering.");
}
if (!layout.includes("buildManagedSiteMetadata") || !metadata.includes("buildManagedSiteMetadata") || themeRuntime.includes("applySeoSettings")) {
  throw new Error("Published metadata is not server authoritative.");
}
if (metadata.includes('template: "%s | QRguitar"')) {
  throw new Error("Published page titles must not receive a second QRguitar suffix.");
}
if (!route.includes('errors["seo.canonicalUrl"]') || !route.includes('canonical.hostname !== "www.qrguitar.com"')) {
  throw new Error("Invalid external canonical URLs are not rejected.");
}

for (const test of ["site-editor-transaction.test.mjs", "site-editor-client.test.mjs"]) {
  execFileSync(process.execPath, [path.join(root, "scripts/security", test)], { stdio: "inherit" });
}

const origin = process.env.QRGUITAR_TEST_ORIGIN || "http://127.0.0.1:3003";
const readResponse = await fetch(`${origin}/api/site-editor`, { cache: "no-store" });
if (![401, 403].includes(readResponse.status)) throw new Error(`Unauthenticated Site Editor read returned ${readResponse.status}.`);
const writeResponse = await fetch(`${origin}/api/site-editor`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "save_draft", settings: {} })
});
if (![401, 403].includes(writeResponse.status)) throw new Error(`Unauthenticated Site Editor write returned ${writeResponse.status}.`);
const emailResponse = await fetch(`${origin}/api/site-editor/test-email`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { "email.serviceReview.subject": "Unsafe test" } })
});
if (![401, 403].includes(emailResponse.status)) throw new Error(`Unauthenticated Site Editor email test returned ${emailResponse.status}.`);
const previewResponse = await fetch(`${origin}/api/site-editor/preview`, { method: "POST" });
if (![401, 403].includes(previewResponse.status)) throw new Error(`Unauthenticated draft preview authorization returned ${previewResponse.status}.`);

console.log("Site Editor assertions passed.");
