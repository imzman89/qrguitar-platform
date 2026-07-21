import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { assertAccountCanWrite, isAdminRole, logAdminAuditEvent, normalizeEmail as normalizeAdminEmail, readAdminEmailList } from "../../../lib/admin-auth";
import { cleanPublicCollection, defaultPublicCollectionSettings, publicCollectionOwnerKey, type PublicCollectionSettings } from "../../../lib/public-collections";

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
  return isAdminRole(profile?.data?.role);
}

function mapTransfer(row: TransferRow, guitar?: GuitarRow | null, includePrivate = false) {
  return {
    id: row.id,
    guitarQrCode: guitar?.qr_code || "",
    guitarName: guitar?.name || guitar?.model || "Instrument record",
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
    paymentCollected: true
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
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  const scope = String(url.searchParams.get("scope") || "").trim();
  const auth = await getAuthenticatedUser(request);

  if (id) {
    const transfer = await loadTransferById(supabase, id);
    if (!transfer) {
      return json({ ok: false, message: "Transfer not found." }, { status: 404 });
    }

    const guitars = await loadGuitarsById(supabase, [transfer.guitar_id]);
    const guitar = guitars.get(transfer.guitar_id) || null;
    const userEmail = normalizeEmail(auth.user?.email || "");
    const isParticipant =
      Boolean(auth.user) &&
      (transfer.from_owner_id === auth.user?.id ||
        transfer.accepted_by === auth.user?.id ||
        normalizeEmail(transfer.to_email) === userEmail ||
        guitar?.owner_id === auth.user?.id ||
        (auth.user ? await canAdminister(supabase, auth.user) : false));

    return json({
      ok: true,
      transfer: mapTransfer(transfer, guitar, isParticipant),
      requiresSignIn: !auth.user
    });
  }

  if (scope !== "mine") {
    return json({ ok: false, message: "Unsupported transfer query." }, { status: 400 });
  }

  if (!auth.user) {
    return json({ ok: false, transfers: [], message: auth.error || "Sign in required." }, { status: 401 });
  }

  const result = await supabase
    .from("ownership_transfers")
    .select(TRANSFER_SELECT)
    .or(`from_owner_id.eq.${auth.user.id},accepted_by.eq.${auth.user.id}`)
    .order("created_at", { ascending: false });

  if (result.error) {
    return json({ ok: false, transfers: [], message: result.error.message }, { status: 500 });
  }

  const guitars = await loadGuitarsById(supabase, (result.data || []).map((row) => (row as TransferRow).guitar_id));
  return json({
    ok: true,
    transfers: (result.data || []).map((row) => mapTransfer(row as TransferRow, guitars.get((row as TransferRow).guitar_id), true))
  });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  }

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) {
    return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
  }

  const body = await request.json().catch(() => null) as { qrCode?: string; toEmail?: string; toName?: string; mode?: "email" | "buyer_code"; expiresInDays?: number; orderReference?: string } | null;
  const qrCode = String(body?.qrCode || "").trim().toUpperCase();
  const toEmail = normalizeEmail(body?.toEmail || "");
  const toName = String(body?.toName || "").trim();
  const mode = body?.mode === "buyer_code" ? "buyer_code" : "email";
  const expiresInDays = Math.min(30, Math.max(1, Number(body?.expiresInDays) || 7));
  const orderReference = normalizeOrderReference(body?.orderReference || "");

  if (!qrCode || (mode === "email" && (!toEmail || !toEmail.includes("@"))) || (toEmail && !toEmail.includes("@"))) {
    return json({ ok: false, message: mode === "email" ? "QRguitar ID and recipient email are required." : "Enter a valid optional recipient email." }, { status: 400 });
  }

  const guitarResult = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,visibility")
    .eq("qr_code", qrCode)
    .maybeSingle<GuitarRow>();

  if (guitarResult.error || !guitarResult.data) {
    return json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  const isOwner = guitarResult.data.owner_id === auth.user.id;
  const isAdmin = await canAdminister(supabase, auth.user);
  if (!isOwner && !isAdmin) {
    return json({ ok: false, message: "Only the current owner can create a transfer." }, { status: 403 });
  }

  if (mode === "buyer_code" && !isAdmin) {
    const settings = await supabase.from("site_content").select("content_value")
      .eq("content_key", publicCollectionOwnerKey(auth.user.id)).maybeSingle<{ content_value?: Record<string, unknown> }>();
    const collection = cleanPublicCollection((settings.data?.content_value || defaultPublicCollectionSettings) as Partial<PublicCollectionSettings>);
    if (collection.accountType !== "shop" && collection.accountType !== "builder") {
      return json({ ok: false, message: "Private buyer codes are available to enrolled shop and builder accounts." }, { status: 403 });
    }
  }

  const existing = await supabase
    .from("ownership_transfers")
    .select(TRANSFER_SELECT)
    .eq("guitar_id", guitarResult.data.id)
    .eq("status", "sent")
    .maybeSingle<TransferRow>();

  if (existing.data) {
    if (mode === "buyer_code" || existing.data.purchaser_code_hash) {
      return json({ ok: false, message: "A pending handoff already exists. Revoke it before preparing a new private buyer code." }, { status: 409 });
    }
    const emailResult = await sendTransferClaimEmail(request, existing.data, guitarResult.data);
    return json({
      ok: true,
      transfer: mapTransfer(existing.data, guitarResult.data, true),
      emailSent: emailResult.ok,
      message: emailResult.ok
        ? "Pending transfer already exists. A fresh claim email was sent to the recipient."
        : `Pending transfer already exists. Copy the claim link manually; email was not sent: ${emailResult.message}`
    });
  }

  const buyerCode = mode === "buyer_code" ? createBuyerCode() : "";
  const expiresAt = mode === "buyer_code" ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const created = await supabase
    .from("ownership_transfers")
    .insert({
      guitar_id: guitarResult.data.id,
      from_owner_id: guitarResult.data.owner_id || auth.user.id,
      to_email: toEmail,
      to_name: toName,
      status: "sent",
      fee_cents: 0,
      ...(mode === "buyer_code" ? {
        purchaser_code_hash: hashBuyerCode(buyerCode),
        claim_token_hash: orderReference ? hashOrderReference(orderReference) : null,
        expires_at: expiresAt,
        claim_prepared_at: new Date().toISOString()
      } : {})
    })
    .select(TRANSFER_SELECT)
    .single<TransferRow>();

  if (created.error || !created.data) {
    return json({ ok: false, message: created.error?.message || "Could not create transfer." }, { status: 500 });
  }

  if (mode === "buyer_code") {
    const emailResult = toEmail ? await sendTransferClaimEmail(request, created.data, guitarResult.data) : null;
    return json({
      ok: true,
      transfer: mapTransfer(created.data, guitarResult.data, true),
      buyerCode,
      emailSent: emailResult?.ok || false,
      message: emailResult?.ok
        ? "Private buyer code prepared and a secure sign-in invitation was emailed. Copy the code now; QRguitar will not display it again."
        : "Private buyer code prepared. Copy it now; QRguitar will not display it again."
    });
  }

  const emailResult = await sendTransferClaimEmail(request, created.data, guitarResult.data);

  return json({
    ok: true,
    transfer: mapTransfer(created.data, guitarResult.data, true),
    emailSent: emailResult.ok,
    message: emailResult.ok
      ? "Transfer created and emailed to the recipient. You can also copy the claim link."
      : `Transfer created. Copy the claim link manually; email was not sent: ${emailResult.message}`
  });
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  }

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) {
    return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
  }

  const body = await request.json().catch(() => null) as { id?: string; action?: "cancel" | "accept" | "redeem_code" | "resend"; reason?: string; code?: string; orderReference?: string } | null;
  const id = String(body?.id || "").trim();
  const action = body?.action;

  if (action === "redeem_code") {
    const code = normalizeBuyerCode(body?.code || "");
    if (code.length !== 12) {
      return json({ ok: false, message: "Enter the complete 12-character private buyer code." }, { status: 400 });
    }

    const result = await supabase.from("ownership_transfers").select(TRANSFER_SELECT)
      .eq("purchaser_code_hash", hashBuyerCode(code)).eq("status", "sent").maybeSingle<TransferRow>();
    const prepared = result.data;
    if (result.error || !prepared) {
      return json({ ok: false, message: "That private buyer code is invalid, revoked, or already used." }, { status: 404 });
    }
    if (!prepared.expires_at || Date.parse(prepared.expires_at) <= Date.now()) {
      await supabase.from("ownership_transfers").update({ status: "expired" }).eq("id", prepared.id).eq("status", "sent");
      return json({ ok: false, message: "That private buyer code has expired. Ask the seller or shop for a new one." }, { status: 410 });
    }
    if (prepared.to_email && normalizeEmail(prepared.to_email) !== normalizeEmail(auth.user.email || "")) {
      return json({ ok: false, message: "Sign in with the recipient email assigned to this buyer code." }, { status: 403 });
    }
    if (prepared.claim_token_hash && hashOrderReference(body?.orderReference || "") !== prepared.claim_token_hash) {
      return json({ ok: false, message: "Enter the order or receipt reference supplied with this buyer handoff." }, { status: 403 });
    }

    const profile = await supabase.from("profiles").select("display_name,plan,role").eq("id", auth.user.id).maybeSingle<ProfileRow>();
    const profileUpsert = await supabase.from("profiles").upsert({
      id: auth.user.id,
      display_name: profile.data?.display_name || auth.user.user_metadata?.display_name || auth.user.email || "",
      plan: profile.data?.plan || "single",
      role: profile.data?.role || "user"
    }, { onConflict: "id" });
    if (profileUpsert.error) return json({ ok: false, message: "Could not prepare your recipient profile." }, { status: 500 });

    const completion = await supabase.rpc("complete_ownership_transfer", { p_transfer_id: prepared.id, p_new_owner_id: auth.user.id });
    if (completion.error) {
      const status = /owner changed|no longer available/i.test(completion.error.message || "") ? 409 : 500;
      return json({ ok: false, message: completion.error.message || "Could not accept this handoff." }, { status });
    }
    const guitars = await loadGuitarsById(supabase, [prepared.guitar_id]);
    const guitar = guitars.get(prepared.guitar_id) || null;
    const completed = await loadTransferById(supabase, prepared.id);
    return json({
      ok: true,
      transfer: completed ? mapTransfer(completed, guitar ? { ...guitar, owner_id: auth.user.id } : null, true) : undefined,
      permanentPath: guitar?.permanent_path || `/i/${guitar?.qr_code || ""}`,
      message: "Ownership accepted. The QRguitar Profile, ID, URL, and protected history stayed with the instrument."
    });
  }

  if (!id || (action !== "cancel" && action !== "accept" && action !== "resend")) {
    return json({ ok: false, message: "Transfer ID and action are required." }, { status: 400 });
  }

  const transfer = await loadTransferById(supabase, id);
  if (!transfer) {
    return json({ ok: false, message: "Transfer not found." }, { status: 404 });
  }

  const guitars = await loadGuitarsById(supabase, [transfer.guitar_id]);
  const guitar = guitars.get(transfer.guitar_id) || null;
  const isAdmin = await canAdminister(supabase, auth.user);

  if (action === "resend") {
    if (transfer.status !== "sent" || !transfer.purchaser_code_hash || !transfer.to_email) {
      return json({ ok: false, message: "This private handoff does not have a resendable buyer invitation." }, { status: 400 });
    }
    if (transfer.from_owner_id !== auth.user.id && guitar?.owner_id !== auth.user.id && !isAdmin) {
      return json({ ok: false, message: "Only the current owner can resend this invitation." }, { status: 403 });
    }
    if (!guitar) return json({ ok: false, message: "The Profile for this handoff was not found." }, { status: 404 });
    const emailResult = await sendTransferClaimEmail(request, transfer, guitar);
    return json({
      ok: emailResult.ok,
      transfer: mapTransfer(transfer, guitar, true),
      message: emailResult.ok ? "Secure sign-in invitation resent. The private buyer code was not included." : emailResult.message
    }, { status: emailResult.ok ? 200 : 502 });
  }

  if (action === "cancel") {
    if (transfer.status !== "sent") {
      return json({ ok: false, message: "Only pending transfers can be cancelled." }, { status: 400 });
    }

    if (transfer.from_owner_id !== auth.user.id && guitar?.owner_id !== auth.user.id && !isAdmin) {
      return json({ ok: false, message: "Only the current owner can cancel this transfer." }, { status: 403 });
    }

    const update = await supabase
      .from("ownership_transfers")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "sent")
      .select(TRANSFER_SELECT)
      .single<TransferRow>();

    if (update.error || !update.data) {
      return json({ ok: false, message: update.error?.message || "Could not cancel transfer." }, { status: 500 });
    }

    if (isAdmin) {
      await logAdminAuditEvent(supabase, {
        actorUserId: auth.user.id,
        actorEmail: auth.user.email || "",
        action: "transfer_cancelled",
        targetType: "transfer",
        targetId: id,
        targetUserId: transfer.from_owner_id || null,
        reason: String(body?.reason || "").trim() || "Transfer cancelled.",
        metadata: { guitarId: transfer.guitar_id, qrCode: guitar?.qr_code || "" }
      });
    }

    return json({ ok: true, transfer: mapTransfer(update.data, guitar, true), message: "Transfer cancelled." });
  }

  if (transfer.status !== "sent") {
    return json({ ok: false, message: "This transfer is no longer available." }, { status: 400 });
  }

  if (transfer.purchaser_code_hash) {
    return json({ ok: false, message: "This handoff requires its private buyer code in the Ownership Claim Center." }, { status: 403 });
  }

  if (normalizeEmail(auth.user.email || "") !== normalizeEmail(transfer.to_email) && !isAdmin) {
    return json({ ok: false, message: "Sign in with the recipient email on this transfer." }, { status: 403 });
  }

  const existingProfile = await supabase.from("profiles").select("display_name,plan,role").eq("id", auth.user.id).maybeSingle<ProfileRow>();
  const profileUpsert = await supabase.from("profiles").upsert({
    id: auth.user.id,
    display_name: existingProfile.data?.display_name || auth.user.user_metadata?.display_name || auth.user.email || "",
    plan: existingProfile.data?.plan || "single",
    role: existingProfile.data?.role || "user"
  }, { onConflict: "id" });

  if (profileUpsert.error) {
    return json({ ok: false, message: "Could not prepare recipient profile." }, { status: 500 });
  }

  const completion = await supabase.rpc("complete_ownership_transfer", {
    p_transfer_id: id,
    p_new_owner_id: auth.user.id
  });

  if (completion.error) {
    const status = /owner changed|no longer available/i.test(completion.error.message || "") ? 409 : 500;
    return json({ ok: false, message: completion.error.message || "Could not accept transfer." }, { status });
  }

  const completedTransfer = await loadTransferById(supabase, id);
  if (!completedTransfer) {
    return json({ ok: false, message: "Transfer completed but could not be reloaded." }, { status: 500 });
  }

  return json({
    ok: true,
    transfer: mapTransfer(completedTransfer, guitar ? { ...guitar, owner_id: auth.user.id } : null, true),
    permanentPath: guitar?.permanent_path || `/i/${guitar?.qr_code || ""}`,
    message: "Ownership accepted. The permanent QRguitar URL stayed the same."
  });
}
