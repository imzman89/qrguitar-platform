import assert from "node:assert/strict";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  const stageStart = save.indexOf("const staging = stageSelectedFiles(");
  const stageSettled = save.indexOf("await editorDeadline(staging, 30000, stagingLease)");
  const dispatch = save.indexOf('await editorRequest("/api/instruments"');
  assert.ok(stageStart >= 0 && stageSettled > stageStart && dispatch > stageSettled);
  assert.match(save, /heroImagePath: staged\.photoPaths/);
  assert.match(save, /photos: staged\.photoPaths/);
  assert.match(save, /storagePath: staged\.documentPaths\[index\]/);
  assert.doesNotMatch(save, /dataUrl:\s*document\.dataUrl/);
  assert.doesNotMatch(save, /heroImageDataUrl:\s*form\.heroImageDataUrl/);
  assert.match(save, /router\.push\(ownerProfileHref\(savedInstrument, "\/dashboard"\)\)/);
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



function recoveryPresentationFixture() {
  const source = readRepo("apps/web/app/edit/[code]/page.tsx");
  const ast = ts.createSourceFile("Edit.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map(), regions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
    if (ts.isJsxExpression(node) && node.expression && node.expression.getText(ast).startsWith("Object.entries(recovery)") && node.expression.getText(ast).includes("recoveryTitle")) regions.push(node.expression.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(regions.length, 1, "Actual recovery rendering region must exist exactly once");
  for (const name of ["markRecovery", "clearRecovery", "recoveryMessage"]) assert.ok(functions.has(name), name + " must exist");
  const storage = new Map(), messages = [];
  const env = {
    React, recovery: {}, recoveryRef: { current: {} }, scope: { current: { actor: "owner" } }, code: "QRG-TEST",
    savingRecord: false, savingMedia: false, savingService: false, savedSnapshot: null,
    ui: (_key, fallback) => fallback, setMessage: value => messages.push(value),
    setRecovery: value => { env.recovery = value; },
    window: { sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } },
    checkSavedResult() {}, isCurrent: () => true, renderedOperation: {}
  };
  const js = ts.transpileModule(["markRecovery", "clearRecovery", "recoveryMessage"].map(name => functions.get(name)).join("\n") + "\nreturn { markRecovery, clearRecovery, render: () => (" + regions[0] + ") };", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
  }).outputText;
  const actual = new Function("env", "with (env) {" + js + "}")(env);
  return { env, storage, messages, actual, html: () => renderToStaticMarkup(React.createElement(React.Fragment, null, actual.render())) };
}

await test("recovery marker is persisted before dispatch but ordinary in-flight writes show no failure card", async () => {
  for (const [kind, flag] of [["details", "savingRecord"], ["media", "savingMedia"], ["history", "savingService"]]) {
    const f = recoveryPresentationFixture();
    assert.equal(f.html(), "");
    f.env[flag] = true;
    f.actual.markRecovery(kind, "QRG-TEST");
    assert.equal(f.storage.get("qrguitar.editor.pending.owner.QRG-TEST." + kind), "QRG-TEST");
    assert.equal(f.env.recoveryRef.current[kind].checked, false);
    assert.equal(f.html(), "", kind + ": active save must not look failed");
    assert.equal(f.actual.clearRecovery(kind), true);
    f.env[flag] = false;
    assert.equal(f.html(), "");
    assert.equal(f.storage.size, 0);
  }
});

await test("an unsettled result becomes visible after saving ends and retained reload markers stay actionable", async () => {
  const f = recoveryPresentationFixture();
  f.env.savingRecord = true;
  f.actual.markRecovery("details", "QRG-TEST");
  assert.equal(f.html(), "");
  f.env.savingRecord = false;
  assert.match(f.html(), /Saved-result recovery/);
  assert.match(f.html(), /The saved result is not fully confirmed/);
  assert.match(f.html(), /Check saved result/);
  assert.doesNotMatch(f.html(), /disabled=""/);
  assert.equal(f.storage.size, 1);
  const reloaded = recoveryPresentationFixture();
  reloaded.env.recovery = { details: { checked: false, code: "QRG-TEST" } };
  reloaded.env.recoveryRef.current = reloaded.env.recovery;
  assert.match(reloaded.html(), /Saved-result recovery/);
  assert.doesNotMatch(reloaded.html(), /Allow another change/);
});

await test("saving one operation never hides another operation's unresolved recovery", async () => {
  for (const [active, flag, hidden] of [["details", "savingRecord", "Profile details, trust and safety"], ["media", "savingMedia", "Media"], ["history", "savingService", "History"]]) {
    const f = recoveryPresentationFixture();
    for (const kind of ["details", "media", "history"]) f.actual.markRecovery(kind, "QRG-TEST");
    f.env[flag] = true;
    const html = f.html();
    assert.equal((html.match(/aria-label="Saved-result recovery"/g) || []).length, 2);
    assert.ok(!html.includes("<strong>" + hidden + "</strong>"), active);
    assert.equal(f.storage.size, 3);
    f.env[flag] = false;
    assert.equal((f.html().match(/aria-label="Saved-result recovery"/g) || []).length, 3);
  }
});

await test("checked recovery keeps its acknowledgment and snapshot; storage-clear failure keeps the lock", async () => {
  const f = recoveryPresentationFixture();
  f.actual.markRecovery("details", "QRG-TEST");
  f.env.recovery.details.checked = true;
  f.env.savedSnapshot = { qrCode: "QRG-TEST", name: "Confirmed snapshot" };
  assert.match(f.html(), /Allow another change/);
  assert.match(f.html(), /Saved Profile result \(your draft is unchanged\)/);
  assert.match(f.html(), /Confirmed snapshot/);
  f.env.window.sessionStorage.removeItem = () => { throw Error("Storage denied"); };
  assert.equal(f.actual.clearRecovery("details"), false);
  assert.equal(f.storage.size, 1);
  assert.ok(f.env.recoveryRef.current.details);
  assert.match(f.html(), /Saved-result recovery/);
  assert.match(f.messages.at(-1), /recovery lock could not be cleared/);
});
function editorArrivalResizeFixture(options = {}) {
  const source = readRepo("apps/web/app/edit/[code]/page.tsx");
  const ast = ts.createSourceFile("Edit.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map(), effects = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") effects.push(node.arguments[0]?.getText(ast) || "");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const readyEffects = effects.filter(text => text.includes("if (!ready) return") && text.includes("scrollToEditorSection(section)"));
  assert.equal(readyEffects.length, 1, "Actual ready-arrival effect must be found exactly once");
  const resizeEffects = effects.filter(text => text.includes("retainEditorSectionArrivalOnWidthChange("));
  assert.ok(resizeEffects.length <= 1, "Actual resize-arrival effect must be unambiguous");
  const names = ["isKnownEditorSection", "requestedEditorSection", "revealEditorTarget", "scrollToEditorSection"];
  if (functions.has("retainEditorSectionArrivalOnWidthChange")) {
    names.push("retainEditorSectionArrivalOnWidthChange");
    assert.equal(resizeEffects.length, 1, "Actual resize helper must be wired into an effect");
  }
  for (const name of names) assert.ok(functions.has(name), name + " must exist");
  if (resizeEffects.length) assert.ok(functions.has("retainEditorSectionArrivalOnWidthChange"), "Actual resize effect helper must exist");
  const listeners = new Map(), scrolls = [], focuses = [], pendingScrolls = [], cleanups = [];
  const section = options.section ?? "documents";
  const root = { scrollHeight: 6000 };
  const document = { documentElement: root, activeElement: null, getElementById: id => !options.missing && id === section ? target : null };
  const emit = (type, event = {}) => { for (const item of [...(listeners.get(type) || [])]) item.fn({ type, ...event }); };
  const browser = {
    innerWidth: options.width ?? 390, innerHeight: options.height ?? 844, scrollY: 0,
    location: { hash: "", search: "?section=" + section },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: element => element === root ? { scrollPaddingTop: "0px" } : { scrollMarginTop: browser.innerWidth <= 760 ? "220px" : "160px" },
    addEventListener(type, fn, capture = false) { const list = listeners.get(type) || []; list.push({ fn, capture }); listeners.set(type, list); },
    removeEventListener(type, fn, capture = false) { listeners.set(type, (listeners.get(type) || []).filter(item => item.fn !== fn || item.capture !== capture)); }
  };
  const absoluteTop = () => browser.innerWidth <= 760 ? 2537.578125 : browser.innerWidth < 1100 ? 1836.203125 : 1626;
  let pendingArrival = null;
  class Element {
    constructor(name, parentElement = null) { this.name = name; this.parentElement = parentElement; this.isConnected = true; this.tabIndex = 0; }
    matches() { return this.name === "summary" || this.name === "input"; }
    querySelector() { return this.control || null; }
    getBoundingClientRect() { const top = absoluteTop() - browser.scrollY; return { top, bottom: top + 44 }; }
    scrollIntoView(value) {
      scrolls.push(value);
      const destination = Math.floor(Math.min(root.scrollHeight - browser.innerHeight, Math.max(0, absoluteTop() - Number.parseFloat(browser.getComputedStyle(this).scrollMarginTop))));
      if (options.deferInitialScroll && scrolls.length === 1) pendingArrival = destination;
      else { browser.scrollY = destination; pendingScrolls.push("scroll"); }
    }
    focus(value) { document.activeElement = this; focuses.push({ target: this, options: value }); emit("focusin", { target: this }); }
  }
  class Details extends Element {
    constructor() { super(section); this.open = false; this.summary = new Element("summary", this); }
    querySelector(selector) { assert.equal(selector, ":scope > summary"); return this.summary; }
  }
  const target = options.nonDisclosure ? new Element(section) : new Details();
  const input = new Element("input", target); target.control = input;
  const env = { ready: options.ready ?? true, code: "QRG-TEST", window: browser, document, HTMLDetailsElement: Details };
  function compile(code, returned) {
    const javascript = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(...Object.keys(env), javascript + "\nreturn " + returned + ";")(...Object.values(env));
  }
  Object.assign(env, compile(names.map(name => functions.get(name)).join("\n"), "({" + names.join(",") + "})"));
  const flushScroll = () => { while (pendingScrolls.length) emit(pendingScrolls.shift()); };
  for (const effect of [...readyEffects, ...resizeEffects]) {
    const cleanup = compile("const effect = " + effect + ";", "effect")();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  flushScroll();
  return {
    target, input, document, browser, scrolls, focuses, emit,
    resize(width, height) { browser.innerWidth = width; browser.innerHeight = height; emit("resize"); flushScroll(); },
    scroll(y) { browser.scrollY = y; emit("scroll"); },
    settleArrival() { assert.notEqual(pendingArrival, null); browser.scrollY = pendingArrival; pendingArrival = null; emit("scroll"); },
    cleanup() { for (const cleanup of cleanups) cleanup(); },
    listenerCount: () => [...listeners.values()].reduce((sum, items) => sum + items.length, 0)
  };
}

await test("untouched settled summary arrival follows width reflow without refocusing or changing the route", async () => {
  for (const width of [390, 1280]) {
    const f = editorArrivalResizeFixture({ width });
    assert.deepEqual(f.scrolls, [{ behavior: "smooth", block: "start" }]);
    const route = JSON.stringify(f.browser.location);
    for (const [nextWidth, height] of width === 390 ? [[844, 390], [390, 844]] : [[390, 844]]) {
      f.resize(nextWidth, height);
      const bounds = f.target.summary.getBoundingClientRect();
      assert.ok(bounds.top >= 0 && bounds.bottom <= height, "Focused arrival summary must remain visible after width reflow");
      assert.deepEqual(f.scrolls.at(-1), { behavior: "instant", block: "start" });
      assert.equal(f.document.activeElement, f.target.summary);
      assert.equal(f.target.open, true);
      assert.equal(f.focuses.length, 1, "Width reflow must not take focus again");
      assert.equal(JSON.stringify(f.browser.location), route);
    }
    assert.equal(f.scrolls.length, width === 390 ? 3 : 2);
    f.cleanup();
  }
});

await test("height-only changes and an already visible width reflow never recenter arrival", async () => {
  const f = editorArrivalResizeFixture();
  const y = f.browser.scrollY;
  f.resize(390, 200);
  assert.ok(f.target.summary.getBoundingClientRect().bottom > 200);
  assert.equal(f.browser.scrollY, y);
  assert.equal(f.scrolls.length, 1, "Even an offscreen summary must not recenter on keyboard-height change");
  f.resize(400, 844);
  assert.equal(f.browser.scrollY, y);
  assert.equal(f.scrolls.length, 1, "Visible summary must not be repositioned");
  assert.equal(f.focuses.length, 1);
  f.cleanup();
});

await test("manual scroll permanently disengages summary arrival even if focus stays or scroll returns", async () => {
  const f = editorArrivalResizeFixture();
  f.scroll(1473);
  f.resize(844, 390);
  assert.equal(f.browser.scrollY, 1473);
  assert.ok(f.target.summary.getBoundingClientRect().bottom > 390);
  assert.equal(f.document.activeElement, f.target.summary);
  f.scroll(2317);
  f.resize(390, 844);
  f.resize(844, 390);
  assert.equal(f.browser.scrollY, 2317);
  assert.equal(f.scrolls.length, 1, "Returning to the original position must not rearm following");
  f.cleanup();
});

await test("intentional interaction or field focus prevents width following and preserves keyboard-height position", async () => {
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown", "input"]) {
    const f = editorArrivalResizeFixture();
    f.emit(type, { target: f.target.summary });
    f.resize(844, 390);
    assert.equal(f.browser.scrollY, 2317, type);
    assert.equal(f.scrolls.length, 1, type);
    assert.equal(f.focuses.length, 1, type);
    f.cleanup();
  }
  const f = editorArrivalResizeFixture();
  f.input.focus({ preventScroll: true });
  f.scroll(2141);
  f.resize(390, 500);
  f.resize(844, 390);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.browser.scrollY, 2141);
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.focuses.length, 2, "Field focus must never be taken back");
  f.cleanup();
});

await test("resize following is scoped to a live ready disclosure arrival and cleans up", async () => {
  for (const options of [{ ready: false }, { missing: true }, { section: "unknown" }, { section: "identity", nonDisclosure: true }]) {
    const f = editorArrivalResizeFixture(options);
    const count = f.scrolls.length;
    assert.equal(f.listenerCount(), 0);
    f.resize(844, 390);
    assert.equal(f.scrolls.length, count);
  }
  for (const disable of [f => { f.target.open = false; }, f => { f.target.isConnected = false; }, f => f.cleanup()]) {
    const f = editorArrivalResizeFixture();
    assert.ok(f.listenerCount() > 0);
    disable(f);
    f.resize(844, 390);
    assert.equal(f.scrolls.length, 1);
    f.cleanup();
    assert.equal(f.listenerCount(), 0);
  }
});

await test("width change during initial smooth arrival never adds a competing scroll or rearms later", async () => {
  const f = editorArrivalResizeFixture({ deferInitialScroll: true });
  assert.equal(f.browser.scrollY, 0);
  f.resize(844, 390);
  assert.equal(f.scrolls.length, 1);
  f.settleArrival();
  f.resize(390, 844);
  f.resize(844, 390);
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.focuses.length, 1);
  f.cleanup();
});

console.log(`Completed ${passed} Profile edit request-boundary tests.`);
