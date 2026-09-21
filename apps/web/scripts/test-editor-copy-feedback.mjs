import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Runs actual TSX renders, effects and button handlers. Only browser, Auth and I/O
// adapters and the authorized admin boundary are synthetic; settings normalization
// and bulk parsing are real modules. Gate access has its own hook tests.
const localRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = process.env.QRGUITAR_TEST_REPO || localRoot;
const sourceRoot = process.env.QRGUITAR_COPY_SOURCE_ROOT || localRoot;
const require = createRequire(path.join(repo, 'package.json')), ts = require('typescript');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value && typeof value === 'object' ? text(value.props?.children) : '';
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
function loader(imports = {}, bindings = {}) {
  const cache = new Map();
  function load(relative) {
    const proposed = path.resolve(sourceRoot, relative), file = fs.existsSync(proposed) ? proposed : path.resolve(repo, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX
    } }).outputText;
    new Function('require', 'module', 'exports', ...Object.keys(bindings), code)(name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (!name.startsWith('.')) return require(name);
      const absolute = path.resolve(path.dirname(file), name);
      const relativeName = path.relative(file.startsWith(path.resolve(sourceRoot) + path.sep) ? sourceRoot : repo, absolute);
      return load(relativeName + (path.extname(relativeName) ? '' : '.ts'));
    }, module, module.exports, ...Object.values(bindings));
    return module.exports;
  }
  return load;
}
const real = loader({ 'lucide-react': {} });
const settings = real('apps/web/lib/site-settings.ts');
const registry = real('apps/web/lib/content-registry.ts');
const bulk = real('apps/web/lib/bulk-import.ts');
const editorClient = real('apps/web/lib/site-editor-client.ts');
const editorServer = real('apps/web/lib/site-editor-server.ts');

function hookRuntime() {
  let cursor = 0, dirty = true, mounted = true, tree, Component, props = {}, lateWrites = 0;
  const slots = [], pending = [];
  const hooks = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        if (!mounted) lateWrites++;
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(make, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: make(), deps }; return slots[index].value; },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: callback, deps }; return slots[index].value; },
    useEffect(run, deps) {
      const index = cursor++; slots[index] ??= {};
      if (!same(slots[index].deps, deps)) pending.push(() => { slots[index].cleanup?.(); slots[index].deps = deps; slots[index].cleanup = run(); });
    }
  };
  const f = {
    hooks,
    mount(component, initial = {}) { Component = component; props = initial; f.render(); },
    render() {
      if (!mounted) return;
      for (let count = 0; count < 30; count++) {
        if (dirty) { dirty = false; cursor = 0; tree = Component(props); }
        pending.splice(0).forEach(run => run());
        if (!dirty) return;
      }
      throw Error('Effects did not settle');
    },
    async flush() { for (let count = 0; count < 15; count++) { await Promise.resolve(); f.render(); } },
    all: () => nodes(tree), text: () => text(tree),
    find(predicate) { const result = nodes(tree).find(predicate); assert.ok(result, 'Expected rendered element'); return result; },
    button(label) { return f.find(node => node.type === 'button' && text(node).trim() === label); },
    click(label) { const button = f.button(label); assert.ok(!button.props.disabled, label + ' is enabled'); const result = button.props.onClick(); f.render(); return result; },
    dispose() { if (!mounted) return; mounted = false; slots.forEach(slot => slot.cleanup?.()); },
    lateWrites: () => lateWrites
  };
  return f;
}
function browser(options) {
  const writes = [], downloads = [], timers = new Map(), events = new Map(), storage = new Map(); let timer = 0;
  class BrowserURL extends globalThis.URL {
    static createObjectURL() { return 'blob:fixture'; }
    static revokeObjectURL() {}
  }
  const navigator = {};
  if (!options.noClipboard) navigator.clipboard = { writeText(value) { writes.push(value); return options.clipboard?.(value) ?? Promise.resolve(); } };
  Object.defineProperty(navigator, 'permissions', { get() { throw Error('Clipboard permission queries are forbidden'); } });
  const store = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const window = { innerWidth: 1280, localStorage: store, sessionStorage: store, location: { pathname: options.pathname || '/site-editor', search: '' },
    setTimeout(callback, delay) { const id = ++timer; timers.set(id, { callback, delay }); return id; }, clearTimeout: id => timers.delete(id),
    addEventListener(name, callback) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    removeEventListener(name, callback) { events.get(name)?.delete(callback); }
  };
  return { writes, downloads, timers, navigator, window, storage,
    emit(name) { for (const callback of [...events.get(name) || []]) callback({}); },
    document: { createElement: () => ({ click() { downloads.push(true); } }) },
    URL: BrowserURL
  };
}
async function editor(t, options = {}) {
  const f = hookRuntime(), b = browser(options), mutations = [];
  let generation = 0;
  const payload = { ok: true, editorActorId: 'actor-a', publishedVersion: '0', draftVersion: '0', published: structuredClone(settings.defaultSiteSettings), draft: null, revisions: options.revisions || [], ...options.payload };
  const mutate = async (body, versions) => { mutations.push(body); return options.mutate ? options.mutate(body, versions) : { ...payload, message: 'Saved fixture operation.', draft: body.settings || payload.published }; };
  const recovered = structuredClone(settings.defaultSiteSettings); recovered.colors.gold = '#abcdef';
  const pending = options.pendingIssue ? { localSnapshot: JSON.stringify(recovered) } : null;
  const EditorMutationError = editorClient.EditorMutationError;
  const jsx = (type, props, key) => ({ type, props, key });
  const authorizedGate = Symbol('Authorized AdminWorkspaceGate fixture');
  const fetchEditor = async (url, init) => {
    assert.equal(url, '/api/site-editor'); assert.equal(init.method, undefined);
    return options.loadError
      ? { ok: false, status: 401, json: async () => ({ message: options.loadError }) }
      : { ok: true, status: 200, json: async () => payload };
  };
  const load = loader({
    react: f.hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {}, 'next/link': { default: 'Link' }, 'next/navigation': { usePathname: () => options.pathname || '/site-editor' },
    '../../components/Nav': { Nav: 'Nav' }, '../../components/Footer': { Footer: 'Footer' }, '../../components/SiteCompositionEditor': { SiteCompositionEditor: 'SiteCompositionEditor' },
    '../../components/AdminWorkspaceGate': { AdminWorkspaceGate: authorizedGate },
    '../../lib/content-registry': registry, '../../lib/site-settings': { ...settings, applyThemeSettings() {} },
    '../../lib/site-editor-client': { ...editorClient, EditorMutationError,
      loadSiteEditorState: getAccessToken => editorClient.loadSiteEditorState(getAccessToken, fetchEditor),
      createEditorMutationController: () => ({ mutate, retry: () => { throw Error('Unexpected retry'); }, pending, storageProblem: null }) },
    '../../lib/site-preview-client': { clearSitePreviewCookie: async () => {}, openSiteDraftPreview: async () => '/fixture', sitePreviewGeneration: () => generation, sitePreviewInvalidatedEvent: 'fixture-invalidate' },
    '../../lib/supabase-browser': { getSupabaseAccessToken: async () => 'fixture-token', createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'actor-a' }, access_token: 'fixture-token' } } }) } }) }
  }, { window: b.window, document: b.document, navigator: b.navigator, URL: b.URL, HTMLElement: class {}, crypto: { randomUUID: () => 'fixture-request' }, fetch: fetchEditor });
  const page = load('apps/web/app/site-editor/page.tsx');
  f.mount(() => {
    const boundary = page.default();
    assert.equal(boundary.type, authorizedGate, 'Content Studio must retain its admin access wrapper');
    assert.equal(boundary.props.returnPath, options.pathname || '/site-editor');
    const workspace = boundary.props.children;
    assert.equal(workspace.type.name, 'SiteEditorWorkspace');
    return workspace.type(workspace.props);
  }); await f.flush();
  if (!options.loadError) { f.click('Advanced'); f.click('Advanced JSON'); await f.flush(); }
  t.after(() => f.dispose());
  return Object.assign(f, b, { payload, mutations,
    invalidate() { generation++; b.emit('fixture-invalidate'); f.render(); },
    silentlyInvalidate() { generation++; },
    copyStatus: () => f.all().filter(node => node.props?.role === 'status').map(text).join(''),
    saveStatus: () => text(f.find(node => String(node.props?.className || '').startsWith('cms-save-state'))),
    json: () => f.find(node => node.type === 'textarea' && node.props.className === 'cms-json'),
    runAutosave() { const timer = [...b.timers.values()].find(value => value.delay === 1800); assert.ok(timer); timer.callback(); f.render(); }
  });
}
async function importer(t, options = {}) {
  const f = hookRuntime(), b = browser(options); let observe;
  b.navigator.locks = {};
  const source = 'brand,model,serial,type,photo\nPrivate Brand,My model,No Serial,Electric Guitar,https://example.invalid/my.jpg';
  b.storage.set(bulk.bulkDraftKey('actor-a'), JSON.stringify({ version: 2, ownerId: 'actor-a', text: source, rows: bulk.parseRows(source), columnMapping: {} }));
  const jsx = (type, props, key) => ({ type, props, key });
  const load = loader({
    react: f.hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': {},
    '../lib/profile-upload-client': {}, '../lib/qrguitar-id': { qrCodeFromSerial: value => value },
    '../lib/supabase-browser': { createBrowserSupabaseClient: () => ({ auth: {} }) },
    '../lib/session-identity': { observeSessionIdentity(auth, callback) { observe = callback; callback('actor-a'); return () => { observe = undefined; }; } },
    '../lib/content-registry': registry, '../lib/use-site-content': { useSiteContent: () => registry.defaultContentValues },
    '../lib/bulk-import': bulk,
    '../lib/bulk-import-lock': { acquireBulkImportLease(manager, ownerId) { let owned = true; return { ownerId, ready: Promise.resolve(), isOwned: () => owned,
      assertOwned() { assert.equal(owned, true); }, release() { owned = false; } }; } }
  }, { navigator: b.navigator, window: b.window, fetch: () => { throw Error('No request expected'); } });
  f.mount(load('apps/web/components/BulkProfileImport.tsx').BulkProfileImport); await f.flush(); t.after(() => f.dispose());
  return Object.assign(f, b, { source,
    switchActor(actor) { observe?.(actor); f.render(); },
    input: () => f.find(node => node.type === 'textarea' && node.props.id === 'dashboardBulkImport'),
    fallback: () => f.all().find(node => node.type === 'textarea' && node.props['aria-label'] === 'Bulk import template'),
    messages: () => f.all().filter(node => node.props?.role === 'status').map(text).join('\n')
  });
}

test('editor headline autosave preserves explicitly saved typed defaults and unrelated settings', async t => {
  const published = settings.mergeSiteSettings(structuredClone(settings.defaultSiteSettings));
  const expected = structuredClone(published);
  expected.content['home.hero.headline'] = 'Browser CMS Review 20260920';
  expected.hero.headline = 'Browser CMS Review 20260920';
  const f = await editor(t, { payload: { published } });
  f.click('Content');
  f.find(node => node.type === 'input' && node.props.id === 'content-home-hero-headline').props.onChange({ target: { value: expected.hero.headline } });
  f.render(); f.runAutosave(); await f.flush();
  assert.equal(f.mutations.length, 1);
  assert.equal(f.mutations[0].action, 'save_draft');
  assert.deepEqual(f.mutations[0].settings, expected, 'a headline edit must not replace saved typed defaults with legacy SEO or dashboard aliases');
});

test('shared settings normalization preserves explicit typed defaults over legacy aliases', () => {
  const source = structuredClone(settings.defaultSiteSettings);
  const merged = settings.mergeSiteSettings(source);
  for (const key of ['seo.global.title', 'seo.global.description', 'dashboard.empty.title', 'dashboard.empty.body']) {
    assert.equal(merged.content[key], source.content[key]);
  }
  assert.deepEqual(settings.mergeSiteSettings(merged), merged, 'normalization is idempotent for saved typed content');
});

test('shared settings normalization backfills absent typed keys from actual legacy values only', () => {
  const legacy = { hero: { headline: 'Legacy homepage headline' }, seo: { title: 'Legacy title' }, dashboard: { emptyCollectionTitle: 'Legacy collection title' } };
  const merged = settings.mergeSiteSettings(legacy);
  assert.equal(merged.content['home.hero.headline'], 'Legacy homepage headline');
  assert.equal(merged.content['seo.global.title'], 'Legacy title');
  assert.equal(merged.content['dashboard.empty.title'], 'Legacy collection title');
  assert.equal(merged.content['dashboard.empty.body'], registry.defaultContentValues['dashboard.empty.body'], 'missing legacy values must not override current defaults');
  const explicit = settings.mergeSiteSettings({ ...legacy, content: { 'seo.global.title': registry.defaultContentValues['seo.global.title'], 'home.hero.headline': '' } });
  assert.equal(explicit.content['seo.global.title'], registry.defaultContentValues['seo.global.title']);
  assert.equal(explicit.content['home.hero.headline'], registry.defaultContentValues['home.hero.headline'], 'an empty required typed field keeps registry fallback behavior instead of inheriting a legacy alias');
});

test('editor load preserves a stored draft whose different wording normalizes to the published value', async t => {
  const publishedValue = structuredClone(settings.defaultSiteSettings);
  publishedValue.content['contact.hero.body'] = 'Browse instrument profiles.';
  const draftSettings = structuredClone(publishedValue);
  draftSettings.content['contact.hero.body'] = 'Browse instrument records.';
  assert.notDeepEqual(draftSettings, publishedValue, 'the stored draft contains a real text difference');
  const payload = editorServer.mapEditorState({
    publishedValue, publishedVersion: 'published-original', publishedAt: '2026-09-20T12:00:00Z',
    draftValue: { settings: draftSettings, note: 'Existing wording draft', changedFields: ['contact.hero.body'] },
    draftVersion: 'draft-original', draftUpdatedAt: '2026-09-20T12:01:00Z', revisionRows: []
  });
  assert.deepEqual(payload.draft, payload.published, 'the actual API normalizer hides this stored difference');
  const f = await editor(t, { payload });
  assert.deepEqual(f.mutations, [], 'loading only reads the snapshot before the timer');
  f.runAutosave(); await f.flush();
  assert.deepEqual(f.mutations, [], 'opening the editor must not discard an existing draft based on normalized equality');
});
test('opening identical or different shared drafts keeps them until an explicit action', async t => {
  for (const changed of [false, true]) {
    const published = structuredClone(settings.defaultSiteSettings);
    const draft = structuredClone(published);
    if (changed) draft.content['contact.hero.body'] = 'A separate shared draft change.';
    const payload = { published, draft, draftMeta: { note: 'Keep this draft' }, publishedVersion: 'p-observed', draftVersion: 'd-observed' };
    const f = await editor(t, { payload });
    f.runAutosave(); await f.flush();
    assert.deepEqual(f.mutations, [], changed ? 'an unrelated effective draft is not re-saved or discarded' : 'an identical draft is not discarded on entry');
    assert.equal(f.button('Discard draft').props.disabled, false, 'the confirmed discard remains available');
    assert.equal(JSON.parse(f.json().props.value).content['contact.hero.body'], draft.content['contact.hero.body']);
  }
});

test('dirty edits still autosave using observed versions and preserving another draft field', async t => {
  const published = structuredClone(settings.defaultSiteSettings), draft = structuredClone(published);
  draft.content['contact.hero.body'] = 'Existing shared draft text.';
  const payload = { published, draft, draftMeta: { note: 'Existing draft' }, publishedVersion: 'p-loaded', draftVersion: 'd-loaded' };
  let observedVersions;
  const f = await editor(t, { payload, mutate: async (body, versions) => {
    observedVersions = structuredClone(versions);
    return { ...payload, draft: body.settings, draftVersion: 'd-saved', message: 'Draft saved.' };
  } });
  f.click('Content');
  const field = f.find(node => node.type === 'input' && node.props.id === 'content-home-hero-headline');
  field.props.onChange({ target: { value: 'An intentionally edited headline' } }); f.render();
  f.runAutosave(); await f.flush();
  assert.equal(f.mutations.length, 1);
  assert.equal(f.mutations[0].action, 'save_draft');
  assert.deepEqual(observedVersions, { publishedVersion: 'p-loaded', draftVersion: 'd-loaded' });
  assert.equal(f.mutations[0].settings.content['home.hero.headline'], 'An intentionally edited headline');
  assert.equal(f.mutations[0].settings.content['contact.hero.body'], 'Existing shared draft text.');
});

test('discard remains a confirmed action with the loaded published and draft versions', async t => {
  const published = structuredClone(settings.defaultSiteSettings), draft = structuredClone(published);
  draft.content['contact.hero.body'] = 'Draft selected for an intentional discard.';
  const payload = { published, draft, draftMeta: { note: 'Existing draft' }, publishedVersion: 'p-discard', draftVersion: 'd-discard' };
  let observedVersions;
  const f = await editor(t, { payload, mutate: async (body, versions) => {
    observedVersions = structuredClone(versions);
    return { ...payload, draft: null, draftMeta: null, draftVersion: '', message: 'Draft discarded.' };
  } });
  f.click('Discard draft');
  assert.match(f.text(), /Discard shared draft\?/);
  assert.deepEqual(f.mutations, []);
  f.click('Cancel');
  assert.deepEqual(f.mutations, []);
  f.click('Discard draft');
  const dialog = f.find(node => node.props?.role === 'dialog' && node.props['aria-labelledby'] === 'cms-confirm-title');
  const confirm = nodes(dialog).find(node => node.type === 'button' && text(node).trim() === 'Discard draft');
  assert.ok(confirm && !confirm.props.disabled);
  confirm.props.onClick(); f.render(); await f.flush();
  assert.equal(f.mutations.length, 1);
  assert.equal(f.mutations[0].action, 'discard_draft');
  assert.deepEqual(observedVersions, { publishedVersion: 'p-discard', draftVersion: 'd-discard' });
  assert.equal(f.button('Discard draft').props.disabled, true, 'confirmed discard clears the loaded draft');
});
test('admin Site Editor entry keeps its admin return path and sign-in continuation', async t => {
  const authorized = await editor(t, { pathname: '/admin/site-editor' });
  assert.ok(authorized.all().some(node => node.props?.href === '/admin' && text(node).includes('Back to Admin')));
  const signedOut = await editor(t, { pathname: '/admin/site-editor', loadError: 'Sign in with an authorized admin account.' });
  assert.match(signedOut.text(), /Admin tools/); assert.doesNotMatch(signedOut.text(), /Owner tools/);
  assert.ok(signedOut.all().some(node => node.props?.href === '/login?next=%2Fadmin%2Fsite-editor'));
});

test('public Site Editor alias preserves its own sign-in continuation', async t => {
  const signedOut = await editor(t, { pathname: '/site-editor', loadError: 'Sign in with an authorized admin account.' });
  assert.ok(signedOut.all().some(node => node.props?.href === '/login?next=%2Fsite-editor'));
  assert.equal(signedOut.all().some(node => node.props?.href === '/admin'), false);
});

test('pending exact-save recovery disables publish, discard and restore controls', async t => {
  const revision = { id: 'site-editor:revision:test', updatedAt: '2026-09-18T12:00:00Z', publishedAt: '2026-09-18T12:00:00Z', publishedBy: 'Admin', note: 'Before', area: 'Homepage', changedFields: ['content.title'] };
  const f = await editor(t, { pendingIssue: true, revisions: [revision] });
  assert.equal(f.button('Publish').props.disabled, true);
  assert.equal(f.button('Discard draft').props.disabled, true);
  assert.equal(f.button('Retry the same save').props.disabled, false);
  f.click('Revision history');
  assert.equal(f.button('Restore to draft').props.disabled, true);
});

test('save recovery details remain outside the compact toolbar with usable actions and honest timestamps', async t => {
  const f = await editor(t, { pendingIssue: true });
  const toolbar = f.find(node => node.type === 'header' && node.props.className === 'cms-commandbar');
  const notice = f.find(node => node.props?.role === 'alert' && node.props.className === 'issueNotice');
  assert.equal(f.saveStatus(), 'Save needs attention');
  assert.equal(nodes(toolbar).includes(notice), false, 'the detailed alert is not clipped by the toolbar');
  assert.match(text(notice), /A previous save needs confirmation\. Retry it before making another change\./);
  assert.doesNotMatch(text(toolbar), /A previous save needs confirmation|Export local changes|Retry the same save/);
  for (const label of ['Export local changes', 'Retry the same save', 'Export and reload latest']) {
    const button = f.button(label);
    assert.ok(nodes(notice).includes(button), label + ' stays in the recovery notice');
    assert.match(button.props.className, /button secondary/);
  }
  assert.equal(f.button('Retry the same save').props.disabled, false);
  assert.equal(f.button('Publish').props.disabled, true);
  assert.equal(f.button('Discard draft').props.disabled, true);
  f.click('Export local changes');
  assert.equal(f.downloads.length, 1);
  assert.deepEqual(f.mutations, []);
  assert.match(f.text(), /No saved draft/);
  assert.match(f.text(), /Publish date unavailable/);
  assert.doesNotMatch(f.text(), /DraftNone|PublishedNot yet/);
});

test('editor content and arrangement navigation preserve draft text without mutations', async t => {
  const f = await editor(t); f.click('Content');
  const field = f.find(node => node.type === 'input' && node.props.id === 'content-home-hero-headline');
  field.props.onChange({ target: { value: 'My edited headline' } }); f.render();
  f.click('Section arrangement');
  assert.equal(f.all().filter(node => node.type === 'SiteCompositionEditor').length, 1);
  assert.equal(f.all().some(node => node.props?.id === 'content-home-hero-headline'), false);
  f.click('Page content');
  assert.equal(f.find(node => node.type === 'input' && node.props.id === 'content-home-hero-headline').props.value, 'My edited headline');
  assert.equal(f.mutations.length, 0);
  const nav = f.find(node => node.props?.['aria-label'] === 'Page content sections');
  const other = nodes(nav).filter(node => node.type === 'button')[1];
  other.props.onClick(); f.render();
  assert.equal(f.all().some(node => node.props?.id === 'content-home-hero-headline'), false);
  assert.equal(f.all().filter(node => String(node.props?.className || '').includes('cms-content-section is-open')).length, 1);
  const sectionPicker = f.find(node => node.type === 'select' && node.props.id === 'cms-active-section');
  const firstSection = sectionPicker.props.children[0].props.value;
  sectionPicker.props.onChange({ target: { value: firstSection } }); f.render();
  assert.equal(f.find(node => node.props?.id === 'content-home-hero-headline').props.value, 'My edited headline');
  f.click('Section arrangement'); f.click('Homepage'); f.click('Page content');
  assert.equal(f.mutations.length, 0);
});

test('publishing confirmation states the complete shared-draft scope', async t => {
  const f = await editor(t); f.click('Content');
  f.find(node => node.type === 'input' && node.props.id === 'content-home-hero-headline').props.onChange({ target: { value: 'Another edited headline' } }); f.render();
  f.click('Publish');
  assert.match(f.text(), /Publish all draft changes\?/);
  assert.match(f.text(), /will be published globally/);
  assert.equal(f.mutations.length, 0);
  f.click('Cancel'); assert.equal(f.mutations.length, 0);
});

test('editor copy confirms the exact settings export without changing save status', async t => {
  const f = await editor(t), before = f.saveStatus(), expected = f.json().props.value;
  f.click('Copy export'); await f.flush(); assert.deepEqual(f.writes, [expected]); assert.match(f.copyStatus(), /Settings export copied/); assert.equal(f.saveStatus(), before);
});
test('editor waits for actual clipboard completion before confirming', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export');
  assert.match(f.copyStatus(), /Copying/); assert.doesNotMatch(f.copyStatus(), /copied/); pending.resolve(); await f.flush(); assert.match(f.copyStatus(), /copied/);
});
for (const [label, options] of [['missing Clipboard API', { noClipboard: true }], ['rejected write', { clipboard: () => Promise.reject(Error('Denied')) }], ['synchronous exception', { clipboard: () => { throw Error('Denied'); } }]]) {
  test('editor handles ' + label + ' with an available backup action', async t => {
    const f = await editor(t, options), before = f.saveStatus(); f.click('Copy export'); await f.flush();
    assert.match(f.copyStatus(), /Could not copy automatically.*Download backup/); assert.equal(f.saveStatus(), before); f.click('Download backup'); assert.equal(f.downloads.length, 1);
  });
}
test('editor late older failure cannot overwrite a newer successful copy', async t => {
  const first = deferred(); let calls = 0; const f = await editor(t, { clipboard: () => ++calls === 1 ? first.promise : Promise.resolve() });
  f.click('Copy export'); f.click('Copy export'); await f.flush(); first.reject(Error('Old denial')); await f.flush(); assert.match(f.copyStatus(), /copied/); assert.doesNotMatch(f.copyStatus(), /Could not/);
});
test('editor context navigation retires pending copy feedback', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.click('Theme'); pending.resolve(); await f.flush(); f.click('Advanced JSON'); assert.equal(f.copyStatus(), '');
});
test('editor changed settings reject stale feedback without replacing the edited draft', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.click('Unlock editor');
  const changed = JSON.parse(f.json().props.value); changed.colors.gold = '#aaaaaa';
  f.json().props.onChange({ target: { value: JSON.stringify(changed) } }); f.render(); f.click('Validate and load draft'); pending.resolve(); await f.flush();
  assert.equal(f.copyStatus(), ''); assert.equal(JSON.parse(f.json().props.value).colors.gold, '#aaaaaa'); assert.match(f.saveStatus(), /unpublished/);
});
test('editor copy remains independent of a later backup message', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.click('Download backup');
  pending.reject(Error('Denied')); await f.flush(); assert.equal(f.saveStatus(), 'Settings backup downloaded.'); assert.match(f.copyStatus(), /Download backup/);
});
test('editor in-flight save retires copy feedback without blocking the save or changing its outcome', async t => {
  const copied = deferred(), saved = deferred(), f = await editor(t, { clipboard: () => copied.promise, mutate: () => saved.promise });
  f.click('Unlock editor'); const changed = JSON.parse(f.json().props.value); changed.colors.gold = '#aaaaaa';
  f.json().props.onChange({ target: { value: JSON.stringify(changed) } }); f.render(); f.click('Validate and load draft');
  f.click('Copy export'); f.runAutosave(); assert.equal(f.mutations.length, 1); assert.match(f.saveStatus(), /Saving draft/);
  copied.resolve(); await f.flush(); assert.equal(f.copyStatus(), ''); assert.match(f.saveStatus(), /Saving draft/);
  saved.resolve({ ...f.payload, draft: f.mutations[0].settings, message: 'Draft persisted.' }); await f.flush();
  assert.equal(f.copyStatus(), ''); assert.match(f.saveStatus(), /Draft persisted/);
});
test('editor account invalidation hides copy state and ignores late clipboard success', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.invalidate(); pending.resolve(); await f.flush();
  assert.match(f.text(), /account changed/); assert.doesNotMatch(f.text(), /Settings export copied|Copying export/);
});
test('editor preview generation change fences a late result before an event renders', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.silentlyInvalidate(); pending.resolve(); await f.flush(); assert.doesNotMatch(f.copyStatus(), /copied/);
});
test('editor unmount ignores clipboard rejection without setting state', async t => {
  const pending = deferred(), f = await editor(t, { clipboard: () => pending.promise }); f.click('Copy export'); f.dispose(); pending.reject(Error('Denied')); await f.flush(); assert.equal(f.lateWrites(), 0);
});

test('bulk denied copy exposes a real selectable template and preserves the current import', async t => {
  const f = await importer(t, { clipboard: () => Promise.reject(Error('Denied')) }), template = f.input().props.placeholder;
  const saved = f.storage.get(bulk.bulkDraftKey('actor-a')); f.click('Copy template'); await f.flush();
  assert.equal(f.fallback()?.props.value, template); assert.equal(f.fallback().props.readOnly, true); assert.ok(!f.fallback().props.disabled);
  let selected = false; f.fallback().props.onFocus({ currentTarget: { select() { selected = true; } } }); assert.equal(selected, true);
  assert.equal(f.input().props.value, f.source); assert.equal(f.storage.get(bulk.bulkDraftKey('actor-a')), saved); assert.match(f.messages(), /Select and copy the template below/); assert.match(f.messages(), /saved import is ready/);
});
test('bulk successful copy writes only the actual template and keeps import status', async t => {
  const f = await importer(t), template = f.input().props.placeholder; f.click('Copy template'); await f.flush();
  assert.deepEqual(f.writes, [template]); assert.match(f.messages(), /Template copied/); assert.match(f.messages(), /saved import is ready/); assert.equal(f.fallback(), undefined); assert.equal(f.input().props.value, f.source);
});
for (const [label, options] of [['missing Clipboard API', { noClipboard: true }], ['synchronous clipboard throw', { clipboard: () => { throw Error('Denied'); } }]]) {
  test('bulk ' + label + ' provides the same manual template', async t => { const f = await importer(t, options); f.click('Copy template'); await f.flush(); assert.equal(f.fallback()?.props.value, f.input().props.placeholder); });
}
test('bulk newer copy wins over an older failure and removes manual fallback', async t => {
  const first = deferred(); let count = 0; const f = await importer(t, { clipboard: () => ++count === 1 ? first.promise : Promise.resolve() });
  f.click('Copy template'); f.click('Copy template'); await f.flush(); first.reject(Error('Old error')); await f.flush(); assert.match(f.messages(), /Template copied/); assert.equal(f.fallback(), undefined);
});
test('bulk retry after failure can succeed without replacing user inventory', async t => {
  let count = 0; const f = await importer(t, { clipboard: () => ++count === 1 ? Promise.reject(Error('Denied')) : Promise.resolve() });
  f.click('Copy template'); await f.flush(); assert.ok(f.fallback()); f.click('Copy template'); await f.flush(); assert.equal(f.fallback(), undefined); assert.equal(f.input().props.value, f.source);
});
test('bulk late copy does not overwrite subsequent import editing', async t => {
  const pending = deferred(), f = await importer(t, { clipboard: () => pending.promise }); f.click('Copy template');
  f.input().props.onChange({ target: { value: 'My replacement inventory' } }); f.render(); pending.reject(Error('Denied')); await f.flush(); assert.equal(f.input().props.value, 'My replacement inventory'); assert.ok(f.fallback());
});
for (const actor of ['', 'actor-b']) test('bulk account transition retires late copy result: ' + (actor || 'signed-out'), async t => {
  const pending = deferred(), f = await importer(t, { clipboard: () => pending.promise }); f.click('Copy template'); f.switchActor(actor); pending.reject(Error('Denied')); await f.flush();
  assert.equal(f.fallback(), undefined); assert.doesNotMatch(f.messages(), /Template copied|Could not copy/);
});
test('bulk A → B → A before completion still invalidates the old copy', async t => {
  const pending = deferred(), f = await importer(t, { clipboard: () => pending.promise }); f.click('Copy template'); f.switchActor('actor-b'); f.switchActor('actor-a'); pending.resolve(); await f.flush(); assert.doesNotMatch(f.messages(), /Template copied/);
});
test('bulk unmount ignores late clipboard rejection', async t => {
  const pending = deferred(), f = await importer(t, { clipboard: () => pending.promise }); f.click('Copy template'); f.dispose(); pending.reject(Error('Denied')); await f.flush(); assert.equal(f.lateWrites(), 0);
});
