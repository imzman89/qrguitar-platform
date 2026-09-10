import { getPublicInstruments } from "../../lib/public-instruments";
import { cleanPublicCollection, type PublicCollectionSettings } from "../../lib/public-collections";
import { supabasePagedRows } from "../../lib/supabase-pagination";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.qrguitar.com";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastModified: string, changeFrequency: string, priority: string) {
  return [
    "  <url>",
    "    <loc>" + escapeXml(siteUrl + path) + "</loc>",
    "    <lastmod>" + escapeXml(lastModified) + "</lastmod>",
    "    <changefreq>" + changeFrequency + "</changefreq>",
    "    <priority>" + priority + "</priority>",
    "  </url>"
  ].join("\n");
}

export async function GET() {
  try {
    const today = new Date().toISOString();
    const [profiles, collectionRows] = await Promise.all([
      getPublicInstruments(),
      supabasePagedRows<{ content_key: string; content_value?: Partial<PublicCollectionSettings> }>(
        "/rest/v1/site_content?select=content_key,content_value&content_key=like.public_collection_owner:*&order=content_key.asc",
        { serviceRole: true }
      )
    ]);
    // Public records already contain only eligible owners and enabled collections.
    // Reuse them instead of fetching the entire catalog again for every collection.
    const publicCollectionHandles = new Set(profiles.map((profile) => profile.publicCollection?.handle).filter(Boolean));
    const eligibleCollections = collectionRows.map((row) => cleanPublicCollection({
      ...(row.content_value || {}),
      ownerId: row.content_key.replace(/^public_collection_owner:/, "")
    })).filter((collection) => collection.enabled && collection.allowIndexing && collection.handle && collection.ownerId && publicCollectionHandles.has(collection.handle));
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntry("/", today, "weekly", "1.0"),
      urlEntry("/catalog", today, "weekly", "0.8"),
      urlEntry("/collections", today, "weekly", "0.7"),
      urlEntry("/create", today, "monthly", "0.65"),
      urlEntry("/how-it-works", today, "monthly", "0.7"),
      urlEntry("/privacy", today, "yearly", "0.4"),
      urlEntry("/terms", today, "yearly", "0.4"),
      urlEntry("/contact", today, "yearly", "0.4"),
      ...profiles.map((profile) => urlEntry("/i/" + encodeURIComponent(profile.qrCode), profile.createdAt || today, "monthly", "0.7")),
      ...eligibleCollections.map((collection) => urlEntry("/collections/" + encodeURIComponent(collection.handle), today, "weekly", "0.65")),
      "</urlset>",
      ""
    ].join("\n");

    return new Response(body, {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch {
    return new Response("The sitemap is temporarily unavailable. Please retry shortly.\n", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "60"
      }
    });
  }
}
