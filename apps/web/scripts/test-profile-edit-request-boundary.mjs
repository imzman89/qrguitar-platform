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
  assert.match(save, /router\.push\(ownerProfileHref\(savedInstrument\)\)/);
});

await test("the Photos target groups its picker and organizer before Documents", async () => {
  const page = readRepo("apps/web/app/edit/[code]/page.tsx");
  const photosStart = page.indexOf('<section className={styles.photoSection} id="photos">');
  const photosEnd = page.indexOf("</section>", photosStart);
  const documentsStart = page.indexOf('<details className={styles.optionalSection} id="documents">');
  const photos = page.slice(photosStart, photosEnd);
  assert.ok(photosStart >= 0 && photosEnd > photosStart && documentsStart > photosEnd);
  assert.match(photos, /id="profilePhotos"/);
  assert.match(photos, /<PhotoOrganizer/);
  assert.equal((page.match(/id="photos"/g) || []).length, 1);
  assert.equal((page.match(/id="profilePhotos"/g) || []).length, 1);
  assert.equal((page.match(/<PhotoOrganizer/g) || []).length, 1);
  const css = readRepo("apps/web/app/edit/[code]/edit.module.css");
  const desktopOffset = css.match(/\.photoSection\s*\{[^}]*scroll-margin-top:\s*(\d+)px/);
  const mobileOffset = css.match(/@media \(max-width: 760px\)[\s\S]*?\.photoSection[^{}]*\{[^}]*scroll-margin-top:\s*(\d+)px/);
  assert.ok(desktopOffset && mobileOffset);
  assert.ok(Number(desktopOffset[1]) > 0);
  assert.ok(Number(mobileOffset[1]) >= Number(desktopOffset[1]));
});

await test("ready deep links and native disclosures preserve navigation behavior", async () => {
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
    location: { hash: "#photos", search: "" },
    history: { state: historyState, replaceState: (...args) => replacements.push(args) },
    matchMedia: query => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: true }; }
  };
  const navigationEvents = [], focuses = [], lookups = [];
  class Element {
    constructor(name, parentElement = null) { this.name = name; this.parentElement = parentElement; this.tabIndex = 0; }
    matches(selector) { assert.ok(["summary, input, select, textarea, button, a[href]", "input, select, textarea, button, a[href]"].includes(selector)); return this.name.endsWith("-summary") || this.name === "brand"; }
    querySelector(selector) { assert.equal(selector, "input:not([type=hidden]):not([tabindex='-1']), select, textarea, button, a[href]"); return this.control || null; }
    scrollIntoView(options) {
      for (let node = this; node; node = node.parentElement) if (node instanceof Details) assert.equal(node.open, true, node.name + " closed at scroll");
      navigationEvents.push("scroll:" + this.name); scrolls.push(options);
    }
    focus(options) {
      for (let node = this; node; node = node.parentElement) if (node instanceof Details) assert.equal(node.open, true, node.name + " closed at focus");
      navigationEvents.push("focus:" + this.name); focuses.push({ name: this.name, options });
    }
  }
  class Details extends Element {
    constructor(name, parentElement = null) { super(name, parentElement); this.expanded = false; this.summary = new Element(name + "-summary", this); }
    get open() { return this.expanded; }
    set open(value) { this.expanded = Boolean(value); navigationEvents.push("open:" + this.name + ":" + this.expanded); }
    querySelector(selector) { assert.equal(selector, ":scope > summary"); return this.summary; }
  }
  const outer = new Details("outer"), wrapper = new Element("wrapper", outer), inner = new Details("inner", wrapper);
  const target = new Element("photos", inner), disclosureTarget = new Details("documents", inner);
  const identityTarget = new Element("identity", inner); identityTarget.control = new Element("brand", identityTarget);
  const helperNames = ["isKnownEditorSection", "requestedEditorSection", "revealEditorTarget", "scrollToEditorSection", "replaceEditorSectionHash"];
  for (const name of helperNames) assert.ok(functions.has(name), name + " exists");
  const helperSource = helperNames.map(name => functions.get(name)).join("\n");
  const helpers = compile(helperSource, {
    window: browser, HTMLDetailsElement: Details,
    document: { getElementById: id => { lookups.push(id); return id === "photos" ? target : id === "documents" ? disclosureTarget : id === "identity" ? identityTarget : null; } }
  }, "{ isKnownEditorSection, requestedEditorSection, scrollToEditorSection, replaceEditorSectionHash }");
  assert.equal(helpers.replaceEditorSectionHash("photos"), true);
  assert.equal(replacements.length, 1);assert.equal(replacements[0][0], historyState);assert.equal(replacements[0][2], "#photos");
  assert.deepEqual(scrolls, [{ behavior: "auto", block: "start" }]);
  assert.equal(helpers.replaceEditorSectionHash("unknown"), false);assert.equal(replacements.length, 1);assert.equal(scrolls.length, 1);

  const readyEffect = effects.find(code => code.includes("if (!ready) return") && code.includes("scrollToEditorSection(section)"));
  assert.ok(readyEffect);
  const runReadyEffect = ready => {
    const events = [];
    const effect = compile(`const effect = ${readyEffect};`, { ready, window: browser, requestedEditorSection: helpers.requestedEditorSection, isKnownEditorSection: helpers.isKnownEditorSection, scrollToEditorSection: value => events.push(`scroll:${value}`) }, "effect");
    effect();return events;
  };
  assert.deepEqual(runReadyEffect(false), []);
  assert.deepEqual(runReadyEffect(true), ["scroll:photos"]);

  await test("creation completion query links resolve to their actual editor destination", async () => {
    const create = readRepo("apps/web/app/create/page.tsx");
    for (const section of ["timeline", "media", "documents"]) {
      assert.ok(create.includes("?section=" + section));
      browser.location = { hash: "", search: "?section=" + section };
      assert.equal(helpers.requestedEditorSection(), section);
      assert.deepEqual(runReadyEffect(true), ["scroll:" + section]);
    }
    browser.location = { hash: "#photos", search: "?section=documents" };
    assert.equal(helpers.requestedEditorSection(), "photos");
    browser.location = { hash: "#unknown", search: "?section=unknown" };
    assert.equal(helpers.requestedEditorSection(), "");
    assert.deepEqual(runReadyEffect(true), []);
    browser.location = { hash: "#photos", search: "" };
  });

  await test("optional panels stay mounted and the duplicate section chooser is removed", async () => {
    assert.equal(/editor-section-select|activeEditorSection|setActiveEditorSection/.test(page), false);
    for (const id of ["details", "documents", "media", "timeline", "qr-print", "trust-verification", "privacy-safety"]) {
      assert.ok(page.includes('<details className={styles.optionalSection} id="' + id + '">'));
    }
    assert.ok(page.indexOf('id="photos"') < page.indexOf('id="details"'));
    assert.match(page, /<div className={styles.tools}>/);
  });
  await test("nested details open outer-first before section scroll and focus", async () => {
    assert.deepEqual(navigationEvents, ["open:outer:true", "open:inner:true", "scroll:photos", "focus:photos"]);
    assert.deepEqual(focuses, [{ name: "photos", options: { preventScroll: true } }]);
    assert.equal(target.tabIndex, -1);
  });
  await test("invalid section is a complete DOM/history no-op", async () => {
    const before = JSON.stringify({ navigationEvents, focuses, scrolls, replacements, lookups });
    assert.equal(helpers.scrollToEditorSection("unknown"), false);
    assert.equal(helpers.replaceEditorSectionHash("unknown"), false);
    assert.equal(JSON.stringify({ navigationEvents, focuses, scrolls, replacements, lookups }), before);
  });
  await test("missing known target returns false without opening or focus", async () => {
    const before = JSON.stringify({ navigationEvents, focuses, scrolls, replacements });
    assert.equal(helpers.scrollToEditorSection("service"), false);
    assert.equal(lookups.at(-1), "service");
    assert.equal(JSON.stringify({ navigationEvents, focuses, scrolls, replacements }), before);
  });
  await test("a details section opens itself and focuses its direct summary", async () => {
    const start = navigationEvents.length;
    assert.equal(helpers.scrollToEditorSection("documents"), true);
    assert.deepEqual(navigationEvents.slice(start), ["open:outer:true", "open:inner:true", "open:documents:true", "scroll:documents", "focus:documents-summary"]);
    assert.deepEqual(focuses.at(-1), { name: "documents-summary", options: { preventScroll: true } });
    assert.equal(disclosureTarget.summary.tabIndex, 0);
  });
  await test("a form section focuses its first usable control instead of framing the entire form", async () => {
    const start = navigationEvents.length;
    assert.equal(helpers.scrollToEditorSection("identity"), true);
    assert.deepEqual(navigationEvents.slice(start), ["open:outer:true", "open:inner:true", "scroll:identity", "focus:brand"]);
    assert.deepEqual(focuses.at(-1), { name: "brand", options: { preventScroll: true } });
    assert.equal(identityTarget.tabIndex, 0);
  });
  await test("normal motion keeps smooth scrolling and preserves history state identity", async () => {
    browser.matchMedia = query => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return { matches: false }; };
    assert.equal(helpers.replaceEditorSectionHash("photos"), true);
    assert.deepEqual(scrolls.at(-1), { behavior: "smooth", block: "start" });
    assert.equal(replacements.length, 2);
    assert.equal(replacements.at(-1)[0], historyState);
    assert.deepEqual(replacements.at(-1), [historyState, "", "#photos"]);
    assert.deepEqual(focuses.at(-1), { name: "photos", options: { preventScroll: true } });
  });
  await test("validation focus follows the first actual validation error", async () => {
    const validationTree = ts.createSourceFile("security.ts", readRepo("apps/web/lib/security.ts"), ts.ScriptTarget.Latest, true);
    const validationFunction = validationTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "validateInstrumentSubmission");
    const validate = compile(validationFunction.getText(validationTree).replace("export ", ""), {}, "validateInstrumentSubmission");
    const focus = compile(functions.get("editorValidationTarget"), {}, "editorValidationTarget");
    const valid = { brand: "Fender", model: "Stratocaster", serial: "S123", year: "2005", summary: "", serialNotUsed: false };
    for (const [changes, expected] of [[{ brand: "", year: "bad", summary: "x".repeat(2001) }, "brand"], [{ model: "", year: "bad" }, "model"], [{ serial: "", summary: "x".repeat(2001) }, "serial"], [{ brand: "x".repeat(81), summary: "x".repeat(2001) }, "brand"], [{ model: "x".repeat(81) }, "model"], [{ summary: "x".repeat(2001), year: "bad" }, "summary"], [{ brand: "<invalid>", year: "bad" }, "brand"], [{ model: "<invalid>" }, "model"], [{ serial: "bad space", year: "bad" }, "serial"], [{ year: "bad" }, "year"]]) {
      const input = { ...valid, ...changes }; assert.equal(focus(input, validate(input)), expected);
    }
    assert.equal(focus(valid, "Submission blocked."), "identity");
  });
});

console.log(`Completed ${passed} Profile edit request-boundary tests.`);
