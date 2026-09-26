export type EmailTemplateDeliveryBoundary =
  | {
      kind: "application";
      owner: "qrguitar-brevo";
      canSendApplicationTest: true;
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
  if (templatePrefix === "email.service.submitted") {
    return {
      kind: "application",
      owner: "qrguitar-brevo",
      canSendApplicationTest: true,
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
        ? "This family is rendered and submitted by the QRguitar application through Brevo."
        : boundary.kind === "provider"
          ? "This CMS copy is a review reference and is not synchronized to Supabase Auth. Review and install the named provider artifact through the provider change process."
          : "No production trigger or delivery integration is registered for this design-only family."
    },
    fields: Object.fromEntries(Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)))
  };
}
