import { NextRequest, NextResponse } from "next/server";

const LEGACY_HANDOUT_CODE = "QRG-E9DFA48DCC74";
const CANONICAL_HANDOUT_CODE = "QRG-SI98092154";

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/handout\/([^/]+)$/i);
  if (!match || decodeURIComponent(match[1]).toUpperCase() !== LEGACY_HANDOUT_CODE) {
    return NextResponse.next();
  }

  const canonicalUrl = request.nextUrl.clone();
  canonicalUrl.pathname = `/handout/${CANONICAL_HANDOUT_CODE}`;
  return NextResponse.redirect(canonicalUrl, 308);
}

export const config = {
  matcher: ["/handout/:path*"]
};
