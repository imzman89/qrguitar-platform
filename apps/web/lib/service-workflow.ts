import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getAdminContext, type ServerSupabaseClient } from "./admin-auth";

export const SERVICE_CATEGORIES = [
  "Setup",
  "Repair",
  "Electronics",
  "Fretwork",
  "Structural Repair",
  "Finish Work",
  "Restoration",
  "Modification",
  "Inspection",
  "Appraisal",
  "Amplifier Service",
  "Other"
] as const;

export const ACTIVE_SERVICE_STATUSES = ["draft", "submitted", "changes_requested"] as const;
export const REVIEWABLE_SERVICE_STATUSES = ["submitted", "changes_requested"] as const;
export const SERVICE_EVIDENCE_TYPES = ["invoice", "work_order", "service_slip", "before_photo", "after_photo", "measurement_sheet", "receipt", "other"] as const;
export const SERVICE_EVIDENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export const SERVICE_EVIDENCE_MAX_BYTES = 15 * 1024 * 1024;

export type ServiceSubmissionStatus = "draft" | "submitted" | "changes_requested" | "approved" | "declined" | "cancelled" | "expired";

export type ServiceProviderProfileRow = {
  user_id: string;
  business_name: string;
  public_display_name: string;
  website: string | null;
  location: string | null;
  service_categories: string[];
  verification_status: "unverified" | "verified";
  verified_at: string | null;
  verified_by: string | null;
  internal_review_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceSubmissionRow = {
  id: string;
  guitar_id: string;
  provider_user_id: string;
  owner_user_id: string;
  status: ServiceSubmissionStatus;
  service_date: string | null;
  service_type: string;
  title: string;
  work_performed: string;
  parts_installed: string | null;
  setup_measurements: string | null;
  work_order_reference: string | null;
  recommended_public_description: string | null;
  private_provider_note: string | null;
  owner_visibility_choice: "public" | "private";
  provider_revision: number;
  owner_review_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  resulting_service_event_id: string | null;
  resulting_timeline_event_id: string | null;
  email_delivery_status: "not_attempted" | "sent" | "failed";
  email_dispatch_mode?: "inline" | "outbox";
  email_delivery_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceGuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  visibility: "public" | "unlisted" | "private";
  hero_image_path?: string | null;
  admin_archived_at?: string | null;
  owner_removed_at?: string | null;
};

export function cleanServiceText(value: unknown, maxLength = 3000) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);
}

export function cleanServiceDate(value: unknown) {
  const text = cleanServiceText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function cleanServiceCategory(value: unknown) {
  const category = cleanServiceText(value, 80);
  return (SERVICE_CATEGORIES as readonly string[]).includes(category) ? category : "Other";
}

export function cleanServiceVisibility(value: unknown): "public" | "private" {
  return value === "public" ? "public" : "private";
}

export function cleanServiceUrl(value: unknown) {
  const text = cleanServiceText(value, 500);
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function serviceMigrationMissing(message?: string | null) {
  return /service_(provider|submission)|source_kind|service_submission_id|relation .* does not exist|schema cache/i.test(message || "");
}

export function serviceMigrationMessage() {
  return "Service-provider workflow database update required. Apply supabase/migrations/20260718160000_service_provider_workflow.sql.";
}

export function createReviewToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashReviewToken(token) };
}

export function hashReviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sanitizeEvidenceFilename(value: string) {
  const base = value.split(/[\\/]/).pop() || "evidence";
  const safe = base.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (safe || "evidence").slice(0, 120);
}

export function serviceTitle(guitar: ServiceGuitarRow) {
  return cleanServiceText(guitar.name, 180) || [guitar.brand, guitar.model].filter(Boolean).join(" ") || guitar.qr_code;
}

export async function loadServiceGuitar(supabase: ServerSupabaseClient, qrCode: string) {
  const result = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,visibility,hero_image_path,admin_archived_at,owner_removed_at")
    .eq("qr_code", qrCode.toUpperCase())
    .maybeSingle<ServiceGuitarRow>();
  if (result.error) throw new Error(result.error.message);
  if (!result.data || result.data.admin_archived_at || result.data.owner_removed_at) return null;
  return result.data;
}

export async function isServiceAdmin(request: Request) {
  const context = await getAdminContext(request);
  return context.ok;
}

export async function loadProviderProfile(supabase: ServerSupabaseClient, userId: string) {
  const result = await supabase.from("service_provider_profiles").select("*").eq("user_id", userId).maybeSingle<ServiceProviderProfileRow>();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

export async function hasPrivateProfileAccess(supabase: ServerSupabaseClient, guitarId: string, providerUserId: string) {
  const result = await supabase
    .from("service_provider_profile_access")
    .select("id,expires_at,revoked_at")
    .eq("guitar_id", guitarId)
    .eq("provider_user_id", providerUserId)
    .is("revoked_at", null)
    .maybeSingle<{ id: string; expires_at: string | null; revoked_at: string | null }>();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data && (!result.data.expires_at || new Date(result.data.expires_at).getTime() > Date.now()));
}

export async function canProviderAccessGuitar(supabase: ServerSupabaseClient, guitar: ServiceGuitarRow, user: User) {
  if (!guitar.owner_id || guitar.owner_id === user.id) return false;
  if (guitar.visibility === "public" || guitar.visibility === "unlisted") return true;
  return hasPrivateProfileAccess(supabase, guitar.id, user.id);
}

export function mapProviderProfile(row: ServiceProviderProfileRow | null, includeInternal = false) {
  if (!row) return null;
  return {
    userId: row.user_id,
    businessName: row.business_name,
    publicDisplayName: row.public_display_name,
    website: row.website || "",
    location: row.location || "",
    serviceCategories: row.service_categories || [],
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at || undefined,
    ...(includeInternal ? { internalReviewNote: row.internal_review_note || "" } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapServiceSubmission(
  row: ServiceSubmissionRow,
  options: {
    guitar?: ServiceGuitarRow | null;
    provider?: ServiceProviderProfileRow | null;
    evidenceCount?: number;
    activity?: unknown[];
    includePrivate?: boolean;
  } = {}
) {
  const includePrivate = options.includePrivate !== false;
  return {
    id: row.id,
    qrCode: options.guitar?.qr_code || "",
    profileTitle: options.guitar ? serviceTitle(options.guitar) : "",
    profileImagePath: options.guitar?.hero_image_path || "",
    provider: mapProviderProfile(options.provider || null),
    status: row.status,
    serviceDate: row.service_date || "",
    serviceType: row.service_type,
    title: row.title,
    workPerformed: row.work_performed,
    partsInstalled: row.parts_installed || "",
    setupMeasurements: row.setup_measurements || "",
    workOrderReference: row.work_order_reference || "",
    recommendedPublicDescription: row.recommended_public_description || "",
    ...(includePrivate ? { privateProviderNote: row.private_provider_note || "", ownerReviewNote: row.owner_review_note || "" } : {}),
    requestedVisibility: row.owner_visibility_choice,
    providerRevision: row.provider_revision,
    evidenceCount: options.evidenceCount || 0,
    emailDeliveryStatus: row.email_delivery_status,
    emailDeliveryMessage: row.email_delivery_message || "",
    submittedAt: row.submitted_at || "",
    reviewedAt: row.reviewed_at || "",
    approvedAt: row.approved_at || "",
    declinedAt: row.declined_at || "",
    cancelledAt: row.cancelled_at || "",
    expiresAt: row.expires_at || "",
    resultingServiceEventId: row.resulting_service_event_id || "",
    resultingTimelineEventId: row.resulting_timeline_event_id || "",
    activity: options.activity || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
