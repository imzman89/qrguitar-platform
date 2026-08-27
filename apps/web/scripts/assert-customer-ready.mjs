import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const printSuite = read("app/handout/[code]/page.tsx");
const printCss = read("app/handout/[code]/print-suite.module.css");
const globalCss = read("app/globals.css");
const profile = read("app/i/[code]/ProfileClient.tsx");
const contract = read("lib/instrument-profile-contract.ts");
const dashboard = read("app/dashboard/page.tsx");
const qrDownload = read("components/QrDownload.tsx");
const session = read("components/SessionLifecycle.tsx");
const homepage = read("components/HomePageClient.tsx");

for (const mode of ["label", "hangtag", "handout", "service"]) {
  includes(printSuite, `${mode}: {`, `Print Suite format config is missing ${mode}.`);
}
includes(printSuite, 'useState<PrintScope>("public")', "Print Suite must default to public-safe copy.");
includes(printSuite, 'resolveInstrumentPresentation(instrument, printScope === "owner" && ownerAuthorized ? "owner" : "public")', "Print scope must use the typed presentation contract.");
includes(printSuite, 'id="qrguitar-print-root"', "Print Suite must use a dedicated print root.");
includes(printSuite, "formatConfig[mode]", "Format-safe controls must follow the selected format.");
includes(printSuite, "activeFormat.sizes.map", "Paper-size options must be format-aware.");
includes(printSuite, "activeFormat.orientations.length > 1", "Orientation must be hidden when it is not applicable.");
includes(printSuite, "presentation?.serialNumber", "Serial output must follow the presentation privacy contract.");
includes(printSuite, "window.print()", "Print Suite must use native browser printing.");
excludes(printSuite, "document.write", "Print Suite must not generate popup documents.");
excludes(printSuite, "about:blank", "Print Suite must not print from a blank popup.");
includes(printCss, "@media print", "Print Suite must provide scoped print layout rules.");
includes(printCss, "overflow: visible !important", "The active print root must not retain a scrolling preview viewport.");
includes(globalCss, ".handout-shell[data-print-size=\"compact\"] .print-kit--label", "Compact labels must fit their physical page.");
includes(globalCss, "break-inside: avoid", "Printable sections must avoid accidental page splitting.");

includes(contract, "service: serviceEntries.length > 0", "Service tab visibility must be data-driven.");
includes(contract, "!isServiceHistoryEvent(event)", "Service events must not duplicate inside Timeline.");
includes(contract, 'document.visibility === "public"', "Public documents must remain visibility-filtered.");
includes(contract, 'item.isPublic === true', "Public supplemental media must remain visibility-filtered.");
includes(profile, 'id: "service"', "Public Profiles must expose a conditional Service tab.");
includes(profile, 'activeTab === "service"', "Service tab must render canonical service content.");
includes(profile, "media-gallery-lightbox", "Fullscreen gallery must remain available.");
includes(profile, 'event.key === "Escape"', "Fullscreen gallery must remain Escape-closeable.");
includes(dashboard, 'file.visibility === "public"', "Dashboard public document counts must be exact.");
includes(dashboard, "Open Print Suite", "Dashboard must expose one clear Print Suite action.");
excludes(dashboard, "Print handout &amp; labels", "Dashboard must not retain the legacy handout label.");
includes(qrDownload, "Open Print Suite", "QR actions must use the same Print Suite name.");
excludes(qrDownload, "Print Handout", "Duplicate Print Handout terminology must be removed.");
includes(session, "routeRequiresSession", "Expired-session redirects must be scoped to protected routes.");
includes(session, "if (routeRequiresSession(currentPath))", "Public browsing must survive session expiry.");
includes(homepage, "archiveRecords", "Homepage must continue to use real archive Profiles.");
includes(globalCss, "grid-template-columns: repeat(2, minmax(0, 1fr));", "Desktop archive Profiles must render as a complete grid without clipped cards.");

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route) {
  const response = await fetch(`${baseUrl}${route}`, { cache: "no-store", redirect: "manual", headers: { "cache-control": "no-cache" } });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works", "/handout/QRG-E985125", "/i/QRG-E985125"]) {
  const result = await get(route);
  assert(result.response.status >= 200 && result.response.status < 400, `${route} returned ${result.response.status}.`);
}

const api = await get("/api/instruments");
assert(api.response.ok, `Public API returned ${api.response.status}.`);
const payload = JSON.parse(api.text);
const records = Array.isArray(payload) ? payload : payload.instruments;
assert(Array.isArray(records) && records.length > 0, "Public API must return eligible Profiles.");
const serialized = JSON.stringify(records);
for (const forbidden of ["ownerEmail", "owner_email", "privateNotes", "private_notes", "transferToken", "transfer_token", "recipientEmail", "recipient_email", "auth_metadata", "storage_path", "supabase.co/storage"]) {
  excludes(serialized, forbidden, `Public API leaked ${forbidden}.`);
}
for (const record of records) {
  if (record.showSerialPublic !== true) assert(!record.serial, `${record.qrCode} leaked a hidden Serial Number.`);
}

console.log("Customer-readiness assertions passed.");
