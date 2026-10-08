import { createHash } from "node:crypto";
import { approvedCopyAllowlistSha256, approvedCopyPairs, type CopySelector } from "./site-copy-reconciliation-pairs";
import type { RawEditorState } from "./site-editor-server";

export const localCopyReconciliationSource = "local_exact_copy_reconciliation_v1";
export const acceptedCopyPracticeOrigin = "https://localhost:55440";
export class CopyReconciliationError extends Error {}
type RawSettings = Record<string, unknown> & { content: Record<string, unknown> };
type TrustedReceipt = { request_body: Record<string, unknown>; result: { before?: unknown; state?: RawEditorState } };
type Ports = { readReceipt: (requestId: string) => Promise<TrustedReceipt | null>; readRawState: () => Promise<RawEditorState> };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function requireCopy(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CopyReconciliationError(message);
}
export function allowLocalCopyReconciliation(request: Request, environment: Record<string, string | undefined>) {
  return environment.QRG_LOCAL_COPY_RECONCILIATION === "1"
    && environment.QRG_LOCAL_PRACTICE_ORIGIN === acceptedCopyPracticeOrigin
    && new URL(request.url).origin === acceptedCopyPracticeOrigin
    && request.headers.get("origin") === acceptedCopyPracticeOrigin;
}
export function canonicalRawCopy(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { requireCopy(Number.isFinite(value), "Invalid raw content value."); return JSON.stringify(value); }
  requireCopy(value && typeof value === "object", "Invalid raw content value.");
  if (Array.isArray(value)) return `[${value.map(canonicalRawCopy).join(",")}]`;
  requireCopy([Object.prototype, null].includes(Object.getPrototypeOf(value)), "Invalid raw content object.");
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => {
    requireCopy(!["__proto__", "constructor", "prototype"].includes(key), "Unsupported raw content key.");
    return `${JSON.stringify(key)}:${canonicalRawCopy(object[key])}`;
  }).join(",")}}`;
}
export const rawCopySha256 = (value: unknown) => createHash("sha256").update(canonicalRawCopy(value)).digest("hex");
function settingsObject(value: unknown): RawSettings {
  canonicalRawCopy(value);
  requireCopy(value && typeof value === "object" && !Array.isArray(value), "Saved raw content is required.");
  const settings = value as RawSettings;
  requireCopy(settings.content && typeof settings.content === "object" && !Array.isArray(settings.content), "A raw content object is required; do not import defaults.");
  return settings;
}
function locate(settings: RawSettings, selector: CopySelector): { parent: Record<string, unknown>; key: string } | null {
  if (selector.kind === "content") return own(settings.content, selector.key) ? { parent: settings.content, key: selector.key } : null;
  const composition = settings.composition as Record<string, { sections?: Array<Record<string, unknown>> }> | undefined;
  const sections = composition?.[selector.page]?.sections;
  if (sections === undefined) return null;
  requireCopy(Array.isArray(sections), "Invalid saved editorial structure.");
  requireCopy(new Set(sections.map(section => section?.id)).size === sections.length, "Ambiguous saved section IDs.");
  const section = sections.find(section => section?.id === selector.sectionId);
  if (!section) return null;
  const blocks = section.blocks as Array<Record<string, unknown>>;
  requireCopy(Array.isArray(blocks), "Invalid saved block structure.");
  requireCopy(new Set(blocks.map(block => block?.id)).size === blocks.length, "Ambiguous saved block IDs.");
  const block = blocks.find(block => block?.id === selector.blockId);
  if (!block || !own(block, selector.field)) return null;
  if (selector.index === undefined) return { parent: block, key: selector.field };
  const items = block[selector.field];
  requireCopy(Array.isArray(items), "Invalid saved editorial items.");
  const key = String(selector.index);
  return own(items, key) ? { parent: items as unknown as Record<string, unknown>, key } : null;
}
export function buildApprovedRawCopyCandidate(raw: unknown) {
  const before = settingsObject(raw);
  const candidate = JSON.parse(JSON.stringify(before)) as RawSettings;
  const changedIds: string[] = [];
  for (const pair of approvedCopyPairs) {
    const target = locate(candidate, pair.selector);
    if (!target || target.parent[target.key] !== pair.beforeDefault) continue;
    target.parent[target.key] = pair.afterDefault;
    changedIds.push(pair.id);
  }
  return { candidate, changedIds };
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export async function prepareLocalCopyMutation(body: Record<string, unknown>, ports: Ports): Promise<{ rawSettings: RawSettings | null; receiptOrConflictOnly: boolean }> {
  requireCopy(body.source === localCopyReconciliationSource && uuid(body.requestId), "Invalid local copy request.");
  // Receipt replay is authoritative in SQL. Do not inspect or recompute newer state first.
  const previous = await ports.readReceipt(body.requestId);
  if (previous) return { rawSettings: null, receiptOrConflictOnly: true };
  requireCopy(body.action === "publish" && body.expectedDraftVersion === "" && body.allowlistSha256 === approvedCopyAllowlistSha256,
    "This operation requires the exact reviewed copy allowlist and no shared draft.");
  requireCopy(body.copyDirection === "apply" || body.copyDirection === "rollback", "Select the reviewed copy operation.");
  const state = await ports.readRawState();
  if (body.expectedPublishedVersion !== state.publishedVersion || body.expectedDraftVersion !== state.draftVersion) {
    // A concurrent receipt may now exist. The atomic RPC resolves replay or conflict; null cannot authorize a new write.
    return { rawSettings: null, receiptOrConflictOnly: true };
  }
  requireCopy(state.draftValue === null && state.draftVersion === "", "Preserve the shared draft before updating copy.");
  const current = settingsObject(state.publishedValue);
  requireCopy(body.beforePublishedSha256 === rawCopySha256(current), "Raw saved content changed; reload the exact preimage.");
  let candidate: RawSettings;
  if (body.copyDirection === "apply") {
    const prepared = buildApprovedRawCopyCandidate(current);
    requireCopy(prepared.changedIds.length > 0, "No exact default copy needs updating.");
    candidate = prepared.candidate;
  } else {
    requireCopy(uuid(body.appliedRequestId) && body.appliedRequestId !== body.requestId, "A trusted original copy receipt is required.");
    const applied = await ports.readReceipt(body.appliedRequestId);
    requireCopy(applied?.request_body.source === localCopyReconciliationSource && applied.request_body.copyDirection === "apply"
      && applied.request_body.allowlistSha256 === approvedCopyAllowlistSha256, "The original copy receipt is unavailable.");
    const original = settingsObject(applied.result.before);
    const prepared = buildApprovedRawCopyCandidate(original);
    requireCopy(prepared.changedIds.length > 0 && canonicalRawCopy(prepared.candidate) === canonicalRawCopy(applied.result.state?.publishedValue)
      && canonicalRawCopy(prepared.candidate) === canonicalRawCopy(applied.request_body.settings), "The original receipt is not an exact approved copy update.");
    requireCopy(state.publishedVersion === applied.result.state?.publishedVersion && canonicalRawCopy(current) === canonicalRawCopy(prepared.candidate),
      "Newer saved content prevents rollback.");
    candidate = JSON.parse(JSON.stringify(current)) as RawSettings;
    for (const pair of approvedCopyPairs.filter(pair => prepared.changedIds.includes(pair.id))) {
      const target = locate(candidate, pair.selector);
      requireCopy(target && target.parent[target.key] === pair.afterDefault, "The exact rollback after-value changed.");
      target.parent[target.key] = pair.beforeDefault;
    }
    requireCopy(canonicalRawCopy(candidate) === canonicalRawCopy(original), "Rollback would change unrelated content.");
  }
  requireCopy(canonicalRawCopy(body.settings) === canonicalRawCopy(candidate), "Only the exact server-derived copy changes are allowed.");
  return { rawSettings: candidate, receiptOrConflictOnly: false };
}
