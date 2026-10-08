import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

export function createMemoryDatabase(tables, hooks = {}) {
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.operation = "select"; this.filters = []; this.columns = "*"; }
    select(columns = "*", options = {}) { this.columns = columns; this.selectOptions = options; return this; }
    eq(column, value) { this.filters.push((row) => row[column] === value); return this; }
    is(column, value) { this.filters.push((row) => value === null ? row[column] == null : row[column] === value); return this; }
    neq(column, value) { this.filters.push((row) => row[column] !== value); return this; }
    not(column, operator, value) { if (operator !== "is" || value !== null) throw new Error("Unsupported filter"); this.filters.push((row) => row[column] != null); return this; }
    in(column, values) { this.filters.push((row) => values.includes(row[column])); return this; }
    order() { return this; }
    limit() { return this; }
    update(value) { this.operation = "update"; this.value = value; return this; }
    upsert(value, options = {}) { this.operation = "upsert"; this.value = value; this.conflict = options.onConflict || "id"; return this; }
    insert(value) { this.operation = "insert"; this.value = value; return this; }
    delete() { this.operation = "delete"; return this; }
    maybeSingle() { this.singleRow = true; return this; }
    single() { this.singleRow = true; return this; }
    then(resolve, reject) { return this.run().then(resolve, reject); }
    async run() {
      calls.push({ table: this.table, operation: this.operation, value: this.value, columns: this.columns, selectOptions: this.selectOptions });
      const intercepted = await hooks.before?.(this);
      if (intercepted) return intercepted;
      const table = tables[this.table] ||= [];
      let rows = table.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === "update") rows.forEach((row) => Object.assign(row, this.value));
      if (this.operation === "delete") { tables[this.table] = table.filter((row) => !rows.includes(row)); rows = []; }
      if (this.operation === "insert" || this.operation === "upsert") {
        const incoming = Array.isArray(this.value) ? this.value : [this.value];
        rows = incoming.map((value) => {
          const existing = this.operation === "upsert" && table.find((row) => row[this.conflict] === value[this.conflict]);
          if (existing) { Object.assign(existing, value); return existing; }
          const row = { id: "synthetic-" + table.length, ...value };
          table.push(row);
          return row;
        });
      }
      rows = rows.map((row) => this.columns === "*" ? structuredClone(row) : Object.fromEntries(this.columns.split(",").map((column) => [column, structuredClone(row[column])])));
      const result = { data: this.selectOptions?.head ? null : this.singleRow ? rows[0] || null : rows, error: null, count: this.selectOptions?.count === "exact" ? rows.length : null };
      await hooks.after?.(this, result);
      return result;
    }
  }
  return {
    tables, calls,
    from: (table) => new Query(table),
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
    rpc(name, args) {
      let signal, pending;
      const query = {
        abortSignal(value) { signal = value; return query; },
        then(resolve, reject) {
          pending ||= Promise.resolve().then(() => {
            signal?.throwIfAborted();
            calls.push({ operation: "rpc", name, args: structuredClone(args), signal });
            if (!hooks.rpc) throw new Error("Unexpected RPC in read-only local fixture.");
            return hooks.rpc(name, args, signal);
          });
          return pending.then(resolve, reject);
        }
      };
      return query;
    }
  };
}

export function loadRoutes(repo, database, { user = null, overlay = null, afterAdmin = null, realAdmin = false, isAdmin = false, modules = {} } = {}) {
  const nodeRequire = createRequire(path.join(repo, "apps/web/package.json"));
  const ts = nodeRequire("typescript");
  const cache = new Map();
  const userAuth = { createServerSupabaseClient: () => database, getAuthenticatedUser: async () => ({ user, error: user ? "" : "Sign in required." }) };
  const adminAuth = {
    assertAccountCanWrite: async () => ({ ok: true }),
    getAdminContext: async () => { afterAdmin?.(); return { ok: isAdmin }; },
    isAdminRole: (role) => role === "admin",
    normalizeEmail: (email) => String(email || "").trim().toLowerCase(),
    readAdminEmailList: () => [],
    logAdminAuditEvent: async () => ({ ok: true })
  };
  function load(relative) {
    if (Object.prototype.hasOwnProperty.call(modules, relative)) return modules[relative];
    if (cache.has(relative)) return cache.get(relative).exports;
    if (relative === "apps/web/lib/supabase-server.ts") return userAuth;
    if (relative === "apps/web/lib/admin-auth.ts" && !realAdmin) return adminAuth;
    if (relative === "apps/web/lib/transactional-email.ts") return { sendServiceReviewEmail: async () => { throw new Error("Email is forbidden in this test."); } };
    const source = overlay && fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(repo, relative);
    const code = ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    cache.set(relative, module);
    const require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(modules, specifier)) {
        const mock = modules[specifier];
        // Default-shaped overrides are module namespaces, not CommonJS values
        // for TypeScript's __importDefault helper to wrap a second time.
        return mock && typeof mock === "object" && Object.prototype.hasOwnProperty.call(mock, "default")
          && !Object.prototype.hasOwnProperty.call(mock, "__esModule") ? { ...mock, __esModule: true } : mock;
      }
      if (specifier === "next/server") return { NextResponse: Response };
      if (specifier === "next/cache") return { revalidatePath() {}, unstable_noStore() {} };
      if (!specifier.startsWith(".")) return nodeRequire(specifier);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      return load(target + ".ts");
    };
    const fn = vm.runInNewContext("(function(require,module,exports){\n" + code + "\n})", {
      URL, Request, Response, Buffer, File, FormData, TextDecoder, AbortSignal, setTimeout, clearTimeout, console,
      process: { env: {} }
    }, { filename: source });
    fn(require, module, module.exports);
    return module.exports;
  }
  return load;
}




