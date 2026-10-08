import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const registry = read("lib/content-registry.ts");
const homepage = read("components/HomePageClient.tsx");
const catalog = read("app/catalog/CatalogClient.tsx");
const guide = read("app/how-it-works/HowItWorksClient.tsx");
const css = read("app/globals.css");

[
  "One Profile for the life of an instrument.",
  "Keep the photos, specs, service, documents, ownership, and permanent QR with the instrument.",
  "See what's already documented.",
  "Create it once. Keep it current.",
  "See the details that matter.",
  "One system. Different jobs.",
  "The history stays with the instrument.",
  "Start free. Get help when you need it.",
  "Start with one instrument.",
  "Browse QRguitar Profiles",
  "One Profile that stays with the instrument."
].forEach((copy) => includes(registry, copy, `Content Studio is missing approved copy: ${copy}`));

includes(homepage, "home-archive-rail", "Homepage must include the public archive rail.");
includes(homepage, "onPointerMove={moveArchiveDrag}", "Archive must support pointer drag.");
includes(homepage, "handleArchiveKeyDown", "Archive must support keyboard navigation.");
includes(catalog, "catalog-more-filters", "Catalog must keep secondary filters organized.");
includes(guide, '<ol className="product-guide-steps">', "How It Works must use one numbered sequence.");
includes(css, "--warm-canvas:", "Theme must define the warm editorial canvas.");
includes(css, ".create-wizard-page {", "Create must use the shared editorial workspace.");
includes(css, "scrollbar-width: none", "Touch rails must hide native scrollbars.");
excludes(homepage, "Public Record", "Homepage must not use record-era product terminology.");

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route) {
  const response = await fetch(`${baseUrl}${route}`, {
    cache: "no-store",
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache" }
  });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works", "/login", "/contact", "/privacy", "/terms"]) {
  const result = await get(route);
  assert(result.response.ok, `${route} returned ${result.response.status}.`);
  const visibleText = result.text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  for (const banned of ["visible profile", "serial/build", "permanent record", "record page", "state-of-the-art", "best-in-class", "world-class", "game-changing"]) {
    assert(!visibleText.toLowerCase().includes(banned), `${route} renders banned wording: ${banned}.`);
  }
}

const home = await get("/");
for (const copy of ["One Profile for the life of an instrument.", "See what's already documented.", "Start with one instrument."]) {
  includes(home.text, copy, `Homepage does not render approved copy: ${copy}`);
}

const catalogPage = await get("/catalog");
includes(catalogPage.text, "Browse QRguitar Profiles", "Catalog headline diverged from approved copy.");
includes(catalogPage.text, "Search Profiles", "Catalog search label diverged from approved copy.");

console.log("QRguitar brand-experience assertions passed.");
