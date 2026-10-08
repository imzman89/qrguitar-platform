import { cleanPublicCollection, publicCollectionOwnerKey } from "../../../lib/public-collections";
import { OwnerReadError, readAllOwnerPages, readOwnerBatches, groupOwnerRows, signOwnerSources } from "../../../lib/owner-record-read";
import { buildCreateProfilePayload, createProfileFailure, CreateProfileError } from "../../../lib/profile-create";
import { profileBillingEnvironment } from "../../../lib/billing-environment";
import { hasInlineProfileAssets, prepareProfileAssets, ProfileSaveError, profileSaveFailure, type SavedMedia, type SavedDocument } from "../../../lib/profile-save-assets";
import { verifyProfileEditUploads } from "../../../lib/profile-edit-uploads";
import { readBoundedJsonBody } from "../../../lib/bounded-json-body";
import { MAX_PROFILE_EDIT_JSON_BYTES, cleanProfileUploadId } from "../../../lib/profile-upload-protocol";
import { isOwnedStagedPath, removeUnreferencedStagedUploads } from "../../../lib/staged-upload-cleanup";
import { NextResponse } from "next/server";
import { existingProfileSpecId } from "../../../lib/profile-metadata-preservation";
import { randomInt, randomUUID } from "node:crypto";
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
  getServiceHistoryEntries,
  isManagedInstrumentSpec,
  normalizeSerialBuildId,
  originalityFromSpecs,
  profileLinkSpecLabel,
  profileLinksFromSpecs,
  sanitizePublicInstrument,
  sanitizePublicInstrumentWithConfirmedOwnerNames,
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
  uploadId?: string;
  idempotencyKey?: string;
  heroImagePath?: string;
  heroImageDataUrl?: string;
  documents?: Array<{
    name: string;
    dataUrl?: string;
    storagePath?: string;
    visibility?: "public" | "hidden";
    documentType?: string;
    publicDescription?: string;
    privateNotes?: string;
    issuerSource?: string;
    documentDate?: string;
    description?: string;
    relatedTimelineEventId?: string;
    relatedServiceEventId?: string;
  }>;
  customFields?: Array<{ label: string; value: string }>;
  customLinks?: Array<{ label: string; url: string }>;
  accountPlan?: AccountPlan;
  showSerialPublic?: boolean;
  serviceEntry?: {
    serviceDate?: string;
    eventType?: string;
    title?: string;
    publicDescription?: string;
    privateNotes?: string;
    shopName?: string;
    location?: string;
    isPublic?: boolean;
  };
};

type UpdateInstrumentRequest = Omit<CreateInstrumentRequest, "accountPlan" | "customFields"> & {
  customFields?: Array<{ id?: string; label: string; value: string }>;
  qrCode: string;
  expectedUpdatedAt?: string;
  expectedDocuments?: Array<{ id: string; updatedAt: string }>;
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
  code?: string;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  cleanupUploads?: boolean;
  resetUploads?: boolean;
  existingProfileFound?: boolean;
  existingProfileHref?: string;
  claimHref?: string;
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
  updated_at: string;
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
  source_kind?: "owner_reported" | "provider_submitted_owner_approved" | null;
  provider_user_id?: string | null;
  provider_display_name?: string | null;
  provider_verified_at_snapshot?: string | null;
  evidence_reviewed_at?: string | null;
  service_submission_id?: string | null;
  work_order_reference?: string | null;
  parts_installed?: string | null;
  setup_measurements?: string | null;
  who_performed?: "self" | "shop" | "unknown" | null;
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

function createFailure(
  status: number,
  code: string,
  message: string,
  options: Omit<SupabaseCreateResponse, "ok" | "code" | "message"> = {}
) {
  return noStoreJson(
    { ok: false, code, message, retryable: false, ...options } satisfies SupabaseCreateResponse,
    { status }
  );
}

function cleanCreateKey(value: unknown) {
  const key = String(value || "").trim();
  return /^[a-zA-Z0-9-]{12,100}$/.test(key) ? key : "";
}

function createSubmissionContentKey(ownerId: string, idempotencyKey: string) {
  return `create_submission:${ownerId}:${idempotencyKey}`;
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
  return `QRG-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
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
  return profile.data?.role === "admin";
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

  return supabaseSignedStorageUrl(DOCUMENT_BUCKET, source, 60 * 60);
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
      issuerSource: document.issuer_source || "",
      documentDate: document.document_date || "",
      description: document.description || "",
      fileSizeBytes: document.file_size_bytes || undefined,
      publicDescription: document.public_description || "",
      ...(includePrivate ? { privateNotes: document.private_notes || "" } : {}),
      ...(includePrivate ? {
        relatedTimelineEventId: document.related_timeline_event_id || "",
        relatedServiceEventId: document.related_service_event_id || ""
      } : {}),
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
    ...(exposeInternalTrust ? { recordId: guitar.id } : {}),
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
    instrumentType: specValue(specs, "Type"),
    builder: guitar.builder || specValue(specs, "Builder"),
    owner: ownerName || (exposeInternalTrust ? "" : "Unclaimed"),
    ownerUserEmail: ownerEmail,
    location: guitar.location || "",
    visibility: guitar.visibility === "private" ? "private" : guitar.visibility === "unlisted" ? "unlisted" : "public",
    summary: publicSummary(guitar.summary),
    finish: specValue(specs, "Finish"),
    heroImageDataUrl,
    galleryImageDataUrls,
    customFields,
    customLinks: profileLinksFromSpecs(specs),
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
    sourceKind: row.source_kind || "owner_reported",
    providerUserId: row.provider_user_id || undefined,
    providerDisplayName: row.provider_display_name || undefined,
    providerVerifiedAt: row.provider_verified_at_snapshot || undefined,
    evidenceReviewedAt: row.evidence_reviewed_at || undefined,
    serviceSubmissionId: row.service_submission_id || undefined,
    workOrderReference: row.work_order_reference || undefined,
    partsInstalled: row.parts_installed || undefined,
    setupMeasurements: row.setup_measurements || undefined,
    whoPerformed: row.who_performed || undefined,
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
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at,date_precision,category,is_system,related_document_id,related_media_id,source_kind,provider_user_id,provider_display_name,provider_verified_at_snapshot,evidence_reviewed_at,service_submission_id,work_order_reference,parts_installed,setup_measurements,who_performed")
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
  if (!status.supabaseUrl || !status.hasServiceRoleKey) {
    throw new Error("Supabase is not configured.");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await supabaseHttpsJson<T>(`/rest/v1/${path}`, { timeoutMs, serviceRole: true });
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
    return isEligiblePublicProfile(guitar, { allowUnlisted: Boolean(code), ownerProfile: profile });
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

async function loadRecordsForUser(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  owner: User,
  includeRemoved = false,
  requestedCode?: string
): Promise<LoadRecordsResult> {
  if (!supabase) throw new OwnerReadError("Supabase is not configured.");
  const profile = await supabase.from("profiles").select("id,display_name").eq("id", owner.id).maybeSingle<ProfileRow>();
  if (profile.error) throw new OwnerReadError(profile.error.message);
  const ownerEmail = owner.email || "";
  const collectionResult = await supabase.from("site_content").select("content_value")
    .eq("content_key", publicCollectionOwnerKey(owner.id)).maybeSingle<{ content_value?: Record<string, unknown> }>();
  if (collectionResult.error) throw new OwnerReadError(collectionResult.error.message);
  const rawCollection = collectionResult.data?.content_value;
  if (rawCollection?.ownerId !== undefined && rawCollection.ownerId !== owner.id) {
    throw new OwnerReadError("Collection settings ownership does not match this account.");
  }
  const collection = cleanPublicCollection(rawCollection);
  const ownerName = collection.publicName;
  const publicCollection = rawCollection?.ownerId === owner.id && collection.enabled
    && collection.handle.length >= 3 && collection.publicName ? {
      handle: collection.handle, publicName: collection.publicName, accountType: collection.accountType,
      websiteUrl: collection.websiteUrl, bio: collection.bio, location: collection.location,
      avatarUrl: collection.avatarUrl, allowMessages: collection.allowMessages
    } : undefined;
  const guitars = await readAllOwnerPages<GuitarRow>((from, to) => {
    let query = supabase.from("guitars").select("*").eq("owner_id", owner.id)
      .order("created_at", { ascending: false }).order("id", { ascending: true });
    if (!includeRemoved) query = query.is("owner_removed_at", null);
    if (requestedCode) query = query.eq("qr_code", requestedCode.trim().toUpperCase());
    return query.range(from, to);
  }, (row) => row.id);
  if (!guitars.length) return { records: [], ownerEmail, ownerName };

  const guitarIds = guitars.map((guitar) => guitar.id);
  const [mediaRows, specRows, documentRows, timelineRows, transferRows, trustRows] = await Promise.all([
    readOwnerBatches<GuitarMediaRow & { id: string }>(guitarIds, (ids, from, to) => supabase
      .from("guitar_media").select("id,guitar_id,storage_path").in("guitar_id", ids)
      .order("guitar_id").order("sort_order").order("id").range(from, to), (row) => row.id),
    readOwnerBatches<GuitarSpecRow & { id: string }>(guitarIds, (ids, from, to) => supabase
      .from("guitar_specs").select("id,guitar_id,label,value").in("guitar_id", ids)
      .order("guitar_id").order("sort_order").order("id").range(from, to), (row) => row.id),
    readOwnerBatches<GuitarDocumentRow & { id: string; mime_type?: string | null }>(guitarIds, (ids, from, to) => supabase
      .from("guitar_documents")
      .select("id,guitar_id,name,storage_path,is_public,document_type,public_description,private_notes,issuer_source,document_date,description,file_size_bytes,mime_type,related_timeline_event_id,related_service_event_id,created_at,updated_at")
      .eq("retained_private", false).in("guitar_id", ids).order("guitar_id").order("created_at").order("id").range(from, to), (row) => row.id),
    readOwnerBatches<GuitarTimelineRow>(guitarIds, (ids, from, to) => supabase
      .from("guitar_timeline_events")
      .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at,date_precision,category,is_system,related_document_id,related_media_id,source_kind,provider_user_id,provider_display_name,provider_verified_at_snapshot,evidence_reviewed_at,service_submission_id,work_order_reference,parts_installed,setup_measurements,who_performed")
      .in("guitar_id", ids).order("guitar_id").order("event_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).order("id").range(from, to), (row) => row.id),
    readOwnerBatches<TransferCountRow & { id: string }>(guitarIds, (ids, from, to) => supabase
      .from("ownership_transfers").select("id,guitar_id").in("guitar_id", ids).eq("status", "accepted")
      .order("id").range(from, to), (row) => row.id),
    readOwnerBatches<SiteContentRow>(guitars.map((guitar) => recordTrustContentKey(guitar.qr_code)), (keys, from, to) => supabase
      .from("site_content").select("content_key,content_value").in("content_key", keys)
      .order("content_key").range(from, to), (row) => row.content_key)
  ]);

  if (mediaRows.some((row) => !row.storage_path) || documentRows.some((row) => !row.storage_path)) {
    throw new OwnerReadError("Profile file references are incomplete. Please try again.");
  }
  const mediaByGuitar = groupOwnerRows(mediaRows);
  const specsByGuitar = groupOwnerRows(specRows);
  const documentsByGuitar = groupOwnerRows(documentRows);
  const timelineByGuitar = groupOwnerRows(timelineRows);
  const transferCounts = new Map<string, number>();
  for (const row of transferRows) transferCounts.set(row.guitar_id, (transferCounts.get(row.guitar_id) || 0) + 1);
  const trustByCode = new Map(trustRows.map((row) => [
    row.content_key.replace(/^record_trust:/, "").toUpperCase(), mergeRecordTrustSettings(row.content_value)
  ]));
  const [imageUrls, documentUrls] = await Promise.all([
    signOwnerSources([...guitars.map((guitar) => guitar.hero_image_path || ""), ...mediaRows.map((row) => row.storage_path)],
      (source) => supabaseSignedStorageUrl(MEDIA_BUCKET, source, PUBLIC_MEDIA_SIGNED_URL_TTL_SECONDS)),
    signOwnerSources(documentRows.map((row) => row.storage_path),
      (source) => supabaseSignedStorageUrl(DOCUMENT_BUCKET, source, 3600))
  ]);

  const records = guitars.map((guitar) => {
    const heroImagePath = guitar.hero_image_path ? imageUrls.get(guitar.hero_image_path) || "" : "";
    const instrument = mapInstrumentRow({
      guitar: { ...guitar, hero_image_path: heroImagePath },
      media: (mediaByGuitar.get(guitar.id) || []).map((row) => ({
        guitar_id: guitar.id, storage_path: imageUrls.get(row.storage_path) || ""
      })),
      specs: specsByGuitar.get(guitar.id) || [], ownerEmail, ownerName,
      trust: trustByCode.get(guitar.qr_code.toUpperCase()), exposeInternalTrust: true,
      ownershipTransferCount: transferCounts.get(guitar.id) || 0
    });
    instrument.updatedAt = guitar.updated_at;
    instrument.publicCollection = publicCollection;
    instrument.documentFiles = (documentsByGuitar.get(guitar.id) || []).map((document) => ({
      id: document.id,
      name: document.name,
      url: documentUrls.get(document.storage_path) || "",
      visibility: document.is_public ? "public" as const : "hidden" as const,
      documentType: document.document_type || "",
      issuerSource: document.issuer_source || "",
      documentDate: document.document_date || "",
      description: document.description || "",
      fileSizeBytes: document.file_size_bytes ?? undefined,
      mimeType: document.mime_type || "",
      publicDescription: document.public_description || "",
      privateNotes: document.private_notes || "",
      relatedTimelineEventId: document.related_timeline_event_id || "",
      relatedServiceEventId: document.related_service_event_id || "",
      createdAt: document.created_at || "",
      updatedAt: document.updated_at || ""
    }));
    instrument.timelineEvents = (timelineByGuitar.get(guitar.id) || []).map((row) => mapServiceEvent(row, true));
    instrument.serviceEvents = getServiceHistoryEntries(instrument);
    return instrument;
  });
  return { records, ownerEmail, ownerName };
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
    return isEligiblePublicProfile(guitar as GuitarRow, { allowUnlisted: Boolean(code), ownerProfile: profile });
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
    const unavailable = () => noStoreJson(
      { ok: false, message: "Profiles are temporarily unavailable. Please try again.", retryable: true },
      { status: 503, headers: { "Retry-After": "10" } }
    );
    const supabase = createServerSupabaseClient();
    if (!supabase) return unavailable();
    try {
      const auth = await getAuthenticatedUser(request);
      if (!auth.user) {
        return noStoreJson({ ok: false, instruments: [], count: 0, message: auth.error || "Sign in required." } satisfies SupabaseReadResponse, { status: 401 });
      }
      const result = await loadRecordsForUser(supabase, auth.user, includeRemoved, code || undefined);
      if (code) {
        const instrument = result.records.find((record) => record.qrCode.toUpperCase() === code.trim().toUpperCase());
        if (!instrument) {
          return noStoreJson({ ok: false, message: "Instrument not found for this account." } satisfies SupabaseReadResponse, { status: 404 });
        }
        return noStoreJson(
          { ok: true, instrument, canManageVerification: await canManageRecordVerification(supabase, auth.user) } as SupabaseReadResponse & { canManageVerification: boolean },
          { status: 200 }
        );
      }
      return noStoreJson({ ok: true, instruments: result.records, count: result.records.length } satisfies SupabaseReadResponse, { status: 200 });
    } catch {
      return unavailable();
    }
  }

  try {
    if (code) {
      const requestedCode = normalizePublicProfileCode(code);
      if (!requestedCode || isRetiredPublicProfileCode(requestedCode)) {
        return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
      }
      const resolvedCode = await resolveRedirectedQrCode(requestedCode);
      if (isRetiredPublicProfileCode(resolvedCode)) {
        return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
      }
      const instrument = await getPublicInstrumentByCode(resolvedCode);
      if (!instrument) {
        return noStoreJson({ ok: false, message: "Instrument not found." } satisfies SupabaseReadResponse, { status: 404 });
      }
      return noStoreJson({ ok: true, instrument: sanitizePublicInstrumentWithConfirmedOwnerNames(instrument) } satisfies SupabaseReadResponse, { status: 200 });
    }
    const publicRecords = await getPublicInstruments();
    return noStoreJson(
      { ok: true, instruments: publicRecords.map(sanitizePublicInstrumentWithConfirmedOwnerNames), count: publicRecords.length } satisfies SupabaseReadResponse,
      { status: 200 }
    );
  } catch {
    return noStoreJson(
      { ok: false, message: "Profiles are temporarily unavailable. Please try again.", retryable: true },
      { status: 503, headers: { "Retry-After": "10" } }
    );
  }
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

  if (!supabase) return createFailure(503, "service_unavailable", "QRguitar Profiles are temporarily unavailable.", { retryable: true });

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return createFailure(401, "auth_required", auth.error || "Sign in again before creating this Profile.");

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return createFailure(writeAccess.status, "account_write_blocked", writeAccess.message);

  let body: CreateInstrumentRequest;
  try {
    body = (await request.json()) as CreateInstrumentRequest;
  } catch {
    return createFailure(400, "invalid_request", "The create request could not be read. Your form has not been cleared.", { retryable: true });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return createFailure(400,"invalid_request","The create request could not be read.");
  if ((body.customFields !== undefined && !Array.isArray(body.customFields)) || (body.customLinks !== undefined && !Array.isArray(body.customLinks)) ||
      (Array.isArray(body.documents) && body.documents.some((document) => !document || typeof document !== "object")) ||
      (Array.isArray(body.customFields) && body.customFields.some((field) => !field || typeof field !== "object")) ||
      (Array.isArray(body.customLinks) && body.customLinks.some((link) => !link || typeof link !== "object"))) {
    return createFailure(400,"invalid_request","Profile documents, links and details must be valid lists.");
  }
  const ownerUser = auth.user;
  const uploadId = cleanCreateKey(body.uploadId);
  const idempotencyKey = cleanCreateKey(body.idempotencyKey);
  const rawPhotos = Array.isArray(body.photos) ? body.photos.map((value) => String(value || "").trim()).filter(Boolean) : [];
  const rawDocuments = Array.isArray(body.documents) ? body.documents : [];
  const mediaPaths = Array.from(new Set(rawPhotos));
  const documentPaths = rawDocuments.map((document) => String(document?.storagePath || "").trim()).filter(Boolean);
  const idempotencyContentKey = idempotencyKey ? createSubmissionContentKey(ownerUser.id, idempotencyKey) : "";

  let claimedSubmission = false;
  const cleanupAndFail = async (
    status: number,
    code: string,
    message: string,
    options: Omit<SupabaseCreateResponse, "ok" | "code" | "message"> = {}
  ) => {
    // Early validation has not reserved this request: keep uploads and any existing completion receipt.
    const cleaned = claimedSubmission && await removeUnreferencedStagedUploads(supabase, ownerUser.id, uploadId, mediaPaths, documentPaths);
    if (claimedSubmission && idempotencyContentKey) await supabase.from("site_content").delete().eq("content_key", idempotencyContentKey);
    return createFailure(status, code, message, { cleanupUploads: Boolean(cleaned), ...options });
  };

  const preserveAndFail = (
    status: number,
    code: string,
    message: string,
    options: Omit<SupabaseCreateResponse, "ok" | "code" | "message"> = {}
  ) => createFailure(status, code, message, { cleanupUploads: false, ...options });

  if (!uploadId || !idempotencyKey) {
    return createFailure(400, "invalid_upload_session", "Refresh the Create page and try again. Your selected files remain on this page.", { retryable: true });
  }
  if (rawPhotos.length > 20) {
    return cleanupAndFail(400, "photo_limit_exceeded", "Choose no more than 20 photos.", { fieldErrors: { photos: "A Profile can include up to 20 photos." } });
  }
  if (rawDocuments.length > 10) {
    return cleanupAndFail(400, "document_limit_exceeded", "Choose no more than 10 documents.", { fieldErrors: { documents: "A Profile can include up to 10 documents during creation." } });
  }
  if (!mediaPaths.length) {
    return createFailure(400, "photo_required", "Add at least one clear photo before creating a QRguitar Profile.", {
      fieldErrors: { photos: "At least one photo is required." }
    });
  }
  if (mediaPaths.some((path) => !isOwnedStagedPath(path, ownerUser.id, uploadId, "image"))) {
    return createFailure(400, "invalid_photo_upload", "One or more photo uploads could not be verified. Retry the failed files.", {
      fieldErrors: { photos: "Retry the files marked as failed." },
      retryable: true
    });
  }
  if (documentPaths.length !== rawDocuments.length || documentPaths.some((path) => !isOwnedStagedPath(path, ownerUser.id, uploadId, "document"))) {
    return preserveAndFail(400, "invalid_document_upload", "One or more document uploads could not be verified.", {
      fieldErrors: { documents: "Remove or retry the failed document." },
      retryable: true
    });
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
    location: String(body.location || "").trim(),
    visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
    summary: String(body.summary || "").trim()
  };
  const customLinks = (body.customLinks || [])
    .map((link) => ({ label: String(link.label || "").trim(), url: String(link.url || "").trim() }))
    .filter((link) => link.label && link.url)
    .slice(0, 6);

  const fieldErrors: Record<string, string> = {};
  if (!input.brand) fieldErrors.brand = "Choose the instrument brand.";
  if (!input.model) fieldErrors.model = "Enter the model or build name.";
  if (!input.instrumentType) fieldErrors.instrumentType = "Choose the instrument type.";
  if (!input.serial && !input.serialNotUsed) fieldErrors.serial = "Enter the Serial Number, or confirm this instrument does not use one.";
  if (customLinks.some((link) => !/^https:\/\//i.test(link.url))) fieldErrors.customLinks = "Supporting links must begin with https://.";
  if (Object.keys(fieldErrors).length) return preserveAndFail(400, "validation_failed", "Review the highlighted fields and try again.", { fieldErrors });

  try {
    const brandResolution = await resolveCanonicalBrand(supabase, input.brand);
    if (brandResolution.suggestion) {
      return preserveAndFail(409,"brand_spelling_conflict",`That brand looks like ${brandResolution.suggestion}. Choose the existing spelling to keep the Catalog clean.`,{
        fieldErrors:{brand:`Choose ${brandResolution.suggestion} from the brand list.`}
      });
    }
    const payload = buildCreateProfilePayload(
      body as unknown as Record<string,unknown>, brandResolution.brand,
      ownerUser.user_metadata?.display_name || ownerUser.email || "", profileLinkSpecLabel
    );
    // Single service-role transaction owns allocation, limits, files, relational rows
    // and receipt. No pre-commit pending record or compensating delete is persisted.
    const billingEnvironment = profileBillingEnvironment(process.env, getSupabaseEnvStatus().supabaseUrl);
    if (!billingEnvironment) return preserveAndFail(503,"create_configuration_unavailable","Profile creation is temporarily unavailable. Your form and uploads are preserved.",{retryable:false});
    const result = await supabase.rpc("create_catalog_instrument_profile",{
      p_owner_id:ownerUser.id,p_idempotency_key:idempotencyKey,p_upload_id:uploadId,p_payload:payload,
      p_launch_testing_access:hasLaunchTestingAccess(ownerUser.email||""),
      p_owner_display_name:ownerUser.user_metadata?.display_name || ownerUser.email || "",
      ...(billingEnvironment === "test" ? { p_billing_environment: billingEnvironment } : {})
    });
    if(result.error || result.data?.ok!==true){
      const failure=createProfileFailure(result.error);
      return preserveAndFail(failure.status,failure.code,failure.message,{
        retryable:failure.retryable,
        ...(failure.resetUploads ? { resetUploads: true } : {}),
        ...(failure.code==="duplicate_serial"?{existingProfileFound:true,claimHref:"/ownership-claim",fieldErrors:{serial:"Existing Profile found for this Serial Number."}}:{})
      });
    }
    try { revalidatePublicRecordSurfaces(result.data.qrCode); } catch(error) { console.error("Profile creation committed; cache refresh failed.",error); }
    return noStoreJson({
      ok:true,qrCode:result.data.qrCode,permanentPath:result.data.permanentPath,
      message:result.data.alreadyCreated?"This Profile was already created.":"QRguitar Profile created."
    } satisfies SupabaseCreateResponse);
  } catch(error) {
    if(error instanceof CreateProfileError) return preserveAndFail(error.status,error.code,error.message);
    const failure=createProfileFailure(null);
    return preserveAndFail(failure.status,failure.code,failure.message,{retryable:failure.retryable});
  }
}


export async function PATCH(request: Request) {
  noStore();
  const parsedBody = await readBoundedJsonBody(request, MAX_PROFILE_EDIT_JSON_BYTES);
  if (!parsedBody.ok) {
    return noStoreJson({
      ok: false,
      code: parsedBody.reason === "too_large" ? "profile_metadata_too_large" : "invalid_request",
      message: parsedBody.reason === "too_large"
        ? "Profile metadata is too large. Upload files directly and try again."
        : "Invalid request body."
    }, { status: parsedBody.reason === "too_large" ? 413 : 400 });
  }
  const body = parsedBody.body as UpdateInstrumentRequest;
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

  if (body.verificationOnly || body.action === "remove_from_collection") {
    const qrCode = String(body.qrCode || "").trim().toUpperCase();
    if (!qrCode) return noStoreJson({ ok: false, message: "Missing QRguitar ID." }, { status: 400 });
    const action = body.verificationOnly ? "verification" : "remove_from_collection";
    const payload: Record<string, unknown> = action === "remove_from_collection" ? { reason: String(body.reason || "").trim().slice(0, 1000) } : {};
    if (action === "verification") {
      for (const field of ["verificationStatus", "authenticityStatus", "showVerificationBadge", "showAuthenticityBadge", "showSerialPublic", "serialExceptionApproved", "internalVerificationNote", "publicVerificationNote", "internalAuthenticityNote", "publicAuthenticityNote"] as const) {
        if (body[field] !== undefined) payload[field] = body[field];
      }
    }
    const failure = (error?: { code?: string; message?: string } | null) => {
      const code = error?.code;
      if (code === "PGRST202" || code === "42883") return noStoreJson({ ok: false, code: "profile_controls_unavailable", message: "Profile controls are temporarily unavailable. Please try again later." }, { status: 503 });
      if (code === "42501") return noStoreJson({ ok: false, code: "profile_controls_forbidden", message: error?.message || "You cannot change this Profile." }, { status: 403 });
      if (code === "QC001") return noStoreJson({ ok: false, code: "profile_not_found", message: "QRguitar Profile was not found." }, { status: 404 });
      if (code === "QC002" || code === "QC003") return noStoreJson({ ok: false, code: "profile_controls_conflict", message: error?.message || "This Profile needs review before changing it." }, { status: 409 });
      if (code === "22023") return noStoreJson({ ok: false, code: "profile_controls_validation", message: error?.message || "Review the Profile settings." }, { status: 400 });
      return noStoreJson({ ok: false, code: "profile_controls_unconfirmed", uncertain: true, retryable: true,
        message: "The change could not be confirmed. Reload this Profile or retry the same action." }, { status: 502 });
    };
    let result;
    try {
      result = await supabase.rpc("update_instrument_controls", {
        p_actor_id: auth.user.id, p_qr_code: qrCode, p_action: action, p_payload: payload,
        // Database roles and active account status are checked under the lock.
        p_env_admin: readAdminEmailList().includes(normalizeLookupEmail(auth.user.email || ""))
      });
    } catch { return failure(); }
    if (result.error) return failure(result.error);
    const committed = result.data as { ok?: boolean; qrCode?: string; permanentPath?: string; removed?: boolean; verificationStatus?: string; trust?: Record<string, unknown>; replayed?: boolean } | null;
    if (committed?.ok !== true || committed.qrCode !== qrCode || !committed.permanentPath || typeof committed.replayed !== "boolean" ||
      (action === "remove_from_collection" ? committed.removed !== true : !committed.trust || Array.isArray(committed.trust) || typeof committed.trust.showSerialPublic !== "boolean" || !["confirmed", "unconfirmed"].includes(String(committed.trust.authenticityStatus)) || !["verified", "unverified"].includes(committed.verificationStatus || ""))) return failure();
    try { revalidatePublicRecordSurfaces(qrCode); } catch (error) { console.error("Profile control change committed; cache refresh failed.", error); }
    const trustResponse = Object.fromEntries(["authenticityStatus", "showVerificationBadge", "showAuthenticityBadge", "showSerialPublic", "serialExceptionApproved", "internalVerificationNote", "publicVerificationNote", "internalAuthenticityNote", "publicAuthenticityNote"].filter((field) => committed.trust && field in committed.trust).map((field) => [field, committed.trust?.[field]]));
    return noStoreJson({ ok: true, qrCode, permanentPath: committed.permanentPath, replayed: committed.replayed,
      ...(action === "verification" ? { verificationStatus: committed.verificationStatus, ...trustResponse } : {}),
      message: action === "verification" ? "Trust settings updated." : "Profile permanently deleted from your dashboard. This cannot be undone."
    }, { status: 200 });
  }

  if (body.action === "restore_to_collection") {
    return noStoreJson({ ok: false, message: "Deleted profiles cannot be restored. Create a new QRguitar Profile instead." }, { status: 410 });
  }

  if (hasInlineProfileAssets(body)) {
    return noStoreJson({
      ok: false,
      code: "inline_profile_upload_rejected",
      message: "Upload photos and documents directly before saving Profile metadata."
    }, { status: 413 });
  }


  try {
    const versionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
    const expectedUpdatedAt = body.expectedUpdatedAt;
    if (typeof expectedUpdatedAt !== "string" || !versionPattern.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      throw new ProfileSaveError("Reload this Profile before saving again.", 400, "profile_version_required");
    }
    const documentSnapshot = body.expectedDocuments;
    const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!Array.isArray(documentSnapshot) ||
        documentSnapshot.some((document) => !document || typeof document.id !== "string" || !documentIdPattern.test(document.id) ||
          typeof document.updatedAt !== "string" || !versionPattern.test(document.updatedAt) || !Number.isFinite(Date.parse(document.updatedAt))) ||
        new Set(documentSnapshot.map((document) => document.id.toLowerCase())).size !== documentSnapshot.length) {
      throw new ProfileSaveError("Reload this Profile and its documents before saving again.", 400, "profile_document_versions_required");
    }
    const expectedDocuments = documentSnapshot.map(({ id, updatedAt }) => ({ id, updated_at: updatedAt }));
    if (body.visibility !== undefined && body.visibility !== "public" && body.visibility !== "private" && body.visibility !== "unlisted") {
      throw new ProfileSaveError("Invalid Profile visibility.", 400, "profile_visibility_invalid");
    }
    const input = {
      qrCode: String(body.qrCode || "").trim().toUpperCase(),
      name: String(body.name || "").trim(), brand: String(body.brand || "").trim(),
      model: String(body.model || "").trim(), serial: String(body.serial || "").trim(),
      serialNotUsed: body.serialNotUsed === true, year: String(body.year || "").trim(),
      instrumentType: String(body.instrumentType || "").trim(), builder: String(body.builder || "").trim(),
      finish: String(body.finish || "").trim(), condition: body.condition === "new" ? "new" : "used",
      saleStatus: body.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
      originalityStatus: body.originalityStatus === "all_original" ? "all_original" : body.originalityStatus === "modified" ? "modified" : "unknown",
      ownerName: String(body.ownerName || "").trim(), location: String(body.location || "").trim(),
      visibility: body.visibility === "private" ? "private" : body.visibility === "unlisted" ? "unlisted" : "public",
      summary: String(body.summary || "").trim()
    };
    if (!input.qrCode || !input.brand || !input.model || !input.instrumentType || (!input.serial && !input.serialNotUsed)) {
      throw new ProfileSaveError("Brand, model, instrument type, and Serial Number are required unless the instrument does not use one.");
    }
    if (input.serial && normalizeSerialBuildId(input.serial).length < 4) {
      throw new ProfileSaveError("Serial Number must contain at least four letters or numbers.");
    }
    if ((body.customLinks !== undefined && !Array.isArray(body.customLinks)) ||
        (body.customFields !== undefined && !Array.isArray(body.customFields))) {
      throw new ProfileSaveError("Profile links and details must be lists.");
    }
    const customLinks = (body.customLinks || []).map((link) => {
      if (!link || typeof link !== "object") throw new ProfileSaveError("Invalid profile link.");
      return { label: String(link.label || "").trim(), url: String(link.url || "").trim() };
    }).filter((link) => link.label || link.url);
    if (customLinks.length > 6 || customLinks.some((link) => {
      try {
        const url = new URL(link.url);
        return !link.label || link.label.length > 200 || link.url.length > 2000 || url.protocol !== "https:" || Boolean(url.username || url.password);
      } catch { return true; }
    })) {
      throw new ProfileSaveError("Add a label and valid secure https:// URL for each link (up to six).");
    }
    const customFields = (body.customFields || []).map((field) => {
      if (!field || typeof field !== "object") throw new ProfileSaveError("Invalid profile detail.");
      if (field.id !== undefined && !existingProfileSpecId(field.id)) throw new ProfileSaveError("Invalid profile detail identity.");
      return { ...(field.id !== undefined ? { id: existingProfileSpecId(field.id) } : {}), label: String(field.label || "").trim(), value: String(field.value || "").trim() };
    }).filter((field) => field.label && field.value);
    if (customFields.length > 89 || customFields.some((field) => field.label.length > 200 || field.value.length > 10000)) {
      throw new ProfileSaveError("There are too many profile details, or a detail is too long.");
    }

    const brandResolution = await resolveCanonicalBrand(supabase, input.brand);
    if (brandResolution.suggestion) {
      throw new ProfileSaveError(`That brand looks like ${brandResolution.suggestion}. Choose the existing brand spelling to keep the Catalog clean.`, 409);
    }
    input.brand = brandResolution.brand;
    const ownerUser = auth.user;
    const existing = await supabase.from("guitars")
      .select("id,owner_id,status,hero_image_path,serial_number,qr_code,permanent_path,updated_at,visibility")
      .eq("qr_code", input.qrCode)
      .maybeSingle<GuitarRow & { updated_at: string }>();
    if (existing.error) throw new ProfileSaveError("Could not read this Profile. Try again.", 502);
    if (!existing.data) throw new ProfileSaveError("QRguitar Profile was not found.", 404);
    const guitar = existing.data;
    if (guitar.owner_id !== ownerUser.id) throw new ProfileSaveError("Only the owner can edit this Profile.", 403);
    if (guitar.visibility !== "public" && guitar.visibility !== "private" && guitar.visibility !== "unlisted") {
      throw new ProfileSaveError("Reload this Profile before saving again.", 502, "profile_visibility_unavailable");
    }
    // An ordinary edit does not select publication, including a stale client sending public.
    input.visibility = guitar.visibility;
    const currentSerialNormalized = normalizeSerialBuildId(guitar.serial_number || "");
    const nextSerialNormalized = normalizeSerialBuildId(input.serial);
    // Removing a serial is an identity correction too; it cannot bypass admin approval.
    const serialCorrectionChangesIdentity = nextSerialNormalized !== currentSerialNormalized;
    const serialCorrectionApproved = serialCorrectionChangesIdentity
      ? await canApproveSerialCorrection(supabase, ownerUser) : false;
    if (serialCorrectionChangesIdentity && !serialCorrectionApproved) {
      throw new ProfileSaveError("Serial Number corrections require QRguitar admin approval so printed QR links and ownership history stay intact.", 403);
    }
    const nextQrCode = serialCorrectionChangesIdentity && nextSerialNormalized
      ? qrCodeFromSerial(input.serial) || input.qrCode : input.qrCode;
    if (input.serial) {
      const duplicateId = await findGuitarByExactSerial(supabase, input.serial).catch(() => "lookup-error");
      if (duplicateId === "lookup-error") throw new ProfileSaveError("Could not verify the updated Serial Number.", 502);
      if (duplicateId && duplicateId !== guitar.id) throw new ProfileSaveError("That Serial Number belongs to another QRguitar Profile.", 409);
    }
    const [mediaResult, documentsResult] = await Promise.all([
      supabase.from("guitar_media").select("id,storage_path,alt,sort_order").eq("guitar_id", guitar.id),
      supabase.from("guitar_documents")
        .select("id,name,storage_path,is_public,document_type,public_description,private_notes,issuer_source,document_date,description,file_size_bytes,mime_type,related_timeline_event_id,related_service_event_id,updated_at")
        .eq("retained_private", false).eq("guitar_id", guitar.id)
    ]);
    if (mediaResult.error || documentsResult.error) {
      throw new ProfileSaveError("Could not read all existing photos and documents. No profile changes were saved.", 502);
    }
    const specs = [
      { label: "Condition", value: input.condition, sort_order: 1 },
      ...(input.instrumentType ? [{ label: "Type", value: input.instrumentType, sort_order: 2 }] : []),
      ...(input.finish ? [{ label: "Finish", value: input.finish, sort_order: 3 }] : []),
      { label: "Availability", value: input.saleStatus, sort_order: 4 },
      { label: "Originality", value: input.originalityStatus, sort_order: 5 },
      ...customFields.map((field, index) => ({ ...field, sort_order: index + 6 })),
      ...customLinks.map((link, index) => ({
        label: profileLinkSpecLabel(link.label), value: link.url, sort_order: customFields.length + index + 6
      }))
    ];
    const verifiedUploads = await verifyProfileEditUploads({
      supabase, body: body as unknown as Record<string, unknown>, ownerId: ownerUser.id, guitarId: guitar.id,
      uploadId: cleanProfileUploadId(body.uploadId),
      existingMediaPaths: [...(mediaResult.data || []).map((row) => row.storage_path), ...(guitar.hero_image_path ? [guitar.hero_image_path] : [])],
      existingDocumentPaths: (documentsResult.data || []).map((row) => row.storage_path)
    });
    const assets = await prepareProfileAssets({
      body, ownerId: ownerUser.id, guitarId: guitar.id, currentHeroPath: guitar.hero_image_path,
      supabaseUrl: getSupabaseEnvStatus().supabaseUrl,
      existingMedia: (mediaResult.data || []) as SavedMedia[],
      existingDocuments: (documentsResult.data || []) as SavedDocument[],
      verifiedUploads
    });
    // This is the only database mutation in a full profile edit. All dependent rows,
    // trust settings, redirect, serial aliases, and audit entry commit or roll back together.
    // Retain uploaded files on uncertain responses: a timed-out RPC may have committed.
    const result = await supabase.rpc("save_catalog_instrument_profile", {
      p_guitar_id: guitar.id, p_owner_id: ownerUser.id, p_expected_updated_at: expectedUpdatedAt,
      p_payload: {
        guitar: {
          qr_code: nextQrCode, name: input.name || `${input.brand} ${input.model}`.trim(),
          brand: input.brand, model: input.model, year: input.year, serial_number: input.serial,
          builder: input.builder, location: input.location, visibility: input.visibility,
          summary: input.summary, hero_image_path: assets.heroImagePath
        },
        media: assets.media, documents: assets.documents, specs,
        expected_media: assets.expectedMedia, expected_documents: expectedDocuments,
        owner_name: input.ownerName, actor_email: ownerUser.email || "",
        serial_correction_approved: serialCorrectionApproved,
        ...(typeof body.showSerialPublic === "boolean" ? { show_serial_public: body.showSerialPublic } : {})
      }
    });
    if (result.error || result.data?.ok !== true || typeof result.data.updatedAt !== "string" || !versionPattern.test(result.data.updatedAt) || !Number.isFinite(Date.parse(result.data.updatedAt))) {
      const failure = profileSaveFailure(result.error);
      return noStoreJson({ ok: false, code: failure.code, message: failure.message }, { status: failure.status });
    }
    // A cache refresh failure must never disguise a committed save as a failed write.
    try {
      revalidatePublicRecordSurfaces(input.qrCode);
      if (nextQrCode !== input.qrCode) revalidatePublicRecordSurfaces(nextQrCode);
    } catch (error) {
      console.error("Profile save committed; cache refresh failed.", error);
    }
    return noStoreJson({ ok: true, qrCode: result.data.qrCode, permanentPath: result.data.permanentPath, updatedAt: result.data.updatedAt }, { status: 200 });
  } catch (error) {
    if (error instanceof ProfileSaveError) {
      return noStoreJson({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }
    const failure = profileSaveFailure(null);
    return noStoreJson({ ok: false, code: failure.code, message: failure.message }, { status: failure.status });
  }
}
