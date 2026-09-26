import assert from "node:assert/strict";
import ts from "typescript";
import { readRepo } from "./atomic-test-support.mjs";

async function load(relative) {
  const source = readRepo(relative);
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const bodyReader = await load("apps/web/lib/bounded-json-body.ts");
const protocol = await load("apps/web/lib/profile-upload-protocol.ts");
const limit = protocol.MAX_PROFILE_EDIT_JSON_BYTES;
const emptyBytes = Buffer.byteLength(JSON.stringify({ padding: "" }));
const jsonWithBytes = (bytes) => JSON.stringify({ padding: "x".repeat(bytes - emptyBytes) });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await test("Profile edit metadata one byte below the application limit is parsed", async () => {
  const body = jsonWithBytes(limit - 1);
  assert.equal(Buffer.byteLength(body), limit - 1);
  const result = await bodyReader.readBoundedJsonBody(new Request("https://qrguitar.test/api/instruments", {
    method: "PATCH", headers: { "content-type": "application/json" }, body
  }), limit);
  assert.equal(result.ok, true);
  assert.equal(result.bytes, limit - 1);
});

await test("Profile edit metadata one byte above the limit is rejected as too large", async () => {
  const body = jsonWithBytes(limit + 1);
  assert.equal(Buffer.byteLength(body), limit + 1);
  const result = await bodyReader.readBoundedJsonBody(new Request("https://qrguitar.test/api/instruments", {
    method: "PATCH", headers: { "content-type": "application/json" }, body
  }), limit);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "too_large" });
});

await test("an oversized declared length is rejected before reading its stream", async () => {
  let pulled = false;
  const request = { headers: new Headers({ "content-length": String(limit + 1) }), get body() { pulled = true; throw new Error("body must not be read"); } };
  const result = await bodyReader.readBoundedJsonBody(request, limit);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "too_large" });
  assert.equal(pulled, false);
});

await test("the PATCH route turns the bounded-reader result into a predictable 413", async () => {
  const route = readRepo("apps/web/app/api/instruments/route.ts");
  const patch = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patch, /readBoundedJsonBody\(request, MAX_PROFILE_EDIT_JSON_BYTES\)/);
  assert.match(patch, /profile_metadata_too_large/);
  assert.match(patch, /status: parsedBody\.reason === "too_large" \? 413 : 400/);
});

await test("the edit client stages bytes first and its PATCH contains paths instead of data URLs", async () => {
  const page = readRepo("apps/web/app/edit/[code]/page.tsx");
  const save = page.slice(page.indexOf("async function saveChanges"), page.indexOf("async function saveVerificationSettings"));
  assert.ok(save.indexOf("await stageSelectedFiles()") < save.indexOf('fetch("/api/instruments"'));
  assert.match(save, /heroImagePath: staged\.photoPaths/);
  assert.match(save, /photos: staged\.photoPaths/);
  assert.match(save, /storagePath: staged\.documentPaths\[index\]/);
  assert.doesNotMatch(save, /dataUrl:\s*document\.dataUrl/);
  assert.doesNotMatch(save, /heroImageDataUrl:\s*form\.heroImageDataUrl/);
});

await test("the Photos target groups its picker and organizer before Documents", async () => {
  const page = readRepo("apps/web/app/edit/[code]/page.tsx");
  const photosStart = page.indexOf('<section className={styles.photoSection} id="photos">');
  const photosEnd = page.indexOf("</section>", photosStart);
  const documentsStart = page.indexOf('<div className="field photo-field" id="documents">');
  const photos = page.slice(photosStart, photosEnd);
  assert.ok(photosStart >= 0 && photosEnd > photosStart && documentsStart > photosEnd);
  assert.match(photos, /id="profilePhotos"/);
  assert.match(photos, /<PhotoOrganizer/);
  assert.equal((page.match(/id="photos"/g) || []).length, 1);
  assert.equal((page.match(/id="profilePhotos"/g) || []).length, 1);
  assert.equal((page.match(/<PhotoOrganizer/g) || []).length, 1);
  const css = readRepo("apps/web/app/edit/[code]/edit.module.css");
  assert.match(css, /\.photoSection\s*\{[^}]*scroll-margin-top:\s*78px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.photoSection\s*\{[^}]*scroll-margin-top:\s*112px/);
});

await test("ready hash sync and section selection use the extracted navigation behavior", async () => {
  const page = readRepo("apps/web/app/edit/[code]/page.tsx");
  const tree = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map(), effects = [], handlers = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
    if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect") effects.push(node.arguments[0]?.getText(tree) || "");
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === "onChange" && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) handlers.push(node.initializer.expression.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  function compile(code, env, returned) {
    const javascript = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(...Object.keys(env), `${javascript}\nreturn ${returned};`)(...Object.values(env));
  }

  const historyState = { preserved: true }, scrolls = [], replacements = [];
  const browser = {
    location: { hash: "#photos" },
    history: { state: historyState, replaceState: (...args) => replacements.push(args) },
    matchMedia: query => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: true }; }
  };
  const target = { scrollIntoView: options => scrolls.push(options) };
  const helperSource = ["isKnownEditorSection", "scrollToEditorSection", "replaceEditorSectionHash"].map(name => functions.get(name)).join("\n");
  const helpers = compile(helperSource, { window: browser, document: { getElementById: id => id === "photos" ? target : null } }, "{ isKnownEditorSection, scrollToEditorSection, replaceEditorSectionHash }");
  assert.equal(helpers.replaceEditorSectionHash("photos"), true);
  assert.equal(replacements.length, 1);assert.equal(replacements[0][0], historyState);assert.equal(replacements[0][2], "#photos");
  assert.deepEqual(scrolls, [{ behavior: "auto", block: "start" }]);
  assert.equal(helpers.replaceEditorSectionHash("unknown"), false);assert.equal(replacements.length, 1);assert.equal(scrolls.length, 1);

  const readyEffect = effects.find(code => code.includes("if (!ready) return") && code.includes("scrollToEditorSection(section)"));
  assert.ok(readyEffect);
  const runReadyEffect = ready => {
    const events = [];
    const effect = compile(`const effect = ${readyEffect};`, { ready, window: browser, isKnownEditorSection: helpers.isKnownEditorSection, setActiveEditorSection: value => events.push(`active:${value}`), scrollToEditorSection: value => events.push(`scroll:${value}`) }, "effect");
    effect();return events;
  };
  assert.deepEqual(runReadyEffect(false), []);
  assert.deepEqual(runReadyEffect(true), ["active:photos", "scroll:photos"]);

  const selectHandler = handlers.find(code => code.includes("replaceEditorSectionHash(section)"));
  assert.ok(selectHandler);
  const selectionEvents = [];
  const handler = compile(`const handler = ${selectHandler};`, { isKnownEditorSection: helpers.isKnownEditorSection, setActiveEditorSection: value => selectionEvents.push(`active:${value}`), replaceEditorSectionHash: value => selectionEvents.push(`replace:${value}`) }, "handler");
  handler({ target: { value: "photos" } });handler({ target: { value: "unknown" } });
  assert.deepEqual(selectionEvents, ["active:photos", "replace:photos"]);
});

console.log(`Completed ${passed} Profile edit request-boundary tests.`);
