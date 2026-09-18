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
  assert.match(body, /^Host: https:\/\/www\.qrguitar\.com$/m);
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
    "./lib/search-indexing": indexing
  }, { NODE_ENV: "production" });
  const request = pathname => ({
    headers: new Headers({ host: "www.qrguitar.com" }),
    nextUrl: { pathname, clone: () => ({ pathname, hostname: "www.qrguitar.com", toString: () => `https://www.qrguitar.com${pathname}` }) },
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
  assert.match(first, /<loc>https:\/\/www\.qrguitar\.com\/<\/loc>\s*<lastmod>2026-09-18<\/lastmod>/);
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
    assert.match(source, /buildPageMetadata/, relative);
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
