import { mapEditorState, editorFailure, finishEditorCommit, type RawEditorState } from "../../../lib/site-editor-server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminContext, readAdminEmailList } from "../../../lib/admin-auth";
import { validateContentValues } from "../../../lib/content-registry";
import { mergeSiteSettings, publishedSiteSettingsKey, validateBrandLogoEntries, validateEditorialComposition, type EditableSiteSettings } from "../../../lib/site-settings";
import { createServerSupabaseClientWithTimeout } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const DRAFT_KEY = "site-editor:draft";
const REVISION_PREFIX = "site-editor:revision:";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const EDITORIAL_ROUTES = {
  home: "/",
  howItWorks: "/how-it-works",
  catalog: "/catalog",
  installers: "/installers",
  contact: "/contact",
  footer: "/"
} as const;

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers || {}) }
  });
}

function revalidatePublishedSettings(changedFields: string[], before: EditableSiteSettings, after: EditableSiteSettings) {
  const paths = new Set<string>(["/api/site-settings"]);
  const contentRoutes: Array<[string, string]> = [
    ["home.", "/"],
    ["howItWorks.", "/how-it-works"],
    ["catalog.", "/catalog"],
    ["contact.", "/contact"],
    ["seo.home.", "/"],
    ["seo.howItWorks.", "/how-it-works"],
    ["seo.catalog.", "/catalog"],
    ["seo.contact.", "/contact"]
  ];

  for (const field of changedFields) {
    for (const [prefix, path] of contentRoutes) {
      if (field.startsWith(prefix)) paths.add(path);
    }
  }

  if (changedFields.some((field) => ["brandName", "tagline", "colors", "seo", "global."].some((prefix) => field === prefix || field.startsWith(prefix)))) {
    paths.add("/");
    paths.add("/how-it-works");
    paths.add("/catalog");
    paths.add("/contact");
  }

  if (changedFields.includes("composition")) {
    for (const [page, path] of Object.entries(EDITORIAL_ROUTES)) {
      const key = page as keyof EditableSiteSettings["composition"];
      if (JSON.stringify(before.composition[key]) !== JSON.stringify(after.composition[key])) paths.add(path);
    }
  }

  for (const path of paths) revalidatePath(path);
  revalidatePath("/", "layout");
}

function validHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function validateSettings(settings: EditableSiteSettings, rawSettings?: Partial<EditableSiteSettings>) {
  const errors = { ...validateBrandLogoEntries(rawSettings?.brandLogos), ...validateContentValues(settings.content), ...validateEditorialComposition(settings.composition) };
  for (const [key, value] of Object.entries(settings.colors)) {
    if (!validHex(value)) errors[`colors.${key}`] = "Use a six-digit hex color.";
  }
  if (!settings.brandName.trim()) errors.brandName = "Brand name is required.";
  try {
    const canonical = new URL(settings.seo.canonicalUrl);
    if (canonical.protocol !== "https:" || canonical.hostname !== "www.qrguitar.com" || canonical.username || canonical.password) {
      errors["seo.canonicalUrl"] = "Use the canonical QRguitar HTTPS origin.";
    }
  } catch {
    errors["seo.canonicalUrl"] = "Enter a valid canonical URL.";
  }
  return errors;
}

async function loadState(supabase: NonNullable<ReturnType<typeof createServerSupabaseClientWithTimeout>>) {
  const result = await supabase.rpc("read_site_editor_state");
  if (result.error) throw new Error("Could not load Site Editor state.");
  return mapEditorState(result.data as RawEditorState);
}

export async function GET(request: Request) {
  noStore();
  const supabase = createServerSupabaseClientWithTimeout(15000);
  if (!supabase) return json({ ok: false, message: "Site content storage is unavailable." }, { status: 503 });
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, message: admin.message }, { status: admin.status });
  try { return json({ ok: true, editorActorId: admin.user!.id, ...(await loadState(supabase)) }); }
  catch { return json({ ok: false, message: "Could not load Site Editor state. Retry when your connection is available." }, { status: 503 }); }
}

export async function PUT(request: Request) {
  noStore();
  const supabase = createServerSupabaseClientWithTimeout(15000);
  if (!supabase) return json({ ok: false, uncertain: false, message: "Site content storage is unavailable." }, { status: 503 });
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, uncertain: false, message: admin.message }, { status: admin.status });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return json({ ok: false, uncertain: false, message: "Invalid Site Editor request." }, { status: 400 }); }
  if (typeof body.expectedPublishedVersion !== "string" || typeof body.expectedDraftVersion !== "string" || typeof body.requestId !== "string") {
    return json({ ok: false, uncertain: false, message: "Reload the editor before saving; this request has no concurrency versions." }, { status: 428 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)) {
    return json({ ok: false, uncertain: false, message: "A valid editor request ID is required." }, { status: 400 });
  }
  if (body.expectedActorId !== admin.user!.id) return json({ ok: false, uncertain: false, message: "The signed-in editor changed. Sign back into the original account to confirm pending saves." }, { status: 403 });
  const action = body.action;
  if (!["save_draft", "publish", "discard_draft", "restore_revision"].includes(String(action))) {
    return json({ ok: false, uncertain: false, message: "Unsupported Site Editor action." }, { status: 400 });
  }
  // Compatibility publisher may only operate when it observed no shared draft.
  if (body.source === "brand_logo_admin" && (action !== "publish" || body.expectedDraftVersion !== "")) {
    return json({ ok: false, uncertain: false, conflict: true, message: "A shared draft exists. Manage brand logos in the Site Editor to preserve it." }, { status: 409 });
  }
  let revisionValue: Record<string, unknown> | null = null;
  let settings: EditableSiteSettings | null = null;
  let rawSettings: Partial<EditableSiteSettings> | undefined;
  if (action === "restore_revision") {
    if (typeof body.revisionId !== "string" || !body.revisionId.startsWith(REVISION_PREFIX)) return json({ ok: false, uncertain: false, message: "Select a valid revision." }, { status: 400 });
    try {
      const revision = await supabase.from("site_content").select("content_value").eq("content_key", body.revisionId).maybeSingle<{ content_value: Record<string, unknown> }>();
      if (revision.error) return json({ ok: false, uncertain: false, message: "Could not read that revision. Retry when your connection is available." }, { status: 503 });
      if (!revision.data?.content_value?.settings) return json({ ok: false, uncertain: false, message: "That revision is unavailable." }, { status: 404 });
      revisionValue = revision.data.content_value;
      settings = mergeSiteSettings(revisionValue.settings as Partial<EditableSiteSettings>);
    } catch { return json({ ok: false, uncertain: false, message: "Could not read that revision." }, { status: 503 }); }
  } else if (action !== "discard_draft") {
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) return json({ ok: false, uncertain: false, message: "Settings are required." }, { status: 400 });
    rawSettings = body.settings as Partial<EditableSiteSettings>;
    settings = mergeSiteSettings(rawSettings);
  }
  if (settings) {
    const errors = validateSettings(settings, rawSettings);
    if (Object.keys(errors).length) return json({ ok: false, uncertain: false, message: "Fix the highlighted content before saving.", errors }, { status: 400 });
  }
  try {
    const mutation = await supabase.rpc("mutate_site_editor", {
      p_actor_id: admin.user!.id, p_actor_email: admin.email,
      p_env_authorized: readAdminEmailList().includes(admin.email),
      p_request: body, p_settings: settings, p_defaults: mergeSiteSettings(null), p_revision_value: revisionValue
    });
    if (mutation.error) {
      const failure = editorFailure(mutation.error.code);
      return json(failure.body, { status: failure.status });
    }
    const result = mutation.data as { state: RawEditorState; before: Partial<EditableSiteSettings>; changedFields: string[]; replayed?: boolean; superseded?: boolean; requestId: string };
    const state = mapEditorState(result.state);
    const completion = await finishEditorCommit(state, () => {
      if (action === "publish") revalidatePublishedSettings(result.changedFields, mergeSiteSettings(result.before), state.published);
    });
    const message = action === "publish" ? "Published globally." : action === "save_draft" ? "Draft saved on the server." : action === "discard_draft" ? "Draft discarded." : "Revision restored to draft. Review before publishing.";
    return json({ ok: true, committed: true, requestId: result.requestId, replayed: result.replayed, superseded: result.superseded,
      message: completion.warning || message, editorActorId: admin.user!.id, ...state });
  } catch {
    const failure = editorFailure();
    return json(failure.body, { status: failure.status });
  }
}

export async function PATCH(request: Request) { return PUT(request); }
