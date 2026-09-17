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
function fixture(extra = {}) {
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
    render(next = props) { props = next; cursor = 0; pending = []; dirty = false; tree = QrDownload(props); return tree; },
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
