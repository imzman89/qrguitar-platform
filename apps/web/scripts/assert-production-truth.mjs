import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requestedBase = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
const baseUrl = new URL(requestedBase).origin;
const directUrl = process.env.QRGUITAR_DIRECT_URL ? new URL(process.env.QRGUITAR_DIRECT_URL).origin : "";
const origins = baseUrl.includes("qrguitar.com")
  ? Array.from(new Set(["https://www.qrguitar.com", "https://qrguitar.com", directUrl].filter(Boolean)))
  : [baseUrl];
const userAgents = [
  "QRguitar-release-check/1.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "bingbot/2.0 (+http://www.bing.com/bingbot.htm)"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, snippet, message) {
  assert(source.includes(snippet), message);
}

function excludes(source, snippet, message) {
  assert(!source.includes(snippet), message);
}

async function get(origin, route, userAgent = userAgents[0]) {
  const joiner = route.includes("?") ? "&" : "?";
  const response = await fetch(`${origin}${route}${joiner}qa=production-truth-${Date.now()}-${Math.random()}`, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      "user-agent": userAgent
    }
  });
  return { response, text: await response.text() };
}

function profileList(payload) {
  const records = Array.isArray(payload) ? payload : payload?.instruments;
  assert(Array.isArray(records), "Public API must return a Profile array.");
  return records;
}

function codeOf(record) {
  return String(record.qrCode || record.qr_code || "");
}

function publicUrls(record) {
  return [
    record.heroImageDataUrl,
    ...(record.galleryImageDataUrls || []),
    ...(record.documentFiles || []).map((item) => item?.url)
  ].filter(Boolean).map(String);
}

function hasMeaningfulTimeline(record) {
  return (record.timelineEvents || []).some((event) => {
    const type = String(event?.type || "").toLowerCase();
    const title = String(event?.title || "").toLowerCase();
    return type !== "profile_created" && title !== "profile created";
  });
}

const publicResolver = read("lib/public-instruments.ts");
const publicFileRoute = read("app/api/public-file/[code]/[kind]/[token]/route.ts");
const homepage = read("components/HomePageClient.tsx");
const profile = read("app/i/[code]/ProfileClient.tsx");
const catalog = read("app/catalog/CatalogClient.tsx");
const siteSettings = read("lib/site-settings.ts");
const siteEditor = read("app/site-editor/page.tsx");
const installers = read("app/installers/page.tsx");

includes(publicResolver, "publicFileUrl(", "Public media must use the opaque same-origin file proxy.");
excludes(publicResolver, "supabaseSignedStorageUrl", "Public DTO resolution must not emit signed storage URLs.");
includes(publicFileRoute, "isEligiblePublicProfile", "The public-file route must enforce shared public eligibility.");
includes(publicFileRoute, "isRetiredPublicProfileCode", "The public-file route must reject retired Profiles.");
includes(homepage, "supportingRecord", "Homepage supporting imagery must use a different eligible Profile.");
includes(homepage, 'qrCode !== initialLatestRecord?.qrCode', "Homepage supporting imagery must exclude the latest Profile.");
includes(homepage, 'continuity:', "Homepage must include the service, ownership, and provenance section.");
includes(profile, "meaningfulTimelineEvents.length", "Timeline tabs must be content-aware.");
includes(profile, "externalMedia.length", "Media tabs must be content-aware.");
includes(profile, "documentFiles.length", "Document tabs must be content-aware.");
excludes(catalog, "topBrands", "Catalog must not render arbitrary brand summaries.");
includes(catalog, 'setShowOwnershipClaim(payload.match === "none")', "Every serial with no public match must offer the same ownership-claim path.");
includes(catalog, 'href="/ownership-claim">Start ownership claim', "The generic no-public-match result must lead to signed-in ownership claims.");
excludes(catalog, '"protected"', "Catalog serial results must not distinguish private Profile existence.");
includes(siteSettings, "Public Profiles", "Published settings normalization must use Public Profile terminology.");
excludes(siteEditor, "Confirming your QRguitar session", "Site Editor must not render duplicate access-loading messages.");
excludes(installers.toLowerCase(), "find installers near you", "Installer copy must not promise an unavailable finder.");

const baselineByOrigin = new Map();

for (const origin of origins) {
  let canonicalCodes = null;
  for (const userAgent of userAgents) {
    const api = await get(origin, "/api/instruments", userAgent);
    assert(api.response.ok, `${origin} public API returned ${api.response.status}.`);
    const records = profileList(JSON.parse(api.text));
    const codes = records.map(codeOf).filter(Boolean);
    assert(codes.length === records.length, `${origin} public API returned a Profile without a QRguitar ID.`);
    assert(new Set(codes).size === codes.length, `${origin} public API returned duplicate QRguitar IDs.`);
    if (!canonicalCodes) canonicalCodes = codes;
    else assert(JSON.stringify(codes) === JSON.stringify(canonicalCodes), `${origin} serves different Profile IDs by user agent.`);

    const serialized = JSON.stringify(records);
    [
      "ownerEmail", "owner_email", "privateNotes", "private_notes", "transferToken", "transfer_token",
      "recipientEmail", "recipient_email", "auth_metadata", "instrument-media", "instrument-documents",
      "supabase.co/storage", "token="
    ].forEach((value) => excludes(serialized, value, `${origin} public API leaks ${value}.`));

    records.forEach((record) => {
      publicUrls(record).forEach((url) => {
        const parsed = new URL(url, origin);
        assert(parsed.origin === new URL(origin).origin, `${codeOf(record)} exposes a cross-origin public media URL.`);
        assert(parsed.pathname.startsWith("/api/public-file/"), `${codeOf(record)} exposes a non-opaque public media path.`);
      });
      if (!record.showSerialPublic) {
        assert(!record.serial, `${codeOf(record)} exposes a hidden Serial Number.`);
      }
    });
  }

  const api = await get(origin, "/api/instruments");
  const records = profileList(JSON.parse(api.text));
  const codes = records.map(codeOf);
  baselineByOrigin.set(origin, codes);

  const [home, catalogPage, sitemap, howItWorks] = await Promise.all([
    get(origin, "/"),
    get(origin, "/catalog"),
    get(origin, "/sitemap.xml"),
    get(origin, "/how-it-works")
  ]);
  assert(home.response.ok, `${origin} homepage returned ${home.response.status}.`);
  assert(catalogPage.response.ok, `${origin} Catalog returned ${catalogPage.response.status}.`);
  assert(sitemap.response.ok, `${origin} sitemap returned ${sitemap.response.status}.`);
  assert(howItWorks.response.ok, `${origin} How It Works returned ${howItWorks.response.status}.`);

  codes.forEach((code) => {
    includes(catalogPage.text, code, `${origin} Catalog is missing ${code}.`);
    includes(sitemap.text, `/i/${code}`, `${origin} sitemap is missing ${code}.`);
  });
  if (codes[0]) includes(home.text, codes[0], `${origin} homepage does not render the newest Profile.`);
  excludes(catalogPage.text, "visible profiles", `${origin} Catalog contains stale visibility terminology.`);
  excludes(howItWorks.text, "Visible Profile", `${origin} How It Works contains stale visibility terminology.`);
  excludes(howItWorks.text, "1. 01", `${origin} How It Works contains double numbering.`);
  excludes(howItWorks.text, "2. 02", `${origin} How It Works contains double numbering.`);

  const upperRetired = await get(origin, "/i/QRG-PI260001");
  const lowerRetired = await get(origin, "/i/qrg-pi260001");
  const retiredApi = await get(origin, "/api/instruments?code=QRG-PI260001");
  assert(upperRetired.response.status === 404, `${origin} retired Profile uppercase route returned ${upperRetired.response.status}.`);
  assert(lowerRetired.response.status === 404, `${origin} retired Profile lowercase route returned ${lowerRetired.response.status}.`);
  assert(retiredApi.response.status === 404, `${origin} retired Profile API returned ${retiredApi.response.status}.`);

  for (const record of records) {
    const page = await get(origin, `/i/${encodeURIComponent(codeOf(record))}`);
    assert(page.response.ok, `${origin} Profile ${codeOf(record)} returned ${page.response.status}.`);
    const text = page.text;
    if (!(record.externalMedia || []).length) excludes(text, 'data-profile-tab="media"', `${codeOf(record)} renders an empty Media tab.`);
    if (!(record.documentFiles || []).length) excludes(text, 'data-profile-tab="documents"', `${codeOf(record)} renders an empty Documents tab.`);
    if (!(record.serviceEvents || []).length) excludes(text, 'data-profile-tab="service"', `${codeOf(record)} renders an empty Service tab.`);
    if (!hasMeaningfulTimeline(record)) excludes(text, 'data-profile-tab="timeline"', `${codeOf(record)} renders an empty Timeline tab.`);
    excludes(text, "instrument-media", `${codeOf(record)} Profile leaks the media bucket name.`);
    excludes(text, "instrument-documents", `${codeOf(record)} Profile leaks the document bucket name.`);
    excludes(text, "supabase.co/storage", `${codeOf(record)} Profile leaks a storage URL.`);
  }
}

if (baselineByOrigin.size > 1) {
  const states = Array.from(baselineByOrigin.entries());
  const baseline = JSON.stringify(states[0][1]);
  states.slice(1).forEach(([origin, codes]) => {
    assert(JSON.stringify(codes) === baseline, `${origin} disagrees with ${states[0][0]} on public Profile IDs.`);
  });
}

console.log(`Production-truth assertions passed for ${origins.join(", ")}.`);
