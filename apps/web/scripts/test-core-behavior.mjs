import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(relative) {
  const code = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, require);
  return exports;
}
const { safeAuthRedirect } = load("lib/auth-redirect.ts");
const { isOwnedStagedPath } = load("lib/staged-upload-cleanup.ts");
const { matchesCatalogQuery } = load("lib/catalog-search.ts");
let checks = 0;
function check(name, fn) { fn(); checks++; console.log("PASS " + name); }
for (const input of [null, "", "//evil.invalid", "/\\evil.invalid", "/%5cevil.invalid", "/%2f%2fevil.invalid",
  "https://evil.invalid", "javascript:alert(1)", "/login", "/login?next=/create", "/reset-password", "/%zz", "/\nevil.invalid"]) {
  check("reject unsafe auth redirect " + JSON.stringify(input), () => assert.equal(safeAuthRedirect(input), "/dashboard"));
}
check("keep instrument and next-step query", () => assert.equal(safeAuthRedirect("/i/QRG-123?view=history#documents"), "/i/QRG-123?view=history#documents"));
check("keep registration destination", () => assert.equal(safeAuthRedirect("/create"), "/create"));

const owner = "owner-123", upload = "upload-1234567890";
const image = owner + "/profile-uploads/" + upload + "/image-01-12345678.jpg";
const doc = owner + "/profile-uploads/" + upload + "/document-01-12345678.pdf";
check("accept generated object names", () => assert.ok(isOwnedStagedPath(image, owner, upload, "image")));
for (const value of [image.replace(owner, "other-user"), image.replace(upload, "upload-9999999999"), image + "/../../foreign.jpg", image + "%2f..", image + "\\..", image + "?x", doc]) {
  check("reject foreign or malformed image path", () => assert.equal(isOwnedStagedPath(value, owner, upload, "image"), false));
}
// Cleanup transaction/Storage ordering is tested by test:upload-registry.
const record = {qrCode:"QRG-EXAMPLE", name:"Vibroverb",brand:"Fender",model:"Vibroverb Reissue",year:"1991",serial:"PRIVATE-SERIAL"};
check("catalog searches displayed year", () => assert.ok(matchesCatalogQuery(record,"1991")));
check("catalog trims search and ignores case", () => assert.ok(matchesCatalogQuery(record,"  FENDER ")));
check("catalog does not expose hidden serial through general search", () => assert.equal(matchesCatalogQuery(record,"PRIVATE-SERIAL"),false));
check("catalog empty query matches", () => assert.ok(matchesCatalogQuery(record,"  ")));
console.log(`Core behavior: ${checks} checks passed. No external services or customer records used.`);
