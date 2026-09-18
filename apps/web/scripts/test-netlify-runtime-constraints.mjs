import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  assertNetlifyRuntimeConstraints,
  netlifyRuntimeConstraintViolations
} from "../../../scripts/check-netlify-runtime-constraints.mjs";
import {
  PAYPAL_SWEEP_SCHEDULE,
  PAYPAL_SWEEP_TIMEOUT_MS,
  PAYPAL_SWEEP_URL,
  config as paypalSweepConfig,
  runPayPalWebhookSweepSchedule
} from "../../../netlify/functions/paypal-webhook-sweep.mjs";

const safeScheduler = `
export const PAYPAL_SWEEP_SCHEDULE = "*/5 * * * *";
export const PAYPAL_SWEEP_TIMEOUT_MS = 15000;
export const PAYPAL_SWEEP_URL = "https://www.qrguitar.com/api/internal/paypal-webhook-sweep";
export const config = { schedule: "*/5 * * * *" };
export default async function handler() {}
`;

const safeNetlifyConfig = `
[[redirects]]
  from = "/api/billing/paypal/webhook"
  to = "/api/billing/paypal/webhook"
  [redirects.rate_limit]
    window_limit = 300
    window_size = 60
    aggregate_by = ["ip", "domain"]

[[redirects]]
  from = "/api/internal/paypal-webhook-sweep"
  to = "/api/internal/paypal-webhook-sweep"
  [redirects.rate_limit]
    window_limit = 12
    window_size = 60
    aggregate_by = ["ip", "domain"]
`;

function fixture(route, editor, scheduler = safeScheduler, netlifyConfig = safeNetlifyConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-netlify-runtime-"));
  const routeDirectory = path.join(root, "apps", "web", "app", "api", "fixture");
  const editorDirectory = path.join(root, "apps", "web", "app", "edit", "[code]");
  const schedulerDirectory = path.join(root, "netlify", "functions");
  fs.mkdirSync(routeDirectory, { recursive: true });
  fs.mkdirSync(editorDirectory, { recursive: true });
  fs.mkdirSync(schedulerDirectory, { recursive: true });
  fs.writeFileSync(path.join(routeDirectory, "route.ts"), route);
  fs.writeFileSync(path.join(editorDirectory, "page.tsx"), editor);
  fs.writeFileSync(path.join(schedulerDirectory, "paypal-webhook-sweep.mjs"), scheduler);
  fs.writeFileSync(path.join(root, "netlify.toml"), netlifyConfig);
  return root;
}

function removeFixture(root) {
  const absolute = path.resolve(root);
  if (
    path.dirname(absolute) !== path.resolve(os.tmpdir()) ||
    !path.basename(absolute).startsWith("qrguitar-netlify-runtime-")
  ) throw new Error("Unsafe Netlify runtime fixture cleanup path.");
  fs.rmSync(absolute, { recursive: true, force: true });
}

const safeProfilePatch = `
function buildInstrument() {
  return { heroImageDataUrl: form.heroImageDataUrl, galleryImageDataUrls: galleryImages };
}
fetch("/api/instruments", {
  method: "PATCH",
  body: JSON.stringify({
    heroImagePath: staged.photoPaths[mainPhotoIndex] || staged.photoPaths[0],
    photos: staged.photoPaths,
    documents: documents.map((document, index) => ({
      name: document.name,
      storagePath: staged.documentPaths[index]
    }))
  })
});
fetch("/api/instruments", {
  method: "PATCH",
  body: JSON.stringify({ verificationOnly: true })
});
`;

test("Netlify runtime preflight accepts bounded functions and metadata-only edits", () => {
  const root = fixture("export const maxDuration = 60;\n", safeProfilePatch);
  try {
    assert.deepEqual(netlifyRuntimeConstraintViolations(root), []);
    assert.doesNotThrow(() => assertNetlifyRuntimeConstraints(root));
  } finally {
    removeFixture(root);
  }
});

test("Netlify runtime preflight blocks long synchronous functions", () => {
  const root = fixture("export const maxDuration = 120;\n", safeProfilePatch);
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /120.*60 seconds/);
    assert.throws(() => assertNetlifyRuntimeConstraints(root), /compatibility check failed/);
  } finally {
    removeFixture(root);
  }
});

for (const [name, fields, expected] of [
  [
    "hero data URL",
    "heroImageDataUrl: form.heroImageDataUrl, photos: staged.photoPaths, documents: documents.map((document, index) => ({ storagePath: staged.documentPaths[index] }))",
    /inline hero/
  ],
  [
    "gallery data URLs",
    "heroImagePath: staged.photoPaths[0], photos: galleryImages, documents: documents.map((document, index) => ({ storagePath: staged.documentPaths[index] }))",
    /gallery|staged photo-path/
  ],
  [
    "document data URL",
    "heroImagePath: staged.photoPaths[0], photos: staged.photoPaths, documents: documents.map((document) => ({ dataUrl: document.dataUrl }))",
    /document data|document storage paths/
  ]
]) {
  test("Netlify runtime preflight blocks inline " + name + " in the Profile PATCH", () => {
    const editor = `fetch("/api/instruments", { method: "PATCH", body: JSON.stringify({ ${fields} }) });`;
    const root = fixture("export const maxDuration = 60;\n", editor);
    try {
      const violations = netlifyRuntimeConstraintViolations(root);
      assert.equal(violations.length, 1);
      assert.match(violations[0], expected);
      assert.match(violations[0], /6 MB/);
    } finally {
      removeFixture(root);
    }
  });
}

test("Netlify runtime preflight fails closed on an uninspectable Profile PATCH body", () => {
  const root = fixture(
    "export const maxDuration = 60;\n",
    "fetch(\"/api/instruments\", { method: \"PATCH\", body: JSON.stringify(instrument) });\n"
  );
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /not an inspectable JSON object/);
  } finally {
    removeFixture(root);
  }
});

test("Netlify runtime preflight requires the exact bounded production recovery schedule", () => {
  const unsafeScheduler = `
    export const PAYPAL_SWEEP_SCHEDULE = "@hourly";
    export const PAYPAL_SWEEP_TIMEOUT_MS = 30000;
    export const PAYPAL_SWEEP_URL = "https://preview.invalid/api/internal/paypal-webhook-sweep";
    export const config = { schedule: PAYPAL_SWEEP_SCHEDULE };
  `;
  const root = fixture("export const maxDuration = 60;\n", safeProfilePatch, unsafeScheduler);
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 4);
    assert.match(violations.join("\n"), /five-minute intervals/);
    assert.match(violations.join("\n"), /30-second/);
    assert.match(violations.join("\n"), /canonical production/);
    assert.match(violations.join("\n"), /default Netlify handler/);
  } finally {
    removeFixture(root);
  }
});

test("Netlify runtime preflight requires both reviewed payment self-rewrite limits", () => {
  const unsafeNetlifyConfig = `
    [[redirects]]
      from = "/api/billing/paypal/webhook"
      to = "/different-target"
      [redirects.rate_limit]
        window_limit = 299
        window_size = 60
        aggregate_by = ["ip", "domain"]
  `;
  const root = fixture("export const maxDuration = 60;\n", safeProfilePatch, safeScheduler, unsafeNetlifyConfig);
  try {
    const violations = netlifyRuntimeConstraintViolations(root);
    assert.equal(violations.length, 2);
    assert.match(violations[0], /\/api\/billing\/paypal\/webhook/);
    assert.match(violations[1], /\/api\/internal\/paypal-webhook-sweep/);
  } finally {
    removeFixture(root);
  }
});

test("Netlify PayPal schedule authenticates one bounded canonical request without logging data", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const messages = [];
  let call;
  const result = await runPayPalWebhookSweepSchedule({
    environment: { CRON_SECRET: secret },
    fetchImpl: async (url, options) => {
      call = { url, options };
      return Response.json({
        ok: true,
        claimed: 1,
        applied: 1,
        completed: 1,
        quarantined: 0,
        deadlineReached: false
      });
    },
    logger: {
      info: message => messages.push(message),
      error: message => messages.push(message)
    }
  });

  assert.equal(PAYPAL_SWEEP_SCHEDULE, "*/5 * * * *");
  assert.deepEqual(paypalSweepConfig, { schedule: PAYPAL_SWEEP_SCHEDULE });
  assert(PAYPAL_SWEEP_TIMEOUT_MS > 0 && PAYPAL_SWEEP_TIMEOUT_MS < 30000);
  assert.equal(call.url, PAYPAL_SWEEP_URL);
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.redirect, "error");
  assert.equal(call.options.cache, "no-store");
  assert.equal(call.options.headers.Authorization, `Bearer ${secret}`);
  assert(call.options.signal instanceof AbortSignal);
  assert.equal(result.completed, 1);
  assert.deepEqual(messages, ["PayPal webhook sweep schedule completed successfully."]);
  assert(!messages.join(" ").includes(secret));
});

test("Netlify PayPal schedule fails closed without exposing configuration or response data", async () => {
  const secret = "fedcba9876543210fedcba9876543210";
  const privateBody = "payer@example.invalid provider-record-secret";
  for (const scenario of [
    {
      environment: { CRON_SECRET: "short" },
      fetchImpl: async () => { throw new Error("must not run"); },
      expected: /CRON_SECRET is missing or invalid/
    },
    {
      environment: { CRON_SECRET: secret },
      fetchImpl: async () => new Response(privateBody, { status: 503 }),
      expected: /endpoint HTTP 503/
    },
    {
      environment: { CRON_SECRET: secret },
      fetchImpl: async () => Response.json({ ok: true, claimed: 9 }),
      expected: /endpoint result was invalid/
    }
  ]) {
    const messages = [];
    await assert.rejects(
      () => runPayPalWebhookSweepSchedule({
        ...scenario,
        logger: {
          info: message => messages.push(message),
          error: message => messages.push(message)
        }
      }),
      scenario.expected
    );
    const output = messages.join(" ");
    assert(!output.includes(secret));
    assert(!output.includes(privateBody));
  }
});
