type EmailResult = { ok: boolean; status: "sent" | "failed"; message: string; providerMessageId?: string };

function senderAddress() {
  return String(process.env.SMTP_FROM || process.env.EMAIL_FROM || "noreply@qrguitar.com")
    .replace(/^.*<([^>]+)>.*$/, "$1")
    .trim();
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

  const subject = "Service work submitted for your QRguitar Profile";
  const safeTitle = escapeHtml(input.profileTitle);
  const safeProvider = escapeHtml(input.providerName || "A service provider");
  const safeUrl = escapeHtml(input.reviewUrl);
  const htmlContent = `<!doctype html><html><body style="margin:0;background:#091013;color:#f7f3e8;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 22px"><div style="font-size:26px;font-weight:800;margin-bottom:28px">QR<span style="color:#f59e0b">guitar</span></div><div style="background:#121b20;border:1px solid #2d383d;border-radius:8px;padding:28px"><p style="margin:0 0 10px;color:#f59e0b;font-size:12px;font-weight:800;text-transform:uppercase">Private owner review</p><h1 style="margin:0 0 16px;font-size:28px">Service work was submitted.</h1><p style="line-height:1.6;color:#d7dcde">${safeProvider} submitted service work for <strong>${safeTitle}</strong>.</p><p style="line-height:1.6;color:#d7dcde">Nothing becomes part of the public Profile until you approve it. You may approve, request changes, or decline.</p><p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;background:#f7f1df;color:#091013;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:6px">Review service work</a></p><p style="font-size:13px;line-height:1.5;color:#9da8ad">Supporting evidence stays private and is not attached to this email. This link expires in 14 days and still requires the authorized owner account.</p></div><p style="font-size:12px;color:#7f898d;margin-top:20px">Questions? Reply to support@qrguitar.com.</p></div></body></html>`;

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

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
