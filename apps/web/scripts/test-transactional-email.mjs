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

test("email ownership map exposes only one application sender and honest provider exports", () => {
  assert.deepEqual(boundary.emailTemplateDeliveryBoundary("email.service.submitted"), {
    kind: "application",
    owner: "qrguitar-brevo",
    canSendApplicationTest: true,
    providerTemplate: null,
    providerArtifact: null
  });
  const recovery = boundary.emailTemplateDeliveryBoundary("email.security.passwordReset");
  assert.equal(recovery.kind, "provider");
  assert.equal(recovery.providerTemplate, "recovery");
  const preview = boundary.emailTemplateDeliveryBoundary("email.claim.approved");
  assert.equal(preview.kind, "preview");
  assert.equal(preview.canSendApplicationTest, false);
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
