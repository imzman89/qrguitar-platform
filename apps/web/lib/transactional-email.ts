import { contentRegistryByKey, getContentValue, validateVariables } from "./content-registry";
import { loadPublishedSiteSettings } from "./site-settings-server";

type EmailResult = { ok: boolean; status: "sent" | "failed"; message: string; providerMessageId?: string };

function senderAddress() {
  return String(process.env.SMTP_FROM || process.env.EMAIL_FROM || "noreply@qrguitar.com")
    .replace(/^.*<([^>]+)>.*$/, "$1")
    .trim();
}

export async function sendAdminTemplateTestEmail(input: {
  to: string;
  subject: string;
  preheader?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  footer?: string;
}): Promise<EmailResult> {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, status: "failed", message: "Brevo delivery is not configured for application messages." };
  }

  const safeSubject = input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 160);
  const safePreheader = escapeHtml(String(input.preheader || "QRguitar Content Studio test").slice(0, 200));
  const safeHeading = escapeHtml(input.heading.slice(0, 140));
  const safeBody = escapeHtml(input.body.slice(0, 1600)).replace(/\n/g, "<br>");
  const safeCta = escapeHtml(String(input.ctaLabel || "Open QRguitar").slice(0, 80));
  const safeFooter = escapeHtml(String(input.footer || "This test was sent from the QRguitar Content Studio.").slice(0, 300));
  if (!safeSubject || !safeHeading || !safeBody) {
    return { ok: false, status: "failed", message: "Subject, heading, and body are required for a test email." };
  }

  const htmlContent = `<!doctype html><html><head><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(safeSubject)}</title></head><body style="margin:0;background:#091013;color:#f7f3e8;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div><div style="max-width:620px;margin:0 auto;padding:36px 22px"><div style="font-size:26px;font-weight:800;margin-bottom:28px">QR<span style="color:#f59e0b">guitar</span></div><div style="background:#121b20;border:1px solid #2d383d;border-radius:8px;padding:28px"><p style="margin:0 0 10px;color:#f59e0b;font-size:12px;font-weight:800;text-transform:uppercase">Content Studio test</p><h1 style="margin:0 0 16px;font-size:28px">${safeHeading}</h1><p style="line-height:1.6;color:#d7dcde">${safeBody}</p><p style="margin:26px 0"><span style="display:inline-block;background:#f7f1df;color:#091013;font-weight:800;padding:14px 20px;border-radius:6px">${safeCta}</span></p><p style="font-size:12px;color:#9da8ad">${safeFooter}</p></div><p style="font-size:12px;color:#7f898d;margin-top:20px">Test recipient: authenticated QRguitar administrator.</p></div></body></html>`;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "QRguitar", email: senderAddress() },
        replyTo: { email: String(process.env.SMTP_REPLY_TO || "support@qrguitar.com") },
        to: [{ email: input.to }],
        subject: `[TEST] ${safeSubject}`,
        htmlContent
      })
    });
    const payload = await response.json().catch(() => ({})) as { messageId?: string };
    if (!response.ok) {
      return { ok: false, status: "failed", message: `Brevo rejected the test email (${response.status}).` };
    }
    return { ok: true, status: "sent", message: "Test email sent to the authenticated admin.", providerMessageId: payload.messageId };
  } catch {
    return { ok: false, status: "failed", message: "The test email could not be delivered." };
  }
}

export async function sendServiceReviewEmail(input: {
  to: string;
  profileTitle: string;
  providerName: string;
  reviewUrl: string;
}): Promise<EmailResult> {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, status: "failed", message: "Owner notification created, but email delivery is not configured for application messages." };
  }

  const settings = await loadPublishedSiteSettings();
  const variables = {
    profile_title: input.profileTitle,
    profile_url: input.reviewUrl,
    provider_name: input.providerName || "A service provider",
    review_url: input.reviewUrl
  };
  const render = (suffix: string) => renderRegisteredTemplateValue(settings.content, `email.service.submitted.${suffix}`, variables);
  const subject = render("subject").replace(/[\r\n]+/g, " ").trim().slice(0, 160);
  const safePreheader = escapeHtml(render("preheader"));
  const safeHeading = escapeHtml(render("heading"));
  const safeBody = escapeHtml(render("body")).replace(/\n/g, "<br>");
  const safeCta = escapeHtml(render("cta"));
  const safeFooter = escapeHtml(render("footer"));
  const safeUrl = escapeHtml(input.reviewUrl);
  const htmlContent = `<!doctype html><html><head><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#091013;color:#f7f3e8;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div><div style="max-width:620px;margin:0 auto;padding:36px 22px"><div style="font-size:26px;font-weight:800;margin-bottom:28px">QR<span style="color:#f59e0b">guitar</span></div><div style="background:#121b20;border:1px solid #2d383d;border-radius:8px;padding:28px"><p style="margin:0 0 10px;color:#f59e0b;font-size:12px;font-weight:800;text-transform:uppercase">Private owner review</p><h1 style="margin:0 0 16px;font-size:28px">${safeHeading}</h1><p style="line-height:1.6;color:#d7dcde">${safeBody}</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;background:#f7f1df;color:#091013;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:6px">${safeCta}</a></p><p style="font-size:13px;line-height:1.5;color:#9da8ad">Nothing becomes part of the public Profile until you approve it. Supporting evidence stays private and is not attached to this email. This link expires in 14 days and still requires the authorized owner account.</p></div><p style="font-size:12px;color:#7f898d;margin-top:20px">${safeFooter}</p></div></body></html>`;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "QRguitar", email: senderAddress() },
        replyTo: { email: String(process.env.SMTP_REPLY_TO || "support@qrguitar.com") },
        to: [{ email: input.to }],
        subject,
        htmlContent
      })
    });
    const payload = await response.json().catch(() => ({})) as { messageId?: string; message?: string };
    if (!response.ok) {
      return { ok: false, status: "failed", message: `Owner notification created, but email delivery failed (${response.status}).` };
    }
    return { ok: true, status: "sent", message: "Owner notification and review email sent.", providerMessageId: payload.messageId };
  } catch {
    return { ok: false, status: "failed", message: "Owner notification created, but email delivery failed." };
  }
}

function renderRegisteredTemplateValue(content: Record<string, string>, key: string, variables: Record<string, string>) {
  const entry = contentRegistryByKey.get(key);
  if (!entry || entry.area !== "Emails") throw new Error(`Email template field is not registered: ${key}`);
  const value = getContentValue(content, key);
  const invalid = validateVariables(value, entry.allowedVariables || []);
  if (invalid) throw new Error(`Email template contains an unapproved variable: ${invalid}`);
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => variables[name] || "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
