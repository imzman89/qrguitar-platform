import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react");
function compile(relative, bindings, overrides = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, "apps/web", relative), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", ...Object.keys(bindings), code)(name => overrides[name] || require(name), module, module.exports, ...Object.values(bindings));
  return module.exports;
}
const { publicProfileUrl } = compile("lib/profile-url.ts", {});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; }
}
function fixture(options = {}, sharedRuntime) {
  const f = { options, shares: [], copies: [], nodes: [], removed: [], copyCommands: [], focusRestores: [], timers: new Map(), writes: 0, prevented: 0, stopped: 0 };
  const values = [], effects = [];
  let cursor = 0, effectCursor = 0, dirty = true, mounted = true, now = 0, timerId = 0, tree;
  let props = { code: "QRG-A /1", title: "Test guitar", showLabel: true };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], next => { f.writes++; if (!Object.is(next, values[index])) { values[index] = next; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useEffect(run, deps) { const index = effectCursor++, previous = effects[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects[index] = { run, deps, cleanup: previous?.cleanup, pending: true }; }
  };
  const window = {
    matchMedia: options.noMatchMedia ? undefined : () => ({ matches: options.coarse ?? true }),
    setTimeout(fn, delay) { const id = ++timerId; f.timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { f.timers.delete(id); }
  };
  const document = {
    activeElement: null,
    createElement(tag) {
      assert.equal(tag, "textarea");
      const node = { value: "", style: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
        focus() { document.activeElement = this; }, select() { if (options.selectError) throw new Error("Selection failed"); this.selected = true; },
        setSelectionRange(start, end) { this.range = [start, end]; }
      }; return node;
    },
    body: { appendChild(node) { f.nodes.push(node); }, removeChild(node) { f.nodes.splice(f.nodes.indexOf(node), 1); f.removed.push(node); } },
    execCommand(command) { f.copyCommands.push(command); if (options.copyError) throw new Error("Copy denied"); return options.legacyCopy !== false; }
  };
  f.focused = { isConnected: true, focus(value) { f.focusRestores.push(value); document.activeElement = this; } };
  document.activeElement = f.focused;
  const navigator = {
    ...(options.share ? { share: data => { f.shares.push(data); return options.share(data); } } : {}),
    ...(options.noClipboard ? {} : { clipboard: { writeText: url => { f.copies.push(url); return options.clipboard ? options.clipboard(url) : Promise.resolve(); } } })
  };
  const runtime = sharedRuntime || { hooks, component: null };
  if (!runtime.component) {
    const dispatcher = Object.fromEntries(Object.keys(hooks).map(name => [name, (...args) => runtime.hooks[name](...args)]));
    runtime.component = compile("components/RecordShareButton.tsx", { window, document, navigator }, {
      react: dispatcher, "lucide-react": { Share2: () => null }, "../lib/profile-url": { publicProfileUrl }
    }).RecordShareButton;
  }
  const RecordShareButton = runtime.component;
  f.render = () => {
    assert.ok(mounted); dirty = true;
    while (dirty) {
      dirty = false; cursor = effectCursor = 0; runtime.hooks = hooks; tree = RecordShareButton(props);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); }
    }
    return tree;
  };
  f.click = () => find(f.render(), node => node.type === "button").props.onClick({ preventDefault() { f.prevented++; }, stopPropagation() { f.stopped++; } });
  f.feedback = () => find(f.render(), node => node.props?.role === "status")?.props.children;
  f.advance = ms => { now += ms; for (const [id, timer] of [...f.timers]) if (timer.at <= now) { f.timers.delete(id); timer.fn(); } };
  f.setProps = patch => { props = { ...props, ...patch }; f.render(); };
  f.mountSibling = patch => { const sibling = fixture(options, runtime); sibling.setProps(patch); return sibling; };
  f.replayEffects = () => { effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = effect.run(); }); };
  f.unmount = () => { effects.forEach(effect => effect.cleanup?.()); mounted = false; };
  f.document = document; f.render(); return f;
}

test("native success reports share opened and never claims or attempts clipboard copying", async () => {
  const f = fixture({ share: async () => {} }); await f.click();
  assert.deepEqual(f.shares, [{ title: "Test guitar", text: "QRguitar Profile for Test guitar", url: publicProfileUrl("QRG-A /1") }]);
  assert.equal(f.feedback(), "Share opened"); assert.equal(f.copies.length, 0); assert.equal(f.copyCommands.length, 0);
  assert.equal(f.prevented, 1); assert.equal(f.stopped, 1); f.advance(1400); assert.equal(f.feedback(), undefined); f.unmount();
});
test("native cancellation is quiet and releases the click lock for a later share", async () => {
  const options = { share: async () => { throw new DOMException("User dismissed", "AbortError"); } }, f = fixture(options);
  await f.click(); assert.equal(f.feedback(), undefined); assert.equal(f.timers.size, 0); assert.equal(f.copies.length, 0);
  options.share = async () => {}; await f.click(); assert.equal(f.shares.length, 2); assert.equal(f.feedback(), "Share opened"); f.unmount();
});
test("native failure retains the canonical Open link recovery without copying", async () => {
  const f = fixture({ share: async () => { throw new DOMException("Policy denied", "NotAllowedError"); } }); await f.click();
  const link = f.feedback(); assert.equal(link.type, "a"); assert.equal(link.props.children, "Open link"); assert.equal(link.props.href, publicProfileUrl("QRG-A /1"));
  assert.equal(f.copies.length, 0); f.advance(3199); assert.ok(f.feedback()); f.advance(1); assert.equal(f.feedback(), undefined); f.unmount();
});
for (const options of [{}, { share: async () => {}, coarse: false }, { share: async () => {}, noMatchMedia: true }]) test("clipboard success is reported only after writeText resolves: " + JSON.stringify(options), async () => {
  const gate = deferred(), f = fixture({ ...options, clipboard: () => gate.promise });
  const pending = f.click(); assert.equal(f.feedback(), undefined); assert.deepEqual(f.copies, [publicProfileUrl("QRG-A /1")]);
  gate.resolve(); await pending; assert.equal(f.feedback(), "Link copied"); assert.equal(f.shares.length, 0); assert.equal(f.nodes.length, 0); assert.equal(f.document.activeElement, f.focused); f.unmount();
});
for (const options of [{ noClipboard: true }, { clipboard: async () => { throw new Error("Clipboard denied"); } }]) test("legacy clipboard fallback removes its textarea and restores focus: " + JSON.stringify(options), async () => {
  const f = fixture(options); await f.click(); assert.equal(f.feedback(), "Link copied"); assert.deepEqual(f.copyCommands, ["copy"]);
  assert.equal(f.nodes.length, 0); assert.equal(f.removed.length, 1); const textarea = f.removed[0];
  assert.equal(textarea.value, publicProfileUrl("QRG-A /1")); assert.equal(textarea.attributes.readonly, "true"); assert.equal(textarea.selected, true); assert.deepEqual(textarea.range, [0, textarea.value.length]);
  assert.equal(f.document.activeElement, f.focused); assert.deepEqual(f.focusRestores, [{ preventScroll: true }]); f.unmount();
});
for (const options of [{ legacyCopy: false }, { copyError: true }, { selectError: true }]) test("failed fallback never claims copied and still cleans up focus: " + JSON.stringify(options), async () => {
  const f = fixture({ noClipboard: true, ...options }); await f.click(); assert.equal(f.feedback().props.children, "Open link");
  assert.equal(f.nodes.length, 0); assert.equal(f.removed.length, 1); assert.equal(f.document.activeElement, f.focused); f.unmount();
});
for (const native of [true, false]) test("rapid clicks start one pending operation: " + (native ? "native" : "clipboard"), async () => {
  const gate = deferred(), f = fixture(native ? { share: () => gate.promise } : { clipboard: () => gate.promise });
  const first = f.click(); await f.click(); await f.click(); assert.equal(f.shares.length + f.copies.length, 1);
  gate.resolve(); await first; await f.click(); assert.equal(f.shares.length + f.copies.length, 2); f.unmount();
});
test("a new click cancels the prior feedback timer and ignores its stale callback", async () => {
  const f = fixture(); await f.click(); const oldTimer = [...f.timers.values()][0]; f.advance(1000); await f.click();
  assert.equal(f.timers.size, 1); oldTimer.fn(); assert.equal(f.feedback(), "Link copied");
  f.advance(400); assert.equal(f.feedback(), "Link copied"); f.advance(1000); assert.equal(f.feedback(), undefined); f.unmount();
});
test("unmount clears feedback timers and ignores an already queued callback", async () => {
  const f = fixture(); await f.click(); const oldTimer = [...f.timers.values()][0]; f.unmount(); const writes = f.writes;
  assert.equal(f.timers.size, 0); oldTimer.fn(); assert.equal(f.writes, writes);
});
test("unmount before clipboard rejection prevents fallback DOM or focus changes", async () => {
  const gate = deferred(), f = fixture({ clipboard: () => gate.promise }); const pending = f.click(); f.unmount(); const writes = f.writes;
  gate.reject(new Error("Late denial")); await pending; assert.equal(f.nodes.length, 0); assert.equal(f.removed.length, 0); assert.equal(f.copyCommands.length, 0); assert.equal(f.focusRestores.length, 0); assert.equal(f.writes, writes);
});
test("unmount before native success prevents stale feedback and timers", async () => {
  const gate = deferred(), f = fixture({ share: () => gate.promise }); const pending = f.click(); f.unmount(); const writes = f.writes;
  gate.resolve(); await pending; assert.equal(f.writes, writes); assert.equal(f.timers.size, 0);
});
test("changing records preserves the native operation lock until the prior share settles", async () => {
  const a = deferred(), b = deferred(), f = fixture({ share: data => data.url.endsWith("SECOND") ? b.promise : a.promise });
  const first = f.click(); f.setProps({ code: "SECOND", title: "Second guitar" });
  const blocked = f.click(); assert.equal(f.shares.length, 1); await blocked;
  a.resolve(); await first; assert.equal(f.feedback(), undefined); assert.equal(f.shares.length, 1);
  const second = f.click(); await f.click(); assert.equal(f.shares.length, 2);
  b.resolve(); await second; assert.equal(f.feedback(), "Share opened"); assert.equal(f.shares[1].url, publicProfileUrl("SECOND")); assert.equal(f.shares[1].title, "Second guitar"); f.unmount();
});
test("changing records clears old feedback and uses the code when title is empty", async () => {
  const f = fixture({ share: async () => {} }); await f.click(); f.setProps({ code: "SECOND", title: "" });
  assert.equal(f.feedback(), undefined); assert.equal(f.timers.size, 0); await f.click(); assert.equal(f.shares[1].title, "SECOND"); f.unmount();
});

test("record changes cannot overlap clipboard writes or automatically copy a later record", async () => {
  const a = deferred(), b = deferred(); let clipboard = "";
  const f = fixture({ clipboard: async url => { await (url.endsWith("SECOND") ? b.promise : a.promise); clipboard = url; } });
  const first = f.click(); f.setProps({ code: "SECOND", title: "Second guitar" });
  const blocked = f.click(); assert.equal(f.copies.length, 1); assert.equal(clipboard, ""); await blocked;
  a.resolve(); await first; assert.equal(f.feedback(), undefined); assert.equal(clipboard, publicProfileUrl("QRG-A /1"));
  assert.equal(f.copies.length, 1, "settling must not autoqueue the second copy");
  const second = f.click(); await f.click(); assert.equal(f.copies.length, 2);
  b.resolve(); await second; assert.equal(clipboard, publicProfileUrl("SECOND")); assert.equal(f.feedback(), "Link copied"); f.unmount();
});
for (const native of [true, false]) test("effect cleanup/setup replay preserves an unresolved operation: " + (native ? "native" : "clipboard"), async () => {
  const gate = deferred(), f = fixture(native ? { share: () => gate.promise } : { clipboard: () => gate.promise });
  const first = f.click(); f.replayEffects(); const blocked = f.click(); assert.equal(f.shares.length + f.copies.length, 1); await blocked;
  gate.resolve(); await first; assert.equal(f.feedback(), undefined); assert.equal(f.timers.size, 0);
  await f.click(); assert.equal(f.shares.length + f.copies.length, 2); assert.equal(f.feedback(), native ? "Share opened" : "Link copied"); f.unmount();
});
for (const mode of ["clipboard", "native-failure", "native-cancel"]) test("stale failure releases only the operation lock after record change: " + mode, async () => {
  const gate = deferred();
  const f = fixture(mode === "clipboard" ? { clipboard: url => url.endsWith("SECOND") ? Promise.resolve() : gate.promise } : { share: data => data.url.endsWith("SECOND") ? Promise.resolve() : gate.promise });
  const first = f.click(); f.setProps({ code: "SECOND", title: "Second guitar" });
  const blocked = f.click(); assert.equal(f.shares.length + f.copies.length, 1); await blocked;
  gate.reject(mode === "native-cancel" ? new DOMException("Dismissed", "AbortError") : new Error("Late failure")); await first;
  assert.equal(f.feedback(), undefined); assert.equal(f.copyCommands.length, 0); assert.equal(f.focusRestores.length, 0);
  assert.equal(f.shares.length + f.copies.length, 1); await f.click(); assert.equal(f.shares.length + f.copies.length, 2);
  assert.equal(f.feedback(), mode === "clipboard" ? "Link copied" : "Share opened"); f.unmount();
});

for (const native of [true, false]) test("separate buttons share one browser operation lock: " + (native ? "native" : "clipboard"), async () => {
  const a = deferred(), b = deferred(); let clipboard = "";
  const firstButton = fixture(native
    ? { share: data => data.url.endsWith("SECOND") ? b.promise : a.promise }
    : { clipboard: async url => { await (url.endsWith("SECOND") ? b.promise : a.promise); clipboard = url; } });
  const secondButton = firstButton.mountSibling({ code: "SECOND", title: "Second guitar" });
  const first = firstButton.click(); const blocked = secondButton.click();
  try {
    assert.equal(firstButton.shares.length + firstButton.copies.length, 1);
    await blocked; assert.equal(secondButton.feedback(), undefined);
    a.resolve(); await first;
    assert.equal(firstButton.shares.length + firstButton.copies.length, 1, "settling never autoqueues the other button");
    assert.equal(firstButton.feedback(), native ? "Share opened" : "Link copied");
    assert.equal(secondButton.feedback(), undefined);
    const second = secondButton.click();
    assert.equal(firstButton.shares.length + firstButton.copies.length, 2);
    b.resolve(); await second;
    assert.equal(secondButton.feedback(), native ? "Share opened" : "Link copied");
    if (!native) assert.equal(clipboard, publicProfileUrl("SECOND"));
  } finally { a.resolve(); b.resolve(); await Promise.all([first, blocked]); firstButton.unmount(); secondButton.unmount(); }
});

for (const native of [true, false]) test("unmount/remount does not release a pending browser operation: " + (native ? "native" : "clipboard"), async () => {
  const gate = deferred();
  const firstButton = fixture(native
    ? { share: data => data.url.endsWith("SECOND") ? Promise.resolve() : gate.promise }
    : { clipboard: url => url.endsWith("SECOND") ? Promise.resolve() : gate.promise });
  const first = firstButton.click(); firstButton.unmount(); const writes = firstButton.writes;
  const secondButton = firstButton.mountSibling({ code: "SECOND", title: "Second guitar" });
  const blocked = secondButton.click();
  try {
    assert.equal(firstButton.shares.length + firstButton.copies.length, 1);
    await blocked; gate.resolve(); await first;
    assert.equal(firstButton.writes, writes); assert.equal(firstButton.timers.size, 0);
    assert.equal(secondButton.feedback(), undefined);
    assert.equal(firstButton.shares.length + firstButton.copies.length, 1);
    await secondButton.click(); assert.equal(firstButton.shares.length + firstButton.copies.length, 2);
    assert.equal(secondButton.feedback(), native ? "Share opened" : "Link copied");
  } finally { gate.resolve(); await Promise.all([first, blocked]); secondButton.unmount(); }
});
