import { NextResponse } from "next/server";
import { getAdminContext } from "../../../../lib/admin-auth";
import {
  createSitePreviewToken,
  safePreviewPath,
  sitePreviewCookie,
  sitePreviewMaxAge,
  verifySitePreviewToken
} from "../../../../lib/site-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Robots-Tag": "noindex, nofollow" };
const previewFrameHeaders = {
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Frame-Options": "SAMEORIGIN"
};

function getBrowserOrigin(request: Request, fallback: URL) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return fallback.origin;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
    ? forwardedProtocol
    : fallback.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export async function POST(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin.ok || !admin.user) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status, headers: noStoreHeaders });
  }
  const token = createSitePreviewToken(admin.user.id);
  if (!token) {
    return NextResponse.json({ ok: false, message: "Secure preview signing is unavailable." }, { status: 503, headers: noStoreHeaders });
  }
  return NextResponse.json({ ok: true, token, expiresIn: sitePreviewMaxAge }, { headers: noStoreHeaders });
}

export async function DELETE(request: Request) {
  const admin = await getAdminContext(request);
  if (!admin.ok || !admin.user) {
    return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status, headers: noStoreHeaders });
  }
  const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  response.cookies.set(sitePreviewCookie, "published", {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: sitePreviewMaxAge
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!verifySitePreviewToken(token)) {
    return new NextResponse("Preview link expired. Refresh it from Site Editor.", { status: 401, headers: noStoreHeaders });
  }
  const path = safePreviewPath(url.searchParams.get("path"));
  const response = url.searchParams.get("prepare") === "1"
    ? NextResponse.json({ ok: true, path }, { headers: noStoreHeaders })
    : NextResponse.redirect(new URL(`${path}?cmsPreview=draft`, getBrowserOrigin(request, url)), 307);
  response.headers.set("Cache-Control", noStoreHeaders["Cache-Control"]);
  response.headers.set("X-Robots-Tag", noStoreHeaders["X-Robots-Tag"]);
  response.headers.set("Content-Security-Policy", previewFrameHeaders["Content-Security-Policy"]);
  response.headers.set("X-Frame-Options", previewFrameHeaders["X-Frame-Options"]);
  response.cookies.set(sitePreviewCookie, token || "", {
    httpOnly: true,
    sameSite: "strict",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: sitePreviewMaxAge
  });
  return response;
}
