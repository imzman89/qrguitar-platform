import { contentRegistryByKey, getContentValue, validateVariables } from "./content-registry";
import { renderBrandedTransactionalEmail, type TransactionalEmailDocument } from "./transactional-email-renderer";
import { loadPublishedSiteSettings } from "./site-settings-server";

export type EmailResult = {
  ok: boolean;
  status: "sent" | "failed";
  outcome: "accepted" | "rejected" | "unknown";
  message: string;
  providerMessageId?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
};

type DeliveryOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
  successMessage: string;
  failureMessage: string;
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_DELIVERY_TIMEOUT_MS = 10_000;

function cleanEmailAddress(value: string) {
  const address = String(value || "").replace(/^.*<([^>]+)>.*$/, "$1").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : "";
}

function senderAddress() {
  return cleanEmailAddress(process.env.SMTP_FROM || process.env.EMAIL_FROM || "");
}

function replyAddress() {
  return cleanEmailAddress(process.env.SMTP_REPLY_TO || "support@qrguitar.com");
}

function approvedApplicationOrigins() {
  return [process.env.NEXT_PUBLIC_SITE_URL || "", "https://www.qrguitar.com", "https://qrguitar.com"];
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export async function deliverBrevoEmail(
  to: string,
  document: TransactionalEmailDocument,
  options: DeliveryOptions
): Promise<EmailResult> {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) return { ok: false, status: "failed", outcome: "rejected", message: "Brevo delivery is not configured for application messages." };

  const recipient = cleanEmailAddress(to);
  const sender = senderAddress();
  const replyTo = replyAddress();
  if (!recipient || !sender || !replyTo) {
    return { ok: false, status: "failed", outcome: "rejected", message: "Email delivery configuration is invalid." };
  }
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return { ok: false, status: "failed", outcome: "rejected", message: "Email delivery idempotency key is invalid." };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs || DEFAULT_DELIVERY_TIMEOUT_MS));
  try {
    const response = await (options.fetcher || fetch)(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "QRguitar", email: sender },
        replyTo: { email: replyTo },
        to: [{ email: recipient }],
        subject: document.subject,
        htmlContent: document.htmlContent,
        textContent: document.textContent,
        ...(idempotencyKey ? { headers: { idempotencyKey } } : {})
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({})) as { messageId?: string };
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      return {
        ok: false,
        status: "failed",
        outcome: "rejected",
        message: `${options.failureMessage} (${response.status}).`,
        retryable,
        retryAfterSeconds: retryable ? retryAfterSeconds(response) : undefined
      };
    }
    if (!payload.messageId) {
      return { ok: false, status: "failed", outcome: "unknown", message: `${options.failureMessage} (provider receipt missing).`, retryable: false };
    }
    return { ok: true, status: "sent", outcome: "accepted", message: options.successMessage, providerMessageId: payload.messageId };
  } catch (error) {
    const suffix = error instanceof Error && error.name === "AbortError" ? " (delivery timed out)" : "";
    return { ok: false, status: "failed", outcome: "unknown", message: `${options.failureMessage}${suffix}.`, retryable: false };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function sendAdminTemplateTestEmail(input: {
  to: string;
  subject: string;
  preheader?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl: string;
  footer?: string;
}): Promise<EmailResult> {
  let document: TransactionalEmailDocument;
  try {
    document = renderBrandedTransactionalEmail({
      subject: `[TEST] ${input.subject}`,
      preheader: input.preheader || "QRguitar Content Studio test",
      eyebrow: "Content Studio delivery test",
      heading: input.heading,
      body: input.body,
      ctaLabel: input.ctaLabel || "Open QRguitar",
      ctaUrl: input.ctaUrl,
      notice: "This message tests the application-rendered service-review family. It does not prove inbox placement or configure provider-owned authentication templates.",
      footer: input.footer || "QRguitar · Permanent instrument identity and history",
      allowedCtaOrigins: approvedApplicationOrigins(),
      testRecipientNote: "Test recipient: authenticated QRguitar administrator."
    });
  } catch {
    return { ok: false, status: "failed", outcome: "rejected", message: "The test email contains an invalid or unsafe field." };
  }

  return deliverBrevoEmail(input.to, document, {
    successMessage: "Application-rendered test email accepted by the email provider for the authenticated admin.",
    failureMessage: "The application-rendered test email was not accepted by the email provider"
  });
}

export async function sendServiceReviewEmail(input: {
  to: string;
  profileTitle: string;
  providerName: string;
  reviewUrl: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<EmailResult> {
  const settings = await loadPublishedSiteSettings();
  const variables = {
    profile_title: input.profileTitle,
    profile_url: input.reviewUrl,
    provider_name: input.providerName || "A service provider",
    review_url: input.reviewUrl
  };
  const render = (suffix: string) => renderRegisteredTemplateValue(settings.content, `email.service.submitted.${suffix}`, variables);

  let document: TransactionalEmailDocument;
  try {
    document = renderBrandedTransactionalEmail({
      subject: render("subject"),
      preheader: render("preheader"),
      eyebrow: "Private owner review",
      heading: render("heading"),
      body: render("body"),
      ctaLabel: render("cta"),
      ctaUrl: input.reviewUrl,
      notice: "Nothing becomes part of the public Profile until you approve it. Supporting evidence stays private and is not attached to this email. This request expires 14 days after submission; resending does not extend that deadline. The link still requires the authorized owner account.",
      footer: render("footer"),
      allowedCtaOrigins: approvedApplicationOrigins()
    });
  } catch {
    return { ok: false, status: "failed", outcome: "rejected", message: "Owner notification created, but the email template or review link is invalid." };
  }

  const result = await deliverBrevoEmail(input.to, document, {
    successMessage: "Owner notification created; review email accepted by the email provider.",
    failureMessage: "Owner notification created, but email provider acceptance was not confirmed",
    idempotencyKey: input.idempotencyKey,
    signal: input.signal
  });
  if (!result.ok && result.message === "Brevo delivery is not configured for application messages.") {
    return { ...result, message: "Owner notification created, but email delivery is not configured for application messages." };
  }
  return result;
}

function renderRegisteredTemplateValue(content: Record<string, string>, key: string, variables: Record<string, string>) {
  const entry = contentRegistryByKey.get(key);
  if (!entry || entry.area !== "Emails") throw new Error(`Email template field is not registered: ${key}`);
  const value = getContentValue(content, key);
  const invalid = validateVariables(value, entry.allowedVariables || []);
  if (invalid) throw new Error(`Email template contains an unapproved variable: ${invalid}`);
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => variables[name] || "");
}
