import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { assertAccountCanWrite, isAdminRole, normalizeEmail as normalizeAdminEmail, readAdminEmailList } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string;
  name: string;
  brand: string;
  model: string | null;
  visibility: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  role?: string | null;
  plan?: string | null;
};

type TransferRow = {
  id: string;
  guitar_id: string;
  from_owner_id: string | null;
  to_email: string;
  to_name: string | null;
  status: "draft" | "sent" | "accepted" | "expired" | "cancelled";
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  fee_cents?: number | null;
  expires_at?: string | null;
  claim_token_hash?: string | null;
  purchaser_code_hash?: string | null;
  claim_prepared_at?: string | null;
};

const TRANSFER_SELECT = "id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents,expires_at,claim_token_hash,purchaser_code_hash,claim_prepared_at";

type ServerSupabaseClient = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init.headers || {})
    }
  });
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function normalizeBuyerCode(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashBuyerCode(value: string) {
  return createHash("sha256").update(normalizeBuyerCode(value)).digest("hex");
}

function normalizeOrderReference(value: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function hashOrderReference(value: string) {
  return createHash("sha256").update(normalizeOrderReference(value)).digest("hex");
}

function createBuyerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function transferClaimPath(id: string) {
  return `/transfer/${id}`;
}

function transferClaimUrl(request: Request, id: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || getSupabaseEnvStatus().siteUrl;
  const origin = configuredSiteUrl || new URL(request.url).origin;
  return `${origin.replace(/\/$/, "")}${transferClaimPath(id)}`;
}

function transferStatus(status: TransferRow["status"]) {
  return status === "accepted" ? "accepted" : status === "cancelled" || status === "expired" ? "cancelled" : "sent";
}

async function canAdminister(supabase: ServerSupabaseClient, user: User) {
  if (readAdminEmailList().includes(normalizeAdminEmail(user.email))) {
    return true;
  }

  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<ProfileRow>();
  if (profile.error) throw new Error("Could not verify transfer access.");
  return isAdminRole(profile?.data?.role);
}

function mapTransfer(row: TransferRow, guitar?: GuitarRow | null, includePrivate = false) {
  return {
    id: row.id,
    guitarQrCode: guitar?.qr_code || "",
    guitarName: guitar?.name || guitar?.model || "QRguitar Profile",
    toName: includePrivate ? row.to_name || "" : "",
    toEmail: includePrivate ? row.to_email : "",
    status: transferStatus(row.status),
    claimPath: transferClaimPath(row.id),
    createdAt: row.created_at,
    acceptedAt: row.accepted_at || undefined,
    handoffPrepared: Boolean(row.purchaser_code_hash),
    orderReferenceRequired: Boolean(row.claim_token_hash),
    expiresAt: row.expires_at || undefined,
    feeCents: row.fee_cents || 0,
    paymentCollected: false
  };
}

async function sendTransferClaimEmail(request: Request, transfer: TransferRow, guitar: GuitarRow) {
  const env = getSupabaseEnvStatus();
  if (!env.supabaseUrl || !env.hasAnonKey) {
    return { ok: false, message: "Supabase Auth email is not configured." };
  }

  const authClient = createClient(env.supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const claimUrl = transfer.purchaser_code_hash
    ? `${(process.env.NEXT_PUBLIC_SITE_URL || env.siteUrl || new URL(request.url).origin).replace(/\/$/, "")}/ownership-claim?handoff=buyer-code`
    : transferClaimUrl(request, transfer.id);
  const recordName = guitar.name || guitar.model || guitar.qr_code;
  const { error } = await authClient.auth.signInWithOtp({
    email: transfer.to_email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: claimUrl,
      data: {
        display_name: transfer.to_name || "",
        transfer_record: recordName,
        transfer_qr_code: guitar.qr_code
      }
    }
  });

  if (error) {
    return { ok: false, message: error.message || "Could not send transfer email." };
  }

  return { ok: true, message: "Transfer email sent." };
}

async function loadGuitarsById(supabase: ServerSupabaseClient, ids: string[]) {
  const guitars = new Map<string, GuitarRow>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return guitars;
  }

  const result = await supabase.from("guitars").select("id,owner_id,qr_code,permanent_path,name,brand,model,visibility").in("id", uniqueIds);
  if (result.error) {
    throw new Error(result.error.message);
  }

  for (const row of result.data || []) {
    guitars.set((row as GuitarRow).id, row as GuitarRow);
  }

  return guitars;
}

async function loadTransferById(supabase: ServerSupabaseClient, id: string) {
  const result = await supabase
    .from("ownership_transfers")
    .select(TRANSFER_SELECT)
    .eq("id", id)
    .maybeSingle<TransferRow>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data || null;
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Ownership transfers are temporarily unavailable." }, { status: 503 });
  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    const scope = String(url.searchParams.get("scope") || "").trim();
    const auth = await getAuthenticatedUser(request);
    if (id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return json({ ok: false, message: "Transfer not found." }, { status: 404 });
      }
      const transfer = await loadTransferById(supabase, id);
      if (!transfer) return json({ ok: false, message: "Transfer not found." }, { status: 404 });
      const guitars = await loadGuitarsById(supabase, [transfer.guitar_id]);
      const guitar = guitars.get(transfer.guitar_id) || null;
      const email = normalizeEmail(auth.user?.email || "");
      const isParticipant = Boolean(auth.user) && (
        transfer.from_owner_id === auth.user?.id || transfer.accepted_by === auth.user?.id || guitar?.owner_id === auth.user?.id ||
        (email !== "" && normalizeEmail(transfer.to_email) === email) || (auth.user ? await canAdminister(supabase, auth.user) : false)
      );
      if (!isParticipant) {
        return json({ ok: true, transfer: { id: transfer.id }, requiresSignIn: true,
          message: "Sign in with the recipient email to view this handoff." });
      }
      return json({ ok: true, transfer: mapTransfer(transfer, guitar, true), requiresSignIn: false });
    }
    if (scope !== "mine") return json({ ok: false, message: "Unsupported transfer query." }, { status: 400 });
    if (!auth.user) return json({ ok: false, transfers: [], message: auth.error || "Sign in required." }, { status: 401 });
    const result = await supabase.from("ownership_transfers").select(TRANSFER_SELECT)
      .or(`from_owner_id.eq.${auth.user.id},accepted_by.eq.${auth.user.id}`).order("created_at", { ascending: false });
    if (result.error) throw new Error("Could not load transfers.");
    const guitars = await loadGuitarsById(supabase, (result.data || []).map((row) => (row as TransferRow).guitar_id));
    return json({ ok: true, transfers: (result.data || []).map((row) => mapTransfer(row as TransferRow, guitars.get((row as TransferRow).guitar_id), true)) });
  } catch {
    return json({ ok: false, transfers: [], code: "transfer_read_unavailable", message: "Transfers could not be loaded. Please try again." }, { status: 503 });
  }
}

type TransferSnapshot = { ok: true; replayed: boolean; transfer: TransferRow; guitar: GuitarRow };

function transferFailure(error?: { code?: string; message?: string } | null) {
  const code = error?.code || "";
  if (code === "PGRST202" || code === "42883") {
    return json({ ok: false, code: "transfer_unavailable", retryable: true, message: "Ownership transfers are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  if (code === "QT001") return json({ ok: false, code: "transfer_not_found", retryable: false, message: error?.message || "Transfer not found." }, { status: 404 });
  if (code === "QT002" || code === "23505") return json({ ok: false, code: "transfer_conflict", retryable: false, message: error?.message || "This handoff is no longer available." }, { status: 409 });
  if (code === "QT003") return json({ ok: false, code: "transfer_expired", retryable: false, message: error?.message || "This handoff has expired." }, { status: 410 });
  if (code === "QT004") return json({ ok: false, code: "transfer_needs_review", retryable: false, message: error?.message || "This handoff needs review." }, { status: 409 });
  if (code === "42501") return json({ ok: false, code: "transfer_forbidden", retryable: false, message: error?.message || "You cannot complete this handoff." }, { status: 403 });
  if (code === "22023" || code === "22P02") return json({ ok: false, code: "transfer_validation", retryable: false, message: "Enter valid handoff details." }, { status: 400 });
  return json({ ok: false, code: "transfer_unconfirmed", uncertain: true, retryable: true,
    message: "The handoff result could not be confirmed. Check your transfers or retry the same action before preparing another handoff." }, { status: 502 });
}

function transferSnapshot(value: unknown): TransferSnapshot | null {
  const result = value as Partial<TransferSnapshot> | null;
  if (result?.ok !== true || typeof result.replayed !== "boolean" || !result.transfer?.id || !result.guitar?.id ||
    result.transfer.guitar_id !== result.guitar.id || !result.guitar.qr_code || !result.guitar.permanent_path) return null;
  return result as TransferSnapshot;
}

function environmentAdmin(user: User) {
  // Database roles are checked again under the transaction lock. Only the server email allowlist is passed in.
  return readAdminEmailList().includes(normalizeAdminEmail(user.email));
}

async function sendCommittedTransferEmail(request: Request, transfer: TransferRow, guitar: GuitarRow) {
  try { return await sendTransferClaimEmail(request, transfer, guitar); }
  catch { return { ok: false, message: "Email delivery could not be confirmed. You can copy the claim link or resend the invitation." }; }
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return transferFailure({ code: "PGRST202" });
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
  const body = await request.json().catch(() => null) as { qrCode?: string; toEmail?: string; toName?: string; mode?: string; expiresInDays?: number; orderReference?: string } | null;
  const qrCode = String(body?.qrCode || "").trim().toUpperCase();
  const toEmail = normalizeEmail(body?.toEmail || "");
  const toName = String(body?.toName || "").trim();
  const mode = body?.mode === "buyer_code" ? "buyer_code" : "email";
  const expiresInDays = Math.trunc(Math.min(30, Math.max(1, Number(body?.expiresInDays) || 7)));
  const orderReference = normalizeOrderReference(body?.orderReference || "");
  if (!qrCode || (mode === "email" && !toEmail) || (toEmail && !/^[^\s@]+@[^\s@]+$/.test(toEmail))) {
    return json({ ok: false, message: mode === "email" ? "QRguitar ID and recipient email are required." : "Enter a valid optional recipient email." }, { status: 400 });
  }
  const buyerCode = mode === "buyer_code" ? createBuyerCode() : "";
  let result;
  try {
    result = await supabase.rpc("prepare_ownership_transfer", {
      p_actor_id: auth.user.id, p_qr_code: qrCode, p_to_email: toEmail, p_to_name: toName,
      p_buyer_code_hash: buyerCode ? hashBuyerCode(buyerCode) : null,
      p_order_reference_hash: buyerCode && orderReference ? hashOrderReference(orderReference) : null,
      p_expires_in_days: expiresInDays, p_env_admin: environmentAdmin(auth.user),
      p_display_name: auth.user.user_metadata?.display_name || auth.user.email || ""
    });
  } catch { return transferFailure(); }
  if (result.error) return transferFailure(result.error);
  const committed = transferSnapshot(result.data);
  if (!committed || committed.transfer.status !== "sent" || (buyerCode && committed.replayed)) return transferFailure();
  // A replay confirms the existing handoff; only explicit Resend may replace its invitation.
  const emailResult = !committed.replayed && committed.transfer.to_email ? await sendCommittedTransferEmail(request, committed.transfer, committed.guitar) : null;
  return json({ ok: true, transfer: mapTransfer(committed.transfer, committed.guitar, true),
    ...(buyerCode ? { buyerCode } : {}), replayed: committed.replayed, emailSent: emailResult?.ok || false,
    message: committed.replayed ? "Transfer is already ready. No new email was sent. Use the existing invitation or choose Resend if needed." : buyerCode
      ? emailResult?.ok ? "Private buyer code prepared and a secure sign-in invitation was emailed. Copy the code now; QRguitar will not display it again."
        : "Private buyer code prepared. Copy it now; QRguitar will not display it again."
      : emailResult?.ok ? "Transfer is ready and a claim email was sent to the recipient. You can also copy the claim link."
        : "Transfer is ready. Copy the claim link manually; email delivery could not be confirmed." });
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return transferFailure({ code: "PGRST202" });
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
  const body = await request.json().catch(() => null) as { id?: string; action?: string; reason?: string; code?: string; orderReference?: string } | null;
  const id = String(body?.id || "").trim();
  const action = body?.action;
  if (!["cancel", "accept", "redeem_code", "resend"].includes(action || "") || (action !== "redeem_code" && !id)) {
    return json({ ok: false, message: "Transfer ID and action are required." }, { status: 400 });
  }
  const code = action === "redeem_code" ? normalizeBuyerCode(body?.code || "") : "";
  if (action === "redeem_code" && code.length !== 12) {
    return json({ ok: false, message: "Enter the complete 12-character private buyer code." }, { status: 400 });
  }
  let result;
  try {
    result = action === "accept" || action === "redeem_code"
      ? await supabase.rpc("complete_ownership_transfer", {
        p_transfer_id: action === "redeem_code" ? null : id, p_new_owner_id: auth.user.id,
        p_buyer_code_hash: code ? hashBuyerCode(code) : null,
        p_order_reference_hash: code && normalizeOrderReference(body?.orderReference || "") ? hashOrderReference(body?.orderReference || "") : null,
        p_env_admin: environmentAdmin(auth.user), p_display_name: auth.user.user_metadata?.display_name || auth.user.email || ""
      })
      : await supabase.rpc("manage_ownership_transfer", {
        p_transfer_id: id, p_actor_id: auth.user.id, p_action: action, p_reason: String(body?.reason || "").trim(),
        p_env_admin: environmentAdmin(auth.user), p_display_name: auth.user.user_metadata?.display_name || auth.user.email || ""
      });
  } catch { return transferFailure(); }
  if (result.error) return transferFailure(result.error);
  const committed = transferSnapshot(result.data);
  if (!committed) return transferFailure();
  if (action === "resend") {
    if (committed.transfer.status !== "sent") return transferFailure();
    const emailResult = await sendCommittedTransferEmail(request, committed.transfer, committed.guitar);
    return json({ ok: emailResult.ok, transfer: mapTransfer(committed.transfer, committed.guitar, true),
      message: emailResult.ok ? "Secure sign-in invitation resent. The private buyer code was not included." : emailResult.message
    }, { status: emailResult.ok ? 200 : 502 });
  }
  if (action === "cancel") {
    if (committed.transfer.status !== "cancelled") return transferFailure();
    return json({ ok: true, transfer: mapTransfer(committed.transfer, committed.guitar, true), replayed: committed.replayed, message: "Transfer cancelled." });
  }
  if (committed.transfer.status !== "accepted" || committed.transfer.accepted_by !== auth.user.id) return transferFailure();
  return json({ ok: true, transfer: mapTransfer(committed.transfer, committed.guitar, true),
    permanentPath: committed.guitar.permanent_path, replayed: committed.replayed,
    message: "Ownership accepted. The QRguitar Profile, ID, URL, and protected history stayed with the instrument." });
}
