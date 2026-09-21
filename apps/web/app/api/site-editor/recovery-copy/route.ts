import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getAdminContext, readAdminEmailList } from "../../../../lib/admin-auth";
import { createServerSupabaseClientWithTimeout } from "../../../../lib/supabase-server";
import { editorFailure, finishEditorCommit } from "../../../../lib/site-editor-server";
import { isJsonObject, prepareRecoveryCopySettings, readRecoveryCopyRequest, recoveryCopyPreflight, recoveryRollbackValue,
  RECOVERY_COPY_KEY, RECOVERY_COPY_SOURCE, RECOVERY_COPY_VALUE, RecoveryCopyError, type RecoveryRawState } from "../../../../lib/site-editor-recovery-copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const snapshotHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Client = NonNullable<ReturnType<typeof createServerSupabaseClientWithTimeout>>;
async function readRaw(client: Client) {
  const result = await client.rpc("read_site_editor_state");
  if (result.error || !isJsonObject(result.data)) throw new RecoveryCopyError("Could not read authoritative content. Retry when the connection is available.", 503);
  return result.data as RecoveryRawState;
}
async function rollbackTarget(client: Client, actorId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RecoveryCopyError("Select a valid correction record.");
  const receipt = await client.from("site_editor_receipts").select("request_body,result")
    .eq("actor_user_id", actorId).eq("request_id", id).maybeSingle();
  if (receipt.error) throw new RecoveryCopyError("Could not read the restoration record.", 503);
  return recoveryRollbackValue(receipt.data, id);
}
function fail(error: unknown, sent = false) {
  if (error instanceof RecoveryCopyError) return json({ ok: false, uncertain: false, conflict: error.status === 409, code: error.code, message: error.message }, error.status);
  const failure = sent ? editorFailure() : { status: 503, body: { ok: false, uncertain: false, message: "Could not prepare the correction. No request was sent." } };
  return json(failure.body, failure.status);
}

export async function GET(request: Request) {
  noStore();
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, uncertain: false, message: admin.message }, admin.status);
  const client = createServerSupabaseClientWithTimeout(15000);
  if (!client) return json({ ok: false, uncertain: false, message: "Site content storage is unavailable." }, 503);
  try {
    const restore = new URL(request.url).searchParams.get("restore") || undefined;
    const target = restore ? await rollbackTarget(client, admin.user!.id, restore) : RECOVERY_COPY_VALUE;
    const preflight = recoveryCopyPreflight(await readRaw(client), admin.user!.id, target, restore);
    return json({ ok: true, preflight: { ...preflight, publishedHash: snapshotHash(preflight.publishedValue) } });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  noStore();
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, uncertain: false, message: admin.message }, admin.status);
  const client = createServerSupabaseClientWithTimeout(15000);
  if (!client) return json({ ok: false, uncertain: false, message: "Site content storage is unavailable." }, 503);
  let sent = false;
  try {
    let body: unknown;
    try { body = await request.json(); } catch { throw new RecoveryCopyError("Invalid recovery-copy request."); }
    const input = readRecoveryCopyRequest(body, admin.user!.id);
    const target = input.operation === "restore" ? await rollbackTarget(client, admin.user!.id, input.priorRequestId!) : RECOVERY_COPY_VALUE;
    if (input.value !== target) throw new RecoveryCopyError("The requested introduction does not match the approved correction or recorded rollback.");
    const raw = await readRaw(client);
    const settings = prepareRecoveryCopySettings(raw, input, target);
    const mutationRequest = { ...input, action: "publish", source: RECOVERY_COPY_SOURCE, area: "Reset Password", note: input.operation === "correct" ? "Correct only the secure-link recovery introduction." : "Restore only the recorded recovery introduction." };
    sent = true;
    const mutation = await client.rpc("mutate_site_editor", {
      p_actor_id: admin.user!.id, p_actor_email: admin.email, p_env_authorized: readAdminEmailList().includes(admin.email),
      p_request: mutationRequest, p_settings: settings, p_defaults: {}, p_revision_value: null
    });
    if (mutation.error) { const failure = editorFailure(mutation.error.code); return json(failure.body, failure.status); }
    const result = mutation.data as { state: RecoveryRawState; before: unknown; changedFields: string[]; requestId: string; replayed?: boolean; superseded?: boolean };
    if (!result || result.requestId !== input.requestId || !result.state || typeof result.state.publishedVersion !== "string" || typeof result.state.draftVersion !== "string") throw new Error("Incomplete mutation receipt.");
    const completion = await finishEditorCommit(result, () => {
      revalidatePath("/api/site-settings"); revalidatePath("/reset-password"); revalidatePath("/", "layout");
    });
    let independentlyVerified = false;
    try {
      const current = await readRaw(client);
      independentlyVerified = current.publishedVersion === result.state.publishedVersion && current.draftVersion === result.state.draftVersion
        && JSON.stringify(current.publishedValue) === JSON.stringify(result.state.publishedValue);
    } catch { /* The receipt remains committed; UI can retry its independent read. */ }
    return json({ ok: true, committed: true, requestId: result.requestId, replayed: result.replayed, superseded: result.superseded,
      publishedVersion: result.state.publishedVersion, draftVersion: result.state.draftVersion, editorActorId: admin.user!.id,
      message: completion.warning || (independentlyVerified ? "The single introduction change is saved and independently verified." : "The change is saved. Reload the current content to verify the latest published state."),
      independentlyVerified, record: { schema: RECOVERY_COPY_SOURCE, field: RECOVERY_COPY_KEY, operation: input.operation, requestId: result.requestId,
        publishedVersionBefore: input.expectedPublishedVersion, publishedVersionAfter: result.state.publishedVersion,
        draftVersionBefore: input.expectedDraftVersion, draftVersionAfter: result.state.draftVersion,
        before: result.before, after: result.state.publishedValue, beforeHash: snapshotHash(result.before), afterHash: snapshotHash(result.state.publishedValue), changedFields: result.changedFields }
    });
  } catch (error) { return fail(error, sent); }
}
