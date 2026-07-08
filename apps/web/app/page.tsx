import { HomePageClient } from "../components/HomePageClient";
import type { DemoInstrument } from "../lib/local-demo";
import { getPublicInstruments } from "../lib/public-instruments";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";
import { defaultSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { absoluteSiteUrl } from "../lib/seo";
import { unstable_noStore as noStore } from "next/cache";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function settingsWithFastFallback() {
  return new Promise<EditableSiteSettings>((resolve) => {
    const timeout = setTimeout(() => resolve(defaultSiteSettings), 2500);
    loadPublishedSiteSettings()
      .then((settings) => resolve(settings))
      .catch(() => resolve(defaultSiteSettings))
      .finally(() => clearTimeout(timeout));
  });
}

function latestRecordWithFastFallback() {
  return new Promise<DemoInstrument | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000);
    fetchLatestRecordFromPublicApi()
      .then((record) => {
        if (record) {
          resolve(record);
          return;
        }

        getPublicInstruments()
          .then((records) => resolve(sanitizeLatestRecord(records[0] || null)))
          .catch(() => resolve(null))
          .finally(() => clearTimeout(timeout));
      })
      .catch(() => {
        getPublicInstruments()
          .then((records) => resolve(sanitizeLatestRecord(records[0] || null)))
          .catch(() => resolve(null))
          .finally(() => clearTimeout(timeout));
      })
      .finally(() => clearTimeout(timeout));
  });
}

async function fetchLatestRecordFromPublicApi() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3003";
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/instruments`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; instruments?: DemoInstrument[] } | null;
  return payload?.ok && Array.isArray(payload.instruments) ? sanitizeLatestRecord(payload.instruments[0] || null) : null;
}

function sanitizeLatestRecord(record: DemoInstrument | null) {
  if (!record) {
    return null;
  }

  const { saleStatus: _saleStatus, originalityStatus: _originalityStatus, ...presentationRecord } = record;
  return presentationRecord as DemoInstrument;
}

export async function generateMetadata(): Promise<Metadata> {
  const publishedSettings = await settingsWithFastFallback();
  const title = publishedSettings.seo.title || "QRguitar";
  const description = publishedSettings.seo.description || "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, and collectors.";
  const canonical = publishedSettings.seo.canonicalUrl || "https://www.qrguitar.com";
  const image = absoluteSiteUrl(publishedSettings.seo.image || "/seo/qrguitar-og-v2.png");
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
      title,
      description,
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
      title,
      description,
      images: [image]
    }
  };
}

export default async function HomePage() {
  noStore();
  const [publishedSettings, initialLatestRecord] = await Promise.all([
    settingsWithFastFallback(),
    latestRecordWithFastFallback()
  ]);

  return <HomePageClient initialLatestRecord={initialLatestRecord} initialSettings={publishedSettings} />;
}
