const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.qrguitar.com";

export const dynamic = "force-static";

function urlEntry(path: string, lastModified: string, changeFrequency: string, priority: string) {
  return [
    "  <url>",
    `    <loc>${siteUrl}${path}</loc>`,
    `    <lastmod>${lastModified}</lastmod>`,
    `    <changefreq>${changeFrequency}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>"
  ].join("\n");
}

export function GET() {
  const today = new Date().toISOString();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntry("/", today, "weekly", "1.0"),
    urlEntry("/catalog", today, "weekly", "0.8"),
    urlEntry("/create", today, "monthly", "0.65"),
    "</urlset>",
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
