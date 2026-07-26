import { HomePageClient } from "../components/HomePageClient";
import type { DemoInstrument } from "../lib/local-demo";
import { getPublicInstruments } from "../lib/public-instruments";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";
import { absoluteSiteUrl } from "../lib/seo";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";
import { getContentValue } from "../lib/content-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function latestRecordWithFastFallback() {
  return new Promise<DemoInstrument | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000);
    getPublicInstruments()
      .then((records) => resolve(sanitizeLatestRecord(records[0] || null)))
      .catch(() => resolve(null))
      .finally(() => clearTimeout(timeout));
  });
}

function sanitizeLatestRecord(record: DemoInstrument | null) {
  if (!record) {
    return null;
  }

  const { saleStatus: _saleStatus, originalityStatus: _originalityStatus, ...presentationRecord } = record;
  return presentationRecord as DemoInstrument;
}

export async function generateMetadata(): Promise<Metadata> {
  const publishedSettings = await loadPublishedSiteSettings();
  const title = getContentValue(publishedSettings.content, "seo.home.title");
  const description = getContentValue(publishedSettings.content, "seo.home.description");
  const ogTitle = getContentValue(publishedSettings.content, "seo.home.ogTitle") || title;
  const ogDescription = getContentValue(publishedSettings.content, "seo.home.ogDescription") || description;
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
      apple: favicon
    },
    robots: publishedSettings.seo.robots || "index, follow",
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
  const [publishedSettings, initialLatestRecord] = await Promise.all([
    loadPublishedSiteSettings(),
    latestRecordWithFastFallback()
  ]);

  return <HomePageClient initialLatestRecord={initialLatestRecord} initialSettings={publishedSettings} />;
}
