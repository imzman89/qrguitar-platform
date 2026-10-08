import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const homepage = read("components/HomePageClient.tsx");
const profileContract = read("lib/instrument-profile-contract.ts");
const profile = read("app/i/[code]/ProfileClient.tsx");
const printSuite = read("app/handout/[code]/page.tsx");
const printCss = read("app/handout/[code]/print-suite.module.css");
const siteEditor = read("app/site-editor/page.tsx");
const registry = read("lib/content-registry.ts");
const middleware = read("middleware.ts");
const nav = read("components/Nav.tsx");
const layout = read("app/layout.tsx");
const themeRuntime = read("components/ThemeRuntime.tsx");

includes(homepage, "archiveRecords", "Homepage archive must use real public Profiles.");
includes(homepage, "archiveImages.has(leadImage)", "Homepage must avoid duplicate archive photography.");
includes(profileContract, 'instrument.showSerialPublic === true', "Public Serial Number display must require owner opt-in.");
includes(profileContract, '!event.isSystem && !/^(qrguitar )?profile created$/i.test(event.title.trim())', "Profile creation must not force Timeline.");
includes(profileContract, 'document.visibility === "public"', "Documents must remain public-filtered.");
includes(profileContract, 'item.isPublic === true', "Media must remain public-filtered.");
includes(profile, "meaningfulTimelineEvents.length", "Timeline tabs must remain data-driven.");
includes(profile, "timeline-origin-marker", "Profile creation must remain a quiet origin marker.");
excludes(profile, "publicMedia.map((media)", "Profile photographs must not repeat in Media.");
includes(printSuite, 'useState<PrintScope>("public")', "Print Suite must default to public-safe copy.");
includes(printSuite, "window.print()", "Print Suite must use native printing.");
excludes(printSuite, "document.write", "Print Suite must not create copied popup documents.");
includes(printCss, "@media print", "Print Suite must own scoped print rules.");
excludes(siteEditor, "Checking owner access", "Site Editor must not show duplicate loading state.");
includes(registry, '"printWorkspace.title"', "Print Suite copy must remain in Content Studio.");
includes(middleware, 'request.headers.get("host")', "Local origin normalization must inspect the actual Host header.");
excludes(middleware, 'request.nextUrl.hostname === "localhost"', "Local origin normalization must not self-redirect 127.0.0.1.");
assert(/useEffect\(\(\) => \{\s+let active = true;\s+void fetchPublishedSiteSettings\(\)/.test(nav) && nav.includes("if (active && settings) setContent(settings.content)"), "Navigation must load published Site Editor settings on mount and ignore completion after unmount.");
includes(layout, "loadSiteSettingsRequest", "The published theme must be loaded on the server.");
includes(layout, "const publishedSettings = loadedSettings.settings", "The request-scoped published or authorized draft theme must be rendered on the server.");
includes(layout, '"--bg": publishedSettings.colors.background', "The first paint must use the published background.");
excludes(themeRuntime, "applyThemeSettings(defaultSiteSettings)", "Theme hydration must not flash bundled defaults over the published theme.");

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route, userAgent = "QRguitar-master-release/1.0") {
  const joiner = route.includes("?") ? "&" : "?";
  const response = await fetch(`${baseUrl}${route}${joiner}qa=master-${Date.now()}-${Math.random()}`, {
    cache: "no-store",
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": userAgent }
  });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works", "/contact", "/privacy", "/terms", "/robots.txt", "/sitemap.xml"]) {
  const result = await get(route);
  assert(result.response.ok, `${route} returned ${result.response.status}.`);
}

const api = await get("/api/instruments");
assert(api.response.ok, `Public API returned ${api.response.status}.`);
const payload = JSON.parse(api.text);
const records = Array.isArray(payload) ? payload : payload.instruments;
assert(Array.isArray(records) && records.length > 0, "Public API must return eligible Profiles.");
const codes = records.map((record) => String(record.qrCode || ""));
assert(codes.every(Boolean), "Public API returned a Profile without a QRguitar ID.");
assert(new Set(codes).size === codes.length, "Public API returned duplicate QRguitar IDs.");

const serialized = JSON.stringify(records);
for (const forbidden of ["ownerEmail", "owner_email", "privateNotes", "private_notes", "transferToken", "transfer_token", "recipientEmail", "recipient_email", "auth_metadata", "storage_path", "supabase.co/storage", "token="]) {
  excludes(serialized, forbidden, `Public API leaked ${forbidden}.`);
}
records.forEach((record) => {
  if (record.showSerialPublic !== true) assert(!record.serial, `${record.qrCode} leaked a hidden Serial Number.`);
});

const [home, catalog, sitemap] = await Promise.all([get("/"), get("/catalog"), get("/sitemap.xml")]);
includes(home.text, codes[0], "Homepage latest Profile disagrees with public API order.");
codes.forEach((code) => {
  includes(catalog.text, code, `Catalog is missing ${code}.`);
  includes(sitemap.text, `/i/${code}`, `Sitemap is missing ${code}.`);
});

for (const route of ["/i/QRG-PI260001", "/i/qrg-pi260001", "/api/instruments?code=QRG-PI260001", "/api/instruments?code=qrg-pi260001"]) {
  const result = await get(route);
  assert(result.response.status === 404, `Retired Profile route resolved: ${route}.`);
}

for (const record of records) {
  const page = await get(`/i/${encodeURIComponent(record.qrCode)}`);
  assert(page.response.ok, `${record.qrCode} returned ${page.response.status}.`);
  excludes(page.text, "supabase.co/storage", `${record.qrCode} exposed a storage URL.`);
  if (!(record.externalMedia || []).length) excludes(page.text, 'data-profile-tab="media"', `${record.qrCode} renders an empty Media tab.`);
  if (!(record.documentFiles || []).length) excludes(page.text, 'data-profile-tab="documents"', `${record.qrCode} renders an empty Documents tab.`);
  if (!(record.serviceEvents || []).length) excludes(page.text, 'data-profile-tab="service"', `${record.qrCode} renders an empty Service tab.`);
}

console.log(`QRguitar master-release assertions passed for ${codes.length} public Profiles.`);
