import fs from "node:fs";
import path from "node:path";

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

for (const marker of ["site-editor:draft", "site-editor:revision:", "save_draft", "restore_revision", "basePublishedAt", "conflict: true", "validateContentValues", "logAdminAuditEvent"]) {
  if (!route.includes(marker)) throw new Error(`Site Editor API is missing ${marker}.`);
}
for (const marker of ["crashRecovery", "saveDraft", "publish", "restoreRevision", "discardDraft", "previewPath", "Revision history", "Advanced JSON", "Read-only by default", "Unlock editor", "Download backup", "Publishing blocked: primary text and primary actions must meet 4.5:1 contrast.", "Send test to my admin email", "/api/site-editor/test-email"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio is missing ${marker}.`);
}
for (const marker of ["SiteCompositionEditor", "compositionPageKey", "settings.composition"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio composition integration is missing ${marker}.`);
}
for (const marker of ["draggable", "text/cms-section", "text/cms-block", "Move up", "Move down", "Duplicate", "Add item", "Remove", "Hide", "Show", "newBlockId"]) {
  if (!compositionEditor.includes(marker)) throw new Error(`Content Studio block control is missing ${marker}.`);
}
for (const marker of ["validateEditorialComposition", "Block IDs must be unique", "Protected block", "Unsafe HTML or script content is not allowed", "This required section must stay visible in its fixed position."]) {
  if (!settings.includes(marker)) throw new Error(`Content Studio composition validation is missing ${marker}.`);
}
for (const marker of ["issueDraftPreview", "<iframe", "Desktop preview", "Tablet preview", "Mobile preview", "Open full preview", "Draft", "Published"]) {
  if (!page.includes(marker)) throw new Error(`Content Studio actual-page preview is missing ${marker}.`);
}
for (const marker of ["getAdminContext", "createSitePreviewToken", "verifySitePreviewToken", "safePreviewPath", "httpOnly", "X-Robots-Tag", "noindex, nofollow"]) {
  if (!previewRoute.includes(marker)) throw new Error(`Site Editor preview route is missing ${marker}.`);
}
for (const marker of ["createHmac", "timingSafeEqual", "PREVIEW_TTL_SECONDS", "verifySitePreviewToken"]) {
  if (!preview.includes(marker)) throw new Error(`Site Editor preview authorization is missing ${marker}.`);
}
for (const marker of ["sitePreviewCookie", "sitePreviewDraftKey", "verifySitePreviewToken"]) {
  if (!settingsServer.includes(marker)) throw new Error(`Draft preview content source is missing ${marker}.`);
}
for (const marker of ["qrguitar_site_preview", "X-Robots-Tag", "noindex, nofollow", "no-store"]) {
  if (!middleware.includes(marker)) throw new Error(`Preview middleware is missing ${marker}.`);
}
if (/mock\s+(draft\s+)?preview/i.test(page)) throw new Error("Content Studio still contains a mock-only preview.");

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
