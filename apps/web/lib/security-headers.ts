// PayPal's supported SDK host groups; never allow arbitrary HTTPS payment sources.
// https://developer.paypal.com/sdk/js/v5/best-practices/
const paypalSources = "https://*.paypal.com https://*.paypalobjects.com https://*.venmo.com";
// Apple's SDK requires this exact CDN origin for scripts, images, and its modal frame.
// https://developer.apple.com/documentation/applepayontheweb/loading-the-latest-version-of-apple-pay-js
const applePaySdkSource = "https://applepay.cdn-apple.com";

export function isCheckoutPath(pathname: string) {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

export function contentSecurityPolicy({ preview = false, checkout = false }: { preview?: boolean; checkout?: boolean } = {}) {
  const paymentSources = checkout ? ` ${paypalSources}` : "";
  const appleSource = checkout ? ` ${applePaySdkSource}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'unsafe-inline'${paymentSources}${appleSource}`,
    `style-src 'self' 'unsafe-inline'${paymentSources}${appleSource}`,
    `img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co${paymentSources}${appleSource}`,
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co${paymentSources}`,
    `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com${paymentSources}${appleSource}`,
    ...(checkout ? [`child-src 'self' ${paypalSources}`] : []),
    `frame-ancestors '${preview ? "self" : "none"}'`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

export function permissionsPolicy(checkout = false) {
  const payment = checkout ? '(self "https://www.paypal.com" "https://www.sandbox.paypal.com")' : "()";
  return `camera=(), microphone=(), geolocation=(), payment=${payment}, usb=(), bluetooth=(), interest-cohort=()`;
}

export function securityHeaders({ preview = false, checkout = false }: { preview?: boolean; checkout?: boolean } = {}) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ preview, checkout }) },
    { key: "X-Frame-Options", value: preview ? "SAMEORIGIN" : "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy(checkout) },
    ...(checkout ? [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] : [])
  ];
}
