import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const args = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? argument("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.."));
const overlay = args.includes("--overlay") ? path.resolve(argument("--overlay")) : null;
const repoRequire = createRequire(path.join(repo, "package.json"));
const ts = repoRequire("typescript");
const appRequire = createRequire(path.join(repo, "apps/web/package.json"));

function runtime(http, overrides = {}) {
  const cache = new Map();
  const calls = [];
  const https = {
    request(url, options, callback) {
      const request = new EventEmitter();
      request.write = () => {};
      request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
      request.end = () => queueMicrotask(async () => {
        try {
          calls.push({ url: new URL(url), options });
          const result = await http(new URL(url), options);
          if (result instanceof Error) return request.destroy(result);
          if (result.timeout) return request.emit("timeout");
          const response = new EventEmitter();
          response.statusCode = result.status ?? 200;
          response.setEncoding = () => {};
          callback(response);
          const body = typeof result.raw === "string" ? result.raw : JSON.stringify(result.body);
          response.emit("data", body);
          response.emit("end");
        } catch (error) {
          request.destroy(error);
        }
      });
      return request;
    }
  };
  function load(relative) {
    const absolute = path.resolve(repo, relative);
    if (Object.hasOwn(overrides, relative)) return overrides[relative];
    if (cache.has(absolute)) return cache.get(absolute).exports;
    let actual = overlay && fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : absolute;
    const transpiled = ts.transpileModule(fs.readFileSync(actual, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = withUiTextTestContext((specifier) => {
      if (specifier === "node:https") return https;
      if (specifier === "next/cache") return { unstable_noStore() {} };
      if (specifier.endsWith("/supabase-server") || specifier === "./supabase-server") {
        return { getSupabaseEnvStatus: () => ({ supabaseUrl: "https://mock.supabase.invalid" }) };
      }
      if (!specifier.startsWith(".")) return appRequire(specifier);
      const target = path.resolve(path.dirname(absolute), specifier);
      const suffix = [".ts", ".tsx", ".js"].find((extension) =>
        fs.existsSync(target + extension) || (overlay && fs.existsSync(path.join(overlay, path.relative(repo, target + extension)))))
        ?? "";
      return load(path.relative(repo, target + suffix).split(path.sep).join("/"));
    });
    const wrapper = vm.runInNewContext("(function(require,module,exports){\n" + transpiled + "\n})", {
      URL, Buffer, Response, console, setTimeout, clearTimeout,
      process: { env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon", SUPABASE_SERVICE_ROLE_KEY: "mock-service", NEXT_PUBLIC_SITE_URL: "https://www.qrguitar.com" } }
    }, { filename: actual });
    wrapper(localRequire, module, module.exports);
    return module.exports;
  }
  return { load, calls };
}

function inValues(filter) {
  return JSON.parse("[" + filter.slice(4, -1) + "]");
}

function mockDatabase(data, cap = 7, intercept = () => null) {
  return async (url, options) => {
    const intercepted = intercept(url, options);
    if (intercepted) return intercepted;
    const table = url.pathname.split("/").at(-1);
    let rows = [...(data[table] || [])];
    for (const [column, filter] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(column)) continue;
      if (filter.startsWith("in.(")) {
        const values = new Set(inValues(filter));
        rows = rows.filter((row) => values.has(row[column]));
      } else if (filter.startsWith("eq.")) {
        rows = rows.filter((row) => String(row[column]) === filter.slice(3));
      } else if (filter === "is.null") {
        rows = rows.filter((row) => row[column] == null);
      } else if (filter.startsWith("like.") && filter.endsWith("*")) {
        rows = rows.filter((row) => String(row[column]).startsWith(filter.slice(5, -1)));
      } else {
        throw new Error("Unhandled mock filter: " + column + "=" + filter);
      }
    }
    const orders = (url.searchParams.get("order") || "").split(",").filter(Boolean);
    rows.sort((a, b) => {
      for (const order of orders) {
        const [column, direction, nulls] = order.split(".");
        if (a[column] == b[column]) continue;
        if (a[column] == null) return nulls === "nullslast" ? 1 : -1;
        if (b[column] == null) return nulls === "nullslast" ? -1 : 1;
        const result = a[column] < b[column] ? -1 : 1;
        return direction === "desc" ? -result : result;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Math.min(Number(url.searchParams.get("limit") || cap), cap);
    return { body: rows.slice(offset, offset + limit) };
  };
}

function fixtures(count = 163) {
  const db = { guitars: [], profiles: [], guitar_media: [], guitar_specs: [], guitar_documents: [], guitar_timeline_events: [], guitar_external_media: [], site_content: [], qr_redirects: [] };
  const date = "2026-09-01T00:00:00.000Z";
  for (let i = 0; i < count; i++) {
    const id = "g-" + String(i).padStart(4, "0");
    const owner = "owner-" + String(i % 81).padStart(3, "0");
    const code = "QRG-TEST" + String(i).padStart(4, "0");
    db.guitars.push({
      id, owner_id: owner, qr_code: code, permanent_path: "/i/" + code,
      name: "Test guitar " + i, brand: "Gibson", model: "Custom", year: "1965",
      serial_number: "SERIAL-" + i, builder: "Owner", location: "",
      status: "unverified", visibility: "public", summary: "Instrument history",
      hero_image_path: "", admin_archived_at: null, owner_removed_at: null, created_at: date
    });
    if (i < 81) {
      db.profiles.push({ id: owner, display_name: "Owner " + i, hide_public_content: i === 80, account_status: i === 79 ? "banned" : "active" });
      db.site_content.push({ content_key: "public_collection_owner:" + owner, content_value: { enabled: true, handle: owner, publicName: "Collection " + i, allowIndexing: i !== 78, ownerId: owner } });
      db.site_content.push({ content_key: "public_collection_handle:" + owner, content_value: { ownerId: owner } });
    }
    db.site_content.push({ content_key: "record_trust:" + code, content_value: { showSerialPublic: i === 162, authenticityStatus: i === 162 ? "confirmed" : "unconfirmed" } });
    for (let n = 2; n >= 0; n--) {
      db.guitar_media.push({ id: id + "-media-" + n, guitar_id: id, storage_path: "/photos/" + id + "-" + n + ".jpg", sort_order: n });
      db.guitar_specs.push({ id: id + "-spec-" + n, guitar_id: id, label: n === 0 ? "Finish" : n === 1 ? "Pickup" : "Neck", value: n === 0 ? "Cherry Sunburst" : n === 1 ? "P.A.F." : "Original", sort_order: n });
      db.guitar_documents.push({ id: id + "-doc-" + n, guitar_id: id, name: "Document " + n, storage_path: "/docs/" + id + "-" + n + ".pdf", is_public: n !== 2, retained_private: false, created_at: date });
      db.guitar_timeline_events.push({ id: id + "-event-" + n, guitar_id: id, title: "Service " + n, event_date: "2026-09-01", created_at: date, is_public: n !== 2 });
      db.guitar_external_media.push({ id: id + "-external-" + n, guitar_id: id, provider: "youtube", canonical_url: "https://www.youtube.com/watch?v=test" + n, title: "Demo " + n, caption: "", is_public: n !== 2, sort_order: n, created_at: date });
    }
  }
  return db;
}

test("paging survives a server cap below requested limit and exact page multiples", async () => {
  const app = runtime(mockDatabase({ rows: Array.from({ length: 14 }, (_, id) => ({ id })) }, 7));
  const result = await app.load("apps/web/lib/supabase-pagination.ts").supabasePagedRows("/rest/v1/rows?order=id.asc");
  assert.equal(result.length, 14);
  assert.deepEqual(app.calls.map(({ url }) => Number(url.searchParams.get("offset"))), [0, 7, 14]);
  await assert.rejects(app.load("apps/web/lib/supabase-pagination.ts").supabasePagedRows("/rest/v1/rows"), /stable order/);
});

test("HTTP errors, malformed successful payloads, and timeout propagate instead of returning partial data", async () => {
  for (const failure of [{ status: 503, body: { message: "database unavailable" } }, { body: { message: "not a list" } }, { raw: "not json" }, { timeout: true }]) {
    const app = runtime((url) => Number(url.searchParams.get("offset")) === 0 ? { body: [{ id: "first" }] } : failure);
    await assert.rejects(app.load("apps/web/lib/supabase-pagination.ts").supabasePagedRows("/rest/v1/rows?order=id.asc"));
  }
});

test("IN reads deduplicate and batch filter values; encoded values survive transport", async () => {
  const values = Array.from({ length: 164 }, (_, i) => "owner-" + i).concat('special,"quoted\\value');
  const app = runtime(mockDatabase({ rows: values.map((id) => ({ id })) }));
  const result = await app.load("apps/web/lib/supabase-pagination.ts").supabaseRowsByValues("/rest/v1/rows?order=id.asc", "id", values.concat(values));
  assert.equal(result.length, values.length);
  assert.equal(new Set(result.map((row) => row.id)).size, values.length);
  assert.ok(app.calls.every(({ url }) => inValues(url.searchParams.get("id")).length <= 75));
  const empty = await app.load("apps/web/lib/supabase-pagination.ts").supabaseRowsByValues("/rest/v1/rows?order=id.asc", "id", []);
  assert.equal(empty.length, 0);
});

test("public loader returns every eligible record and complete ordered relations across pages and filter batches", async () => {
  const app = runtime(mockDatabase(fixtures()));
  const records = await app.load("apps/web/lib/public-instruments.ts").getPublicInstruments();
  assert.equal(records.length, 159);
  assert.ok(app.calls.every(({ options }) => options.headers.apikey === "mock-service"), "All public data reads must use the server credential before sanitization");
  assert.equal(new Set(records.map((record) => record.qrCode)).size, 159);
  const last = records.find((record) => record.qrCode === "QRG-TEST0162");
  assert.ok(last);
  assert.equal(last.serial, "SERIAL-162");
  assert.equal(last.authenticityStatus, "confirmed");
  assert.equal(last.finish, "Cherry Sunburst");
  assert.ok(last.customFields.some((spec) => spec.value === "P.A.F."));
  assert.equal(last.galleryImageDataUrls.length, 3);
  assert.equal(last.galleryImageDataUrls[0], "/photos/g-0162-0.jpg");
  assert.equal(last.documentFiles.length, 2);
  assert.equal(last.timelineEvents.length, 2);
  assert.equal(last.externalMedia.length, 2);
  assert.ok(records.every((record) => record.galleryImageDataUrls.length === 3 && record.documentFiles.length === 2 && record.timelineEvents.length === 2 && record.externalMedia.length === 2));
  assert.ok(!records.find((record) => record.qrCode === "QRG-TEST0000").serial);
  assert.ok(!records.some((record) => ["QRG-TEST0079", "QRG-TEST0080", "QRG-TEST0160", "QRG-TEST0161"].includes(record.qrCode)));
  const orderedTables = ["guitars", "guitar_media", "guitar_specs", "guitar_documents", "profiles", "guitar_timeline_events", "guitar_external_media"];
  for (const table of orderedTables) {
    const calls = app.calls.filter(({ url }) => url.pathname.endsWith("/" + table));
    assert.ok(calls.length > 1, table + " must be paged");
    assert.ok(calls.every(({ url }) => url.searchParams.get("order")?.includes("id.asc")), table + " must have stable tie-break order");
  }
  assert.ok(app.calls.filter(({ url }) => url.pathname.endsWith("/guitar_documents")).every(({ url }) => url.searchParams.get("is_public") === "eq.true"));
});

test("seller website follows the current owner rather than the instrument's former owner", async () => {
  const db = fixtures(2);
  db.site_content.find((row) => row.content_key === "public_collection_owner:owner-000").content_value.websiteUrl = "https://old-shop.example";
  db.site_content.find((row) => row.content_key === "public_collection_owner:owner-001").content_value.websiteUrl = " https://current-shop.example/guitars ";
  db.guitars[0].owner_id = "owner-001";
  const app = runtime(mockDatabase(db));
  const record = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-TEST0000");
  assert.equal(record.publicCollection.websiteUrl, "https://current-shop.example/guitars");
  assert.equal(record.publicCollection.handle, "owner-001");
  assert.equal(JSON.stringify(record).includes("old-shop.example"), false);
});

for (const settings of [{ enabled: false, websiteUrl: "https://private-business.example" }, { enabled: true, websiteUrl: "https://" }, { enabled: true, websiteUrl: "javascript:alert(1)" }]) test("unpublished or invalid owner websites never become Profile links: " + JSON.stringify(settings), async () => {
  const db = fixtures(1);
  Object.assign(db.site_content.find((row) => row.content_key === "public_collection_owner:owner-000").content_value, settings);
  const app = runtime(mockDatabase(db));
  const record = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-TEST0000");
  assert.ok(!record.publicCollection?.websiteUrl);
  const catalog = await app.load("apps/web/lib/public-instruments.ts").getPublicInstruments();
  assert.ok(!catalog[0].publicCollection?.websiteUrl);
});

test("owner restriction reaches the database before any related data is requested", async () => {
  const app = runtime(mockDatabase(fixtures()));
  const records = await app.load("apps/web/lib/public-instruments.ts").getPublicInstruments("owner-078");
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.publicCollection.handle === "owner-078"));
  assert.ok(app.calls.filter(({ url }) => url.pathname.endsWith("/guitars")).every(({ url }) => url.searchParams.get("owner_id") === "eq.owner-078"));
  const mediaCalls = app.calls.filter(({ url }) => url.pathname.endsWith("/guitar_media"));
  assert.ok(mediaCalls.every(({ url }) => inValues(url.searchParams.get("guitar_id")).every((id) => ["g-0078", "g-0159"].includes(id))));
});

test("single profile lookup also returns relations beyond the backend page cap", async () => {
  const db = fixtures(1);
  for (let i = 3; i < 18; i++) db.guitar_media.push({ id: "extra-" + i, guitar_id: "g-0000", storage_path: "/extra-" + i + ".jpg", sort_order: i });
  const app = runtime(mockDatabase(db));
  const record = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("qrg-test0000");
  assert.equal(record.galleryImageDataUrls.length, 18);
  assert.ok(app.calls.every(({ options }) => options.headers.apikey === "mock-service"));
  const absent = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-ABSENT");
  assert.equal(absent, null);
});

test("related metadata failures reject a catalog load rather than silently omitting trust or collections", async () => {
  for (const prefix of ["record_trust:", "public_collection_owner:"]) {
    const app = runtime(mockDatabase(fixtures(1), 7, (url) => {
      if (url.pathname.endsWith("/site_content") && url.searchParams.get("content_key")?.includes(prefix)) {
        return { status: 503, body: { message: "unavailable" } };
      }
      return null;
    }));
    await assert.rejects(app.load("apps/web/lib/public-instruments.ts").getPublicInstruments(), /unavailable/);
  }
});

test("legacy timeline fallback remains paginated and optional missing media relation remains supported", async () => {
  const app = runtime(mockDatabase(fixtures(10), 3, (url) => {
    if (url.pathname.endsWith("/guitar_timeline_events") && url.searchParams.get("select")?.includes("date_precision")) return { status: 400, body: { message: "column date_precision does not exist" } };
    if (url.pathname.endsWith("/guitar_external_media")) return { status: 404, body: { message: 'relation "public.guitar_external_media" does not exist' } };
    return null;
  }));
  const records = await app.load("apps/web/lib/public-instruments.ts").getPublicInstruments();
  assert.equal(records.length, 10);
  assert.ok(records.every((record) => record.timelineEvents.length === 2 && record.externalMedia.length === 0));
});

test("sitemap includes all eligible profiles and only indexable nonempty collections without owner refetches", async () => {
  const db = fixtures();
  db.profiles.push({ id: "empty-owner", display_name: "Empty", hide_public_content: false, account_status: "active" });
  db.site_content.push({ content_key: "public_collection_owner:empty-owner", content_value: { enabled: true, handle: "empty-owner", publicName: "Empty", ownerId: "empty-owner" } });
  db.site_content.push({ content_key: "public_collection_handle:empty-owner", content_value: { ownerId: "empty-owner" } });
  const app = runtime(mockDatabase(db));
  const response = await app.load("apps/web/app/sitemap.xml/route.ts").GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/xml/);
  const xml = await response.text();
  assert.equal((xml.match(/<loc>https:\/\/www.qrguitar.com\/i\//g) || []).length, 159);
  assert.match(xml, /\/i\/QRG-TEST0162/);
  assert.match(xml, /\/collections\/owner-077/);
  assert.doesNotMatch(xml, /\/collections\/(?:owner-078|owner-079|owner-080|empty-owner)/);
  const catalogQueries = app.calls.filter(({ url }) => url.pathname.endsWith("/guitars"));
  assert.equal(catalogQueries.length, Math.ceil(163 / 7) + 1);
  assert.ok(catalogQueries.every(({ url }) => !url.searchParams.has("owner_id")));
});

test("sitemap returns retryable 503 for catalog or collection outage and never emits shortened successful XML", async () => {
  for (const table of ["guitars", "site_content"]) {
    const app = runtime(mockDatabase(fixtures(1), 7, (url) => url.pathname.endsWith("/" + table) ? { status: 503, body: { message: "offline" } } : null));
    const response = await app.load("apps/web/app/sitemap.xml/route.ts").GET();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), /<urlset/);
  }
});

test("successful empty dataset remains a successful empty catalog and valid static sitemap", async () => {
  const app = runtime(mockDatabase({}));
  assert.equal((await app.load("apps/web/lib/public-instruments.ts").getPublicInstruments()).length, 0);
  const response = await app.load("apps/web/app/sitemap.xml/route.ts").GET();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<urlset/);
});

test("catalog page propagates runtime outage to its error boundary instead of constructing an empty catalog", async () => {
  const error = new Error("upstream unavailable");
  const app = runtime(() => { throw new Error("Unexpected HTTP"); }, {
    "apps/web/lib/public-instruments.ts": { getPublicInstruments: async () => { throw error; } },
    "apps/web/lib/site-settings-server.ts": { loadPublishedSiteSettings: async () => ({ content: {}, composition: { catalog: {} } }) },
    "apps/web/app/catalog/CatalogClient.tsx": { CatalogClient() {} }
  });
  await assert.rejects(app.load("apps/web/app/catalog/page.tsx").default(), (actual) => actual === error);
});


test("catalog error view offers a working retry without exposing internal error details", () => {
  const app = runtime(() => { throw new Error("Unexpected HTTP"); });
  let retries = 0;
  const view = app.load("apps/web/app/catalog/error.tsx").default({ error: new Error("private upstream diagnostic"), reset: () => retries++ });
  const elements = [];
  const text = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node === "string") return text.push(node);
    if (!node?.props) return;
    elements.push(node);
    visit(node.props.children);
  };
  visit(view);
  assert.ok(elements.some((node) => node.props.role === "alert"));
  assert.match(text.join(" "), /temporarily unavailable/);
  assert.doesNotMatch(text.join(" "), /private upstream diagnostic/);
  const retry = elements.find((node) => node.type === "button");
  assert.ok(retry);
  retry.props.onClick();
  assert.equal(retries, 1);
});



function serviceDateFixture(date, precision = "day", overrides = {}) {
  return {
    id: "service-" + date, guitar_id: "g-0000", event_date: date, date_precision: precision,
    event_type: "repair", category: "Repair", source_kind: "owner_reported",
    is_public: false, is_system: false, title: "PRIVATE_REPORT", description: "PRIVATE_DESCRIPTION",
    shop_name: "PRIVATE_SHOP", provider_user_id: "PRIVATE_PERSON", related_document_id: "PRIVATE_DOCUMENT",
    parts_installed: "PRIVATE_PARTS", setup_measurements: "PRIVATE_MEASUREMENTS",
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-02T12:00:00Z", ...overrides
  };
}

function serviceDateRuntime(rows) {
  const db = fixtures(1);
  db.guitar_timeline_events = rows;
  const database = mockDatabase(db, 2);
  const app = runtime(async (url, options) => {
    const response = await database(url, options);
    if (url.pathname.endsWith("/guitar_timeline_events") && !url.searchParams.has("is_public")) {
      const columns = url.searchParams.get("select")?.split(",");
      assert.deepEqual(columns, ["guitar_id", "event_date", "date_precision", "event_type", "category", "source_kind", "is_system"]);
      assert.equal(url.searchParams.get("is_system"), "eq.false");
      assert.equal(options.headers.apikey, "mock-service");
      response.body = response.body.map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
    }
    return response;
  });
  return app;
}

for (const [stored, precision, expected] of [
  ["2024-09-23", "day", "2024-09-23"],
  ["2024-09-01", "month", "2024-09"],
  ["2024-01-01", "year", "2024"]
]) test("public last service preserves private recorded " + precision + " without private payload", async () => {
  const app = serviceDateRuntime([serviceDateFixture(stored, precision)]);
  const loader = app.load("apps/web/lib/public-instruments.ts");
  const profile = await loader.getPublicInstrumentByCode("QRG-TEST0000");
  const catalog = await loader.getPublicInstruments();
  for (const record of [profile, catalog[0]]) {
    assert.equal(record.latestServiceDate, expected);
    assert.equal(record.latestServiceDatePrecision, precision);
    assert.equal(record.timelineEvents.length, 0);
    assert.equal(record.serviceEvents.length, 0);
    assert.doesNotMatch(JSON.stringify(record), /PRIVATE_/);
  }
  assert.ok(app.calls.some(({url}) => url.pathname.endsWith("/guitar_timeline_events") && !url.searchParams.has("is_public")), "Actual metadata projection must execute");
  assert.ok(app.calls.filter(({url}) => url.searchParams.has("is_public") && url.pathname.endsWith("/guitar_timeline_events")).every(({url}) => url.searchParams.get("is_public") === "eq.true"));
});

test("approved service without a known event date never uses creation or approval timestamps", async () => {
  const app = serviceDateRuntime([
    serviceDateFixture(null, "unknown", { source_kind: "provider_submitted_owner_approved", approved_at: "2026-10-03T00:00:00Z" }),
    serviceDateFixture("2024-09-23", null, { id: "missing-precision" })
  ]);
  const record = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-TEST0000");
  assert.equal(record.latestServiceDate, undefined);
  assert.equal(record.latestServiceDatePrecision, undefined);
});

test("non-service events cannot supersede real service even with a Repair category", async () => {
  const kinds = ["ownership", "purchase", "sale", "profile_created", "creation", "registration", "appraisal", "verification", "safety", "media", "documentation"];
  const rows = kinds.map((kind, index) => serviceDateFixture("2025-09-23", "day", { id: "excluded-" + index, event_type: kind }));
  rows.push(serviceDateFixture("2024-09-23"), serviceDateFixture("2025-09-24", "day", { id: "system", is_system: true }));
  const app = serviceDateRuntime(rows);
  const record = await app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-TEST0000");
  assert.equal(record.latestServiceDate, "2024-09-23");
  const { isServiceHistoryEvent: isService } = app.load("apps/web/lib/instrument-profile-contract.ts");
  for (const kind of kinds) {
    assert.equal(isService({eventType: kind, category: "Repair", isSystem: false}), false, kind);
    assert.equal(isService({eventType: "repair", category: kind, isSystem: false}), false, kind + " category");
  }
});

test("actual service classifier includes owner work and approved provider Other, not generic owner Other", () => {
  const { isServiceHistoryEvent: isService } = runtime(() => { throw Error("Unexpected HTTP"); }).load("apps/web/lib/instrument-profile-contract.ts");
  for (const category of ["Service", "Setup", "Repair", "Electronics", "Fretwork", "Structural repair", "Finish work", "Amplifier service", "Modification", "Restoration", "Inspection"]) {
    assert.equal(isService({eventType: category, category, sourceKind: "owner_reported", isSystem: false}), true, category);
  }
  assert.equal(isService({eventType: "Other", category: "Other", sourceKind: "provider_submitted_owner_approved", isSystem: false}), true);
  assert.equal(isService({eventType: "Other", category: "Other", sourceKind: "owner_reported", isSystem: false}), false);
});

test("actual service date policy validates precision and retains honest overlapping periods", () => {
  const policy = runtime(() => { throw Error("Unexpected HTTP"); }).load("apps/web/lib/instrument-profile-contract.ts");
  assert.equal(typeof policy.getLatestRecordedServiceDate, "function", "Actual service date policy export missing");
  const event = (date, datePrecision) => ({serviceDate: date, datePrecision, category: "Setup", eventType: "setup", isSystem: false});
  const pair = value => value && JSON.parse(JSON.stringify(value));
  assert.deepEqual(pair(policy.getLatestRecordedServiceDate([event("2024-09-23", "day"), event("2024-09-01", "month")])), {date: "2024-09", datePrecision: "month"});
  assert.deepEqual(pair(policy.getLatestRecordedServiceDate([event("2024-09", "month"), event("2024", "year")])), {date: "2024", datePrecision: "year"});
  assert.deepEqual(pair(policy.getLatestRecordedServiceDate([event("2024-09", "month"), event("2024-10-02", "day")])), {date: "2024-10-02", datePrecision: "day"});
  for (const [date, precision] of [["2024-02-30", "day"], ["2024-13", "month"], ["0000", "year"], ["9999", "year"], ["2024-09", "day"], ["2024-09-23T00:00:00Z", "day"], ["2024-09-23", "unknown"]]) {
    assert.equal(policy.normalizeRecordedServiceDate(date, precision), undefined, date + "/" + precision);
  }
  assert.equal(policy.normalizeRecordedServiceDate("2024-02-29", "day").date, "2024-02-29");
});

test("sanitizer projects date precision only while retaining explicitly public historical records", () => {
  const {sanitizePublicInstrument: sanitize} = runtime(() => { throw Error("Unexpected HTTP"); }).load("apps/web/lib/instrument-profile-contract.ts");
  const shared = {id: "shared", category: "Repair", eventType: "repair", title: "Shared historical work", serviceDate: "2023-09-23", datePrecision: "day", isPublic: true, sourceKind: "owner_reported"};
  const hidden = {...shared, id: "private", title: "PRIVATE_REPORT", publicDescription: "PRIVATE_DESCRIPTION", privateNotes: "PRIVATE_NOTE", providerUserId: "PRIVATE_PERSON", relatedDocumentId: "PRIVATE_DOCUMENT", serviceDate: "2024-09-01", datePrecision: "month", isPublic: false};
  const record = sanitize({owner: "PRIVATE_OWNER", timelineEvents: [hidden, shared]});
  assert.equal(record.latestServiceDate, "2024-09");
  assert.equal(record.latestServiceDatePrecision, "month");
  assert.equal(record.timelineEvents.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(record.timelineEvents[0])), shared);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE_/);
  const invalid = sanitize({owner: "Synthetic", latestServiceDate: "2024-02-30", latestServiceDatePrecision: "day"});
  assert.equal(Object.hasOwn(invalid, "latestServiceDate"), false);
  assert.equal(Object.hasOwn(invalid, "latestServiceDatePrecision"), false);
});

test("actual Profile timeline formatter never falls back to registration timestamps", () => {
  const relative = "apps/web/app/i/[code]/ProfileClient.tsx";
  const actual = overlay && fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(repo, relative);
  const source = fs.readFileSync(actual, "utf8");
  const match = source.match(/function formatTimelineEntryDate\(entry: ServiceHistoryEntry\) \{[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(match, "Actual Profile timeline formatter not found; update the source-bound fixture explicitly");
  const policy = runtime(() => { throw Error("Unexpected HTTP"); }).load("apps/web/lib/instrument-profile-contract.ts");
  const profileDate = source.match(/function formatProfileDate\(value\?: string\) \{[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(profileDate, "Actual Profile registration formatter not found");
  const compiled = ts.transpileModule(profileDate[0] + match[0], {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const format = vm.runInNewContext(compiled + "\nformatTimelineEntryDate", {
    normalizeRecordedServiceDate: policy.normalizeRecordedServiceDate,
    formatRecordedServiceDate: policy.formatRecordedServiceDate
  });
  assert.equal(format({datePrecision: "unknown", serviceDate: "", isSystem: true, createdAt: "2026-10-01T00:00:00Z"}), "Date not recorded");
  assert.equal(format({datePrecision: "year", serviceDate: "2024-01-01"}), "2024");
  assert.equal(format({datePrecision: "month", serviceDate: "2024-09-01"}), "September 2024");
  assert.equal(format({datePrecision: "day", serviceDate: "2024-09-23"}), "Sep 23, 2024");
});

test("date metadata upstream failure is not silently converted to an empty summary", async () => {
  const app = runtime(mockDatabase(fixtures(1), 7, url =>
    url.pathname.endsWith("/guitar_timeline_events") && !url.searchParams.has("is_public")
      ? {status: 503, body: {message: "date metadata unavailable"}} : null));
  await assert.rejects(app.load("apps/web/lib/public-instruments.ts").getPublicInstrumentByCode("QRG-TEST0000"), /date metadata unavailable/);
});

for (const state of ["missing", "foreign", "disabled"]) test("collection binding privacy: " + state, async () => {
  const db = fixtures(1);
  const settings = db.site_content.find(row => row.content_key === "public_collection_owner:owner-000");
  settings.content_value.websiteUrl = "https://private-collection.example";
  if (state === "missing") db.site_content = db.site_content.filter(row => row.content_key !== "public_collection_handle:owner-000");
  if (state === "foreign") db.site_content.find(row => row.content_key === "public_collection_handle:owner-000").content_value.ownerId = "another-owner";
  if (state === "disabled") settings.content_value.enabled = false;
  const app = runtime(mockDatabase(db));
  const loader = app.load("apps/web/lib/public-instruments.ts");
  const record = await loader.getPublicInstrumentByCode("QRG-TEST0000");
  assert.ok(record, "The public instrument remains available independently of collection access");
  assert.equal(record.publicCollection, undefined);
  const catalog = await loader.getPublicInstruments();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].publicCollection, undefined);
  assert.doesNotMatch(JSON.stringify([record, catalog]), /private-collection\.example/);
  const response = await app.load("apps/web/app/sitemap.xml/route.ts").GET();
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(xml, /\/i\/QRG-TEST0000/);
  assert.doesNotMatch(xml, /\/collections\/owner-000/);
});

test("public loader excludes retained private files even if an invalid legacy row claims public visibility", async () => {
  const db=fixtures(1);
  db.guitar_documents.push({id:'retained-private',guitar_id:'g-0000',name:'PRIVATE_RECEIPT',storage_path:'/private/kept.pdf',is_public:false,retained_private:true,created_at:'2026-09-02'});
  db.guitar_documents.push({id:'retained-invalid-public',guitar_id:'g-0000',name:'INVALID_PUBLIC_RECEIPT',storage_path:'/private/invalid.pdf',is_public:true,retained_private:true,created_at:'2026-09-03'});
  const app=runtime(mockDatabase(db)),loader=app.load('apps/web/lib/public-instruments.ts');
  const profile=await loader.getPublicInstrumentByCode('QRG-TEST0000'),catalog=await loader.getPublicInstruments();
  assert.equal(profile.documentFiles.length,2);assert.equal(catalog[0].documentFiles.length,2);
  assert.doesNotMatch(JSON.stringify([profile,catalog]),/PRIVATE_RECEIPT|INVALID_PUBLIC_RECEIPT|[\/]private[\/]/);
  assert.ok(app.calls.filter(({url})=>url.pathname.endsWith('/guitar_documents')).every(({url})=>url.searchParams.get('retained_private')==='eq.false'));
});
