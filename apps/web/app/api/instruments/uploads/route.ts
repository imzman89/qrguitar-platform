import { isOwnedStagedPath, removeUnreferencedStagedUploads } from "../../../../lib/staged-upload-cleanup";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../../lib/supabase-server";
import { MAX_PROFILE_UPLOAD_BYTES, MAX_INLINE_PROFILE_UPLOAD_BYTES, MAX_PROFILE_UPLOAD_JSON_BYTES, MAX_PROFILE_UPLOAD_CONTROL_BYTES, cleanProfileUploadId, cleanProfileFileId, allowedProfileUpload, profileUploadBucket, profileUploadPath, profileUploadExtension, validProfileSignedUploadUrl, type ProfileUploadKind } from "../../../../lib/profile-upload-protocol";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
type UploadClient = NonNullable<ReturnType<typeof createServerSupabaseClient>>;
function json(body: Record<string, unknown>, status = 200) { return NextResponse.json(body, {status, headers:{"Cache-Control":"no-store, no-cache, must-revalidate"}}); }
function failure(code: string, message: string, status: number, retryable = false, uncertain = false) { return json({ok:false,code,message,retryable,uncertain},status); }
async function boundedBody(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return {tooLarge:true};
  const reader = request.body?.getReader();
  if (!reader) return {body:null,bytes:0};
  let bytes = 0, text = ""; const decoder = new TextDecoder();
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > limit) { await reader.cancel(); return {tooLarge:true}; } text += decoder.decode(next.value,{stream:true}); }
    text += decoder.decode(); const value: unknown = JSON.parse(text);
    return {body:value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : null,bytes};
  } catch { return {body:null,bytes}; }
  finally { reader.releaseLock(); }
}
async function register(supabase: UploadClient, ownerId: string, uploadId: string, bucket: string, storagePath: string, targetGuitarId = "") {
  try {
    const result = await supabase.rpc(targetGuitarId ? "register_staged_instrument_edit_upload" : "register_staged_instrument_upload",{
      p_owner_id:ownerId,p_upload_id:uploadId,p_bucket_id:bucket,p_storage_path:storagePath,
      ...(targetGuitarId ? {p_guitar_id:targetGuitarId} : {})
    });
    if (result.error?.code === "QG007" || result.data?.state === "tombstoned") return failure("upload_session_changed","This file was removed from its upload session. Choose it again.",409);
    if (result.data?.state === "consumed") return failure("upload_already_consumed","This file already belongs to a saved Profile. Resume the original save request.",409);
    if (result.error || result.data?.ok !== true || result.data.state !== "staged") return failure("upload_registration_failed","The upload could not be confirmed. Retry this same file.",503,true,true);
    return null;
  } catch { return failure("upload_registration_failed","The upload could not be confirmed. Retry this same file.",503,true,true); }
}
async function signedHandshake(supabase: UploadClient, ownerId: string, body: Record<string,unknown>) {
  const uploadId = cleanProfileUploadId(body.uploadId), fileId = cleanProfileFileId(body.fileId);
  const targetGuitarId = body.targetGuitarId === undefined ? "" : cleanProfileFileId(body.targetGuitarId);
  const kind = body.kind as ProfileUploadKind, mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const size = body.size;
  if (body.expectedOwnerId !== ownerId) return failure("upload_owner_changed","The signed-in account changed. Return to the original account before retrying.",409);
  if (!uploadId || !fileId || (body.targetGuitarId !== undefined && !targetGuitarId) || (kind !== "image" && kind !== "document") || (body.action !== "prepare" && body.action !== "complete")) return failure("invalid_upload","This upload identity is invalid. Select the file again.",400);
  if (!Number.isSafeInteger(size) || Number(size) < 1) return failure("invalid_file","Choose a nonempty file.",400);
  if (Number(size) > MAX_PROFILE_UPLOAD_BYTES) return failure("file_too_large","Use a file no larger than 12MB.",413);
  if (!allowedProfileUpload(kind,mimeType)) return failure("unsupported_file_type",kind === "image" ? "Use a JPG, PNG, or WebP photo." : "Use a PDF, JPG, PNG, or WebP document.",415);
  if (targetGuitarId) {
    const target = await supabase.from("guitars").select("id,owner_id,owner_removed_at,admin_archived_at").eq("id",targetGuitarId).maybeSingle();
    if (target.error) return failure("upload_target_unavailable","The Profile could not be checked before uploading. Try again.",503,true,true);
    if (!target.data || target.data.owner_id !== ownerId) return failure("upload_target_forbidden","Only the current owner can upload files to this Profile.",403);
    if (target.data.owner_removed_at || target.data.admin_archived_at) return failure("upload_target_changed","This Profile can no longer accept uploads.",409);
  }
  const bucket = profileUploadBucket(kind), storagePath = profileUploadPath(ownerId,uploadId,fileId,kind,mimeType,targetGuitarId);
  if (!storagePath || (body.storagePath !== undefined && body.storagePath !== storagePath)) return failure("invalid_upload","That file does not belong to this account and upload session.",400);
  const registry = await supabase.from("instrument_staged_uploads").select("owner_id,upload_id,state").eq("bucket_id",bucket).eq("storage_path",storagePath).maybeSingle();
  if (registry.error) return failure("upload_registry_unavailable","Uploads cannot be checked safely right now. Retry this same file.",503,true,true);
  if (registry.data && (registry.data.owner_id !== ownerId || registry.data.upload_id !== uploadId)) return failure("invalid_upload","That upload belongs to another account or session.",403);
  if (registry.data?.state === "consumed") return failure("upload_already_consumed","This file already belongs to a saved Profile. Resume the original save request.",409);
  if (registry.data?.state === "tombstoned") return failure("upload_session_changed","This file was removed from its upload session. Choose it again.",409);
  if (registry.data && registry.data.state !== "staged") return failure("upload_registry_unavailable","The upload state could not be checked safely.",503,true,true);
  const storage = supabase.storage.from(bucket), info = await storage.info(storagePath);
  if (!info.error && info.data) {
    if (info.data.size !== size || info.data.contentType !== mimeType || info.data.name !== storagePath || (info.data.bucketId !== undefined && info.data.bucketId !== bucket) || info.data.isDeleteMarker) return failure("upload_metadata_mismatch","The uploaded file does not match the selected file. Keep this attempt and select a new file to replace it.",409);
    const rejected = await register(supabase,ownerId,uploadId,bucket,storagePath,targetGuitarId); if (rejected) return rejected;
    return json({ok:true,phase:"complete",storagePath,kind});
  }
  const storageError = info.error as {status?:number;statusCode?:string;code?:string} | null;
  const missing = storageError?.status === 404 || storageError?.statusCode === "404" || storageError?.code === "NoSuchKey" || storageError?.code === "not_found";
  if (!missing) return failure("upload_verification_unavailable","The file could not be checked. Retry this same upload.",503,true,true);
  if (body.action === "complete") return failure("upload_not_found","The file has not arrived yet. Retry this same upload.",409,true);
  const signed = await storage.createSignedUploadUrl(storagePath,{upsert:false});
  if (signed.error || !signed.data || signed.data.path !== storagePath || !validProfileSignedUploadUrl(signed.data.signedUrl,getSupabaseEnvStatus().supabaseUrl,bucket,storagePath)) return failure("signed_upload_unavailable","A secure upload could not be prepared. Retry this same file.",503,true,true);
  return json({ok:true,phase:"upload",storagePath,kind,signedUrl:signed.data.signedUrl});
}
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return failure("service_unavailable","Profile uploads are temporarily unavailable.",503,true);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return failure("auth_required","Sign in again before uploading.",401);
  const writeAccess = await assertAccountCanWrite(supabase,auth.user);
  if (!writeAccess.ok) return failure("account_write_blocked",writeAccess.message,writeAccess.status);
  const input = await boundedBody(request,MAX_PROFILE_UPLOAD_JSON_BYTES);
  if (input.tooLarge) return failure("upload_transport_too_large","Use the direct upload flow for this file.",413);
  const body = input.body;
  if (!body) return failure("invalid_upload","The upload request could not be read.",400);
  try {
    if (body.action !== undefined) {
      if (Number(input.bytes) > MAX_PROFILE_UPLOAD_CONTROL_BYTES) return failure("upload_transport_too_large","The upload preparation request is too large.",413);
      return await signedHandshake(supabase,auth.user.id,body);
    }
    // Compatibility for older callers: base64 JSON is limited below Vercel's transport ceiling.
    const uploadId = cleanProfileUploadId(body.uploadId), kind: ProfileUploadKind = body.kind === "document" ? "document" : "image";
    if (!uploadId) return failure("invalid_upload","This upload session is invalid.",400);
    const match = typeof body.dataUrl === "string" ? /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(body.dataUrl) : null;
    if (!match || match[2].length % 4 !== 0) return failure("invalid_file","The selected file could not be read.",400);
    const mimeType = match[1].toLowerCase(), bytes = Buffer.from(match[2],"base64");
    if (!bytes.length) return failure("invalid_file","Choose a nonempty file.",400);
    if (bytes.length > MAX_INLINE_PROFILE_UPLOAD_BYTES) return failure("upload_transport_too_large","Use the direct upload flow for files larger than 3MB.",413);
    if (!allowedProfileUpload(kind,mimeType)) return failure("unsupported_file_type","Use a supported photo or document file.",415);
    const bucket = profileUploadBucket(kind), index = Math.max(0,Math.min(99,Number(body.index)||0));
    const storagePath = `${auth.user.id}/profile-uploads/${uploadId}/${kind}-${String(index+1).padStart(2,"0")}-${randomUUID()}.${profileUploadExtension(mimeType)}`;
    const uploaded = await supabase.storage.from(bucket).upload(storagePath,bytes,{contentType:mimeType,upsert:false});
    if (uploaded.error) return failure("storage_upload_failed","That upload was not confirmed. Retry the same selected file.",502,true,true);
    const rejected = await register(supabase,auth.user.id,uploadId,bucket,storagePath); if (rejected) return rejected;
    return json({ok:true,storagePath,kind});
  } catch { return failure("upload_unavailable","The upload was not confirmed. Retry this same file.",503,true,true); }
}
export async function DELETE(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return failure("service_unavailable","Profile uploads are temporarily unavailable.",503,true);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return failure("auth_required","Sign in required.",401);
  const input = await boundedBody(request,MAX_PROFILE_UPLOAD_CONTROL_BYTES);
  if (input.tooLarge) return failure("invalid_cleanup","Upload cleanup was rejected.",400);
  const body = input.body, uploadId = cleanProfileUploadId(body?.uploadId);
  const targetGuitarId = body?.targetGuitarId === undefined ? "" : cleanProfileFileId(body.targetGuitarId);
  const paths = Array.isArray(body?.paths) ? body.paths : [];
  if (!uploadId || (body?.targetGuitarId !== undefined && !targetGuitarId) || !Array.isArray(body?.paths) || paths.length > 30 || paths.some(path=>typeof path !== "string")) return failure("invalid_cleanup","Upload cleanup was rejected.",400);
  const mediaPaths = (paths as string[]).filter(path=>isOwnedStagedPath(path,auth.user!.id,uploadId,"image",targetGuitarId));
  const documentPaths = (paths as string[]).filter(path=>isOwnedStagedPath(path,auth.user!.id,uploadId,"document",targetGuitarId));
  if (mediaPaths.length+documentPaths.length !== paths.length) return failure("invalid_cleanup","Upload cleanup was rejected.",400);
  const cleaned = await removeUnreferencedStagedUploads(supabase,auth.user.id,uploadId,mediaPaths,documentPaths,targetGuitarId);
  return cleaned ? json({ok:true}) : failure("cleanup_failed","Some staged files could not be removed. Your saved Profiles are unchanged.",502,true,true);
}
