import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = withUiTextTestContext(createRequire(import.meta.url));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => fs.readFileSync(path.join(web, file), "utf8");
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const Link = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
function compile(file, overrides = {}, sourceSuffix = "") {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file) + sourceSuffix, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((name) => overrides[name] || (name.endsWith(".module.css") ? css : require(name)), module, module.exports);
  return module.exports;
}
const localDemo = { instrumentDisplayName: (record) => record.name || [record.brand, record.model].filter(Boolean).join(" "), getInstrumentVerificationStatus: (record) => record.verificationStatus || "unverified", getInstrumentCondition: (record) => record.instrumentCondition || "used" };
const contract = compile("lib/instrument-profile-contract.ts");
const badges = compile("components/ProfileStatusBadges.tsx", { "next/link": Link, "../lib/local-demo": localDemo });
const identity = compile("components/ProfileIdentity.tsx");
const uiText = compile("lib/ui-text.ts");
const uiProvider = compile("components/UiTextProvider.tsx", { "../lib/ui-text": uiText });
const contentLabels = { "printWorkspace.title": "Print Suite", "profile.tabs.overview": "Overview", "profile.tabs.specifications": "Details", "profile.gallery.label": "Instrument photographs", "profile.verification.title": "Verified by QRguitar", "profile.verification.body": "Record details have been reviewed.", "profile.authenticity.title": "Authenticity Confirmed", "profile.authenticity.body": "Authenticity evidence has been reviewed." };
const sale = compile("lib/profile-sale.ts", { "./public-collections": compile("lib/public-collections.ts"), "./profile-purchase-link": compile("lib/profile-purchase-link.ts", { "./public-collections": compile("lib/public-collections.ts") }) });
let profileContextQuery = "";
assert.match(read("app/i/[code]/ProfileClient.tsx"), /function ProfilePanel\(/, "Actual Profile panel must remain source-bound");
const profileModule = compile("app/i/[code]/ProfileClient.tsx", {
  "../../../components/UiTextProvider": uiProvider,
  "../../../components/ServiceCorrections": compile("components/ServiceCorrections.tsx", { "next/link": Link, "./UiTextProvider": uiProvider, "../lib/supabase-browser": { createBrowserSupabaseClient: () => { throw Error("No auth network in a rendering test"); } }, "../lib/service-corrections-client": compile("lib/service-corrections-client.ts") }),
  "next/link": Link,
  "next/navigation": { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams(profileContextQuery) },
  "../../../components/BrandLogo": { BrandLogo: () => React.createElement("span", null, "QRguitar") },
  "../../../components/CompactQr": { CompactQr: ({ code }) => React.createElement("span", { "data-qr": code }, "QR") },
  "../../../components/FallbackImage": { FallbackImage: ({ src, fallback, ...props }) => src ? React.createElement("img", { src, ...props }) : fallback },
  "../../../components/PhotoViewer": { PhotoViewer: () => null },
  "../../../components/ProfileIdentity": identity,
  "../../../components/ProfileStatusBadges": badges,
  "../../../components/RecordShareButton": { RecordShareButton: () => null },
  "../../../components/SellerWebsiteLink": { SellerWebsiteLink: () => null },
  "../../../components/MemberMessageLink": { MemberMessageLink: () => null },
  "../../../lib/local-demo": localDemo,
  "../../../lib/record-location": { formatRecordLocation: (record) => record.location || "" },
  "../../../lib/site-settings": { fetchPublishedSiteSettings: async () => ({}), normalizeBrandLogoKey: (value) => value },
  "../../../lib/supabase-browser": { createBrowserSupabaseClient: () => { throw Error("No auth network in a rendering test"); } },
  "../../../lib/owner-profile": { fetchOwnerProfile: () => { throw Error("No owner network in a rendering test"); }, OwnerProfileError: Error },
  "../../../lib/instrument-profile-contract": contract,
  "../../../lib/content-registry": { getContentValue: (_, key) => contentLabels[key] || key },
  "../../../lib/profile-url": { publicProfileUrl: (code) => "https://www.qrguitar.com/i/" + code },
  "../../../lib/profile-purchase-link": compile("lib/profile-purchase-link.ts", { "./public-collections": compile("lib/public-collections.ts") }),
  "../../../lib/optional-tracking-consent": { dispatchOptionalTrackingProductEvent() {}, optionalTrackingProductEvents: {} },
  "../../../lib/image-fallback": compile("lib/image-fallback.ts"),
  "../../../lib/public-media-variant": compile("lib/public-media-variant.ts"),
  "../../../lib/profile-sale": sale,
  "./ProfileBreadcrumbs": compile("app/i/[code]/ProfileBreadcrumbs.tsx", { "next/link": Link })
}, "\nexport { ProfilePanel };");
const Profile = profileModule.ProfileClient;
const record = { qrCode: "QRG-LAYOUT", name: "Twin Reverb", brand: "Fender", model: "Twin Reverb", year: "1965", instrumentType: "Amplifier", heroImageDataUrl: "/front.jpg", galleryImageDataUrls: ["/front.jpg", "/back.jpg"], verificationStatus: "verified", authenticityStatus: "confirmed", visibility: "public", serial: "PRIVATE-SERIAL-123", showSerialPublic: false, summary: "Original cabinet with documented service.", location: "Boston", documentFiles: [{ name: "Private receipt", visibility: "private", url: "/private.pdf" }, { name: "Public manual", visibility: "public", url: "/manual.pdf" }] };
const render = (changes = {}) => renderToStaticMarkup(React.createElement(Profile, { code: record.qrCode, initialInstrument: { ...record, ...changes } }));
export { render as renderProfileFixture };

function renderProvenancePanel(activeTab, publishedContent) {
  const historical = { id: "historical", eventType: "documentation", category: "Documentation", title: "Historical provenance", serviceDate: "1995-06-01", datePrecision: "day", isPublic: true, isSystem: false };
  const service = { id: "setup", eventType: "setup", category: "Setup", title: "Recorded setup", serviceDate: "2024-08-01", datePrecision: "day", isPublic: true, isSystem: false, sourceKind: "owner_reported", publicDescription: "Original setup record." };
  return renderToStaticMarkup(React.createElement(uiProvider.UiTextProvider, { content: publishedContent },
    React.createElement(profileModule.ProfilePanel, {
      activeTab, instrument: { ...record, createdAt: "2026-09-01T12:00:00Z" }, detailsHeading: "Details",
      specs: [], optionalSpecs: [], profileLinks: [], externalMedia: [], documentFiles: [],
      officialBrandLogoUrl: "", onDocumentView() {}, transferMessage: "", isVerifiedRecord: false,
      timelineEvents: [historical, service], serviceEntries: [service]
    })
  ));
}

test("old published Profile labels cannot misattribute registration or owner-reported service", () => {
  const published = Object.freeze({
    "ui.app.i.code.ProfileClient.9bb4a8d57a82": "Profile created",
    "ui.app.i.code.ProfileClient.0da8a8f6f90b": "Owner-approved work connected to this instrument.",
    "ui.app.i.code.ProfileClient.d677190e0a99": "Published service section"
  });
  const before = JSON.stringify(published);
  const timeline = renderProvenancePanel("timeline", published);
  assert.match(timeline, /<strong>QRguitar registration<\/strong>/);
  assert.match(timeline, /Recorded history may predate registration/);
  assert.match(timeline, /Historical provenance/);
  assert.match(timeline, /Jun 1, 1995/);
  assert.doesNotMatch(timeline, /Profile created/);
  const service = renderProvenancePanel("service", published);
  assert.match(service, /Owner-reported work and owner-approved provider records/);
  assert.match(service, /Owner-reported service/);
  assert.match(service, /Original setup record/);
  assert.match(service, /Published service section/);
  assert.doesNotMatch(service, /Owner-approved work connected to this instrument/);
  assert.equal(JSON.stringify(published), before, "Existing saved values must not be rewritten");
});

test("new semantically specific provenance keys remain normally editable", () => {
  const published = {
    "ui.app.i.code.ProfileClient.9bb4a8d57a82": "Profile created",
    "ui.app.i.code.ProfileClient.0da8a8f6f90b": "Owner-approved work connected to this instrument.",
    "ui.app.i.code.ProfileClient.registrationLabel": "Registration metadata",
    "ui.app.i.code.ProfileClient.serviceAttributionHeading": "Recorded work provenance"
  };
  assert.match(renderProvenancePanel("timeline", published), /<strong>Registration metadata<\/strong>/);
  assert.match(renderProvenancePanel("service", published), /Recorded work provenance/);
});

test("actual registry retires legacy provenance bindings without dropping compatibility", () => {
  const family = compile("lib/local-preview-ux-ui-text.ts");
  const registry = compile("lib/ui-text-registry.ts", {
    "./local-preview-ux-ui-text": family,
    "./free-profile-ui-text": compile("lib/free-profile-ui-text.ts"),
    "./service-review-privacy-ui-text": compile("lib/service-review-privacy-ui-text.ts"),
    "./recorded-business-support-ui-text": compile("lib/recorded-business-support-ui-text.ts"),
    "./catalog-policy-ui-text": compile("lib/catalog-policy-ui-text.ts"),
    "./owner-dashboard-policy-ui-text": compile("lib/owner-dashboard-policy-ui-text.ts")
  });
  for (const key of ["ui.app.i.code.ProfileClient.9bb4a8d57a82", "ui.app.i.code.ProfileClient.0da8a8f6f90b"]) {
    assert.equal(family.localPreviewRetiredUiKeys.has(key), true);
    assert.equal(registry.uiTextEntries.some(entry => entry.key === key), false);
    assert.equal(registry.retiredUiTextEntries.filter(entry => entry.key === key).length, 1);
  }
  for (const key of ["ui.app.i.code.ProfileClient.registrationLabel", "ui.app.i.code.ProfileClient.serviceAttributionHeading"]) {
    assert.equal(registry.uiTextEntries.filter(entry => entry.key === key).length, 1);
    assert.equal(registry.retiredUiTextEntries.some(entry => entry.key === key), false);
  }
});

test("one Profile title and its category/year precede the gallery in the accessible DOM", () => {
  const html = render();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.indexOf("<h1>") < html.indexOf('class="scan-hero-gallery"'));
  assert.ok(html.indexOf("1965 · Amplifier") < html.indexOf('class="scan-hero-gallery"'));
  assert.match(html, /photo 1 of 2/);
});

test("recorded New/Used condition is visible with the title before the gallery, independently of availability and trust", () => {
  for (const [instrumentCondition, label] of [["new", "New"], ["used", "Used"]]) {
    const html = render({ instrumentCondition, saleStatus: "not_for_sale" });
    assert.match(html, new RegExp('<p class="profile-condition"><span>Condition</span><strong>' + label + '</strong></p>'));
    assert.ok(html.indexOf('class="profile-condition"') > html.indexOf("</h1>"));
    assert.ok(html.indexOf('class="profile-condition"') < html.indexOf('class="scan-hero-gallery"'));
    assert.match(html, /Verified by QRguitar/);
    assert.match(html, /Authenticity Confirmed/);
  }
});

test("public identity uses the privacy projection and public-only document count", () => {
  const html = render();
  assert.doesNotMatch(html, /PRIVATE-SERIAL-123|Private receipt|private\.pdf/);
  assert.match(html, /2 photos \/ 1 document/);
  assert.match(render({ showSerialPublic: true }), /PRIVATE-SERIAL-123/);
});

test("an owned instrument without a chosen collection name has no Unclaimed or personal-name caption", () => {
  const html = render({ owner: "", publicCollection: undefined, builder: "Fixture builder" });
  assert.doesNotMatch(html, /Unclaimed|Owned by|Current owner/);
  const named = render({ owner: "Private account name", publicCollection: { handle: "chosen-name", publicName: "Chosen Collection", accountType: "collector" } });
  assert.match(named, /Owned by <strong>Chosen Collection/);
  assert.doesNotMatch(named, /Private account name|Unclaimed/);
});

test("lost or stolen status and notes appear before photos without suppressing trust disclosures", () => {
  for (const safetyStatus of ["lost", "stolen"]) {
    const html = render({ safetyStatus, publicSafetyNote: "Please contact the owner.", verificationStatus: "unverified", authenticityStatus: "unconfirmed" });
    assert.ok(html.indexOf("Please contact the owner.") < html.indexOf('class="scan-hero-gallery"'));
    assert.match(html, /Unverified/);
    assert.match(html, /Authenticity Unconfirmed/);
  }
});

test("confirmed trust explanations appear once and saved badge visibility remains authoritative", () => {
  const html = render();
  assert.equal((html.match(/Verified by QRguitar/g) || []).length, 1);
  assert.equal((html.match(/Authenticity Confirmed/g) || []).length, 1);
  assert.doesNotMatch(render({ showVerificationBadge: false, showAuthenticityBadge: false }), /Verified by QRguitar|Authenticity Confirmed/);
});

test("public Profile exposes QR sharing without Print Suite or owner controls", () => {
  const html = render();
  assert.doesNotMatch(html, /href="\/handout\/|Print Suite|Owner profile actions|Edit Profile|Ownership Tools|PRIVATE-SERIAL-123|Private receipt|private\.pdf/);
  assert.match(html, /data-qr="QRG-LAYOUT"/);
  assert.match(html, /Copy URL/);
});

test("a missing Profile does not expose a Print action", () => {
  const html = renderToStaticMarkup(React.createElement(Profile, { code: record.qrCode, initialInstrument: null }));
  assert.doesNotMatch(html, /href="\/handout\//);
});

test("post-purchase ownership help follows item details while owner actions stay absent", () => {
  const html = render();
  assert.ok(html.indexOf('class="scan-qr"') > html.indexOf('class="profile-claim-entry"'));
  assert.ok(html.indexOf('class="scan-qr"') > html.indexOf('id="profile-tab-panel"'));
  assert.match(html, /<footer aria-label="Profile QR and share">/);
  assert.ok(html.indexOf('class="profile-claim-entry"') > html.indexOf("Original cabinet with documented service."));
  assert.match(html, /<section class="profile-claim-entry">/);
  assert.match(html, /Already own it\?/);
  assert.match(html, /ownership-claim\?code=QRG-LAYOUT/);
  assert.doesNotMatch(html, /Owner profile actions|Edit Profile|Ownership Tools/);
});

test("seller purchase action precedes the gallery only for available safe listings", () => {
  const listing = { saleStatus: "for_sale", shopUrl: "https://shop.example/item" };
  const html = render(listing);
  assert.ok(html.indexOf("Buy from shop.example") < html.indexOf('class="scan-hero-gallery"'));
  assert.match(html, /href="https:\/\/shop.example\/item"/);
  assert.match(html, /shop.example/);
  for (const safetyStatus of ["lost", "stolen"]) assert.doesNotMatch(render({ ...listing, safetyStatus }), /Buy from shop.example/);
  assert.doesNotMatch(render({ ...listing, saleStatus: "not_for_sale" }), /Buy from shop.example/);
});

test("rendered sale area displays the explicit asking price and one exact cart action without technical mapping details", () => {
  const customFields = Object.entries({ "Asking price": "2500.00", Currency: "USD", "Store name": "Example Guitars", "Store platform": "woocommerce", "Store item ID": "123456789", "Store cart URL": "https://store.example/cart/" }).map(([label, value]) => ({ label, value }));
  const html = render({ saleStatus: "for_sale", customLinks: [{ label: "Shop", url: "https://store.example/product/exact-instrument" }], customFields });
  assert.match(html, /USD\s+2,500\.00/);
  assert.equal((html.match(/<strong>Buy from Example Guitars<\/strong>/g) || []).length, 1);
  assert.equal((html.match(/href="https:\/\/store.example\/cart\//g) || []).length, 1);
  assert.match(html, /href="https:\/\/store.example\/cart\/\?add-to-cart=123456789&amp;quantity=1"/);
  assert.doesNotMatch(html, /Store item ID|Store platform|Store cart URL|Private receipt|private\.pdf|PRIVATE-SERIAL-123/);
  assert.match(html, /Store confirms price and availability/);
  const unavailable = render({ saleStatus: "not_for_sale", customFields, customLinks: [{ label: "Shop", url: "https://store.example/product/exact-instrument" }] });
  assert.doesNotMatch(unavailable, /2,500|Buy from|add-to-cart|product\/exact-instrument/);
});

test("missing listing and price are honest, and unsafe sale links cannot reappear in supporting links", () => {
  assert.match(render({ saleStatus: "for_sale" }), /Price not provided|Purchase details unavailable/);
  const html = render({ saleStatus: "for_sale", shopUrl: "javascript:alert(1)", customLinks: [{ label: "Shop", url: "javascript:alert(2)" }] });
  assert.doesNotMatch(html, /javascript:|Buy from/);
  assert.match(html, /Purchase details unavailable/);
  assert.doesNotMatch(render({ websiteUrl: 'javascript:alert(1)', customLinks: [{ label: 'Unrelated link', url: 'https://user:password@store.example/product/a' }] }), /javascript:|user:password/);
});

const { catalogFilterUrl, defaultCatalogFilters, readCatalogFilters } = compile("lib/catalog-filter-state.ts");
test("catalog filter URLs round-trip search, encoded brands, combined statuses and sort", () => {
  const filters = { ...defaultCatalogFilters, query: "G&L / vintage", brand: "G&L", safety: "Safety Alert", authenticity: "Authenticity Unconfirmed", sortMode: "Year" };
  const url = catalogFilterUrl("/catalog", "?utm_source=collection", filters);
  assert.ok(url.startsWith("/catalog?"));
  assert.equal(new URL(url, "https://example.test").searchParams.get("utm_source"), "collection");
  assert.deepEqual(readCatalogFilters(new URL(url, "https://example.test").search), filters);
  assert.equal(catalogFilterUrl("/catalog", url.split("?")[1], defaultCatalogFilters), "/catalog?utm_source=collection");
});
test("unknown status URL values fall back safely and blank URLs restore default controls", () => {
  assert.deepEqual(readCatalogFilters("?trust=admin&sort=DROP&condition=unknown"), defaultCatalogFilters);
  assert.deepEqual(readCatalogFilters(""), defaultCatalogFilters);
});

const catalogSource = read("app/catalog/CatalogClient.tsx");
const sf = ts.createSourceFile("CatalogClient.tsx", catalogSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CatalogClient");
const names = ["clearSerialLookup", "updateFilters", "searchExactSerial"];
const handlers = component.body.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(sf)).join("\n");
const code = ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function catalogHarness() {
  const state = { filters: { ...defaultCatalogFilters, query: "FIRST" }, serialLookupRevision: { current: 0 }, exact: "", message: "", busy: false, showClaim: false, records: [] };
  let resolveFetch;
  const location = { pathname: "/catalog", search: "?q=FIRST", hash: "" };
  const history = { state: { next: "preserved" }, calls: [], pushState(saved, _, url) { assert.deepEqual(saved, this.state); this.calls.push(["push", url]); location.search = new URL(url, "https://example.test").search; }, replaceState(saved, _, url) { assert.deepEqual(saved, this.state); this.calls.push(["replace", url]); location.search = new URL(url, "https://example.test").search; } };
  const ctx = { ...state, window: { location, history }, catalogFilterUrl, dedupeByCodeAndDate: (records) => records, fetch: () => new Promise((resolve) => { resolveFetch = resolve; }) };
  Object.defineProperty(ctx, "query", { get: () => ctx.filters.query });
  ctx.setFilters = (filters) => { ctx.filters = filters; };
  ctx.setExactMatchCode = (value) => { ctx.exact = value; }; ctx.setSerialLookupMessage = (value) => { ctx.message = value; };
  ctx.setSerialLookupBusy = (value) => { ctx.busy = value; }; ctx.setShowOwnershipClaim = (value) => { ctx.showClaim = value; };
  ctx.setRecords = (value) => { ctx.records = typeof value === "function" ? value(ctx.records) : value; };
  const api = new Function("ctx", "with (ctx) { " + code + "; return { updateFilters, searchExactSerial }; }")(ctx);
  return { ctx, api, history, resolve: (payload) => resolveFetch(Response.json(payload)) };
}
test("catalog controls keep searchable URL state without replacing Next history state", () => {
  const f = catalogHarness();
  f.api.updateFilters({ brand: "Fender" });
  f.api.updateFilters({ query: "Twin" }, true);
  assert.deepEqual(f.history.calls.map(([mode]) => mode), ["push", "replace"]);
  assert.equal(readCatalogFilters(f.ctx.window.location.search).brand, "Fender");
  assert.equal(readCatalogFilters(f.ctx.window.location.search).query, "Twin");
});
test("an old exact-serial response cannot overwrite a changed search or restore a stale match", async () => {
  const f = catalogHarness();
  const pending = f.api.searchExactSerial();
  assert.equal(f.ctx.busy, true);
  f.api.updateFilters({ query: "SECOND" }, true);
  f.resolve({ ok: true, match: "public", instrument: { qrCode: "QRG-FIRST" } });
  await pending;
  assert.equal(f.ctx.exact, ""); assert.equal(f.ctx.message, ""); assert.equal(f.ctx.busy, false); assert.deepEqual(f.ctx.records, []);
});

const featured = compile("lib/home-featured-profile.ts", { "./instrument-profile-contract": contract, "./public-profile-eligibility": compile("lib/public-profile-eligibility.ts") }).selectHomeFeaturedProfile;
const photographed = (code, instrumentType, extra = {}) => ({ ...record, qrCode: code, instrumentType, ...extra });
test("homepage featured selection prefers an eligible photographed guitar without mutating catalog order", () => {
  const amp = photographed("QRG-AMP", "Amplifier"), guitar = photographed("QRG-GUITAR", "Electric Guitar");
  const records = [amp, guitar];
  assert.strictEqual(featured(records), guitar);
  assert.deepEqual(records, [amp, guitar]);
});
test("homepage does not feature private, unlisted, lost, stolen, retired or unphotographed instruments", () => {
  const fallback = photographed("QRG-AMP", "Amplifier");
  for (const extra of [{ visibility: undefined }, { visibility: null }, { visibility: "" }, { qrCode: "" }, { visibility: "private" }, { visibility: "unlisted" }, { visibility: "draft" }, { qrCode: "QRG-PI260001" }, { qrCode: " qrg-0001 " }, { admin_archived_at: "2026-09-20T00:00:00Z" }, { owner_removed_at: "2026-09-20T00:00:00Z" }, { safetyStatus: "lost" }, { safetyStatus: "stolen" }, { collectionRemovedAt: "2026-09-20T00:00:00Z" }, { heroImageDataUrl: "", galleryImageDataUrls: [] }]) {
    const excluded = photographed("QRG-GUITAR", "Electric Guitar", extra);
    assert.strictEqual(featured([excluded, fallback]), fallback, JSON.stringify(extra));
    assert.equal(featured([excluded]), null, JSON.stringify(extra));
  }
});
test("homepage keeps an amplifier fallback and never fabricates a hero without a usable photo", () => {
  const amp = photographed("QRG-AMP", "Amplifier", { heroImageDataUrl: "", galleryImageDataUrls: ["/amp.jpg"] });
  assert.strictEqual(featured([amp]), amp);
  assert.equal(featured([]), null);
  assert.equal(featured([photographed("QRG-EMPTY", "Acoustic Guitar", { heroImageDataUrl: "", galleryImageDataUrls: [] })]), null);
});
const cardResolver = compile("lib/collectible-card.ts", { "./instrument-profile-contract": contract, "./local-demo": { ...localDemo, instrumentToProfileUrl: (value) => "/i/" + value.qrCode }, "./record-location": { formatRecordLocation: () => "" } });
const Card = compile("components/CollectibleRecordCard.tsx", { "next/link": Link, "next/navigation": { useRouter: () => ({ push() {} }) }, "../lib/collectible-card": cardResolver, "../lib/public-media-variant": compile("lib/public-media-variant.ts"), "./ProfileStatusBadges": badges, "./PhotoViewer": { PhotoViewer: () => null }, "./RecordShareButton": { RecordShareButton: () => null } }).CollectibleRecordCard;
test("public cards retain owner collection links while keeping a hidden serial private", () => {
  const html = renderToStaticMarkup(React.createElement(Card, { record: { ...record, publicCollection: { handle: "test-collector", publicName: "Test Collector" } } }));
  assert.match(html, /href="\/collections\/test-collector"/);
  assert.match(html, /Owned by <strong>Test Collector/);
  assert.doesNotMatch(html, /PRIVATE-SERIAL-123/);
});

test("public card attribution retains published ownership and every applicable status without private details", () => {
  const value = { ...record, safetyStatus: "stolen", verificationStatus: "unverified", authenticityStatus: "unconfirmed", saleStatus: "for_sale", originalityStatus: "modified", showVerificationBadge: true, showAuthenticityBadge: true, ownerUserEmail: "private-owner@example.invalid", ownerName: "PRIVATE-OWNER-NAME", publicCollection: { handle: "test-collector", publicName: "Test Collector" } };
  const html = renderToStaticMarkup(React.createElement(Card, { record: value }));
  assert.match(html, /href="\/collections\/test-collector"/);
  assert.match(html, /Owned by <strong>Test Collector/);
  assert.deepEqual([...html.matchAll(/class="record-badge-text">([^<]+)<\/span>/g)].map(match => match[1]), ["Reported Stolen", "Unverified", "Authenticity Unconfirmed", "For Sale", "Modified"]);
  assert.equal(cardResolver.resolveCollectibleCard(value).publicDocumentCount, 1);
  assert.doesNotMatch(html, /PRIVATE-SERIAL-123|Private receipt|\/private\.pdf|PRIVATE-OWNER-NAME|private-owner@example\.invalid/);
  assert.doesNotMatch(html, /record-badge--condition/);
});

test("public card attribution respects trust-display preferences without truncating other statuses", () => {
  const value = { ...record, safetyStatus: "lost", saleStatus: "for_sale", originalityStatus: "modified", showVerificationBadge: false, showAuthenticityBadge: false, publicCollection: { handle: "test-collector", publicName: "Test Collector" } };
  const html = renderToStaticMarkup(React.createElement(Card, { record: value }));
  assert.deepEqual([...html.matchAll(/class="record-badge-text">([^<]+)<\/span>/g)].map(match => match[1]), ["Reported Lost", "For Sale", "Modified"]);
  assert.match(html, /href="\/collections\/test-collector"/);
  assert.match(html, /Owned by <strong>Test Collector/);
  assert.doesNotMatch(html, /PRIVATE-SERIAL-123|record-badge--condition/);
});

test("public card attribution never substitutes private owner details for an unpublished collection", () => {
  const html = renderToStaticMarkup(React.createElement(Card, { record: { ...record, publicCollection: undefined, ownerUserEmail: "private-owner@example.invalid", ownerName: "PRIVATE-OWNER-NAME" } }));
  assert.doesNotMatch(html, /record-owner-link|Owned by|\/collections\/|PRIVATE-OWNER-NAME|private-owner@example\.invalid|PRIVATE-SERIAL-123/);
  assert.deepEqual([...html.matchAll(/class="record-badge-text">([^<]+)<\/span>/g)].map(match => match[1]), ["Verified by QRguitar", "Authenticity Confirmed"]);
});

let ownerWorkspaceStates = [];
const OwnerWorkspaceSupport = ({ code }) => React.createElement("details", { "data-owner-workspace": code }, React.createElement("summary", null, "Seller & support"));
const OwnerWorkspace = compile("app/dashboard/profile/[code]/OwnerProfileClient.tsx", {
  react: { ...React, useState: () => [ownerWorkspaceStates.shift(), () => {}], useEffect() {} },
  "next/link": Link,
  "../../../../components/UiTextProvider": { useUiText: () => (_key, fallback) => fallback },
  "../../../../components/Nav": { Nav: () => React.createElement("nav", { "data-owner-gate-nav": true }) },
  "../../../../components/RecordedBusinessSupport": { RecordedBusinessSupport: OwnerWorkspaceSupport },
  "../../../../lib/supabase-browser": { createBrowserSupabaseClient: () => { throw Error("No auth network in a placement fixture"); } },
  "../../../../lib/owner-profile": { fetchOwnerProfile: () => { throw Error("No owner network in a placement fixture"); }, OwnerProfileError: Error },
  "../../../i/[code]/ProfileClient": { ProfileClient: Profile }
}).OwnerProfileClient;
assert.equal(typeof OwnerWorkspace, "function", "Actual owner wrapper must remain source-bound");
function renderOwnerWorkspace(instrument, status) {
  ownerWorkspaceStates = [instrument, status, 0];
  return renderToStaticMarkup(OwnerWorkspace({ code: record.qrCode }));
}

test("owner workspace slot follows navigation, instrument identity and safety inside the existing Profile heading", () => {
  const value = { ...record, safetyStatus: "stolen" };
  const html = renderOwnerWorkspace(value, "ready");
  assert.equal((html.match(/data-owner-workspace=/g) || []).length, 1);
  const topbar = html.indexOf('class="scan-topbar"');
  const heading = html.indexOf('class="profile-heading"');
  const title = html.indexOf("<h1>");
  const alert = html.indexOf('class="scan-safety-alert"');
  const support = html.indexOf('data-owner-workspace="QRG-LAYOUT"');
  const headingEnd = html.indexOf("</header>", heading);
  assert.ok(html.indexOf('<main class="scan-profile">') < topbar);
  assert.ok(html.indexOf('class="scan-shell"') < topbar);
  assert.ok(topbar < heading && heading < title && title < alert && alert < support && support < headingEnd);
  assert.match(html, /Seller &amp; support/);
  assert.match(html, /href="\/edit\/QRG-LAYOUT"/);
});

test("owner workspace slot ignores supplied owner content on all public Profile return contexts", () => {
  try {
    for (const query of ["", new URLSearchParams({ returnTo: "/dashboard" }).toString(), new URLSearchParams({ returnTo: "/collections/test-collector" }).toString()]) {
      profileContextQuery = query;
      for (const ownerPreview of [undefined, false]) {
        const html = renderToStaticMarkup(React.createElement(Profile, { code: record.qrCode, initialInstrument: record, ownerPreview, ownerWorkspaceContent: React.createElement(OwnerWorkspaceSupport, { code: record.qrCode }) }));
        assert.doesNotMatch(html, /data-owner-workspace|Seller &amp; support|Owner preview|href="\/edit\//);
      }
    }
  } finally { profileContextQuery = ""; }
});

test("owner workspace slot remains absent until the actual wrapper is ready with the matching instrument", () => {
  for (const [instrument, status] of [[record, "loading"], [record, "signin"], [record, "missing"], [record, "error"], [null, "ready"], [{ ...record, qrCode: "QRG-OTHER" }, "ready"]]) {
    const html = renderOwnerWorkspace(instrument, status);
    assert.match(html, /class="owner-profile-gate"/);
    assert.doesNotMatch(html, /data-owner-workspace|Seller &amp; support|class="scan-profile"/);
  }
  assert.match(renderOwnerWorkspace({ ...record, qrCode: record.qrCode.toLowerCase() }, "ready"), /data-owner-workspace="qrg-layout"/);
});

test("Profile return guard preserves Catalog filters and admits only canonical public collection paths", () => {
  const source = read("app/i/[code]/ProfileClient.tsx");
  const ast = ts.createSourceFile("Profile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "safeProfileReturnPath");
  assert.ok(fn, "Actual Profile return guard must exist");
  const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const safe = new Function(js + "; return safeProfileReturnPath;")();
  for (const value of ["/dashboard", "/catalog", "/catalog?brand=Fender&sort=Title#results", "/collections/public-shop", "/collections/" + "a".repeat(40)]) assert.equal(safe(value), value);
  for (const value of [null, "", "https://evil.example/collections/shop", "//evil.example/catalog", "/collections", "/collections/ab", "/collections/-shop", "/collections/shop-", "/collections/" + "a".repeat(41), "/collections/SHOP", "/collections/shop?next=https://evil.example", "/collections/shop#other", "/collections/shop/../other", "/collections/%2e%2e/catalog", "/collections/shop/extra", "/collections\\shop", "/catalogue", "/dashboard/", "/dashboard?tab=profiles", "/dashboard#profiles", "/dashboard/../catalog", "/%64ashboard", "//dashboard", "/dashboard\\x", "/dashboard\n", "/catalog\n"]) assert.equal(safe(value), null, String(value));
});
test("Collection return, Catalog breadcrumb and QR remain accurate without public printing", () => {
  try {
    profileContextQuery = new URLSearchParams({ returnTo: "/collections/public-shop" }).toString();
    const html = render();
    assert.match(html, /href="\/collections\/public-shop">Back to collection</);
    assert.match(html, /aria-label="Back to collection"/);
    assert.doesNotMatch(html, /href="\/handout\//);
    assert.match(html, /data-qr="QRG-LAYOUT"/);
    assert.doesNotMatch(html, /href="\/collections\/public-shop">Catalog</);
    profileContextQuery = new URLSearchParams({ returnTo: "/catalog?brand=Fender" }).toString();
    const catalog = render();
    assert.match(catalog, /href="\/catalog\?brand=Fender">Catalog</);
    assert.match(catalog, /aria-label="Back to Catalog"/);
    profileContextQuery = new URLSearchParams({ returnTo: "//evil.example/catalog" }).toString();
    assert.doesNotMatch(render(), /evil\.example/);
  } finally { profileContextQuery = ""; }
});


function ownerFlowNodes(file, predicate) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  return found.map(node => node.getText(ast));
}
function ownerFlowEvaluate(source, env = {}) {
  const js = ts.transpileModule("const actual = (" + source + ");", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(env), js + "; return actual;")(...Object.values(env));
}
const ownerFlowHref = compile("lib/owner-profile.ts").ownerProfileHref;

test("owner Profile context is opt-in and preserves private routing and canonical QR destinations", () => {
  for (const visibility of ["public", "unlisted", "private"]) {
    const value = { qrCode: "A/B", visibility };
    const base = visibility === "private" ? "/dashboard/profile/A%2FB" : "/i/A%2FB";
    assert.equal(ownerFlowHref(value), base);
    assert.equal(ownerFlowHref(value, "/dashboard"), "/dashboard/profile/A%2FB?returnTo=%2Fdashboard");
    assert.equal(ownerFlowHref(value, "//evil.example"), base);
  }
  const publicRecord = { qrCode: "ABC", visibility: "public", permanentPath: "/i/ABC?view=full#photos" };
  assert.equal(ownerFlowHref(publicRecord, "/dashboard"), "/dashboard/profile/ABC?returnTo=%2Fdashboard");
  assert.equal(ownerFlowHref(publicRecord), "/i/ABC?view=full#photos");
  const canonical = compile("lib/profile-url.ts").publicProfileUrl;
  assert.equal(canonical("A/B"), "https://www.qrguitar.com/i/A%2FB");
});

test("actual Dashboard, Create success/View and Edit return expressions preserve the owner destination", () => {
  const instrument = { qrCode: "QRG-OWNER", visibility: "public" };
  const env = { ownerProfileHref: ownerFlowHref, instrument, original: instrument, savedInstrument: instrument, finalCode: instrument.qrCode, createdCode: instrument.qrCode };
  for (const [file, count] of [["app/dashboard/page.tsx", 1], ["app/create/page.tsx", 2], ["app/edit/[code]/page.tsx", 2]]) {
    const calls = ownerFlowNodes(file, n => ts.isCallExpression(n) && n.expression.getText() === "ownerProfileHref");
    assert.equal(calls.length, count, file + ": actual owner navigation calls must remain covered");
    for (const call of calls) assert.equal(ownerFlowEvaluate(call, env), "/dashboard/profile/QRG-OWNER?returnTo=%2Fdashboard", file);
  }
});

test("both Dashboard Print actions and Create Print round-trip through the actual Print memo", () => {
  const instrument = { qrCode: "QRG-OWNER", visibility: "public" };
  const memos = ownerFlowNodes("app/handout/[code]/page.tsx", n => ts.isVariableDeclaration(n) && n.name.getText() === "profileReturnHref");
  assert.equal(memos.length, 1, "Actual Print return memo must exist exactly once");
  const memo = memos[0].slice(memos[0].indexOf("=") + 1);
  for (const [file, count] of [["app/dashboard/page.tsx", 2], ["app/create/page.tsx", 1]]) {
    const hrefs = ownerFlowNodes(file, n => ts.isJsxAttribute(n) && n.name.getText() === "href" && n.initializer && n.initializer.getText().includes("/handout/"));
    assert.equal(hrefs.length, count, file + ": all direct Print actions must remain covered");
    for (const href of hrefs) {
      const expression = href.slice(href.indexOf("{") + 1, -1);
      const value = ownerFlowEvaluate(expression, { instrument, actionRecord: instrument, createdCode: instrument.qrCode });
      assert.equal(value, "/handout/QRG-OWNER?returnTo=%2Fdashboard");
      const back = ownerFlowEvaluate(memo, { instrument, ownerProfileHref: ownerFlowHref, searchParams: new URL(value, "https://qrguitar.invalid").searchParams, useMemo: fn => fn() });
      assert.equal(back, "/dashboard/profile/QRG-OWNER?returnTo=%2Fdashboard");
    }
  }
  assert.equal(ownerFlowEvaluate(memo, { instrument, ownerProfileHref: ownerFlowHref, searchParams: new URLSearchParams(), useMemo: fn => fn() }), "/i/QRG-OWNER");
});

test("actual Profile Back handler preserves owner, Catalog, Collection and visitor destinations", () => {
  const buttons = ownerFlowNodes("app/i/[code]/ProfileClient.tsx", n => ts.isJsxOpeningElement(n) && n.tagName.getText() === "button" && n.getText().includes("Back to homepage"));
  assert.equal(buttons.length, 1, "Actual Profile Back button must exist");
  const ast = ts.createSourceFile("button.tsx", buttons[0] + "</button>", ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(n) { if (ts.isJsxAttribute(n) && n.name.getText(ast) === "onClick") handler = n.initializer.expression.getText(ast); ts.forEachChild(n, visit); }
  visit(ast);
  assert.ok(handler, "Actual Back handler must exist");
  for (const [ownerPreview, catalogReturnHref, expected] of [[false, "/dashboard", "/dashboard"], [true, "/catalog?q=amp", "/dashboard"], [false, "/catalog?q=amp", "/catalog?q=amp"], [false, "/collections/public-shop", "/collections/public-shop"], [false, null, "/"]]) {
    const calls = [];
    ownerFlowEvaluate(handler, { ownerPreview, catalogReturnHref, router: { push: href => calls.push(href) } })();
    assert.deepEqual(calls, [expected]);
  }
});

test("owner-origin public Profile labels its return without exposing management tools", () => {
  try {
    profileContextQuery = new URLSearchParams({ returnTo: "/dashboard" }).toString();
    const html = render();
    assert.match(html, /href="\/dashboard">Back to collection</);
    assert.match(html, /aria-label="Back to collection"/);
    assert.doesNotMatch(html, /href="\/handout\//);
    assert.match(html, /data-qr="QRG-LAYOUT"/);
    assert.doesNotMatch(html, /Owner profile actions|Edit Profile|Ownership Tools|PRIVATE-SERIAL-123|private\.pdf/);
    profileContextQuery = "";
    assert.match(render(), /aria-label="Back to homepage"/);
  } finally { profileContextQuery = ""; }
});

 test("Overview history highlights reveal only public non-system history before QR utilities", () => {
   const html=render({ timelineEvents: [
     {id:"public-history",title:"Original owner documented",date:"2020-01-02",notes:"Public provenance note",isPublic:true},
     {id:"private-history",title:"PRIVATE ACQUISITION",date:"2020-01-03",notes:"PRIVATE PRICE",isPublic:false},
     {id:"system-history",title:"Profile created",date:"2020-01-01",isPublic:true,isSystem:true}
   ]});
   assert.match(html,/History highlights/);
   assert.match(html,/Original owner documented/);
   assert.doesNotMatch(html,/PRIVATE ACQUISITION|PRIVATE PRICE/);
   const history = html.indexOf('id="profile-history"');
   assert.ok(history >= 0 && history < html.indexOf('class="scan-qr"'));
 });


test("public card history counts exclude private and system entries and deduplicate service history", () => {
  const service = { id: "public-service", title: "Setup", category: "Setup", isPublic: true, isSystem: false, publicDescription: "Setup completed." };
  const instrument = { ...record, timelineEvents: [
    { id: "public-origin", title: "Profile created", isPublic: true, isSystem: true },
    { id: "public-history", title: "Documentation", category: "Documentation", isPublic: true, isSystem: false },
    { id: "private-history", title: "Private instrument note", category: "Documentation", isPublic: false, isSystem: false }, service
  ], serviceEvents: [service] };
  const value = cardResolver.resolveCollectibleCard(instrument);
  assert.equal(value.publicHistoryCount, 2);
  const html = renderToStaticMarkup(React.createElement(Card, { record: instrument }));
  assert.match(html, /2 recorded history entries/);
  assert.doesNotMatch(html, /Private instrument note/);
  assert.ok(html.lastIndexOf('QRG-LAYOUT') > html.indexOf('collectible-card-actions'));
});

test("owner-reported documentation is attributed as history, not service", () => {
  const html = render({ timelineEvents: [{ id: "documentation", title: "Certificate recorded", category: "Documentation", isPublic: true, isSystem: false, publicDescription: "Original paperwork added.", datePrecision: "day", serviceDate: "2026-09-10" }] });
  assert.match(html, /Owner-reported history/);
  assert.doesNotMatch(html, /Owner-reported service/);
});

test("recorded builder is visible without implying factory certification", () => {
  const html = render({ builder: "Example Workshop" });
  assert.match(html, /Recorded builder/);
  assert.match(html, /Example Workshop/);
  assert.doesNotMatch(html, /Factory-certified|Manufacturer-certified/);
  assert.doesNotMatch(render({ builder: " " }), /Recorded builder/);
});

 test("continuous public Profile includes explicitly shared service reports and excludes private reports", () => {
  const html = render({ serviceEvents: [
    { id: "shared-service", title: "Shared fret dressing", category: "Service", serviceDate: "2021-05-04", datePrecision: "day", isPublic: true, publicDescription: "Approved public work summary" },
    { id: "private-service", title: "PRIVATE WORK ORDER", category: "Service", serviceDate: "2023-05-04", datePrecision: "day", isPublic: false, notes: "PRIVATE CUSTOMER PRICE" }
  ] });
  assert.match(html, /id="profile-service"/);
  assert.match(html, /Shared fret dressing/);
  assert.doesNotMatch(html, /PRIVATE WORK ORDER|PRIVATE CUSTOMER PRICE/);
  assert.ok(html.indexOf('id="profile-service"') > html.indexOf('id="profile-history"'));
  assert.ok(html.indexOf('id="profile-service"') < html.indexOf('class="scan-qr"'));
  assert.doesNotMatch(render({ serviceEvents: [{ id: "private", title: "Private repair", isPublic: false }] }), /id="profile-service"/);
 });
