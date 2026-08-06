import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const homepage = read("components/HomePageClient.tsx");
const card = read("components/CollectibleRecordCard.tsx");
const cardResolver = read("lib/collectible-card.ts");
const profileContract = read("lib/instrument-profile-contract.ts");
const profile = read("app/i/[code]/ProfileClient.tsx");
const catalog = read("app/catalog/CatalogClient.tsx");
const howItWorks = read("app/how-it-works/HowItWorksClient.tsx");
const siteEditor = read("app/site-editor/page.tsx");
const installers = read("app/installers/page.tsx");
const registry = read("lib/content-registry.ts");

for (const section of ["hero", "lifecycle", "anatomy", "roles", "continuity", "pricing", "finalCta"]) {
  includes(homepage, `${section}: (`, `Homepage is missing the ${section} composition.`);
}
includes(homepage, "home-archive-rail", "Homepage must include the living archive rail.");
includes(homepage, "record.qrCode === initialLatestRecord?.qrCode", "Archive must exclude the latest Profile.");
includes(homepage, "archiveImages.has(leadImage)", "Homepage must reject repeated archive lead images.");
excludes(homepage, 'className="trust-row"', "Homepage hero proof pills must not return.");
includes(homepage, "onPointerMove={moveArchiveDrag}", "Archive rail must support pointer drag.");
includes(homepage, "handleArchiveKeyDown", "Archive rail must support keyboard movement.");

includes(card, "resolveCollectibleCard(record)", "Shared cards must use the typed collectible-card resolver.");
includes(card, "galleryImages.length > 1", "One-photo cards must suppress carousel controls.");
includes(card, "if (dragState.current.moved)", "Card drag must suppress Profile navigation.");
includes(card, "event.deltaX", "Card galleries must support horizontal trackpads.");
includes(card, "ArrowLeft", "Card galleries must support keyboard navigation.");
includes(cardResolver, 'resolveInstrumentPresentation(record, "public")', "Cards must use public-safe presentation data.");

includes(profileContract, 'instrument.showSerialPublic === true', "Public Serial Number display must require opt-in.");
includes(profileContract, 'media: supplementalMedia.length > 0', "Media tab must require supplemental media.");
includes(profileContract, 'documents: documents.length > 0', "Documents tab must require public documents.");
includes(profileContract, '!event.isSystem && !/^(qrguitar )?profile created$/i.test(event.title.trim())', "Profile creation must not count as meaningful history.");
excludes(profile, "publicMedia.map((media)", "Photographs must not repeat in Media.");
includes(profile, 'role="tablist"', "Public Profile tabs must be semantic.");
includes(profile, "timeline-origin-marker", "Profile creation must remain a quiet origin marker.");

excludes(catalog, "visible profiles", "Catalog must not use stale Visible terminology.");
excludes(catalog, "brandSummary", "Catalog must not render arbitrary brand summaries.");
includes(howItWorks, '<ol className="product-guide-steps">', "How It Works must use one semantic numbered sequence.");
excludes(howItWorks, ">Visible<", "How It Works must use Public, Unlisted, and Private.");
excludes(siteEditor, "Checking owner access", "Site Editor must not render duplicate access-loading copy.");
excludes(installers, "Find an installer", "Installer page must not advertise an unbuilt finder.");

[
  "home.archive.eyebrow",
  "home.archive.heading",
  "home.archive.viewAll",
  "home.continuity.eyebrow",
  "home.continuity.headline",
  "home.continuity.body",
  "home.continuity.cta",
  "home.finalCta.eyebrow",
  "home.finalCta.primaryCta",
  "home.finalCta.secondaryCta"
].forEach((key) => includes(registry, `"${key}"`, `Content Studio must own ${key}.`));

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route) {
  const response = await fetch(`${baseUrl}${route}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
    redirect: "manual"
  });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works", "/sitemap.xml"]) {
  const result = await get(route);
  assert(result.response.ok, `${route} returned ${result.response.status}.`);
}

const apiResult = await get("/api/instruments");
assert(apiResult.response.ok, `Public API returned ${apiResult.response.status}.`);
const payload = JSON.parse(apiResult.text);
const records = Array.isArray(payload) ? payload : payload.instruments;
assert(Array.isArray(records) && records.length > 0, "Public API must return eligible Profiles.");
assert(new Set(records.map((record) => record.qrCode)).size === records.length, "Public API returned duplicate QRguitar IDs.");
assert(records.every((record) => !("ownerEmail" in record) && !("privateNotes" in record) && !("transferToken" in record)), "Public API leaked private data.");
assert(records.every((record) => record.showSerialPublic !== false || !("serial" in record)), "Public API leaked a hidden Serial Number.");
assert(records.every((record) => {
  const urls = [record.heroImageDataUrl, ...(record.galleryImageDataUrls || [])].filter(Boolean);
  return urls.every((url) => String(url).startsWith("/api/public-file/"));
}), "Public media must use same-origin application routes.");

const homeResult = await get("/");
const newestCode = String(records[0]?.qrCode || "");
assert(newestCode && homeResult.text.includes(newestCode), "Homepage latest Profile does not match the first public API record.");

const catalogResult = await get("/catalog");
for (const record of records) {
  assert(catalogResult.text.includes(record.qrCode), `Catalog is missing ${record.qrCode}.`);
}
const resultLabel = `${records.length} Profiles`;
assert(catalogResult.text.includes(resultLabel), `Catalog count does not match API count (${resultLabel}).`);

const sitemapResult = await get("/sitemap.xml");
for (const record of records) {
  assert(sitemapResult.text.includes(`/i/${record.qrCode}`), `Sitemap is missing ${record.qrCode}.`);
}

for (const route of ["/i/QRG-PI260001", "/i/qrg-pi260001", "/api/instruments?code=QRG-PI260001", "/api/instruments?code=qrg-pi260001"]) {
  const result = await get(route);
  assert(result.response.status === 404, `Retired Profile route resolved: ${route}.`);
}

const apex = await fetch("https://qrguitar.com", {
  redirect: "manual",
  headers: { "cache-control": "no-cache" }
});
assert(apex.status === 308 || apex.status === 301, `Apex host did not canonicalize (${apex.status}).`);

console.log("QRguitar design and production-truth assertions passed.");
