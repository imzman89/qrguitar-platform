import { NextRequest, NextResponse } from "next/server";

const SITE_PREVIEW_COOKIE = "qrguitar_site_preview";

const sitePreviewCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co",
  "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
      "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
].join("; ");

const LEGACY_HANDOUT_CODE = "QRG-E9DFA48DCC74";
const CANONICAL_HANDOUT_CODE = "QRG-SI98092154";

export function middleware(request: NextRequest) {
  const requestHost = request.headers.get("host")?.toLowerCase();
  if (
    process.env.NODE_ENV !== "production"
    && requestHost === "localhost:3003"
  ) {
    const canonicalLocalUrl = request.nextUrl.clone();
    canonicalLocalUrl.hostname = "127.0.0.1";
    return NextResponse.redirect(canonicalLocalUrl, 307);
  }

  const match = request.nextUrl.pathname.match(/^\/handout\/([^/]+)$/i);
  if (match && decodeURIComponent(match[1]).toUpperCase() === LEGACY_HANDOUT_CODE) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = `/handout/${CANONICAL_HANDOUT_CODE}`;
    return NextResponse.redirect(canonicalUrl, 308);
  }
  const response = NextResponse.next();
  if (request.nextUrl.pathname === "/api/site-editor/preview" || request.cookies.has(SITE_PREVIEW_COOKIE)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Content-Security-Policy", sitePreviewCsp);
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
