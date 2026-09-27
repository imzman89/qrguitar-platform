import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAccountCanWrite, getAdminContext } from "../../../lib/admin-auth";
import { normalizeSerialBuildId } from "../../../lib/instrument-profile-contract";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const EVIDENCE_BUCKET = "instrument-documents";
const MAX_EVIDENCE_FILES = 3;
const MAX_EVIDENCE_BYTES = 3_000_000;
const HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };
class ClaimStateConflict extends Error {}
const ALLOWED_EVIDENCE_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

type ClaimRow = {
  id: string;
  guitar_id: string;
  claim_type: string;
  status: string;
  current_owner_id: string | null;
  claimant_user_id: string | null;
  acquisition_details: string | null;
  ownership_declaration: string | null;
  owner_response_note: string | null;
  admin_review_note: string | null;
  expires_at: string | null;
  decided_at: string | null;
  decided_by?: string | null;
  action_email_completed?: boolean;
  completion_expected_evidence?: number | null;
  created_at: string;
  updated_at: string;
};

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  admin_archived_at?: string | null;
  owner_removed_at?: string | null;
};

type EvidenceInput = { name?: string; dataUrl?: string; type?: string; note?: string };
type ClaimEvidenceRow = {
  id: string;
  claim_id: string;
  evidence_type: string;
  file_name: string;
  storage_path: string;
  private_note: string | null;
  created_at: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseEvidence(input: EvidenceInput) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(input.dataUrl || ""));
  if (!match) throw new Error("Evidence must be a PDF, JPG, PNG, or WEBP file.");
  const extension = ALLOWED_EVIDENCE_TYPES.get(match[1]);
  if (!extension) throw new Error("Evidence must be a PDF, JPG, PNG, or WEBP file.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error("Evidence must total 3 MB or less.");
  return { mimeType: match[1], extension, bytes };
}

function validateEvidence(evidence: EvidenceInput[]) {
  try {
    const bytes = evidence.reduce((total, file) => total + parseEvidence(file).bytes.length, 0);
    return bytes > MAX_EVIDENCE_BYTES ? "Evidence must total 3 MB or less. Choose smaller files and try again." : "";
  } catch (error) { return error instanceof Error ? error.message : "Could not read the evidence."; }
}

async function findGuitarBySerial(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, normalized: string) {
  const alias = await supabase
    .from("guitar_serial_aliases")
    .select("guitar_id")
    .eq("serial_normalized", normalized)
    .maybeSingle<{ guitar_id: string }>();

  if (!alias.error && alias.data?.guitar_id) return alias.data.guitar_id;
  if (alias.error && !/does not exist|schema cache/i.test(alias.error.message || "")) throw new Error("Serial lookup is temporarily unavailable.");

  const fallback = await supabase.from("guitars").select("id,serial_number").not("serial_number", "is", null).limit(5000);
  if (fallback.error) throw new Error("Serial lookup is temporarily unavailable.");
  return (fallback.data || []).find((row) => normalizeSerialBuildId(String(row.serial_number || "")) === normalized)?.id || "";
}

async function findGuitarByIdentifier(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, identifier: string) {
  const normalizedCode = identifier.trim().toUpperCase();
  if (normalizedCode.startsWith("QRG-")) {
    const result = await supabase.from("guitars").select("id").eq("qr_code", normalizedCode).maybeSingle<{ id: string }>();
    if (result.error) throw new Error("Profile lookup is temporarily unavailable.");
    return result.data?.id || "";
  }
  return findGuitarBySerial(supabase, normalizeSerialBuildId(identifier));
}

async function loadGuitar(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, guitarId: string) {
  return supabase
    .from("guitars")
    .select("id,owner_id,qr_code,name,brand,model,admin_archived_at,owner_removed_at")
    .eq("id", guitarId)
    .maybeSingle<GuitarRow>();
}

function safeClaim(
  claim: ClaimRow,
  guitar?: GuitarRow | null,
  evidenceCount = 0,
  evidence: Array<{ id: string; type: string; fileName: string; note: string; url: string; createdAt: string }> = [],
  includeAdminNote = false,
  viewerId = ""
) {
  const privateDetails = includeAdminNote || claim.claimant_user_id === viewerId
    || (claim.current_owner_id === viewerId && guitar?.owner_id === viewerId);
  return {
    id: claim.id,
    claimType: claim.claim_type,
    status: claim.status,
    canWithdraw: Boolean(viewerId) && claim.claimant_user_id === viewerId && ["awaiting_claimant", "awaiting_owner", "admin_review"].includes(claim.status),
    ...(typeof claim.action_email_completed === "boolean" ? { submissionComplete: claim.action_email_completed } : {}),
    canCompleteSubmission: Boolean(viewerId) && claim.claimant_user_id === viewerId && claim.action_email_completed === false
      && Number.isInteger(claim.completion_expected_evidence) && Number(claim.completion_expected_evidence) >= 1
      && Number(claim.completion_expected_evidence) <= MAX_EVIDENCE_FILES && evidenceCount === claim.completion_expected_evidence
      && ["awaiting_owner", "admin_review"].includes(claim.status) && Boolean(guitar)
      && guitar?.owner_id === claim.current_owner_id && !guitar?.admin_archived_at && !guitar?.owner_removed_at
      && (!claim.expires_at || Date.parse(claim.expires_at) > Date.now()),
    canReview: !(claim.completion_expected_evidence && claim.action_email_completed !== true) && Boolean(viewerId) && claim.current_owner_id === viewerId && guitar?.owner_id === viewerId
      && claim.status === "awaiting_owner" && (!claim.expires_at || Date.parse(claim.expires_at) > Date.now())
      && !guitar.admin_archived_at && !guitar.owner_removed_at,
    canSubmitEvidence: Boolean(viewerId) && claim.claimant_user_id === viewerId && claim.status === "awaiting_claimant"
      && (!claim.expires_at || Date.parse(claim.expires_at) > Date.now()) && Boolean(guitar)
      && guitar?.owner_id === claim.current_owner_id && !guitar?.admin_archived_at && !guitar?.owner_removed_at,
    guitarId: claim.guitar_id,
    qrCode: guitar?.qr_code || "",
    profileTitle: guitar?.name || [guitar?.brand, guitar?.model].filter(Boolean).join(" ") || "QRguitar Profile",
    acquisitionDetails: privateDetails ? claim.acquisition_details || "" : "",
    ownershipDeclaration: privateDetails ? claim.ownership_declaration || "" : "",
    ownerResponseNote: privateDetails ? claim.owner_response_note || "" : "",
    ...(includeAdminNote ? { adminReviewNote: claim.admin_review_note || "" } : {}),
    evidenceCount,
    ...(evidence.length ? { evidence } : {}),
    expiresAt: claim.expires_at,
    decidedAt: claim.decided_at,
    createdAt: claim.created_at,
    updatedAt: claim.updated_at
  };
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const auth = await getAuthenticatedUser(request);
  if (!supabase || !auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);

  const admin = await getAdminContext(request);
  let query = supabase.from("ownership_claims").select("*").order("created_at", { ascending: false });
  if (!admin.ok) query = query.or(`claimant_user_id.eq.${auth.user.id},current_owner_id.eq.${auth.user.id}`);
  const claimsResult = await query;
  if (claimsResult.error) return json({ ok: false, message: "Ownership requests require the core claims migration." }, 503);

  const claims = (claimsResult.data || []) as ClaimRow[];
  const guitarIds = [...new Set(claims.map((claim) => claim.guitar_id))];
  const claimIds = claims.map((claim) => claim.id);
  const [guitarsResult, evidenceResult] = await Promise.all([
    guitarIds.length ? supabase.from("guitars").select("id,owner_id,qr_code,name,brand,model,admin_archived_at,owner_removed_at").in("id", guitarIds) : Promise.resolve({ data: [], error: null }),
    claimIds.length ? supabase.from("ownership_claim_evidence").select("id,claim_id,evidence_type,file_name,storage_path,private_note,created_at").in("claim_id", claimIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (guitarsResult.error || evidenceResult.error) return json({ ok: false, message: "Ownership request details are temporarily unavailable. Please retry." }, 503);
  const guitars = new Map(((guitarsResult.data || []) as GuitarRow[]).map((guitar) => [guitar.id, guitar]));
  const evidenceCounts = new Map<string, number>();
  const evidenceByClaim = new Map<string, ClaimEvidenceRow[]>();
  for (const row of (evidenceResult.data || []) as ClaimEvidenceRow[]) {
    evidenceCounts.set(row.claim_id, (evidenceCounts.get(row.claim_id) || 0) + 1);
    evidenceByClaim.set(row.claim_id, [...(evidenceByClaim.get(row.claim_id) || []), row]);
  }

  const safeEvidenceByClaim = new Map<string, Array<{ id: string; type: string; fileName: string; note: string; url: string; createdAt: string }>>();
  try { await Promise.all(claims.map(async (claim) => {
    if (!admin.ok && (claim.current_owner_id !== auth.user?.id || guitars.get(claim.guitar_id)?.owner_id !== auth.user?.id)) return;
    const safeEvidence = await Promise.all((evidenceByClaim.get(claim.id) || []).map(async (row) => {
      const signed = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, 5 * 60);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Private evidence links are temporarily unavailable.");
      return {
        id: row.id,
        type: row.evidence_type,
        fileName: row.file_name,
        note: row.private_note || "",
        url: signed.data.signedUrl,
        createdAt: row.created_at
      };
    }));
    safeEvidenceByClaim.set(claim.id, safeEvidence.filter(Boolean) as Array<{ id: string; type: string; fileName: string; note: string; url: string; createdAt: string }>);
  })); } catch {
    return json({ ok: false, message: "Private evidence links are temporarily unavailable. Please retry." }, 503);
  }

  return json({
    ok: true,
    claims: claims.map((claim) => safeClaim(
      claim,
      guitars.get(claim.guitar_id),
      evidenceCounts.get(claim.id) || 0,
      safeEvidenceByClaim.get(claim.id) || [],
      admin.ok || claim.claimant_user_id === auth.user?.id,
      auth.user?.id || ""
    ))
  });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const auth = await getAuthenticatedUser(request);
  if (!supabase || !auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, message: writeAccess.message }, writeAccess.status);

  const body = await request.json().catch(() => ({})) as {
    identifier?: string;
    serial?: string;
    claimType?: "owner_transfer" | "store_purchase" | "legacy_review";
    challengeCode?: string;
    acquisitionDetails?: string;
    ownershipDeclaration?: string;
    evidence?: EvidenceInput[];
  };
  const identifier = cleanText(body.identifier || body.serial, 120);
  const normalized = normalizeSerialBuildId(identifier);
  const claimType = ["owner_transfer", "store_purchase", "legacy_review"].includes(String(body.claimType)) ? body.claimType! : "legacy_review";
  const challengeCode = cleanText(body.challengeCode, 12).toUpperCase();
  const acquisitionDetails = cleanText(body.acquisitionDetails, 3000);
  const ownershipDeclaration = cleanText(body.ownershipDeclaration, 1500);
  const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, MAX_EVIDENCE_FILES) : [];
  if (normalized.length < 4) return json({ ok: false, message: "Enter the QRguitar ID or exact Serial Number." }, 400);
  if (acquisitionDetails.length < 20) return json({ ok: false, message: "Explain when and how you acquired the instrument." }, 400);
  if (ownershipDeclaration.length < 20) return json({ ok: false, message: "Confirm your ownership declaration in your own words." }, 400);
  if (!evidence.length) return json({ ok: false, message: "Add at least one current photo or ownership document." }, 400);
  if (claimType === "legacy_review" && (challengeCode.length !== 6 || !evidence.some((item) => item.type === "possession_challenge"))) {
    return json({ ok: false, message: "Add a current possession photo showing the six-character challenge code." }, 400);
  }

  try {
    const guitarId = await findGuitarByIdentifier(supabase, identifier);
    if (!guitarId) return json({ ok: false, message: "No QRguitar Profile matches that ID or exact Serial Number." }, 404);
    const guitarResult = await loadGuitar(supabase, guitarId);
    const guitar = guitarResult.data;
    if (guitarResult.error) return json({ ok: false, message: "Profile lookup is temporarily unavailable." }, 503);
    if (!guitar || guitar.admin_archived_at || guitar.owner_removed_at) return json({ ok: false, message: "The matching Profile is unavailable." }, 404);
    if (guitar.owner_id === auth.user.id) return json({ ok: false, message: "This QRguitar Profile is already in your account." }, 409);

    const existing = await supabase
      .from("ownership_claims")
      .select("id,status")
      .eq("guitar_id", guitar.id)
      .eq("claimant_user_id", auth.user.id)
      .in("status", ["awaiting_claimant", "awaiting_owner", "admin_review"])
      .maybeSingle<{ id: string; status: string }>();
    if (existing.error) return json({ ok: false, message: "Could not check existing ownership requests. Please retry." }, 503);
    if (existing.data) return json({ ok: false, message: "You already have an active ownership request for this Profile." }, 409);

    const evidenceError = validateEvidence(evidence);
    if (evidenceError) return json({ ok: false, message: evidenceError }, 400);
    const claimInsert = await supabase.from("ownership_claims").insert({
      guitar_id: guitar.id,
      completion_expected_evidence: evidence.length,
      claim_type: claimType,
      status: guitar.owner_id ? "awaiting_owner" : "admin_review",
      current_owner_id: guitar.owner_id,
      claimant_user_id: auth.user.id,
      acquisition_details: acquisitionDetails,
      ownership_declaration: claimType === "legacy_review" ? `${ownershipDeclaration}\n\nPossession challenge: ${challengeCode}` : ownershipDeclaration
    }).select("*").single<ClaimRow>();
    if (claimInsert.error || !claimInsert.data) return json({ ok: false, message: claimInsert.error?.message || "Could not create the ownership request." }, 500);

    const claim = claimInsert.data;
    const uploadedPaths: string[] = [];
    try {
      for (const [index, file] of evidence.entries()) {
        const parsed = parseEvidence(file);
        const path = `claims/${claim.id}/${auth.user.id}/${index + 1}-${randomUUID()}.${parsed.extension}`;
        const upload = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, parsed.bytes, { contentType: parsed.mimeType, upsert: false });
        if (upload.error) throw upload.error;
        uploadedPaths.push(path);
        const evidenceInsert = await supabase.from("ownership_claim_evidence").insert({
          claim_id: claim.id,
          uploaded_by: auth.user.id,
          evidence_type: cleanText(file.type, 80) || (parsed.mimeType === "application/pdf" ? "ownership_document" : "current_instrument_photo"),
          file_name: cleanText(file.name, 180) || `Evidence ${index + 1}`,
          storage_path: path,
          private_note: cleanText(file.note, 500) || null
        });
        if (evidenceInsert.error) throw evidenceInsert.error;
      }
    } catch {
      // A lost final evidence reply can overlap explicit recovery. Never remove storage before a locked cleanup receipt.
      try {
        const cleanup = await supabase.rpc("discard_incomplete_claim_submission", { p_claim_id: claim.id, p_claimant_id: auth.user.id });
        const receipt = cleanup.data as { ok?: boolean; claim_id?: string; deleted?: boolean } | null;
        if (!cleanup.error && receipt?.ok === true && receipt.claim_id === claim.id && receipt.deleted === true) {
          if (uploadedPaths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
          return json({ ok: false, message: "The evidence upload failed. Please choose your files and try again." }, 503);
        }
      } catch { /* An uncertain cleanup must not delete storage that a completed request may use. */ }
      return json({ ok: false, uncertain: true, claimId: claim.id, message: "The upload outcome could not be confirmed. Refresh your requests before trying again; a saved request may be ready to finish submitting." }, 503);
    }

    try {
      const completed = await supabase.rpc("complete_ownership_claim_submission", { p_claim_id: claim.id, p_claimant_id: auth.user.id });
      const receipt = completed.data as { ok?: boolean; claim_id?: string; submission_complete?: boolean } | null;
      if (completed.error || receipt?.ok !== true || receipt.claim_id !== claim.id || receipt.submission_complete !== true) throw new Error("Completion unconfirmed");
    } catch {
      return json({ ok: false, committed: true, claimId: claim.id, message: "Your request and evidence were saved, but submission could not be confirmed. Refresh your requests and choose Finish submitting; do not upload the files again." }, 503);
    }

    return json({ ok: true, message: guitar.owner_id ? "Ownership request sent to the current owner for review." : "Ownership request sent for QRguitar review.", claim: safeClaim({ ...claim, action_email_completed: true }, guitar, evidence.length, [], false, auth.user.id) }, 201);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : "Could not create the ownership request." }, 500);
  }
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  const auth = await getAuthenticatedUser(request);
  if (!supabase || !auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, message: writeAccess.message }, writeAccess.status);

  const body = await request.json().catch(() => ({})) as {
    id?: string;
    action?: "cancel" | "approve" | "deny" | "request_information" | "expire" | "resubmit" | "complete_submission";
    note?: string;
    evidence?: EvidenceInput[];
  };
  const id = cleanText(body.id, 80);
  const action = body.action;
  if (!id || !action || !["cancel", "approve", "deny", "request_information", "expire", "resubmit", "complete_submission"].includes(action)) return json({ ok: false, message: "A valid ownership request action is required." }, 400);
  const claimResult = await supabase.from("ownership_claims").select("*").eq("id", id).maybeSingle<ClaimRow>();
  const claim = claimResult.data;
  if (claimResult.error) return json({ ok: false, message: "Ownership request lookup is temporarily unavailable. Please retry." }, 503);
  if (!claim) return json({ ok: false, message: "Ownership request not found." }, 404);
  if (action === "complete_submission") {
    if (claim.claimant_user_id !== auth.user.id) return json({ ok: false, message: "Only the claimant can finish submitting this request." }, 403);
    // The RPC rechecks locked authority and persisted evidence. No upload, new claim, or direct-update fallback.
    try {
      const result = await supabase.rpc("complete_ownership_claim_submission", { p_claim_id: id, p_claimant_id: auth.user.id });
      const receipt = result.data as { ok?: boolean; claim_id?: string; submission_complete?: boolean } | null;
      if (result.error || receipt?.ok !== true || receipt.claim_id !== id || receipt.submission_complete !== true) {
        return json({ ok: false, uncertain: true, message: "Submission could not be confirmed. Your saved evidence is unchanged. Refresh this request before retrying." }, 503);
      }
      return json({ ok: true, submissionComplete: true, message: "Your saved request is ready for review. This does not confirm email delivery." });
    } catch {
      return json({ ok: false, uncertain: true, message: "Submission could not be confirmed. Refresh this request; do not upload the evidence again." }, 503);
    }
  }
  if (action === "approve" && claim.completion_expected_evidence && claim.action_email_completed !== true) return json({ ok: false, message: "The claimant must finish submitting this request before it can be approved." }, 409);
  const ownDecisionReplay = claim.decided_by === auth.user.id && ((action === "approve" && claim.status === "approved") || (action === "deny" && claim.status === "denied"));
  if (!ownDecisionReplay && !["awaiting_claimant", "awaiting_owner", "admin_review"].includes(claim.status)) return json({ ok: false, message: "This ownership request is already closed." }, 409);

  const admin = await getAdminContext(request);
  const isAdmin = admin.ok;
  const note = cleanText(body.note, 1000);
  if ((action === "approve" || action === "resubmit" || action === "deny") && !ownDecisionReplay && claim.expires_at && Date.parse(claim.expires_at) <= Date.now()) return json({ ok: false, message: "This ownership request has expired." }, 409);
  const adminDecision = action === "approve" || action === "deny" || action === "request_information" || action === "expire";
  if (isAdmin && adminDecision && !note) {
    return json({ ok: false, message: "An operator reason is required for the audit trail." }, 400);
  }
  if (action === "resubmit") {
    if (claim.claimant_user_id !== auth.user.id || claim.status !== "awaiting_claimant") {
      return json({ ok: false, message: "Only the claimant can respond to this evidence request." }, 403);
    }
    const currentGuitar = await loadGuitar(supabase, claim.guitar_id);
    if (currentGuitar.error) return json({ ok: false, message: "Profile ownership could not be checked. Retry shortly." }, 503);
    if (!currentGuitar.data || currentGuitar.data.owner_id !== claim.current_owner_id || currentGuitar.data.admin_archived_at || currentGuitar.data.owner_removed_at) return json({ ok: false, message: "The Profile or its owner changed. Refresh this request." }, 409);
    const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, MAX_EVIDENCE_FILES) : [];
    if (!evidence.length) return json({ ok: false, message: "Add at least one requested evidence file." }, 400);
    const evidenceError = validateEvidence(evidence);
    if (evidenceError) return json({ ok: false, message: evidenceError }, 400);
    const uploadedPaths: string[] = [];
    let preserveEvidence = false;
    try {
      for (const [index, file] of evidence.entries()) {
        const parsed = parseEvidence(file);
        const path = `claims/${claim.id}/${auth.user.id}/response-${Date.now()}-${index + 1}-${randomUUID()}.${parsed.extension}`;
        const upload = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, parsed.bytes, { contentType: parsed.mimeType, upsert: false });
        if (upload.error) throw upload.error;
        uploadedPaths.push(path);
        const inserted = await supabase.from("ownership_claim_evidence").insert({
          claim_id: claim.id,
          uploaded_by: auth.user.id,
          evidence_type: cleanText(file.type, 80) || (parsed.mimeType === "application/pdf" ? "ownership_document" : "additional_evidence"),
          file_name: cleanText(file.name, 180) || `Additional evidence ${index + 1}`,
          storage_path: path,
          private_note: cleanText(file.note, 500) || null
        });
        if (inserted.error) throw inserted.error;
      }
      const nextStatus = claim.current_owner_id ? "awaiting_owner" : "admin_review";
      preserveEvidence = true;
      const updated = await supabase.from("ownership_claims").update({ status: nextStatus, admin_review_note: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
      if (updated.error) throw updated.error;
      if (!updated.data) { preserveEvidence = false; throw new ClaimStateConflict("This ownership request changed while you were reviewing it. Refresh and try again."); }
      const recorded = await supabase.from("ownership_claim_events").insert({ claim_id: id, actor_user_id: auth.user.id, action: "evidence_resubmitted", note: note || "Additional private evidence submitted.", metadata: { evidence_count: evidence.length } });
      if (recorded.error) return json({ ok: false, committed: true, message: "Evidence was saved and submitted, but its activity receipt is unavailable. Refresh this request; do not upload it again." }, 503);
      return json({ ok: true, status: nextStatus, message: nextStatus === "awaiting_owner" ? "Evidence sent to the current owner for review." : "Evidence returned to QRguitar for review." });
    } catch (error) {
      if (uploadedPaths.length && !preserveEvidence) {
        await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
        await supabase.from("ownership_claim_evidence").delete().in("storage_path", uploadedPaths);
      }
      return json({ ok: false, ...(preserveEvidence ? { uncertain: true } : {}), message: preserveEvidence ? "The submission outcome could not be confirmed. Your uploaded evidence was kept. Refresh this request before trying again." : error instanceof Error ? error.message : "Could not submit the requested evidence." }, error instanceof ClaimStateConflict ? 409 : preserveEvidence ? 503 : 500);
    }
  } else if (action === "cancel") {
    if (claim.claimant_user_id !== auth.user.id) return json({ ok: false, message: "Only the claimant can cancel this request." }, 403);
    const result = await supabase.from("ownership_claims").update({ status: "cancelled", decided_at: new Date().toISOString(), decided_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
    if (result.error) return json({ ok: false, message: result.error.message || "Could not cancel the ownership request." }, 409);
    if (!result.data) return json({ ok: false, message: "This ownership request changed while you were reviewing it. Refresh and try again." }, 409);
  } else if (action === "deny") {
    if (claim.current_owner_id !== auth.user.id && !isAdmin) return json({ ok: false, message: "Current owner or admin review is required." }, 403);
    const currentGuitar = await loadGuitar(supabase, claim.guitar_id);
    if (currentGuitar.error) return json({ ok: false, message: "Profile ownership could not be checked. Retry shortly." }, 503);
    if (!ownDecisionReplay && (!currentGuitar.data || currentGuitar.data.owner_id !== claim.current_owner_id || currentGuitar.data.admin_archived_at || currentGuitar.data.owner_removed_at)) return json({ ok: false, message: "The Profile or its owner changed. Refresh this request." }, 409);
    if (!ownDecisionReplay && !isAdmin && (currentGuitar.data?.owner_id !== auth.user.id || claim.status !== "awaiting_owner")) return json({ ok: false, message: "Only the current owner can review a request awaiting owner approval." }, 403);
    try {
      const result = await supabase.rpc("deny_ownership_claim_current", { p_claim_id: id, p_decided_by: auth.user.id, p_decision_note: note || null, p_env_admin: isAdmin && admin.accessSource === "env" });
      if (result.error) {
        const conflict = ["QC001", "QC002", "42501", "22023", "40001", "40P01"].includes(result.error.code || "");
        return json({ ok: false, ...(!conflict ? { uncertain: true } : {}), message: conflict ? result.error.message : "The decision could not be confirmed. Refresh the request before trying again." }, conflict ? 409 : 503);
      }
      if (!result.data || result.data.ok !== true || result.data.claim_id !== id) return json({ ok: false, uncertain: true, message: "The decision could not be confirmed. Refresh the request before trying again." }, 503);
      return json({ ok: true, message: "Ownership request denied. Ownership did not change." });
    } catch { return json({ ok: false, uncertain: true, message: "The decision could not be confirmed. Refresh the request before trying again." }, 503); }
  } else if (action === "request_information") {
    if (!isAdmin) return json({ ok: false, message: "Admin review is required to request more information." }, 403);
    if (!note) return json({ ok: false, message: "Explain what additional evidence is required." }, 400);
    const result = await supabase.from("ownership_claims").update({ status: "awaiting_claimant", admin_review_note: note, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
    if (result.error) return json({ ok: false, message: result.error.message || "Could not request more information." }, 409);
    if (!result.data) return json({ ok: false, message: "This ownership request changed while you were reviewing it. Refresh and try again." }, 409);
  } else if (action === "expire") {
    if (!isAdmin) return json({ ok: false, message: "Admin review is required to expire an ownership request." }, 403);
    const result = await supabase.from("ownership_claims").update({ status: "expired", admin_review_note: note || null, decided_at: new Date().toISOString(), decided_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
    if (result.error) return json({ ok: false, message: result.error.message || "Could not expire the ownership request." }, 409);
    if (!result.data) return json({ ok: false, message: "This ownership request changed while you were reviewing it. Refresh and try again." }, 409);
  } else {
    if (claim.current_owner_id !== auth.user.id && !isAdmin) return json({ ok: false, message: "Current owner or admin review is required." }, 403);
    let approved;
    try {
      approved = await supabase.rpc("approve_ownership_claim", { p_claim_id: id, p_decided_by: auth.user.id, p_decision_note: note || null, p_env_admin: isAdmin && admin.accessSource === "env" });
    } catch {
      return json({ ok: false, uncertain: true, message: "Could not confirm approval. Reload the request before trying again." }, 503);
    }
    if (approved.error) {
      const conflict = ["QC001","QC002","QC003","42501","22023"].includes(approved.error.code || "");
      return json({ ok: false, ...(!conflict ? { uncertain: true } : {}), message: conflict ? approved.error.message : "Could not confirm approval. Reload the request before trying again." }, conflict ? 409 : 503);
    }
    if (!approved.data || approved.data.ok !== true || approved.data.claim_id !== id) return json({ ok: false, uncertain: true, message: "Could not confirm approval. Reload the request before trying again." }, 503);
    return json({ ok: true, message: "Ownership transferred. The QRguitar ID and permanent Profile URL did not change." });
  }

  await supabase.from("ownership_claim_events").insert({ claim_id: id, actor_user_id: auth.user.id, action, note: note || null });
  const messages: Record<string, string> = {
    cancel: "Ownership request cancelled.",
    deny: "Ownership request denied.",
    request_information: "Additional evidence requested.",
    expire: "Ownership request expired."
  };
  return json({ ok: true, message: messages[action] || "Ownership request updated." });
}
