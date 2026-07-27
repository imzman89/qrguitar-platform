import type { Metadata } from "next";
import { getContentValue } from "./content-registry";
import { absoluteSiteUrl } from "./seo";
import { loadPublishedSiteSettings } from "./site-settings-server";

export async function buildManagedSiteMetadata(): Promise<Metadata> {
  const settings = await loadPublishedSiteSettings();
  const title = getContentValue(settings.content, "seo.global.title");
  const description = getContentValue(settings.content, "seo.global.description");
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
      apple: settings.seo.favicon || "/qrguitar-logo-white-orange.svg"
    },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: settings.brandName || "QRguitar",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} social preview` }]
    },
    twitter: {
      card: "summary_large_image",
      site: settings.seo.twitterHandle || "@qrguitar",
      title,
      description,
      images: [image]
    }
  };
}

export async function buildManagedPageMetadata(pageId: string, canonicalPath: string, indexable = true): Promise<Metadata> {
  const settings = await loadPublishedSiteSettings();
  const content = settings.content;
  const title = getContentValue(content, `seo.${pageId}.title`);
  const description = getContentValue(content, `seo.${pageId}.description`);
  const ogTitle = getContentValue(content, `seo.${pageId}.ogTitle`) || title;
  const ogDescription = getContentValue(content, `seo.${pageId}.ogDescription`) || description;
  const image = absoluteSiteUrl(getContentValue(content, `seo.${pageId}.image`) || getContentValue(content, "seo.global.image"));
  const canonical = absoluteSiteUrl(canonicalPath);

  return {
    title,
    description,
    alternates: { canonical },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
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
