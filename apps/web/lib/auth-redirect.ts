/** Keep account redirects within this app, including encoded URL variants. */
export function safeAuthRedirect(value: string | null, fallback = "/dashboard") {
  if (!value) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u0020]/.test(decoded)) return fallback;
    const url = new URL(value, "https://qrguitar.invalid");
    if (url.origin !== "https://qrguitar.invalid" || /^\/(login|reset-password)\/?$/i.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
