import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript");
function compile(file, imports = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports);
  return module.exports;
}
const qrOutput = compile("lib/qr-output.ts"), profileUrl = compile("lib/profile-url.ts");
const initialStyle = { foreground: "#071014", background: "#f8f6f2", includeLabel: true, labelText: "Initial label", shape: "classic" };
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? text(node.props?.children) : "";
}
function fixture(extra = {}, dom = null) {
  const slots = [], attempts = [], styleChanges = [];
  let cursor = 0, pending = [], dirty = false, tree, props;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps };
      return slots[index].value;
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index]) slots[index] = {};
      if (!same(slots[index].deps, deps)) pending.push(() => {
        slots[index].cleanup?.(); slots[index].deps = deps; slots[index].cleanup = fn();
      });
    }
  };
  const { QrDownload } = compile("components/QrDownload.tsx", {
    react: hooks, qrcode: {}, "../lib/local-demo": { defaultQrStyle: initialStyle }, "../lib/profile-url": profileUrl,
    "../lib/qr-output": { ...qrOutput, beginQrRender(render, publish) {
      const attempt = { render, publish, cancelled: false }; attempts.push(attempt);
      return () => { attempt.cancelled = true; };
    } }
  });
  const f = {
    attempts, styleChanges,
    render(next = props) { props = next; cursor = 0; pending = []; dirty = false; tree = QrDownload(props); dom?.mount(tree); return tree; },
    flush() {
      for (let n = 0; n < 20; n++) {
        const jobs = pending; pending = []; jobs.forEach(fn => fn());
        if (!dirty) return tree;
        f.render();
      }
      throw new Error("Component effects did not settle");
    },
    update(next) { return f.render({ ...props, ...next }); },
    complete(url) { const attempt = attempts.at(-1); assert.ok(attempt && !attempt.cancelled); attempt.publish({ url, error: "" }); f.flush(); },
    downloads: () => nodes(tree, node => node.type === "a" && Boolean(node.props.download)).map(node => node.props.href),
    find: predicate => { const found = nodes(tree, predicate)[0]; assert.ok(found, "Expected rendered control"); return found; },
    copy: () => text(tree),
    customize() { f.find(node => node.type === "button" && node.props.className?.includes("qr-edit-button")).props.onClick(); f.flush(); },
    dispose: () => slots.forEach(slot => slot.cleanup?.())
  };
  f.render({ code: "QRG-SYNTHETIC-A", label: "Initial instrument", qrStyle: initialStyle, onStyleChange: value => styleChanges.push(value), showPrintHandout: false, ...extra });
  f.flush(); f.complete("data:image/png;base64,INITIAL_EXPORT"); return f;
}

test("same-code incoming style change hides the old export before passive synchronization", () => {
  const f = fixture(); assert.equal(f.downloads().length, 1);
  f.update({ qrStyle: { ...initialStyle, foreground: "#000000", labelText: "New saved label" } });
  assert.deepEqual(f.downloads(), []); f.flush(); assert.deepEqual(f.downloads(), []);
  f.complete("data:image/png;base64,NEW_STYLE"); assert.deepEqual(f.downloads(), ["data:image/png;base64,NEW_STYLE"]); f.dispose();
});

test("changing instruments never offers the previous instrument's PNG", () => {
  const f = fixture(); f.update({ code: "QRG-SYNTHETIC-B" }); assert.deepEqual(f.downloads(), []);
  f.flush(); f.complete("data:image/png;base64,INSTRUMENT_B");
  assert.deepEqual(f.downloads(), ["data:image/png;base64,INSTRUMENT_B"]);
  assert.equal(f.find(node => node.type === "a" && node.props.download).props.download, "qrguitar-QRG-SYNTHETIC-B.png"); f.dispose();
});

test("changed fallback instrument label invalidates the existing export immediately", () => {
  const f = fixture({ qrStyle: { ...initialStyle, labelText: "" } }); f.update({ label: "Renamed instrument" });
  assert.deepEqual(f.downloads(), []); f.flush(); f.complete("data:image/png;base64,RENAMED");
  assert.deepEqual(f.downloads(), ["data:image/png;base64,RENAMED"]); f.dispose();
});

test("local customization stays usable when the parent does not echo the changed style", () => {
  const f = fixture(); f.customize();
  f.find(node => node.type === "input" && node.props["aria-label"] === "QR module color").props.onChange({ target: { value: "#000000" } });
  f.flush(); assert.deepEqual(f.downloads(), []); assert.equal(f.styleChanges.at(-1).foreground, "#000000");
  f.complete("data:image/png;base64,LOCAL_STYLE"); assert.deepEqual(f.downloads(), ["data:image/png;base64,LOCAL_STYLE"]); f.dispose();
});

test("custom label input invalidates its prior PNG without waiting for a parent update", () => {
  const f = fixture(); f.customize(); f.find(node => node.type === "textarea").props.onChange({ target: { value: "Locally changed label" } });
  f.flush(); assert.deepEqual(f.downloads(), []); assert.equal(f.styleChanges.at(-1).labelText, "Locally changed label");
  f.complete("data:image/png;base64,LOCAL_LABEL"); assert.deepEqual(f.downloads(), ["data:image/png;base64,LOCAL_LABEL"]); f.dispose();
});

test("invalid incoming colors hide the old export and render a useful error", () => {
  const f = fixture(); const count = f.attempts.length;
  f.update({ qrStyle: { ...initialStyle, foreground: "#ffffff", background: "#ffffff" } }); assert.deepEqual(f.downloads(), []);
  f.flush(); assert.deepEqual(f.downloads(), []); assert.equal(f.attempts.length, count); assert.match(f.copy(), /too little contrast/); f.dispose();
});

function previewDom() {
  const saved = { document: globalThis.document, window: globalThis.window, HTMLElement: globalThis.HTMLElement };
  const elements = new Map();
  let renderedTree, shown = 0, closed = 0, drawerCloses = 0;
  const documentListeners = new Set(), drawerCleanups = [];
  class Element {
    isConnected = true;
    open = false;
    focus() { document.activeElement = this; }
    showModal() { this.open = true; shown += 1; }
    close() { this.open = false; closed += 1; }
    closest(selector) {
      const dialogNode = nodes(renderedTree, node => node.type === "dialog")[0];
      const dialog = dialogNode ? elementFor(dialogNode) : null;
      return selector === "dialog[open]" && dialog?.open && this !== opener ? dialog : null;
    }
    querySelectorAll() {
      const dialog = nodes(renderedTree, node => node.type === "dialog")[0];
      return nodes(dialog, node => node.type === "button" || node.type === "a").map(elementFor);
    }
  }
  const opener = new Element();
  globalThis.HTMLElement = Element;
  globalThis.document = {
    activeElement: opener, body: { style: { overflow: "hidden", paddingRight: "0px" } }, documentElement: { clientWidth: 1000 },
    addEventListener(name, fn) { if (name === "keydown") documentListeners.add(fn); },
    removeEventListener(name, fn) { if (name === "keydown") documentListeners.delete(fn); }
  };
  globalThis.window = { innerWidth: 1000, getComputedStyle: () => ({ paddingRight: "0px" }), addEventListener() {}, removeEventListener() {} };
  function elementFor(node) {
    const key = node.props["aria-label"] || node.props.className || node.type;
    if (!elements.has(key)) elements.set(key, key === "Open large QR preview" ? opener : new Element());
    return elements.get(key);
  }
  return {
    opener, elements,
    attachDrawer() {
      const panel = new Element();
      const { ActionDrawer } = compile("components/ActionDrawer.tsx", {
        react: {
          useState: () => [true, () => {}],
          useRef: () => ({ current: panel }),
          useEffect(run) { const cleanup = run(); if (cleanup) drawerCleanups.push(cleanup); }
        },
        "react-dom": { createPortal: children => children }
      });
      ActionDrawer({ title: "Synthetic Profile", children: null, returnFocusTo: opener, onClose: () => { drawerCloses += 1; } });
      opener.focus();
    },
    mount(tree) {
      renderedTree = tree;
      for (const node of nodes(tree, node => ["dialog", "button", "a"].includes(node.type))) {
        const element = elementFor(node);
        if (node.props.ref) node.props.ref.current = element;
      }
    },
    key(dialog, key, shiftKey = false) {
      const event = { key, shiftKey, currentTarget: elementFor(dialog), prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      dialog.props.onKeyDown(event);
      if (!event.stopped) documentListeners.forEach(listener => listener(event));
      return event;
    },
    drawerEscape() { documentListeners.forEach(listener => listener({ key: "Escape", preventDefault() {} })); },
    drawerEscapeFromPreview() { documentListeners.forEach(listener => listener({ key: "Escape", target: elements.get("Close QR preview"), preventDefault() {} })); },
    get drawerCloses() { return drawerCloses; },
    get shown() { return shown; },
    get closed() { return closed; },
    restore() {
      drawerCleanups.forEach(cleanup => cleanup());
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
      }
    }
  };
}

test("nested QR preview takes modal focus, traps its controls and consumes Escape before the Profile drawer", () => {
  const dom = previewDom();
  dom.attachDrawer();
  const f = fixture({}, dom);
  try {
    const originalDownload = f.downloads()[0];
    f.find(node => node.props["aria-label"] === "Open large QR preview").props.onClick(); f.flush();
    assert.equal(document.activeElement, dom.elements.get("Close QR preview"), "Opening the QR preview must move focus out of the drawer behind it");
    const dialog = f.find(node => node.type === "dialog" && node.props["aria-label"] === "QR preview");
    assert.equal(dom.shown, 1, "showModal gives the underlying drawer browser-enforced inertness");
    dom.drawerEscapeFromPreview();
    assert.equal(dom.drawerCloses, 0, "Even a document listener receiving the event must defer to an open native child dialog");
    assert.deepEqual(f.downloads(), [originalDownload, originalDownload]);
    const close = dom.elements.get("Close QR preview");
    const download = dom.elements.get("button qr-lightbox-download");
    const backwards = dom.key(dialog, "Tab", true);
    assert.equal(backwards.prevented, true); assert.equal(backwards.stopped, true); assert.equal(document.activeElement, download);
    const forwards = dom.key(dialog, "Tab");
    assert.equal(forwards.prevented, true); assert.equal(forwards.stopped, true); assert.equal(document.activeElement, close);
    const within = dom.key(dialog, "Tab");
    assert.equal(within.prevented, false); assert.equal(within.stopped, true, "Outer drawer must not handle a nested modal Tab");
    f.render(); f.flush(); assert.equal(dom.shown, 1, "An ordinary rerender must not reset modal focus");
    const escape = dom.key(dialog, "Escape");
    assert.equal(escape.prevented, true); assert.equal(escape.stopped, true, "Escape must not reach ActionDrawer's document listener");
    f.flush();
    assert.equal(dom.closed, 1); assert.equal(document.activeElement, dom.opener);
    assert.equal(dom.drawerCloses, 0, "The actual ActionDrawer document handler must leave the drawer open after nested Escape");
    assert.equal(document.body.style.overflow, "hidden", "Closing the nested preview preserves the outer drawer scroll lock");
    assert.deepEqual(f.downloads(), [originalDownload]);
    dom.drawerEscape(); assert.equal(dom.drawerCloses, 1, "A subsequent Escape outside the QR preview still closes the real drawer");
  } finally { f.dispose(); dom.restore(); }
});

test("QR preview native cancellation and render invalidation restore its opener without stale exports", () => {
  const dom = previewDom();
  const f = fixture({}, dom);
  try {
    const open = () => { f.find(node => node.props["aria-label"] === "Open large QR preview").props.onClick(); f.flush(); };
    open();
    let prevented = false, stopped = false;
    f.find(node => node.type === "dialog").props.onCancel({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    f.flush(); assert.equal(prevented, true); assert.equal(stopped, true); assert.equal(document.activeElement, dom.opener);
    open();
    f.update({ code: "QRG-NEXT-PROFILE" }); f.flush();
    assert.deepEqual(f.downloads(), []); assert.equal(dom.closed, 2); assert.equal(document.activeElement, dom.opener);
  } finally { f.dispose(); dom.restore(); }
});
