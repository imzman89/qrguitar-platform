const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.qrguitar.com";

export const dynamic = "force-static";

export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Allow: /catalog",
    "Allow: /i/",
    "Allow: /create",
    "Disallow: /dashboard",
    "Disallow: /account",
    "Disallow: /edit/",
    "Disallow: /admin",
    "Disallow: /site-editor",
    "Disallow: /bot",
    "Disallow: /reset-password",
    "Disallow: /transfer/",
    "",
    `Host: ${siteUrl}`,
    `Sitemap: ${siteUrl}/sitemap.xml`,
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
