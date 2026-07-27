import { randomUUID } from "node:crypto";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminContext, logAdminAuditEvent } from "../../../lib/admin-auth";
import { validateContentValues } from "../../../lib/content-registry";
import { mergeSiteSettings, publishedSiteSettingsKey, validateEditorialComposition, type EditableSiteSettings } from "../../../lib/site-settings";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

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

type SiteContentRow = {
  content_key: string;
  content_value: unknown;
  updated_at: string | null;
};

type DraftValue = {
  settings?: Partial<EditableSiteSettings>;
  basePublishedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  note?: string;
  area?: string;
  changedFields?: string[];
};

type RevisionValue = DraftValue & {
  publishedAt?: string;
  publishedBy?: string;
};

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers || {}) }
  });
}

function changedContentKeys(a: EditableSiteSettings, b: EditableSiteSettings) {
  const keys = new Set([...Object.keys(a.content), ...Object.keys(b.content)]);
  const changed = Array.from(keys).filter((key) => a.content[key] !== b.content[key]);
  const settingsAreas: Array<keyof EditableSiteSettings> = ["brandName", "tagline", "instrumentCategories", "brandLogos", "colors", "hero", "sections", "seo", "dashboard", "composition"];
  for (const area of settingsAreas) {
    if (JSON.stringify(a[area]) !== JSON.stringify(b[area])) changed.push(String(area));
  }
  return Array.from(new Set(changed)).sort();
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

function validateSettings(settings: EditableSiteSettings) {
  const errors = { ...validateContentValues(settings.content), ...validateEditorialComposition(settings.composition) };
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

async function loadState(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const [publishedResult, draftResult, revisionsResult] = await Promise.all([
    supabase
      .from("site_content")
      .select("content_key,content_value,updated_at")
      .eq("content_key", publishedSiteSettingsKey)
      .maybeSingle<SiteContentRow>(),
    supabase
      .from("site_content")
      .select("content_key,content_value,updated_at")
      .eq("content_key", DRAFT_KEY)
      .maybeSingle<SiteContentRow>(),
    supabase
      .from("site_content")
      .select("content_key,content_value,updated_at")
      .like("content_key", `${REVISION_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(30)
  ]);

  if (publishedResult.error) throw new Error(publishedResult.error.message);
  if (draftResult.error) throw new Error(draftResult.error.message);
  if (revisionsResult.error) throw new Error(revisionsResult.error.message);

  const published = mergeSiteSettings(publishedResult.data?.content_value as Partial<EditableSiteSettings> | null);
  const draftValue = (draftResult.data?.content_value || null) as DraftValue | null;
  const draft = draftValue?.settings ? mergeSiteSettings(draftValue.settings) : null;
  const revisions = ((revisionsResult.data || []) as SiteContentRow[]).map((row) => {
    const value = (row.content_value || {}) as RevisionValue;
    return {
      id: row.content_key,
      updatedAt: row.updated_at || value.publishedAt || "",
      publishedAt: value.publishedAt || row.updated_at || "",
      publishedBy: value.publishedBy || "Authorized admin",
      note: value.note || "Published site settings",
      area: value.area || "All content",
      changedFields: Array.isArray(value.changedFields) ? value.changedFields : []
    };
  });

  return {
    published,
    publishedAt: publishedResult.data?.updated_at || "",
    draft,
    draftMeta: draftValue
      ? {
          basePublishedAt: draftValue.basePublishedAt || "",
          updatedAt: draftResult.data?.updated_at || draftValue.updatedAt || "",
          updatedBy: draftValue.updatedBy || "Authorized admin",
          note: draftValue.note || "",
          area: draftValue.area || "All content",
          changedFields: Array.isArray(draftValue.changedFields) ? draftValue.changedFields : []
        }
      : null,
    revisions
  };
}

export async function GET(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Site content storage is unavailable." }, { status: 503 });

  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, message: admin.message }, { status: admin.status });

  try {
    return json({ ok: true, ...(await loadState(supabase)) });
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Could not load Site Editor state." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Site content storage is unavailable." }, { status: 503 });

  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, message: admin.message }, { status: admin.status });

  let body: {
    action?: "save_draft" | "publish" | "discard_draft" | "restore_revision";
    settings?: Partial<EditableSiteSettings>;
    basePublishedAt?: string;
    note?: string;
    area?: string;
    revisionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Invalid Site Editor request." }, { status: 400 });
  }

  const action = body.action;
  if (!action) return json({ ok: false, message: "A Site Editor action is required." }, { status: 400 });

  if (action === "discard_draft") {
    const result = await supabase.from("site_content").delete().eq("content_key", DRAFT_KEY);
    if (result.error) return json({ ok: false, message: `Could not discard draft: ${result.error.message}` }, { status: 500 });
    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: "site_draft_discarded",
      targetType: "site_content",
      targetId: DRAFT_KEY,
      reason: body.note || "Draft discarded from Site Editor"
    });
    return json({ ok: true, message: "Draft discarded.", ...(await loadState(supabase)) });
  }

  if (action === "restore_revision") {
    if (!body.revisionId?.startsWith(REVISION_PREFIX)) {
      return json({ ok: false, message: "Select a valid revision." }, { status: 400 });
    }
    const revisionResult = await supabase
      .from("site_content")
      .select("content_value")
      .eq("content_key", body.revisionId)
      .maybeSingle<{ content_value: RevisionValue | null }>();
    const revisionSettings = revisionResult.data?.content_value?.settings;
    if (revisionResult.error || !revisionSettings) {
      return json({ ok: false, message: "That revision is unavailable." }, { status: 404 });
    }
    const current = await loadState(supabase);
    const restored = mergeSiteSettings(revisionSettings);
    const now = new Date().toISOString();
    const result = await supabase.from("site_content").upsert(
      {
        content_key: DRAFT_KEY,
        content_value: {
          settings: restored,
          basePublishedAt: current.publishedAt,
          updatedAt: now,
          updatedBy: admin.email,
          note: body.note || "Revision restored to draft",
          area: body.area || "Revision history",
          changedFields: changedContentKeys(current.published, restored)
        },
        updated_at: now
      },
      { onConflict: "content_key" }
    );
    if (result.error) return json({ ok: false, message: `Could not restore revision: ${result.error.message}` }, { status: 500 });
    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: "site_revision_restored_to_draft",
      targetType: "site_content",
      targetId: body.revisionId,
      reason: body.note || "Revision restored to draft"
    });
    return json({ ok: true, message: "Revision restored to draft. Review it before publishing.", ...(await loadState(supabase)) });
  }

  const settings = mergeSiteSettings(body.settings);
  const errors = validateSettings(settings);
  if (Object.keys(errors).length) {
    return json({ ok: false, message: "Fix the highlighted content before saving.", errors }, { status: 400 });
  }

  const current = await loadState(supabase);
  const now = new Date().toISOString();
  const changedFields = changedContentKeys(current.published, settings);

  if (action === "save_draft") {
    const result = await supabase.from("site_content").upsert(
      {
        content_key: DRAFT_KEY,
        content_value: {
          settings,
          basePublishedAt: body.basePublishedAt || current.publishedAt,
          updatedAt: now,
          updatedBy: admin.email,
          note: body.note || "",
          area: body.area || "All content",
          changedFields
        },
        updated_at: now
      },
      { onConflict: "content_key" }
    );
    if (result.error) return json({ ok: false, message: `Could not save draft: ${result.error.message}` }, { status: 500 });
    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: "site_draft_saved",
      targetType: "site_content",
      targetId: DRAFT_KEY,
      reason: body.note || "Site Editor draft saved",
      metadata: { area: body.area || "All content", changedFields }
    });
    return json({ ok: true, message: "Draft saved on the server.", ...(await loadState(supabase)) });
  }

  if (action !== "publish") return json({ ok: false, message: "Unsupported Site Editor action." }, { status: 400 });
  const base = body.basePublishedAt || current.draftMeta?.basePublishedAt || "";
  if (base && base !== current.publishedAt) {
    return json(
      {
        ok: false,
        conflict: true,
        message: "Published content changed in another session. Reload before publishing so no work is overwritten.",
        publishedAt: current.publishedAt
      },
      { status: 409 }
    );
  }

  const revisionId = `${REVISION_PREFIX}${now.replace(/[^0-9]/g, "")}:${randomUUID()}`;
  const revisionResult = await supabase.from("site_content").insert({
    content_key: revisionId,
    content_value: {
      settings: current.published,
      publishedAt: current.publishedAt,
      publishedBy: admin.email,
      note: body.note || "Version before publish",
      area: body.area || "All content",
      changedFields
    },
    updated_at: now
  });
  if (revisionResult.error) {
    return json({ ok: false, message: `Publish stopped before changing the live site: ${revisionResult.error.message}` }, { status: 500 });
  }

  const publishResult = await supabase.from("site_content").upsert(
    { content_key: publishedSiteSettingsKey, content_value: settings, updated_at: now },
    { onConflict: "content_key" }
  );
  if (publishResult.error) {
    await supabase.from("site_content").delete().eq("content_key", revisionId);
    return json({ ok: false, message: `Publish failed. The prior live version is unchanged: ${publishResult.error.message}` }, { status: 500 });
  }

  const cleanupResult = await supabase.from("site_content").delete().eq("content_key", DRAFT_KEY);
  await logAdminAuditEvent(supabase, {
    actorUserId: admin.user?.id,
    actorEmail: admin.email,
    action: "site_content_published",
    targetType: "site_content",
    targetId: publishedSiteSettingsKey,
    reason: body.note || "Published from Site Editor",
    metadata: { area: body.area || "All content", changedFields, revisionId }
  });

  revalidatePublishedSettings(changedFields, current.published, settings);
  return json({
    ok: true,
    message: cleanupResult.error ? "Published globally. The saved draft could not be cleared." : "Published globally.",
    ...(await loadState(supabase))
  });
}

export async function PATCH(request: Request) {
  return PUT(request);
}
