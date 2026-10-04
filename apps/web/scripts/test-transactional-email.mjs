import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compile(relativePath, imports = {}) {
  const file = path.resolve(webRoot, relativePath);
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const localRequire = (request) => {
    if (request in imports) return imports[request];
    throw new Error(`Unexpected import ${request} from ${relativePath}`);
  };
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}

const renderer = compile("lib/transactional-email-renderer.ts");
const boundary = compile("lib/email-template-boundary.ts");
const contentRegistry = compile("lib/content-registry.ts", {
  "./ui-text-registry": compile("lib/ui-text-registry.ts", {
    "./catalog-policy-ui-text": compile("lib/catalog-policy-ui-text.ts"),
    "./owner-dashboard-policy-ui-text": compile("lib/owner-dashboard-policy-ui-text.ts")
  }),
  "./ui-text-protection": compile("lib/ui-text-protection.ts")
});
const emailEntries = new Map([
  ["email.service.submitted.subject", { area: "Emails", allowedVariables: ["profile_title"] }],
  ["email.service.submitted.preheader", { area: "Emails", allowedVariables: ["profile_title"] }],
  ["email.service.submitted.heading", { area: "Emails", allowedVariables: ["profile_title"] }],
  ["email.service.submitted.body", { area: "Emails", allowedVariables: ["profile_title", "provider_name"] }],
  ["email.service.submitted.cta", { area: "Emails", allowedVariables: [] }],
  ["email.service.submitted.footer", { area: "Emails", allowedVariables: [] }]
]);
const transactional = compile("lib/transactional-email.ts", {
  "./content-registry": {
    contentRegistryByKey: emailEntries,
    getContentValue: (content, key) => content[key],
    validateVariables: () => ""
  },
  "./transactional-email-renderer": renderer,
  "./site-settings-server": {
    loadPublishedSiteSettings: async () => ({
      content: {
        "email.service.submitted.subject": "Review {{profile_title}}",
        "email.service.submitted.preheader": "Private review for {{profile_title}}",
        "email.service.submitted.heading": "Service work is ready",
        "email.service.submitted.body": "{{provider_name}} submitted work for {{profile_title}}.",
        "email.service.submitted.cta": "Review service work",
        "email.service.submitted.footer": "QRguitar · Permanent instrument identity and history"
      }
    })
  }
});

const baseEmail = {
  subject: "Service review\r\nBcc: attacker@example.test",
  preheader: "A private update is ready.",
  eyebrow: "Private owner review",
  heading: `Review <script>alert("x")</script> ${"W".repeat(220)}`,
  body: `Ampersand & apostrophe ' and a verylongword${"z".repeat(420)}`,
  ctaLabel: "Review service work",
  ctaUrl: "https://www.qrguitar.com/service-review/example",
  notice: "Nothing is public until the owner approves it.",
  footer: "QRguitar · Permanent instrument identity and history",
  allowedCtaOrigins: ["https://www.qrguitar.com"]
};

test("renderer produces escaped responsive HTML and a complete plain-text alternative", () => {
  const document = renderer.renderBrandedTransactionalEmail(baseEmail);
  assert.equal(document.subject, "Service review Bcc: attacker@example.test");
  assert.match(document.htmlContent, /name="viewport"/);
  assert.match(document.htmlContent, /@media only screen and \(max-width: 560px\)/);
  assert.match(document.htmlContent, /role="presentation"/);
  assert.match(document.htmlContent, /overflow-wrap:anywhere/);
  assert.match(document.htmlContent, /#090d0f/);
  assert.match(document.htmlContent, /#f59e0b/);
  assert.match(document.htmlContent, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(document.htmlContent, /<script>alert/);
  assert.match(document.htmlContent, /https:\/\/www\.qrguitar\.com\/service-review\/example/);
  assert.match(document.textContent, /Review <script>alert\("x"\)<\/script>/);
  assert.match(document.textContent, /Review service work: https:\/\/www\.qrguitar\.com\/service-review\/example/);
  assert.match(document.textContent, /Nothing is public until the owner approves it\./);
});

test("renderer rejects non-HTTPS, credentialed, and off-origin CTA links", () => {
  for (const ctaUrl of [
    "javascript:alert(1)",
    "http://www.qrguitar.com/service-review/example",
    "https://user:secret@www.qrguitar.com/service-review/example",
    "https://attacker.example/service-review/example"
  ]) {
    assert.throws(() => renderer.renderBrandedTransactionalEmail({ ...baseEmail, ctaUrl }), /approved HTTPS|absolute HTTPS/);
  }
});
function registeredEmailDefault(prefix, suffix, variables) {
  const entry = contentRegistry.contentRegistryByKey.get(`${prefix}.${suffix}`);
  assert.ok(entry, `Missing registered email field ${prefix}.${suffix}`);
  return entry.defaultValue.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, name) => variables[name] || "");
}

const actionRequiredFamilies = [
  {
    prefix: "email.claim.ownerReview",
    renderer: "renderClaimOwnerReviewEmailDocument",
    actionUrl: "https://www.qrguitar.com/ownership-claim?claim=11111111-1111-4111-8111-111111111111",
    eyebrow: "PRIVATE OWNERSHIP REVIEW",
    notice: renderer.CLAIM_OWNER_REVIEW_EMAIL_NOTICE
  },
  {
    prefix: "email.claim.moreInfo",
    renderer: "renderClaimMoreInfoEmailDocument",
    actionUrl: "https://www.qrguitar.com/ownership-claim?claim=22222222-2222-4222-8222-222222222222",
    eyebrow: "OWNERSHIP CLAIM UPDATE",
    notice: renderer.CLAIM_MORE_INFO_EMAIL_NOTICE
  },
  {
    prefix: "email.service.revisionRequested",
    renderer: "renderServiceRevisionRequestedEmailDocument",
    actionUrl: "https://www.qrguitar.com/service-work/QRG-RENDER-123?submission=33333333-3333-4333-8333-333333333333",
    eyebrow: "SERVICE REVISION REQUESTED",
    notice: renderer.SERVICE_REVISION_REQUESTED_EMAIL_NOTICE
  }
];

test("action-required family renderers use current registered copy, shared branding, escaped HTML, and complete plaintext", () => {
  const profileTitle = `1962 <script>alert("owner")</script> ${"WideWord".repeat(30)}`;
  const variables = {
    profile_title: profileTitle,
    profile_url: "https://www.qrguitar.com/i/QRG-RENDER-123",
    claim_url: "https://www.qrguitar.com/ownership-claim",
    review_url: "https://www.qrguitar.com/service-work/QRG-RENDER-123"
  };
  for (const family of actionRequiredFamilies) {
    const document = renderer[family.renderer]({
      subject: registeredEmailDefault(family.prefix, "subject", variables),
      preheader: registeredEmailDefault(family.prefix, "preheader", variables),
      heading: registeredEmailDefault(family.prefix, "heading", variables),
      body: registeredEmailDefault(family.prefix, "body", variables),
      ctaLabel: registeredEmailDefault(family.prefix, "cta", variables),
      actionUrl: family.actionUrl,
      footer: registeredEmailDefault(family.prefix, "footer", variables),
      allowedCtaOrigins: ["https://www.qrguitar.com"],
      privateNote: "PRIVATE-NOTE-MUST-NOT-RENDER",
      evidenceUrl: "https://www.qrguitar.com/private-evidence/MUST-NOT-RENDER",
      recipientName: "PRIVATE-NAME-MUST-NOT-RENDER",
      eventDate: "PRIVATE-DATE-MUST-NOT-RENDER"
    });
    assert.match(document.htmlContent, /#090d0f/);
    assert.match(document.htmlContent, /#f59e0b/);
    assert.match(document.htmlContent, /name="viewport"/);
    assert.match(document.htmlContent, /&lt;script&gt;alert\(&quot;owner&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(document.htmlContent, /<script>alert/);
    assert.match(document.htmlContent, new RegExp(family.actionUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(document.textContent, new RegExp(family.eyebrow));
    assert.match(document.textContent, /1962 <script>alert\("owner"\)<\/script>/);
    assert.match(document.textContent, new RegExp(family.notice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(document.textContent, new RegExp(family.actionUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(`${document.htmlContent}\n${document.textContent}`, /PRIVATE-(?:NOTE|NAME|DATE)|private-evidence\/MUST-NOT-RENDER/);
  }
});

test("action-required family renderers reject off-route, secret-bearing, malformed, and off-origin destinations", () => {
  const common = {
    subject: "Action required",
    preheader: "Open QRguitar securely.",
    heading: "Review this update",
    body: "Sign in to review the saved request.",
    ctaLabel: "Open request",
    footer: "QRguitar · Permanent instrument identity and history",
    allowedCtaOrigins: ["https://www.qrguitar.com"]
  };
  const invalid = [
    ["renderClaimOwnerReviewEmailDocument", "https://www.qrguitar.com/ownership-claim?claim=11111111-1111-4111-8111-111111111111&token=secret"],
    ["renderClaimMoreInfoEmailDocument", "https://www.qrguitar.com/admin?claim=22222222-2222-4222-8222-222222222222"],
    ["renderClaimMoreInfoEmailDocument", "https://attacker.example/ownership-claim?claim=22222222-2222-4222-8222-222222222222"],
    ["renderServiceRevisionRequestedEmailDocument", "https://www.qrguitar.com/service-work/QRG-RENDER-123?submission=not-a-uuid"],
    ["renderServiceRevisionRequestedEmailDocument", "https://www.qrguitar.com/service-work/QRG-RENDER-123?submission=33333333-3333-4333-8333-333333333333&token=secret"]
  ];
  for (const [render, actionUrl] of invalid) {
    assert.throws(() => renderer[render]({ ...common, actionUrl }), /approved HTTPS origin|authenticated claim destination|provider workbench destination/);
  }
});
test("Content Studio renderer-backed previews use fixed notices, inert links, and complete plaintext", () => {
  const serviceDocument = renderer.renderServiceReviewEmailDocument({
    subject: "Review 1962 Sunburst Stratocaster",
    preheader: "Private owner review",
    heading: "Service work is ready",
    body: "Example Guitar Service submitted work for 1962 Sunburst Stratocaster.",
    ctaLabel: "Review service work",
    reviewUrl: "https://www.qrguitar.com/service-review/00000000-0000-4000-8000-000000000000",
    footer: "QRguitar · Permanent instrument identity and history",
    allowedCtaOrigins: ["https://www.qrguitar.com"]
  });
  assert.match(serviceDocument.htmlContent, /Private owner review/i);
  assert.match(serviceDocument.htmlContent, /resending does not extend that deadline/);
  assert.match(serviceDocument.textContent, /Review service work: https:\/\/www\.qrguitar\.com\/service-review\/00000000-0000-4000-8000-000000000000/);
  assert.match(serviceDocument.textContent, /resending does not extend that deadline/);

  const previewDocuments = [serviceDocument];
  for (const family of actionRequiredFamilies) {
    const document = renderer[family.renderer]({
      subject: `${family.prefix} preview`,
      preheader: "A secure QRguitar update is ready.",
      heading: "Review this update",
      body: "Sign in to review the saved request.",
      ctaLabel: "Open request",
      actionUrl: family.actionUrl,
      footer: "QRguitar · Permanent instrument identity and history",
      allowedCtaOrigins: ["https://www.qrguitar.com"]
    });
    assert.ok(document.htmlContent.includes(family.notice.replaceAll("&", "&amp;").replaceAll("'", "&#39;")));
    assert.match(document.textContent, new RegExp(family.notice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(document.textContent, new RegExp(family.actionUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    previewDocuments.push(document);
  }

  for (const document of previewDocuments) {
    const previewHtml = boundary.nonNavigatingEmailPreviewHtml(document.htmlContent);
    assert.doesNotMatch(previewHtml, /<a\b/i);
    assert.doesNotMatch(previewHtml, /\s(?:href|target|rel)="/i);
    assert.match(previewHtml, /<span class="email-button wrap"/);
  }

  const editor = fs.readFileSync(path.join(webRoot, "app/site-editor/page.tsx"), "utf8");
  for (const rendererName of [
    "renderServiceReviewEmailDocument",
    "renderClaimOwnerReviewEmailDocument",
    "renderClaimMoreInfoEmailDocument",
    "renderServiceRevisionRequestedEmailDocument"
  ]) assert.match(editor, new RegExp(rendererName));
  for (const prefix of [
    "email.service.submitted",
    "email.claim.ownerReview",
    "email.claim.moreInfo",
    "email.service.revisionRequested"
  ]) assert.match(editor, new RegExp(prefix.replaceAll(".", "\\.")));
  assert.match(editor, /ownership-claim\?claim=00000000-0000-4000-8000-000000000000/);
  assert.match(editor, /service-work\/QRG-PREVIEW-001\?submission=00000000-0000-4000-8000-000000000000/);
  assert.match(editor, /rendererPreviewExpected \? \(rendererEmailPreview \? <>/);
  assert.match(editor, /nonNavigatingEmailPreviewHtml\(rendererEmailPreview\.htmlContent\)/);
  assert.match(editor, /<pre>\{rendererEmailPreview\.textContent\}<\/pre>/);
  assert.match(editor, /sandbox=""/);
  assert.match(editor, /tabIndex=\{0\}/);
  assert.match(editor, /Links are disabled and no message is sent from this preview/);
  assert.match(editor, /emailDeliveryBoundary\.canSendApplicationTest \? <>/);
});

async function withEmailEnvironment(run) {
  const before = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    SMTP_FROM: process.env.SMTP_FROM,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SMTP_REPLY_TO: process.env.SMTP_REPLY_TO
  };
  process.env.BREVO_API_KEY = "test-only-key";
  process.env.SMTP_FROM = "QRguitar <noreply@qrguitar.com>";
  delete process.env.EMAIL_FROM;
  process.env.SMTP_REPLY_TO = "support@qrguitar.com";
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Brevo transport sends HTML, plaintext, and a UUID idempotency key without retrying", async () => {
  await withEmailEnvironment(async () => {
    const calls = [];
    const fetcher = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messageId: "<accepted@example.test>" }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    };
    const document = renderer.renderBrandedTransactionalEmail(baseEmail);
    const result = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher,
      timeoutMs: 50,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.deepEqual(result, {
      ok: true,
      status: "sent",
      outcome: "accepted",
      message: "Accepted.",
      providerMessageId: "<accepted@example.test>"
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.htmlContent, document.htmlContent);
    assert.equal(body.textContent, document.textContent);
    assert.equal(body.headers.idempotencyKey, "123e4567-e89b-42d3-a456-426614174000");
    assert.equal(body.to[0].email, "owner@example.test");
    assert.equal(calls[0].init.redirect, "error");
  });
});

test("Brevo transport separates retryable provider rejection from unknown network outcome", async () => {
  await withEmailEnvironment(async () => {
    const document = renderer.renderBrandedTransactionalEmail(baseEmail);
    const rejected = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(rejected.outcome, "rejected");
    assert.equal(rejected.retryable, true);
    assert.equal(rejected.retryAfterSeconds, 12);

    const missingReceipt = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: async () => new Response("{}", { status: 201, headers: { "content-type": "application/json" } }),
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(missingReceipt.outcome, "unknown");
    assert.match(missingReceipt.message, /receipt missing/);

    const unknown = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: async () => { throw new TypeError("response lost"); },
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(unknown.outcome, "unknown");
    assert.equal(unknown.retryable, false);
  });
});

test("Brevo transport requires an explicit sender, times out, honors caller abort, and rejects malformed idempotency keys", async () => {
  await withEmailEnvironment(async () => {
    const document = renderer.renderBrandedTransactionalEmail(baseEmail);
    let calls = 0;

    delete process.env.SMTP_FROM;
    delete process.env.EMAIL_FROM;
    const missingSender = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: async () => { calls += 1; return new Response("{}", { status: 201 }); },
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(missingSender.outcome, "rejected");
    assert.match(missingSender.message, /configuration is invalid/);
    assert.equal(calls, 0);
    process.env.SMTP_FROM = "QRguitar <noreply@qrguitar.com>";

    const invalid = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: async () => { calls += 1; return new Response("{}", { status: 201 }); },
      idempotencyKey: "not-a-uuid",
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(invalid.outcome, "rejected");
    assert.equal(calls, 0);

    const waitingFetcher = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const timedOut = await transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: waitingFetcher,
      timeoutMs: 5,
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    assert.equal(timedOut.outcome, "unknown");
    assert.match(timedOut.message, /timed out/);

    const caller = new AbortController();
    const callerAbort = transactional.deliverBrevoEmail("owner@example.test", document, {
      fetcher: waitingFetcher,
      signal: caller.signal,
      successMessage: "Accepted.",
      failureMessage: "Rejected"
    });
    caller.abort();
    const callerAborted = await callerAbort;
    assert.equal(callerAborted.outcome, "unknown");
    assert.equal(callerAborted.retryable, false);
  });
});

test("only the real application-bound family can use Content Studio delivery", () => {
  const route = fs.readFileSync(path.join(webRoot, "app/api/site-editor/test-email/route.ts"), "utf8");
  const sender = fs.readFileSync(path.join(webRoot, "lib/transactional-email.ts"), "utf8");
  assert.match(route, /templatePrefix !== "email\.service\.submitted"/);
  assert.match(route, /not bound to application delivery/);
  assert.doesNotMatch(sender, /sendCollectionInquiryEmail/);
  assert.match(sender, /textContent: document\.textContent/);
});
test("Account notification presentation names implemented email without advertising unconnected families", () => {
  const account = fs.readFileSync(path.join(webRoot, "app/account/page.tsx"), "utf8");
  assert.match(account, /Email updates can cover account security, service reviews, ownership claims and transfer outcomes/);
  assert.match(account, /Check your QRguitar workspace for the latest status/);
  assert.doesNotMatch(account, /Other workflow updates stay in QRguitar/);
  assert.match(account, /QRguitar workflow emails/);
  assert.match(account, /Service, claims and transfers/);
  assert.doesNotMatch(account, /Security, transfer, claim, and service-review notices are sent to your account email when action is required/);
});

test("email ownership map matches all delivery families without widening test-send access", () => {
  assert.deepEqual(boundary.emailTemplateDeliveryBoundary("email.service.submitted"), {
    kind: "application",
    owner: "qrguitar-brevo",
    canSendApplicationTest: true,
    providerTemplate: null,
    providerArtifact: null
  });
  const application = ["service.submitted", "service.revisionRequested", "service.approved", "service.declined", "service.cancelled", "claim.ownerReview", "claim.moreInfo", "claim.approved", "claim.declined", "claim.expired", "ownership.transferAccepted", "ownership.transferCancelled"];
  const senderPath = path.join(webRoot, "lib/action-required-email-delivery.ts");
  const ast = ts.createSourceFile(senderPath, fs.readFileSync(senderPath, "utf8"), ts.ScriptTarget.Latest, true);
  const familyType = ast.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "Family");
  assert.ok(familyType && ts.isUnionTypeNode(familyType.type));
  assert.deepEqual(application.filter(id => id !== "service.submitted").sort(), familyType.type.types.map(node => node.literal.text).sort());
  for (const family of application) {
    const prefix = `email.${family}`;
    const delivery = boundary.emailTemplateDeliveryBoundary(prefix);
    assert.equal(delivery.kind, "application");
    assert.equal(delivery.owner, "qrguitar-brevo");
    assert.equal(delivery.canSendApplicationTest, family === "service.submitted");
    const exported = boundary.createEmailTemplateSetupExport(prefix, {});
    assert.equal(exported.delivery.kind, "application");
    assert.equal(exported.delivery.applicationTestAvailable, family === "service.submitted");
    assert.match(exported.delivery.note, /when its runtime and delivery controls are enabled/);
    assert.doesNotMatch(exported.delivery.note, /design-only|No production trigger/);
  }
  for (const [prefix, providerTemplate] of [["email.security.passwordReset", "recovery"], ["email.ownership.transferInvitation", "magic-link"]]) {
    const provider = boundary.emailTemplateDeliveryBoundary(prefix);
    assert.equal(provider.kind, "provider");
    assert.equal(provider.providerTemplate, providerTemplate);
    assert.equal(provider.canSendApplicationTest, false);
  }
  const previews = ["service.resubmitted", "ownership.storeHandoff", "claim.submitted", "notification.lostStolen", "security.accountNotice"];
  for (const family of [...previews, "unknown.family"]) {
    const prefix = `email.${family}`;
    const preview = boundary.emailTemplateDeliveryBoundary(prefix);
    assert.equal(preview.kind, "preview");
    assert.equal(preview.canSendApplicationTest, false);
    assert.match(boundary.createEmailTemplateSetupExport(prefix, {}).delivery.note, /No production trigger/);
  }
  const registered = [...contentRegistry.contentRegistryByKey.keys()].filter(key => key.startsWith("email.") && key.endsWith(".subject")).map(key => key.slice(6, -8)).sort();
  assert.deepEqual(registered, [...application, ...previews, "security.passwordReset", "ownership.transferInvitation"].sort());
  const bundle = boundary.createEmailTemplateSetupExport("email.security.passwordReset", {
    "email.security.passwordReset.subject": "Reset",
    "email.security.passwordReset.body": "Body"
  });
  assert.equal(bundle.delivery.owner, "supabase-auth");
  assert.match(bundle.delivery.note, /not synchronized/);
  assert.match(bundle.delivery.providerArtifact, /supabase-recovery\.html$/);
  assert.deepEqual(Object.keys(bundle.fields), [
    "email.security.passwordReset.body",
    "email.security.passwordReset.subject"
  ]);
});

test("editor uses fresh delivery help and separates live templates from setup exports", () => {
  const editor = fs.readFileSync(path.join(webRoot, "app/site-editor/page.tsx"), "utf8");
  const registry = fs.readFileSync(path.join(webRoot, "lib/ui-text-registry.ts"), "utf8");
  assert.match(editor, /emailDeliveryBoundary/);
  assert.match(registry, /emailDeliveryBoundary/);
  assert.doesNotMatch(editor, /Only Service \/ Submitted is sent by the application/);
  assert.match(editor, /emailDeliveryBoundary\.canSendApplicationTest \? <>/);
  assert.match(editor, /downloadEmailSetupExport", "Download template"/);
  const key = "ui.app.site.editor.page.emailDeliveryBoundary";
  const legacy = "Only Service / Submitted is sent by the application. Supabase owns password-reset and transfer sign-in delivery; the remaining templates are design previews with no production trigger.";
  assert.match(contentRegistry.mergeContentValues({ [key]: legacy })[key], /Published application templates/);
  const custom = "Owner-approved custom delivery wording.";
  assert.equal(contentRegistry.mergeContentValues({ [key]: custom })[key], custom);
  assert.equal(contentRegistry.contentRegistryByKey.get(key).classification, "security-locked");
  const accountKey = "ui.app.account.page.b7d24faecb5a";
  const accountLegacy = "Email currently covers account confirmation and recovery, transfer sign-in invitations, and service work ready for owner review. Other workflow updates stay in QRguitar; PayPal handles its own payment notices.";
  assert.match(contentRegistry.mergeContentValues({ [accountKey]: accountLegacy })[accountKey], /Email updates can cover/);
  assert.equal(contentRegistry.mergeContentValues({ [accountKey]: custom })[accountKey], custom);
});

const captureDir = process.env.QRG_EMAIL_CAPTURE_DIR;
if (captureDir) {
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(path.join(captureDir, "service-review.html"), renderer.renderBrandedTransactionalEmail(baseEmail).htmlContent);
  const providerFixtures = [
    ["supabase-confirmation.html", "confirmation"],
    ["supabase-recovery.html", "recovery"],
    ["supabase-magic-link.html", "magic-link"]
  ];
  for (const [name, id] of providerFixtures) {
    const source = fs.readFileSync(path.resolve(webRoot, "../../docs/provider-email-templates", name), "utf8");
    const rendered = source.replaceAll("{{ .ConfirmationURL }}", `https://www.qrguitar.com/auth/confirm?type=${id}&token_hash=sample-token`);
    fs.writeFileSync(path.join(captureDir, name), rendered);
  }
}
