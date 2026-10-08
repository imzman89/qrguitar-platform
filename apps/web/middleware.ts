import { NextRequest, NextResponse } from "next/server";
import { isCheckoutPath, securityHeaders } from "./lib/security-headers";
import { isNoindexPathname } from "./lib/search-indexing";

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
  const draftPreviewRequest = request.nextUrl.searchParams.get("cmsPreview") === "draft";
  const publishedPreviewRequest = request.nextUrl.searchParams.get("cmsPreview") === "published";
  const requestHeaders = new Headers(request.headers);
  if (draftPreviewRequest) requestHeaders.set("x-qrguitar-site-preview", "draft");
  else requestHeaders.delete("x-qrguitar-site-preview");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (isNoindexPathname(request.nextUrl.pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (request.nextUrl.pathname === "/api/site-editor/preview" || draftPreviewRequest || publishedPreviewRequest) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    for (const header of securityHeaders({ preview: true, checkout: isCheckoutPath(request.nextUrl.pathname) })) {
      response.headers.set(header.key, header.value);
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
