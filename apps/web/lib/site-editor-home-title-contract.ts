// Fixed, human-reviewed correction. This is not an arbitrary CMS patch API.
export const HOME_TITLE_KEY = "seo.home.title";
export const HOME_TITLE_PRIOR = "QRguitar | Permanent Instrument Profiles";
export const HOME_TITLE_TARGET = "Permanent Instrument Profiles | QRguitar";
export const HOME_TITLE_SOURCE = "home-title-correction-v1";
export type HomeTitleRawState = {
  publishedValue: unknown; publishedVersion: string; publishedAt?: string;
  draftValue: unknown; draftVersion: string; draftUpdatedAt?: string;
  [key: string]: unknown;
};
export type HomeTitlePreflight = HomeTitleRawState & {
  editorActorId: string; field: typeof HOME_TITLE_KEY; before: string | null;
  after: typeof HOME_TITLE_TARGET; eligible: boolean; reason: string;
  publishedHash: string; errors?: Record<string, string>;
};
export type HomeTitleRequest = {
  operation: "correct"; field: typeof HOME_TITLE_KEY; value: typeof HOME_TITLE_TARGET;
  expectedValue: typeof HOME_TITLE_PRIOR; expectedActorId: string; requestId: string;
  expectedPublishedVersion: string; expectedDraftVersion: "";
};
export class HomeTitleError extends Error {
  constructor(message: string, public status = 400, public code = "home_title_invalid", public errors?: Record<string, string>) { super(message); }
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function readHomeTitleRequest(body: unknown, actorId: string): HomeTitleRequest {
  if (!isObject(body)) throw new HomeTitleError("Invalid title correction request.");
  const allowed = new Set(["operation", "field", "value", "expectedValue", "expectedActorId", "requestId", "expectedPublishedVersion", "expectedDraftVersion"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new HomeTitleError("Only the fixed homepage title correction is supported.");
  if (["expectedActorId", "requestId", "expectedPublishedVersion", "expectedDraftVersion"].some((key) => !Object.hasOwn(body, key))) {
    throw new HomeTitleError("Review the current actor and both revisions before sending a correction.", 428, "home_title_preconditions_required");
  }
  if (body.expectedActorId !== actorId) throw new HomeTitleError("The signed-in editor changed. Return to the original admin account.", 403, "QSE05");
  if (!isUuid(body.requestId) || !isUuid(body.expectedPublishedVersion) || typeof body.expectedDraftVersion !== "string") throw new HomeTitleError("Valid revision and request identifiers are required.");
  if (body.expectedDraftVersion !== "") throw new HomeTitleError("A shared draft must not be published or discarded by this tool.", 409, "QSE01");
  if (body.operation !== "correct" || body.field !== HOME_TITLE_KEY || body.value !== HOME_TITLE_TARGET || body.expectedValue !== HOME_TITLE_PRIOR) {
    throw new HomeTitleError("Only the exact reviewed old and new homepage title are supported.");
  }
  return body as HomeTitleRequest;
}
