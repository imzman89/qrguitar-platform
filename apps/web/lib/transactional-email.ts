import { contentRegistryByKey, getContentValue, validateVariables } from "./content-registry";
import { renderBrandedTransactionalEmail, renderServiceReviewEmailDocument, type TransactionalEmailDocument } from "./transactional-email-renderer";
import { loadPublishedSiteSettings } from "./site-settings-server";
import type { RelayAcceptance } from "./email-acceptance";
import { deliverZohoSmtpEmail } from "./zoho-smtp-transport";

export type EmailResult = {
  ok: boolean;
  status: "sent" | "failed";
  outcome: "accepted" | "rejected" | "unknown";
  message: string;
  providerMessageId?: string;
  relayAcceptance?: RelayAcceptance;
  retryable?: boolean;
  retryAfterSeconds?: number;
};

type DeliveryOptions = {
  timeoutMs?: number;
  idempotencyKey?: string;
  signal?: AbortSignal;
  successMessage: string;
  failureMessage: string;
};

function approvedApplicationOrigins() {
  return [process.env.NEXT_PUBLIC_SITE_URL || "", "https://www.qrguitar.com", "https://qrguitar.com"];
}

export async function deliverApplicationEmail(
  to: string,
  document: TransactionalEmailDocument,
  options: DeliveryOptions
): Promise<EmailResult> {
  // This is a local durable intent identifier, not relay-side deduplication.
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return { ok: false, status: "failed", outcome: "rejected", retryable: false, message: "Email delivery idempotency key is invalid." };
  }
  return deliverZohoSmtpEmail(to, document, { ...options, idempotencyKey });
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

  return deliverApplicationEmail(input.to, document, {
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
    document = renderServiceReviewEmailDocument({
      subject: render("subject"),
      preheader: render("preheader"),
      heading: render("heading"),
      body: render("body"),
      ctaLabel: render("cta"),
      reviewUrl: input.reviewUrl,
      footer: render("footer"),
      allowedCtaOrigins: approvedApplicationOrigins()
    });
  } catch {
    return { ok: false, status: "failed", outcome: "rejected", message: "Owner notification created, but the email template or review link is invalid." };
  }

  const result = await deliverApplicationEmail(input.to, document, {
    successMessage: "Owner notification created; review email accepted by the email provider.",
    failureMessage: "Owner notification created, but email provider acceptance was not confirmed",
    idempotencyKey: input.idempotencyKey,
    signal: input.signal
  });
  if (!result.ok && result.message === "Zoho SMTP delivery is not configured for application messages.") {
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
