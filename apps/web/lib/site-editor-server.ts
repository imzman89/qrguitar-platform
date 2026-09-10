import { mergeSiteSettings, type EditableSiteSettings } from "./site-settings";

type DraftValue = { settings?: Partial<EditableSiteSettings>; basePublishedAt?: string; updatedAt?: string; updatedBy?: string; note?: string; area?: string; changedFields?: string[]; publishedAt?: string; publishedBy?: string };
export type RawEditorState = { publishedValue?: Partial<EditableSiteSettings> | null; publishedAt?: string; publishedVersion: string; draftValue?: DraftValue | null; draftUpdatedAt?: string; draftVersion: string; revisionRows?: Array<{ content_key: string; content_value: DraftValue; updated_at: string | null }> };
export function mapEditorState(raw: RawEditorState) {
  if (!raw || typeof raw.publishedVersion !== "string" || typeof raw.draftVersion !== "string") throw new Error("Incomplete editor snapshot.");
  const draft = raw.draftValue;
  return {
    published: mergeSiteSettings(raw.publishedValue), publishedAt: raw.publishedAt || "",
    publishedVersion: raw.publishedVersion, draftVersion: raw.draftVersion,
    draft: draft?.settings ? mergeSiteSettings(draft.settings) : null,
    draftMeta: draft ? { basePublishedAt: draft.basePublishedAt || "", updatedAt: raw.draftUpdatedAt || draft.updatedAt || "", updatedBy: draft.updatedBy || "Authorized admin", note: draft.note || "", area: draft.area || "All content", changedFields: Array.isArray(draft.changedFields) ? draft.changedFields : [] } : null,
    revisions: (raw.revisionRows || []).map((row) => ({ id: row.content_key, updatedAt: row.updated_at || row.content_value.publishedAt || "", publishedAt: row.content_value.publishedAt || row.updated_at || "", publishedBy: row.content_value.publishedBy || "Authorized admin", note: row.content_value.note || "Published site settings", area: row.content_value.area || "All content", changedFields: Array.isArray(row.content_value.changedFields) ? row.content_value.changedFields : [] }))
  };
}
export function editorFailure(code?: string) {
  if (code === "QSE01" || code === "QSE02") return { status: 409, body: { ok: false, conflict: true, uncertain: false, code, message: code === "QSE01" ? "Site content changed in another session. Export your local changes and reload before editing." : "This request ID belongs to a different change. Reload before editing." } };
  if (code === "QSE03") return { status: 400, body: { ok: false, uncertain: false, code, message: "A valid versioned editor request is required." } };
  if (code === "QSE04") return { status: 404, body: { ok: false, uncertain: false, code, message: "That revision is unavailable." } };
  if (code === "QSE05") return { status: 403, body: { ok: false, uncertain: false, code, message: "Your editor access changed. Sign in again." } };
  // A transport, gateway or unrecognized backend failure can hide a committed transaction.
  return { status: 503, body: { ok: false, uncertain: true, retryable: true, code: "editor_outcome_unknown", message: "The result could not be confirmed. Retry the same request before making another change." } };
}
export async function finishEditorCommit<T>(result: T, invalidate: () => void | Promise<void>) {
  try { await invalidate(); return { result, warning: "" }; }
  catch { return { result, warning: "Saved successfully. Some cached pages may take a moment to refresh." }; }
}
