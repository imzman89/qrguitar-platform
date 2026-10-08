export type SafetyContent = { safetyStatus?: unknown; publicSafetyNote?: unknown; safetyNote?: unknown };
const text = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
export function safetyContent(value: SafetyContent) {
  return { safetyStatus: text(value.safetyStatus, 20).toLowerCase() || "clear", publicSafetyNote: text(value.publicSafetyNote, 1000), safetyNote: text(value.safetyNote, 2000) };
}
export function isSafetyContentUnchanged(before: SafetyContent, after: SafetyContent) {
  const a = safetyContent(before), b = safetyContent(after);
  return a.safetyStatus === b.safetyStatus && a.publicSafetyNote === b.publicSafetyNote && a.safetyNote === b.safetyNote;
}
export function existingProfileSpecId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
}
