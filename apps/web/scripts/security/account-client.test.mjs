import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(option("--overlay")) : repo;
const ts = createRequire(path.join(repo, "apps/web/package.json"))("typescript");
const source = fs.readFileSync(path.join(overlay, "apps/web/app/account/page.tsx"), "utf8");
const start = source.indexOf("  async function saveAccount()");
const end = source.indexOf("  async function sendPasswordReset()", start);
assert.ok(start > 0 && end > start, "account save function must exist");
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const settings = { handle: "committed-handle" };
async function run(fetch, getToken = async () => "fixture-token") {
  const state = { statuses: [], working: [], events: [], collection: null };
  const save = new Function("fetch", "getSupabaseAccessToken", "setStatus", "setIsWorking", "setPublicCollection", "window", "CustomEvent", "displayName", "publicCollection", code + "\nreturn saveAccount;")(
    fetch, getToken, (text) => state.statuses.push(text), (value) => state.working.push(value), (value) => state.collection = value,
    { dispatchEvent: (event) => state.events.push(event.type) }, class { constructor(type) { this.type = type; } }, "Valid name", settings
  );
  await save(); assert.deepEqual(state.working, [true, false]); return state;
}
const offline = await run(async () => { throw new Error("offline"); });
assert.match(offline.statuses.at(-1), /Could not confirm/); assert.equal(offline.events.length, 0);
const noToken = await run(async () => { throw new Error("should not fetch"); }, async () => { throw new Error("session unavailable"); });
assert.match(noToken.statuses.at(-1), /Could not confirm/);
const conflict = await run(async () => Response.json({ ok: false, message: "That handle is in use." }, { status: 409 }));
assert.equal(conflict.statuses.at(-1), "That handle is in use."); assert.equal(conflict.collection, null);
const warning = await run(async () => Response.json({ ok: true, committed: true, authMetadataSynced: false, message: "Account saved. Sign-in sync failed.", account: { publicCollection: settings } }));
assert.equal(warning.statuses.at(-1), "Account saved. Sign-in sync failed."); assert.deepEqual(warning.collection, settings); assert.deepEqual(warning.events, ["qrguitar:auth"]);
const malformed = await run(async () => new Response("gateway outage", { status: 502 }));
assert.match(malformed.statuses.at(-1), /Could not confirm/); assert.equal(malformed.events.length, 0);
console.log("5 account save UI control-flow tests passed.");
