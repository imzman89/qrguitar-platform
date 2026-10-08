import { NextResponse } from "next/server";
import { getAdminContext } from "../../../../lib/admin-auth";
import { createSitePreviewToken, safePreviewPath, sitePreviewCookie, sitePreviewMaxAge } from "../../../../lib/site-preview";
import { isSitePreviewAuthorized } from "../../../../lib/site-preview-server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStoreHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Robots-Tag": "noindex, nofollow" };
function cookieOptions(request: Request, maxAge: number) {
  return { httpOnly: true, sameSite: "strict" as const, secure: new URL(request.url).protocol === "https:", path: "/", maxAge };
}
function crossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const port = requestUrl.port ? `:${requestUrl.port}` : "";
  // NextRequest normalizes loopback URLs; restore the exact Host, not an alias whitelist.
  if (requestUrl.hostname === "localhost" && (host === `127.0.0.1${port}` || host === `[::1]${port}`)) requestUrl.host = host;
  return request.headers.get("sec-fetch-site") === "cross-site" || Boolean(origin && origin !== requestUrl.origin);
}
export async function POST(request: Request) {
  if (crossOrigin(request)) return NextResponse.json({ ok: false, message: "Same-origin preview request required." }, { status: 403, headers: noStoreHeaders });
  const admin = await getAdminContext(request);
  if (!admin.ok || !admin.user) return NextResponse.json({ ok: false, message: admin.message }, { status: admin.status, headers: noStoreHeaders });
  const body = await request.json().catch(() => null) as { expectedActorId?: string; path?: string } | null;
  if (body?.expectedActorId !== admin.user.id) return NextResponse.json({ ok: false, message: "The signed-in editor changed. Reload Site Editor." }, { status: 403, headers: noStoreHeaders });
  const token = createSitePreviewToken(admin.user.id);
  if (!token) return NextResponse.json({ ok: false, message: "Secure preview signing is unavailable." }, { status: 503, headers: noStoreHeaders });
  if (!await isSitePreviewAuthorized(token, createServerSupabaseClient(), admin.user.id)) {
    return NextResponse.json({ ok: false, message: "Preview access could not be confirmed. Reload Site Editor." }, { status: 403, headers: noStoreHeaders });
  }
  // The signed capability is only an HttpOnly cookie, never response JSON or a query URL.
  const response = NextResponse.json({ ok: true, path: safePreviewPath(body?.path), editorActorId: admin.user.id, expiresIn: sitePreviewMaxAge }, { headers: noStoreHeaders });
  response.cookies.set(sitePreviewCookie, token, cookieOptions(request, sitePreviewMaxAge));
  return response;
}
export async function DELETE(request: Request) {
  if (crossOrigin(request)) return NextResponse.json({ ok: false }, { status: 403, headers: noStoreHeaders });
  // Clearing one's own browser cookie must work after signout or editor revocation.
  const response = NextResponse.json({ ok: true }, { headers: noStoreHeaders });
  response.cookies.set(sitePreviewCookie, "", cookieOptions(request, 0));
  return response;
}
export async function GET() {
  return NextResponse.json({ ok: false, message: "Open previews from the signed-in Site Editor." }, { status: 410, headers: noStoreHeaders });
}
