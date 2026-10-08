import { HomePageClient } from "../components/HomePageClient";
import { compactSiteSettingsForClient } from "../lib/client-site-settings";
import type { DemoInstrument } from "../lib/local-demo";
import { getPublicInstruments } from "../lib/public-instruments";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";
import {
  absoluteSiteUrl,
  metadataExcerpt,
  SEARCH_DESCRIPTION_MAX_LENGTH,
  SEARCH_TITLE_MAX_LENGTH,
  SOCIAL_DESCRIPTION_MAX_LENGTH,
  SOCIAL_TITLE_MAX_LENGTH
} from "../lib/seo";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { getContentValue } from "../lib/content-registry";
import { resolveManagedPageRobots } from "../lib/site-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicRecordsWithFastFallback() {
  return new Promise<DemoInstrument[]>((resolve) => {
    const timeout = setTimeout(() => resolve([]), 5000);
    getPublicInstruments()
      .then((records) => resolve(records.map(sanitizePresentationRecord)))
      .catch(() => resolve([]))
      .finally(() => clearTimeout(timeout));
  });
}

function sanitizePresentationRecord(record: DemoInstrument) {
  const { saleStatus: _saleStatus, ...presentationRecord } = record;
  return presentationRecord as DemoInstrument;
}

export async function generateMetadata(): Promise<Metadata> {
  const publishedSettings = await loadPublishedSiteSettings();
  const rawTitle = getContentValue(publishedSettings.content, "seo.home.title");
  const rawDescription = getContentValue(publishedSettings.content, "seo.home.description");
  const title = metadataExcerpt(rawTitle, SEARCH_TITLE_MAX_LENGTH);
  const description = metadataExcerpt(rawDescription, SEARCH_DESCRIPTION_MAX_LENGTH);
  const ogTitle = metadataExcerpt(getContentValue(publishedSettings.content, "seo.home.ogTitle") || rawTitle, SOCIAL_TITLE_MAX_LENGTH);
  const ogDescription = metadataExcerpt(getContentValue(publishedSettings.content, "seo.home.ogDescription") || rawDescription, SOCIAL_DESCRIPTION_MAX_LENGTH);
  const canonical = "https://www.qrguitar.com";
  const image = absoluteSiteUrl(getContentValue(publishedSettings.content, "seo.home.image") || publishedSettings.seo.image || "/seo/qrguitar-og-v2.png");
  const favicon = absoluteSiteUrl(publishedSettings.seo.favicon || "/qrguitar-logo-white-orange.svg");

  return {
    title,
    description,
    keywords: publishedSettings.seo.keywords,
    alternates: {
      canonical
    },
    icons: {
      icon: favicon,
      apple: [{ url: "/app-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
    },
    robots: resolveManagedPageRobots("home", getContentValue(publishedSettings.content, "seo.home.indexing")),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: publishedSettings.brandName || "QRguitar",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${publishedSettings.brandName || "QRguitar"} social preview`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      site: publishedSettings.seo.twitterHandle || "@qrguitar",
      title: ogTitle,
      description: ogDescription,
      images: [image]
    }
  };
}

export default async function HomePage() {
  noStore();
  const [publishedSettings, initialRecords] = await Promise.all([
    loadPublishedSiteSettings(),
    publicRecordsWithFastFallback()
  ]);

  return <HomePageClient initialRecords={initialRecords} initialSettings={compactSiteSettingsForClient(publishedSettings)} />;
}
