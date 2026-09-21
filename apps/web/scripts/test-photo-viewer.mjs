import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
function compile(source, resolve = require) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)(resolve, module, module.exports);
  return module.exports;
}
const imageFallback = compile(read("lib/image-fallback.ts"));
const variants = compile(read("lib/public-media-variant.ts"));
const source = read("components/PhotoViewer.tsx");

function fixture(options = {}) {
  let cursor = 0, dirty = false, tree, pending = [], closes = 0, showCount = 0;
  const slots = [], errors = [], selected = [], preloads = [], nodes = new Map();
  class Element {
    isConnected = true;
    focus() { document.activeElement = this; }
    showModal() { showCount += 1; }
    close() {}
    scrollIntoView() {}
    querySelector() { return null; }
    querySelectorAll() { return controls(); }
    naturalWidth = 1600;
    naturalHeight = 1200;
  }
  const original = { document: globalThis.document, window: globalThis.window, HTMLElement: globalThis.HTMLElement };
  const trigger = new Element();
  globalThis.HTMLElement = Element;
  globalThis.document = { activeElement: trigger, body: { style: { overflow: "auto", paddingRight: "4px" } }, documentElement: { clientWidth: 984 } };
  globalThis.window = { innerWidth: 1000, getComputedStyle: () => ({ paddingRight: "4px" }), Image: class { constructor() { preloads.push(this); } } };
  const hooks = {
    useState(initial) {
      const id = cursor++;
      if (!(id in slots)) slots[id] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[id].value, (update) => { const value = typeof update === "function" ? update(slots[id].value) : update; if (!Object.is(slots[id].value, value)) { slots[id].value = value; dirty = true; } }];
    },
    useRef(initial) { const id = cursor++; if (!(id in slots)) slots[id] = { current: initial }; return slots[id]; },
    useEffect(run, deps) {
      const id = cursor++;
      if (!slots[id] || deps.some((dep, i) => !Object.is(dep, slots[id].deps[i]))) {
        const previous = slots[id];
        slots[id] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { previous?.cleanup?.(); slots[id].cleanup = run(); });
      }
    }
  };
  const Viewer = compile(source, (name) => {
    if (name === "react") return hooks;
    if (name.includes("image-fallback")) return imageFallback;
    if (name.includes("public-media-variant")) return variants;
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, prop) => String(prop) }) };
    return require(name);
  }).PhotoViewer;
  const props = { images: ["/first.jpg", "/second.jpg", "/third.jpg"], title: "Fender amplifier", onClose: () => { closes += 1; }, onImageError: (src) => errors.push(src), onIndexChange: (index) => selected.push(index), ...options };
  function all(node = tree) {
    if (!React.isValidElement(node)) return [];
    return [node, ...React.Children.toArray(node.props.children).flatMap((child) => all(child))];
  }
  function controls() {
    return all().filter((node) => node.type === "button").map((node) => {
      if (!nodes.has(node.props["aria-label"])) nodes.set(node.props["aria-label"], new Element());
      return nodes.get(node.props["aria-label"]);
    });
  }
  function render() {
    let count = 0;
    do {
      if (++count > 15) throw new Error("render loop");
      cursor = 0; dirty = false; pending = [];
      tree = Viewer(props);
      for (const node of all()) {
        const ref = node.props.ref;
        if (!ref) continue;
        if (!nodes.has(ref)) nodes.set(ref, new Element());
        ref.current = nodes.get(ref);
      }
      pending.forEach((run) => run());
    } while (dirty);
    return tree;
  }
  function button(label) { const node = all().find((item) => item.type === "button" && item.props["aria-label"] === label); assert.ok(node, label); return node; }
  function click(label) { button(label).props.onClick(); render(); }
  function key(value, shiftKey = false) { let prevented = false; tree.props.onKeyDown({ key: value, shiftKey, preventDefault() { prevented = true; } }); render(); return prevented; }
  function image() { return all().find((node) => node.type === "img" && node.props.className === "photo"); }
  function cleanup() {
    slots.forEach((slot) => slot?.cleanup?.());
    const restoredFocus = document.activeElement;
    const restoredStyle = { ...document.body.style };
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
    return { restoredFocus, restoredStyle };
  }
  render();
  return { render, button, click, key, image, cleanup, controls, props, trigger, errors, selected, preloads, get closes() { return closes; }, get tree() { return tree; }, get showCount() { return showCount; }, get loading() { return all().some((node) => node.props.role === "status"); } };
}

test("viewer opens chosen photo and keyboard wraps without reopening the modal or losing focus", () => {
  const f = fixture({ initialIndex: 2 });
  try {
    const focused = document.activeElement;
    assert.equal(f.image().props.src, "/third.jpg");
    assert.equal(f.key("ArrowRight"), true);
    assert.equal(f.image().props.src, "/first.jpg");
    assert.equal(f.key("ArrowLeft"), true);
    assert.equal(f.image().props.src, "/third.jpg");
    assert.deepEqual(f.selected, [0, 2]);
    assert.equal(f.showCount, 1);
    assert.equal(document.activeElement, focused);
    assert.ok(f.preloads.every((image) => image.fetchPriority === "low" && image.referrerPolicy === "no-referrer"));
  } finally { f.cleanup(); }
});

test("adjacent photo preload changes do not reset zoom or repeat for unchanged sources", () => {
  const f = fixture();
  try {
    f.click("Zoom into photo");
    const preloadCount = f.preloads.length;
    f.props.images = [...f.props.images]; f.render();
    assert.match(f.image().props.style.transform, /scale\(2\)/);
    assert.equal(f.preloads.length, preloadCount);
    f.props.images = ["/first.jpg", "/replacement.jpg", "/third.jpg"]; f.render();
    assert.equal(f.preloads.length, preloadCount + 1);
    assert.equal(f.preloads.at(-1).src, "/replacement.jpg");
    assert.match(f.image().props.style.transform, /scale\(2\)/);
    f.key("ArrowRight");
    assert.equal(f.image().props.src, "/replacement.jpg");
    assert.match(f.image().props.style.transform, /scale\(1\)/);
  } finally { f.cleanup(); }
});

test("modal locks page scrolling, traps Tab, restores original styles and opener focus", () => {
  const f = fixture();
  assert.equal(document.body.style.overflow, "hidden");
  assert.equal(document.body.style.paddingRight, "20px");
  const controls = f.controls();
  document.activeElement = controls.at(-1);
  assert.equal(f.key("Tab"), true);
  assert.equal(document.activeElement, controls[0]);
  assert.equal(f.key("Tab", true), true);
  assert.equal(document.activeElement, controls.at(-1));
  const result = f.cleanup();
  assert.deepEqual(result.restoredStyle, { overflow: "auto", paddingRight: "4px" });
  assert.equal(result.restoredFocus, f.trigger);
});

test("Escape, native cancellation and close control all dismiss the viewer", () => {
  const f = fixture();
  try {
    assert.equal(f.key("Escape"), true);
    let prevented = false;
    f.tree.props.onCancel({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    f.click("Close photos");
    assert.equal(f.closes, 3);
  } finally { f.cleanup(); }
});

test("swipe changes photo without zooming, while zoom resets when choosing another photo", () => {
  const f = fixture();
  try {
    const stage = { setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {}, getBoundingClientRect() { return { width: 800, height: 600 }; } };
    const pointer = (x, y = 20) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: stage });
    const photo = f.button("Zoom into photo");
    photo.props.onPointerDown(pointer(220));
    photo.props.onPointerMove(pointer(80));
    photo.props.onPointerUp(pointer(80));
    photo.props.onClick();
    f.render();
    assert.equal(f.image().props.src, "/second.jpg");
    assert.match(f.image().props.style.transform, /scale\(1\)/);
    f.click("Zoom in");
    assert.match(f.image().props.style.transform, /scale\(2\)/);
    f.click("Show photo 3");
    assert.equal(f.image().props.src, "/third.jpg");
    assert.match(f.image().props.style.transform, /scale\(1\)/);
  } finally { f.cleanup(); }
});

test("unavailable photos are skipped without displaying broken images and an empty viewer closes", () => {
  const f = fixture({ initialIndex: 1 });
  try {
    f.image().props.onError(); f.render();
    assert.equal(f.image().props.src, "/third.jpg");
    f.image().props.onError(); f.render();
    assert.equal(f.image().props.src, "/first.jpg");
    f.image().props.onError(); f.render();
    assert.equal(f.image(), undefined);
    assert.equal(f.closes, 1);
    assert.deepEqual(f.errors, ["/second.jpg", "/third.jpg", "/first.jpg"]);
  } finally { f.cleanup(); }
});

test("single-photo viewer hides navigation and preserves protected media URLs", () => {
  const protectedImage = "https://storage.example/photo.jpg?token=private";
  const f = fixture({ images: [protectedImage] });
  try {
    assert.equal(f.image().props.src, protectedImage);
    assert.equal(f.image().props.srcSet, undefined);
    assert.equal(f.image().props.referrerPolicy, "no-referrer");
    f.key("ArrowRight");
    assert.equal(f.image().props.src, protectedImage);
    assert.equal(f.selected.length, 0);
    assert.throws(() => f.button("Next photo"));
  } finally { f.cleanup(); }
});


test("portrait and landscape photos fit without cropping and zoom panning stays inside the image", () => {
  const css = read("components/PhotoViewer.module.css");
  assert.match(css, /\.viewer \.photo \{[^}]*object-fit: contain/);
  const f = fixture();
  try {
    f.click("Zoom in");
    const stage = { setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {}, getBoundingClientRect() { return { width: 800, height: 600 }; } };
    const pointer = (x, y) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: stage });
    const photo = f.button("Zoom out of photo");
    photo.props.onPointerDown(pointer(100, 100));
    photo.props.onPointerMove(pointer(4000, 4000));
    f.render();
    assert.equal(f.image().props.style.transform, "translate(400px, 300px) scale(2)");
    f.click("Zoom out"); f.click("Zoom in");
    f.image().props.ref.current.naturalWidth = 600;
    f.image().props.ref.current.naturalHeight = 1200;
    const portrait = f.button("Zoom out of photo");
    portrait.props.onPointerDown(pointer(100, 100));
    portrait.props.onPointerMove(pointer(4000, 4000));
    f.render();
    assert.equal(f.image().props.style.transform, "translate(0px, 300px) scale(2)");
  } finally { f.cleanup(); }
});


test("loading feedback follows the selected photo and survives a late load or failed source", () => {
  const f = fixture();
  try {
    assert.equal(f.loading, true);
    const first = f.image();
    first.props.onLoad(); f.render();
    assert.equal(f.loading, false);
    f.click("Next photo");
    assert.equal(f.loading, true);
    first.props.onLoad(); f.render();
    assert.equal(f.loading, true, "a prior photo loading must not dismiss current feedback");
    f.image().props.onError(); f.render();
    assert.equal(f.image().props.src, "/third.jpg");
    assert.equal(f.loading, true);
    f.image().props.onLoad(); f.render();
    assert.equal(f.loading, false);
    assert.deepEqual(f.errors, ["/second.jpg"]);
  } finally { f.cleanup(); }
});
