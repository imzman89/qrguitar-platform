import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = process.env.QRGUITAR_SOURCE_ROOT
  ? createRequire(path.join(process.env.QRGUITAR_SOURCE_ROOT, "package.json"))
  : createRequire(import.meta.url);
const ts = require("typescript");

function loadTypeScript(relative, dependencies = {}, environment = {}) {
  const source = fs.readFileSync(path.join(webRoot, relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", code)(specifier => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected dependency ${specifier} from ${relative}`);
  }, module, module.exports, { env: environment });
  return module.exports;
}

const seo = loadTypeScript("lib/seo.ts", {
  "./local-demo": {
    instrumentDisplayName: record => record.name || [record.brand, record.model].filter(Boolean).join(" ") || record.qrCode
  }
});
const contentRegistry = loadTypeScript("lib/content-registry.ts", {
  "./ui-text-registry": loadTypeScript("lib/ui-text-registry.ts"),
  "./ui-text-protection": loadTypeScript("lib/ui-text-protection.ts")
});
const indexing = loadTypeScript("lib/search-indexing.ts");

test("canonical metadata and discovery files always use the www production origin", async () => {
  assert.equal(seo.SITE_URL, "https://www.qrguitar.com");
  const publicMetadata = seo.buildPageMetadata("Member Collections", "Public collections", "/collections");
  assert.equal(publicMetadata.alternates.canonical, "https://www.qrguitar.com/collections");
  assert.equal(publicMetadata.openGraph.url, "https://www.qrguitar.com/collections");
  assert.deepEqual(publicMetadata.twitter.images, ["https://www.qrguitar.com/seo/qrguitar-og-v2.png"]);

  const robots = loadTypeScript("app/robots.txt/route.ts", { "../../lib/seo": seo }, {
    NEXT_PUBLIC_SITE_URL: "https://qrguitar.com"
  });
  const body = await robots.GET().text();
  assert.doesNotMatch(body, /^Host:/m);
  assert.match(body, /^Sitemap: https:\/\/www\.qrguitar\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(body, /^Disallow:/m);
});

test("private and tokenized route families receive noindex without prefix collisions", () => {
  for (const pathname of [
    "/account", "/account/security", "/admin", "/admin/deletion-requests", "/api/public-file/QRG-A/photo/token",
    "/billing/return", "/dashboard", "/dashboard/profile/QRG-A", "/edit/QRG-A", "/handout/QRG-A", "/login",
    "/ownership-claim", "/reset-password", "/service-review/abc", "/service-work/QRG-A", "/site-editor", "/transfer/abc"
  ]) assert.equal(indexing.isNoindexPathname(pathname), true, pathname);
  for (const pathname of ["/", "/accounting", "/catalog", "/collections", "/create", "/i/QRG-A", "/service-worker.js"])
    assert.equal(indexing.isNoindexPathname(pathname), false, pathname);

  const privateMetadata = seo.buildPrivatePageMetadata("Private", "Private workspace");
  assert.deepEqual(privateMetadata.robots, { index: false, follow: false });
  assert.equal(privateMetadata.alternates, null);
  assert.equal(privateMetadata.openGraph, null);
  assert.equal(privateMetadata.twitter, null);
});

test("middleware emits X-Robots-Tag for protected families and leaves public pages indexable", () => {
  const nextResponse = {
    next: () => ({ headers: new Headers() }),
    redirect: (url, status) => ({ headers: new Headers({ location: String(url) }), status })
  };
  const middleware = loadTypeScript("middleware.ts", {
    "next/server": { NextResponse: nextResponse },
    "./lib/search-indexing": indexing,
    "./lib/security-headers": { isCheckoutPath: () => false, securityHeaders: () => [] }
  }, { NODE_ENV: "production" });
  const request = pathname => ({
    headers: new Headers({ host: "www.qrguitar.com" }),
    nextUrl: { pathname, searchParams: new URLSearchParams(), clone: () => ({ pathname, hostname: "www.qrguitar.com", toString: () => `https://www.qrguitar.com${pathname}` }) },
    cookies: { has: () => false }
  });
  for (const pathname of ["/dashboard", "/edit/QRG-A", "/service-review/private-id", "/api/account"])
    assert.equal(middleware.middleware(request(pathname)).headers.get("x-robots-tag"), "noindex, nofollow", pathname);
  for (const pathname of ["/", "/catalog", "/collections/owner", "/i/QRG-A"])
    assert.equal(middleware.middleware(request(pathname)).headers.get("x-robots-tag"), null, pathname);
});

test("private route layouts clear inherited canonical and social metadata", () => {
  const layouts = [
    "app/account/layout.tsx", "app/admin/layout.tsx", "app/dashboard/layout.tsx", "app/edit/layout.tsx",
    "app/handout/layout.tsx", "app/login/layout.tsx", "app/ownership-claim/layout.tsx",
    "app/reset-password/layout.tsx", "app/service-review/layout.tsx", "app/service-work/layout.tsx",
    "app/site-editor/layout.tsx", "app/transfer/layout.tsx"
  ];
  for (const relative of layouts) {
    const module = loadTypeScript(relative, { "../../lib/seo": seo, "../lib/seo": seo });
    assert.deepEqual(module.metadata.robots, { index: false, follow: false }, relative);
    assert.equal(module.metadata.alternates, null, relative);
  }
});

test("sitemap is deterministic and uses Profile and collection update timestamps", async () => {
  const profiles = [
    { qrCode: "QRG-UPDATED", createdAt: "2025-01-02T00:00:00.000Z", updatedAt: "2026-09-17T15:30:00.000Z", publicCollection: { handle: "owner-one" } },
    { qrCode: "QRG-CREATED", createdAt: "2026-02-03T00:00:00.000Z" }
  ];
  const rows = [{
    content_key: "public_collection_owner:owner-one",
    content_value: { enabled: true, allowIndexing: true, handle: "owner-one", publicName: "Owner One" },
    updated_at: "2026-09-16T10:00:00.000Z"
  }];
  const route = loadTypeScript("app/sitemap.xml/route.ts", {
    "../../lib/public-instruments": { getPublicInstruments: async () => profiles },
    "../../lib/public-collections": { cleanPublicCollection: value => ({ allowIndexing: true, ...value }) },
    "../../lib/seo": seo,
    "../../lib/supabase-pagination": { supabasePagedRows: async () => rows }
  }, { NEXT_PUBLIC_SITE_URL: "https://qrguitar.com" });
  const first = await (await route.GET()).text();
  const second = await (await route.GET()).text();
  assert.equal(first, second);
  assert.doesNotMatch(first, /<loc>https:\/\/qrguitar\.com/);
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/i\/QRG-UPDATED<\/loc>[\s\S]*?<lastmod>2026-09-17T15:30:00\.000Z<\/lastmod>/);
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/i\/QRG-CREATED<\/loc>[\s\S]*?<lastmod>2026-02-03T00:00:00\.000Z<\/lastmod>/);
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/collections\/owner-one<\/loc>[\s\S]*?<lastmod>2026-09-16T10:00:00\.000Z<\/lastmod>/);
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/installers<\/loc>/);
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/<\/loc>\s*<lastmod>2026-09-18<\/lastmod>/);
});

test("Profile social metadata never publishes browser-local image schemes", () => {
  const fallback = "https://www.qrguitar.com/seo/qrguitar-og-v2.png";
  assert.equal(seo.getRecordMetadataImage({ heroImageDataUrl: "data:image/png;base64,private" }), fallback);
  assert.equal(seo.getRecordMetadataImage({ heroImageDataUrl: "blob:https://www.qrguitar.com/private" }), fallback);
  assert.equal(seo.getRecordMetadataImage({
    heroImageDataUrl: "data:image/png;base64,private",
    galleryImageDataUrls: ["blob:https://www.qrguitar.com/private", "/api/public-file/QRG-A/media/token"]
  }), "https://www.qrguitar.com/api/public-file/QRG-A/media/token");
});

test("unlisted Profile metadata is noindex while social sharing metadata remains available", () => {
  const profile = {
    qrCode: "QRG-UNLISTED",
    permanentPath: "/i/QRG-UNLISTED",
    name: "Unlisted Test Guitar",
    brand: "Test",
    model: "Guitar",
    summary: "Shared only with people who receive the direct link.",
    heroImageDataUrl: "/api/public-file/QRG-UNLISTED/media/token"
  };
  const unlisted = seo.buildRecordMetadata({ ...profile, visibility: "unlisted" });
  assert.deepEqual(unlisted.robots, { index: false, follow: true });
  assert.equal(unlisted.alternates.canonical, "https://www.qrguitar.com/i/QRG-UNLISTED");
  assert.equal(unlisted.openGraph.url, "https://www.qrguitar.com/i/QRG-UNLISTED");
  assert.deepEqual(unlisted.twitter.images, ["https://www.qrguitar.com/api/public-file/QRG-UNLISTED/media/token"]);

  assert.deepEqual(seo.buildRecordMetadata({ ...profile, visibility: "public" }).robots, { index: true, follow: true });
  assert.deepEqual(seo.buildRecordMetadata({ ...profile, visibility: "private" }).robots, { index: false, follow: true });
});

test("metadata excerpts normalize whitespace and remain word and Unicode safe", () => {
  assert.equal(seo.metadataExcerpt("  alpha\n beta   gamma  ", 12), "alpha beta…");
  const emojiExcerpt = seo.metadataExcerpt("😀😀😀😀😀😀", 5);
  assert.equal(Array.from(emojiExcerpt).length, 5);
  assert.doesNotMatch(emojiExcerpt, /�/);
  assert.equal(seo.metadataExcerpt("ab👩‍💻cde", 5), "ab👩‍💻c…");
  assert.equal(seo.metadataExcerpt("ab🇺🇸cde", 4), "ab🇺🇸…");
  assert.equal(seo.metadataExcerpt("abe\u0301cde", 4), "abe\u0301…");
  assert.deepEqual(seo.fallbackMetadataGraphemes("👩‍💻🇺🇸e\u0301"), ["👩‍💻", "🇺🇸", "e\u0301"]);

  const summary = `A detailed instrument history with original paperwork and documented service. ${"Additional provenance remains visible in structured data. ".repeat(8)}`;
  const instrument = {
    qrCode: "QRG-LONG",
    permanentPath: "/i/QRG-LONG",
    name: "A remarkably long custom instrument name with provenance from a respected independent builder and studio",
    brand: "Independent Builder",
    model: "Studio Custom",
    year: "1998",
    summary,
    visibility: "public"
  };
  const metadata = seo.buildRecordMetadata(instrument);
  assert.equal(typeof metadata.title.absolute, "string");
  assert.match(metadata.title.absolute, / \| QRguitar$/);
  assert.ok(Array.from(metadata.title.absolute).length <= seo.SEARCH_TITLE_MAX_LENGTH);
  assert.ok(Array.from(metadata.description).length <= seo.SEARCH_DESCRIPTION_MAX_LENGTH);
  assert.ok(Array.from(metadata.openGraph.title).length <= seo.SOCIAL_TITLE_MAX_LENGTH);
  assert.ok(Array.from(metadata.openGraph.description).length <= seo.SOCIAL_DESCRIPTION_MAX_LENGTH);
  assert.doesNotMatch(metadata.description, /\s{2,}/);

  const graph = seo.buildRecordJsonLd(instrument)["@graph"];
  const page = graph.find(item => item["@type"] === "ItemPage");
  const profile = graph.find(item => item["@type"] === "Product");
  const breadcrumb = graph.find(item => item["@type"] === "BreadcrumbList");
  assert.equal(graph.filter(item => item["@type"] === "Product").length, 1);
  assert.deepEqual(profile.brand, { "@type": "Brand", name: instrument.brand });
  assert.equal(profile.model, instrument.model);
  assert.equal(graph.some(item => Object.hasOwn(item, "offers")), false);
  assert.deepEqual(page.mainEntity, { "@id": "https://www.qrguitar.com/i/QRG-LONG#profile" });
  assert.match(profile.description, /Additional provenance remains visible in structured data\.(?: Additional provenance remains visible in structured data\.){7}/);
  assert.ok(profile.description.length > metadata.openGraph.description.length);
  assert.deepEqual(profile.identifier, [{
    "@type": "PropertyValue",
    propertyID: "QRguitar Profile",
    value: "QRG-LONG"
  }]);
  assert.deepEqual(breadcrumb.itemListElement.map(item => item.name), ["Home", "Catalog", instrument.name]);
  assert.deepEqual(breadcrumb.itemListElement.map(item => item.item), [
    "https://www.qrguitar.com",
    "https://www.qrguitar.com/catalog",
    "https://www.qrguitar.com/i/QRG-LONG"
  ]);
});

test("Profile structured data never invents a Product offer from availability alone", () => {
  for (const saleStatus of ["not_for_sale", "for_sale"]) {
    const code = "QRG-" + saleStatus;
    const graph = seo.buildRecordJsonLd({
      qrCode: code,
      permanentPath: "/i/" + code,
      name: "Documented amplifier",
      brand: "Example",
      model: "Amp",
      serial: "SERIAL-1",
      instrumentType: "Amplifier",
      summary: "A permanent identity and history Profile.",
      saleStatus
    })["@graph"];
    assert.equal(graph.filter(item => item["@type"] === "Product").length, 1, saleStatus);
    assert.equal(graph.some(item => Object.hasOwn(item, "offers")), false, saleStatus);
    assert.equal(graph.find(item => item["@type"] === "ItemPage").mainEntity["@id"], "https://www.qrguitar.com/i/" + code + "#profile");
    assert.equal(graph.find(item => item["@type"] === "Product").identifier[1].value, "SERIAL-1");
  }
});

test("managed public metadata honors allowlisted indexing values and locks protected page ids", async () => {
  const content = {
    "seo.catalog.title": "Browse Profiles",
    "seo.catalog.description": "Explore public QRguitar Profiles.",
    "seo.catalog.ogTitle": "Browse Profiles",
    "seo.catalog.ogDescription": "Explore public QRguitar Profiles.",
    "seo.catalog.image": "/seo/qrguitar-og-v2.png",
    "seo.catalog.indexing": "noindex, follow",
    "seo.dashboard.title": "Dashboard",
    "seo.dashboard.description": "Private workspace",
    "seo.dashboard.ogTitle": "Dashboard",
    "seo.dashboard.ogDescription": "Private workspace",
    "seo.dashboard.image": "/seo/qrguitar-og-v2.png",
    "seo.dashboard.indexing": "index, follow",
    "seo.global.image": "/seo/qrguitar-og-v2.png"
  };
  const siteMetadata = loadTypeScript("lib/site-metadata.ts", {
    "./content-registry": { getContentValue: (values, key) => values[key] || "" },
    "./seo": seo,
    "./site-settings-server": {
      loadPublishedSiteSettings: async () => ({ content, brandName: "QRguitar", seo: { twitterHandle: "@qrguitar", keywords: [] } })
    }
  });

  assert.deepEqual((await siteMetadata.buildManagedPageMetadata("catalog", "/catalog")).robots, { index: false, follow: true });
  assert.deepEqual((await siteMetadata.buildManagedPageMetadata("dashboard", "/dashboard")).robots, { index: false, follow: false });
  content["seo.catalog.indexing"] = "index, nofollow";
  assert.deepEqual((await siteMetadata.buildManagedPageMetadata("catalog", "/catalog")).robots, { index: true, follow: false });
  content["seo.catalog.indexing"] = "unsupported directive";
  assert.deepEqual((await siteMetadata.buildManagedPageMetadata("catalog", "/catalog")).robots, { index: false, follow: false });
  assert.deepEqual(siteMetadata.resolveManagedPageRobots("catalog", "index, follow", false), { index: false, follow: false });

  const homeSource = fs.readFileSync(path.join(webRoot, "app/page.tsx"), "utf8");
  const collectionsSource = fs.readFileSync(path.join(webRoot, "app/collections/page.tsx"), "utf8");
  const editorSource = fs.readFileSync(path.join(webRoot, "app/site-editor/page.tsx"), "utf8");
  const editorRouteSource = fs.readFileSync(path.join(webRoot, "app/api/site-editor/route.ts"), "utf8");
  assert.match(homeSource, /resolveManagedPageRobots\("home", getContentValue\(publishedSettings\.content, "seo\.home\.indexing"\)\)/);
  assert.match(collectionsSource, /buildManagedPageMetadata\("collections", "\/collections"\)/);
  assert.match(editorSource, /entry\.type === "select"/);
  assert.match(editorRouteSource, /validateContentValues\(settings\.content\)/);

  const publicIndexingEntry = contentRegistry.contentRegistryByKey.get("seo.catalog.indexing");
  const protectedIndexingEntry = contentRegistry.contentRegistryByKey.get("seo.dashboard.indexing");
  assert.equal(publicIndexingEntry.type, "select");
  assert.deepEqual([...publicIndexingEntry.allowedValues], [...contentRegistry.seoIndexingValues]);
  assert.equal(protectedIndexingEntry.classification, "security-locked");
  const invalidSettings = { ...contentRegistry.defaultContentValues, "seo.catalog.indexing": "noindex" };
  assert.match(contentRegistry.validateContentValues(invalidSettings)["seo.catalog.indexing"], /Choose one of/);
});

test("public user-controlled outbound links are qualified without changing trusted document links", () => {
  const seller = fs.readFileSync(path.join(webRoot, "components/SellerWebsiteLink.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(webRoot, "app/i/[code]/ProfileClient.tsx"), "utf8");
  assert.match(seller, /href=\{href\} target="_blank" rel="ugc nofollow noopener noreferrer"/);
  assert.match(profile, /href=\{item\.canonicalUrl\} target="_blank" rel="ugc nofollow noopener noreferrer"/);
  assert.match(profile, /href=\{link\.href\} target="_blank" rel="ugc nofollow noopener noreferrer"/);
  assert.match(profile, /href=\{href\} target="_blank" rel="noreferrer" className="button secondary"/);
});

test("installer snippets and Profile breadcrumbs describe the rendered experience", () => {
  const registry = fs.readFileSync(path.join(webRoot, "lib/content-registry.ts"), "utf8");
  assert.match(registry, /Instrument Service Provider Network \| QRguitar/);
  assert.match(registry, /document instrument service with owner approval, update permanent Profiles, and print scannable handouts/);
  assert.doesNotMatch(registry, /QR Installation and Hardware \| QRguitar/);

  const breadcrumbs = fs.readFileSync(path.join(webRoot, "app/i/[code]/ProfileBreadcrumbs.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(webRoot, "app/i/[code]/ProfileClient.tsx"), "utf8");
  assert.match(breadcrumbs, /<Link href="\/">\{ui\("[^"]+", "Home"\)\}<\/Link>/);
  assert.match(breadcrumbs, /<Link href="\/catalog">\{ui\("[^"]+", "Catalog"\)\}<\/Link>/);
  assert.match(breadcrumbs, /aria-current="page"/);
  assert.match(profile, /<ProfileBreadcrumbs current=\{instrumentDisplayName\(instrument\)\} \/>/);
});

test("collection structured data contains public discovery fields only and is script safe", () => {
  const directory = seo.buildCollectionsDirectoryJsonLd([
    { handle: "safe-owner", name: "Safe Owner", accountType: "collector", count: 1, image: "private-image-value" }
  ]);
  assert.equal(directory["@type"], "CollectionPage");
  assert.equal(directory.breadcrumb["@type"], "BreadcrumbList");
  assert.equal(directory.mainEntity["@type"], "ItemList");
  assert.equal(directory.mainEntity.itemListElement[0].url, "https://www.qrguitar.com/collections/safe-owner");
  assert.doesNotMatch(JSON.stringify(directory), /private-image-value/);

  const detail = seo.buildPublicCollectionJsonLd({
    enabled: true, handle: "safe-owner", publicName: "Safe Owner", accountType: "collector", bio: "Public collection",
    location: "", websiteUrl: "", avatarUrl: "", allowIndexing: true, allowMessages: false, ownerId: "private-owner-id"
  }, [{
    qrCode: "QRG-PUBLIC", permanentPath: "/i/QRG-PUBLIC", name: "Public Guitar", brand: "", model: "", serial: "PRIVATE-SERIAL",
    owner: "Private Owner", ownerUserEmail: "private@example.test", location: "", summary: "", qrStyle: {}, createdAt: "2026-01-01"
  }]);
  const serialized = JSON.stringify(detail);
  assert.equal(detail["@type"], "CollectionPage");
  assert.equal(detail.breadcrumb.itemListElement.length, 3);
  assert.equal(detail.mainEntity.itemListElement[0].url, "https://www.qrguitar.com/i/QRG-PUBLIC");
  for (const privateValue of ["private-owner-id", "PRIVATE-SERIAL", "private@example.test", "Private Owner"])
    assert.doesNotMatch(serialized, new RegExp(privateValue, "i"));
  assert.equal(seo.serializeJsonLd({ value: "</script><script>alert(1)</script>" }).includes("<"), false);

  for (const relative of ["app/collections/page.tsx", "app/collections/[handle]/page.tsx"]) {
    const source = fs.readFileSync(path.join(webRoot, relative), "utf8");
    assert.match(source, relative.endsWith("[handle]/page.tsx") ? /buildPageMetadata/ : /buildManagedPageMetadata/, relative);
    assert.match(source, /application\/ld\+json/, relative);
    assert.match(source, /serializeJsonLd/, relative);
  }
});

test("public Profile loader requests and exposes updated_at for stable sitemap dates", () => {
  const source = fs.readFileSync(path.join(webRoot, "lib/public-instruments.ts"), "utf8");
  const guitarSelects = [...source.matchAll(/\/rest\/v1\/guitars\?select=([^"`]+)/g)].map(match => match[1]);
  assert.ok(guitarSelects.length >= 3);
  assert.ok(guitarSelects.every(select => select.includes("updated_at")));
  assert.match(source, /updatedAt:\s*guitar\.updated_at\s*\|\|\s*undefined/);
});

test("sparse Product schema omits absent brand, model, hidden serial and commercial claims", () => {
 const graph=seo.buildRecordJsonLd({qrCode:"QRG-SPARSE",name:"Owner documented instrument",visibility:"public"})["@graph"];
 const entity=graph.find(item=>item["@type"]==="Product"); assert.ok(entity);
 for(const key of ["brand","model","offers","aggregateRating","review","gtin","mpn"]) assert.equal(Object.hasOwn(entity,key),false);
 assert.deepEqual(entity.identifier,[{"@type":"PropertyValue",propertyID:"QRguitar Profile",value:"QRG-SPARSE"}]);
});
