import { getPublicInstruments } from "../../lib/public-instruments";
import { cleanPublicCollection, type PublicCollectionSettings } from "../../lib/public-collections";
import { createServerSupabaseClient } from "../../lib/supabase-server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.qrguitar.com";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function GET() {
  const today = new Date().toISOString();
  const profiles = await getPublicInstruments().catch(() => []);
  const supabase = createServerSupabaseClient();
  const collectionRows = supabase
    ? await supabase.from("site_content").select("content_value").like("content_key", "public_collection_owner:%").returns<Array<{ content_value?: Partial<PublicCollectionSettings> }>>()
    : { data: [] as Array<{ content_value?: Partial<PublicCollectionSettings> }> };
  const eligibleCollections = (await Promise.all((collectionRows.data || []).map(async (row) => {
    const collection = cleanPublicCollection(row.content_value || {});
    if (!collection.enabled || !collection.allowIndexing || !collection.handle || !collection.ownerId) return null;
    const records = await getPublicInstruments(collection.ownerId).catch(() => []);
    return records.length ? collection : null;
  }))).filter((collection): collection is PublicCollectionSettings => Boolean(collection));
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntry("/", today, "weekly", "1.0"),
    urlEntry("/catalog", today, "weekly", "0.8"),
    urlEntry("/create", today, "monthly", "0.65"),
    urlEntry("/how-it-works", today, "monthly", "0.7"),
    urlEntry("/privacy", today, "yearly", "0.4"),
    urlEntry("/terms", today, "yearly", "0.4"),
    urlEntry("/contact", today, "yearly", "0.4"),
    ...profiles.map((profile) => urlEntry(`/i/${encodeURIComponent(profile.qrCode)}`, profile.createdAt || today, "monthly", "0.7")),
    ...eligibleCollections.map((collection) => urlEntry(`/collections/${encodeURIComponent(collection.handle)}`, today, "weekly", "0.65")),
    "</urlset>",
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}
