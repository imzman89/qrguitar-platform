import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { getAdminContext, logAdminAuditEvent } from "../../../../lib/admin-auth";
import { contentRegistryByKey, validateVariables } from "../../../../lib/content-registry";
import { sendAdminTemplateTestEmail } from "../../../../lib/transactional-email";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SAMPLE_VALUES: Record<string, string> = {
  profile_title: "1962 Sunburst Stratocaster",
  profile_url: "https://www.qrguitar.com/i/QRG-EXAMPLE123",
  provider_name: "Example Guitar Service",
  claim_url: "https://www.qrguitar.com/ownership-claim",
  sender_name: "Current owner",
  review_url: "https://www.qrguitar.com/service-review/example",
  reset_url: "https://www.qrguitar.com/reset-password",
  safety_status: "Reported lost",
  account_url: "https://www.qrguitar.com/account"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

function renderSamples(value: string) {
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => SAMPLE_VALUES[key] || match);
}

export async function POST(request: Request) {
  noStore();
  const admin = await getAdminContext(request);
  if (!admin.ok) return json({ ok: false, message: admin.message }, admin.status);

  let body: { fields?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Invalid test-email request." }, 400);
  }

  const fields = body.fields || {};
  const fieldKeys = Object.keys(fields);
  const firstEntry = contentRegistryByKey.get(fieldKeys[0] || "");
  const templatePrefix = firstEntry?.area === "Emails" ? firstEntry.key.slice(0, firstEntry.key.lastIndexOf(".")) : "";
  const templateEntries = templatePrefix
    ? Array.from(contentRegistryByKey.values()).filter((entry) => entry.area === "Emails" && entry.key.startsWith(`${templatePrefix}.`))
    : [];
  if (!templatePrefix || fieldKeys.length !== templateEntries.length || templateEntries.some((entry) => !(entry.key in fields))
    || fieldKeys.some((key) => !key.startsWith(`${templatePrefix}.`))) {
    return json({ ok: false, message: "Choose one complete email template before sending a test." }, 400);
  }
  if (templatePrefix !== "email.service.submitted") {
    return json({ ok: false, message: "This template is not bound to application delivery. Export it for its owning provider or keep it as a preview-only design." }, 409);
  }
  const values: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(fields)) {
    const entry = contentRegistryByKey.get(key);
    if (!entry || entry.area !== "Emails" || typeof rawValue !== "string") {
      return json({ ok: false, message: "Only registered email-template fields may be tested." }, 400);
    }
    const value = rawValue.slice(0, entry.maxLength);
    const invalidVariable = validateVariables(value, entry.allowedVariables || []);
    if (invalidVariable) return json({ ok: false, message: `Variable {{${invalidVariable}}} is not allowed.` }, 400);
    values[key] = renderSamples(value);
  }

  const find = (suffix: string, fallback = "") => Object.entries(values).find(([key]) => key.endsWith(suffix))?.[1] || fallback;
  const subject = find(".subject");
  const heading = find(".heading", subject || "QRguitar notification");
  const messageBody = find(".body");
  if (!subject || !messageBody) return json({ ok: false, message: "This template needs a subject and body before testing." }, 400);

  const result = await sendAdminTemplateTestEmail({
    to: admin.email,
    subject,
    preheader: find(".preheader"),
    heading,
    body: messageBody,
    ctaLabel: find(".cta", "Open QRguitar"),
    ctaUrl: SAMPLE_VALUES.review_url,
    footer: find(".footer")
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: result.ok ? "site_email_test_sent" : "site_email_test_failed",
      targetType: "email_template",
      targetId: templatePrefix,
      reason: "Authenticated Content Studio test",
      metadata: { status: result.status, outcome: result.outcome, providerMessageId: result.providerMessageId || null, deliveryOwner: "application-brevo" }
    });
  }

  return json({ ok: result.ok, message: result.message }, result.ok ? 200 : 502);
}
