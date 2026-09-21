import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const read = (file) => fs.readFileSync(path.join(web, file), "utf8");
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const Link = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
function compile(file, overrides = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((name) => overrides[name] || (name.endsWith(".module.css") ? css : require(name)), module, module.exports);
  return module.exports;
}
const localDemo = { instrumentDisplayName: (record) => record.name || [record.brand, record.model].filter(Boolean).join(" "), getInstrumentVerificationStatus: (record) => record.verificationStatus || "unverified", getInstrumentCondition: (record) => record.instrumentCondition || "used" };
const contract = compile("lib/instrument-profile-contract.ts");
const badges = compile("components/ProfileStatusBadges.tsx", { "next/link": Link, "../lib/local-demo": localDemo });
const identity = compile("components/ProfileIdentity.tsx");
const contentLabels = { "profile.tabs.overview": "Overview", "profile.tabs.specifications": "Details", "profile.gallery.label": "Instrument photographs", "profile.verification.title": "Verified by QRguitar", "profile.verification.body": "Record details have been reviewed.", "profile.authenticity.title": "Authenticity Confirmed", "profile.authenticity.body": "Authenticity evidence has been reviewed." };
const Profile = compile("app/i/[code]/ProfileClient.tsx", {
  "next/link": Link,
  "next/navigation": { useRouter: () => ({ replace() {}, push() {} }), useSearchParams: () => new URLSearchParams() },
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
  "../../../lib/optional-tracking-consent": { dispatchOptionalTrackingProductEvent() {}, optionalTrackingProductEvents: {} },
  "../../../lib/image-fallback": compile("lib/image-fallback.ts"),
  "../../../lib/public-media-variant": compile("lib/public-media-variant.ts"),
  "./ProfileBreadcrumbs": { ProfileBreadcrumbs: () => null }
}).ProfileClient;
const record = { qrCode: "QRG-LAYOUT", name: "Twin Reverb", brand: "Fender", model: "Twin Reverb", year: "1965", instrumentType: "Amplifier", heroImageDataUrl: "/front.jpg", galleryImageDataUrls: ["/front.jpg", "/back.jpg"], verificationStatus: "verified", authenticityStatus: "confirmed", visibility: "public", serial: "PRIVATE-SERIAL-123", showSerialPublic: false, summary: "Original cabinet with documented service.", location: "Boston", documentFiles: [{ name: "Private receipt", visibility: "private", url: "/private.pdf" }, { name: "Public manual", visibility: "public", url: "/manual.pdf" }] };
const render = (changes = {}) => renderToStaticMarkup(React.createElement(Profile, { code: record.qrCode, initialInstrument: { ...record, ...changes } }));

test("one Profile title and its category/year precede the gallery in the accessible DOM", () => {
  const html = render();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.ok(html.indexOf("<h1>") < html.indexOf('class="scan-hero-gallery"'));
  assert.ok(html.indexOf("1965 · Amplifier") < html.indexOf('class="scan-hero-gallery"'));
  assert.match(html, /photo 1 of 2/);
});

test("public identity uses the privacy projection and public-only document count", () => {
  const html = render();
  assert.doesNotMatch(html, /PRIVATE-SERIAL-123|Private receipt|private\.pdf/);
  assert.match(html, /2 photos \/ 1 document/);
  assert.match(render({ showSerialPublic: true }), /PRIVATE-SERIAL-123/);
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

test("ownership help follows record content as a closed disclosure and owner-only actions stay absent", () => {
  const html = render();
  assert.ok(html.indexOf('class="profile-claim-entry"') > html.indexOf("Original cabinet with documented service."));
  assert.match(html, /<details class="profile-claim-entry">/);
  assert.match(html, /ownership-claim\?code=QRG-LAYOUT/);
  assert.doesNotMatch(html, /Owner profile actions|Edit Profile|Ownership Tools/);
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
