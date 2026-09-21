import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => readFile(path.join(root, filePath), "utf8");
const ok = (value, message) => {
  if (!value) throw new Error(message);
};

const [
  eligibility,
  instrumentsApi,
  uploadApi,
  createPage,
  photoOrganizer,
  profileContract,
  publicInstruments,
  robots,
  sitemap,
  resetPassword,
  installers,
  howItWorks,
  styles,
  contact,
  privacy,
  terms,
  catalog,
  card,
  cardStyles,
  collectibleCard,
  siteEditor,
  migration
] = await Promise.all([
  "lib/public-profile-eligibility.ts",
  "app/api/instruments/route.ts",
  "app/api/instruments/uploads/route.ts",
  "app/create/page.tsx",
  "components/PhotoOrganizer.tsx",
  "lib/instrument-profile-contract.ts",
  "lib/public-instruments.ts",
  "app/robots.txt/route.ts",
  "app/sitemap.xml/route.ts",
  "app/reset-password/page.tsx",
  "app/installers/page.tsx",
  "app/how-it-works/HowItWorksClient.tsx",
  "app/globals.css",
  "app/contact/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/catalog/CatalogClient.tsx",
  "components/CollectibleRecordCard.tsx",
  "components/CollectibleRecordCard.module.css",
  "lib/collectible-card.ts",
  "app/site-editor/page.tsx",
  "../../supabase/migrations/20260716123000_migrate_legacy_setup_note.sql"
].map(read));

ok(eligibility.includes("toUpperCase()") && eligibility.includes('"QRG-PI260001"'), "Retired guard missing");
ok(instrumentsApi.includes("isRetiredPublicProfileCode(requestedCode)"), "API retired guard missing");
ok(profileContract.includes("ownerUserEmail: _ownerUserEmail") && profileContract.includes("showSerialPublic !== true"), "Public privacy sanitizer missing");
ok(eligibility.includes("ownerProfile") && eligibility.includes("hide_public_content") && eligibility.includes('"banned"') && eligibility.includes('"removed"'), "Shared public owner eligibility missing");
ok(publicInstruments.includes("isEligiblePublicProfile(guitar, { ownerProfile: profile })") && !publicInstruments.includes("demoInstrument"), "Public eligibility/fallback failed");
ok(robots.includes('.join("\\n")'), "robots newlines missing");
ok(/"content-type"\s*:\s*"application\/xml; charset=utf-8"/i.test(sitemap), "sitemap content type missing");
ok(resetPassword.includes("authChecked") && resetPassword.includes('useState("")'), "Reset states conflict");
ok(!installers.includes("Browse vetted installers by region") && !installers.includes("Directory opening soon"), "Installer page simulates finder");
ok(howItWorks.includes('<ol className="product-guide-steps">') && styles.includes('.product-guide-steps li::marker { content: ""; }'), "How It Works numbering failed");
for (const [name, source] of [["Contact", contact], ["Privacy", privacy], ["Terms", terms]]) {
  ok(!/serial\/build/i.test(source), `${name} has stale terminology`);
}
ok(!catalog.includes("service history, proof, or Availability"), "Catalog promises missing filter");
ok(profileContract.includes("if (event.isSystem) return false"), "System events counted as service history");
ok(resetPassword.includes("hasRecoveryLink") && resetPassword.includes("isComplete") && resetPassword.includes("authChecked && !authError && !isComplete && hasSession"), "Reset states are not mutually exclusive");
ok(!installers.includes("Owners can find a nearby shop") && installers.includes("connects approved shops and owners manually"), "Installer page overpromises a finder");
ok(
  collectibleCard.includes("presentation.serialNumber")
    && profileContract.includes("instrument.showSerialPublic === true")
    && card.includes("<small>Serial Number</small>"),
  "Compact card serial privacy/label failed"
);
ok(
  card.includes("galleryImages.length > 1")
    && card.includes("onPointerMove={handlePointerMove}")
    && card.includes("onWheel={handleWheel}")
    && card.includes("onKeyDown={handleKeyDown}")
    && card.includes("collectible-card-gallery-controls"),
  "Public card carousel behavior missing"
);
const serialStyles = cardStyles.match(/\.collectible-card-serial small\s*,\s*\.collectible-card-serial strong\s*\{([^}]+)\}/)?.[1] || "";
ok(
  card.includes('import styles from "./CollectibleRecordCard.module.css"')
    && card.includes('className={styles["collectible-card-serial"]}')
    && /font-size:\s*12px\s*;/.test(serialStyles)
    && /overflow-wrap:\s*anywhere\s*;/.test(serialStyles),
  "Compact serial label/value styling or CSS module binding missing"
);
ok(
  siteEditor.includes("if (!authorized)")
    && siteEditor.includes('status === "loading" ? "Checking Site Editor access."')
    && siteEditor.includes('initialLoadFailure === "unavailable" ? "Site Editor is temporarily unavailable." : "Admin access required."'),
  "Site Editor access gate must distinguish loading, unavailable, and unauthorized states"
);
ok(migration.includes("migration:QRG-05068283:setup-2026-06-20") && migration.includes("date '2026-06-20'") && migration.includes("Properly setup on 6/20/2026"), "Canonical setup migration lost source/date/text");
ok(migration.indexOf("insert into public.guitar_timeline_events") < migration.indexOf("delete from public.guitar_specs") && migration.includes("and exists ("), "Legacy setup deletion is not gated on canonical insert");

// Structural UI smoke checks. Atomic rollback, idempotency and authorization are
// exercised against actual route code and SQL by test:atomic-profiles in CI.
// Signed upload bounds, capabilities and retry outcomes execute in test:signed-uploads.
ok(uploadApi.includes('export async function POST') && uploadApi.includes('export async function DELETE'), "Staged upload create/cleanup routes missing");
ok(uploadApi.includes("assertAccountCanWrite") && uploadApi.includes("MAX_PROFILE_UPLOAD_BYTES") && uploadApi.includes("MAX_PROFILE_UPLOAD_JSON_BYTES") && uploadApi.includes("boundedBody") && uploadApi.includes("profile-uploads"), "Staged upload authorization or limits missing");
ok(createPage.includes("uploadWithConcurrency") && createPage.includes("concurrency = 3") && createPage.includes("stageSelectedFiles") && createPage.includes("cleanupUploads"), "Create upload orchestration missing");
ok(createPage.includes("PhotoOrganizer") && createPage.includes("Add at least one clear instrument photo") && createPage.includes("no more than 20 photos"), "Create photo requirements missing");
ok(!createPage.includes("QR customization"), "Create still includes premature QR customization");
ok(photoOrganizer.includes("onDragStart") && photoOrganizer.includes("onPointerMove") && photoOrganizer.includes("Move earlier") && photoOrganizer.includes("Set photo"), "Photo organizer reorder/main controls missing");
ok(styles.includes(".photo-drag-handle") && styles.includes("touch-action: none"), "Photo organizer mobile drag safety missing");
ok(instrumentsApi.includes("fieldErrors") && instrumentsApi.includes("retryable") && instrumentsApi.includes("cleanupUploads"), "Create error contract missing");
ok(!instrumentsApi.includes("serial/build ID"), "Create/update API has stale Serial Number terminology");

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL?.replace(/\/$/, "");
if (baseUrl) {
  const retiredCode = "QRG-PI260001";
  const missingCode = "QRG-LAUNCH-GATE-MISSING";
  for (const code of [retiredCode, retiredCode.toLowerCase(), missingCode]) {
    for (const url of [`/i/${code}`, `/api/instruments?code=${code}`]) {
      const response = await fetch(baseUrl + url, { redirect: "manual", cache: "no-store" });
      ok(response.status === 404, `${url} returned ${response.status}`);
    }
  }

  const listResponse = await fetch(baseUrl + "/api/instruments", { cache: "no-store" });
  const listJson = await listResponse.json();
  ok(listResponse.ok && listJson?.ok && Array.isArray(listJson.instruments) && listJson.instruments.length > 0, "Public list invalid");
  ok(Number(listJson.count) === listJson.instruments.length, "Public list count mismatch");
  const seenPublicCodes = new Set();
  for (const record of listJson.instruments) {
    const publicCode = String(record.qrCode || "").toUpperCase();
    ok(publicCode && !seenPublicCodes.has(publicCode), "Duplicate public Profile in list");
    seenPublicCodes.add(publicCode);
    ok(publicCode !== retiredCode, "Retired Profile in list");
    ok(!("ownerUserEmail" in record) && !("ownerEmail" in record), "Owner email leaked");
    ok(record.visibility === "public", "Non-public Profile in public list");
    ok(!record.collectionRemovedAt && !record.collectionRemovedReason, "Removed Profile leaked");
    if (record.showSerialPublic !== true) ok(!record.serial, "Hidden serial leaked");
  }

  const robotsResponse = await fetch(baseUrl + "/robots.txt", { cache: "no-store" });
  const robotsText = await robotsResponse.text();
  ok(robotsResponse.ok && /text\/plain/i.test(robotsResponse.headers.get("content-type") || "") && /^User-agent: \*/m.test(robotsText) && /^Allow: \/$/m.test(robotsText) && /^Sitemap: https:\/\/www\.qrguitar\.com\/sitemap\.xml$/m.test(robotsText), "robots invalid");
  const sitemapResponse = await fetch(baseUrl + "/sitemap.xml", { cache: "no-store" });
  const sitemapText = await sitemapResponse.text();
  ok(sitemapResponse.ok && /(application|text)\/xml/i.test(sitemapResponse.headers.get("content-type") || "") && sitemapText.includes("<urlset") && sitemapText.includes("</urlset>") && !sitemapText.toUpperCase().includes(retiredCode), "sitemap invalid");
}

console.log(`Launch readiness assertions passed${baseUrl ? ` against ${baseUrl}` : " (static mode)"}.`);
