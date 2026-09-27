import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertAccountCanWrite, getAdminContext, logAdminAuditEvent } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import { sendServiceReviewEmail } from "../../../lib/transactional-email";
import { serviceEmailDeliveryView } from "../../../lib/service-email-status";
import {
  ACTIVE_SERVICE_STATUSES,
  cleanServiceCategory,
  cleanServiceDate,
  cleanServiceText,
  cleanServiceVisibility,
  hashReviewToken,
  loadProviderProfile,
  loadServiceGuitar,
  mapServiceSubmission,
  serviceMigrationMessage,
  serviceMigrationMissing,
  serviceTitle,
  type ServiceGuitarRow,
  type ServiceProviderProfileRow,
  type ServiceSubmissionRow
} from "../../../lib/service-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Supabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;
type ActivityRow = { id: string; action: string; note: string | null; metadata: Record<string, unknown> | null; created_at: string };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

function errorResponse(message: string, status = 500) {
  const migrationMissing = serviceMigrationMissing(message);
  return json({ ok: false, message: migrationMissing ? serviceMigrationMessage() : message }, migrationMissing ? 503 : status);
}

async function isAdmin(request: Request) {
  return (await getAdminContext(request)).ok;
}

async function addActivity(supabase: Supabase, submissionId: string, actorUserId: string | null, action: string, note = "", metadata: Record<string, unknown> = {}) {
  return supabase.from("service_submission_activity").insert({ submission_id: submissionId, actor_user_id: actorUserId, action, note: note || null, metadata });
}

async function addNotification(supabase: Supabase, submissionId: string, recipientUserId: string, type: string, message: string) {
  return supabase.from("service_submission_notifications").insert({ submission_id: submissionId, recipient_user_id: recipientUserId, notification_type: type, message });
}

async function loadSubmission(supabase: Supabase, id: string) {
  const result = await supabase.from("service_submissions").select("*").eq("id", id).maybeSingle<ServiceSubmissionRow>();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function loadGuitarById(supabase: Supabase, id: string) {
  const result = await supabase.from("guitars").select("id,owner_id,qr_code,permanent_path,name,brand,model,visibility,hero_image_path,admin_archived_at,owner_removed_at").eq("id", id).maybeSingle<ServiceGuitarRow>();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function serializeSubmissions(supabase: Supabase, rows: ServiceSubmissionRow[], includeActivity = false) {
  const guitarIds = [...new Set(rows.map((row) => row.guitar_id))];
  const providerIds = [...new Set(rows.map((row) => row.provider_user_id))];
  const submissionIds = rows.map((row) => row.id);
  const [guitars, providers, evidence, activities] = await Promise.all([
    guitarIds.length ? supabase.from("guitars").select("id,owner_id,qr_code,permanent_path,name,brand,model,visibility,hero_image_path,admin_archived_at,owner_removed_at").in("id", guitarIds) : Promise.resolve({ data: [], error: null }),
    providerIds.length ? supabase.from("service_provider_profiles").select("*").in("user_id", providerIds) : Promise.resolve({ data: [], error: null }),
    submissionIds.length ? supabase.from("service_submission_evidence").select("id,submission_id").in("submission_id", submissionIds) : Promise.resolve({ data: [], error: null }),
    includeActivity && submissionIds.length ? supabase.from("service_submission_activity").select("id,submission_id,action,note,metadata,created_at").in("submission_id", submissionIds).order("created_at") : Promise.resolve({ data: [], error: null })
  ]);
  for (const result of [guitars, providers, evidence, activities]) {
    if (result.error) throw new Error(result.error.message);
  }
  const guitarMap = new Map((guitars.data || []).map((row) => [row.id, row as ServiceGuitarRow]));
  const providerMap = new Map((providers.data || []).map((row) => [row.user_id, row as ServiceProviderProfileRow]));
  const evidenceCounts = new Map<string, number>();
  for (const row of evidence.data || []) evidenceCounts.set(row.submission_id, (evidenceCounts.get(row.submission_id) || 0) + 1);
  const activityMap = new Map<string, ActivityRow[]>();
  for (const row of activities.data || []) activityMap.set(row.submission_id, [...(activityMap.get(row.submission_id) || []), row as ActivityRow]);
  const queuedIds = rows.filter(row => row.email_dispatch_mode === "outbox").map(row => row.id);
  const delivery = queuedIds.length ? await supabase.rpc("service_email_statuses", { p_submission_ids: queuedIds }) : { data: {}, error: null };
  if (delivery.error) throw new Error("Current email delivery status is unavailable.");
  return rows.map((row) => {
    const mapped = mapServiceSubmission(row, { guitar: guitarMap.get(row.guitar_id), provider: providerMap.get(row.provider_user_id), evidenceCount: evidenceCounts.get(row.id), activity: activityMap.get(row.id), includePrivate: true });
    if (row.email_dispatch_mode !== "outbox") return mapped;
    return { ...mapped, ...serviceEmailDeliveryView(delivery.data?.[row.id]) };
  });
}

async function sendOwnerReview(supabase: Supabase, submission: ServiceSubmissionRow, guitar: ServiceGuitarRow, provider: ServiceProviderProfileRow | null) {
  let fresh: ServiceSubmissionRow;
  let currentGuitar: ServiceGuitarRow;
  let email: string;
  try {
    const latest = await loadSubmission(supabase, submission.id);
    if (!latest || latest.status !== "submitted" || latest.owner_user_id !== submission.owner_user_id
      || latest.provider_user_id !== submission.provider_user_id || latest.provider_revision !== submission.provider_revision
      || latest.guitar_id !== guitar.id || !latest.owner_user_id || !latest.expires_at
      || !Number.isFinite(Date.parse(latest.expires_at)) || Date.parse(latest.expires_at) <= Date.now()) {
      return { ok: false, outcome: "not_sent", retryable: false, message: "Review email was not sent because the service request changed or expired. Refresh the request before continuing." };
    }
    const owner = await supabase.auth.admin.getUserById(latest.owner_user_id);
    if (owner.error || !owner.data.user?.email) return { ok: false, outcome: "not_sent", retryable: true, message: "Review email was not sent because the owner's delivery address could not be confirmed." };
    const latestGuitar = await loadGuitarById(supabase, latest.guitar_id);
    if (!latestGuitar || latestGuitar.owner_id !== latest.owner_user_id || latestGuitar.admin_archived_at || latestGuitar.owner_removed_at) {
      return { ok: false, outcome: "not_sent", retryable: false, message: "Review email was not sent because Profile ownership or availability changed. The request needs review." };
    }
    fresh = latest;
    currentGuitar = latestGuitar;
    email = owner.data.user.email;
  } catch {
    return { ok: false, outcome: "not_sent", retryable: true, message: "Review email was not sent because the current request and owner could not be confirmed. Please try again." };
  }

  // This existing review route requires the current owner's account, with or without a token.
  // Retries never rotate previous emailed links or extend the submission's original deadline.
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.qrguitar.com").replace(/\/$/, "");
  const reviewUrl = `${siteUrl}/service-review/${encodeURIComponent(fresh.id)}`;
  const providerName = provider?.public_display_name || provider?.business_name || "A service provider";
  let outcome: "accepted" | "rejected" | "unknown" = "unknown";
  let providerMessageId: string | undefined;
  let retryable = false;
  try {
    const result = await sendServiceReviewEmail({ to: email, profileTitle: serviceTitle(currentGuitar), providerName, reviewUrl }) as Awaited<ReturnType<typeof sendServiceReviewEmail>> & { outcome?: "accepted" | "rejected" | "unknown"; retryable?: boolean };
    providerMessageId = result.providerMessageId;
    // Legacy transport's success with a receipt is acceptance, never confirmed inbox delivery.
    outcome = result.outcome || (result.ok && providerMessageId ? "accepted" : "unknown");
    if (outcome === "accepted" && !providerMessageId) outcome = "unknown";
    retryable = outcome === "rejected" && result.retryable === true;
  } catch { /* A lost response cannot establish whether the provider accepted the email. */ }
  const message = outcome === "accepted" ? "Review email accepted by the email provider. Inbox delivery is not yet confirmed."
    : outcome === "rejected" ? "The email provider rejected the review email. The service request and previous review links are unchanged."
    : "Email acceptance could not be confirmed. Check the owner's inbox before resending; the service request and previous review links are unchanged.";
  const unrecorded = () => ({ ok: false, outcome, recorded: false, retryable: false,
    message: outcome === "accepted" ? "The email provider accepted the review email, but its delivery record could not be confirmed. Check the request and owner's inbox before resending."
      : "The review email outcome could not be recorded. Check the request and owner's inbox before resending; previous review links are unchanged." });
  try {
    const saved = await supabase.from("service_submissions").update({ email_delivery_status: outcome === "accepted" ? "sent" : "failed", email_delivery_message: message, updated_at: new Date().toISOString() })
      .eq("id", fresh.id).eq("status", "submitted").eq("owner_user_id", fresh.owner_user_id).eq("provider_revision", fresh.provider_revision).eq("expires_at", fresh.expires_at).select("id").maybeSingle();
    if (saved.error || !saved.data) return unrecorded();
    const activity = await addActivity(supabase, fresh.id, fresh.provider_user_id, outcome === "accepted" ? "email_sent" : "email_failed", message,
      { outcome, ...(providerMessageId ? { providerMessageId } : {}) });
    if (activity.error) return unrecorded();
  } catch { return unrecorded(); }
  return { ok: outcome === "accepted", outcome, recorded: true, retryable, message };
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured.", submissions: [] }, 503);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required.", submissions: [] }, 401);
  const url = new URL(request.url);
  const id = cleanServiceText(url.searchParams.get("id"), 80);
  const scope = cleanServiceText(url.searchParams.get("scope"), 20);

  try {
    let query = supabase.from("service_submissions").select("*").order("updated_at", { ascending: false }).limit(100);
    if (id) query = query.eq("id", id);
    else if (scope === "owner") query = query.eq("owner_user_id", auth.user.id);
    else query = query.eq("provider_user_id", auth.user.id);
    const result = await query;
    if (result.error) return errorResponse(result.error.message);
    const rows = (result.data || []) as ServiceSubmissionRow[];
    const admin = await isAdmin(request);
    if (id && rows[0] && !admin && rows[0].owner_user_id !== auth.user.id && rows[0].provider_user_id !== auth.user.id) return json({ ok: false, message: "You cannot review this service submission." }, 403);
    const submissions = await serializeSubmissions(supabase, rows, Boolean(id));
    return json({ ok: true, submissions, submission: id ? submissions[0] || null : undefined });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load service submissions.");
  }
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const write = await assertAccountCanWrite(supabase, auth.user);
  if (!write.ok) return json({ ok: false, message: write.message }, write.status);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const qrCode = cleanServiceText(body?.qrCode, 80).toUpperCase();
  if (!qrCode) return json({ ok: false, message: "QRguitar ID is required." }, 400);

  try {
    const guitar = await loadServiceGuitar(supabase, qrCode);
    if (!guitar) return json({ ok: false, message: "QRguitar Profile was not found." }, 404);
    if (!guitar.owner_id) return json({ ok: false, message: "This Profile needs an owner before service work can be submitted." }, 409);
    if (guitar.owner_id === auth.user.id) return json({ ok: false, message: "Owners add their own service history from Edit Profile. A separate provider account is required for provider-submitted provenance." }, 409);
    const { canProviderAccessGuitar } = await import("../../../lib/service-workflow");
    if (!await canProviderAccessGuitar(supabase, guitar, auth.user)) return json({ ok: false, message: "This private Profile has not granted your provider account access." }, 403);
    const rateWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await supabase.from("service_submissions").select("*", { count: "exact", head: true }).eq("provider_user_id", auth.user.id).gte("created_at", rateWindow);
    if ((recent.count || 0) >= 20) return json({ ok: false, message: "Submission limit reached. Try again later." }, 429);

    let provider = await loadProviderProfile(supabase, auth.user.id);
    if (!provider) {
      const fallbackName = cleanServiceText(auth.user.user_metadata?.display_name, 160) || "Service provider";
      const createdProvider = await supabase.from("service_provider_profiles").insert({ user_id: auth.user.id, public_display_name: fallbackName, business_name: "", verification_status: "unverified" }).select("*").single<ServiceProviderProfileRow>();
      if (createdProvider.error) return errorResponse(createdProvider.error.message);
      provider = createdProvider.data;
    }

    const workOrder = cleanServiceText(body?.workOrderReference, 120);
    if (workOrder) {
      const duplicate = await supabase.from("service_submissions").select("id,status").eq("guitar_id", guitar.id).eq("provider_user_id", auth.user.id).ilike("work_order_reference", workOrder).in("status", [...ACTIVE_SERVICE_STATUSES]).maybeSingle();
      if (duplicate.data) return json({ ok: false, message: "An active submission already uses this work-order reference for this Profile.", existingSubmissionId: duplicate.data.id }, 409);
    }

    const now = new Date().toISOString();
    const created = await supabase.from("service_submissions").insert({
      guitar_id: guitar.id,
      provider_user_id: auth.user.id,
      owner_user_id: guitar.owner_id,
      status: "draft",
      service_date: cleanServiceDate(body?.serviceDate),
      service_type: cleanServiceCategory(body?.serviceType),
      title: cleanServiceText(body?.title, 180),
      work_performed: cleanServiceText(body?.workPerformed, 5000),
      parts_installed: cleanServiceText(body?.partsInstalled, 3000) || null,
      setup_measurements: cleanServiceText(body?.setupMeasurements, 3000) || null,
      work_order_reference: workOrder || null,
      recommended_public_description: cleanServiceText(body?.recommendedPublicDescription, 4000) || null,
      private_provider_note: cleanServiceText(body?.privateProviderNote, 4000) || null,
      owner_visibility_choice: cleanServiceVisibility(body?.requestedVisibility),
      created_at: now,
      updated_at: now
    }).select("*").single<ServiceSubmissionRow>();
    if (created.error) return errorResponse(created.error.message, /duplicate key/i.test(created.error.message) ? 409 : 500);
    await addActivity(supabase, created.data.id, auth.user.id, "draft_created");
    await logAdminAuditEvent(supabase, { actorUserId: auth.user.id, actorEmail: auth.user.email, action: "service_submission.draft_created", targetType: "service_submission", targetId: created.data.id, targetUserId: guitar.owner_id, metadata: { guitarId: guitar.id } });
    const serialized = await serializeSubmissions(supabase, [created.data]);
    return json({ ok: true, submission: serialized[0], message: "Private service draft created." }, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not create service submission.");
  }
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const write = await assertAccountCanWrite(supabase, auth.user);
  if (!write.ok) return json({ ok: false, message: write.message }, write.status);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = cleanServiceText(body?.id, 80);
  const action = cleanServiceText(body?.action, 40);
  if (!id || !action) return json({ ok: false, message: "Submission and action are required." }, 400);

  try {
    const submission = await loadSubmission(supabase, id);
    if (!submission) return json({ ok: false, message: "Service submission was not found." }, 404);
    const guitar = await loadGuitarById(supabase, submission.guitar_id);
    if (!guitar) return json({ ok: false, message: "QRguitar Profile was not found." }, 404);
    const adminContext = await getAdminContext(request);
    const admin = adminContext.ok && adminContext.user?.id === auth.user.id;
    const provider = submission.provider_user_id === auth.user.id;
    const owner = submission.owner_user_id === auth.user.id && guitar.owner_id === auth.user.id;
    const now = new Date().toISOString();

    if (action === "save_draft" || action === "submit" || action === "revise") {
      if (!provider) return json({ ok: false, message: "Only the submitting provider can edit this request." }, 403);
      if (action !== "save_draft" && (guitar.owner_id !== submission.owner_user_id || guitar.admin_archived_at || guitar.owner_removed_at)) {
        return json({ ok: false, message: "Profile ownership or availability changed. Review the service request before submitting it." }, 409);
      }
      if (action === "save_draft" && !["draft", "changes_requested"].includes(submission.status)) return json({ ok: false, message: "This request can no longer be edited." }, 409);
      if (action === "revise" && submission.status !== "changes_requested") return json({ ok: false, message: "This request is not awaiting a revision." }, 409);
      if (action === "submit" && !["draft", "changes_requested"].includes(submission.status)) return json({ ok: false, message: "Only a draft or requested revision can be submitted." }, 409);
      const patch = {
        service_date: cleanServiceDate(body?.serviceDate ?? submission.service_date),
        service_type: cleanServiceCategory(body?.serviceType ?? submission.service_type),
        title: cleanServiceText(body?.title ?? submission.title, 180),
        work_performed: cleanServiceText(body?.workPerformed ?? submission.work_performed, 5000),
        parts_installed: cleanServiceText(body?.partsInstalled ?? submission.parts_installed, 3000) || null,
        setup_measurements: cleanServiceText(body?.setupMeasurements ?? submission.setup_measurements, 3000) || null,
        work_order_reference: cleanServiceText(body?.workOrderReference ?? submission.work_order_reference, 120) || null,
        recommended_public_description: cleanServiceText(body?.recommendedPublicDescription ?? submission.recommended_public_description, 4000) || null,
        private_provider_note: cleanServiceText(body?.privateProviderNote ?? submission.private_provider_note, 4000) || null,
        owner_visibility_choice: cleanServiceVisibility(body?.requestedVisibility ?? submission.owner_visibility_choice),
        ...(action === "submit" || action === "revise" ? { status: "submitted", submitted_at: now, expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), provider_revision: action === "revise" ? submission.provider_revision + 1 : submission.provider_revision } : {}),
        updated_at: now
      };
      if ((action === "submit" || action === "revise") && (!patch.service_date || !patch.title || !patch.work_performed)) return json({ ok: false, message: "Service date, title, and work performed are required before owner review." }, 400);
      const updated = await supabase.from("service_submissions").update(patch).eq("id", id).eq("provider_user_id", auth.user.id).eq("status", submission.status).select("*").maybeSingle<ServiceSubmissionRow>();
      if (updated.error) return errorResponse(updated.error.message, /duplicate key/i.test(updated.error.message) ? 409 : 500);
      if (!updated.data) return json({ ok: false, message: "This service request changed while you were editing it. Refresh and try again." }, 409);
      const revisionMetadata = action === "revise" ? {
        priorVersion: {
          serviceDate: submission.service_date,
          serviceType: submission.service_type,
          title: submission.title,
          workPerformed: submission.work_performed,
          partsInstalled: submission.parts_installed,
          setupMeasurements: submission.setup_measurements,
          workOrderReference: submission.work_order_reference,
          recommendedPublicDescription: submission.recommended_public_description,
          privateProviderNote: submission.private_provider_note,
          requestedVisibility: submission.owner_visibility_choice,
          providerRevision: submission.provider_revision
        },
        revisedToVersion: updated.data.provider_revision
      } : {};
      const activity = await addActivity(supabase, id, auth.user.id, action === "save_draft" ? "draft_saved" : action === "revise" ? "revised" : "submitted", "", revisionMetadata).catch(() => ({ error: true }));
      let message = action === "save_draft" ? "Private service draft saved." : "Service work submitted for owner approval.";
      let emailOutcome: string | undefined;
      let emailRetryable: boolean | undefined;
      if (action !== "save_draft" && updated.data.email_dispatch_mode === "outbox") {
        // The committed row receipt comes from the same transaction as capture and notification.
        emailOutcome = "queued";
        emailRetryable = false;
        message += " The owner notification is saved and the review email is queued.";
      } else if (action !== "save_draft") {
        const providerProfile = await loadProviderProfile(supabase, auth.user.id).catch(() => null);
        const notification = await addNotification(supabase, id, submission.owner_user_id, "owner_review", `${providerProfile?.public_display_name || "A service provider"} submitted service work for ${serviceTitle(guitar)}.`).catch(() => ({ error: true }));
        const email = await sendOwnerReview(supabase, updated.data, guitar, providerProfile);
        emailOutcome = email.outcome;
        emailRetryable = email.retryable;
        message += ` ${email.message}`;
        if (notification.error) message += " The in-app owner notification could not be confirmed.";
      }
      if (activity.error) message += " The service activity entry could not be confirmed.";
      const fresh = await loadSubmission(supabase, id);
      return json({ ok: true, committed: true, submission: (await serializeSubmissions(supabase, fresh ? [fresh] : []))[0], emailOutcome, emailRetryable, message });
    }

    if (action === "request_changes" || action === "decline") {
      if (!owner) return json({ ok: false, message: "Only the current Profile owner can review this request." }, 403);
      if (submission.status !== "submitted") return json({ ok: false, message: "Only a submitted request can be reviewed." }, 409);
      const note = cleanServiceText(body?.note, 2000);
      if (action === "request_changes" && !note) return json({ ok: false, message: "Explain what the provider should change." }, 400);
      const status = action === "request_changes" ? "changes_requested" : "declined";
      const updated = await supabase.from("service_submissions").update({ status, owner_review_note: note || null, reviewed_at: now, ...(status === "declined" ? { declined_at: now } : {}), updated_at: now }).eq("id", id).eq("owner_user_id", auth.user.id).eq("status", "submitted").select("*").single<ServiceSubmissionRow>();
      if (updated.error) return errorResponse(updated.error.message, 409);
      await addActivity(supabase, id, auth.user.id, status, note);
      await addNotification(supabase, id, submission.provider_user_id, status, status === "declined" ? "The Profile owner declined this service submission." : "The Profile owner requested changes to this service submission.");
      return json({ ok: true, submission: (await serializeSubmissions(supabase, [updated.data], true))[0], message: status === "declined" ? "Service submission declined. Nothing was published." : "Changes requested from the provider." });
    }

    if (action === "cancel") {
      if (!provider && !admin) return json({ ok: false, message: "Only the submitting provider or QRguitar admin can cancel this request." }, 403);
      if (["approved", "declined", "expired"].includes(submission.status)) return json({ ok: false, message: "This request is already closed." }, 409);
      // Status, counterparty notification and activity are committed together. No direct-update fallback.
      const unconfirmed = () => json({ ok: false, code: "unconfirmed", message: "Cancellation could not be confirmed. Refresh the service request before trying again." }, 503);
      try {
        const rpc = await supabase.rpc("cancel_service_submission", {
          p_submission_id: id, p_actor_id: auth.user.id,
          p_env_admin: admin && adminContext.accessSource === "env",
          p_note: cleanServiceText(body?.note, 2000)
        }).abortSignal(AbortSignal.timeout(10000));
        if (rpc.error) return unconfirmed();
        const receipt = rpc.data;
        const saved = receipt?.submission as ServiceSubmissionRow | undefined;
        if (receipt?.ok !== true || typeof receipt.alreadyCancelled !== "boolean" || !saved || saved.id !== id || saved.status !== "cancelled"
          || saved.guitar_id !== submission.guitar_id || saved.provider_user_id !== submission.provider_user_id || saved.owner_user_id !== submission.owner_user_id) return unconfirmed();
        const serialized = (await serializeSubmissions(supabase, [saved]))[0];
        if (!serialized) return unconfirmed();
        return json({ ok: true, committed: true, submission: serialized, alreadyCancelled: receipt.alreadyCancelled,
          message: receipt.alreadyCancelled ? "This service submission was already cancelled. Nothing was published." : "Service submission cancelled. Nothing was published." });
      } catch { return unconfirmed(); }
    }

    if (action === "approve") {
      if (!owner) return json({ ok: false, message: "Only the current Profile owner can approve this request." }, 403);
      const visibility = cleanServiceVisibility(body?.requestedVisibility ?? submission.owner_visibility_choice);
      const visibilityUpdate = await supabase.from("service_submissions").update({ owner_visibility_choice: visibility, reviewed_at: now, updated_at: now }).eq("id", id).eq("owner_user_id", auth.user.id).eq("status", "submitted");
      if (visibilityUpdate.error) return errorResponse(visibilityUpdate.error.message);
      const reviewToken = cleanServiceText(body?.reviewToken, 300);
      const rpc = await supabase.rpc("approve_service_submission", { p_submission_id: id, p_owner_user_id: auth.user.id, p_token_hash: reviewToken ? hashReviewToken(reviewToken) : null });
      if (rpc.error) return errorResponse(rpc.error.message, /expired|invalid|only|cannot/i.test(rpc.error.message) ? 409 : 500);
      const result = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      await logAdminAuditEvent(supabase, { actorUserId: auth.user.id, actorEmail: auth.user.email, action: "service_submission.approved", targetType: "service_submission", targetId: id, targetUserId: submission.provider_user_id, metadata: { serviceEventId: result?.service_event_id, alreadyApproved: result?.already_approved === true } });
      revalidatePath("/"); revalidatePath("/catalog"); revalidatePath(`/i/${guitar.qr_code}`); revalidatePath(`/api/instruments?code=${guitar.qr_code}`);
      const fresh = await loadSubmission(supabase, id);
      return json({ ok: true, submission: (await serializeSubmissions(supabase, fresh ? [fresh] : [], true))[0], alreadyApproved: result?.already_approved === true, message: result?.already_approved ? "This service work was already approved; no duplicate was created." : "Service work approved and added to the Profile history." });
    }

    if (action === "retry_email") {
      if (!provider && !admin) return json({ ok: false, message: "Only the provider or QRguitar admin can retry this email." }, 403);
      if (submission.status !== "submitted") return json({ ok: false, message: "Only a submitted request can send an owner review email." }, 409);
      if (submission.email_dispatch_mode === "outbox") {
        const status = await supabase.rpc("service_email_submission_status", { p_submission_id: id });
        if (status.error || !status.data) return json({ ok: false, message: "Email delivery status is unavailable. No new email was sent." }, 503);
        if (status.data.canRetry !== true) return json({ ok: false, message: "This email cannot be retried automatically. An unknown outcome requires administrator review." }, 409);
        const retried = await supabase.rpc("retry_service_email_intent", { p_intent_id: status.data.id, p_actor_id: auth.user.id, p_admin: admin });
        if (retried.error || retried.data !== true) return json({ ok: false, message: "The delivery changed or is no longer eligible. No new email was sent." }, 409);
        return json({ ok: true, emailOutcome: "queued", retryable: false, message: "The review email is queued for retry." });
      }
      const result = await sendOwnerReview(supabase, submission, guitar, await loadProviderProfile(supabase, submission.provider_user_id));
      return json({ ok: result.ok, emailOutcome: result.outcome, retryable: result.retryable, message: result.message }, result.ok ? 200 : 502);
    }

    if (action === "mark_read") {
      await supabase.from("service_submission_notifications").update({ read_at: now }).eq("submission_id", id).eq("recipient_user_id", auth.user.id).is("read_at", null);
      return json({ ok: true, message: "Notification marked read." });
    }

    return json({ ok: false, message: "Unsupported service-submission action." }, 400);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not update service submission.");
  }
}
