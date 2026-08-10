import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const contract = read("lib/instrument-profile-contract.ts");
const cardResolver = read("lib/collectible-card.ts");
const profile = read("app/i/[code]/ProfileClient.tsx");
const homepage = read("components/HomePageClient.tsx");
const dashboard = read("app/dashboard/page.tsx");
const dashboardCss = read("app/dashboard/dashboard-records.module.css");
const drawerCss = read("app/globals.css");
const printSuite = read("app/handout/[code]/page.tsx");
const howItWorks = read("app/how-it-works/HowItWorksClient.tsx");
const registry = read("lib/content-registry.ts");

includes(contract, 'scope: InstrumentPresentationScope', "The presentation resolver must distinguish public and owner scopes.");
includes(contract, 'document.visibility === "public"', "Public documents must be filtered by visibility.");
includes(contract, 'item.isPublic === true', "Public supplemental media must be filtered by visibility.");
includes(contract, 'event.isPublic === true', "Public Timeline events must respect public visibility.");
includes(contract, '!event.isSystem && !/^(qrguitar )?profile created$/i.test(event.title.trim())', "Profile creation must not count as meaningful Timeline history.");
includes(contract, 'timeline: meaningfulTimelineEvents.length > 0 || Number(instrument.ownershipTransferCount || 0) > 0', "Creation alone must not force a Timeline tab.");
includes(contract, 'media: supplementalMedia.length > 0', "Empty supplemental Media must not create a public tab.");
includes(contract, 'documents: documents.length > 0', "Empty Documents must not create a public tab.");
includes(contract, 'instrument.showSerialPublic === true', "Public Serial Number resolution must honor the explicit privacy setting.");
includes(contract, "youtube-nocookie.com", "Supplemental video embeds must use an allowlist.");
includes(contract, 'parsed.protocol !== "https:"', "Unsafe supplemental-media URLs must be rejected.");
includes(cardResolver, 'resolveInstrumentPresentation(record, "public")', "Public cards must use the public-safe presentation contract.");

excludes(profile, "publicMedia.map((media)", "Photographs must not be duplicated in supplemental Media.");
includes(profile, 'role="tablist"', "Profile navigation must expose tab semantics.");
includes(profile, 'aria-selected={activeTab === tab.id}', "Profile tabs must expose their selected state.");
includes(profile, 'event.key !== "ArrowLeft" && event.key !== "ArrowRight"', "Profile tabs must support keyboard navigation.");
includes(profile, "timeline-origin-marker", "Profile creation must be rendered as a compact origin marker.");
excludes(profile, "The known history starts here.", "Filler Timeline copy must not return.");

includes(homepage, "archiveRecords", "Homepage must provide a living archive rail when more Profiles exist.");
includes(homepage, "record.qrCode === initialLatestRecord?.qrCode", "The archive must exclude the latest Profile.");
includes(homepage, "archiveImages.has(leadImage)", "The archive must not repeat a lead image.");
includes(homepage, "home-archive-rail", "The archive must provide an intentional horizontal rail.");
includes(homepage, "onPointerMove={moveArchiveDrag}", "The archive rail must support pointer drag.");
includes(homepage, "handleArchiveKeyDown", "The archive rail must support keyboard movement.");
includes(homepage, 'event.pointerType !== "mouse"', "Native touch scrolling must not be intercepted by mouse drag handling.");
includes(homepage, "home-archive-controls", "Mobile archive browsing must provide explicit navigation controls.");
includes(drawerCss, "touch-action: pan-x pan-y pinch-zoom", "Profile rails must permit native horizontal touch movement.");

includes(dashboard, "Print handout &amp; labels", "Dashboard must expose one clear print action.");
includes(dashboard, "Photos &amp; media", "Dashboard History actions must provide one clear media destination.");
excludes(dashboard, ">Print Kit</Link><RecordShareButton", "The old competing Print Kit action must not remain.");
includes(dashboard, "Start a secure handoff to the next owner.", "Ownership transfer must explain its action.");
includes(dashboardCss, ".drawerSections section { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))", "Desktop drawer actions must use a stable two-column layout.");
includes(dashboardCss, ".drawerSections section { grid-template-columns: minmax(0, 1fr)", "Mobile drawer actions must collapse to one column.");
includes(dashboardCss, "min-height: 44px", "Drawer controls must meet practical target sizing.");
includes(drawerCss, "clamp(420px, 38vw, 540px)", "Desktop drawer width must be stable without compressing the card grid.");

for (const mode of ['"label"', '"hangtag"', '"handout"', '"service"']) {
  includes(printSuite, mode, `Print Suite is missing ${mode}.`);
}
includes(printSuite, 'useState<PrintScope>("public")', "Print output must default to public-safe.");
includes(printSuite, 'printScope === "owner" && ownerAuthorized', "Owner-only Serial Number output must require explicit owner scope.");
includes(printSuite, 'data-print-mode={mode}', "Print output must identify the active format.");
includes(printSuite, "resolvedPageDimensions", "Print page dimensions must follow the selected format and orientation.");
includes(drawerCss, '.handout-shell .print-kit {', "Inactive Print Suite formats must be excluded from print.");
includes(drawerCss, 'data-print-mode="hangtag"', "Hang Tag must be independently printable.");

includes(howItWorks, '<ol className="product-guide-steps">', "How It Works must use one semantic step list.");
includes(howItWorks, "Public, Unlisted, or Private", "How It Works must use current visibility terminology.");
excludes(howItWorks, ">Visible<", "Stale Visible terminology must not be rendered.");

[
  "home.archive.eyebrow",
  "home.archive.heading",
  "printWorkspace.hangtag",
  "printWorkspace.service"
].forEach((key) => includes(registry, `"${key}"`, `Content Studio must own ${key}.`));

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route) {
  const response = await fetch(`${baseUrl}${route}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works"]) {
  const result = await get(route);
  assert(result.response.ok, `${route} returned ${result.response.status}.`);
}

const apiResult = await get("/api/instruments");
assert(apiResult.response.ok, `Public API returned ${apiResult.response.status}.`);
const payload = JSON.parse(apiResult.text);
const records = Array.isArray(payload) ? payload : payload.instruments;
assert(Array.isArray(records) && records.length > 0, "Public API must return real eligible Profiles.");
assert(records.every((record) => !("ownerEmail" in record) && !("privateNotes" in record) && !("transferToken" in record)), "Public API leaked a private owner field.");
assert(records.every((record) => record.showSerialPublic !== false || !("serial" in record)), "Public API leaked a hidden Serial Number.");

console.log("Final QRguitar experience assertions passed.");
