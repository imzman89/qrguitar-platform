import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (source, snippet, message) => assert(source.includes(snippet), message);
const excludes = (source, snippet, message) => assert(!source.includes(snippet), message);

const dashboard = read("app/dashboard/page.tsx");
const create = read("app/create/page.tsx");
const nav = read("components/Nav.tsx");
const qrDownload = read("components/QrDownload.tsx");
const profile = read("app/i/[code]/ProfileClient.tsx");
const layout = read("app/layout.tsx");
const login = read("app/login/page.tsx");
const admin = read("app/admin/page.tsx");
const siteEditor = read("app/site-editor/page.tsx");
const themeRuntime = read("components/ThemeRuntime.tsx");
const middleware = read("middleware.ts");
const editor = read("app/edit/[code]/page.tsx");
const transfer = read("app/transfer/[id]/page.tsx");
const handout = read("app/handout/[code]/page.tsx");
const siteCompositionEditor = read("components/SiteCompositionEditor.tsx");
const collectibleCard = read("components/CollectibleRecordCard.tsx");
const contentRegistry = read("lib/content-registry.ts");
const siteSettings = read("lib/site-settings.ts");
const instrumentApi = read("app/api/instruments/route.ts");
const adminProfileApi = read("app/api/admin/records/[id]/route.ts");
const account = read("app/account/page.tsx");
const quickEdit = read("components/ProfileQuickEdit.tsx");

const occurrences = (source, snippet) => source.split(snippet).length - 1;

assert(occurrences(dashboard, "Open Print Suite") === 1, "Dashboard must expose exactly one approved Print Suite action.");
includes(create, "Open Print Suite", "Create success must name the Print Suite destination clearly.");
includes(qrDownload, "Open Print Suite", "QR actions must use the approved Print Suite name.");
for (const legacy of ["Print handout &amp; labels", "Print or Download QR", ">Print Kit<", ">Print Handout<"]) {
  excludes(`${dashboard}\n${create}\n${qrDownload}`, legacy, `Legacy print action remains: ${legacy}`);
}

includes(layout, "loadPublishedSiteSettings", "The published theme must be rendered on the server.");
includes(layout, '"--bg": publishedSettings.colors.background', "First paint must use the published background.");
excludes(themeRuntime, "applyThemeSettings(defaultSiteSettings)", "Theme hydration must not flash bundled defaults.");
assert(/useEffect\(\(\) => \{\s+const supabase = createBrowserSupabaseClient\(\);\s+void fetchPublishedSiteSettings\(\)/.test(nav), "Navigation must load published settings on mount.");

includes(middleware, 'request.headers.get("host")', "Local canonicalization must inspect the Host header.");
excludes(middleware, 'request.nextUrl.hostname === "localhost"', "Local canonicalization must not self-redirect 127.0.0.1.");
includes(dashboard, "imageSourceKey", "Dashboard image fallback must use a stable source key.");
includes(profile, "presentation?.counts.service", "Profile tabs must react to the current service count.");
includes(qrDownload, "[code, displayLabel, isTransparent, profileUrl, style]", "QR previews must react to code and style changes.");
includes(admin, "const fallbackFocus = navButtonRef.current", "Admin overlays must capture a stable focus-return target.");
includes(admin, "const records = useMemo", "Admin record-derived controls must use a stable records array.");
includes(login, "sessionExpiredCopy", "Expired-session copy must follow published content.");
includes(siteEditor, "}, [fieldGroups]);", "Content Studio field groups must keep their active section synchronized.");
includes(siteEditor, "cms-theme-action-sample", "Theme preview must render its primary-action example as a visual sample.");
excludes(siteEditor, '<button type="button" style={{ background: settings.colors.cream', "Theme preview must not expose a dead button.");

const activeCustomerCopy = [dashboard, editor, transfer, handout, profile, siteEditor, siteCompositionEditor, collectibleCard, contentRegistry, siteSettings, instrumentApi, adminProfileApi, admin].join("\n");
for (const legacy of ["This record", "this record", "Could not load record", "Could not update record", "Record details failed", "Record action saved", "No visible photo", "owner-visible information", ">Visible<", '"Visible" : "Hidden"']) {
  excludes(activeCustomerCopy, legacy, `Legacy customer-facing terminology remains: ${legacy}`);
}
includes(editor, "This Profile is verified by QRguitar.", "The owner editor must describe the QRguitar Profile consistently.");
includes(transfer, "This Profile now belongs to the accepting account", "Transfer completion must describe the Profile consistently.");
includes(siteCompositionEditor, 'section.visible ? "Shown" : "Hidden"', "Content Studio visibility states must use Shown/Hidden language.");
includes(collectibleCard, "Photo unavailable", "Collectible cards need a concise photo fallback.");
includes(account, "const [authReady, setAuthReady]", "Account must distinguish session loading from signed-out state.");
includes(account, "Loading your account...", "Account must show a neutral loading state while authentication resolves.");
assert(account.indexOf("if (!authReady)") < account.indexOf("if (!signedIn)"), "Account must settle authentication before rendering signed-out actions.");
includes(quickEdit, 'document.body.style.overflow = "hidden"', "Quick Edit must lock background scrolling while open.");
includes(quickEdit, 'event.key === "Escape"', "Quick Edit must close with Escape.");
includes(quickEdit, 'returnFocusRef.current?.focus()', "Quick Edit must restore focus to its trigger.");
includes(quickEdit, 'event.key !== "Tab"', "Quick Edit must keep keyboard focus inside the modal.");

const baseUrl = process.env.QRGUITAR_TEST_BASE_URL || "http://127.0.0.1:3003";
async function get(route) {
  const joiner = route.includes("?") ? "&" : "?";
  const response = await fetch(`${baseUrl}${route}${joiner}qa=customer-expectation-${Date.now()}-${Math.random()}`, {
    cache: "no-store",
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache", "user-agent": "QRguitar-customer-expectation/1.0" }
  });
  return { response, text: await response.text() };
}

for (const route of ["/", "/catalog", "/how-it-works", "/login", "/contact", "/privacy", "/terms"]) {
  const result = await get(route);
  assert(result.response.ok, `${route} returned ${result.response.status}.`);
}

const api = await get("/api/instruments");
assert(api.response.ok, `Public API returned ${api.response.status}.`);
const payload = JSON.parse(api.text);
const records = Array.isArray(payload) ? payload : payload.instruments;
assert(Array.isArray(records) && records.length > 0, "Public API returned no eligible Profiles.");
const serialized = JSON.stringify(records);
for (const forbidden of ["ownerEmail", "privateNotes", "transferToken", "recipientEmail", "auth_metadata", "storage_path", "supabase.co/storage", "token="]) {
  excludes(serialized, forbidden, `Public API leaked ${forbidden}.`);
}

console.log(`QRguitar customer-expectation assertions passed for ${records.length} public Profiles.`);
