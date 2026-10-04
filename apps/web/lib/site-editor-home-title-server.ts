import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { contentRegistry, validateContentValues, validateProtectedContentValues } from "./content-registry";
import { mergeSiteSettings, validateBrandLogoEntries, validateEditorialComposition, validateSiteThemeContrast, type EditableSiteSettings } from "./site-settings";
import { HOME_TITLE_KEY, HOME_TITLE_PRIOR, HOME_TITLE_TARGET, HomeTitleError, isObject, isUuid, type HomeTitlePreflight, type HomeTitleRawState, type HomeTitleRequest } from "./site-editor-home-title-contract";

// Hash canonical JSON, not a normalized settings projection. Object order is not content.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export const rawSnapshotHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function assertRawTitleChange(before: unknown, after: unknown) {
  if (!isObject(before) || !isObject(before.content) || !isObject(after) || !isObject(after.content)
    || before.content[HOME_TITLE_KEY] !== HOME_TITLE_PRIOR || after.content[HOME_TITLE_KEY] !== HOME_TITLE_TARGET
    || !isDeepStrictEqual(before, { ...after, content: { ...after.content, [HOME_TITLE_KEY]: before.content[HOME_TITLE_KEY] } })) {
    throw new HomeTitleError("The correction must preserve every other raw field and omission.");
  }
}
function validateEffective(after: EditableSiteSettings, rawAfter: Record<string, unknown>, before: EditableSiteSettings) {
  // Same publishing checks as the normal editor, but no validated/normalized object is persisted.
  const errors = {
    ...validateBrandLogoEntries(rawAfter.brandLogos), ...validateContentValues(after.content),
    ...validateProtectedContentValues(after.content, before.content),
    ...validateEditorialComposition(after.composition), ...validateSiteThemeContrast(after.colors)
  };
  for (const [key, value] of Object.entries(after.colors)) if (!/^#[0-9a-f]{6}$/i.test(value)) errors[`colors.${key}`] = "Use a six-digit hex color.";
  if (!after.brandName.trim()) errors.brandName = "Brand name is required.";
  try {
    const url = new URL(after.seo.canonicalUrl);
    if (url.protocol !== "https:" || url.hostname !== "www.qrguitar.com" || url.username || url.password) errors["seo.canonicalUrl"] = "Use the canonical QRguitar HTTPS origin.";
  } catch { errors["seo.canonicalUrl"] = "Enter a valid canonical URL."; }
  return errors;
}
function patchValidated(raw: HomeTitleRawState) {
  if (!isObject(raw.publishedValue) || !isObject(raw.publishedValue.content) || raw.publishedValue.content[HOME_TITLE_KEY] !== HOME_TITLE_PRIOR) {
    throw new HomeTitleError("The saved title no longer matches the reviewed prior title.", 409, "QSE01");
  }
  const entry = contentRegistry.find((item) => item.key === HOME_TITLE_KEY);
  if (!entry || entry.classification !== "editable-standard" || HOME_TITLE_TARGET.length > entry.maxLength || !HOME_TITLE_TARGET.trim()) {
    throw new HomeTitleError("The approved title does not pass the registered field constraints.");
  }
  const patched = { ...raw.publishedValue, content: { ...raw.publishedValue.content, [HOME_TITLE_KEY]: HOME_TITLE_TARGET } };
  assertRawTitleChange(raw.publishedValue, patched);
  const before = mergeSiteSettings(raw.publishedValue as Partial<EditableSiteSettings>);
  const effective = mergeSiteSettings(patched as Partial<EditableSiteSettings>);
  const errors = validateEffective(effective, patched, before);
  if (effective.content[HOME_TITLE_KEY] !== HOME_TITLE_TARGET) errors[HOME_TITLE_KEY] = "The effective title must exactly match the approved title.";
  if (Object.keys(errors).length) throw new HomeTitleError("Effective publishing validation failed. No unrelated content will be repaired by this tool.", 400, "home_title_validation", errors);
  return patched;
}
export function homeTitlePreflight(raw: HomeTitleRawState, actorId: string): HomeTitlePreflight {
  const before = isObject(raw.publishedValue) && isObject(raw.publishedValue.content) && typeof raw.publishedValue.content[HOME_TITLE_KEY] === "string" ? raw.publishedValue.content[HOME_TITLE_KEY] as string : null;
  let reason = "", errors: Record<string, string> | undefined;
  if (!isUuid(raw.publishedVersion) || !isObject(raw.publishedValue)) reason = "Authoritative published content or revision is unavailable.";
  else if (raw.draftValue !== null || raw.draftVersion !== "") reason = "A shared draft exists. This correction will not publish or discard it.";
  else if (before === HOME_TITLE_TARGET) reason = "The approved title is already published. No change is needed.";
  else if (before !== HOME_TITLE_PRIOR) reason = "The saved title is not the exact human-reviewed prior title.";
  else {
    try { patchValidated(raw); }
    catch (error) {
      if (!(error instanceof HomeTitleError)) throw error;
      reason = error.message; errors = error.errors;
    }
  }
  return { ...raw, editorActorId: actorId, field: HOME_TITLE_KEY, before, after: HOME_TITLE_TARGET, eligible: !reason, reason, publishedHash: rawSnapshotHash(raw.publishedValue), ...(errors ? { errors } : {}) };
}
export function prepareHomeTitleSettings(raw: HomeTitleRawState, input: HomeTitleRequest) {
  // Receipt-first RPC MUST see stale requests: they may have committed before a lost response.
  // With no receipt, stale versions reject before null settings could be used.
  if (raw.publishedVersion !== input.expectedPublishedVersion || raw.draftVersion !== input.expectedDraftVersion) return null;
  if (raw.draftValue !== null || raw.draftVersion !== "") throw new HomeTitleError("A shared draft exists. Nothing was discarded or published.", 409, "QSE01");
  return patchValidated(raw);
}
