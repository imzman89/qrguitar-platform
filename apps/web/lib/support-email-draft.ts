export const supportEmailAddress = "support@qrguitar.com";
export const supportDraftLimits = { name: 100, email: 254, topic: 160, message: 1600 } as const;
// Long mailto URLs are not portable. Keep the full text available for manual copy.
export const mailtoLengthLimit = 1800;

export type SupportEmailFields = { name: string; email: string; topic: string; message: string };
export type SupportEmailLabels = { subject: string; name: string; email: string; topic: string; message: string };
export type EmailDraft = { body: string; href: string | null };
export type SupportEmailResult = { ok: true; draft: EmailDraft } | { ok: false; error: "required" | "invalidEmail" | "tooLong" };

function encode(value: string) {
  // A partial Unicode character pasted into a field must not crash preparation.
  return encodeURIComponent(value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD"));
}

export function buildEmailDraft(subject: string, body: string): EmailDraft {
  const singleLineSubject = subject.replace(/[\r\n]+/g, " ").trim();
  const href = `mailto:${supportEmailAddress}?subject=${encode(singleLineSubject)}&body=${encode(body)}`;
  return { body, href: href.length <= mailtoLengthLimit ? href : null };
}

export function buildSupportEmailDraft(fields: SupportEmailFields, labels: SupportEmailLabels): SupportEmailResult {
  const values = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()])) as SupportEmailFields;
  if (Object.values(values).some(value => !value)) return { ok: false, error: "required" };
  if ((Object.keys(supportDraftLimits) as Array<keyof SupportEmailFields>).some(key => fields[key].length > supportDraftLimits[key])) {
    return { ok: false, error: "tooLong" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { ok: false, error: "invalidEmail" };
  return { ok: true, draft: buildEmailDraft(`${labels.subject}: ${values.topic}`, [
    `${labels.name}: ${values.name}`, `${labels.email}: ${values.email}`, `${labels.topic}: ${values.topic}`,
    "", `${labels.message}:`, values.message
  ].join("\n")) };
}

export function buildInstallerEmailDraft(subject: string, requirements: readonly string[], guidance: string): EmailDraft {
  return buildEmailDraft(subject, `${requirements.map(requirement => `${requirement}: `).join("\n\n")}\n\n${guidance}`);
}
