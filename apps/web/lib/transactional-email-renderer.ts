export type TransactionalEmailDocument = {
  subject: string;
  htmlContent: string;
  textContent: string;
};

export type BrandedEmailInput = {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  notice?: string;
  footer: string;
  allowedCtaOrigins: string[];
  testRecipientNote?: string;
};

function singleLine(value: string, maxLength: number) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function boundedText(value: string, maxLength: number) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character] || character);
}

function htmlText(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function normalizedOrigins(origins: string[]) {
  return new Set(origins.flatMap((candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? [parsed.origin] : [];
    } catch {
      return [];
    }
  }));
}

export function requireSafeEmailCtaUrl(value: string, allowedOrigins: string[]) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Transactional email CTA must be an absolute HTTPS URL.");
  }
  const origins = normalizedOrigins(allowedOrigins);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !origins.has(parsed.origin)) {
    throw new Error("Transactional email CTA must use an approved HTTPS origin.");
  }
  return parsed.href;
}

export function renderBrandedTransactionalEmail(input: BrandedEmailInput): TransactionalEmailDocument {
  const subject = singleLine(input.subject, 160);
  const preheader = boundedText(input.preheader, 200);
  const eyebrow = singleLine(input.eyebrow, 80);
  const heading = boundedText(input.heading, 180);
  const body = boundedText(input.body, 2400);
  const ctaLabel = singleLine(input.ctaLabel, 80);
  const notice = boundedText(input.notice || "", 900);
  const footer = boundedText(input.footer, 400);
  const testRecipientNote = boundedText(input.testRecipientNote || "", 300);
  const ctaUrl = requireSafeEmailCtaUrl(input.ctaUrl, input.allowedCtaOrigins);
  if (!subject || !preheader || !eyebrow || !heading || !body || !ctaLabel || !footer) {
    throw new Error("Transactional email subject, preheader, heading, body, action, and footer are required.");
  }

  const safeUrl = escapeHtml(ctaUrl);
  const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: #090d0f !important; }
    table { border-collapse: collapse !important; border-spacing: 0 !important; }
    a { color: inherit; }
    .email-shell { width: 100%; background: #090d0f; table-layout: fixed; }
    .email-frame { width: 100% !important; max-width: 640px; min-width: 0 !important; table-layout: fixed; }
    .email-pad { padding: 38px 24px 32px; }
    .email-card { padding: 32px; }
    .wrap { overflow-wrap: anywhere; word-break: break-word; }
    @media only screen and (max-width: 560px) {
      .email-pad { padding: 22px 12px 24px !important; }
      .email-card { padding: 24px 18px !important; }
      .email-heading { font-size: 27px !important; line-height: 1.16 !important; }
      .email-button { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body>
  <div style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;</div>
  <table role="presentation" class="email-shell" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
    <tr>
      <td align="center" style="width:100%;max-width:100%;">
        <table role="presentation" class="email-frame" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;table-layout:fixed;">
          <tr>
            <td class="email-pad" style="padding:38px 24px 32px;font-family:Arial,Helvetica,sans-serif;color:#fffaf0;">
              <div class="wrap" style="font-size:27px;line-height:1;font-weight:800;letter-spacing:-0.8px;margin:0 0 28px;"><span style="color:#f59e0b;">QR</span>guitar</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background:#151b1f;border:1px solid #39434a;border-radius:10px;">
                <tr>
                  <td class="email-card wrap" style="padding:32px;overflow-wrap:anywhere;word-break:break-word;">
                    <p style="margin:0 0 11px;color:#f59e0b;font-size:12px;line-height:1.35;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                    <h1 class="email-heading wrap" style="margin:0 0 17px;color:#fffaf0;font-size:31px;line-height:1.18;font-weight:800;overflow-wrap:anywhere;word-break:break-word;">${htmlText(heading)}</h1>
                    <p class="wrap" style="margin:0;color:#dce1e3;font-size:16px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;">${htmlText(body)}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
                      <tr>
                        <td bgcolor="#f59e0b" style="border-radius:7px;">
                          <a class="email-button wrap" href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 21px;color:#111416;background:#f59e0b;border:1px solid #f59e0b;border-radius:7px;font-size:15px;line-height:1.2;font-weight:800;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(ctaLabel)}</a>
                        </td>
                      </tr>
                    </table>
                    ${notice ? `<p class="wrap" style="margin:0 0 18px;color:#aeb8bd;font-size:13px;line-height:1.58;overflow-wrap:anywhere;word-break:break-word;">${htmlText(notice)}</p>` : ""}
                    <p class="wrap" style="margin:0;color:#89959b;font-size:12px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word;">If the button does not work, copy and paste this link into your browser:<br><a href="${safeUrl}" style="color:#f7b84b;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word;">${safeUrl}</a></p>
                  </td>
                </tr>
              </table>
              <p class="wrap" style="margin:20px 0 0;color:#89959b;font-size:12px;line-height:1.55;text-align:center;overflow-wrap:anywhere;word-break:break-word;">${htmlText(footer)}</p>
              ${testRecipientNote ? `<p class="wrap" style="margin:8px 0 0;color:#718087;font-size:11px;line-height:1.5;text-align:center;overflow-wrap:anywhere;word-break:break-word;">${htmlText(testRecipientNote)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textContent = [
    "QRguitar",
    eyebrow.toUpperCase(),
    heading,
    body,
    `${ctaLabel}: ${ctaUrl}`,
    notice,
    footer,
    testRecipientNote
  ].filter(Boolean).join("\n\n");

  return { subject, htmlContent, textContent };
}
