import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemoryDatabase } from "./security/mock-routes.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ownerId = "collection-owner";
const settings = { enabled: true, handle: "public-shop", publicName: "Public Shop", accountType: "shop", bio: "Published bio", websiteUrl: "https://shop.example", allowMessages: true };
const publicRecord = (patch = {}) => ({ qrCode: "QRG-TEST1", name: "Public guitar", visibility: "public", brand: "Example", model: "Instrument", year: "2025", createdAt: "2026-09-17", location: "", gallery: [], publicCollection: settings, ...patch });

function fixture(options = {}) {
  const tables = {
    profiles: [{ id: ownerId, account_status: "active", hide_public_content: false, ...options.owner }],
    site_content: [
      { content_key: "public_collection_handle:public-shop", content_value: { ownerId } },
      { content_key: "public_collection_owner:" + ownerId, content_value: { ...settings, ...options.settings } }
    ]
  };
  if (options.missingOwner) tables.profiles = [];
  const db = createMemoryDatabase(tables, options.hooks);
  const calls = [];
  const cache = new Map();
  const state = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useMemo: (fn) => fn()
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    if (relative === "apps/web/lib/supabase-server") return { createServerSupabaseClient: () => options.noDatabase ? null : db };
    if (relative === "apps/web/lib/public-instruments") return { getPublicInstruments: async (id) => { calls.push(id); if (options.recordsError) throw new Error("Private database detail"); return options.records || []; } };
    if (relative === "apps/web/lib/site-settings-server") return { loadPublishedSiteSettings: async () => ({ content: {} }) };
    if (["apps/web/components/Nav", "apps/web/components/Footer", "apps/web/components/CollectionInquiryForm"].includes(relative)) return { [relative.split("/").at(-1)]: () => null };
    if (relative === "apps/web/components/CollectibleRecordCard") return { CollectibleRecordCard: ({ record }) => React.createElement("a", { href: `/i/${record.qrCode}` }, record.name) };
    if (relative.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) });
    const filename = [relative + ".ts", relative + ".tsx", relative].find((file) => fs.existsSync(path.join(repo, file)));
    const code = ts.transpileModule(fs.readFileSync(path.join(repo, filename), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(relative, module);
    const localRequire = withUiTextTestContext((specifier) => {
      if (specifier === "react") return hooks;
      if (specifier === "next/link") return ({ children, href, ...props }) => React.createElement("a", { href, ...props }, children);
      if (specifier === "next/navigation") return { notFound() { throw new Error("NOT_FOUND"); } };
      if (!specifier.startsWith(".")) return require(specifier);
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier)));
    });
    new Function("require", "module", "exports", code)(localRequire, module, module.exports);
    return module.exports;
  }
  return { tables, db, calls, load, render(component, props) { cursor = 0; return component(props); } };
}

function nodes(tree, match, result = []) {
  if (!tree || typeof tree !== "object") return result;
  if (match(tree)) result.push(tree);
  React.Children.forEach(tree.props?.children, (child) => nodes(child, match, result));
  return result;
}

test("directory projects opted-in public records without private account data or duplicate counts", () => {
  const f = fixture();
  const { buildCollectionDirectory } = f.load("apps/web/lib/collection-directory");
  const items = buildCollectionDirectory([
    publicRecord({ ownerUserEmail: "private@example.test", privateNotes: "secret" }), publicRecord(),
    publicRecord({ qrCode: "QRG-TEST2" }), publicRecord({ qrCode: "QRG-PRIVATE", visibility: "private" }),
    publicRecord({ qrCode: "QRG-UNLISTED", visibility: "unlisted" }), publicRecord({ qrCode: "QRG-NOT-SHARED", publicCollection: undefined })
  ]);
  assert.equal(items.length, 1); assert.equal(items[0].count, 2);
  assert.equal(items[0].handle, "public-shop");
  assert.deepEqual(Object.keys(items[0]).sort(), ["accountType", "count", "handle", "image", "name"].sort());
  assert.doesNotMatch(JSON.stringify(items), /private@example|secret|PRIVATE|UNLISTED|NOT-SHARED/);
});

test("search trims whitespace and finds public names, handles and readable roles", () => {
  const { buildCollectionDirectory, filterCollectionDirectory } = fixture().load("apps/web/lib/collection-directory");
  const items = buildCollectionDirectory([publicRecord(), publicRecord({ qrCode: "QRG-REPAIR", publicCollection: { ...settings, handle: "workshop", publicName: "Fret Care", accountType: "luthier" } })]);
  for (const query of [" public SHOP ", "public-shop", "retailer"]) assert.equal(filterCollectionDirectory(items, query, "all")[0].handle, "public-shop");
  assert.equal(filterCollectionDirectory(items, "repair", "luthier")[0].handle, "workshop");
  assert.equal(filterCollectionDirectory(items, "Fret Care", "shop").length, 0);
  assert.equal(filterCollectionDirectory(items, "   ", "all").length, 2);
});

test("every supported account type has its own searchable public collection", () => {
  const { buildCollectionDirectory, filterCollectionDirectory, collectionRoleLabel, collectionRoles } = fixture().load("apps/web/lib/collection-directory");
  const items = buildCollectionDirectory(Object.keys(collectionRoles).map((role) => publicRecord({ qrCode: "QRG-" + role, publicCollection: { ...settings, handle: role, accountType: role } })));
  for (const role of Object.keys(collectionRoles)) assert.equal(filterCollectionDirectory(items, "", role)[0].handle, role);
  for (const role of ["__proto__", "constructor", "unexpected"]) assert.equal(collectionRoleLabel(role), "Member");
});

for (const owner of [{ hide_public_content: true }, { account_status: "banned" }, { account_status: "removed" }]) test("moderated owners cannot expose a collection header: " + JSON.stringify(owner), async () => {
  const f = fixture({ owner });
  assert.equal(await f.load("apps/web/lib/public-collection-page").loadPublicCollectionSettings("public-shop"), null);
  assert.equal(f.db.calls.filter((call) => call.table === "site_content").length, 1);
});

for (const options of [{ missingOwner: true }, { settings: { enabled: false } }, { settings: { handle: "renamed" } }, { settings: { publicName: "" } }]) test("missing, unpublished or stale collections remain unavailable: " + JSON.stringify(options), async () => {
  const f = fixture(options);
  assert.equal(await f.load("apps/web/lib/public-collection-page").loadPublicCollectionSettings("public-shop"), null);
  await assert.rejects(f.load("apps/web/app/collections/[handle]/page").default({ params: Promise.resolve({ handle: "public-shop" }) }), /NOT_FOUND/);
  assert.equal(f.calls.length, 0);
});

for (const failure of ["handle", "profile", "settings"]) test("collection read failure reaches retry boundary instead of404: " + failure, async () => {
  const f = fixture({ hooks: { before(query) {
    const matchesKey = (key) => query.table === "site_content" && query.filters.every((filter) => filter({ content_key: key }));
    if ((failure === "handle" && matchesKey("public_collection_handle:public-shop")) || (failure === "settings" && matchesKey("public_collection_owner:" + ownerId)) || (failure === "profile" && query.table === "profiles")) return { data: null, error: { message: "Private database detail" } };
  } } });
  await assert.rejects(f.load("apps/web/app/collections/[handle]/page").default({ params: Promise.resolve({ handle: "public-shop" }) }), /temporarily unavailable/);
  assert.equal(f.calls.length, 0);
});

test("unconfigured service is retryable; a genuine missing handle is unavailable", async () => {
  await assert.rejects(fixture({ noDatabase: true }).load("apps/web/lib/public-collection-page").loadPublicCollectionSettings("public-shop"), /temporarily unavailable/);
  assert.equal(await fixture().load("apps/web/lib/public-collection-page").loadPublicCollectionSettings("missing"), null);
});

test("eligible collection limits instrument query to its owner and offers collection navigation", async () => {
  const f = fixture({ records: [publicRecord()] });
  const page = await f.load("apps/web/app/collections/[handle]/page").default({ params: Promise.resolve({ handle: "public-shop" }) });
  assert.deepEqual(f.calls, [ownerId]);
  const html = renderToStaticMarkup(page);
  assert.match(html, /href="\/collections"/); assert.match(html, /Public Shop/); assert.match(html, /href="\/i\/QRG-TEST1"/);
  assert.doesNotMatch(html, /collection-owner|private@example/);
});

test("disabled indexing stays disabled and missing moderation never yields public metadata", async () => {
  const eligible = fixture({ settings: { allowIndexing: false }, records: [publicRecord()] });
  const metadata = await eligible.load("apps/web/app/collections/[handle]/page").generateMetadata({ params: Promise.resolve({ handle: "public-shop" }) });
  assert.equal(metadata.robots.index, false);
  const hidden = fixture({ owner: { hide_public_content: true } });
  const missing = await hidden.load("apps/web/app/collections/[handle]/page").generateMetadata({ params: Promise.resolve({ handle: "public-shop" }) });
  assert.equal(missing.robots.index, false); assert.doesNotMatch(JSON.stringify(missing), /Public Shop|Published bio|shop.example/);
});

test("directory controls filter and reset the rendered member links", () => {
  const f = fixture();
  const { buildCollectionDirectory } = f.load("apps/web/lib/collection-directory");
  const { CollectionsDirectoryClient } = f.load("apps/web/app/collections/CollectionsDirectoryClient");
  const props = { collections: buildCollectionDirectory([publicRecord()]) };
  let tree = f.render(CollectionsDirectoryClient, props);
  nodes(tree, (node) => node.props?.id === "collection-search")[0].props.onChange({ target: { value: "missing" } });
  tree = f.render(CollectionsDirectoryClient, props);
  assert.match(renderToStaticMarkup(tree), /No collections found\./);
  assert.match(renderToStaticMarkup(tree), /0 of 1 collection/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /href="\/collections\/public-shop"/);
  nodes(tree, (node) => node.type === "button")[0].props.onClick();
  assert.match(renderToStaticMarkup(f.render(CollectionsDirectoryClient, props)), /href="\/collections\/public-shop"/);
});

test("empty public collection does not suggest filtering could reveal private instruments", () => {
  const f = fixture();
  const { CollectionsClient } = f.load("apps/web/app/collections/[handle]/CollectionsClient");
  const tree = f.render(CollectionsClient, { records: [], content: {} });
  const html = renderToStaticMarkup(tree);
  assert.match(html, /No Profiles yet\./); assert.match(html, /href="\/collections"/);
  assert.doesNotMatch(html, /Collection filters|Show all public Profiles/);
  assert.equal(nodes(tree, (node) => ["input", "select", "button"].includes(node.type)).length, 0);
  assert.doesNotMatch(html, /<(?:input|select|button)\b/i);
  assert.doesNotMatch(html, /href="\/i\//);
});

test("a filtered collection can reset to its original public Profiles", () => {
  const f = fixture();
  const { CollectionsClient } = f.load("apps/web/app/collections/[handle]/CollectionsClient");
  const props = { records: [publicRecord()], content: {} };
  let tree = f.render(CollectionsClient, props);
  nodes(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: " missing " } });
  tree = f.render(CollectionsClient, props);
  assert.doesNotMatch(renderToStaticMarkup(tree), /href="\/i\/QRG-TEST1"/);
  nodes(tree, (node) => node.type === "button")[0].props.onClick();
  assert.match(renderToStaticMarkup(f.render(CollectionsClient, props)), /href="\/i\/QRG-TEST1"/);
});

test("collection load errors provide reset without exposing exception details", () => {
  const f = fixture(); let retries = 0;
  const ErrorPage = f.load("apps/web/app/collections/error").default;
  const tree = ErrorPage({ error: new Error("Private database detail"), reset: () => retries++ });
  assert.doesNotMatch(renderToStaticMarkup(tree), /Private database detail/);
  nodes(tree, (node) => node.type === "button")[0].props.onClick(); assert.equal(retries, 1);
});
