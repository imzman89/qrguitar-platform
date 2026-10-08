import { createHash } from "node:crypto";
import { supportDraftLimits, supportEmailAddress, type SupportEmailFields } from "./support-email-draft";
import { renderBrandedTransactionalEmail, type TransactionalEmailDocument } from "./transactional-email-renderer";
import type { EmailResult } from "./transactional-email";
import { confirmedEmailAcceptance } from "./email-acceptance";
import { readBoundedJsonBody } from "./bounded-json-body";

type ContactInput = SupportEmailFields & { website: string; idempotencyKey: string };
type Dependencies = { deliver(to: string, document: TransactionalEmailDocument, options: { successMessage: string; failureMessage: string; idempotencyKey: string; signal: AbortSignal }): Promise<EmailResult>; now?: () => number; bodyTimeoutMs?: number };
type PublicResult = { ok: boolean; code: string; outcome: "accepted" | "rejected" | "unknown"; requestId?: string };
class ContactError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodyLimit = 12_000;
const hour = 3_600_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (result: PublicResult, status: number, retryAfter?: number) => Response.json(result, { status, headers: { ...headers, ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });

async function readBody(request: Request, timeoutMs: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > bodyLimit)) throw new ContactError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new ContactError(400, "invalid_body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new ContactError(408, "body_timeout")); }, timeoutMs); });
  try {
    // Wrap the existing actual-byte-limited reader with one total body-read deadline.
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const part = await Promise.race([reader.read(), timeout]); if (part.done) controller.close(); else controller.enqueue(part.value); }
        catch (error) { controller.error(error); }
      },
      cancel() { return reader.cancel(); }
    });
    const wrapped = new Request(request.url, { method: "POST", headers: request.headers, body: stream, duplex: "half" } as RequestInit & { duplex: "half" });
    const result = await readBoundedJsonBody(wrapped, bodyLimit);
    if (timedOut) throw new ContactError(408, "body_timeout");
    if (!result.ok) throw new ContactError(result.reason === "too_large" ? 413 : 400, result.reason === "too_large" ? "body_too_large" : "invalid_body");
    return result.body;
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

function validate(value: unknown): ContactInput {
  const keys = ["name", "email", "topic", "message", "website", "idempotencyKey"] as const;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key) || typeof (value as Record<string, unknown>)[key] !== "string")) throw new ContactError(400, "invalid_fields");
  const input = value as ContactInput;
  if (input.website !== "") throw new ContactError(400, "request_rejected");
  if (!uuid.test(input.idempotencyKey)) throw new ContactError(400, "invalid_reference");
  for (const key of Object.keys(supportDraftLimits) as Array<keyof SupportEmailFields>) {
    if (!input[key].trim() || input[key].length > supportDraftLimits[key]) throw new ContactError(400, "invalid_fields");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || /[\r\n\u0000-\u001f\u007f]/.test(input.name + input.topic)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.message)) throw new ContactError(400, "invalid_fields");
  return { ...input, name: input.name.trim(), email: input.email.trim(), topic: input.topic.trim(), message: input.message.trim(), idempotencyKey: input.idempotencyKey.toLowerCase() };
}

// NextURL normalizes 127.0.0.1/[::1] to localhost. Restore only that exact
// authority when the browser Origin and raw Host agree; forwarded headers are not proof.
function contactOriginAllowed(request: Request) {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin" && site !== "none")) return false;
  const target = new URL(request.url);
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  if (origin === target.origin) return true;
  try {
    const source = new URL(origin);
    return source.origin === origin && target.hostname === "localhost"
      && (source.hostname === "127.0.0.1" || source.hostname === "[::1]")
      && source.protocol === target.protocol && source.port === target.port
      && request.headers.get("host") === source.host;
  } catch { return false; }
}

/** Instance-local abuse limits and receipt cache are bounded; not a distributed quota or durable inbox. */
export function createContactSupportHandler(dependencies: Dependencies) {
  const now = dependencies.now || Date.now;
  let windowEnds = 0, total = 0;
  const counts = new Map<string, number>();
  const attempts = new Map<string, { fingerprint: string; expires: number; response: Promise<{ result: PublicResult; status: number }> }>();
  return async (request: Request) => {
    try {
      if (request.method !== "POST") throw new ContactError(405, "method_not_allowed");
      if (!contactOriginAllowed(request)) throw new ContactError(403, "origin_not_allowed");
      if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
        || ![null, "identity"].includes(request.headers.get("content-encoding"))) throw new ContactError(415, "invalid_content_type");
      const input = validate(await readBody(request, dependencies.bodyTimeoutMs || 8_000));
      if (request.signal.aborted) throw new ContactError(408, "request_aborted");
      const currentTime = now();
      for (const [key, attempt] of attempts) if (attempt.expires <= currentTime) attempts.delete(key);
      if (currentTime >= windowEnds) { windowEnds = currentTime + hour; total = 0; counts.clear(); }
      const fingerprint = digest(JSON.stringify([input.name, input.email, input.topic, input.message]));
      const prior = attempts.get(input.idempotencyKey);
      if (prior && prior.fingerprint !== fingerprint) throw new ContactError(409, "reference_conflict");
      if (prior) { const receipt = await prior.response; return json(receipt.result, receipt.status); }
      const emailKey = digest(input.email.toLowerCase());
      if (total >= 20 || (counts.get(emailKey) || 0) >= 3 || attempts.size >= 200) return json({ ok: false, code: "rate_limited", outcome: "rejected" }, 429, Math.max(1, Math.ceil((windowEnds - currentTime) / 1000)));
      const body = `Name: ${input.name}\nContact email: ${input.email}\nTopic: ${input.topic}\n\nMessage:\n${input.message}`;
      // Existing renderer bounds body at 2400: reject rather than silently truncate a contact request.
      if (body.length > 2400) throw new ContactError(400, "invalid_fields");
      const document = renderBrandedTransactionalEmail({
        subject: "QRguitar website support request", preheader: "A visitor submitted a support request.", eyebrow: "Website contact",
        heading: "Support request", body, ctaLabel: "Open Contact", ctaUrl: "https://www.qrguitar.com/contact",
        notice: "Visitor-provided contact details are not verified account identity. Reply to the contact email in the message body; the gateway Reply-To is QRguitar's configured address.",
        footer: "QRguitar support", allowedCtaOrigins: ["https://www.qrguitar.com"]
      });
      total++; counts.set(emailKey, (counts.get(emailKey) || 0) + 1);
      const response = Promise.resolve().then(async () => {
        try {
          const result = await dependencies.deliver(supportEmailAddress, document, { successMessage: "Provider accepted contact request.", failureMessage: "Provider did not accept contact request", idempotencyKey: input.idempotencyKey, signal: request.signal });
          if (result.ok && result.status === "sent" && confirmedEmailAcceptance(result)) {
            return { status: 202, result: { ok: true, code: "provider_accepted", outcome: "accepted", requestId: input.idempotencyKey } as PublicResult };
          }
          if (result.outcome === "rejected") {
            const missingConfig = ["Zoho SMTP delivery is not configured for application messages.", "Email delivery configuration is invalid."].includes(result.message);
            return { status: missingConfig ? 503 : 502, result: { ok: false, code: missingConfig ? "delivery_unavailable" : "provider_rejected", outcome: "rejected", requestId: input.idempotencyKey } as PublicResult };
          }
        } catch { /* Provider may have accepted before a network/transport failure. */ }
        return { status: 502, result: { ok: false, code: "delivery_unconfirmed", outcome: "unknown", requestId: input.idempotencyKey } as PublicResult };
      });
      attempts.set(input.idempotencyKey, { fingerprint, expires: currentTime + hour, response });
      const receipt = await response;
      return json(receipt.result, receipt.status);
    } catch (error) {
      const boundary = error instanceof ContactError ? error : new ContactError(400, "invalid_body");
      return json({ ok: false, code: boundary.code, outcome: "rejected" }, boundary.status);
    }
  };
}
