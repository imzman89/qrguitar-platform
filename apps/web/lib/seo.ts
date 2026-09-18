import type { Metadata } from "next";
import { instrumentDisplayName, type DemoInstrument } from "./local-demo";
import type { DirectoryCollection } from "./collection-directory";
import type { PublicCollectionSettings } from "./public-collections";

export const SITE_URL = "https://www.qrguitar.com";
export const DEFAULT_OG_IMAGE = "/seo/qrguitar-og-v2.png";
export const DEFAULT_DESCRIPTION =
  "Permanent QRguitar Profiles for guitars, amps, pedals, builders, shops, and collectors.";

export function absoluteSiteUrl(pathOrUrl: string) {
  if (!pathOrUrl) {
    return SITE_URL;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${normalized}`;
}

export function buildDefaultMetadata(): Metadata {
  const image = absoluteSiteUrl(DEFAULT_OG_IMAGE);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: "QRguitar",
      template: "%s | QRguitar"
    },
    description: DEFAULT_DESCRIPTION,
    keywords: [
      "QRguitar",
      "guitar profiles",
      "instrument profiles",
      "guitar inventory",
      "instrument ownership",
      "builder profiles"
    ],
    alternates: {
      canonical: SITE_URL
    },
    openGraph: {
      title: "QRguitar",
      description: DEFAULT_DESCRIPTION,
      url: SITE_URL,
      siteName: "QRguitar",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "QRguitar white and orange logo with QR code"
        }
      ],
      locale: "en_US",
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: "QRguitar",
      description: DEFAULT_DESCRIPTION,
      site: "@qrguitar",
      images: [image]
    },
    robots: {
      index: true,
      follow: true
    }
  };
}

export function buildPageMetadata(
  title: string,
  description: string,
  canonicalPath: string,
  overrides?: {
    ogImage?: string;
  }
): Metadata {
  const url = absoluteSiteUrl(canonicalPath);
  const image = absoluteSiteUrl(overrides?.ogImage || DEFAULT_OG_IMAGE);

  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title: `${title} | QRguitar`,
      description,
      url,
      siteName: "QRguitar",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "QRguitar white and orange logo with QR code"
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      site: "@qrguitar",
      title: `${title} | QRguitar`,
      description,
      images: [image]
    }
  };
}

export function buildPrivatePageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: null,
    openGraph: null,
    twitter: null,
    robots: {
      index: false,
      follow: false
    }
  };
}

function breadcrumbList(items: Array<{ name: string; url: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

function publicCollectionUrl(handle: string) {
  return absoluteSiteUrl(`/collections/${encodeURIComponent(handle)}`);
}

export function buildCollectionsDirectoryJsonLd(collections: DirectoryCollection[]) {
  const url = absoluteSiteUrl("/collections");
  const description = "Explore public instrument collections from QRguitar players, collectors, shops, builders, and service professionals.";
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    url,
    name: "QRguitar Member Collections",
    description,
    isPartOf: { "@type": "WebSite", name: "QRguitar", url: SITE_URL },
    breadcrumb: breadcrumbList([
      { name: "QRguitar", url: SITE_URL },
      { name: "Member Collections", url }
    ]),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: collections.length,
      itemListElement: collections.map((collection, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: collection.name,
        url: publicCollectionUrl(collection.handle)
      }))
    }
  };
}

export function buildPublicCollectionJsonLd(settings: PublicCollectionSettings, records: DemoInstrument[]) {
  const url = publicCollectionUrl(settings.handle);
  const description = settings.bio || `Explore ${settings.publicName}'s public QRguitar Profiles.`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    url,
    name: `${settings.publicName} Collection`,
    description,
    isPartOf: { "@type": "WebSite", name: "QRguitar", url: SITE_URL },
    breadcrumb: breadcrumbList([
      { name: "QRguitar", url: SITE_URL },
      { name: "Member Collections", url: absoluteSiteUrl("/collections") },
      { name: settings.publicName, url }
    ]),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: records.length,
      itemListElement: records.map((record, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: instrumentDisplayName(record),
        url: absoluteSiteUrl(record.permanentPath || `/i/${encodeURIComponent(record.qrCode)}`)
      }))
    }
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function getRecordMetadataImage(instrument: DemoInstrument) {
  const hero = String(instrument.heroImageDataUrl || "").trim();
  if (hero) {
    return absoluteSiteUrl(hero);
  }

  const firstGallery = instrument.galleryImageDataUrls?.find((source) => String(source || "").trim());
  if (firstGallery) {
    return absoluteSiteUrl(firstGallery);
  }

  return absoluteSiteUrl(DEFAULT_OG_IMAGE);
}

export function getRecordMetadataDescription(instrument: DemoInstrument) {
  const lead = [
    String(instrument.brand || "").trim(),
    String(instrument.model || "").trim(),
    String(instrument.year || "").trim(),
    String(instrument.qrCode || "").trim()
  ].filter(Boolean);

  const summary = String(instrument.summary || "").trim();
  const base = lead.join(" - ");

  if (summary) {
    return base ? `${base}. ${summary}` : summary;
  }

  return base ? `${base}. QRguitar Profile.` : DEFAULT_DESCRIPTION;
}

export function buildRecordMetadata(instrument: DemoInstrument): Metadata {
  const title = instrumentDisplayName(instrument);
  const description = getRecordMetadataDescription(instrument);
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);

  return {
    title,
    description,
    alternates: {
      canonical: url
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "QRguitar",
      type: "article",
      images: [
        {
          url: image,
          alt: `${title} QRguitar Profile photo`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "QRguitar",
        url: SITE_URL,
        logo: absoluteSiteUrl(DEFAULT_OG_IMAGE),
        description: DEFAULT_DESCRIPTION,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: "support@qrguitar.com",
            url: SITE_URL
          }
        ]
      },
      {
        "@type": "WebSite",
        name: "QRguitar",
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION
      }
    ]
  };
}

export function buildRecordJsonLd(instrument: DemoInstrument) {
  const title = instrumentDisplayName(instrument);
  const url = absoluteSiteUrl(instrument.permanentPath || `/i/${instrument.qrCode}`);
  const image = getRecordMetadataImage(instrument);
  const description = getRecordMetadataDescription(instrument);
  const additionalProperty = (instrument.customFields || [])
    .filter((field) => String(field.label || "").trim() && String(field.value || "").trim())
    .map((field) => ({
      "@type": "PropertyValue",
      name: String(field.label).trim(),
      value: String(field.value).trim()
    }));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description,
    image: [image],
    url,
    sku: instrument.qrCode,
    serialNumber: instrument.serial || undefined,
    category: instrument.instrumentType || "Instrument",
    brand: instrument.brand
      ? {
          "@type": "Brand",
          name: instrument.brand
        }
      : undefined,
    manufacturer: instrument.builder
      ? {
          "@type": "Organization",
          name: instrument.builder
        }
      : undefined,
    additionalProperty,
    productionDate: instrument.year || undefined
  };
}
