import { contentRegistryByKey, getContentValue, validateVariables } from "./content-registry";
import { renderClaimOwnerReviewEmailDocument, renderClaimMoreInfoEmailDocument, renderServiceRevisionRequestedEmailDocument, type TransactionalEmailDocument } from "./transactional-email-renderer";
import type { EmailResult } from "./transactional-email";

type Family = "claim.ownerReview" | "claim.moreInfo" | "service.revisionRequested";
type Input = { event: Family; to: string; profileTitle: string; actionUrl: string; idempotencyKey: string };
type DeliveryOptions = { idempotencyKey: string; signal: AbortSignal; successMessage: string; failureMessage: string };
const renderers = {
  "claim.ownerReview": renderClaimOwnerReviewEmailDocument,
  "claim.moreInfo": renderClaimMoreInfoEmailDocument,
  "service.revisionRequested": renderServiceRevisionRequestedEmailDocument
};
const rejected = (message: string, retryable = false): EmailResult => ({ ok: false, status: "failed", outcome: "rejected", retryable, message });

/** No route or environment activation. Caller must explicitly enable after integration/cutover approval. */
export function createActionRequiredEmailSender(deps: {
  enabled?: boolean;
  loadContent(signal: AbortSignal): Promise<Record<string, string>>;
  deliver(to: string, document: TransactionalEmailDocument, options: DeliveryOptions): Promise<EmailResult>;
}) {
  return async (input: Input, signal: AbortSignal): Promise<EmailResult> => {
    if (deps.enabled !== true) return rejected("Action-required email delivery is disabled.");
    if (signal.aborted) return rejected("Action-required email delivery was cancelled before sending.", true);
    if (!Object.hasOwn(renderers, input.event) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to) || /[\x00-\x1f]/.test(input.to)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)
      || typeof input.profileTitle !== "string" || input.profileTitle.length > 500) return rejected("Action-required email context is invalid.");
    let content: Record<string, string>;
    try { content = await deps.loadContent(signal); }
    catch { return rejected("Published email wording is temporarily unavailable.", true); }
    let document: TransactionalEmailDocument;
    try {
      const variables: Record<string, string> = { profile_title: input.profileTitle, claim_url: input.actionUrl, review_url: input.actionUrl };
      const render = (suffix: string) => {
        const key = "email." + input.event + "." + suffix;
        const entry = contentRegistryByKey.get(key);
        if (!entry || entry.area !== "Emails") throw new Error("Unregistered template");
        const text = getContentValue(content, key);
        if (validateVariables(text, entry.allowedVariables || [])) throw new Error("Invalid template variable");
        return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name: string) => {
          if (!Object.hasOwn(variables, name)) throw new Error("Template context unavailable");
          return variables[name];
        });
      };
      document = renderers[input.event]({ subject: render("subject"), preheader: render("preheader"), heading: render("heading"), body: render("body"), ctaLabel: render("cta"), footer: render("footer"), actionUrl: input.actionUrl, allowedCtaOrigins: ["https://www.qrguitar.com"] });
    } catch { return rejected("Action-required email wording or destination is invalid; nothing was sent."); }
    if (signal.aborted) return rejected("Action-required email delivery was cancelled before sending.", true);
    try {
      return await deps.deliver(input.to, document, { idempotencyKey: input.idempotencyKey, signal,
        successMessage: "Action-required email accepted by the provider.", failureMessage: "Action-required email provider acceptance was not confirmed" });
    } catch { return { ok: false, status: "failed", outcome: "unknown", retryable: false, message: "Email acceptance is unknown. Do not resend automatically." }; }
  };
}
