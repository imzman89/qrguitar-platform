import { NextResponse } from "next/server";
import { getAdminContext, logAdminAuditEvent } from "../../../../lib/admin-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { cleanServiceText, mapProviderProfile, serviceMigrationMessage, serviceMigrationMissing, type ServiceProviderProfileRow, type ServiceSubmissionRow } from "../../../../lib/service-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function GET(request: Request) {
  const context = await getAdminContext(request);
  if (!context.ok) return json({ ok: false, message: context.message }, context.status);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const url = new URL(request.url);
  const search = cleanServiceText(url.searchParams.get("search"), 120).toLowerCase();
  const status = cleanServiceText(url.searchParams.get("status"), 40);
  let query = supabase.from("service_submissions").select("*").order("updated_at", { ascending: false }).limit(250);
  if (status && status !== "all") query = query.eq("status", status);
  const [submissions, providers, evidence, activities] = await Promise.all([
    query,
    supabase.from("service_provider_profiles").select("*").order("updated_at", { ascending: false }).limit(250),
    supabase.from("service_submission_evidence").select("id,submission_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path,created_at"),
    supabase.from("service_submission_activity").select("id,submission_id,action,note,metadata,created_at").order("created_at", { ascending: false }).limit(1000)
  ]);
  const firstError = submissions.error || providers.error || evidence.error || activities.error;
  if (firstError) return json({ ok: false, message: serviceMigrationMissing(firstError.message) ? serviceMigrationMessage() : firstError.message }, serviceMigrationMissing(firstError.message) ? 503 : 500);
  const guitarIds = [...new Set(((submissions.data || []) as ServiceSubmissionRow[]).map((row) => row.guitar_id))];
  const guitars = guitarIds.length ? await supabase.from("guitars").select("id,qr_code,name,brand,model,owner_id").in("id", guitarIds) : { data: [], error: null };
  const providerMap = new Map(((providers.data || []) as ServiceProviderProfileRow[]).map((row) => [row.user_id, row]));
  const guitarMap = new Map((guitars.data || []).map((row) => [row.id, row]));
  const evidenceRows = await Promise.all((evidence.data || []).map(async (row) => {
    const signed = row.storage_path ? await supabase.storage.from("service-evidence").createSignedUrl(row.storage_path, 300) : { data: null };
    return { id: row.id, submission_id: row.submission_id, evidence_type: row.evidence_type, file_name: row.file_name, mime_type: row.mime_type, file_size_bytes: row.file_size_bytes, created_at: row.created_at, previewUrl: signed.data?.signedUrl || "" };
  }));
  const evidenceMap = new Map<string, unknown[]>();
  for (const row of evidenceRows) evidenceMap.set(row.submission_id, [...(evidenceMap.get(row.submission_id) || []), row]);
  const activityMap = new Map<string, unknown[]>();
  for (const row of activities.data || []) activityMap.set(row.submission_id, [...(activityMap.get(row.submission_id) || []), row]);
  const serialized = ((submissions.data || []) as ServiceSubmissionRow[]).map((row) => {
    const guitar = guitarMap.get(row.guitar_id);
    const provider = providerMap.get(row.provider_user_id);
    return {
      id: row.id,
      status: row.status,
      qrCode: guitar?.qr_code || "",
      profileTitle: guitar?.name || [guitar?.brand, guitar?.model].filter(Boolean).join(" "),
      provider: mapProviderProfile(provider || null, true),
      ownerUserId: row.owner_user_id,
      providerUserId: row.provider_user_id,
      serviceDate: row.service_date || "",
      serviceType: row.service_type,
      title: row.title,
      workPerformed: row.work_performed,
      requestedVisibility: row.owner_visibility_choice,
      evidence: evidenceMap.get(row.id) || [],
      activity: activityMap.get(row.id) || [],
      emailDeliveryStatus: row.email_delivery_status,
      emailDeliveryMessage: row.email_delivery_message || "",
      resultingServiceEventId: row.resulting_service_event_id || "",
      submittedAt: row.submitted_at || "",
      updatedAt: row.updated_at
    };
  }).filter((row) => !search || JSON.stringify(row).toLowerCase().includes(search));
  return json({ ok: true, providers: ((providers.data || []) as ServiceProviderProfileRow[]).map((row) => mapProviderProfile(row, true)), submissions: serialized });
}

export async function PATCH(request: Request) {
  const context = await getAdminContext(request);
  if (!context.ok || !context.user) return json({ ok: false, message: context.message }, context.status);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = cleanServiceText(body?.action, 50);
  const providerUserId = cleanServiceText(body?.providerUserId, 80);
  const submissionId = cleanServiceText(body?.submissionId, 80);
  const note = cleanServiceText(body?.note, 3000);
  const now = new Date().toISOString();

  if (action === "verify_provider" || action === "revoke_provider") {
    if (!providerUserId) return json({ ok: false, message: "Provider is required." }, 400);
    const verified = action === "verify_provider";
    const updated = await supabase.from("service_provider_profiles").update({ verification_status: verified ? "verified" : "unverified", verified_at: verified ? now : null, verified_by: verified ? context.user.id : null, internal_review_note: note || null, updated_at: now }).eq("user_id", providerUserId).select("*").single<ServiceProviderProfileRow>();
    if (updated.error) return json({ ok: false, message: serviceMigrationMissing(updated.error.message) ? serviceMigrationMessage() : updated.error.message }, serviceMigrationMissing(updated.error.message) ? 503 : 500);
    await logAdminAuditEvent(supabase, { actorUserId: context.user.id, actorEmail: context.email, action: verified ? "service_provider.verified" : "service_provider.verification_revoked", targetType: "service_provider", targetUserId: providerUserId, reason: note });
    return json({ ok: true, provider: mapProviderProfile(updated.data, true), message: verified ? "Provider account verified." : "Provider verification revoked." });
  }

  if (action === "cancel_submission" || action === "expire_submission") {
    if (!submissionId) return json({ ok: false, message: "Submission is required." }, 400);
    const status = action === "cancel_submission" ? "cancelled" : "expired";
    const updated = await supabase.from("service_submissions").update({ status, cancelled_at: status === "cancelled" ? now : null, updated_at: now }).eq("id", submissionId).in("status", ["draft", "submitted", "changes_requested"]).select("id,provider_user_id,owner_user_id,status").maybeSingle();
    if (updated.error) return json({ ok: false, message: updated.error.message }, 500);
    if (!updated.data) return json({ ok: false, message: "Only an open submission can be cancelled or expired." }, 409);
    await supabase.from("service_submission_activity").insert({ submission_id: submissionId, actor_user_id: context.user.id, action: status, note: note || null });
    await logAdminAuditEvent(supabase, { actorUserId: context.user.id, actorEmail: context.email, action: `service_submission.${status}`, targetType: "service_submission", targetId: submissionId, reason: note });
    return json({ ok: true, message: `Service submission ${status}. Nothing was published.` });
  }

  if (action === "mark_evidence_reviewed" || action === "unmark_evidence_reviewed") {
    if (!submissionId) return json({ ok: false, message: "Submission is required." }, 400);
    const submission = await supabase.from("service_submissions").select("id,status,resulting_service_event_id").eq("id", submissionId).maybeSingle<{ id: string; status: string; resulting_service_event_id: string | null }>();
    if (!submission.data || submission.data.status !== "approved" || !submission.data.resulting_service_event_id) return json({ ok: false, message: "Only evidence for approved canonical service work can be marked reviewed." }, 409);
    const reviewed = action === "mark_evidence_reviewed";
    const updated = await supabase.from("guitar_timeline_events").update({ evidence_reviewed_at: reviewed ? now : null, evidence_reviewed_by: reviewed ? context.user.id : null, updated_at: now }).eq("id", submission.data.resulting_service_event_id);
    if (updated.error) return json({ ok: false, message: updated.error.message }, 500);
    await logAdminAuditEvent(supabase, { actorUserId: context.user.id, actorEmail: context.email, action: reviewed ? "service_evidence.reviewed" : "service_evidence.review_removed", targetType: "service_submission", targetId: submissionId, reason: note });
    return json({ ok: true, message: reviewed ? "Service evidence marked QRguitar-reviewed." : "QRguitar evidence review mark removed." });
  }

  return json({ ok: false, message: "Unsupported admin service action." }, 400);
}
