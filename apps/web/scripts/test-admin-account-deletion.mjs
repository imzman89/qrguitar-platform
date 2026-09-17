import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemoryDatabase, loadRoutes } from "./security/mock-routes.mjs";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(web, "../..");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");
const ID = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const email = "account@example.invalid";
const user = { id: ID, email };
const mutations = "apps/web/app/api/admin/users/[id]/route.ts";
const listing = "apps/web/app/api/admin/users/route.ts";
const associations = {
  guitars: ["owner_id", "safety_status_updated_by"],
  guitar_documents: ["uploaded_by_user_id"],
  guitar_timeline_events: ["created_by_user_id", "provider_user_id", "evidence_reviewed_by"],
  guitar_serial_aliases: ["created_by"], guitar_external_media: ["created_by"],
  ownership_transfers: ["from_owner_id", "accepted_by"],
  ownership_claims: ["current_owner_id", "claimant_user_id", "decided_by"],
  ownership_claim_evidence: ["uploaded_by"], ownership_claim_events: ["actor_user_id"],
  service_provider_profiles: ["user_id", "verified_by"],
  service_provider_profile_access: ["provider_user_id", "granted_by_user_id"],
  service_submissions: ["provider_user_id", "owner_user_id"],
  service_submission_evidence: ["uploaded_by_user_id"], service_submission_activity: ["actor_user_id"],
  service_submission_notifications: ["recipient_user_id"], instrument_staged_uploads: ["owner_id"],
  instrument_create_receipts: ["owner_id"], site_editor_receipts: ["actor_user_id"],
  billing_customers: ["owner_id"], billing_orders: ["owner_id"], billing_receipts: ["owner_id"],
  billing_credit_grants: ["owner_id"], billing_credit_consumptions: ["owner_id"], billing_credit_holds: ["owner_id"],
  billing_review_decisions: ["owner_id", "operator_id"]
};

function fixture({ allowed = true, status = 403, actor = ADMIN, envAdmin = false, hooks = {}, authResult, authThrows = false } = {}) {
  const tables = { profiles: [{ id: ID, role: "owner", account_status: "active" }], site_content: [] };
  for (const table of Object.keys(associations)) tables[table] = [];
  const db = createMemoryDatabase(tables, hooks), queries = [], authCalls = [], auditCalls = [], deleted = [], revalidated = [];
  const from = db.from;
  db.from = table => {
    const query = from(table); queries.push(query);
    query.or = expression => {
      const conditions = expression.split(",").map(part => {
        const match = part.match(/^(.+)\.(eq|like)\.(.+)$/); assert.ok(match, "Supported, explicit filter: " + part);
        const [, column, operator, value] = match;
        return row => {
          const actual = column === "content_value->>ownerId" ? row.content_value?.ownerId : row[column];
          if (operator === "eq") return actual === value;
          assert.ok(value.endsWith("%")); return typeof actual === "string" && actual.startsWith(value.slice(0, -1));
        };
      });
      query.filters.push(row => conditions.some(condition => condition(row))); return query;
    };
    query.limit = value => { query.requestedLimit = value; return query; };
    return query;
  };
  db.auth.admin.getUserById = async id => {
    authCalls.push(["get", id]); if (authThrows) throw new Error("Synthetic Auth unavailable");
    return authResult || { data: { user }, error: null };
  };
  db.auth.admin.listUsers = async () => {
    authCalls.push(["list"]); if (authThrows) throw new Error("Synthetic Auth unavailable");
    return authResult || { data: { users: [user] }, error: null };
  };
  db.auth.admin.deleteUser = async id => { deleted.push(id); throw new Error("Auth deletion is forbidden in these tests"); };
  const load = loadRoutes(repo, db, { modules: {
    "apps/web/lib/admin-auth.ts": {
      isAdminRole: role => role === "admin",
      normalizeEmail: value => String(value || "").trim().toLowerCase(),
      readAdminEmailList: () => envAdmin ? [email] : [],
      getAdminContext: async () => ({ ok: allowed, status, message: "Access denied", user: { id: actor }, email: "admin@example.invalid" }),
      logAdminAuditEvent: async (_db, event) => { auditCalls.push(event); return { ok: true }; }
    },
    "next/cache": { revalidatePath: value => revalidated.push(value) }
  } });
  return {
    db, tables, queries, authCalls, auditCalls, deleted, revalidated, load,
    async patch(body = {}, target = ID) {
      return load(mutations).PATCH(new Request("https://test.invalid/api/admin/users/" + encodeURIComponent(target), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_empty_user", reason: "Synthetic operator review", ...body })
      }), { params: Promise.resolve({ id: target }) });
    },
    async get() { return load(listing).GET(new Request("https://test.invalid/api/admin/users")); },
    assertUntouched() {
      assert.equal(deleted.length, 0); assert.equal(auditCalls.length, 0); assert.equal(revalidated.length, 0);
      assert.equal(db.calls.filter(call => call.operation !== "select").length, 0);
    }
  };
}

for (const status of [401, 403]) test(`unauthorized ${status} cannot inspect or delete accounts`, async () => {
  const f = fixture({ allowed: false, status });
  assert.equal((await f.patch()).status, status); assert.equal((await f.get()).status, status);
  assert.equal(f.db.calls.length, 0); assert.equal(f.authCalls.length, 0); f.assertUntouched();
});

test("empty account is still disabled, with no deletion, profile write, cache mutation, or success audit", async () => {
  const f = fixture(), response = await f.patch(), body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.ok, false); assert.equal(body.code, "account_deletion_disabled");
  assert.match(body.message, /cannot atomically prevent new account records/); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.ok(f.queries.filter(query => query.table !== "profiles").every(query => query.requestedLimit === 1)); f.assertUntouched();
});

for (const [table, columns] of Object.entries(associations)) for (const column of columns) test(`retained ${table}.${column} prevents an empty-account diagnosis`, async () => {
  const f = fixture();
  // A record created for, transferred to, or currently owned by somebody else
  // must still be found through its original uploader/provider/actor association.
  f.tables[table].push({ id: "record", guitar_id: "other-owners-instrument", [column]: ID });
  const response = await f.patch(), body = await response.json();
  assert.equal(response.status, 409); assert.equal(body.code, "account_deletion_retained_records"); f.assertUntouched();
});

for (const [name, table, row] of [
  ["transfer recipient email", "ownership_transfers", { to_email: email }],
  ["collection owner key", "site_content", { content_key: "public_collection_owner:" + ID }],
  ["orphan collection handle", "site_content", { content_key: "public_collection_handle:synthetic", content_value: { ownerId: ID } }],
  ["site content authorship", "site_content", { content_key: "record_trust:QRG-OTHER", updated_by: ID }],
  ["legacy creation receipt", "site_content", { content_key: "create_submission:" + ID + ":request-old" }]
]) test(`${name} is retained data even without owned instruments`, async () => {
  const f = fixture(); f.tables[table].push(row);
  assert.equal((await f.patch()).status, 409); f.assertUntouched();
});

test("unrelated actors' records are not attributed to the target", async () => {
  const f = fixture();
  for (const [table, columns] of Object.entries(associations)) f.tables[table].push(Object.fromEntries(columns.map(column => [column, OTHER])));
  f.tables.site_content.push({ content_key: "public_collection_owner:" + OTHER, content_value: { ownerId: OTHER }, updated_by: OTHER });
  assert.equal((await (await f.patch()).json()).code, "account_deletion_disabled"); f.assertUntouched();
});

for (const table of ["profiles", ...Object.keys(associations), "site_content"]) test(`${table} error, thrown request, and missing response fail closed`, async () => {
  for (const kind of ["error", "throw", "missing"]) {
    const f = fixture({ hooks: { before(query) {
      if (query.table !== table) return;
      if (kind === "throw") throw new Error("Synthetic transport failure");
      return kind === "error" ? { data: [], error: { message: "Synthetic missing relation or denied read" } } : { data: undefined, error: null };
    } } });
    const response = await f.patch(), body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.code, "account_deletion_checks_unavailable");
    assert.doesNotMatch(body.message, /Synthetic/); f.assertUntouched();
  }
});

test("a concurrent association after the empty snapshot cannot trigger deletion", async () => {
  let f, inserted = false;
  f = fixture({ hooks: { after(query) {
    if (query.table === "billing_review_decisions") { f.tables.guitars.push({ id: "raced", owner_id: ID }); inserted = true; }
  } } });
  const response = await f.patch(); assert.equal(inserted, true); assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "account_deletion_disabled"); f.assertUntouched();
});

test("invalid target cannot inject a PostgREST predicate or reach Auth", async () => {
  const f = fixture(); assert.equal((await f.patch({}, ID + ",owner_id.neq.null")).status, 400);
  assert.equal(f.authCalls.length, 0); assert.equal(f.db.calls.length, 0); f.assertUntouched();
});

for (const kind of ["self", "environment", "role", "reason"]) test(`${kind} protection remains in place`, async () => {
  const f = fixture({ actor: kind === "self" ? ID : ADMIN, envAdmin: kind === "environment" });
  if (kind === "role") f.tables.profiles[0].role = "admin";
  assert.equal((await f.patch(kind === "reason" ? { reason: "" } : {})).status, kind === "role" ? 409 : 400); f.assertUntouched();
});

for (const kind of ["throw", "error", "not-found"]) test(`Auth target ${kind} cannot continue deletion`, async () => {
  const f = fixture({ authThrows: kind === "throw", authResult: { data: { user: null }, error: kind === "error" ? { status: 503, message: "Synthetic provider details" } : { status: 404, code: "user_not_found" } } });
  const response = await f.patch(); assert.equal(response.status, kind === "not-found" ? 404 : 503);
  assert.equal(f.db.calls.length, 0); f.assertUntouched();
});

test("admin user list advertises deletion unavailable for empty and populated users", async () => {
  for (const populated of [false, true]) {
    const f = fixture(); if (populated) f.tables.guitars.push({ id: "guitar", owner_id: ID, qr_code: "QRG-SYNTHETIC", status: "verified" });
    const response = await f.get(), body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.users.length, 1); assert.equal(body.users[0].deleteEligible, false);
    assert.equal(body.users[0].deleteDisabledReason, f.load("apps/web/lib/admin-account-deletion-status.ts").ACCOUNT_DELETION_UNAVAILABLE);
    assert.match(response.headers.get("cache-control"), /no-store/); f.assertUntouched();
  }
});

for (const table of ["profiles", "guitars", "guitar_documents", "guitar_timeline_events", "ownership_transfers", "site_content"]) test(`admin user list does not turn ${table} failure into empty data`, async () => {
  for (const kind of ["error", "throw", "missing"]) {
    const f = fixture({ hooks: { before(query) {
      if (query.table !== table) return;
      if (kind === "throw") throw new Error("Synthetic unavailable");
      return { data: undefined, error: kind === "error" ? { message: "Synthetic unavailable" } : null };
    } } });
    f.tables.guitars.push({ id: "guitar", owner_id: ID, qr_code: "QRG-SYNTHETIC" });
    const response = await f.get(); assert.equal(response.status, 503); assert.equal((await response.json()).users, undefined); f.assertUntouched();
  }
});

test("Auth list failure is an unavailable response without an empty user list", async () => {
  for (const options of [{ authThrows: true }, { authResult: { data: null, error: { message: "Synthetic unavailable" } } }, { authResult: { data: {}, error: null } }]) {
    const f = fixture(options), response = await f.get(); assert.equal(response.status, 503); assert.equal((await response.json()).users, undefined); f.assertUntouched();
  }
});

test("unrelated reversible lock action still writes its intended profile and audit", async () => {
  const f = fixture(), response = await f.patch({ action: "lock" });
  assert.equal(response.status, 200); assert.equal(f.tables.profiles[0].account_status, "locked");
  assert.equal(f.auditCalls.length, 1); assert.equal(f.auditCalls[0].action, "lock"); assert.equal(f.deleted.length, 0);
});

test("live-base missing billing tables disable deletion without breaking account listing, locks, or notes", async () => {
  const options = { hooks: { before(query) {
    if (query.table.startsWith("billing_")) return { data: null, error: { code: "42P01", message: "Synthetic billing relation missing" } };
  } } };
  const blocked = fixture(options), response = await blocked.patch();
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "account_deletion_checks_unavailable"); blocked.assertUntouched();
  const listed = fixture(options); assert.equal((await listed.get()).status, 200); listed.assertUntouched();
  for (const action of ["lock", "admin_note"]) {
    const f = fixture(options); assert.equal((await f.patch({ action, adminNotes: "Reviewed locally" })).status, 200);
    assert.equal(f.auditCalls.length, 1); assert.equal(f.auditCalls[0].action, action === "admin_note" ? "admin_note" : "lock");
    assert.equal(f.deleted.length, 0); assert.ok(f.db.calls.every(call => !call.table.startsWith("billing_")));
    assert.equal(action === "lock" ? f.tables.profiles[0].account_status : f.tables.profiles[0].admin_notes, action === "lock" ? "locked" : "Reviewed locally");
  }
});

function renderAdmin(overrides = {}) {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const source = fs.readFileSync(path.join(web, "app/admin/page.tsx"), "utf8");
  const parsed = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), names = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(parsed) === "useState") names.push(node.name.elements[0].name.getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const state = { activeSection: "users", loading: false, adminAuthorized: true, ...overrides };
  let index = 0;
  const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
  const localModules = new Map();
  function loadLocal(filename) {
    if (localModules.has(filename)) return localModules.get(filename).exports;
    const loaded = { exports: {} }; localModules.set(filename, loaded);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions }).outputText;
    new Function("require", "module", "exports", code)(specifier => specifier.startsWith(".") ? loadLocal(path.resolve(path.dirname(filename), specifier) + ".ts") : require(specifier), loaded, loaded.exports);
    return loaded.exports;
  }
  const compiled = ts.transpileModule(source, { compilerOptions }).outputText;
  const component = { exports: {} };
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useState(initial) { const name = names[index++]; assert.ok(name); return [Object.hasOwn(state, name) ? state[name] : typeof initial === "function" ? initial() : initial, () => {}]; } };
    if (specifier === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (specifier.endsWith("/Nav")) return { Nav: () => null };
    if (specifier.endsWith("/Footer")) return { Footer: () => null };
    if (specifier.endsWith("/supabase-browser")) return { getSupabaseAccessToken: () => Promise.resolve(null) };
    if (specifier.startsWith("../../lib/")) return loadLocal(path.join(web, "lib", specifier.slice("../../lib/".length) + ".ts"));
    return require(specifier);
  }, component, component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default));
}

const selectedUser = { ...user, role: "owner", accountStatus: "active", recordCount: 0, publicRecordCount: 0, privateRecordCount: 0, deleteEligible: true, deleteDisabledReason: "Stale response claims eligible", createdAt: "", lastSignInAt: "" };

test("actual admin drawer is disabled even with an old eligible response", () => {
  const html = renderAdmin({ selectedUser });
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-describedby="admin-deletion-unavailable"[^>]*>Permanent account deletion unavailable<\/button>/);
  assert.match(html, /cannot atomically prevent new account records/); assert.doesNotMatch(html, /Stale response claims eligible|Only eligible accounts/);
});

test("a stale deletion confirmation cannot offer an enabled Confirm button", () => {
  const html = renderAdmin({ pendingAction: { kind: "user", user: selectedUser, action: "delete_empty_user", title: "Earlier deletion action", target: email, reason: "Already entered", typedConfirmation: email } });
  assert.match(html, /cannot atomically prevent new account records/); assert.match(html, /<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  assert.doesNotMatch(html, /Type the account email to confirm permanent deletion|This permanently removes/);
});

test("actual audit view preserves historical deletion event labels", () => {
  const html = renderAdmin({ activeSection: "audit", auditEvents: [{ id: "historic", action: "empty_user_deleted", actor_email: "old-admin@example.invalid", target_type: "profile", target_id: ID, reason: "Historical action", created_at: "2026-01-01T00:00:00Z" }] });
  assert.match(html, /Empty user deleted/); assert.match(html, /Historical action/);
});
