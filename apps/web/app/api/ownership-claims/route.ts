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
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
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
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES) throw new Error("Each evidence file must be 10 MB or smaller.");
  return { mimeType: match[1], extension, bytes };
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
    .select("id,owner_id,qr_code,name,brand,model")
    .eq("id", guitarId)
    .maybeSingle<GuitarRow>();
}

function safeClaim(
  claim: ClaimRow,
  guitar?: GuitarRow | null,
  evidenceCount = 0,
  evidence: Array<{ id: string; type: string; fileName: string; note: string; url: string; createdAt: string }> = [],
  includeAdminNote = false
) {
  return {
    id: claim.id,
    claimType: claim.claim_type,
    status: claim.status,
    guitarId: claim.guitar_id,
    qrCode: guitar?.qr_code || "",
    profileTitle: guitar?.name || [guitar?.brand, guitar?.model].filter(Boolean).join(" ") || "QRguitar Profile",
    acquisitionDetails: claim.acquisition_details || "",
    ownershipDeclaration: claim.ownership_declaration || "",
    ownerResponseNote: claim.owner_response_note || "",
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
    guitarIds.length ? supabase.from("guitars").select("id,owner_id,qr_code,name,brand,model").in("id", guitarIds) : Promise.resolve({ data: [], error: null }),
    claimIds.length ? supabase.from("ownership_claim_evidence").select("id,claim_id,evidence_type,file_name,storage_path,private_note,created_at").in("claim_id", claimIds) : Promise.resolve({ data: [], error: null })
  ]);
  const guitars = new Map(((guitarsResult.data || []) as GuitarRow[]).map((guitar) => [guitar.id, guitar]));
  const evidenceCounts = new Map<string, number>();
  const evidenceByClaim = new Map<string, ClaimEvidenceRow[]>();
  for (const row of (evidenceResult.data || []) as ClaimEvidenceRow[]) {
    evidenceCounts.set(row.claim_id, (evidenceCounts.get(row.claim_id) || 0) + 1);
    evidenceByClaim.set(row.claim_id, [...(evidenceByClaim.get(row.claim_id) || []), row]);
  }

  const safeEvidenceByClaim = new Map<string, Array<{ id: string; type: string; fileName: string; note: string; url: string; createdAt: string }>>();
  await Promise.all(claims.map(async (claim) => {
    if (!admin.ok && claim.current_owner_id !== auth.user?.id) return;
    const safeEvidence = await Promise.all((evidenceByClaim.get(claim.id) || []).map(async (row) => {
      const signed = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path, 5 * 60);
      if (signed.error || !signed.data?.signedUrl) return null;
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
  }));

  return json({
    ok: true,
    claims: claims.map((claim) => safeClaim(
      claim,
      guitars.get(claim.guitar_id),
      evidenceCounts.get(claim.id) || 0,
      safeEvidenceByClaim.get(claim.id) || [],
      admin.ok || claim.claimant_user_id === auth.user?.id
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
    if (guitarResult.error || !guitar) return json({ ok: false, message: "The matching Profile is unavailable." }, 404);
    if (guitar.owner_id === auth.user.id) return json({ ok: false, message: "This QRguitar Profile is already in your account." }, 409);

    const existing = await supabase
      .from("ownership_claims")
      .select("id,status")
      .eq("guitar_id", guitar.id)
      .eq("claimant_user_id", auth.user.id)
      .in("status", ["awaiting_claimant", "awaiting_owner", "admin_review"])
      .maybeSingle<{ id: string; status: string }>();
    if (existing.data) return json({ ok: false, message: "You already have an active ownership request for this Profile." }, 409);

    const claimInsert = await supabase.from("ownership_claims").insert({
      guitar_id: guitar.id,
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
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
      await supabase.from("ownership_claims").delete().eq("id", claim.id);
      throw error;
    }

    await supabase.from("ownership_claim_events").insert({
      claim_id: claim.id,
      actor_user_id: auth.user.id,
      action: "submitted",
      note: "Ownership request submitted with private evidence.",
      metadata: { evidence_count: evidence.length, claim_type: claimType, possession_challenge: claimType === "legacy_review" ? challengeCode : null }
    });

    return json({ ok: true, message: guitar.owner_id ? "Ownership request sent to the current owner for review." : "Ownership request sent for QRguitar review.", claim: safeClaim(claim, guitar, evidence.length) }, 201);
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
    action?: "cancel" | "approve" | "deny" | "request_information" | "expire" | "resubmit";
    note?: string;
    evidence?: EvidenceInput[];
  };
  const id = cleanText(body.id, 80);
  const action = body.action;
  if (!id || !action || !["cancel", "approve", "deny", "request_information", "expire", "resubmit"].includes(action)) return json({ ok: false, message: "A valid ownership request action is required." }, 400);
  const claimResult = await supabase.from("ownership_claims").select("*").eq("id", id).maybeSingle<ClaimRow>();
  const claim = claimResult.data;
  if (claimResult.error || !claim) return json({ ok: false, message: "Ownership request not found." }, 404);
  if (!["awaiting_claimant", "awaiting_owner", "admin_review"].includes(claim.status)) return json({ ok: false, message: "This ownership request is already closed." }, 409);

  const admin = await getAdminContext(request);
  const isAdmin = admin.ok;
  const note = cleanText(body.note, 1000);
  const adminDecision = action === "approve" || action === "deny" || action === "request_information" || action === "expire";
  if (isAdmin && adminDecision && !note) {
    return json({ ok: false, message: "An operator reason is required for the audit trail." }, 400);
  }
  if (action === "resubmit") {
    if (claim.claimant_user_id !== auth.user.id || claim.status !== "awaiting_claimant") {
      return json({ ok: false, message: "Only the claimant can respond to this evidence request." }, 403);
    }
    const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, MAX_EVIDENCE_FILES) : [];
    if (!evidence.length) return json({ ok: false, message: "Add at least one requested evidence file." }, 400);
    const uploadedPaths: string[] = [];
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
      const updated = await supabase.from("ownership_claims").update({ status: nextStatus, admin_review_note: null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
      if (updated.error) throw updated.error;
      if (!updated.data) throw new ClaimStateConflict("This ownership request changed while you were reviewing it. Refresh and try again.");
      await supabase.from("ownership_claim_events").insert({ claim_id: id, actor_user_id: auth.user.id, action: "evidence_resubmitted", note: note || "Additional private evidence submitted.", metadata: { evidence_count: evidence.length } });
      return json({ ok: true, status: nextStatus, message: nextStatus === "awaiting_owner" ? "Evidence sent to the current owner for review." : "Evidence returned to QRguitar for review." });
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
        await supabase.from("ownership_claim_evidence").delete().in("storage_path", uploadedPaths);
      }
      return json({ ok: false, message: error instanceof Error ? error.message : "Could not submit the requested evidence." }, error instanceof ClaimStateConflict ? 409 : 500);
    }
  } else if (action === "cancel") {
    if (claim.claimant_user_id !== auth.user.id) return json({ ok: false, message: "Only the claimant can cancel this request." }, 403);
    const result = await supabase.from("ownership_claims").update({ status: "cancelled", decided_at: new Date().toISOString(), decided_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
    if (result.error) return json({ ok: false, message: result.error.message || "Could not cancel the ownership request." }, 409);
    if (!result.data) return json({ ok: false, message: "This ownership request changed while you were reviewing it. Refresh and try again." }, 409);
  } else if (action === "deny") {
    if (claim.current_owner_id !== auth.user.id && !isAdmin) return json({ ok: false, message: "Current owner or admin review is required." }, 403);
    const result = await supabase.from("ownership_claims").update({ status: "denied", owner_response_note: note || null, decided_at: new Date().toISOString(), decided_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", id).eq("status", claim.status).select("id").maybeSingle<{ id: string }>();
    if (result.error) return json({ ok: false, message: result.error.message || "Could not deny the ownership request." }, 409);
    if (!result.data) return json({ ok: false, message: "This ownership request changed while you were reviewing it. Refresh and try again." }, 409);
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
    const approved = await supabase.rpc("approve_ownership_claim", { p_claim_id: id, p_decided_by: auth.user.id, p_decision_note: note || null });
    if (approved.error) return json({ ok: false, message: approved.error.message || "Could not approve the ownership request." }, 409);
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
