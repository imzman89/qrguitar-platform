import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(source, snippet, message) {
  assert(source.includes(snippet), message);
}

function excludes(source, snippet, message) {
  assert(!source.includes(snippet), message);
}

const card = read("components/CollectibleRecordCard.tsx");
const resolver = read("lib/collectible-card.ts");
const latest = read("components/LatestPublicRecord.tsx");
const catalog = read("app/catalog/CatalogClient.tsx");
const collection = read("app/collections/[handle]/CollectionsClient.tsx");
const profile = read("app/i/[code]/ProfileClient.tsx");
const homepage = read("components/HomePageClient.tsx");
const contentRegistry = read("lib/content-registry.ts");

includes(card, "resolveCollectibleCard(record)", "Public cards must use the shared collectible-card DTO.");
includes(latest, "<CollectibleRecordCard", "The homepage latest Profile must use the shared card.");
includes(catalog, "<CollectibleRecordCard", "Catalog Profiles must use the shared card.");
includes(collection, "<CollectibleRecordCard", "Public collection Profiles must use the shared card.");
includes(resolver, "record.showSerialPublic", "Public serial visibility must respect the explicit privacy setting.");
includes(resolver, "publicSerial:", "The shared DTO must keep public Serial Number separate from QRguitar ID.");
includes(card, "maxBadges={3}", "Collectible cards must cap compact status badges.");
includes(card, "card.images.length > 1", "One-photo Profiles must not render gallery controls.");
includes(card, "onPointerMove={handlePointerMove}", "Card galleries must support pointer dragging.");
includes(card, "onWheel={handleWheel}", "Card galleries must support horizontal wheel movement.");
includes(card, "onKeyDown={handleKeyDown}", "Card galleries must support keyboard navigation.");
includes(card, "Math.abs(distance) > 8", "Card drag must use a movement threshold before suppressing Profile navigation.");
includes(card, 'href={card.profileUrl}', "Cards must retain an explicit accessible Profile link.");
includes(profile, "scan-hero-gallery", "Public Profiles must render the primary gallery in the hero.");
includes(profile, "media-gallery-lightbox", "Public Profile photos must support fullscreen viewing.");
includes(profile, "meaningfulTimelineEvents.length", "Timeline visibility must be based on meaningful public history.");
includes(profile, "externalMedia.length", "Media visibility must be based on supplemental public media.");
includes(profile, "documentFiles.length", "Documents visibility must be based on visible public documents.");
includes(profile, "youtube-nocookie.com/embed", "YouTube embeds must use the privacy-enhanced host.");
includes(profile, "player.vimeo.com/video", "Vimeo embeds must use the supported player host.");
excludes(profile, "publicMedia.map((media)", "The Media tab must not duplicate the primary photo gallery.");
includes(homepage, "supportingRecord", "Homepage supporting imagery must come from an eligible Profile.");
includes(homepage, "heroImages", "Homepage supporting imagery must avoid repeating the hero photo.");
excludes(catalog, "topBrands", "Catalog must not publish an arbitrary top-brands summary.");

[
  "catalog.results.all",
  "catalog.results.filtered",
  "catalog.actions.reset",
  "cards.attribution.collection",
  "collections.results.count",
  "profile.gallery.label",
  "profile.gallery.previous",
  "profile.gallery.next",
  "profile.attribution.collection"
].forEach((key) => includes(contentRegistry, `"${key}"`, `Content Studio must own ${key}.`));

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";

async function get(route) {
  const response = await fetch(`${baseUrl}${route}`, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" }
  });
  return { response, text: await response.text() };
}

const homepageResponse = await get("/");
assert(homepageResponse.response.ok, `Homepage returned ${homepageResponse.response.status}.`);
includes(homepageResponse.text, "Latest QRguitar Profile", "Homepage must render the latest Profile server-side.");

const catalogResponse = await get("/catalog");
assert(catalogResponse.response.ok, `Catalog returned ${catalogResponse.response.status}.`);
excludes(catalogResponse.text, "Top brands", "Catalog must not render a fabricated brand summary.");

const apiResponse = await get("/api/instruments");
assert(apiResponse.response.ok, `Public API returned ${apiResponse.response.status}.`);
const apiPayload = JSON.parse(apiResponse.text);
const records = Array.isArray(apiPayload) ? apiPayload : apiPayload.instruments;
assert(Array.isArray(records), "Public API must return a Profile list.");
assert(records.length > 0, "Public API must return at least one real visible Profile.");

const codes = records.map((record) => record.qrCode || record.qr_code).filter(Boolean);
assert(new Set(codes).size === codes.length, "Public API must not return duplicate QRguitar IDs.");
assert(records.every((record) => !("ownerEmail" in record) && !("owner_email" in record)), "Public API must not expose owner email.");
assert(records.every((record) => !("privateNotes" in record) && !("private_notes" in record)), "Public API must not expose private notes.");
assert(records.every((record) => !("transferToken" in record) && !("transfer_token" in record)), "Public API must not expose transfer tokens.");

console.log(`Public collectible assertions passed for ${records.length} visible Profiles.`);
