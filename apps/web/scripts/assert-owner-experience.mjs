import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (filePath) => readFile(path.join(root, filePath), "utf8");
const ok = (value, message) => { if (!value) throw new Error(message); };

const [bulk, bulkRoute, accountApi, collectionPage, collections, publicInstruments, card, collectibleCard, dashboard, quickEdit, howItWorks, siteSettings, sitemap, styles] = await Promise.all([
  "components/BulkProfileImport.tsx",
  "app/dashboard/import/page.tsx",
  "app/api/account/route.ts",
  "app/collections/[handle]/page.tsx",
  "lib/public-collections.ts",
  "lib/public-instruments.ts",
  "components/CollectibleRecordCard.tsx",
  "lib/collectible-card.ts",
  "app/dashboard/page.tsx",
  "components/ProfileQuickEdit.tsx",
  "app/how-it-works/HowItWorksClient.tsx",
  "lib/site-settings.ts",
  "app/sitemap.xml/route.ts",
  "app/globals.css"
].map(read));

ok(bulk.includes('headerLine.includes("\\t")') && bulk.includes('delimiter === "\\t"'), "Bulk delimiter detection missing");
ok(bulk.includes("Column mapping") && bulk.includes("updateColumnMapping") && bulk.includes("Map & preview rows"), "Editable bulk column mapping missing");
ok(bulk.includes('visibility: "private" as const') && !bulk.includes('visibility: row.visibility'), "Bulk Profiles do not default to Private");
ok(bulk.includes("validateBulkRow") && bulk.includes("A real photo URL is required") && bulk.includes("Enter a Serial Number or No Serial"), "Bulk minimum requirements missing");
ok(bulk.includes("qrguitar.bulkImportDraft.v1") && bulk.includes("localStorage.setItem") && bulk.includes("rows, columnMapping"), "Import draft persistence missing");
ok(bulk.includes("Serial Number already belongs to") && bulk.includes("Open existing Profile"), "Duplicate Serial Number workflow missing");
ok(bulk.includes('filter === "duplicate"') && bulk.includes('filter === "invalid"'), "Bulk review filters missing");
ok(bulk.includes("lines.slice(1, 51)") && bulkRoute.includes("BulkImportWorkspace"), "Bulk import limit or Dashboard route missing");

ok(accountApi.includes("getAuthenticatedUser") && accountApi.includes("assertAccountCanWrite"), "Collection settings are not owner protected");
ok(accountApi.includes("already in use") && accountApi.includes("status: 409"), "Unique collection handles are not enforced");
ok(collections.includes("enabled: false") && collectionPage.includes("notFound()"), "Public Collections are not opt-in");
ok(collectionPage.includes("getPublicInstruments(ownerId)") && publicInstruments.includes("visibility=eq.public") && publicInstruments.includes("ownerId"), "Collection public-only contract missing");
ok(!collectionPage.includes("ownerUserEmail") && !collectionPage.includes("ownerEmail"), "Collection page references private email");
ok(collectibleCard.includes("record.publicCollection") && card.includes("collectible-card-collection-link") && card.includes("maxBadges={3}"), "Shared card collection link or badge limit missing");
ok(collectibleCard.includes('record.showSerialPublic === true') && card.includes("RecordShareButton") && card.includes("collectible-card-gallery-controls"), "Card privacy or independent controls missing");
ok(dashboard.includes("ProfileQuickEdit") && dashboard.includes("Quick Edit") && dashboard.includes("<details") && dashboard.includes("QrDownload"), "Owner card actions missing");
ok(quickEdit.includes("beforeunload") && quickEdit.includes("Save Quick Edit") && quickEdit.includes("showSerialPublic") && quickEdit.includes("safetyStatus"), "Quick Edit contract missing");
ok(siteSettings.includes("Luthiers / Technicians") && siteSettings.includes("Buyers") && siteSettings.includes("Collectors") && siteSettings.includes("Shops"), "How It Works role paths missing");
ok(howItWorks.includes('blocks("lifecycle").map((item, index)') && howItWorks.includes('String(index + 1).padStart(2, "0")') && !howItWorks.includes("Step ${index + 1}"), "How It Works numbering is duplicated");
ok(sitemap.includes("eligibleCollections") && sitemap.includes("collection.enabled") && sitemap.includes("collection.allowIndexing") && styles.includes("editor-save-bar") && styles.includes("import-mapping-grid"), "Collection sitemap or workspace styling missing");

console.log("Owner experience assertions passed.");
