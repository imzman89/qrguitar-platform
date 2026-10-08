export type EmailTemplateDeliveryBoundary =
  | {
      kind: "application";
      owner: "qrguitar-zoho-smtp";
      canSendApplicationTest: boolean;
      providerTemplate: null;
      providerArtifact: null;
    }
  | {
      kind: "provider";
      owner: "supabase-auth";
      canSendApplicationTest: false;
      providerTemplate: "recovery" | "magic-link";
      providerArtifact: string;
    }
  | {
      kind: "preview";
      owner: "none";
      canSendApplicationTest: false;
      providerTemplate: null;
      providerArtifact: null;
    };

const applicationFamilies = new Set([
  "email.service.submitted",
  "email.service.revisionRequested",
  "email.service.approved",
  "email.service.declined",
  "email.service.cancelled",
  "email.claim.ownerReview",
  "email.claim.moreInfo",
  "email.claim.approved",
  "email.claim.declined",
  "email.claim.expired",
  "email.ownership.transferAccepted",
  "email.ownership.transferCancelled"
]);

const providerBoundaries: Record<string, EmailTemplateDeliveryBoundary> = {
  "email.security.passwordReset": {
    kind: "provider",
    owner: "supabase-auth",
    canSendApplicationTest: false,
    providerTemplate: "recovery",
    providerArtifact: "docs/provider-email-templates/supabase-recovery.html"
  },
  "email.ownership.transferInvitation": {
    kind: "provider",
    owner: "supabase-auth",
    canSendApplicationTest: false,
    providerTemplate: "magic-link",
    providerArtifact: "docs/provider-email-templates/supabase-magic-link.html"
  }
};

export function emailTemplatePrefixFromKeys(keys: string[]) {
  const first = keys.find((key) => key.startsWith("email."));
  return first ? first.slice(0, first.lastIndexOf(".")) : "";
}

export function emailTemplateDeliveryBoundary(templatePrefix: string): EmailTemplateDeliveryBoundary {
  if (applicationFamilies.has(templatePrefix)) {
    return {
      kind: "application",
      owner: "qrguitar-zoho-smtp",
      canSendApplicationTest: templatePrefix === "email.service.submitted",
      providerTemplate: null,
      providerArtifact: null
    };
  }
  return providerBoundaries[templatePrefix] || {
    kind: "preview",
    owner: "none",
    canSendApplicationTest: false,
    providerTemplate: null,
    providerArtifact: null
  };
}

export function createEmailTemplateSetupExport(templatePrefix: string, fields: Record<string, string>) {
  const boundary = emailTemplateDeliveryBoundary(templatePrefix);
  return {
    schema: "qrguitar-email-template-export/v1",
    exportedAt: new Date().toISOString(),
    templatePrefix,
    delivery: {
      kind: boundary.kind,
      owner: boundary.owner,
      providerTemplate: boundary.providerTemplate,
      providerArtifact: boundary.providerArtifact,
      applicationTestAvailable: boundary.canSendApplicationTest,
      note: boundary.kind === "application"
        ? "Published fields for this family are used by QRguitar workflow delivery through Zoho SMTP when its runtime and delivery controls are enabled. This export does not enable delivery or verify inbox receipt."
        : boundary.kind === "provider"
          ? "This CMS copy is a review reference and is not synchronized to Supabase Auth. Review and install the named provider artifact through the provider change process."
          : "No production trigger or delivery integration is registered for this design-only family."
    },
    fields: Object.fromEntries(Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)))
  };
}
export function nonNavigatingEmailPreviewHtml(html: string) {
  return String(html || "")
    .replace(/<a\b([^>]*)>/gi, (_match, attributes: string) => `<span${attributes.replace(/\s+(?:href|target|rel)="[^"]*"/gi, "")} aria-disabled="true">`)
    .replace(/<\/a>/gi, "</span>");
}
