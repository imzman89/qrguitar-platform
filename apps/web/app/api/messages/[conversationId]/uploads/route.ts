import {
  isMemberMediaType,
  isMessagingUuid,
  MEMBER_MEDIA_BUCKET,
  MEMBER_MEDIA_COUNT_LIMIT,
  MEMBER_MEDIA_LIMIT
} from "../../../../../lib/member-messaging";
import { memberMessageJson, memberMessageOriginAllowed, readMemberMessageJson } from "../../../../../lib/member-messaging-http";
import { messagingDatabaseError, requireMessagingAccess, requireParticipantConversation } from "../../../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UploadInput = { uploadId?: unknown; fileName?: unknown; mimeType?: unknown; fileSizeBytes?: unknown };

function readFiles(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > MEMBER_MEDIA_COUNT_LIMIT) return null;
  const files = value.map((item) => {
    const row = item as UploadInput;
    const fileName = String(row.fileName || "").trim();
    const fileSizeBytes = Number(row.fileSizeBytes);
    if (!isMessagingUuid(row.uploadId) || !fileName || fileName.length > 120 || /[\x00-\x1f/\\]/.test(fileName)
      || !isMemberMediaType(row.mimeType) || !Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 1 || fileSizeBytes > MEMBER_MEDIA_LIMIT) return null;
    return { uploadId: row.uploadId, fileName, mimeType: row.mimeType, fileSizeBytes };
  });
  if (files.some((file) => !file) || new Set(files.map((file) => file?.uploadId)).size !== files.length) return null;
  return files as Array<NonNullable<typeof files[number]>>;
}

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  if (!memberMessageOriginAllowed(request)) return memberMessageJson({ ok: false, message: "Open Messages from QRguitar to continue." }, 403);
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const conversationId = (await context.params).conversationId;
  const body = await readMemberMessageJson(request);
  const operationId = body?.operationId;
  const files = readFiles(body?.files);
  if (!isMessagingUuid(conversationId) || !isMessagingUuid(operationId) || !files) return memberMessageJson({ ok: false, message: "Choose up to four supported images or videos under 15 MB each." }, 400);
  if (!await requireParticipantConversation(access.supabase, access.user.id, conversationId)) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);

  const prepared: Array<{ uploadId: string; path: string }> = [];
  for (const file of files) {
    const result = await access.supabase.rpc("prepare_member_message_upload", {
      p_conversation_id: conversationId,
      p_actor_id: access.user.id,
      p_operation_id: operationId,
      p_upload_id: file.uploadId,
      p_file: { fileName: file.fileName, mimeType: file.mimeType, fileSizeBytes: file.fileSizeBytes }
    });
    if (result.error) {
      if (prepared.length) await access.supabase.from("member_message_uploads").delete().eq("actor_id", access.user.id).eq("conversation_id", conversationId).eq("operation_id", operationId).eq("state", "prepared");
      const failure = messagingDatabaseError(result.error);
      return memberMessageJson({ ok: false, message: failure.message }, failure.status);
    }
    const value = result.data as { storagePath?: string } | null;
    if (!value?.storagePath) return memberMessageJson({ ok: false, message: "The attachment upload could not be prepared." }, 503);
    prepared.push({ uploadId: file.uploadId, path: value.storagePath });
  }

  const uploads: Array<{ uploadId: string; path: string; token: string }> = [];
  for (const item of prepared) {
    const signed = await access.supabase.storage.from(MEMBER_MEDIA_BUCKET).createSignedUploadUrl(item.path, { upsert: false });
    if (signed.error || !signed.data) {
      await access.supabase.from("member_message_uploads").delete().eq("actor_id", access.user.id).eq("conversation_id", conversationId).eq("operation_id", operationId).eq("state", "prepared");
      return memberMessageJson({ ok: false, message: "The attachment upload could not be prepared." }, 503);
    }
    uploads.push({ uploadId: item.uploadId, path: signed.data.path, token: signed.data.token });
  }
  return memberMessageJson({ ok: true, uploads, expiresInSeconds: 7200 });
}

export async function DELETE(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  if (!memberMessageOriginAllowed(request)) return memberMessageJson({ ok: false, message: "Open Messages from QRguitar to continue." }, 403);
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const conversationId = (await context.params).conversationId;
  const body = await readMemberMessageJson(request);
  const operationId = body?.operationId;
  if (!isMessagingUuid(conversationId) || !isMessagingUuid(operationId)) return memberMessageJson({ ok: false, message: "The attachment operation is invalid." }, 400);
  if (!await requireParticipantConversation(access.supabase, access.user.id, conversationId)) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
  const receipts = await access.supabase.from("member_message_uploads").select("upload_id,storage_path").eq("actor_id", access.user.id)
    .eq("conversation_id", conversationId).eq("operation_id", operationId).eq("state", "prepared");
  if (receipts.error) return memberMessageJson({ ok: false, message: "Attachments could not be discarded." }, 503);
  const paths = (receipts.data || []).map((row) => String(row.storage_path || "")).filter(Boolean);
  if (paths.length) {
    const removed = await access.supabase.storage.from(MEMBER_MEDIA_BUCKET).remove(paths);
    if (removed.error) return memberMessageJson({ ok: false, message: "Attachments could not be discarded. Try again." }, 503);
  }
  const discarded = await access.supabase.from("member_message_uploads").update({ state: "discarded", discarded_at: new Date().toISOString() })
    .eq("actor_id", access.user.id).eq("conversation_id", conversationId).eq("operation_id", operationId).eq("state", "prepared");
  if (discarded.error) return memberMessageJson({ ok: false, message: "Attachments could not be discarded. Try again." }, 503);
  return memberMessageJson({ ok: true });
}
