// PayPal's supported SDK host groups; never allow arbitrary HTTPS payment sources.
// https://developer.paypal.com/sdk/js/v5/best-practices/
const paypalSources = "https://*.paypal.com https://*.paypalobjects.com https://*.venmo.com";
// Apple's SDK requires this exact CDN origin for scripts, images, and its modal frame.
// https://developer.apple.com/documentation/applepayontheweb/loading-the-latest-version-of-apple-pay-js
const applePaySdkSource = "https://applepay.cdn-apple.com";
// Exact GA4 collection origins only. Advertising endpoints stay excluded.
const googleAnalyticsScriptSource = "https://www.googletagmanager.com";
const googleAnalyticsCollectionSources = "https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://region1.analytics.google.com";

type SecurityHeaderOptions = Readonly<{
  checkout?: boolean;
  ga4MeasurementId?: string;
  optionalTrackingPurposes?: string;
  preview?: boolean;
}>;

function googleAnalyticsEnabled(options: SecurityHeaderOptions) {
  const measurementId = "ga4MeasurementId" in options
    ? options.ga4MeasurementId
    : process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;
  const purposes = "optionalTrackingPurposes" in options
    ? options.optionalTrackingPurposes
    : process.env.NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES;
  const id = (measurementId || "").trim();
  const requested = (purposes || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const validPurposes = requested.length > 0 && requested.every(value => value === "analytics" || value === "advertising");
  return /^G-[A-Z0-9]{6,20}$/.test(id) && validPurposes && requested.includes("analytics");
}

export function isCheckoutPath(pathname: string) {
  return pathname === "/billing" || pathname.startsWith("/billing/");
}

export function contentSecurityPolicy(options: SecurityHeaderOptions = {}) {
  const { preview = false, checkout = false } = options;
  const paymentSources = checkout ? ` ${paypalSources}` : "";
  const appleSource = checkout ? ` ${applePaySdkSource}` : "";
  const analytics = googleAnalyticsEnabled(options);
  const analyticsScript = analytics ? ` ${googleAnalyticsScriptSource}` : "";
  const analyticsCollection = analytics ? ` ${googleAnalyticsCollectionSources}` : "";
  const analyticsImage = analytics ? ` ${googleAnalyticsCollectionSources} ${googleAnalyticsScriptSource}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'unsafe-inline'${paymentSources}${appleSource}${analyticsScript}`,
    `style-src 'self' 'unsafe-inline'${paymentSources}${appleSource}`,
    `img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co${paymentSources}${appleSource}${analyticsImage}`,
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co${paymentSources}${analyticsCollection}${analyticsScript}`,
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

export function securityHeaders(options: SecurityHeaderOptions = {}) {
  const { preview = false, checkout = false } = options;
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: preview ? "SAMEORIGIN" : "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy(checkout) },
    ...(checkout ? [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] : [])
  ];
}
