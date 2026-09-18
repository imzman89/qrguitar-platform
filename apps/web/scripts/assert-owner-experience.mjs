import { execFileSync } from "node:child_process";
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

execFileSync(process.execPath, ["--test", path.join(root, "scripts/test-bulk-import.mjs")], { stdio: "inherit" });
ok(bulkRoute.includes("BulkImportWorkspace"), "Bulk import Dashboard route missing");
ok(bulk.includes("Column mapping") && bulk.includes("updateColumnMapping") && bulk.includes("Map & preview rows"), "Editable bulk column mapping missing");
ok(bulk.includes("Serial Number already belongs to") && bulk.includes("Open existing Profile"), "Duplicate Serial Number workflow missing");
ok(bulk.includes('filter === "duplicate"') && bulk.includes('filter === "invalid"'), "Bulk review filters missing");

ok(accountApi.includes("getAuthenticatedUser") && accountApi.includes("assertAccountCanWrite"), "Collection settings are not owner protected");
execFileSync(process.execPath, [path.join(root, "scripts/security/account-transaction.test.mjs")], { stdio: "inherit" });
ok(collections.includes("enabled: false") && collectionPage.includes("notFound()"), "Public Collections are not opt-in");
ok(collectionPage.includes("getPublicInstruments(ownerId)") && publicInstruments.includes("visibility=eq.public") && publicInstruments.includes("ownerId"), "Collection public-only contract missing");
ok(!collectionPage.includes("ownerUserEmail") && !collectionPage.includes("ownerEmail"), "Collection page references private email");
ok(collectibleCard.includes("record.publicCollection") && card.includes("ownerCollection={record.publicCollection}") && card.includes("maxBadges={3}"), "Shared card owner attribution or badge limit missing");
ok(collectibleCard.includes("presentation.serialNumber") && card.includes("RecordShareButton") && card.includes("collectible-card-gallery-controls"), "Card privacy or independent controls missing");
ok(dashboard.includes("ActionDrawer") && dashboard.includes("dashboard.card.more") && dashboard.includes("QrDownload") && dashboard.includes("updateSerialVisibility"), "Owner card actions missing");
ok(quickEdit.includes("beforeunload") && quickEdit.includes("Save Quick Edit") && quickEdit.includes("showSerialPublic") && quickEdit.includes("safetyStatus"), "Quick Edit contract missing");
ok(siteSettings.includes("Luthiers / Technicians") && siteSettings.includes("Buyers") && siteSettings.includes("Collectors") && siteSettings.includes("Shops"), "How It Works role paths missing");
ok(howItWorks.includes('blocks("lifecycle").map((item, index)') && howItWorks.includes('String(index + 1).padStart(2, "0")') && !howItWorks.includes("Step ${index + 1}"), "How It Works numbering is duplicated");
ok(
  sitemap.includes("eligibleCollections")
    && sitemap.includes("settings.enabled")
    && sitemap.includes("settings.allowIndexing")
    && sitemap.includes("publicCollectionHandles.has(settings.handle)")
    && styles.includes("editor-save-bar")
    && styles.includes("import-mapping-grid"),
  "Collection sitemap or workspace styling missing"
);

console.log("Owner experience assertions passed.");
