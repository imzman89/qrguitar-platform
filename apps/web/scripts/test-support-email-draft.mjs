import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function transpile(relative) {
  const result = ts.transpileModule(fs.readFileSync(path.join(web, relative), "utf8"), {
    fileName: relative, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  });
  assert.equal((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  return result.outputText;
}
function load(relative, dependencies = {}, fetcher = () => { throw new Error("Live network disabled by fixture"); }) {
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "crypto", transpile(relative))(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports, fetcher, { randomUUID: () => "b93276e0-471a-4a2d-8b20-3df1c3d8d389" });
  return module.exports;
}
const helper = load("lib/support-email-draft.ts");
const copy = {
  subject: "QRguitar support", name: "Name", email: "Email", topic: "Topic", message: "Message",
  heading: "Prepare a support email", intro: "Not submitted", security: "Do not send passwords", general: "General support",
  prepare: "Prepare email draft", prepared: "Nothing has been sent", open: "Open email draft", manual: "Copy to email",
  longDraft: "Copy long draft", noScript: "Needs JavaScript", required: "Required fields", invalidEmail: "Invalid email", tooLong: "Too long",
  send: "Send to support", sending: "Sending", accepted: "Provider accepted; not inbox delivery", unconfirmed: "Unknown; no automatic retry", rejected: "Not accepted", unavailable: "Unavailable", limited: "Rate limited", website: "Leave empty"
};
const fields = { name: "Synthetic tester", email: "fixture@example.invalid", topic: "Profile", message: "Synthetic help request" };
const jsx = (type, props) => ({ type, props: props || {} });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "fragment" };
function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function fixture(fetcher) {
  let slots = [], cursor = 0, effects = [], tree, focuses = 0;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useId() { return "fixture-id"; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(callback, deps) { const index = cursor++; if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) effects.push(callback); slots[index] = deps; }
  };
  const { ContactEmailDraft } = load("app/contact/ContactEmailDraft.tsx", {
    react, "react/jsx-runtime": jsxRuntime, "../../lib/support-email-draft": helper, "./contact.module.css": { default: {} }
  }, fetcher);
  const render = () => { cursor = 0; tree = ContactEmailDraft({ copy, topics: [{ id: "profile", title: "Profile" }] }); elements(tree).filter(node => node.props.ref).forEach(node => { node.props.ref.current = { focus() { focuses++; } }; }); return tree; };
  const flush = () => { for (let i = 0; i < 4; i++) { const pending = effects; effects = []; pending.forEach(callback => callback()); render(); if (!effects.length) break; } };
  render();
  return {
    nodes: () => elements(tree), flush,
    field(suffix, value) { elements(tree).find(node => node.props.id === `fixture-id-${suffix}`).props.onChange({ target: { value } }); render(); flush(); },
    prepare() { let prevented = false; elements(tree).find(node => node.type === "button" && node.props.children === copy.prepare).props.onClick({ preventDefault() { prevented = true; } }); render(); flush(); assert.equal(prevented, true); },
    async send() { const pending = elements(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); render(); flush(); await pending; render(); flush(); },
    focuses: () => focuses
  };
}

test("draft uses the existing fixed recipient and all four fields", () => {
  const result = helper.buildSupportEmailDraft(fields, copy);
  assert.equal(result.ok, true);
  const url = new URL(result.draft.href);
  assert.equal(url.pathname, "support@qrguitar.com");
  assert.equal(url.searchParams.get("subject"), "QRguitar support: Profile");
  Object.values(fields).forEach(value => assert.ok(url.searchParams.get("body").includes(value)));
});
test("user delimiters cannot create recipients, headers, or extra query fields", () => {
  const result = helper.buildSupportEmailDraft({ ...fields, topic: "Profile\r\nBcc: other@example.invalid", message: "&cc=other@example.invalid#\n<script>fixture</script>" }, copy);
  const url = new URL(result.draft.href);
  assert.equal(url.pathname, helper.supportEmailAddress);
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  assert.equal(url.hash, "");
  assert.ok(!/[\r\n]/.test(url.searchParams.get("subject")));
  assert.ok(result.draft.body.includes("<script>fixture</script>"));
});
test("missing, whitespace, invalid email and bounded inputs return honest errors", () => {
  for (const key of ["name", "email", "topic", "message"]) assert.deepEqual(helper.buildSupportEmailDraft({ ...fields, [key]: "   " }, copy), { ok: false, error: "required" });
  for (const email of ["fixture", "a@b\nBcc:x", "a b@example.invalid"]) assert.deepEqual(helper.buildSupportEmailDraft({ ...fields, email }, copy), { ok: false, error: "invalidEmail" });
  for (const key of Object.keys(helper.supportDraftLimits)) assert.deepEqual(helper.buildSupportEmailDraft({ ...fields, [key]: "a".repeat(helper.supportDraftLimits[key] + 1) }, copy), { ok: false, error: "tooLong" });
});
test("long and malformed Unicode drafts retain complete copyable text without a broken link", () => {
  const message = "🎸".repeat(800);
  const result = helper.buildSupportEmailDraft({ ...fields, message }, copy);
  assert.equal(result.ok, true); assert.equal(result.draft.href, null); assert.ok(result.draft.body.endsWith(message));
  assert.doesNotThrow(() => helper.buildSupportEmailDraft({ ...fields, message: "partial\ud800character\udc00" }, copy));
});
test("component disables pre-hydration controls and never serializes private fields", () => {
  const h = fixture();
  assert.equal(h.nodes().find(node => node.type === "fieldset").props.disabled, true);
  h.nodes().filter(node => ["input", "textarea", "select"].includes(node.type)).forEach(node => assert.equal(node.props.name, undefined));
  assert.ok(h.nodes().some(node => node.type === "noscript"));
  h.flush(); assert.equal(h.nodes().find(node => node.type === "fieldset").props.disabled, false);
  const labels = h.nodes().filter(node => node.type === "label");
  labels.forEach(label => assert.ok(h.nodes().some(node => node.props.id === label.props.htmlFor)));
});
test("component prepares without sending, uses visible CMS topics, focuses output and invalidates stale draft", () => {
  const h = fixture(); h.flush();
  for (const [key, value] of Object.entries({ ...fields, topic: "profile" })) h.field(key, value);
  h.prepare();
  const link = h.nodes().find(node => node.type === "a" && node.props.children === copy.open);
  assert.equal(new URL(link.props.href).searchParams.get("subject"), "QRguitar support: Profile");
  assert.ok(h.nodes().some(node => node.props.role === "status" && node.props.children === copy.prepared));
  assert.ok(h.focuses() > 0);
  h.field("message", "Changed synthetic message");
  assert.equal(h.nodes().find(node => node.type === "a" && node.props.children === copy.open), undefined);
});
test("component exposes validation errors and complete manual-copy long-message fallback", () => {
  const h = fixture(); h.flush(); h.prepare();
  assert.ok(h.nodes().some(node => node.props.role === "alert" && node.props.children === copy.required));
  for (const [key, value] of Object.entries({ ...fields, topic: "", message: "🎸".repeat(800) })) h.field(key, value);
  h.prepare();
  assert.equal(h.nodes().find(node => node.type === "a" && node.props.children === copy.open), undefined);
  const output = h.nodes().find(node => node.type === "textarea" && node.props.readOnly);
  assert.ok(output.props.value.endsWith("🎸".repeat(800)));
  let selected = false; output.props.onFocus({ currentTarget: { select() { selected = true; } } }); assert.equal(selected, true);
});
test("server page preserves CMS composition and passes only resolved labels and visible topic titles", async () => {
  const getContentValue = (_, key) => key;
  const settings = { content: {}, composition: { contact: { sections: [{ id: "hero", visible: true }, { id: "categories", blocks: [{ id: "visible", title: "Visible CMS topic", visible: true }, { id: "hidden", title: "Hidden", visible: false }] }] } } };
  const { default: Page } = load("app/contact/page.tsx", {
    "react/jsx-runtime": jsxRuntime, "../../lib/ui-text": { createUiText: () => (_, source) => source },
    "./ContactEmailDraft": { ContactEmailDraft: "draft-component" }, "./contact.module.css": { default: {} },
    "lucide-react": { ArrowUpRight: "arrow" }, "../../components/EditorialIcon": { EditorialIcon: "icon" },
    "../../components/Footer": { Footer: "footer" }, "../../components/Nav": { Nav: "nav" },
    "../../lib/content-registry": { getContentValue }, "../../lib/site-settings-server": { loadPublishedSiteSettings: async () => settings },
    "../../lib/site-metadata": { buildManagedPageMetadata() {} }
  });
  const nodes = elements(await Page()), component = nodes.find(node => node.type === "draft-component");
  assert.deepEqual(component.props.topics, [{ id: "visible", title: "Visible CMS topic" }]);
  Object.keys(copy).forEach(key => assert.equal(typeof component.props.copy[key], "string"));
  assert.equal(component.props.copy.security, "contact.support.securityGuidance");
  assert.equal(component.props.content, undefined);
  assert.ok(nodes.some(node => node.type === "a" && node.props.href === "mailto:support@qrguitar.com"));
});
test("installer requirement template fills six existing details and explicitly requires manual sending", () => {
  const source = fs.readFileSync(path.join(web, "app/installers/page.tsx"), "utf8");
  const requirements = [...source.match(/const providerRequirements = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.equal(requirements.length, 6);
  const draft = helper.buildInstallerEmailDraft("QRguitar Provider Network Application", requirements, "Nothing submitted; send yourself.");
  const body = new URL(draft.href).searchParams.get("body");
  requirements.forEach(requirement => assert.ok(body.includes(`${requirement}: `)));
  assert.equal((source.match(/href=\{applicationHref\}/g) || []).length, 2);
  assert.match(source, /Opening a draft does not submit an application/);
  assert.match(source, /applying does not approve or publish your business/);
});
test("new client has one contact endpoint and no persistence, analytics, registry or automatic navigation dependency", () => {
  const source = fs.readFileSync(path.join(web, "app/contact/ContactEmailDraft.tsx"), "utf8");
  assert.doesNotMatch(source, /XMLHttpRequest|localStorage|sessionStorage|sendBeacon|window\.open|location\.|content-registry|ui-text-registry|supabase|Brevo|writeText/);
  assert.equal((source.match(/fetch\(/g) || []).length, 1);
  assert.match(source, /fetch\("\/api\/contact"/);
  transpile("app/installers/page.tsx");
});

for (const outcome of ["accepted", "unknown", "rejected", "missing", "network", "invalid-response", "limited"]) {
  test(`direct-contact client preserves text and truth for ${outcome}; no automatic retry`, async () => {
    let calls = 0;
    const h = fixture(async () => { calls++; if (outcome === "network") throw new Error("synthetic network failure"); return outcome === "accepted" ? Response.json({ ok: true, code: "provider_accepted", outcome: "accepted" }, { status: 202 })
      : outcome === "invalid-response" ? Response.json({ ok: true }, { status: 200 })
      : Response.json({ ok: false, code: outcome === "missing" ? "delivery_unavailable" : outcome === "limited" ? "rate_limited" : outcome === "unknown" ? "delivery_unconfirmed" : "provider_rejected", outcome: outcome === "unknown" ? "unknown" : "rejected" }, { status: outcome === "limited" ? 429 : 503 }); });
    h.flush(); for (const [key, value] of Object.entries({ ...fields, topic: "profile" })) h.field(key, value);
    await h.send();
    assert.equal(calls, 1);
    assert.equal(h.nodes().find(node => node.props.id === "fixture-id-message").props.value, fields.message);
    const key = ["network", "invalid-response", "unknown"].includes(outcome) ? "unconfirmed" : outcome === "missing" ? "unavailable" : outcome;
    assert.ok(h.nodes().some(node => node.props.children === copy[key] && ["status", "alert"].includes(node.props.role)));
    if (["accepted", "unknown", "network", "invalid-response"].includes(outcome)) { await h.send(); assert.equal(calls, 1); }
    h.prepare(); assert.ok(h.nodes().some(node => node.type === "a" && node.props.children === copy.open));
  });
}
test("direct-contact client duplicate callbacks share one busy lease", async () => {
  let calls = 0, resolve;
  const waiting = new Promise(done => { resolve = done; });
  const h = fixture(async () => { calls++; await waiting; return Response.json({ ok: true, code: "provider_accepted", outcome: "accepted" }, { status: 202 }); });
  h.flush(); for (const [key, value] of Object.entries({ ...fields, topic: "profile" })) h.field(key, value);
  const one = h.send(), two = h.send(); assert.equal(calls, 1);
  resolve(); await Promise.all([one, two]); assert.equal(calls, 1);
});
test("direct-contact client rejects whitespace-only and invalid programmatic fields before busy/network", async () => {
  let calls = 0;
  const h = fixture(async () => { calls++; throw new Error("No request expected"); }); h.flush();
  for (const [key, value] of Object.entries({ ...fields, topic: "profile", name: "   " })) h.field(key, value);
  await h.send(); assert.equal(calls, 0);
  assert.ok(h.nodes().some(node => node.props.role === "alert" && node.props.children === copy.required));
  h.field("name", fields.name); h.field("email", "invalid"); await h.send(); assert.equal(calls, 0);
  assert.ok(h.nodes().some(node => node.props.role === "alert" && node.props.children === copy.invalidEmail));
  assert.equal(h.nodes().find(node => node.type === "form").props["aria-busy"], false);
});
