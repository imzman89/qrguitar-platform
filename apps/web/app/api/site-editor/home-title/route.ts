import { NextResponse } from "next/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getAdminContext, readAdminEmailList } from "../../../../lib/admin-auth";
import { createServerSupabaseClientWithTimeout } from "../../../../lib/supabase-server";
import { editorFailure, finishEditorCommit } from "../../../../lib/site-editor-server";
import { HOME_TITLE_KEY, HOME_TITLE_SOURCE, HomeTitleError, isObject, readHomeTitleRequest, type HomeTitleRawState } from "../../../../lib/site-editor-home-title-contract";
import { assertRawTitleChange, homeTitlePreflight, prepareHomeTitleSettings, rawSnapshotHash } from "../../../../lib/site-editor-home-title-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
type Client = NonNullable<ReturnType<typeof createServerSupabaseClientWithTimeout>>;
async function readRaw(client: Client) {
  const result = await client.rpc("read_site_editor_state");
  if (result.error || !isObject(result.data) || typeof result.data.publishedVersion !== "string" || typeof result.data.draftVersion !== "string" || !Object.hasOwn(result.data, "draftValue") || !Object.hasOwn(result.data, "publishedValue")) {
    throw new HomeTitleError("Could not read authoritative published content and draft state.", 503, "home_title_read_unavailable");
  }
  return result.data as HomeTitleRawState;
}
function fail(error: unknown, sent = false) {
  // After sending, even an invalid receipt cannot prove that nothing committed.
  if (!sent && error instanceof HomeTitleError) return json({ ok: false, uncertain: false, conflict: error.status === 409, code: error.code, message: error.message, ...(error.errors ? { errors: error.errors } : {}) }, error.status);
  if (sent) { const failure = editorFailure(); return json(failure.body, failure.status); }
  return json({ ok: false, uncertain: false, message: "Could not prepare the correction. No mutation was sent." }, 503);
}
export async function GET(request: Request) {
  noStore();
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, uncertain: false, message: admin.message }, admin.status);
  const client = createServerSupabaseClientWithTimeout(15000);
  if (!client) return json({ ok: false, uncertain: false, message: "Site content storage is unavailable." }, 503);
  try { return json({ ok: true, preflight: homeTitlePreflight(await readRaw(client), admin.user!.id) }); }
  catch (error) { return fail(error); }
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
    try { body = await request.json(); } catch { throw new HomeTitleError("Invalid title correction JSON."); }
    const input = readHomeTitleRequest(body, admin.user!.id);
    const settings = prepareHomeTitleSettings(await readRaw(client), input);
    const mutationRequest = { ...input, action: "publish", source: HOME_TITLE_SOURCE, area: "Homepage search title", note: "Correct only the human-reviewed homepage search title." };
    sent = true;
    const mutation = await client.rpc("mutate_site_editor", {
      p_actor_id: admin.user!.id, p_actor_email: admin.email, p_env_authorized: readAdminEmailList().includes(admin.email),
      p_request: mutationRequest, p_settings: settings, p_defaults: {}, p_revision_value: null
    });
    if (mutation.error) { const failure = editorFailure(mutation.error.code); return json(failure.body, failure.status); }
    const result = mutation.data as { state: HomeTitleRawState; before: unknown; changedFields: string[]; requestId: string; replayed?: boolean; superseded?: boolean };
    if (!result || result.requestId !== input.requestId || !result.state || typeof result.state.publishedVersion !== "string" || result.state.draftVersion !== "" || result.state.draftValue !== null
      || !Array.isArray(result.changedFields) || result.changedFields.length !== 1 || result.changedFields[0] !== HOME_TITLE_KEY) throw new Error("Incomplete single-title mutation receipt.");
    assertRawTitleChange(result.before, result.state.publishedValue);
    const completion = await finishEditorCommit(result, () => {
      revalidatePath("/api/site-settings"); revalidatePath("/"); revalidatePath("/", "layout");
    });
    let independentlyVerified = false;
    try {
      const current = await readRaw(client);
      independentlyVerified = current.publishedVersion === result.state.publishedVersion && current.draftVersion === "" && current.draftValue === null
        && rawSnapshotHash(current.publishedValue) === rawSnapshotHash(result.state.publishedValue);
    } catch { /* A committed receipt remains committed if independent reread fails. */ }
    return json({ ok: true, committed: true, requestId: result.requestId, replayed: result.replayed, superseded: result.superseded,
      editorActorId: admin.user!.id, publishedVersion: result.state.publishedVersion, draftVersion: result.state.draftVersion, independentlyVerified,
      message: completion.warning || (independentlyVerified ? "Only the homepage title is saved and independently verified." : "The title correction is committed. Review current published state before another action."),
      record: { schema: HOME_TITLE_SOURCE, field: HOME_TITLE_KEY, requestId: result.requestId, actorId: admin.user!.id,
        publishedVersionBefore: input.expectedPublishedVersion, publishedVersionAfter: result.state.publishedVersion,
        draftVersionBefore: input.expectedDraftVersion, draftVersionAfter: result.state.draftVersion,
        before: result.before, after: result.state.publishedValue, beforeHash: rawSnapshotHash(result.before), afterHash: rawSnapshotHash(result.state.publishedValue), changedFields: result.changedFields }
    });
  } catch (error) { return fail(error, sent); }
}
