import type { Metadata } from "next";
import { getContentValue } from "./content-registry";
import {
  absoluteSiteUrl,
  metadataExcerpt,
  SEARCH_DESCRIPTION_MAX_LENGTH,
  SEARCH_TITLE_MAX_LENGTH,
  SOCIAL_DESCRIPTION_MAX_LENGTH,
  SOCIAL_TITLE_MAX_LENGTH
} from "./seo";
import { loadPublishedSiteSettings } from "./site-settings-server";

const PUBLIC_MANAGED_PAGE_IDS = new Set([
  "home",
  "howItWorks",
  "catalog",
  "installers",
  "contact",
  "privacy",
  "terms",
  "collections"
]);

const ALLOWED_ROBOTS_VALUES = new Map([
  ["index, follow", { index: true, follow: true }],
  ["index, nofollow", { index: true, follow: false }],
  ["noindex, follow", { index: false, follow: true }],
  ["noindex, nofollow", { index: false, follow: false }]
]);

export function resolveManagedPageRobots(pageId: string, configuredValue: unknown, routeIndexable = true) {
  if (!routeIndexable || !PUBLIC_MANAGED_PAGE_IDS.has(pageId)) {
    return { index: false, follow: false };
  }

  const normalized = String(configuredValue || "").trim().toLowerCase().replace(/\s*,\s*/g, ", ");
  return ALLOWED_ROBOTS_VALUES.get(normalized) || { index: false, follow: false };
}

export async function buildManagedSiteMetadata(): Promise<Metadata> {
  const settings = await loadPublishedSiteSettings();
  const title = metadataExcerpt(getContentValue(settings.content, "seo.global.title"), SEARCH_TITLE_MAX_LENGTH);
  const description = metadataExcerpt(getContentValue(settings.content, "seo.global.description"), SEARCH_DESCRIPTION_MAX_LENGTH);
  const socialTitle = metadataExcerpt(getContentValue(settings.content, "seo.global.title"), SOCIAL_TITLE_MAX_LENGTH);
  const socialDescription = metadataExcerpt(getContentValue(settings.content, "seo.global.description"), SOCIAL_DESCRIPTION_MAX_LENGTH);
  const image = absoluteSiteUrl(getContentValue(settings.content, "seo.global.image") || settings.seo.image);
  const canonical = absoluteSiteUrl("/");

  return {
    metadataBase: new URL(canonical),
    title,
    description,
    keywords: settings.seo.keywords,
    alternates: { canonical },
    icons: {
      icon: settings.seo.favicon || "/qrguitar-logo-white-orange.svg",
      apple: [{ url: "/app-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
    },
    robots: { index: true, follow: true },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url: canonical,
      siteName: settings.brandName || "QRguitar",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} social preview` }]
    },
    twitter: {
      card: "summary_large_image",
      site: settings.seo.twitterHandle || "@qrguitar",
      title: socialTitle,
      description: socialDescription,
      images: [image]
    }
  };
}

export async function buildManagedPageMetadata(pageId: string, canonicalPath: string, indexable = true): Promise<Metadata> {
  const settings = await loadPublishedSiteSettings();
  const content = settings.content;
  const rawTitle = getContentValue(content, `seo.${pageId}.title`);
  const rawDescription = getContentValue(content, `seo.${pageId}.description`);
  const title = metadataExcerpt(rawTitle, SEARCH_TITLE_MAX_LENGTH);
  const description = metadataExcerpt(rawDescription, SEARCH_DESCRIPTION_MAX_LENGTH);
  const ogTitle = metadataExcerpt(getContentValue(content, `seo.${pageId}.ogTitle`) || rawTitle, SOCIAL_TITLE_MAX_LENGTH);
  const ogDescription = metadataExcerpt(getContentValue(content, `seo.${pageId}.ogDescription`) || rawDescription, SOCIAL_DESCRIPTION_MAX_LENGTH);
  const image = absoluteSiteUrl(getContentValue(content, `seo.${pageId}.image`) || getContentValue(content, "seo.global.image"));
  const canonical = absoluteSiteUrl(canonicalPath);
  const robots = resolveManagedPageRobots(pageId, getContentValue(content, `seo.${pageId}.indexing`), indexable);

  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: settings.brandName || "QRguitar",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${ogTitle} social preview` }]
    },
    twitter: {
      card: "summary_large_image",
      site: settings.seo.twitterHandle || "@qrguitar",
      title: ogTitle,
      description: ogDescription,
      images: [image]
    }
  };
}
