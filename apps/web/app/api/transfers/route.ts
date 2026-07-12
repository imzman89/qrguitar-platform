import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { assertAccountCanWrite, isAdminRole, logAdminAuditEvent, normalizeEmail as normalizeAdminEmail, readAdminEmailList } from "../../../lib/admin-auth";

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
};

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

function transferClaimPath(id: string) {
  return `/transfer/${id}`;
}

function transferClaimUrl(request: Request, id: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || getSupabaseEnvStatus().siteUrl;
  const origin = configuredSiteUrl || new URL(request.url).origin;
  return `${origin.replace(/\/$/, "")}${transferClaimPath(id)}`;
}

function transferStatus(status: TransferRow["status"]) {
  return status === "accepted" || status === "cancelled" ? status : "sent";
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
  const claimUrl = transferClaimUrl(request, transfer.id);
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
    .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
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
    .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
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

  const body = await request.json().catch(() => null) as { qrCode?: string; toEmail?: string; toName?: string } | null;
  const qrCode = String(body?.qrCode || "").trim().toUpperCase();
  const toEmail = normalizeEmail(body?.toEmail || "");
  const toName = String(body?.toName || "").trim();

  if (!qrCode || !toEmail || !toEmail.includes("@")) {
    return json({ ok: false, message: "QRguitar ID and recipient email are required." }, { status: 400 });
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

  const existing = await supabase
    .from("ownership_transfers")
    .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
    .eq("guitar_id", guitarResult.data.id)
    .eq("status", "sent")
    .maybeSingle<TransferRow>();

  if (existing.data) {
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

  const created = await supabase
    .from("ownership_transfers")
    .insert({
      guitar_id: guitarResult.data.id,
      from_owner_id: guitarResult.data.owner_id || auth.user.id,
      to_email: toEmail,
      to_name: toName,
      status: "sent",
      fee_cents: 0
    })
    .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
    .single<TransferRow>();

  if (created.error || !created.data) {
    return json({ ok: false, message: created.error?.message || "Could not create transfer." }, { status: 500 });
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

  const body = await request.json().catch(() => null) as { id?: string; action?: "cancel" | "accept"; reason?: string } | null;
  const id = String(body?.id || "").trim();
  const action = body?.action;

  if (!id || (action !== "cancel" && action !== "accept")) {
    return json({ ok: false, message: "Transfer ID and action are required." }, { status: 400 });
  }

  const transfer = await loadTransferById(supabase, id);
  if (!transfer) {
    return json({ ok: false, message: "Transfer not found." }, { status: 404 });
  }

  const guitars = await loadGuitarsById(supabase, [transfer.guitar_id]);
  const guitar = guitars.get(transfer.guitar_id) || null;
  const isAdmin = await canAdminister(supabase, auth.user);

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
      .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
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

  const acceptedAt = new Date().toISOString();
  const transferUpdate = await supabase
    .from("ownership_transfers")
    .update({ status: "accepted", accepted_by: auth.user.id, accepted_at: acceptedAt })
    .eq("id", id)
    .eq("status", "sent")
    .select("id,guitar_id,from_owner_id,to_email,to_name,status,accepted_by,accepted_at,created_at,fee_cents")
    .single<TransferRow>();

  if (transferUpdate.error || !transferUpdate.data) {
    return json({ ok: false, message: transferUpdate.error?.message || "Could not accept transfer." }, { status: 500 });
  }

  const guitarUpdate = await supabase
    .from("guitars")
    .update({ owner_id: auth.user.id, updated_at: acceptedAt })
    .eq("id", transfer.guitar_id)
    .eq("owner_id", transfer.from_owner_id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (guitarUpdate.error || !guitarUpdate.data) {
    await supabase
      .from("ownership_transfers")
      .update({ status: "sent", accepted_by: null, accepted_at: null })
      .eq("id", id)
      .eq("status", "accepted")
      .eq("accepted_by", auth.user.id);

    return json(
      { ok: false, message: guitarUpdate.error?.message || "The owner changed before this transfer could be completed." },
      { status: 409 }
    );
  }

  return json({
    ok: true,
    transfer: mapTransfer(transferUpdate.data, guitar ? { ...guitar, owner_id: auth.user.id } : null, true),
    permanentPath: guitar?.permanent_path || `/i/${guitar?.qr_code || ""}`,
    message: "Ownership accepted. The permanent QRguitar URL stayed the same."
  });
}
