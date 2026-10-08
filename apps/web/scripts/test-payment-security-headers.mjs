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
function compileCheckout(relative, imports, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(web, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
const checkout = compileCheckout("lib/checkout-navigation.ts", { "./security-headers": policy });
function checkoutLink(pathname, props) {
  const navigations = [];
  const Component = compileCheckout("components/CheckoutAwareLink.tsx", {
    "next/link": { __esModule: true, default: "NextLink" },
    "next/navigation": { usePathname: () => pathname },
    "../lib/checkout-navigation": checkout
  }, { window: { location: { assign: href => navigations.push(["assign", href]), replace: href => navigations.push(["replace", href]) } } }).default;
  return { element: Component(props), navigations };
}
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

test("production forbids eval while development keeps framework debugging support", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal(sources(headerMap(policy.securityHeaders()), "script-src").includes("'unsafe-eval'"), false);
    assert.equal(sources(headerMap(policy.securityHeaders({ checkout: true })), "script-src").includes("'unsafe-eval'"), false);
    process.env.NODE_ENV = "development";
    assert.equal(sources(headerMap(policy.securityHeaders()), "script-src").includes("'unsafe-eval'"), true);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
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

function ruleMatches(source, pathname) {
  if (source === "/:path*") return true;
  if (source === "/api/:path*") return pathname === "/api" || pathname.startsWith("/api/");
  if (source === "/billing/:path*") return pathname === "/billing" || pathname.startsWith("/billing/");
  const privateTree = source.match(/^\/:privatePath\(([^)]+)\)\/:path\*$/);
  if (!privateTree) return false;
  const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
  return privateTree[1].split("|").includes(firstSegment);
}

function configuredHeaders(rules, pathname) {
  const values = new Map();
  for (const rule of rules) {
    if (!ruleMatches(rule.source, pathname)) continue;
    for (const header of rule.headers) values.set(header.key.toLowerCase(), header.value);
  }
  return new Headers(values);
}

test("Next configuration does not globally force public routes no-store while private and API trees stay no-store", async () => {
  assert.equal(nextConfig.poweredByHeader, false);
  const rules = await nextConfig.headers();
  assert.deepEqual(rules.map(rule => rule.source), [
    "/:path*",
    "/api/:path*",
    "/:privatePath(account|admin|create|dashboard|edit|handout|login|messages|ownership-claim|reset-password|service-review|service-work|site-editor|transfer)/:path*",
    "/billing/:path*"
  ]);

  for (const pathname of ["/", "/contact", "/privacy", "/terms", "/installers", "/collections/example", "/i/QRG-EXAMPLE", "/_next/static/chunk.js", "/favicon.ico"]) {
    const headers = configuredHeaders(rules, pathname);
    assert.equal(headers.get("cache-control"), null, `${pathname} must not be forced no-store by route configuration`);
    assert.ok(headers.get("content-security-policy"), `${pathname} keeps global security headers`);
    assert.equal(permits(headers, "frame-src", "https://www.paypal.com/"), false);
  }

  for (const pathname of [
    "/api", "/api/health", "/account", "/account/security", "/admin", "/admin/payments",
    "/create", "/dashboard", "/dashboard/profile/QRG-EXAMPLE", "/edit/QRG-EXAMPLE",
    "/handout/QRG-EXAMPLE", "/login", "/messages", "/messages/example", "/ownership-claim",
    "/reset-password", "/service-review/example", "/service-work/QRG-EXAMPLE", "/site-editor", "/transfer/example"
  ]) {
    assert.match(configuredHeaders(rules, pathname).get("cache-control") || "", /no-store/, `${pathname} must stay no-store`);
  }

  for (const pathname of ["/api/health", "/account", "/billing/return"]) {
    assert.match(configuredHeaders(rules, pathname).get("cache-control") || "", /^private, no-store/, pathname + " must prohibit shared caching");
  }

  const general = configuredHeaders(rules, "/contact");
  const checkout = configuredHeaders(rules, "/billing/return");
  assert.equal(permits(general, "frame-src", "https://www.paypal.com/"), false);
  assert.match(checkout.get("cache-control") || "", /no-store/);
  assert.ok(permits(checkout, "frame-src", "https://www.paypal.com/"));
  for (const pathname of ["/billing", "/billing/return", "/billing/cancel"]) assert.equal(policy.isCheckoutPath(pathname), true);
  for (const pathname of ["/", "/login", "/billing-other", "/api/billing/checkout", "/admin/payments"]) assert.equal(policy.isCheckoutPath(pathname), false);
});

const middlewareCode = ts.transpileModule(fs.readFileSync(path.join(web, "middleware.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function middleware(pathname, { previewCookie = false, previewHeader = "" } = {}) {
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", middlewareCode)(name => {
    if (name === "next/server") return { NextResponse: { next: ({ request } = {}) => {
      const response = new Response(null);
      Object.defineProperty(response, "forwardedHeaders", { value: new Headers(request?.headers) });
      return response;
    }, redirect: (url, status) => new Response(null, { status, headers: { location: String(url) } }) } };
    if (name === "./lib/security-headers") return policy;
    if (name === "./lib/search-indexing") return indexing;
    throw Error(`Unexpected middleware import: ${name}`);
  }, module, module.exports, { env: { NODE_ENV: "production" } });
  const headers = new Headers({ host: "www.qrguitar.com" });
  if (previewHeader) headers.set("x-qrguitar-site-preview", previewHeader);
  return module.exports.middleware({ headers, nextUrl: new URL(pathname, "https://www.qrguitar.com"), cookies: { has: name => previewCookie && name === "qrguitar_site_preview" } });
}

test("an explicit draft query activates preview headers and forwards only the internal draft marker", () => {
  for (const pathname of ["/?cmsPreview=draft", "/login?cmsPreview=draft"]) {
    const response = middleware(pathname);
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.deepEqual(sources(response.headers, "frame-ancestors"), ["'self'"]);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(response.headers.get("permissions-policy"), /payment=\(\)/);
    assert.equal(permits(response.headers, "script-src", "https://www.paypal.com/sdk/js"), false);
    assert.equal(response.forwardedHeaders.get("x-qrguitar-site-preview"), "draft");
  }
});

test("the site-editor preview endpoint always receives preview response headers", () => {
  const response = middleware("/api/site-editor/preview");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.deepEqual(sources(response.headers, "frame-ancestors"), ["'self'"]);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.forwardedHeaders.get("x-qrguitar-site-preview"), null);
});

test("a preview cookie alone cannot activate draft preview or preserve a spoofed marker", () => {
  for (const previewHeader of ["", "draft"]) {
    const response = middleware("/catalog", { previewCookie: true, previewHeader });
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("x-frame-options"), null);
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.equal(response.headers.get("cache-control"), null);
    assert.equal(response.forwardedHeaders.get("x-qrguitar-site-preview"), null);
  }
});

test("draft billing preview keeps checkout SDK permissions inside preview restrictions", () => {
  const response = middleware("/billing?cmsPreview=draft");
  assert.ok(permits(response.headers, "script-src", "https://www.paypal.com/sdk/js"));
  assert.ok(permits(response.headers, "script-src", "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"));
  assert.ok(permits(response.headers, "frame-src", "https://applepay.cdn-apple.com/"));
  assert.deepEqual(sources(response.headers, "frame-ancestors"), ["'self'"]);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("permissions-policy"), /payment=\(self /);
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
  assert.equal(response.forwardedHeaders.get("x-qrguitar-site-preview"), "draft");
});

test("ordinary middleware requests do not relax global frame or payment restrictions", () => {
  const response = middleware("/billing");
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.equal(response.headers.get("permissions-policy"), null);
  assert.equal(response.forwardedHeaders.get("x-qrguitar-site-preview"), null);
});

test("checkout boundary classification keeps prefixes, relative anchors, queries and external destinations distinct", () => {
  for (const [current, destination] of [["/account", "/billing"], ["/", "/billing/paypal/return?orderId=kept#receipt"], ["/billing", "/account"], ["/billing/paypal/cancel", "/login?next=%2Fbilling"], ["/", "https://www.qrguitar.com/billing"], ["/", "https://qrguitar.com/billing/manual"]]) assert.equal(checkout.crossesCheckoutBoundary(current, destination), true, `${current} -> ${destination}`);
  for (const [current, destination] of [["/account", "/dashboard"], ["/billing", "/billing/paypal/return?orderId=kept"], ["/billing?orderId=kept", "#receipt"], ["/billing", "?orderId=kept"], ["/billing/paypal/return", "../cancel"], ["/", "/billing-other"], ["/", "/api/billing/paypal/status"], ["/", "https://www.paypal.com/checkoutnow"], ["/", "https://www.qrguitar.com.evil.invalid/billing"], ["/", "mailto:support@qrguitar.com"]]) assert.equal(checkout.crossesCheckoutBoundary(current, destination), false, `${current} -> ${destination}`);
});

test("real checkout link replaces a blocked ordinary document with the destination payment policy", async () => {
  const destination = "/billing?orderId=kept#receipt", f = checkoutLink("/account", { href: destination, prefetch: true, children: "Profile credits", className: "unchanged", "aria-label": "Profile credits" });
  assert.equal(f.element.type, "NextLink"); assert.equal(f.element.props.href, destination); assert.equal(f.element.props.prefetch, false);
  assert.equal(f.element.props.className, "unchanged"); assert.equal(f.element.props["aria-label"], "Profile credits");
  let prevented = 0; f.element.props.onNavigate({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.deepEqual(f.navigations, [["assign", destination]]);
  const rules = await nextConfig.headers();
  assert.equal(permits(configuredHeaders(rules, "/account"), "script-src", "https://www.paypal.com/sdk/js"), false);
  assert.equal(permits(configuredHeaders(rules, new URL(f.navigations[0][1], "https://www.qrguitar.com").pathname), "script-src", "https://www.paypal.com/sdk/js"), true);
});

test("real checkout exit loads ordinary restrictive headers and preserves replace-history intent", async () => {
  const destination = "/account?section=access#credits", f = checkoutLink("/billing", { href: destination, replace: true });
  let prevented = false; f.element.props.onNavigate({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(f.navigations, [["replace", destination]]);
  const headers = configuredHeaders(await nextConfig.headers(), "/account");
  assert.equal(permits(headers, "script-src", "https://www.paypal.com/sdk/js"), false); assert.match(headers.get("permissions-policy"), /payment=\(\)/);
});

test("same-policy links keep Next navigation, prefetch and native target/click behavior", () => {
  for (const [current, href] of [["/account", "/dashboard"], ["/billing", "/billing/manual"], ["/billing", "#packs"], ["/billing", "?orderId=kept"]]) {
    const f = checkoutLink(current, { href, prefetch: true }); assert.equal(f.element.props.onNavigate, undefined); assert.equal(f.element.props.prefetch, true); assert.deepEqual(f.navigations, []);
  }
  const onClick = () => {}, f = checkoutLink("/create", { href: "/billing", target: "_blank", rel: "noopener noreferrer", onClick });
  // NextLink owns modifier/new-tab behavior and invokes onNavigate only for its
  // same-tab client navigations. The wrapper does not intercept native clicks.
  assert.equal(f.element.props.target, "_blank"); assert.equal(f.element.props.rel, "noopener noreferrer"); assert.equal(f.element.props.onClick, onClick); assert.deepEqual(f.navigations, []);
});

test("auth completion uses document replacement only when crossing the checkout boundary", () => {
  const routed = [], replaced = [], router = { replace: href => routed.push(href) }, location = { replace: href => replaced.push(href) };
  checkout.replaceWithCheckoutPolicy("/login", "/billing/paypal/return?orderId=kept", router, location);
  checkout.replaceWithCheckoutPolicy("/reset-password", "/billing#packs", router, location);
  checkout.replaceWithCheckoutPolicy("/login", "/account", router, location);
  assert.deepEqual(replaced, ["/billing/paypal/return?orderId=kept", "/billing#packs"]); assert.deepEqual(routed, ["/account"]);
});
