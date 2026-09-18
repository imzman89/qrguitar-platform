import { getPublicInstruments } from "../../lib/public-instruments";
import { cleanPublicCollection, type PublicCollectionSettings } from "../../lib/public-collections";
import { SITE_URL } from "../../lib/seo";
import { supabasePagedRows } from "../../lib/supabase-pagination";

const STATIC_LAST_MODIFIED = "2026-09-18";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(path: string, lastModified: string, changeFrequency: string, priority: string) {
  return [
    "  <url>",
    "    <loc>" + escapeXml(SITE_URL + path) + "</loc>",
    "    <lastmod>" + escapeXml(lastModified) + "</lastmod>",
    "    <changefreq>" + changeFrequency + "</changefreq>",
    "    <priority>" + priority + "</priority>",
    "  </url>"
  ].join("\n");
}

function stableLastModified(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return STATIC_LAST_MODIFIED;
  return new Date(value).toISOString();
}

export async function GET() {
  try {
    const [profiles, collectionRows] = await Promise.all([
      getPublicInstruments(),
      supabasePagedRows<{ content_key: string; content_value?: Partial<PublicCollectionSettings>; updated_at?: string | null }>(
        "/rest/v1/site_content?select=content_key,content_value,updated_at&content_key=like.public_collection_owner:*&order=content_key.asc",
        { serviceRole: true }
      )
    ]);
    // Public records already contain only eligible owners and enabled collections.
    // Reuse them instead of fetching the entire catalog again for every collection.
    const publicCollectionHandles = new Set(profiles.map((profile) => profile.publicCollection?.handle).filter(Boolean));
    const eligibleCollections = collectionRows.map((row) => ({
      settings: cleanPublicCollection({
        ...(row.content_value || {}),
        ownerId: row.content_key.replace(/^public_collection_owner:/, "")
      }),
      updatedAt: row.updated_at
    })).filter(({ settings }) => settings.enabled && settings.allowIndexing && settings.handle && settings.ownerId && publicCollectionHandles.has(settings.handle));
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urlEntry("/", STATIC_LAST_MODIFIED, "weekly", "1.0"),
      urlEntry("/catalog", STATIC_LAST_MODIFIED, "weekly", "0.8"),
      urlEntry("/collections", STATIC_LAST_MODIFIED, "weekly", "0.7"),
      urlEntry("/create", STATIC_LAST_MODIFIED, "monthly", "0.65"),
      urlEntry("/how-it-works", STATIC_LAST_MODIFIED, "monthly", "0.7"),
      urlEntry("/privacy", STATIC_LAST_MODIFIED, "yearly", "0.4"),
      urlEntry("/terms", STATIC_LAST_MODIFIED, "yearly", "0.4"),
      urlEntry("/contact", STATIC_LAST_MODIFIED, "yearly", "0.4"),
      ...profiles.map((profile) => urlEntry("/i/" + encodeURIComponent(profile.qrCode), stableLastModified(profile.updatedAt || profile.createdAt), "monthly", "0.7")),
      ...eligibleCollections.map(({ settings, updatedAt }) => urlEntry("/collections/" + encodeURIComponent(settings.handle), stableLastModified(updatedAt), "weekly", "0.65")),
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
