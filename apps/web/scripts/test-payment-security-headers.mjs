import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import nextConfig from "../next.config.mjs";
import * as policy from "../lib/security-headers.ts";
import * as indexing from "../lib/search-indexing.ts";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url), ts = require("typescript");
const headerMap = values => new Headers(values.map(({ key, value }) => [key, value]));
function sources(headers, directive) {
  const directives = headers.get("content-security-policy").split(";").map(value => value.trim().split(/\s+/));
  return directives.find(value => value[0] === directive)?.slice(1) || [];
}
function permits(headers, directive, address) {
  const url = new URL(address);
  return sources(headers, directive).some(source => {
    if (source === "'self'") return url.origin === "https://www.qrguitar.com";
    if (!source.startsWith("https://")) return false;
    if (source.startsWith("https://*.")) {
      const suffix = source.slice("https://*".length);
      return url.protocol === "https:" && url.hostname.endsWith(suffix) && !url.port;
    }
    return url.origin === source;
  });
}

test("checkout permits official SDK, frame and API origins while rejecting lookalikes", () => {
  const headers = headerMap(policy.securityHeaders({ checkout: true }));
  for (const directive of ["script-src", "connect-src", "frame-src", "child-src", "img-src", "style-src"]) {
    for (const address of ["https://www.paypal.com/sdk/js", "https://www.sandbox.paypal.com/checkoutnow", "https://www.paypalobjects.com/sdk/icon.svg", "https://account.venmo.com/"]) assert.ok(permits(headers, directive, address), `${directive}: ${address}`);
    for (const address of ["https://paypal.com.evil.invalid/", "https://evilpaypal.com/", "http://www.paypal.com/", "https://untrusted.invalid/", "https://www.paypal.com:444/"]) assert.equal(permits(headers, directive, address), false, `${directive}: ${address}`);
  }
  assert.ok(permits(headers, "script-src", "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"));
  assert.equal(permits(headers, "script-src", "https://cdn-apple.com/"), false);
  assert.ok(permits(headers, "frame-src", "https://applepay.cdn-apple.com/"));
});

test("Apple Pay allows only its exact CDN frame and leaves unrelated origins and features blocked", () => {
  const checkout = headerMap(policy.securityHeaders({ checkout: true }));
  const ordinary = headerMap(policy.securityHeaders());
  for (const directive of ["script-src", "img-src", "frame-src"]) {
    assert.ok(permits(checkout, directive, "https://applepay.cdn-apple.com/"));
    assert.equal(permits(ordinary, directive, "https://applepay.cdn-apple.com/"), false);
    for (const address of ["https://cdn-apple.com/", "https://other.cdn-apple.com/", "https://applepay.cdn-apple.com.evil.invalid/", "http://applepay.cdn-apple.com/", "https://applepay.cdn-apple.com:444/"]) assert.equal(permits(checkout, directive, address), false);
  }
  // Native ApplePaySession executes in our top frame; the CDN modal is a display frame.
  assert.match(checkout.get("permissions-policy"), /payment=\(self /);
  assert.ok(!checkout.get("permissions-policy").includes("cdn-apple.com"));
  assert.equal(permits(checkout, "connect-src", "https://smp-paymentservices.apple.com/"), false);
  assert.equal(permits(checkout, "frame-src", "https://pay.apple.com/"), false);
});

test("ordinary pages retain payment isolation and existing media access", () => {
  const headers = headerMap(policy.securityHeaders());
  assert.match(headers.get("permissions-policy"), /payment=\(\)/);
  assert.equal(headers.get("cross-origin-opener-policy"), null);
  assert.equal(permits(headers, "script-src", "https://www.paypal.com/sdk/js"), false);
  assert.equal(permits(headers, "script-src", "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"), false);
  assert.ok(permits(headers, "frame-src", "https://www.youtube-nocookie.com/embed/fixture"));
  assert.ok(permits(headers, "connect-src", "https://fixture.supabase.co/"));
  assert.deepEqual(sources(headers, "frame-ancestors"), ["'none'"]);
  assert.equal(headers.get("x-frame-options"), "DENY");
});

test("checkout permissions allow only same-origin and the two PayPal frame origins", () => {
  const headers = headerMap(policy.securityHeaders({ checkout: true }));
  assert.equal(headers.get("permissions-policy"), 'camera=(), microphone=(), geolocation=(), payment=(self "https://www.paypal.com" "https://www.sandbox.paypal.com"), usb=(), bluetooth=(), interest-cohort=()');
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.deepEqual(sources(headers, "frame-ancestors"), ["'none'"]);
  assert.deepEqual(sources(headers, "form-action"), ["'self'"]);
  assert.deepEqual(sources(headers, "object-src"), ["'none'"]);
  assert.ok(!sources(headers, "script-src").includes("*"));
});

test("Next configuration applies the checkout override only to the billing tree", async () => {
  const rules = await nextConfig.headers();
  assert.deepEqual(rules.map(rule => rule.source), ["/:path*", "/billing/:path*"]);
  const general = headerMap(rules[0].headers), checkout = headerMap(rules[1].headers);
  assert.match(general.get("cache-control"), /no-store/);
  assert.equal(permits(general, "frame-src", "https://www.paypal.com/"), false);
  assert.ok(permits(checkout, "frame-src", "https://www.paypal.com/"));
  for (const pathname of ["/billing", "/billing/return", "/billing/cancel"]) assert.equal(policy.isCheckoutPath(pathname), true);
  for (const pathname of ["/", "/login", "/billing-other", "/api/billing/checkout", "/admin/payments"]) assert.equal(policy.isCheckoutPath(pathname), false);
});

const middlewareCode = ts.transpileModule(fs.readFileSync(path.join(web, "middleware.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function middleware(pathname, preview) {
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", middlewareCode)(name => {
    if (name === "next/server") return { NextResponse: { next: () => new Response(null), redirect: (url, status) => new Response(null, { status, headers: { location: String(url) } }) } };
    if (name === "./lib/security-headers") return policy;
    if (name === "./lib/search-indexing") return indexing;
    throw Error(`Unexpected middleware import: ${name}`);
  }, module, module.exports, { env: { NODE_ENV: "production" } });
  return module.exports.middleware({ headers: new Headers({ host: "www.qrguitar.com" }), nextUrl: new URL(pathname, "https://www.qrguitar.com"), cookies: { has: name => preview && name === "qrguitar_site_preview" } });
}

test("preview middleware preserves same-origin framing, no-index and no-store without granting checkout elsewhere", () => {
  for (const pathname of ["/", "/login", "/api/site-editor/preview"]) {
    const response = middleware(pathname, true);
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.deepEqual(sources(response.headers, "frame-ancestors"), ["'self'"]);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("permissions-policy"), /payment=\(\)/);
    assert.equal(permits(response.headers, "script-src", "https://www.paypal.com/sdk/js"), false);
  }
});

test("an editor preview cookie cannot accidentally disable the real checkout SDK", () => {
  const response = middleware("/billing", true);
  assert.ok(permits(response.headers, "script-src", "https://www.paypal.com/sdk/js"));
  assert.ok(permits(response.headers, "script-src", "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"));
  assert.ok(permits(response.headers, "frame-src", "https://applepay.cdn-apple.com/"));
  assert.deepEqual(sources(response.headers, "frame-ancestors"), ["'self'"]);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("ordinary middleware requests do not relax global frame or payment restrictions", () => {
  const response = middleware("/billing", false);
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.equal(response.headers.get("permissions-policy"), null);
});
