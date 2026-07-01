import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultQrStyle, type DemoInstrument, type QrStyle } from "../../../lib/local-demo";
import { getPublicInstrumentByCode, isRetiredPublicRecordCode } from "../../../lib/public-instruments";
import { defaultRecordTrustSettings, mergeRecordTrustSettings, recordTrustContentKey, type RecordTrustSettings } from "../../../lib/record-trust";
import { assertAccountCanWrite } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MEDIA_BUCKET = "instrument-media";
const DOCUMENT_BUCKET = "instrument-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

type AccountPlan = "free" | "paid" | "brand" | "commercial";

type SupabasePlan = "single" | "pack_10" | "pack_25" | "bulk_50" | "business" | "enterprise";

type CreateInstrumentRequest = {
  name?: string;
  brand: string;
  model: string;
  serial: string;
  year: string;
  instrumentType?: string;
  builder?: string;
  finish?: string;
  condition: "new" | "used";
  ownerName: string;
  ownerEmail?: string;
  location: string;
  visibility: "public" | "private" | "unlisted";
  summary: string;
  photos: string[];
  heroImageDataUrl?: string;
  documents?: Array<{
    name: string;
    dataUrl: string;
    visibility?: "public" | "hidden";
    documentType?: string;
    publicDescription?: string;
    privateNotes?: string;
  }>;
  customFields?: Array<{ label: string; value: string }>;
  accountPlan?: AccountPlan;
};

type UpdateInstrumentRequest = Omit<CreateInstrumentRequest, "accountPlan"> & {
  qrCode: string;
  verificationOnly?: boolean;
  verificationStatus?: "verified" | "unverified";
  authenticityStatus?: "confirmed" | "unconfirmed";
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  internalVerificationNote?: string;
  publicVerificationNote?: string;
  internalAuthenticityNote?: string;
  publicAuthenticityNote?: string;
};

type SupabaseCreateResponse = {
  ok: boolean;
  qrCode?: string;
  permanentPath?: string;
  message?: string;
};

type SupabaseReadResponse = {
  ok: boolean;
  instrument?: DemoInstrument;
  instruments?: DemoInstrument[];
  count?: number;
  message?: string;
};

type LoadRecordsResult = {
  records: DemoInstrument[];
  ownerEmail?: string;
  ownerName?: string;
  error?: string;
};

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string;
  name: string;
  brand: string;
  model: string | null;
  year: string | null;
  serial_number: string | null;
  builder: string | null;
  location: string | null;
  status: string;
  visibility: string;
  summary: string;
  hero_image_path: string | null;
  safety_status?: string | null;
  safety_status_updated_at?: string | null;
  safety_status_updated_by?: string | null;
  safety_note?: string | null;
  public_safety_note?: string | null;
  created_at: string;
};

type GuitarMediaRow = {
  guitar_id: string;
  storage_path: string;
};

type GuitarDocumentRow = {
  guitar_id: string;
  name: string;
  storage_path: string;
  is_public: boolean;
  document_type?: string | null;
  public_description?: string | null;
  private_notes?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type GuitarSpecRow = {
  guitar_id: string;
  label: string;
  value: string;
};

type GuitarTimelineRow = {
  id: string;
  guitar_id: string;
  event_date: string | null;
  event_type?: string | null;
  title: string;
  description: string | null;
  private_notes?: string | null;
  shop_name?: string | null;
  location?: string | null;
  is_public?: boolean | null;
  created_at: string;
  updated_at?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  account_status?: string | null;
  hide_public_content?: boolean | null;
};

type SiteContentRow = {
  content_key: string;
  content_value: Partial<RecordTrustSettings> | null;
};

function noStoreJson<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init.headers || {})
    }
  });
}

function revalidatePublicRecordSurfaces(qrCode: string) {
  const code = String(qrCode || "").trim().toUpperCase();
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/api/instruments");
  if (code) {
    revalidatePath(`/i/${code}`);
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function supabaseUnavailableResponse(action: "read" | "write") {
  const status = getSupabaseEnvStatus();
  const missing = status.missing.length ? status.missing.join(", ") : "Supabase server configuration";
  const message = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase is not configured for ${action}. Missing: ${missing}. Add the values to apps/web/.env.local locally and Vercel Environment Variables in production.`;

  return noStoreJson(
    { ok: false, instruments: [], count: 0, message } satisfies SupabaseReadResponse,
    { status: isProductionRuntime() ? 200 : 503 }
  );
}

function supabaseReadErrorResponse(message: string) {
  const safeMessage = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase read failed: ${message}`;

  return noStoreJson(
    { ok: false, instruments: [], count: 0, message: safeMessage } satisfies SupabaseReadResponse,
    { status: isProductionRuntime() ? 200 : 502 }
  );
}

function supabaseWriteUnavailableResponse() {
  const status = getSupabaseEnvStatus();
  const missing = status.missing.length ? status.missing.join(", ") : "Supabase server configuration";
  const message = isProductionRuntime()
    ? "QRguitar records are temporarily unavailable."
    : `Supabase is not configured for write. Missing: ${missing}. Add the values to apps/web/.env.local locally and Vercel Environment Variables in production.`;

  return noStoreJson({ ok: false, message } satisfies SupabaseCreateResponse, { status: 503 });
}

function normalizeLookupEmail(value: string) {
  const trimmed = String(value || "").trim().toLowerCase();
  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return trimmed;
  }

  const localPart = parts[0];
  const domain = parts[1];

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${localPart.split("+")[0].replace(/\./g, "")}@${domain}`;
  }

  return trimmed;
}

function makeNewPermanentQrCode() {
  return `QRG-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function mapPlan(plan: AccountPlan): SupabasePlan {
  if (plan === "brand" || plan === "commercial") {
    return "business";
  }

  if (plan === "paid") {
    return "pack_25";
  }

  return "single";
}

function isVerifiedPlan(plan: AccountPlan) {
  return plan === "paid" || plan === "brand" || plan === "commercial";
}

function readServerEmailList(key: "QRGUITAR_ADMIN_EMAILS" | "QRGUITAR_BETA_TESTER_EMAILS") {
  return (process.env[key] || "")
    .split(",")
    .map((item) => normalizeLookupEmail(item))
    .filter(Boolean);
}

function hasLaunchTestingAccess(email: string) {
  const normalized = normalizeLookupEmail(email);
  if (!normalized) {
    return false;
  }

  return [...readServerEmailList("QRGUITAR_ADMIN_EMAILS"), ...readServerEmailList("QRGUITAR_BETA_TESTER_EMAILS")].includes(normalized);
}

function readAdminEmailList() {
  return `${process.env.QRGUITAR_ADMIN_EMAILS || ""},${process.env.QRGUITAR_OWNER_EMAILS || ""}`
    .split(",")
    .map((item) => normalizeLookupEmail(item))
    .filter(Boolean);
}

async function canManageRecordVerification(supabase: ReturnType<typeof createServerSupabaseClient>, user: User) {
  if (readAdminEmailList().includes(normalizeLookupEmail(user.email || ""))) {
    return true;
  }

  if (!supabase) {
    return false;
  }

  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>();
  return profile.data?.role === "admin" || profile.data?.role === "owner";
}

function coerceAccountPlan(value: string): AccountPlan {
  if (value === "paid" || value === "brand" || value === "commercial" || value === "free") {
    return value;
  }

  return "free";
}

function mapSupabasePlanToAccountPlan(plan?: SupabasePlan | string | null): AccountPlan {
  if (plan === "business" || plan === "enterprise") {
    return "commercial";
  }

  if (plan === "pack_10" || plan === "pack_25" || plan === "bulk_50") {
    return "paid";
  }

  if (plan === "single") {
    return "free";
  }

  return "free";
}

function isDataUrl(value: string) {
  return /^data:[^;]+;base64,/.test(value || "");
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function documentExtensionForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "pdf";
  }

  if (mimeType === "text/plain") {
    return "txt";
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  return "bin";
}

function cleanDocumentText(value: unknown, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

async function uploadImageSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  ownerId: string,
  guitarId: string,
  source: string,
  prefix: string
) {
  if (!isDataUrl(source)) {
    return null;
  }

  const parsed = parseDataUrl(source);
  if (!parsed) {
    return null;
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(parsed.mimeType)) {
    throw new Error("Only PDF, JPG, PNG, and WEBP proof files are supported.");
  }

  const objectPath = `${ownerId}/${guitarId}/${prefix}-${randomUUID()}.${documentExtensionForMimeType(parsed.mimeType)}`;
  const upload = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });

  if (upload.error) {
    throw upload.error;
  }

  return objectPath;
}

async function uploadDocumentSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  ownerId: string,
  guitarId: string,
  source: string,
  prefix: string
) {
  if (!isDataUrl(source)) {
    return null;
  }

  const parsed = parseDataUrl(source);
  if (!parsed) {
    return null;
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(parsed.mimeType)) {
    throw new Error("Only PDF, JPG, PNG, and WEBP proof files are supported.");
  }

  const objectPath = `${ownerId}/${guitarId}/${prefix}-${randomUUID()}.${documentExtensionForMimeType(parsed.mimeType)}`;
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(objectPath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });

  if (upload.error) {
    throw upload.error;
  }

  return objectPath;
}

async function resolveImageSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  source: string
) {
  if (!source || source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
    return source;
  }

  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(source, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || source;
}

function isRenderablePublicMediaSource(source: string) {
  return /^(https?:|data:|blob:|\/)/i.test(source || "");
}

function publicSummary(value?: string | null) {
  const summary = String(value || "").trim();
  if (!summary) {
    return "";
  }

  if (/\b(buy now|checkout|check out the full listing|view listing)\b/i.test(summary)) {
    return "Public QRguitar record with photos, specs, and instrument details.";
  }

  return summary;
}

async function resolveDocumentSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  source: string
) {
  if (!source || source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
    return source;
  }

  const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(source, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl || source;
}

async function resolveImageSources(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  sources: string[]
) {
  return Promise.all(Array.from(new Set(sources.filter(Boolean))).map((source) => resolveImageSource(supabase, source)));
}

async function mapExistingMediaSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  rows: GuitarMediaRow[],
  source: string
) {
  if (!source || isDataUrl(source)) {
    return "";
  }

  if (rows.some((row) => row.storage_path === source)) {
    return source;
  }

  const decodedSource = decodeURIComponent(source);
  const pathFromUrl = rows.find((row) => decodedSource.includes(row.storage_path));
  if (pathFromUrl) {
    return pathFromUrl.storage_path;
  }

  for (const row of rows) {
    const signedUrl = await resolveImageSource(supabase, row.storage_path);
    if (source === signedUrl) {
      return row.storage_path;
    }
  }

  return "";
}

async function mapExistingDocumentSource(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  rows: GuitarDocumentRow[],
  source: string
) {
  if (!source || isDataUrl(source)) {
    return "";
  }

  if (rows.some((row) => row.storage_path === source)) {
    return source;
  }

  const decodedSource = decodeURIComponent(source);
  const pathFromUrl = rows.find((row) => decodedSource.includes(row.storage_path));
  if (pathFromUrl) {
    return pathFromUrl.storage_path;
  }

  for (const row of rows) {
    const signedUrl = await resolveDocumentSource(supabase, row.storage_path);
    if (source === signedUrl) {
      return row.storage_path;
    }
  }

  return "";
}

async function resolveDocumentSources(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  documents: GuitarDocumentRow[],
  includePrivate = false
) {
  return Promise.all(
    documents.map(async (document) => ({
      name: document.name,
      url: await resolveDocumentSource(supabase, document.storage_path),
      visibility: document.is_public ? "public" as const : "hidden" as const,
      documentType: document.document_type || "",
      publicDescription: document.public_description || "",
      ...(includePrivate ? { privateNotes: document.private_notes || "" } : {}),
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || ""
    }))
  );
}

function instrumentConditionFromSpec(specs: GuitarSpecRow[]) {
  const condition = specs.find((spec) => spec.label.trim().toLowerCase() === "condition")?.value?.trim().toLowerCase();
  return condition === "new" ? "new" : "used";
}

function specValue(specs: GuitarSpecRow[], label: string) {
  return specs.find((spec) => spec.label.trim().toLowerCase() === label.toLowerCase())?.value?.trim() || "";
}

function mapInstrumentRow({
  guitar,
  media,
  specs,
  ownerEmail,
  ownerName,
  trust,
  exposeInternalTrust = false
}: {
  guitar: GuitarRow;
  media: GuitarMediaRow[];
  specs: GuitarSpecRow[];
  ownerEmail?: string;
  ownerName?: string;
  trust?: RecordTrustSettings;
  exposeInternalTrust?: boolean;
}): DemoInstrument {
  const customFields = specs
    .filter((spec) => {
      const label = spec.label.trim().toLowerCase();
      return spec.label.trim() && !["condition", "type", "finish"].includes(label);
    })
    .map((spec, index) => ({
      id: `${guitar.id}-spec-${index}`,
      label: spec.label,
      value: spec.value
    }));

  const heroImageDataUrl = guitar.hero_image_path || media[0]?.storage_path || "";
  const galleryImageDataUrls = Array.from(
    new Set([heroImageDataUrl, ...media.map((item) => item.storage_path)].filter(isRenderablePublicMediaSource))
  );

  return {
    qrCode: guitar.qr_code.toUpperCase(),
    permanentPath: guitar.permanent_path || `/i/${guitar.qr_code.toUpperCase()}`,
    name: guitar.name || [guitar.brand, guitar.model].filter(Boolean).join(" ") || guitar.qr_code,
    brand: guitar.brand || "",
    model: guitar.model || "",
    serial: guitar.serial_number || "",
    year: guitar.year || "",
    instrumentCondition: instrumentConditionFromSpec(specs),
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    authenticityStatus: trust?.authenticityStatus || "unconfirmed",
    showVerificationBadge: trust?.showVerificationBadge === false ? false : true,
    showAuthenticityBadge: trust?.showAuthenticityBadge === false ? false : true,
    ...(exposeInternalTrust ? { internalVerificationNote: trust?.internalVerificationNote || "" } : {}),
    publicVerificationNote: trust?.publicVerificationNote || "",
    ...(exposeInternalTrust ? { internalAuthenticityNote: trust?.internalAuthenticityNote || "" } : {}),
    publicAuthenticityNote: trust?.publicAuthenticityNote || "",
    safetyStatus: guitar.safety_status === "lost" || guitar.safety_status === "stolen" || guitar.safety_status === "recovered" ? guitar.safety_status : "clear",
    publicSafetyNote: guitar.public_safety_note || "",
    safetyStatusUpdatedAt: guitar.safety_status_updated_at || "",
    ...(exposeInternalTrust ? { safetyNote: guitar.safety_note || "" } : {}),
    instrumentType: specValue(specs, "Type") || guitar.model || "",
    builder: guitar.builder || specValue(specs, "Builder"),
    owner: ownerName || ownerEmail || "Unclaimed",
    ownerUserEmail: ownerEmail,
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish: specValue(specs, "Finish"),
    heroImageDataUrl,
    galleryImageDataUrls,
    customFields,
    customLinks: [],
    qrStyle: defaultQrStyle as QrStyle,
    createdAt: guitar.created_at
  };
}

function mapServiceEvent(row: GuitarTimelineRow, includePrivate = false) {
  return {
    id: row.id,
    serviceDate: row.event_date || "",
    eventType: row.event_type || "",
    title: row.title || "Service entry",
    publicDescription: row.description || "",
    ...(includePrivate ? { privateNotes: row.private_notes || "" } : {}),
    shopName: row.shop_name || "",
    location: row.location || "",
    isPublic: row.is_public === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function loadServiceEventsByGuitar(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  guitarIds: string[],
  includePrivate = false
) {
  const eventsByGuitar = new Map<string, ReturnType<typeof mapServiceEvent>[]>();
  const uniqueIds = Array.from(new Set(guitarIds.filter(Boolean)));

  if (!uniqueIds.length) {
    return eventsByGuitar;
  }

  let query = supabase
    .from("guitar_timeline_events")
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at")
    .in("guitar_id", uniqueIds)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includePrivate) {
    query = query.eq("is_public", true);
  }

  const result = await query;

  if (result.error) {
    if (/column .* does not exist/i.test(result.error.message)) {
      return eventsByGuitar;
    }

    throw new Error(result.error.message);
  }

  for (const item of result.data || []) {
    const row = item as GuitarTimelineRow;
    const list = eventsByGuitar.get(row.guitar_id) || [];
    list.push(mapServiceEvent(row, includePrivate));
    eventsByGuitar.set(row.guitar_id, list);
  }

  return eventsByGuitar;
}

async function loadTrustSettingsMap(supabase: ReturnType<typeof createServerSupabaseClient>, qrCodes: string[]) {
  const trustByCode = new Map<string, RecordTrustSettings>();
  if (!supabase || !qrCodes.length) {
    return trustByCode;
  }

  const keys = qrCodes.map(recordTrustContentKey);
  const result = await supabase.from("site_content").select("content_key,content_value").in("content_key", keys);
  if (result.error) {
    return trustByCode;
  }

  for (const row of (result.data || []) as SiteContentRow[]) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value));
  }

  return trustByCode;
}

function stripAnonymousInstrumentFields(instrument: DemoInstrument) {
  const publicInstrument = { ...instrument };
  delete publicInstrument.ownerUserEmail;
  delete publicInstrument.safetyNote;
  return publicInstrument;
}

async function loadRecordsForUser(supabase: ReturnType<typeof createServerSupabaseClient>, owner: User): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [], ownerEmail: owner.email || "", ownerName: "", error: "Supabase is not configured." };
  }

  const profile = await supabase.from("profiles").select("id,display_name").eq("id", owner.id).maybeSingle<ProfileRow>();
  const guitars = await supabase.from("guitars").select("*").eq("owner_id", owner.id).order("created_at", { ascending: false });

  if (profile.error) {
    return { records: [], ownerEmail: owner.email || "", ownerName: owner.email || "", error: profile.error.message };
  }

  if (guitars.error) {
    return { records: [], ownerEmail: owner.email || "", ownerName: profile.data?.display_name || owner.email || "", error: guitars.error.message };
  }

  if (!guitars.data) {
    return { records: [], ownerEmail: owner.email || "", ownerName: profile.data?.display_name || owner.email || "" };
  }

  const guitarIds = guitars.data.map((item) => item.id);
  const trustByCode = await loadTrustSettingsMap(supabase, guitars.data.map((item) => item.qr_code));
  let serviceEventsByGuitar = new Map<string, ReturnType<typeof mapServiceEvent>[]>();
  try {
    serviceEventsByGuitar = await loadServiceEventsByGuitar(supabase, guitarIds, true);
  } catch {
    serviceEventsByGuitar = new Map();
  }
  const [mediaResult, specsResult, documentsResult] = await Promise.all([
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public,document_type,public_description,private_notes,created_at,updated_at").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const relatedError = mediaResult.error || specsResult.error || documentsResult.error;
  if (relatedError) {
    return {
      records: [],
      ownerEmail: owner.email || "",
      ownerName: profile.data?.display_name || owner.email || "",
      error: relatedError.message
    };
  }

  const mediaByGuitar = new Map<string, GuitarMediaRow[]>();
  for (const item of mediaResult.data || []) {
    const row = item as GuitarMediaRow;
    const list = mediaByGuitar.get(row.guitar_id) || [];
    list.push(row);
    mediaByGuitar.set(row.guitar_id, list);
  }

  const specsByGuitar = new Map<string, GuitarSpecRow[]>();
  for (const item of specsResult.data || []) {
    const row = item as GuitarSpecRow;
    const list = specsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    specsByGuitar.set(row.guitar_id, list);
  }

  const documentsByGuitar = new Map<string, GuitarDocumentRow[]>();
  for (const item of documentsResult.data || []) {
    const row = item as GuitarDocumentRow;
    const list = documentsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    documentsByGuitar.set(row.guitar_id, list);
  }

  return {
    records: await Promise.all(
      guitars.data.map(async (guitar) => {
        const heroStoragePath = (guitar as GuitarRow).hero_image_path || "";
        const media = await resolveImageSources(
          supabase,
          (mediaByGuitar.get(guitar.id) || [])
            .map((item) => item.storage_path)
            .filter((storagePath) => storagePath !== heroStoragePath)
        );
        const heroImagePath = heroStoragePath ? await resolveImageSource(supabase, heroStoragePath) : "";
        const documents = await resolveDocumentSources(supabase, documentsByGuitar.get(guitar.id) || [], true);

        const instrument = mapInstrumentRow({
          guitar: { ...(guitar as GuitarRow), hero_image_path: heroImagePath || (guitar as GuitarRow).hero_image_path },
          media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
          specs: specsByGuitar.get(guitar.id) || [],
          ownerEmail: owner.email || "",
          ownerName: profile.data?.display_name || owner.user_metadata?.display_name || owner.email || "",
          trust: trustByCode.get((guitar as GuitarRow).qr_code.toUpperCase()),
          exposeInternalTrust: true
        });
        instrument.documentFiles = documents;
        instrument.serviceEvents = serviceEventsByGuitar.get(guitar.id) || [];
        return instrument;
      })
    ),
    ownerEmail: owner.email || "",
    ownerName: profile.data?.display_name || owner.user_metadata?.display_name || owner.email || ""
  };
}

async function loadPublicRecords(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [] as DemoInstrument[], error: "Supabase is not configured." };
  }

  const guitars = await supabase
    .from("guitars")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (guitars.error) {
    return { records: [] as DemoInstrument[], error: guitars.error.message };
  }

  if (!guitars.data) {
    return { records: [] as DemoInstrument[] };
  }

  const guitarIds = guitars.data.map((item) => item.id);
  const trustByCode = await loadTrustSettingsMap(supabase, guitars.data.map((item) => item.qr_code));
  let serviceEventsByGuitar = new Map<string, ReturnType<typeof mapServiceEvent>[]>();
  try {
    serviceEventsByGuitar = await loadServiceEventsByGuitar(supabase, guitarIds, false);
  } catch {
    serviceEventsByGuitar = new Map();
  }
  const [mediaResult, specsResult, documentsResult, profilesResult] = await Promise.all([
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public,document_type,public_description,created_at,updated_at").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("profiles").select("id,display_name,account_status,hide_public_content").in("id", guitars.data.map((item) => item.owner_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [], error: null })
  ]);

  let profileRows = (profilesResult.data || []) as ProfileRow[];
  let profilesError = profilesResult.error;
  if (profilesError && /column .* does not exist/i.test(profilesError.message || "")) {
    const fallbackProfiles = await supabase.from("profiles").select("id,display_name").in("id", guitars.data.map((item) => item.owner_id).filter(Boolean) as string[]);
    profileRows = (fallbackProfiles.data || []) as ProfileRow[];
    profilesError = fallbackProfiles.error;
  }

  const relatedError = mediaResult.error || specsResult.error || documentsResult.error || profilesError;
  if (relatedError) {
    return { records: [] as DemoInstrument[], error: relatedError.message };
  }

  const mediaByGuitar = new Map<string, GuitarMediaRow[]>();
  for (const item of mediaResult.data || []) {
    const row = item as GuitarMediaRow;
    const list = mediaByGuitar.get(row.guitar_id) || [];
    list.push(row);
    mediaByGuitar.set(row.guitar_id, list);
  }

  const specsByGuitar = new Map<string, GuitarSpecRow[]>();
  for (const item of specsResult.data || []) {
    const row = item as GuitarSpecRow;
    const list = specsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    specsByGuitar.set(row.guitar_id, list);
  }

  const documentsByGuitar = new Map<string, GuitarDocumentRow[]>();
  for (const item of documentsResult.data || []) {
    const row = item as GuitarDocumentRow;
    const list = documentsByGuitar.get(row.guitar_id) || [];
    list.push(row);
    documentsByGuitar.set(row.guitar_id, list);
  }

  const profilesById = new Map<string, ProfileRow>();
  for (const item of profileRows) {
    const row = item as ProfileRow;
    profilesById.set(row.id, row);
  }

  const visibleGuitars = guitars.data.filter((guitar) => {
    const profile = profilesById.get((guitar as GuitarRow).owner_id || "");
    return !(profile?.hide_public_content === true && (profile.account_status === "locked" || profile.account_status === "banned"));
  });

  return {
    records: await Promise.all(
      visibleGuitars.map(async (guitar) => {
        const heroStoragePath = (guitar as GuitarRow).hero_image_path || "";
        const media = await resolveImageSources(
          supabase,
          (mediaByGuitar.get(guitar.id) || [])
            .map((item) => item.storage_path)
            .filter((storagePath) => storagePath !== heroStoragePath)
        );
        const heroImagePath = heroStoragePath ? await resolveImageSource(supabase, heroStoragePath) : "";
        const documents = await resolveDocumentSources(supabase, (documentsByGuitar.get(guitar.id) || []).filter((document) => document.is_public));

        const instrument = mapInstrumentRow({
          guitar: { ...(guitar as GuitarRow), hero_image_path: heroImagePath || (guitar as GuitarRow).hero_image_path },
          media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
          specs: specsByGuitar.get(guitar.id) || [],
          ownerEmail: "",
          ownerName: profilesById.get(guitar.owner_id || "")?.display_name || guitar.builder || "",
          trust: trustByCode.get((guitar as GuitarRow).qr_code.toUpperCase())
        });
        instrument.documentFiles = documents;
        instrument.serviceEvents = serviceEventsByGuitar.get(guitar.id) || [];
        return stripAnonymousInstrumentFields(instrument);
      })
    )
  };
}

export async function GET(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return supabaseUnavailableResponse("read");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const scope = url.searchParams.get("scope") || "";

  if (scope === "mine") {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) {
      return noStoreJson({ ok: false, instruments: [], count: 0, message: auth.error || "Sign in required." } satisfies SupabaseReadResponse, { status: 401 });
    }

    if (code) {
      const ownerRecord = await loadRecordsForUser(supabase, auth.user);
      if (ownerRecord.error) {
        return supabaseReadErrorResponse(ownerRecord.error);
      }

      const instrument = ownerRecord.records.find((record) => record.qrCode.toUpperCase() === code.toUpperCase());
      if (!instrument) {
        return noStoreJson({ ok: false, message: "Instrument not found for this account." } satisfies SupabaseReadResponse, { status: 404 });
      }

      return noStoreJson(
        { ok: true, instrument, canManageVerification: await canManageRecordVerification(supabase, auth.user) } as SupabaseReadResponse & { canManageVerification: boolean },
        { status: 200 }
      );
    }

    const result = await loadRecordsForUser(supabase, auth.user);
    if (result.error) {
      return supabaseReadErrorResponse(result.error);
    }

    return noStoreJson(
      { ok: true, instruments: result.records, count: result.records.length } satisfies SupabaseReadResponse,
      { status: 200 }
    );
  }

  if (code) {
    if (isRetiredPublicRecordCode(code)) {
      return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }

    const publicLookup = await getPublicInstrumentByCode(code)
      .then((instrument) => ({ instrument, error: "" }))
      .catch((error: Error) => ({ instrument: null, error: error.message || "Could not load public instrument." }));

    if (publicLookup.error) {
      return supabaseReadErrorResponse(publicLookup.error);
    }

    if (!publicLookup.instrument) {
      return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }

    return noStoreJson({ ok: true, instrument: stripAnonymousInstrumentFields(publicLookup.instrument) } satisfies SupabaseReadResponse, { status: 200 });
  }

  const publicResult = await loadPublicRecords(supabase);
  if (publicResult.error) {
    return supabaseReadErrorResponse(publicResult.error);
  }

  return noStoreJson(
    { ok: true, instruments: publicResult.records, count: publicResult.records.length } satisfies SupabaseReadResponse,
    { status: 200 }
  );
}

export async function POST(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return supabaseWriteUnavailableResponse();
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error || "Sign in required." } satisfies SupabaseCreateResponse, { status: 401 });
  }

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) {
    return NextResponse.json({ ok: false, message: writeAccess.message } satisfies SupabaseCreateResponse, { status: writeAccess.status });
  }

  let body: CreateInstrumentRequest;

  try {
    body = (await request.json()) as CreateInstrumentRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." } satisfies SupabaseCreateResponse, { status: 400 });
  }

  const input = {
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    serial: String(body.serial || "").trim(),
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  if (!input.brand || !input.model || !input.serial) {
    return NextResponse.json({ ok: false, message: "Brand, model, and serial are required." }, { status: 400 });
  }

  const ownerUser = auth.user;
  const currentProfile = await supabase.from("profiles").select("plan,role").eq("id", ownerUser.id).maybeSingle<{ plan?: SupabasePlan; role?: string }>();
  if (currentProfile.error) {
    return NextResponse.json({ ok: false, message: "Could not read user profile." }, { status: 500 });
  }

  const resolvedAccountPlan = hasLaunchTestingAccess(ownerUser.email || "")
    ? "commercial"
    : mapSupabasePlanToAccountPlan(currentProfile.data?.plan);
  const profileUpsert = await supabase.from("profiles").upsert({
    id: ownerUser.id,
    display_name: input.ownerName || ownerUser.user_metadata?.display_name || ownerUser.email || "",
    role: (currentProfile.data?.role as "owner" | "builder" | "shop" | "admin") || "owner",
    plan: mapPlan(resolvedAccountPlan),
    created_at: new Date().toISOString()
  });

  if (profileUpsert.error) {
    return NextResponse.json({ ok: false, message: "Could not sync user profile." }, { status: 500 });
  }

  const existingProfileCount = await supabase.from("guitars").select("*", { count: "exact", head: true }).eq("owner_id", ownerUser.id);
  if (existingProfileCount.error) {
    return NextResponse.json({ ok: false, message: "Could not verify user record limit." }, { status: 500 });
  }

  const instrumentCount = existingProfileCount.count ?? 0;
  if (instrumentCount < 0) {
    return NextResponse.json({ ok: false, message: "Could not verify user record limit." }, { status: 500 });
  }

  if (!isVerifiedPlan(resolvedAccountPlan) && instrumentCount >= 25) {
    return NextResponse.json(
      { ok: false, message: "Free public beta accounts can create up to 25 records. Contact QRguitar for commercial setup or bulk onboarding." },
      { status: 402 }
    );
  }

  // New records get a permanent QRguitar ID independent of the serial/build ID.
  // Existing legacy IDs like QRG-E985125 and QRG-05068283 remain unchanged forever.
  let qrCode = makeNewPermanentQrCode();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { count } = await supabase.from("guitars").select("id", { count: "exact", head: true }).eq("qr_code", qrCode);
    if (!count) {
      break;
    }

    qrCode = makeNewPermanentQrCode();
  }

  const uploadedSources = Array.from(new Set([body.heroImageDataUrl || "", ...input.photos].filter(Boolean)));
  const uploadedMediaPaths: string[] = [];
  const mediaUploadErrors: string[] = [];
  for (const [index, source] of uploadedSources.entries()) {
    try {
      const uploadedPath = await uploadImageSource(supabase, ownerUser.id, qrCode, source, `media-${index + 1}`);
      if (uploadedPath) {
        uploadedMediaPaths.push(uploadedPath);
      }
    } catch {
      mediaUploadErrors.push(`Photo ${index + 1}`);
    }
  }

  const heroImagePath = uploadedMediaPaths[0] || null;
  const permanentPath = `/i/${qrCode}`;

  const guitarPayload = {
    owner_id: ownerUser.id,
    qr_code: qrCode,
    permanent_path: permanentPath,
    name: input.name || `${input.brand} ${input.model}`.trim(),
    brand: input.brand,
    model: input.model,
    year: input.year || null,
    serial_number: input.serial,
    builder: input.builder || null,
    location: input.location || null,
    status: (isVerifiedPlan(resolvedAccountPlan) ? "verified" : "unverified") as "verified" | "unverified" | "transferred",
    visibility: input.visibility as "public" | "unlisted" | "private",
    summary: input.summary || "",
    hero_image_path: heroImagePath
  };

  const { data: insertedGuitar, error: insertError } = await supabase
    .from("guitars")
    .insert(guitarPayload)
    .select("id,qr_code,permanent_path")
    .single();

  if (insertError || !insertedGuitar) {
    return NextResponse.json(
      { ok: false, message: insertError?.message || "Could not create guitar record." },
      { status: 500 }
    );
  }

  if (uploadedMediaPaths.length > 0) {
    const mediaPayload = uploadedMediaPaths.slice(0, 20).map((storagePath, index) => ({
      guitar_id: insertedGuitar.id,
      storage_path: storagePath.slice(0, 2000),
      alt: `Instrument media ${index + 1}`,
      sort_order: index
    }));

    const mediaInsert = await supabase.from("guitar_media").insert(mediaPayload);
    if (mediaInsert.error) {
      revalidatePublicRecordSurfaces(insertedGuitar.qr_code);
      return noStoreJson(
        { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Media placeholders could not be saved." },
        { status: 200 }
      );
    }
  }

  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean; documentType: string; publicDescription: string; privateNotes: string }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, insertedGuitar.id, document.dataUrl, `document-${index + 1}`);
    if (uploadedPath) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: uploadedPath,
        isPublic: document.visibility === "public",
        documentType: cleanDocumentText(document.documentType, 80) || "Other",
        publicDescription: cleanDocumentText(document.publicDescription, 1000),
        privateNotes: cleanDocumentText(document.privateNotes, 2000)
      });
    }
  }

  if (uploadedDocuments.length > 0) {
    const documentPayload = uploadedDocuments.map((document) => ({
      guitar_id: insertedGuitar.id,
      name: document.name.slice(0, 200),
      storage_path: document.storagePath.slice(0, 2000),
      is_public: document.isPublic,
      uploaded_by_user_id: ownerUser.id,
      file_name: document.name.slice(0, 255),
      document_type: document.documentType,
      public_description: document.publicDescription || null,
      private_notes: document.privateNotes || null
    }));

    const documentInsert = await supabase.from("guitar_documents").insert(documentPayload);
    if (documentInsert.error) {
      revalidatePublicRecordSurfaces(insertedGuitar.qr_code);
      return noStoreJson(
        { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Document files could not be saved." },
        { status: 200 }
      );
    }
  }

  const specRows = [
    { guitar_id: insertedGuitar.id, label: "Condition", value: input.condition, sort_order: 1 },
    ...(input.instrumentType ? [{ guitar_id: insertedGuitar.id, label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
    ...(input.finish ? [{ guitar_id: insertedGuitar.id, label: "Finish", value: input.finish, sort_order: 3 }] : []),
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: insertedGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 4
      }))
  ];
  const specInsert = await supabase.from("guitar_specs").insert(specRows);

  if (specInsert.error) {
    revalidatePublicRecordSurfaces(insertedGuitar.qr_code);
    return noStoreJson(
      { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Condition details could not be saved." },
      { status: 200 }
    );
  }

  revalidatePublicRecordSurfaces(insertedGuitar.qr_code);
  return noStoreJson(
    {
      ok: true,
      qrCode: insertedGuitar.qr_code,
      permanentPath: insertedGuitar.permanent_path,
      message: mediaUploadErrors.length ? `${mediaUploadErrors.join(", ")} could not be uploaded. The record was saved.` : undefined
    },
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return supabaseWriteUnavailableResponse();
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error || "Sign in required." } satisfies SupabaseCreateResponse, { status: 401 });
  }

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) {
    return NextResponse.json({ ok: false, message: writeAccess.message } satisfies SupabaseCreateResponse, { status: writeAccess.status });
  }

  let body: UpdateInstrumentRequest;

  try {
    body = (await request.json()) as UpdateInstrumentRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." } satisfies SupabaseCreateResponse, { status: 400 });
  }

  if (body.verificationOnly) {
    const qrCode = String(body.qrCode || "").trim().toUpperCase();
    const verificationStatus = body.verificationStatus === "verified" ? "verified" : "unverified";
    const authenticityStatus = body.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
    if (!qrCode) {
      return NextResponse.json({ ok: false, message: "Missing QRguitar ID." }, { status: 400 });
    }

    const existing = await supabase.from("guitars").select("id,owner_id,status").eq("qr_code", qrCode).maybeSingle<GuitarRow>();
    if (existing.error || !existing.data) {
      return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
    }

    const isRecordOwner = existing.data.owner_id === auth.user.id;
    const isAdmin = await canManageRecordVerification(supabase, auth.user);
    if (!isRecordOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Only the record owner or QRguitar admin can change badge display." }, { status: 403 });
    }

    if (isAdmin) {
      const result = await supabase
        .from("guitars")
        .update({ status: verificationStatus, updated_at: new Date().toISOString() })
        .eq("qr_code", qrCode);

      if (result.error) {
        return NextResponse.json({ ok: false, message: result.error.message || "Could not update verification." }, { status: 500 });
      }
    }

    const currentTrust = (await loadTrustSettingsMap(supabase, [qrCode])).get(qrCode) || defaultRecordTrustSettings;
    const trust = mergeRecordTrustSettings({
      ...currentTrust,
      authenticityStatus: isAdmin ? authenticityStatus : currentTrust.authenticityStatus,
      showVerificationBadge: typeof body.showVerificationBadge === "boolean" ? body.showVerificationBadge : currentTrust.showVerificationBadge,
      showAuthenticityBadge: typeof body.showAuthenticityBadge === "boolean" ? body.showAuthenticityBadge : currentTrust.showAuthenticityBadge,
      internalVerificationNote: isAdmin ? body.internalVerificationNote : currentTrust.internalVerificationNote,
      publicVerificationNote: isAdmin ? body.publicVerificationNote : currentTrust.publicVerificationNote,
      internalAuthenticityNote: isAdmin ? body.internalAuthenticityNote : currentTrust.internalAuthenticityNote,
      publicAuthenticityNote: isAdmin ? body.publicAuthenticityNote : currentTrust.publicAuthenticityNote
    });
    const trustResult = await supabase.from("site_content").upsert(
      {
        content_key: recordTrustContentKey(qrCode),
        content_value: trust,
        updated_at: new Date().toISOString()
      },
      { onConflict: "content_key" }
    );
    if (trustResult.error) {
      return NextResponse.json({ ok: false, message: trustResult.error.message || "Could not update trust settings." }, { status: 500 });
    }

    revalidatePublicRecordSurfaces(qrCode);
    return noStoreJson({
      ok: true,
      qrCode,
      permanentPath: `/i/${qrCode}`,
      message: "Trust settings updated.",
      verificationStatus: isAdmin ? verificationStatus : existing.data.status === "verified" ? "verified" : "unverified",
      ...trust
    }, { status: 200 });
  }

  const input = {
    qrCode: String(body.qrCode || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    serial: String(body.serial || "").trim(),
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  if (!input.qrCode || !input.brand || !input.model || !input.serial) {
    return NextResponse.json({ ok: false, message: "Missing required fields." }, { status: 400 });
  }

  const ownerUser = auth.user;
  const existing = await supabase.from("guitars").select("id,owner_id,status,hero_image_path").eq("qr_code", input.qrCode).maybeSingle<GuitarRow>();
  if (existing.error || !existing.data) {
    return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  if (existing.data.owner_id !== ownerUser.id) {
    return NextResponse.json({ ok: false, message: "Only the owner can edit this record." }, { status: 403 });
  }

  const currentProfile = await supabase.from("profiles").select("plan,role").eq("id", ownerUser.id).maybeSingle<{ plan?: SupabasePlan; role?: string }>();
  if (currentProfile.error) {
    return NextResponse.json({ ok: false, message: "Could not read user profile." }, { status: 500 });
  }

  const profilePlan: SupabasePlan = hasLaunchTestingAccess(ownerUser.email || "")
    ? "business"
    : currentProfile.data?.plan || "single";

  const profileUpsert = await supabase.from("profiles").upsert({
    id: ownerUser.id,
    display_name: input.ownerName || ownerUser.user_metadata?.display_name || ownerUser.email || "",
    role: currentProfile.data?.role || "owner",
    plan: profilePlan,
    created_at: new Date().toISOString()
  });

  if (profileUpsert.error) {
    return NextResponse.json({ ok: false, message: "Could not sync user profile." }, { status: 500 });
  }

  const currentHeroPath = existing.data.hero_image_path || null;
  const existingMediaResult = await supabase
    .from("guitar_media")
    .select("guitar_id,storage_path")
    .eq("guitar_id", existing.data.id);
  if (existingMediaResult.error) {
    return NextResponse.json({ ok: false, message: "Could not read existing photos." }, { status: 500 });
  }

  const existingMediaRows = (existingMediaResult.data || []) as GuitarMediaRow[];
  const updatedMediaSources = Array.from(new Set([body.heroImageDataUrl || "", ...input.photos].filter(Boolean)));
  const heroCandidate = body.heroImageDataUrl || updatedMediaSources[0] || "";
  const uploadedHeroPath = heroCandidate ? await uploadImageSource(supabase, ownerUser.id, existing.data.id, heroCandidate, "hero") : null;
  const mappedHeroPath = heroCandidate ? await mapExistingMediaSource(supabase, existingMediaRows, heroCandidate) : "";
  const heroImagePath = heroCandidate ? uploadedHeroPath || mappedHeroPath || currentHeroPath : null;
  const { error: updateError } = await supabase
    .from("guitars")
    .update({
      name: input.name || `${input.brand} ${input.model}`.trim(),
      brand: input.brand,
      model: input.model,
      year: input.year || null,
      serial_number: input.serial,
      builder: input.builder || null,
      location: input.location || null,
      status: existing.data.status,
      visibility: input.visibility,
      summary: input.summary || "",
      hero_image_path: heroImagePath,
      updated_at: new Date().toISOString()
    })
    .eq("qr_code", input.qrCode)
    .eq("owner_id", ownerUser.id);

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message || "Could not update record." }, { status: 500 });
  }

  const existingGuitar = existing.data;
  if (!existingGuitar) {
    return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  const persistedMediaPaths: string[] = [];
  const mediaUploadErrors: string[] = [];
  for (const [index, source] of updatedMediaSources.entries()) {
    try {
      const uploadedPath = await uploadImageSource(supabase, ownerUser.id, existingGuitar.id, source, `media-${index + 1}`);
      const existingPath = uploadedPath || await mapExistingMediaSource(supabase, existingMediaRows, source);
      if (existingPath && !persistedMediaPaths.includes(existingPath)) {
        persistedMediaPaths.push(existingPath);
      }
    } catch {
      mediaUploadErrors.push(`Photo ${index + 1}`);
    }
  }

  await supabase.from("guitar_media").delete().eq("guitar_id", existingGuitar.id);
  if (persistedMediaPaths.length > 0) {
    const mediaPayload = persistedMediaPaths.map((storagePath, index) => ({
      guitar_id: existingGuitar.id,
      storage_path: storagePath.slice(0, 2000),
      alt: `Instrument media ${index + 1}`,
      sort_order: index
    }));

    const mediaInsert = await supabase.from("guitar_media").insert(mediaPayload);
    if (mediaInsert.error) {
      revalidatePublicRecordSurfaces(input.qrCode);
      return noStoreJson({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Media placeholders could not be refreshed." }, { status: 200 });
    }
  }

  const existingDocumentsResult = await supabase
    .from("guitar_documents")
    .select("guitar_id,name,storage_path,is_public,document_type,public_description,private_notes,created_at,updated_at")
    .eq("guitar_id", existingGuitar.id);
  const existingDocuments = ((existingDocumentsResult.data || []) as GuitarDocumentRow[]);
  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean; documentType: string; publicDescription: string; privateNotes: string }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, existingGuitar.id, document.dataUrl, `document-${index + 1}`);
    const metadata = {
      documentType: cleanDocumentText(document.documentType, 80) || "Other",
      publicDescription: cleanDocumentText(document.publicDescription, 1000),
      privateNotes: cleanDocumentText(document.privateNotes, 2000)
    };
    if (uploadedPath) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: uploadedPath,
        isPublic: document.visibility === "public",
        ...metadata
      });
      continue;
    }

    const existingPath = await mapExistingDocumentSource(supabase, existingDocuments, document.dataUrl);
    const existingDocument = existingPath
      ? existingDocuments.find((item) => item.storage_path === existingPath)
      : existingDocuments.find((item) => item.name === document.name);
    if (existingDocument) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: existingDocument.storage_path,
        isPublic: document.visibility === "public",
        ...metadata
      });
    }
  }

  const nextDocumentPaths = new Set(uploadedDocuments.map((document) => document.storagePath));
  const removedDocumentPaths = existingDocuments
    .filter((document) => !nextDocumentPaths.has(document.storage_path))
    .map((document) => document.storage_path)
    .filter(Boolean);
  if (removedDocumentPaths.length > 0) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove(removedDocumentPaths);
  }

  await supabase.from("guitar_documents").delete().eq("guitar_id", existingGuitar.id);
  if (uploadedDocuments.length > 0) {
    const documentPayload = uploadedDocuments.map((document) => ({
      guitar_id: existingGuitar.id,
      name: document.name.slice(0, 200),
      storage_path: document.storagePath.slice(0, 2000),
      is_public: document.isPublic,
      uploaded_by_user_id: ownerUser.id,
      file_name: document.name.slice(0, 255),
      document_type: document.documentType,
      public_description: document.publicDescription || null,
      private_notes: document.privateNotes || null,
      updated_at: new Date().toISOString()
    }));
    const documentInsert = await supabase.from("guitar_documents").insert(documentPayload);
    if (documentInsert.error) {
      revalidatePublicRecordSurfaces(input.qrCode);
      return noStoreJson({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Document files could not be refreshed." }, { status: 200 });
    }
  }

  await supabase.from("guitar_specs").delete().eq("guitar_id", existingGuitar.id);
  const specRows = [
    { guitar_id: existingGuitar.id, label: "Condition", value: input.condition, sort_order: 1 },
    ...(input.instrumentType ? [{ guitar_id: existingGuitar.id, label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
    ...(input.finish ? [{ guitar_id: existingGuitar.id, label: "Finish", value: input.finish, sort_order: 3 }] : []),
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: existingGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 4
      }))
  ];
  const specInsert = await supabase.from("guitar_specs").insert(specRows);
  if (specInsert.error) {
    revalidatePublicRecordSurfaces(input.qrCode);
    return noStoreJson({ ok: true, qrCode: input.qrCode, permanentPath: `/i/${input.qrCode}`, message: "Saved. Condition details could not be refreshed." }, { status: 200 });
  }

  revalidatePublicRecordSurfaces(input.qrCode);
  return noStoreJson({
    ok: true,
    qrCode: input.qrCode,
    permanentPath: `/i/${input.qrCode}`,
    message: mediaUploadErrors.length ? `${mediaUploadErrors.join(", ")} could not be uploaded. The record was saved.` : undefined
  }, { status: 200 });
}
