import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, createServerSupabaseClientWithTimeout, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { supabaseHttpsJson, supabaseSignedStorageUrl, supabaseStoragePublicUrl } from "../../../lib/supabase-http";
import { defaultQrStyle, type DemoInstrument, type QrStyle } from "../../../lib/local-demo";
import { establishedInstrumentBrands, instrumentBrandKey } from "../../../lib/instrument-brands";
import { defaultRecordTrustSettings, mergeRecordTrustSettings, recordTrustContentKey, type RecordTrustSettings } from "../../../lib/record-trust";
import { assertAccountCanWrite, logAdminAuditEvent } from "../../../lib/admin-auth";
import { qrCodeFromSerial } from "../../../lib/qrguitar-id";
import { isEligiblePublicProfile, isRetiredPublicProfileCode, normalizePublicProfileCode } from "../../../lib/public-profile-eligibility";
import { getPublicInstrumentByCode, getPublicInstruments } from "../../../lib/public-instruments";
import {
  availabilityFromSpecs,
  isManagedInstrumentSpec,
  normalizeSerialBuildId,
  originalityFromSpecs,
  sanitizePublicInstrument,
  specValue
} from "../../../lib/instrument-profile-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MEDIA_BUCKET = "instrument-media";
const DOCUMENT_BUCKET = "instrument-documents";
const PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
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
  serialNotUsed?: boolean;
  year: string;
  instrumentType?: string;
  builder?: string;
  finish?: string;
  condition: "new" | "used";
  saleStatus?: "for_sale" | "not_for_sale";
  originalityStatus?: "all_original" | "modified" | "unknown";
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
    issuerSource?: string;
    documentDate?: string;
    description?: string;
  }>;
  customFields?: Array<{ label: string; value: string }>;
  accountPlan?: AccountPlan;
  showSerialPublic?: boolean;
};

type UpdateInstrumentRequest = Omit<CreateInstrumentRequest, "accountPlan"> & {
  qrCode: string;
  action?: "remove_from_collection" | "restore_to_collection";
  reason?: string;
  verificationOnly?: boolean;
  verificationStatus?: "verified" | "unverified";
  authenticityStatus?: "confirmed" | "unconfirmed";
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  showSerialPublic?: boolean;
  serialExceptionApproved?: boolean;
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
  no_serial_used?: boolean | null;
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
  admin_archived_at?: string | null;
  admin_archived_by?: string | null;
  admin_archive_reason?: string | null;
  owner_removed_at?: string | null;
  owner_removed_by?: string | null;
  owner_removed_reason?: string | null;
  created_at: string;
};

type GuitarMediaRow = {
  guitar_id: string;
  storage_path: string;
};

type TransferCountRow = {
  guitar_id: string;
};

type GuitarDocumentRow = {
  guitar_id: string;
  name: string;
  storage_path: string;
  is_public: boolean;
  document_type?: string | null;
  public_description?: string | null;
  private_notes?: string | null;
  issuer_source?: string | null;
  document_date?: string | null;
  description?: string | null;
  file_size_bytes?: number | null;
  related_timeline_event_id?: string | null;
  related_service_event_id?: string | null;
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
  date_precision?: "day" | "month" | "year" | "unknown" | null;
  category?: string | null;
  is_system?: boolean | null;
  related_document_id?: string | null;
  related_media_id?: string | null;
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
    ? "QRguitar Profiles are temporarily unavailable."
    : `Supabase is not configured for ${action}. Missing: ${missing}. Add the values to apps/web/.env.local locally and Vercel Environment Variables in production.`;

  return noStoreJson(
    { ok: false, instruments: [], count: 0, message } satisfies SupabaseReadResponse,
    { status: isProductionRuntime() ? 200 : 503 }
  );
}

function supabaseReadErrorResponse(message: string) {
  const safeMessage = isProductionRuntime()
    ? "QRguitar Profiles are temporarily unavailable."
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
    ? "QRguitar Profiles are temporarily unavailable."
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

async function resolveRedirectedQrCode(code: string) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) {
    return "";
  }

  const redirects = await restGet<Array<{ guitar_id: string }>>(
    `qr_redirects?select=guitar_id&old_path=eq.${encodeURIComponent(`/i/${normalizedCode}`)}&active=eq.true&limit=1`
  );
  const guitarId = redirects[0]?.guitar_id;
  if (!guitarId) {
    return normalizedCode;
  }

  const guitars = await restGet<Array<{ qr_code: string }>>(
    `guitars?select=qr_code&id=eq.${encodeURIComponent(guitarId)}&limit=1`
  );
  return guitars[0]?.qr_code?.toUpperCase() || normalizedCode;
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

function hasExpandedPlanAccess(plan: AccountPlan) {
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

async function canApproveSerialCorrection(supabase: ReturnType<typeof createServerSupabaseClient>, user: User) {
  if (readAdminEmailList().includes(normalizeLookupEmail(user.email || ""))) {
    return true;
  }

  if (!supabase) {
    return false;
  }

  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>();
  return profile.data?.role === "admin";
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

  if (!ALLOWED_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
    throw new Error("Only JPG, PNG, and WEBP instrument photos are supported.");
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
  void supabase;
  if (!source || source.startsWith("http://") || source.startsWith("https://") || source.startsWith("data:")) {
    return source;
  }

  return resolvePublicMediaUrl(source);
}

function isRenderablePublicMediaSource(source: string) {
  return /^(https?:|data:|blob:|\/)/i.test(source || "");
}

function publicSummary(value?: string | null) {
  const summary = String(value || "").trim();
  if (!summary) {
    return "";
  }

  if (/\bpublic\s+QRguitar\s+record\b/i.test(summary)) {
    return summary.replace(/\bpublic\s+QRguitar\s+record\b/gi, "QRguitar Profile");
  }

  if (/\b(buy now|checkout|check out the full listing|view listing)\b/i.test(summary)) {
    return "QRguitar Profile with photos, specs, and instrument details.";
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

  return supabase.storage.from(DOCUMENT_BUCKET).getPublicUrl(source).data.publicUrl || source;
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

function saleStatusFromSpec(specs: GuitarSpecRow[]) {
  return availabilityFromSpecs(specs);
}

function originalityStatusFromSpec(specs: GuitarSpecRow[]) {
  return originalityFromSpecs(specs);
}

function mapInstrumentRow({
  guitar,
  media,
  specs,
  ownerEmail,
  ownerName,
  trust,
  exposeInternalTrust = false,
  ownershipTransferCount = 0
}: {
  guitar: GuitarRow;
  media: GuitarMediaRow[];
  specs: GuitarSpecRow[];
  ownerEmail?: string;
  ownerName?: string;
  trust?: RecordTrustSettings;
  exposeInternalTrust?: boolean;
  ownershipTransferCount?: number;
}): DemoInstrument {
  const customFields = specs
    .filter((spec) => {
      return spec.label.trim() && !isManagedInstrumentSpec(spec.label);
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
    serial: exposeInternalTrust || trust?.showSerialPublic === true ? guitar.serial_number || "" : "",
    serialNotUsed: guitar.no_serial_used === true,
    year: guitar.year || "",
    instrumentCondition: instrumentConditionFromSpec(specs),
    saleStatus: saleStatusFromSpec(specs),
    originalityStatus: originalityStatusFromSpec(specs),
    creatorAccountType: "customer",
    packageIncludesFirstTransfer: false,
    verificationStatus: guitar.status === "verified" ? "verified" : "unverified",
    authenticityStatus: trust?.authenticityStatus || "unconfirmed",
    showVerificationBadge: trust?.showVerificationBadge === false ? false : true,
    showAuthenticityBadge: trust?.showAuthenticityBadge === false ? false : true,
    showSerialPublic: trust?.showSerialPublic === true,
    serialExceptionApproved: trust?.serialExceptionApproved === true,
    ...(exposeInternalTrust ? { internalVerificationNote: trust?.internalVerificationNote || "" } : {}),
    publicVerificationNote: trust?.publicVerificationNote || "",
    ...(exposeInternalTrust ? { internalAuthenticityNote: trust?.internalAuthenticityNote || "" } : {}),
    publicAuthenticityNote: trust?.publicAuthenticityNote || "",
    safetyStatus: guitar.safety_status === "lost" || guitar.safety_status === "stolen" || guitar.safety_status === "recovered" ? guitar.safety_status : "clear",
    publicSafetyNote: guitar.public_safety_note || "",
    safetyStatusUpdatedAt: guitar.safety_status_updated_at || "",
    ...(exposeInternalTrust ? { safetyNote: guitar.safety_note || "" } : {}),
    ...(guitar.owner_removed_at ? { collectionRemovedAt: guitar.owner_removed_at, collectionRemovedReason: guitar.owner_removed_reason || "" } : {}),
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
    ownershipTransferCount,
    qrStyle: defaultQrStyle as QrStyle,
    createdAt: guitar.created_at
  };
}

function mapServiceEvent(row: GuitarTimelineRow, includePrivate = false) {
  return {
    id: row.id,
    serviceDate: row.event_date || "",
    datePrecision: row.date_precision || (row.event_date ? "day" : "unknown"),
    category: row.category || row.event_type || "Other",
    eventType: row.event_type || "",
    title: row.title || "Service entry",
    publicDescription: row.description || "",
    ...(includePrivate ? { privateNotes: row.private_notes || "" } : {}),
    shopName: row.shop_name || "",
    location: row.location || "",
    isPublic: row.is_public === true,
    isSystem: row.is_system === true,
    relatedDocumentId: row.related_document_id || undefined,
    relatedMediaId: row.related_media_id || undefined,
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
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at,date_precision,category,is_system,related_document_id,related_media_id")
    .in("guitar_id", uniqueIds)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includePrivate) {
    query = query.eq("is_public", true);
  }

  const result = await query;

  if (result.error) {
    if (/column .* does not exist/i.test(result.error.message)) {
      const legacyResult = await supabase
        .from("guitar_timeline_events")
        .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at")
        .in("guitar_id", uniqueIds)
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (legacyResult.error) return eventsByGuitar;
      for (const item of legacyResult.data || []) {
        const row = item as GuitarTimelineRow;
        if (!includePrivate && row.is_public !== true) continue;
        eventsByGuitar.set(row.guitar_id, [...(eventsByGuitar.get(row.guitar_id) || []), mapServiceEvent(row, includePrivate)]);
      }
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

async function loadAcceptedTransferCounts(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  guitarIds: string[]
) {
  const counts = new Map<string, number>();
  const uniqueIds = Array.from(new Set(guitarIds.filter(Boolean)));
  if (!supabase || !uniqueIds.length) {
    return counts;
  }

  const result = await supabase
    .from("ownership_transfers")
    .select("guitar_id")
    .in("guitar_id", uniqueIds)
    .eq("status", "accepted");

  if (result.error) {
    return counts;
  }

  for (const row of (result.data || []) as TransferCountRow[]) {
    if (row.guitar_id) {
      counts.set(row.guitar_id, (counts.get(row.guitar_id) || 0) + 1);
    }
  }

  return counts;
}

async function loadTrustSettingsMap(_supabase: ReturnType<typeof createServerSupabaseClient>, qrCodes: string[]) {
  const trustByCode = new Map<string, RecordTrustSettings>();
  if (!qrCodes.length) {
    return trustByCode;
  }

  const keyFilter = qrCodes.map((code) => `"${recordTrustContentKey(code)}"`).join(",");
  let rows: SiteContentRow[];
  try {
    rows = await supabaseHttpsJson<SiteContentRow[]>(
      `/rest/v1/site_content?select=content_key,content_value&content_key=in.(${keyFilter})`,
      { serviceRole: true, timeoutMs: 4000 }
    );
  } catch {
    return trustByCode;
  }

  for (const row of rows) {
    const code = row.content_key.replace(/^record_trust:/, "").toUpperCase();
    trustByCode.set(code, mergeRecordTrustSettings(row.content_value));
  }

  return trustByCode;
}

async function settleWithin<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function stripAnonymousInstrumentFields(instrument: DemoInstrument) {
  return sanitizePublicInstrument(instrument);
}

function publicStorageUrl(bucket: string, storagePath?: string | null) {
  const source = String(storagePath || "").trim();
  if (!source || /^(https?:|data:|blob:|\/)/i.test(source)) {
    return source;
  }

  return supabaseStoragePublicUrl(bucket, source);
}

async function resolvePublicMediaUrl(storagePath?: string | null) {
  const source = String(storagePath || "").trim();
  if (!source || /^(https?:|data:|blob:|\/)/i.test(source)) {
    return source;
  }

  try {
    const signed = await supabaseSignedStorageUrl(MEDIA_BUCKET, source, PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS);
    if (signed) {
      return signed;
    }
  } catch {
    // Fall through to a public URL; media signing should not block public profile data.
  }

  return publicStorageUrl(MEDIA_BUCKET, source);
}

async function resolvePublicMediaUrls(storagePaths: string[]) {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  return Promise.all(uniquePaths.map((source) => resolvePublicMediaUrl(source)));
}

async function resolvePublicMediaUrlMap(storagePaths: string[]) {
  const uniquePaths = Array.from(new Set(storagePaths.map((item) => String(item || "").trim()).filter(Boolean)));
  const urlsByPath = new Map<string, string>();
  const signablePaths: string[] = [];

  for (const source of uniquePaths) {
    if (/^(https?:|data:|blob:|\/)/i.test(source)) {
      urlsByPath.set(source, source);
    } else {
      signablePaths.push(source);
    }
  }

  if (signablePaths.length) {
    await Promise.all(signablePaths.map(async (source) => {
      try {
        const signed = await supabaseSignedStorageUrl(MEDIA_BUCKET, source, PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS);
        if (signed) {
          urlsByPath.set(source, signed);
        }
      } catch {
        // Fall through to public URLs; media signing should not block public profile data.
      }
    }));

    for (const source of signablePaths) {
      if (!urlsByPath.has(source)) {
        urlsByPath.set(source, publicStorageUrl(MEDIA_BUCKET, source));
      }
    }
  }

  return urlsByPath;
}

async function restGet<T>(path: string, timeoutMs = 7000, attempts = 2) {
  const status = getSupabaseEnvStatus();
  if (!status.supabaseUrl || !status.hasAnonKey) {
    throw new Error("Supabase is not configured.");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await supabaseHttpsJson<T>(`/rest/v1/${path}`, { timeoutMs });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Supabase read failed.");
}

async function loadPublicRecordsFast(code?: string): Promise<LoadRecordsResult> {
  const guitarParams = new URLSearchParams({
    select: "*",
    admin_archived_at: "is.null",
    owner_removed_at: "is.null",
    order: "created_at.desc"
  });

  if (code) {
    guitarParams.set("qr_code", `eq.${code.toUpperCase()}`);
  } else {
    guitarParams.set("visibility", "eq.public");
  }

  const guitars = await restGet<GuitarRow[]>(`guitars?${guitarParams.toString()}`);
  if (!guitars.length) {
    return { records: [] };
  }

  const guitarIds = Array.from(new Set(guitars.map((item) => item.id).filter(Boolean)));
  const ownerIds = Array.from(new Set(guitars.map((item) => item.owner_id).filter(Boolean) as string[]));
  const guitarIdFilter = guitarIds.map((id) => encodeURIComponent(id)).join(",");
  const ownerIdFilter = ownerIds.map((id) => encodeURIComponent(id)).join(",");

  const trustClient = createServerSupabaseClientWithTimeout(2000);
  const [trustByCode, mediaRows, profileRows, transferCounts] = await Promise.all([
    settleWithin(loadTrustSettingsMap(trustClient, guitars.map((item) => item.qr_code)), new Map<string, RecordTrustSettings>(), 2000),
    guitarIds.length ? restGet<GuitarMediaRow[]>(`guitar_media?select=guitar_id,storage_path&guitar_id=in.(${guitarIdFilter})`).catch(() => []) : Promise.resolve([]),
    ownerIds.length ? restGet<ProfileRow[]>(`profiles?select=id,display_name,account_status,hide_public_content&id=in.(${ownerIdFilter})`).catch(() => []) : Promise.resolve([]),
    settleWithin(loadAcceptedTransferCounts(trustClient, guitarIds), new Map<string, number>(), 2000)
  ]);

  const mediaByGuitar = new Map<string, GuitarMediaRow[]>();
  for (const row of mediaRows) {
    mediaByGuitar.set(row.guitar_id, [...(mediaByGuitar.get(row.guitar_id) || []), row]);
  }

  const profilesById = new Map<string, ProfileRow>();
  for (const row of profileRows) {
    profilesById.set(row.id, row);
  }

  const visibleGuitars = guitars.filter((guitar) => {
    const profile = profilesById.get(guitar.owner_id || "");
    return isEligiblePublicProfile(guitar, { allowUnlisted: Boolean(code) })
      && profile?.hide_public_content !== true
      && profile?.account_status !== "banned"
      && profile?.account_status !== "removed";
  });
  const mediaUrlByPath = await resolvePublicMediaUrlMap(
    visibleGuitars.flatMap((guitar) => [
      guitar.hero_image_path || "",
      ...(mediaByGuitar.get(guitar.id) || []).map((item) => item.storage_path)
    ])
  );

  return {
    records: visibleGuitars.map((guitar) => {
      const heroStoragePath = guitar.hero_image_path || "";
      const media = (mediaByGuitar.get(guitar.id) || [])
        .map((item) => item.storage_path)
        .filter((storagePath) => storagePath !== heroStoragePath)
        .map((storagePath) => mediaUrlByPath.get(storagePath) || publicStorageUrl(MEDIA_BUCKET, storagePath));
      const heroImagePath = mediaUrlByPath.get(heroStoragePath) || publicStorageUrl(MEDIA_BUCKET, heroStoragePath);
      const instrument = mapInstrumentRow({
        guitar: { ...guitar, hero_image_path: heroImagePath || guitar.hero_image_path },
        media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
        specs: [],
        ownerEmail: "",
        ownerName: profilesById.get(guitar.owner_id || "")?.display_name || guitar.builder || "",
        trust: trustByCode.get(guitar.qr_code.toUpperCase()) || { ...defaultRecordTrustSettings, showSerialPublic: false },
        ownershipTransferCount: transferCounts.get(guitar.id) || 0
      });
      instrument.documentFiles = [];
      instrument.serviceEvents = [];
      return stripAnonymousInstrumentFields(instrument);
    })
  };
}

async function loadRecordsForUser(supabase: ReturnType<typeof createServerSupabaseClient>, owner: User, includeRemoved = false): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [], ownerEmail: owner.email || "", ownerName: "", error: "Supabase is not configured." };
  }

  const profile = await supabase.from("profiles").select("id,display_name").eq("id", owner.id).maybeSingle<ProfileRow>();
  let guitarQuery = supabase
    .from("guitars")
    .select("*")
    .eq("owner_id", owner.id)
    .order("created_at", { ascending: false });
  if (!includeRemoved) {
    guitarQuery = guitarQuery.is("owner_removed_at", null);
  }
  const guitars = await guitarQuery;

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
  const [mediaResult, specsResult, documentsResult, transferCounts] = await Promise.all([
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_specs").select("guitar_id,label,value").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("guitar_documents").select("guitar_id,name,storage_path,is_public,document_type,public_description,private_notes,created_at,updated_at").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    loadAcceptedTransferCounts(supabase, guitarIds)
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
          exposeInternalTrust: true,
          ownershipTransferCount: transferCounts.get(guitar.id) || 0
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

async function loadPublicRecords(supabase: ReturnType<typeof createServerSupabaseClient>, code?: string): Promise<LoadRecordsResult> {
  if (!supabase) {
    return { records: [] as DemoInstrument[], error: "Supabase is not configured." };
  }

  let query = supabase
    .from("guitars")
    .select("*")
    .is("admin_archived_at", null)
    .is("owner_removed_at", null)
    .order("created_at", { ascending: false });

  if (code) {
    query = query.eq("qr_code", code.toUpperCase());
  } else {
    query = query.eq("visibility", "public");
  }

  const guitars = await query;

  if (guitars.error) {
    return { records: [] as DemoInstrument[], error: guitars.error.message };
  }

  if (!guitars.data) {
    return { records: [] as DemoInstrument[] };
  }

  const guitarIds = guitars.data.map((item) => item.id);
  const trustSupabase = createServerSupabaseClientWithTimeout(1500);
  const [trustByCode, mediaResult, profilesResult, transferCounts] = await Promise.all([
    settleWithin(loadTrustSettingsMap(trustSupabase, guitars.data.map((item) => item.qr_code)), new Map<string, RecordTrustSettings>(), 1500),
    guitarIds.length
      ? supabase.from("guitar_media").select("guitar_id,storage_path").in("guitar_id", guitarIds)
      : Promise.resolve({ data: [], error: null }),
    guitarIds.length
      ? supabase.from("profiles").select("id,display_name,account_status,hide_public_content").in("id", guitars.data.map((item) => item.owner_id).filter(Boolean) as string[])
      : Promise.resolve({ data: [], error: null }),
    loadAcceptedTransferCounts(supabase, guitarIds)
  ]);

  let profileRows = (profilesResult.data || []) as ProfileRow[];
  let profilesError = profilesResult.error;
  if (profilesError && /column .* does not exist/i.test(profilesError.message || "")) {
    const fallbackProfiles = await supabase.from("profiles").select("id,display_name").in("id", guitars.data.map((item) => item.owner_id).filter(Boolean) as string[]);
    profileRows = (fallbackProfiles.data || []) as ProfileRow[];
    profilesError = fallbackProfiles.error;
  }

  const relatedError = mediaResult.error || profilesError;
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

  const profilesById = new Map<string, ProfileRow>();
  for (const item of profileRows) {
    const row = item as ProfileRow;
    profilesById.set(row.id, row);
  }

  const visibleGuitars = guitars.data.filter((guitar) => {
    const profile = profilesById.get((guitar as GuitarRow).owner_id || "");
    return isEligiblePublicProfile(guitar as GuitarRow, { allowUnlisted: Boolean(code) })
      && profile?.hide_public_content !== true
      && profile?.account_status !== "banned"
      && profile?.account_status !== "removed";
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

        const instrument = mapInstrumentRow({
          guitar: { ...(guitar as GuitarRow), hero_image_path: heroImagePath || (guitar as GuitarRow).hero_image_path },
          media: media.map((storagePath) => ({ guitar_id: guitar.id, storage_path: storagePath })),
          specs: [],
          ownerEmail: "",
          ownerName: profilesById.get(guitar.owner_id || "")?.display_name || guitar.builder || "",
          trust: trustByCode.get((guitar as GuitarRow).qr_code.toUpperCase()),
          ownershipTransferCount: transferCounts.get(guitar.id) || 0
        });
        instrument.documentFiles = [];
        instrument.serviceEvents = [];
        return stripAnonymousInstrumentFields(instrument);
      })
    )
  };
}

export async function GET(request: Request) {
  noStore();
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const scope = url.searchParams.get("scope") || "";
  const includeRemoved = url.searchParams.get("includeRemoved") === "1";

  if (scope === "mine") {
    const supabase = createServerSupabaseClient();
    if (!supabase) {
      return supabaseUnavailableResponse("read");
    }

    const auth = await getAuthenticatedUser(request);
    if (!auth.user) {
      return noStoreJson({ ok: false, instruments: [], count: 0, message: auth.error || "Sign in required." } satisfies SupabaseReadResponse, { status: 401 });
    }

    if (code) {
      const ownerRecord = await loadRecordsForUser(supabase, auth.user, includeRemoved);
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

    const result = await loadRecordsForUser(supabase, auth.user, includeRemoved);
    if (result.error) {
      return supabaseReadErrorResponse(result.error);
    }

    return noStoreJson(
      { ok: true, instruments: result.records, count: result.records.length } satisfies SupabaseReadResponse,
      { status: 200 }
    );
  }

  if (code) {
    const requestedCode = normalizePublicProfileCode(code);
    if (!requestedCode || isRetiredPublicProfileCode(requestedCode)) {
      return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }
    const resolvedCode = await resolveRedirectedQrCode(requestedCode).catch(() => requestedCode);
    if (isRetiredPublicProfileCode(resolvedCode)) {
      return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }
    const instrument = await getPublicInstrumentByCode(resolvedCode).catch(() => null);
    if (!instrument) {
      return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
    }

    return noStoreJson({ ok: true, instrument: stripAnonymousInstrumentFields(instrument) } satisfies SupabaseReadResponse, { status: 200 });
  }

  const publicRecords = await getPublicInstruments().catch((error: Error) => {
    throw new Error(error.message || "Could not load public instruments.");
  });

  return noStoreJson(
    { ok: true, instruments: publicRecords.map(sanitizePublicInstrument), count: publicRecords.length } satisfies SupabaseReadResponse,
    { status: 200 }
  );
}

function brandKey(value: string) {
  return instrumentBrandKey(value);
}

function brandDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length];
}

async function findGuitarByExactSerial(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  serial: string
) {
  const normalized = normalizeSerialBuildId(serial);
  if (normalized.length < 4) return null;

  const alias = await supabase
    .from("guitar_serial_aliases")
    .select("guitar_id")
    .eq("serial_normalized", normalized)
    .maybeSingle<{ guitar_id: string }>();
  if (!alias.error && alias.data?.guitar_id) return alias.data.guitar_id;
  if (alias.error && !/does not exist|schema cache/i.test(alias.error.message)) {
    throw new Error(alias.error.message);
  }

  const legacy = await supabase.from("guitars").select("id,serial_number").not("serial_number", "is", null).limit(5000);
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.data || []).find((row) => normalizeSerialBuildId(String(row.serial_number || "")) === normalized)?.id || null;
}

async function resolveCanonicalBrand(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  rawBrand: string
) {
  const value = rawBrand.trim().replace(/\s+/g, " ");
  if (!value) return { brand: "", suggestion: "" };

  const knownBrands = new Map<string, string>(establishedInstrumentBrands.map((brand) => [brandKey(brand), brand]));
  const existing = await supabase.from("guitars").select("brand").not("brand", "is", null).limit(5000);
  if (!existing.error) {
    for (const row of (existing.data || []) as Array<{ brand?: string | null }>) {
      const brand = String(row.brand || "").trim();
      if (brand) knownBrands.set(brandKey(brand), brand);
    }
  }

  const key = brandKey(value);
  const exact = knownBrands.get(key);
  if (exact) return { brand: exact, suggestion: "" };

  let closest = "";
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [knownKey, knownBrand] of knownBrands) {
    const distance = brandDistance(key, knownKey);
    if (distance < closestDistance) {
      closest = knownBrand;
      closestDistance = distance;
    }
  }

  const typoThreshold = Math.max(key.length, brandKey(closest).length) >= 7 ? 2 : 1;
  if (closest && closestDistance <= typoThreshold) {
    return { brand: value, suggestion: closest };
  }

  return { brand: value, suggestion: "" };
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
    serialNotUsed: body.serialNotUsed === true,
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    saleStatus: body.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
    originalityStatus: body.originalityStatus === "all_original" ? "all_original" : body.originalityStatus === "modified" ? "modified" : "unknown",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  const brandResolution = await resolveCanonicalBrand(supabase, input.brand);
  if (brandResolution.suggestion) {
    return NextResponse.json(
      { ok: false, message: `That brand looks like ${brandResolution.suggestion}. Choose the existing brand spelling to keep the Catalog clean.` },
      { status: 409 }
    );
  }
  input.brand = brandResolution.brand;

  if (!input.brand || !input.model || (!input.serial && !input.serialNotUsed)) {
    return NextResponse.json({ ok: false, message: "Brand, model, and serial/build ID are required unless the instrument does not use one." }, { status: 400 });
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
    return NextResponse.json({ ok: false, message: "Could not verify the Profile limit." }, { status: 500 });
  }

  const instrumentCount = existingProfileCount.count ?? 0;
  if (instrumentCount < 0) {
    return NextResponse.json({ ok: false, message: "Could not verify the Profile limit." }, { status: 500 });
  }

  if (!hasExpandedPlanAccess(resolvedAccountPlan) && instrumentCount >= 25) {
    return NextResponse.json(
      { ok: false, message: "Free public beta accounts can create up to 25 Profiles. Contact QRguitar for commercial setup or bulk onboarding." },
      { status: 402 }
    );
  }

  const serialQrCode = qrCodeFromSerial(input.serial);
  let qrCode = serialQrCode || makeNewPermanentQrCode();
  if (serialQrCode) {
    const duplicateId = await findGuitarByExactSerial(supabase, input.serial).catch(() => "lookup-error");
    if (duplicateId === "lookup-error") {
      return NextResponse.json({ ok: false, message: "Could not verify the Serial Number." }, { status: 500 });
    }
    if (duplicateId) {
      return NextResponse.json({
        ok: false,
        message: "Existing QRguitar Profile found - transfer or ownership claim required.",
        existingProfileFound: true
      }, { status: 409 });
    }
  } else {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { count } = await supabase.from("guitars").select("id", { count: "exact", head: true }).eq("qr_code", qrCode);
      if (!count) {
        break;
      }
      qrCode = makeNewPermanentQrCode();
    }
  }

  const uploadedSources = Array.from(new Set([body.heroImageDataUrl || "", ...input.photos].filter(Boolean)));
  if (uploadedSources.length < 1) {
    return NextResponse.json(
      { ok: false, message: "Add at least one photo before creating a QRguitar Profile." },
      { status: 400 }
    );
  }

  const uploadedMediaPaths: string[] = [];
  const mediaUploadErrors: string[] = [];
  for (const [index, source] of uploadedSources.entries()) {
    try {
      const uploadedPath = await uploadImageSource(supabase, ownerUser.id, qrCode, source, `media-${index + 1}`);
      if (uploadedPath) {
        uploadedMediaPaths.push(uploadedPath);
      } else if (isRenderablePublicMediaSource(source) && !source.startsWith("blob:")) {
        uploadedMediaPaths.push(source);
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
    serial_number: input.serial || null,
    no_serial_used: input.serialNotUsed,
    builder: input.builder || null,
    location: input.location || null,
    status: "unverified" as const,
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

  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean; documentType: string; publicDescription: string; privateNotes: string; issuerSource: string; documentDate: string; description: string }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, insertedGuitar.id, document.dataUrl, `document-${index + 1}`);
    if (uploadedPath) {
      uploadedDocuments.push({
        name: document.name || `Document ${index + 1}`,
        storagePath: uploadedPath,
        isPublic: document.visibility === "public",
        documentType: cleanDocumentText(document.documentType, 80) || "Other",
        publicDescription: cleanDocumentText(document.publicDescription, 1000),
        privateNotes: cleanDocumentText(document.privateNotes, 2000),
        issuerSource: cleanDocumentText(document.issuerSource, 200),
        documentDate: cleanDocumentText(document.documentDate, 10),
        description: cleanDocumentText(document.description, 1000)
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
      private_notes: document.privateNotes || null,
      issuer_source: document.issuerSource || null,
      document_date: /^\d{4}-\d{2}-\d{2}$/.test(document.documentDate) ? document.documentDate : null,
      description: document.description || null
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
    { guitar_id: insertedGuitar.id, label: "Availability", value: input.saleStatus, sort_order: 4 },
    { guitar_id: insertedGuitar.id, label: "Originality", value: input.originalityStatus, sort_order: 5 },
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: insertedGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 6
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

  if (typeof body.showSerialPublic === "boolean") {
    const trustResult = await supabase.from("site_content").upsert(
      {
        content_key: recordTrustContentKey(insertedGuitar.qr_code),
        content_value: mergeRecordTrustSettings({ showSerialPublic: body.showSerialPublic === true }),
        updated_at: new Date().toISOString()
      },
      { onConflict: "content_key" }
    );
    if (trustResult.error) {
      revalidatePublicRecordSurfaces(insertedGuitar.qr_code);
      return noStoreJson(
        { ok: true, qrCode: insertedGuitar.qr_code, permanentPath: insertedGuitar.permanent_path, message: "Saved. Serial privacy settings could not be saved." },
        { status: 200 }
      );
    }
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

    const existing = await supabase.from("guitars").select("id,owner_id,status,serial_number").eq("qr_code", qrCode).maybeSingle<GuitarRow>();
    if (existing.error || !existing.data) {
      return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
    }

    const isRecordOwner = existing.data.owner_id === auth.user.id;
    const isAdmin = await canManageRecordVerification(supabase, auth.user);
    if (!isRecordOwner && !isAdmin) {
      return NextResponse.json({ ok: false, message: "Only the profile owner or QRguitar admin can change badge display." }, { status: 403 });
    }

    const currentTrust = (await loadTrustSettingsMap(supabase, [qrCode])).get(qrCode) || defaultRecordTrustSettings;
    const serialExceptionApproved = isAdmin && typeof body.serialExceptionApproved === "boolean"
      ? body.serialExceptionApproved
      : currentTrust.serialExceptionApproved;

    if (!String(existing.data.serial_number || "").trim() && !serialExceptionApproved && isAdmin && (verificationStatus === "verified" || authenticityStatus === "confirmed")) {
      return NextResponse.json(
        { ok: false, message: "Records without a serial/build ID require a QRguitar serial exception before verification or authenticity confirmation." },
        { status: 400 }
      );
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

    const trust = mergeRecordTrustSettings({
      ...currentTrust,
      authenticityStatus: isAdmin ? authenticityStatus : currentTrust.authenticityStatus,
      showVerificationBadge: typeof body.showVerificationBadge === "boolean" ? body.showVerificationBadge : currentTrust.showVerificationBadge,
      showAuthenticityBadge: typeof body.showAuthenticityBadge === "boolean" ? body.showAuthenticityBadge : currentTrust.showAuthenticityBadge,
      showSerialPublic: typeof body.showSerialPublic === "boolean" ? body.showSerialPublic : currentTrust.showSerialPublic,
      serialExceptionApproved,
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

  if (body.action === "restore_to_collection") {
    return NextResponse.json(
      { ok: false, message: "Deleted profiles cannot be restored. Create a new QRguitar Profile instead." },
      { status: 410 }
    );
  }

  if (body.action === "remove_from_collection") {
    const qrCode = String(body.qrCode || "").trim().toUpperCase();
    const reason = String(body.reason || "").trim().slice(0, 1000);
    if (!qrCode) {
      return NextResponse.json({ ok: false, message: "Missing QRguitar ID." }, { status: 400 });
    }

    const existing = await supabase
      .from("guitars")
      .select("id,owner_id,qr_code,permanent_path,status")
      .eq("qr_code", qrCode)
      .maybeSingle<GuitarRow>();
    if (existing.error || !existing.data) {
      return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
    }

    if (existing.data.owner_id !== auth.user.id) {
      return NextResponse.json({ ok: false, message: "Only the owner can update this collection record." }, { status: 403 });
    }

    const trust = (await loadTrustSettingsMap(supabase, [qrCode])).get(qrCode) || defaultRecordTrustSettings;
    if (body.action === "remove_from_collection" && (existing.data.status === "verified" || trust.authenticityStatus === "confirmed")) {
      return NextResponse.json(
        {
          ok: false,
          message: "Verified and authenticity-confirmed Profiles are preserved for provenance. Transfer ownership or contact QRguitar support for permanent removal."
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const update = body.action === "remove_from_collection"
      ? {
          owner_removed_at: now,
          owner_removed_by: auth.user.id,
          owner_removed_reason: reason || "Owner permanently deleted record from dashboard.",
          visibility: "private",
          updated_at: now
        }
      : {};

    const result = await supabase
      .from("guitars")
      .update(update)
      .eq("id", existing.data.id)
      .eq("owner_id", auth.user.id);
    if (result.error) {
      return NextResponse.json({ ok: false, message: result.error.message || "Could not update collection." }, { status: 500 });
    }

    await logAdminAuditEvent(supabase, {
      actorUserId: auth.user.id,
      actorEmail: auth.user.email || "",
      action: "record_removed_from_collection",
      targetType: "guitar",
      targetId: qrCode,
      targetUserId: auth.user.id,
      reason: reason || null,
      metadata: { qrCode }
    });

    revalidatePublicRecordSurfaces(qrCode);
    return noStoreJson({
      ok: true,
      qrCode,
      permanentPath: existing.data.permanent_path || `/i/${qrCode}`,
      message: "Record permanently deleted from your dashboard. This cannot be undone."
    }, { status: 200 });
  }

  const input = {
    qrCode: String(body.qrCode || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    brand: String(body.brand || "").trim(),
    model: String(body.model || "").trim(),
    serial: String(body.serial || "").trim(),
    serialNotUsed: body.serialNotUsed === true,
    year: String(body.year || "").trim(),
    instrumentType: String(body.instrumentType || "").trim(),
    builder: String(body.builder || "").trim(),
    finish: String(body.finish || "").trim(),
    condition: body.condition === "new" ? "new" : "used",
    saleStatus: body.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
    originalityStatus: body.originalityStatus === "all_original" ? "all_original" : body.originalityStatus === "modified" ? "modified" : "unknown",
    ownerName: String(body.ownerName || "").trim(),
    ownerEmail: normalizeLookupEmail(auth.user.email || ""),
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim(),
    photos: Array.isArray(body.photos) ? body.photos.slice(0, 20) : [],
    documents: Array.isArray(body.documents) ? body.documents.slice(0, 10) : []
  };

  const brandResolution = await resolveCanonicalBrand(supabase, input.brand);
  if (brandResolution.suggestion) {
    return NextResponse.json(
      { ok: false, message: `That brand looks like ${brandResolution.suggestion}. Choose the existing brand spelling to keep the Catalog clean.` },
      { status: 409 }
    );
  }
  input.brand = brandResolution.brand;

  if (!input.qrCode || !input.brand || !input.model || (!input.serial && !input.serialNotUsed)) {
    return NextResponse.json({ ok: false, message: "Brand, model, and Serial Number are required unless the instrument does not use one." }, { status: 400 });
  }

  const ownerUser = auth.user;
  const existing = await supabase.from("guitars").select("id,owner_id,status,hero_image_path,serial_number").eq("qr_code", input.qrCode).maybeSingle<GuitarRow>();
  if (existing.error || !existing.data) {
    return NextResponse.json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  if (existing.data.owner_id !== ownerUser.id) {
    return NextResponse.json({ ok: false, message: "Only the owner can edit this record." }, { status: 403 });
  }

  const currentSerialNormalized = normalizeSerialBuildId(existing.data.serial_number || "");
  const nextSerialNormalized = normalizeSerialBuildId(input.serial || "");
  const serialCorrectionChangesIdentity = Boolean(nextSerialNormalized) && nextSerialNormalized !== currentSerialNormalized;
  const serialCorrectionApproved = serialCorrectionChangesIdentity
    ? await canApproveSerialCorrection(supabase, auth.user)
    : true;

  if (serialCorrectionChangesIdentity && !serialCorrectionApproved) {
    return NextResponse.json(
      { ok: false, message: "Serial Number corrections require QRguitar admin approval so printed QR links and ownership history stay intact." },
      { status: 403 }
    );
  }

  const nextQrCode = serialCorrectionChangesIdentity ? qrCodeFromSerial(input.serial) || input.qrCode : input.qrCode;
  if (input.serial) {
    const duplicateId = await findGuitarByExactSerial(supabase, input.serial).catch(() => "lookup-error");
    if (duplicateId === "lookup-error") {
      return NextResponse.json({ ok: false, message: "Could not verify the updated Serial Number." }, { status: 500 });
    }
    if (duplicateId && duplicateId !== existing.data.id) {
      return NextResponse.json({ ok: false, message: "That Serial Number belongs to another QRguitar Profile." }, { status: 409 });
    }
  }

  if (nextQrCode !== input.qrCode) {
    const duplicateQrCode = await supabase
      .from("guitars")
      .select("id")
      .eq("qr_code", nextQrCode)
      .neq("id", existing.data.id)
      .maybeSingle<{ id: string }>();
    if (duplicateQrCode.error) {
      return NextResponse.json({ ok: false, message: "Could not verify the updated QRguitar ID." }, { status: 500 });
    }
    if (duplicateQrCode.data?.id) {
      return NextResponse.json({ ok: false, message: "That QRguitar ID already belongs to another Profile." }, { status: 409 });
    }

    const redirectInsert = await supabase
      .from("qr_redirects")
      .upsert({ guitar_id: existing.data.id, old_path: `/i/${input.qrCode}`, active: true }, { onConflict: "old_path" });
    if (redirectInsert.error) {
      return NextResponse.json({ ok: false, message: "Could not preserve the former QR link." }, { status: 500 });
    }
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
  if (updatedMediaSources.length < 1) {
    return NextResponse.json(
      { ok: false, message: "Every QRguitar Profile needs at least one photo." },
      { status: 400 }
    );
  }

  const heroCandidate = body.heroImageDataUrl || updatedMediaSources[0] || "";
  const uploadedHeroPath = heroCandidate ? await uploadImageSource(supabase, ownerUser.id, existing.data.id, heroCandidate, "hero") : null;
  const mappedHeroPath = heroCandidate ? await mapExistingMediaSource(supabase, existingMediaRows, heroCandidate) : "";
  const externalHeroPath = heroCandidate && isRenderablePublicMediaSource(heroCandidate) && !heroCandidate.startsWith("blob:") ? heroCandidate : "";
  const heroImagePath = heroCandidate ? uploadedHeroPath || mappedHeroPath || externalHeroPath || currentHeroPath : null;
  const { error: updateError } = await supabase
    .from("guitars")
    .update({
      qr_code: nextQrCode,
      permanent_path: `/i/${nextQrCode}`,
      name: input.name || `${input.brand} ${input.model}`.trim(),
      brand: input.brand,
      model: input.model,
      year: input.year || null,
      serial_number: input.serial || null,
      no_serial_used: input.serialNotUsed,
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

  if (nextQrCode !== input.qrCode) {
    const oldTrustKey = recordTrustContentKey(input.qrCode);
    const nextTrustKey = recordTrustContentKey(nextQrCode);
    const oldTrust = await supabase
      .from("site_content")
      .select("content_value,updated_by")
      .eq("content_key", oldTrustKey)
      .maybeSingle<{ content_value?: Record<string, unknown>; updated_by?: string | null }>();
    if (!oldTrust.error && oldTrust.data?.content_value) {
      await supabase.from("site_content").upsert({
        content_key: nextTrustKey,
        content_value: oldTrust.data.content_value,
        updated_by: oldTrust.data.updated_by || ownerUser.id,
        updated_at: new Date().toISOString()
      });
      await supabase.from("site_content").delete().eq("content_key", oldTrustKey);
    }

    await logAdminAuditEvent(supabase, {
      actorUserId: ownerUser.id,
      actorEmail: ownerUser.email || "",
      action: "serial_correction_qrguitar_id_changed",
      targetType: "guitar",
      targetId: nextQrCode,
      targetUserId: ownerUser.id,
      reason: "Approved Serial Number correction",
      metadata: { oldQrCode: input.qrCode, nextQrCode, serialNumber: input.serial }
    });
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
      const externalPath = isRenderablePublicMediaSource(source) && !source.startsWith("blob:") ? source : "";
      const nextPath = existingPath || externalPath;
      if (nextPath && !persistedMediaPaths.includes(nextPath)) {
        persistedMediaPaths.push(nextPath);
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
      revalidatePublicRecordSurfaces(nextQrCode);
      return noStoreJson({ ok: true, qrCode: nextQrCode, permanentPath: `/i/${nextQrCode}`, message: "Saved. Media placeholders could not be refreshed." }, { status: 200 });
    }
  }

  const existingDocumentsResult = await supabase
    .from("guitar_documents")
    .select("guitar_id,name,storage_path,is_public,document_type,public_description,private_notes,issuer_source,document_date,description,file_size_bytes,related_timeline_event_id,related_service_event_id,created_at,updated_at")
    .eq("guitar_id", existingGuitar.id);
  const existingDocuments = ((existingDocumentsResult.data || []) as GuitarDocumentRow[]);
  const uploadedDocuments: Array<{ name: string; storagePath: string; isPublic: boolean; documentType: string; publicDescription: string; privateNotes: string; issuerSource: string; documentDate: string; description: string }> = [];
  for (const [index, document] of (body.documents || []).entries()) {
    const uploadedPath = await uploadDocumentSource(supabase, ownerUser.id, existingGuitar.id, document.dataUrl, `document-${index + 1}`);
    const metadata = {
      documentType: cleanDocumentText(document.documentType, 80) || "Other",
      publicDescription: cleanDocumentText(document.publicDescription, 1000),
      privateNotes: cleanDocumentText(document.privateNotes, 2000),
      issuerSource: cleanDocumentText(document.issuerSource, 200),
      documentDate: cleanDocumentText(document.documentDate, 10),
      description: cleanDocumentText(document.description, 1000)
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
      issuer_source: document.issuerSource || null,
      document_date: /^\d{4}-\d{2}-\d{2}$/.test(document.documentDate) ? document.documentDate : null,
      description: document.description || null,
      updated_at: new Date().toISOString()
    }));
    const documentInsert = await supabase.from("guitar_documents").insert(documentPayload);
    if (documentInsert.error) {
      revalidatePublicRecordSurfaces(nextQrCode);
      return noStoreJson({ ok: true, qrCode: nextQrCode, permanentPath: `/i/${nextQrCode}`, message: "Saved. Document files could not be refreshed." }, { status: 200 });
    }
  }

  await supabase.from("guitar_specs").delete().eq("guitar_id", existingGuitar.id);
  const specRows = [
    { guitar_id: existingGuitar.id, label: "Condition", value: input.condition, sort_order: 1 },
    ...(input.instrumentType ? [{ guitar_id: existingGuitar.id, label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
    ...(input.finish ? [{ guitar_id: existingGuitar.id, label: "Finish", value: input.finish, sort_order: 3 }] : []),
    { guitar_id: existingGuitar.id, label: "Availability", value: input.saleStatus, sort_order: 4 },
    { guitar_id: existingGuitar.id, label: "Originality", value: input.originalityStatus, sort_order: 5 },
    ...(body.customFields || [])
      .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
      .map((field, index) => ({
        guitar_id: existingGuitar.id,
        label: String(field.label).trim(),
        value: String(field.value).trim(),
        sort_order: index + 6
      }))
  ];
  const specInsert = await supabase.from("guitar_specs").insert(specRows);
  if (specInsert.error) {
    revalidatePublicRecordSurfaces(nextQrCode);
    return noStoreJson({ ok: true, qrCode: nextQrCode, permanentPath: `/i/${nextQrCode}`, message: "Saved. Condition details could not be refreshed." }, { status: 200 });
  }

  revalidatePublicRecordSurfaces(input.qrCode);
  revalidatePublicRecordSurfaces(nextQrCode);
  return noStoreJson({
    ok: true,
    qrCode: nextQrCode,
    permanentPath: `/i/${nextQrCode}`,
    message: mediaUploadErrors.length ? `${mediaUploadErrors.join(", ")} could not be uploaded. The record was saved.` : undefined
  }, { status: 200 });
}
