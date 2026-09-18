import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function loader() {
  const cache = new Map();
  function load(relative, overrides = {}, bindings = {}) {
    const file = path.resolve(root, relative);
    if (!Object.keys(overrides).length && cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    new Function("require", "module", "exports", ...Object.keys(bindings), code)(name => {
      if (name in overrides) return overrides[name];
      return name.startsWith(".") ? load(path.resolve(path.dirname(file), name) + ".ts") : require(name);
    }, module, module.exports, ...Object.values(bindings));
    if (!Object.keys(overrides).length) cache.set(file, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const settings = load("apps/web/lib/site-settings.ts");
const review = load("apps/web/lib/site-editor-review.ts");
test("change review includes content, theme, logos, composition and SEO without mirrored duplicates", () => {
  const live = structuredClone(settings.defaultSiteSettings);
  const draft = structuredClone(live);
  draft.content["home.hero.headline"] = "A reviewed headline";
  draft.hero.headline = "A reviewed headline";
  draft.colors.gold = "#abcdef";
  draft.brandLogos.fender = "/brands/fender.svg";
  draft.composition.home.sections[1].visible = !draft.composition.home.sections[1].visible;
  draft.seo.twitterHandle = "@qrguitarpreview";
  const changes = review.settingsChangeReview(draft, live);
  const keys = changes.map(change => change.key);
  assert.ok(keys.includes("content.home.hero.headline"));
  assert.ok(keys.includes("colors.gold"));
  assert.ok(keys.includes("brandLogos.fender"));
  assert.ok(keys.includes("composition.home"));
  assert.ok(keys.includes("seo.twitterHandle"));
  assert.equal(keys.includes("hero.headline"), false);
  assert.deepEqual(new Set(changes.map(change => change.category)), new Set(["Content", "Theme", "Brand assets", "Composition", "SEO"]));
});
test("brand logo URLs permit only HTTPS or one-slash site-relative paths", () => {
  for (const value of ["https://assets.example.test/logo.svg", "/brands/logo.svg", "/brands/logo.svg?v=2"]) {
    assert.equal(settings.isSafeBrandLogoUrl(value), true, value);
  }
  for (const value of ["http://assets.example.test/logo.svg", "//assets.example.test/logo.svg", "javascript:alert(1)", "data:image/svg+xml,bad", "/brands\\logo.svg", "https://user:secret@example.test/logo.svg"]) {
    assert.equal(settings.isSafeBrandLogoUrl(value), false, value);
  }
  assert.deepEqual(settings.normalizeBrandLogos({ safe: "/brands/logo.svg", remote: "https://assets.example.test/logo.svg", insecure: "http://assets.example.test/logo.svg", protocolRelative: "//assets.example.test/logo.svg" }), {
    safe: "/brands/logo.svg",
    remote: "https://assets.example.test/logo.svg"
  });
});
test("saved beta allowance copy upgrades to five without changing the 25-credit pack", () => {
  const saved = settings.mergeSiteSettings({
    composition: { home: { sections: [{
      id: "pricing", name: "Pricing", visible: true, blocks: [{
        id: "home-price-beta", name: "Owners", title: "Our owner plan", visible: true,
        body: "Create up to 25 Profiles with photos. Additional 25 Profiles cost $99.",
        items: ["Up to 25 Profiles", "25 free owned Profiles", "25 Profile credits for $99"]
      }]
    }] } },
    content: { "pricing.beta.body": "Create up to 25 Profiles with photos, specifications, privacy controls, history, and downloadable QR codes." }
  });
  const block = saved.composition.home.sections.find(section => section.id === "pricing").blocks[0];
  assert.equal(block.title, "Our owner plan");
  assert.equal(block.body, "Create up to 5 Profiles with photos. Additional 25 Profiles cost $99.");
  assert.deepEqual(block.items, ["Up to 5 Profiles", "5 free owned Profiles", "25 Profile credits for $99"]);
  assert.match(saved.content["pricing.beta.body"], /up to 5 Profiles/);
  assert.doesNotMatch(JSON.stringify(settings.defaultSiteSettings), /up to 25 Profiles/i);
});
const defaults = page => structuredClone(settings.defaultEditorialComposition[page].sections);
const ids = sections => sections.map(section => section.id);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => nodes(child, predicate))];
}
function event(data = new Map()) {
  return {
    data, stopped: false, prevented: false, target: null, currentTarget: null,
    dataTransfer: {
      setData(key, value) { data.set(key, value); }, getData(key) { return data.get(key) || ""; },
      effectAllowed: "uninitialized"
    },
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }
  };
}
function dispatch(name, chain, e = event()) {
  e.stopped = false; e.prevented = false; e.target = chain[0];
  for (const node of chain) {
    e.currentTarget = node; node.props[name]?.(e);
    if (e.stopped) break;
  }
  return e;
}
function fixture(options = {}) {
  const changes = [], confirmations = [], values = [], effects = [];
  let cursor = 0, effectCursor = 0, dirty = true, tree;
  let props = { pageKey: options.pageKey || "home", sections: options.sections || defaults(options.pageKey || "home") };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => {
        const value = typeof next === "function" ? next(values[index]) : next;
        if (!Object.is(value, values[index])) { values[index] = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useEffect(run, deps) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects[index] = { run, deps, pending: true };
    }
  };
  props.onChange = sections => { changes.push(sections); props = { ...props, sections }; dirty = true; };
  const { SiteCompositionEditor } = load("apps/web/components/SiteCompositionEditor.tsx", {
    react: hooks, "../lib/site-settings": settings
  }, { window: { confirm(message) { confirmations.push(message); return options.confirm !== false; } } });
  function render() {
    let renders = 0;
    while (dirty) {
      assert.ok(++renders < 20, "effects must settle");
      dirty = false; cursor = effectCursor = 0; tree = SiteCompositionEditor(props);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.run(); }
    }
    return tree;
  }
  function section(id) {
    const article = nodes(render(), node => node.type === "article" && String(node.key).endsWith("$" + id))[0];
    assert.ok(article, "section " + id + " exists"); return article;
  }
  const openButton = id => nodes(section(id), node => node.props?.className === "cms-section-open")[0];
  function open(id) { const button = openButton(id); if (!button.props["aria-expanded"]) button.props.onClick(); render(); }
  function row(sectionId, blockId) {
    const found = nodes(section(sectionId), node => node.type === "button" && node.props?.draggable && String(node.key).endsWith("$" + blockId))[0];
    assert.ok(found, "block " + blockId + " is visible"); return found;
  }
  function byLabel(label, from = render()) {
    const found = nodes(from, node => node.type === "button" && node.props["aria-label"] === label)[0];
    assert.ok(found, label + " exists"); return found;
  }
  function action(label, id) {
    const found = nodes(section(id), node => node.type === "button" && React.Children.toArray(node.props.children).some(child => child === label || child === " " + label))[0];
    assert.ok(found, label + " action exists"); return found;
  }
  return {
    render, section, row, open, openButton, byLabel, action, changes, confirmations,
    get sections() { return props.sections; },
    setProps(patch) { props = { ...props, ...patch }; dirty = true; render(); },
    blockOrder(id) { return props.sections.find(section => section.id === id).blocks.map(block => block.id); },
    selected(id) { return nodes(section(id), node => node.props?.className === "cms-focused-block")[0]?.props["aria-label"]; }
  };
}

test("actual block drag emits one update, reorders only its blocks and retains selection", () => {
  const f = fixture(); f.open("lifecycle");
  const source = f.row("lifecycle", "home-step-identity");
  source.props.onClick(); f.render();
  const e = dispatch("onDragStart", [source, f.section("lifecycle")]);
  assert.equal(e.data.has("text/cms-section"), false);
  dispatch("onDrop", [f.row("lifecycle", "home-step-share"), f.section("lifecycle")], e);
  assert.equal(f.changes.length, 1);
  assert.deepEqual(f.blockOrder("lifecycle"), ["home-step-history", "home-step-share", "home-step-identity"]);
  assert.deepEqual(ids(f.sections), ids(defaults("home")));
  assert.equal(f.selected("lifecycle"), "Edit Identify");
});

test("a block dropped on another section header cannot move either section", () => {
  const f = fixture(); f.open("lifecycle");
  const before = structuredClone(f.sections);
  const e = dispatch("onDragStart", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")]);
  dispatch("onDrop", [f.section("anatomy")], e);
  assert.deepEqual(f.sections, before); assert.equal(f.changes.length, 0);
});

test("a section drag reorders sections once without changing blocks", () => {
  const f = fixture(), beforeBlocks = f.sections.map(section => [section.id, section.blocks]);
  const e = dispatch("onDragStart", [f.section("lifecycle")]);
  dispatch("onDrop", [f.section("anatomy")], e);
  assert.equal(f.changes.length, 1);
  assert.deepEqual(ids(f.sections).slice(0, 4), ["hero", "archive", "anatomy", "lifecycle"]);
  for (const [id, blocks] of beforeBlocks) assert.deepEqual(f.sections.find(section => section.id === id).blocks, blocks);
});

test("section drag dropped on a content row does not become a block operation", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.section("anatomy")]);
  dispatch("onDrop", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")], e);
  assert.equal(f.changes.length, 0);
});

test("same-target drops and arrow bounds do not emit duplicate updates", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.row("lifecycle", "home-step-identity"), f.section("lifecycle")]);
  dispatch("onDrop", [f.row("lifecycle", "home-step-identity"), f.section("lifecycle")], e);
  f.action("Move up", "lifecycle").props.onClick();
  assert.equal(f.changes.length, 0);
});

for (const [type, value] of [
  ["text/plain", "Dragged external text"], ["text/cms-section", ""], ["text/cms-section", "999"],
  ["text/cms-section", "-1"], ["text/cms-section", "NaN"], ["text/cms-section", "1.5"],
  ["text/cms-block", "{"], ["text/cms-block", "null"], ["text/cms-block", "[]"],
  ["text/cms-block", JSON.stringify({ sectionIndex: 2, blockIndex: 999 })]
]) test("external or malformed drop is a no-op: " + type + " " + value, () => {
  const f = fixture(); f.open("lifecycle");
  const e = event(new Map([[type, value]]));
  dispatch("onDrop", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")], e);
  dispatch("onDrop", [f.section("anatomy")], e);
  assert.equal(f.changes.length, 0); assert.doesNotThrow(f.render);
});

test("tampering with an active payload cannot insert an undefined block", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")]);
  e.data.set("text/cms-block", JSON.stringify({ sectionIndex: 2, blockIndex: 999 }));
  dispatch("onDrop", [f.row("lifecycle", "home-step-share"), f.section("lifecycle")], e);
  assert.equal(f.changes.length, 0); assert.doesNotThrow(f.render);
});

test("a retired drag payload cannot be replayed or used by another editor", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")]);
  dispatch("onDragEnd", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")], e);
  dispatch("onDrop", [f.row("lifecycle", "home-step-share"), f.section("lifecycle")], e);
  const other = fixture(); other.open("lifecycle");
  dispatch("onDrop", [other.row("lifecycle", "home-step-share"), other.section("lifecycle")], e);
  assert.equal(f.changes.length, 0); assert.equal(other.changes.length, 0);
});

test("a page change rejects old section identities and resets the open section", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.section("lifecycle")]);
  f.setProps({ pageKey: "howItWorks", sections: defaults("howItWorks") });
  dispatch("onDrop", [f.section("features")], e);
  assert.equal(f.changes.length, 0);
  assert.equal(f.openButton("hero").props["aria-expanded"], true);
});

test("a replacement draft invalidates a pending drag even when page and IDs match", () => {
  const f = fixture(); f.open("lifecycle");
  const e = dispatch("onDragStart", [f.row("lifecycle", "home-step-history"), f.section("lifecycle")]);
  const replacement = structuredClone(f.sections);
  replacement[2].blocks[1].body = "Newer draft content";
  f.setProps({ sections: replacement });
  dispatch("onDrop", [f.row("lifecycle", "home-step-share"), f.section("lifecycle")], e);
  assert.equal(f.changes.length, 0); assert.equal(f.sections[2].blocks[1].body, "Newer draft content");
});

test("drag data read failure is ignored without changing or crashing the draft", () => {
  const f = fixture();
  const e = dispatch("onDragStart", [f.section("lifecycle")]);
  e.dataTransfer.getData = () => { throw new Error("Unavailable"); };
  assert.doesNotThrow(() => dispatch("onDrop", [f.section("anatomy")], e));
  assert.equal(f.changes.length, 0);
});

test("required sections cannot move, be targets, or be crossed", () => {
  const sections = defaults("home"); sections[3].locked = true;
  const f = fixture({ sections });
  let e = dispatch("onDragStart", [f.section("hero")]);
  dispatch("onDrop", [f.section("lifecycle")], e);
  e = dispatch("onDragStart", [f.section("lifecycle")]);
  dispatch("onDrop", [f.section("hero")], e);
  e = dispatch("onDragStart", [f.section("lifecycle")]);
  dispatch("onDrop", [f.section("roles")], e);
  f.byLabel("Move Profile lifecycle down").props.onClick();
  assert.equal(f.changes.length, 0); assert.deepEqual(ids(f.sections), ids(sections));
});

test("dragging native selected input content cannot start an article drag", () => {
  const f = fixture(); f.open("lifecycle");
  const input = nodes(f.section("lifecycle"), node => node.type === "input")[0];
  const e = dispatch("onDragStart", [input, f.section("lifecycle")]);
  dispatch("onDrop", [f.section("anatomy")], e);
  assert.equal(f.changes.length, 0);
});

test("first and later sections can be collapsed without reopening a different section", () => {
  const f = fixture();
  f.openButton("hero").props.onClick(); f.render();
  assert.equal(f.openButton("hero").props["aria-expanded"], false);
  f.open("lifecycle"); f.openButton("lifecycle").props.onClick(); f.render();
  assert.equal(f.openButton("lifecycle").props["aria-expanded"], false);
  assert.equal(f.openButton("hero").props["aria-expanded"], false);
});

test("section replacement chooses a supported section; typing does not reset selection", () => {
  const f = fixture(); f.open("lifecycle");
  f.row("lifecycle", "home-step-history").props.onClick(); f.render();
  const title = nodes(f.section("lifecycle"), node => node.type === "input" && node.props.value === "Document")[1];
  title.props.onChange({ target: { value: "Updated history" } }); f.render();
  assert.equal(f.selected("lifecycle"), "Edit Document");
  f.setProps({ sections: f.sections.filter(section => section.id !== "lifecycle") });
  assert.equal(f.openButton("hero").props["aria-expanded"], true);
});

test("protected removal stays disabled and its handler cannot delete the block", () => {
  const f = fixture(); f.open("lifecycle");
  const remove = f.action("Remove", "lifecycle");
  assert.equal(remove.props.disabled, true); remove.props.onClick();
  assert.equal(f.changes.length, 0); assert.equal(f.confirmations.length, 0);
});

test("confirmed removal changes only the selected unprotected block and leaves a usable selection", () => {
  const f = fixture(); f.open("lifecycle");
  f.row("lifecycle", "home-step-history").props.onClick(); f.render();
  f.action("Remove", "lifecycle").props.onClick(); f.render();
  assert.deepEqual(f.blockOrder("lifecycle"), ["home-step-identity", "home-step-share"]);
  assert.equal(f.selected("lifecycle"), "Edit Identify"); assert.equal(f.confirmations.length, 1);
});

test("cancelled section reset and block removal preserve all draft edits", () => {
  const f = fixture({ confirm: false }); f.open("lifecycle");
  f.row("lifecycle", "home-step-history").props.onClick(); f.render();
  f.action("Remove", "lifecycle").props.onClick();
  f.byLabel("Reset Profile lifecycle").props.onClick();
  assert.equal(f.changes.length, 0); assert.equal(f.confirmations.length, 2);
});

test("confirmed section reset restores approved content and selects its first block", () => {
  const sections = defaults("home");
  sections[2].visible = false; sections[2].blocks.push({ id: "custom", name: "Custom", title: "Custom", body: "Custom body", visible: true });
  const f = fixture({ sections }); f.open("lifecycle");
  f.row("lifecycle", "custom").props.onClick(); f.render();
  f.byLabel("Reset Profile lifecycle").props.onClick(); f.render();
  assert.deepEqual(f.sections[2], defaults("home")[2]);
  assert.equal(f.selected("lifecycle"), "Edit Identify");
  assert.notEqual(f.sections[2], settings.defaultEditorialComposition.home.sections[2]);
});

test("resetting a collapsed sibling keeps the open section's selected block", () => {
  const f = fixture(); f.open("lifecycle");
  f.row("lifecycle", "home-step-history").props.onClick(); f.render();
  f.byLabel("Reset Profile anatomy").props.onClick(); f.render();
  assert.equal(f.openButton("lifecycle").props["aria-expanded"], true);
  assert.equal(f.selected("lifecycle"), "Edit Document");
});

test("section-arrow order survives actual server/client settings normalization", () => {
  const f = fixture();
  f.byLabel("Move Profile lifecycle up").props.onClick();
  assert.deepEqual(ids(f.sections).slice(0, 4), ["hero", "lifecycle", "archive", "anatomy"]);
  const submitted = { ...settings.defaultSiteSettings, composition: { ...settings.defaultEditorialComposition, home: { sections: f.sections } } };
  assert.deepEqual(settings.validateEditorialComposition(submitted.composition), {});
  const serverSnapshot = settings.mergeSiteSettings(submitted);
  const restored = settings.mergeSiteSettings(JSON.parse(JSON.stringify(serverSnapshot)));
  assert.deepEqual(ids(restored.composition.home.sections), ids(f.sections));
  f.setProps({ sections: restored.composition.home.sections });
  assert.equal(f.changes.length, 1);
});

test("normalization preserves supported custom order and fills missing sections exactly once", () => {
  const sections = defaults("home");
  const custom = { ...sections[2], name: "Custom lifecycle" };
  const candidate = { home: { sections: [sections[4], custom, { id: "foreign", blocks: [] }, { ...custom, name: "Last duplicate wins" }, sections[0]] } };
  const result = settings.normalizeEditorialComposition(candidate);
  assert.deepEqual(ids(result.home.sections), ["hero", "roles", "lifecycle", "archive", "anatomy", "continuity", "pricing", "finalCta"]);
  assert.equal(result.home.sections[2].name, "Last duplicate wins");
  assert.equal(new Set(ids(result.home.sections)).size, defaults("home").length);
  assert.deepEqual(settings.validateEditorialComposition(result), {});
});

test("normalization anchors every default locked slot and retains hidden/protected validation", () => {
  const isolated = loader()("apps/web/lib/site-settings.ts");
  isolated.defaultEditorialComposition.home.sections[3].locked = true;
  const candidate = structuredClone(isolated.defaultEditorialComposition);
  candidate.home.sections.reverse();
  candidate.home.sections.find(section => section.id === "hero").locked = false;
  candidate.home.sections.find(section => section.id === "hero").visible = false;
  candidate.home.sections.find(section => section.id === "lifecycle").blocks.shift();
  const result = isolated.normalizeEditorialComposition(candidate);
  assert.equal(result.home.sections[0].id, "hero"); assert.equal(result.home.sections[0].locked, true);
  assert.equal(result.home.sections[3].id, "anatomy"); assert.equal(result.home.sections[3].locked, true);
  const errors = isolated.validateEditorialComposition(result);
  assert.match(errors["composition.home.hero"], /required section/);
  assert.match(errors["composition.home.lifecycle.blocks"], /Protected block/);
});
